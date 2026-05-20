import { Pool } from 'pg'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../db'
import { InMemoryJobQueue } from '@worker/job-queue'
import { InMemoryStandingsCache } from '../standings-cache'
import { BroadcastBus } from '../broadcast-bus'
import { processStandingsRecalculate } from '../workers/standings-processor'
import { initializeTestDb, resetTestDb } from './db-test-setup'

describe('Task #14: Standings Recalculation Job', () => {
  let db: Pool
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let jobQueue: InMemoryJobQueue
  let standingsCache: InMemoryStandingsCache

  let tournamentId: string
  let groupId: string
  let player1Id: string
  let player2Id: string
  let player3Id: string
  let player4Id: string

  beforeAll(async () => {
    db = await initializeTestDb()
  }, 30000)

  beforeEach(async () => {
    await resetTestDb(db)
    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)
    jobQueue = new InMemoryJobQueue()
    standingsCache = new InMemoryStandingsCache()

    const now = new Date()
    const pastDeadline = new Date(now.getTime() - 86400000).toISOString()
    const futureDeadline = new Date(now.getTime() + 259200000).toISOString()

    const tournament = await tournamentRepo.create({
      name: `Standings Test ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 8,
      registrationDeadline: pastDeadline,
      groupStageDeadline: futureDeadline,
      knockoutStageDeadline: futureDeadline,
      creatorId: 'org_123',
    })
    tournamentId = tournament.id

    await tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const testTimestamp = Date.now()
    const emails = [
      `standing_test_1_${testTimestamp}@test.com`,
      `standing_test_2_${testTimestamp}@test.com`,
      `standing_test_3_${testTimestamp}@test.com`,
      `standing_test_4_${testTimestamp}@test.com`,
    ]

    for (const email of emails) {
      await playerRepo.findOrCreatePlayerByEmail(email, email.split('@')[0])
    }

    const p1 = await playerRepo.findByEmail(emails[0])
    const p2 = await playerRepo.findByEmail(emails[1])
    const p3 = await playerRepo.findByEmail(emails[2])
    const p4 = await playerRepo.findByEmail(emails[3])

    if (!p1 || !p2 || !p3 || !p4) throw new Error('Failed to create players')
    player1Id = p1.id
    player2Id = p2.id
    player3Id = p3.id
    player4Id = p4.id

    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    await tournamentRepo.updateStatus(tournamentId, 'group_stage_active')

    const groups = await groupRepo.createGroups(tournamentId, 1, 2, [p1.id, p2.id, p3.id, p4.id])
    groupId = groups[0].id
  }, 30000)


  describe('Job execution', () => {
    it('should call processor and return non-empty standings', async () => {
      const standings = await processStandingsRecalculate(
        { tournamentId, groupId },
        { groupRepo, jobQueue, standingsCache }
      )

      expect(standings).toHaveLength(4)
      expect(standings.map(s => s.playerId).sort()).toEqual(
        [player1Id, player2Id, player3Id, player4Id].sort()
      )
    })
  })

  describe('Result consistency', () => {
    it('should have same players as direct calculateStandings call', async () => {
      const { calculateStandings } = await import('@core/index')
      const members = await groupRepo.findMembersByGroup(groupId)
      const matches = await groupRepo.findMatchesByGroup(groupId)

      const players = members.map(m => ({ id: m.id, name: m.name }))
      const matchData = matches.map(m => ({
        player1Id: m.player1_id,
        player2Id: m.player2_id,
        winnerId: m.winner_id ?? null,
        score: m.score ?? null,
      }))

      const directResult = calculateStandings(players, matchData)

      const processorResult = await processStandingsRecalculate(
        { tournamentId, groupId },
        { groupRepo, jobQueue, standingsCache }
      )

      const directPlayers = directResult.map(s => s.playerId).sort()
      const processorPlayers = processorResult.map(s => s.playerId).sort()

      expect(processorPlayers).toEqual(directPlayers)
      expect(processorResult).toHaveLength(directResult.length)
    })
  })

  describe('Cache invalidation', () => {
    it('should clear stale cache before computing and repopulate with fresh', async () => {
      const fakeStaleData = [
        { playerId: 'fake_1', rank: 1, wins: 99, losses: 0, setsWon: 99, setsLost: 0 },
      ]

      standingsCache.set(groupId, fakeStaleData)
      expect(standingsCache.get(groupId)).toEqual(fakeStaleData)

      const freshStandings = await processStandingsRecalculate(
        { tournamentId, groupId },
        { groupRepo, jobQueue, standingsCache }
      )

      const cached = standingsCache.get(groupId)
      expect(cached).toEqual(freshStandings)
      expect(cached).not.toEqual(fakeStaleData)
      expect(cached).toHaveLength(4)
    })
  })

  describe('Idempotent execution', () => {
    it('should return same standings when run twice', async () => {
      const first = await processStandingsRecalculate(
        { tournamentId, groupId },
        { groupRepo, jobQueue, standingsCache }
      )

      jobQueue.clear()
      standingsCache.clear(groupId)

      const second = await processStandingsRecalculate(
        { tournamentId, groupId },
        { groupRepo, jobQueue, standingsCache }
      )

      const firstPlayers = first.map(s => s.playerId).sort()
      const secondPlayers = second.map(s => s.playerId).sort()
      expect(secondPlayers).toEqual(firstPlayers)
      expect(first).toHaveLength(second.length)

    })
  })

  describe('Consolidation', () => {
    it('should process correctly when job is deduplicated', async () => {
      const jobId = `standings.recalculate:${groupId}`

      await jobQueue.add('standings.recalculate', { tournamentId, groupId }, { jobId })
      await jobQueue.add('standings.recalculate', { tournamentId, groupId }, { jobId })

      expect(jobQueue.getAll()).toHaveLength(1)

      const standings = await processStandingsRecalculate(
        { tournamentId, groupId },
        { groupRepo, jobQueue, standingsCache }
      )

      expect(standings).toHaveLength(4)
      expect(standingsCache.get(groupId)).toEqual(standings)
    })
  })

  describe('Error handling', () => {
    it('should handle processor calls gracefully', async () => {
      const standings = await processStandingsRecalculate(
        { tournamentId, groupId },
        { groupRepo, jobQueue, standingsCache }
      )

      expect(standings).toBeDefined()
      expect(Array.isArray(standings)).toBe(true)
    })

    it('should retry and eventually move to DLQ after max attempts', async () => {
      const jobId = 'standings_error_test'
      const job = await jobQueue.add('standings.recalculate', { tournamentId, groupId }, { jobId })

      expect(job.attemptsMade).toBe(0)
      expect(jobQueue.getFailedJobs()).toHaveLength(0)

      await jobQueue.fail(jobId, 'Attempt 1', 3)
      const after1 = await jobQueue.getJob(jobId)
      expect(after1?.attemptsMade).toBe(1)
      expect(jobQueue.getFailedJobs()).toHaveLength(0)

      await jobQueue.fail(jobId, 'Attempt 2', 3)
      const after2 = await jobQueue.getJob(jobId)
      expect(after2?.attemptsMade).toBe(2)

      await jobQueue.fail(jobId, 'Attempt 3', 3)
      const inQueue = await jobQueue.getJob(jobId)
      expect(inQueue).toBeNull()

      const dlq = jobQueue.getFailedJobs()
      expect(dlq).toHaveLength(1)
      expect(dlq[0].id).toBe(jobId)
      expect(dlq[0].failedReason).toBe('Attempt 3')
    })
  })

  describe('SSE broadcast trigger', () => {
    it('should emit standings.updated to BroadcastBus with correct payload', async () => {
      const broadcastBus = new BroadcastBus()
      const received: Array<{ event: string; data: unknown }> = []
      broadcastBus.subscribe(tournamentId, (event, data) => received.push({ event, data }))

      await processStandingsRecalculate(
        { tournamentId, groupId },
        { groupRepo, jobQueue, standingsCache, broadcastBus }
      )

      expect(received).toHaveLength(1)
      expect(received[0].event).toBe('standings.updated')
      const data = received[0].data as any
      expect(data.groupId).toBe(groupId)
      expect(Array.isArray(data.standings)).toBe(true)
    })

    it('should not throw when broadcastBus is not provided', async () => {
      await expect(
        processStandingsRecalculate(
          { tournamentId, groupId },
          { groupRepo }
        )
      ).resolves.toBeDefined()
    })
  })
})
