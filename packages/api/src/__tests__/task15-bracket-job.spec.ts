import { Pool } from 'pg'
import { TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository } from '../db'
import { InMemoryJobQueue } from '@worker/job-queue'
import { BroadcastBus } from '../broadcast-bus'
import { processBracketGenerate } from '../workers/bracket-processor'
import { initializeTestDb, resetTestDb, closeTestDb } from './db-test-setup'

describe('Task #15: Bracket Generation Job', () => {
  let db: Pool
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let knockoutRepo: KnockoutRepository
  let jobQueue: InMemoryJobQueue

  let tournamentId: string
  let group1Id: string
  let group2Id: string
  let player1Id: string
  let player2Id: string
  let player3Id: string
  let player4Id: string
  let match1Id: string
  let match2Id: string

  beforeAll(async () => {
    db = await initializeTestDb()
  })

  beforeEach(async () => {
    await resetTestDb(db)
    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)
    knockoutRepo = new KnockoutRepository(db)
    jobQueue = new InMemoryJobQueue()

    const now = new Date()
    const pastDeadline = new Date(now.getTime() - 86400000).toISOString()
    const futureDeadline = new Date(now.getTime() + 259200000).toISOString()

    const tournament = await tournamentRepo.create({
      name: `Bracket Test ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 4,
      registrationDeadline: pastDeadline,
      groupStageDeadline: futureDeadline,
      knockoutStageDeadline: futureDeadline,
      creatorId: 'org_123',
    })
    tournamentId = tournament.id

    await tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const testTimestamp = Date.now()
    const emails = [
      `bracket_test_1_${testTimestamp}@test.com`,
      `bracket_test_2_${testTimestamp}@test.com`,
      `bracket_test_3_${testTimestamp}@test.com`,
      `bracket_test_4_${testTimestamp}@test.com`,
    ]

    for (const email of emails) {
      await playerRepo.findOrCreatePlayerByEmail(email, email.split('@')[0])
    }

    const p1 = (await playerRepo.findByEmail(emails[0]))!
    const p2 = (await playerRepo.findByEmail(emails[1]))!
    const p3 = (await playerRepo.findByEmail(emails[2]))!
    const p4 = (await playerRepo.findByEmail(emails[3]))!

    player1Id = p1.id
    player2Id = p2.id
    player3Id = p3.id
    player4Id = p4.id

    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    await tournamentRepo.updateStatus(tournamentId, 'group_stage_active')

    const groups = await groupRepo.createGroups(tournamentId, 2, 1, [player1Id, player2Id, player3Id, player4Id])
    group1Id = groups[0].id
    group2Id = groups[1].id

    const matches1 = await groupRepo.findMatchesByGroup(group1Id)
    const matches2 = await groupRepo.findMatchesByGroup(group2Id)
    match1Id = matches1[0].id
    match2Id = matches2[0].id
  })

  afterAll(async () => {
    await closeTestDb()
  })

  describe('Job execution', () => {
    it('should generate bracket and return non-empty matches array', async () => {
      await groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const matches = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      expect(matches).toHaveLength(1)
      expect(matches[0].round).toBe(1)
      expect(matches[0].player1_id).toBeDefined()
      expect(matches[0].player2_id).toBeDefined()
    })
  })

  describe('Result consistency', () => {
    it('should match knockout matches in database exactly', async () => {
      await groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const result = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      const dbMatches = await knockoutRepo.findKnockoutMatchesByTournament(tournamentId)

      expect(result).toHaveLength(dbMatches.length)
      expect(result.map(m => m.id).sort()).toEqual(dbMatches.map(m => m.id).sort())
    })
  })

  describe('Match creation', () => {
    it('should create knockout matches with correct advancing players', async () => {
      const match1 = (await groupRepo.findMatchById(match1Id))!
      const match2 = (await groupRepo.findMatchById(match2Id))!

      const expectedWinner1 = match1.player1_id
      const expectedWinner2 = match2.player1_id

      await groupRepo.updateMatch(match1Id, expectedWinner1, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, expectedWinner2, '6-4, 6-2')

      await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      const matches = await knockoutRepo.findKnockoutMatchesByTournament(tournamentId)
      expect(matches).toHaveLength(1)

      const finalMatch = matches[0]
      const playerIds = [finalMatch.player1_id, finalMatch.player2_id].sort()
      const expectedPlayerIds = [expectedWinner1, expectedWinner2].sort()

      expect(playerIds).toEqual(expectedPlayerIds)
    })

    it('should correctly seed advancing players in bracket', async () => {
      const match1 = (await groupRepo.findMatchById(match1Id))!
      const match2 = (await groupRepo.findMatchById(match2Id))!

      await groupRepo.updateMatch(match1Id, match1.player1_id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, match2.player1_id, '6-4, 6-2')

      const result = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      const seeds = await knockoutRepo.getSeeds(tournamentId)
      expect(seeds).toHaveLength(2)
      expect(seeds.map(s => s.playerId)).toHaveLength(2)
      expect(result).toHaveLength(1)
      expect(result[0].player1_id).toBeTruthy()
      expect(result[0].player2_id).toBeTruthy()
    })
  })

  describe('Idempotent execution', () => {
    it('should return same matches when run twice without re-creating', async () => {
      await groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const first = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      jobQueue.clear()

      const second = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      expect(first).toHaveLength(second.length)
      expect(first.map(m => m.id).sort()).toEqual(second.map(m => m.id).sort())

      const allMatches = await knockoutRepo.findKnockoutMatchesByTournament(tournamentId)
      expect(allMatches).toHaveLength(1)
    })

    it('should not enqueue any broadcast job on either run', async () => {
      await groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      expect(jobQueue.getAll().filter(j => j.name !== 'bracket.generate')).toHaveLength(0)

      jobQueue.clear()

      await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      expect(jobQueue.getAll().filter(j => j.name !== 'bracket.generate')).toHaveLength(0)
    })
  })

  describe('Error handling / Timing', () => {
    it('should reject if group stage not complete (pending matches remain)', async () => {
      await expect(
        processBracketGenerate(
          { tournamentId },
          { groupRepo, knockoutRepo, jobQueue }
        )
      ).rejects.toThrow(/group stage not complete/)
    })

    it('should succeed after all group matches are complete', async () => {
      await groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const matches = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      expect(matches).toBeDefined()
      expect(Array.isArray(matches)).toBe(true)
      expect(matches.length).toBeGreaterThan(0)
    })

    it('should reject if no groups exist for tournament', async () => {
      const emptyTournament = tournamentRepo.create({
        name: `Empty Bracket Test ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 4,
        registrationDeadline: new Date().toISOString(),
        groupStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: 'org_123',
      })

      await expect(
        processBracketGenerate(
          { tournamentId: emptyTournament.id },
          { groupRepo, knockoutRepo, jobQueue }
        )
      ).rejects.toThrow(/no groups found/)
    })

    it('should reject if no players are advancing from groups', async () => {
      const zeroAdvancingTournament = tournamentRepo.create({
        name: `Zero Advancing Test ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 2,
        registrationDeadline: new Date().toISOString(),
        groupStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: 'org_123',
      })

      await tournamentRepo.updateStatus(zeroAdvancingTournament.id, 'registration_closed')
      await tournamentRepo.updateStatus(zeroAdvancingTournament.id, 'group_stage_active')

      await groupRepo.createGroups(zeroAdvancingTournament.id, 1, 0, [player1Id, player2Id])

      const matches = await groupRepo.findMatchesByGroup((await groupRepo.findGroupsByTournament(zeroAdvancingTournament.id))[0].id)
      await groupRepo.updateMatch(matches[0].id, player1Id, '6-4, 6-3')

      await expect(
        processBracketGenerate(
          { tournamentId: zeroAdvancingTournament.id },
          { groupRepo, knockoutRepo, jobQueue }
        )
      ).rejects.toThrow(/no players advancing/)
    })
  })

  describe('DLQ retry', () => {
    it('should move to failed jobs after max retries', async () => {
      await groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const jobId = 'bracket_test_job'
      const job = await jobQueue.add('bracket.generate', { tournamentId }, { jobId })

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
    it('should emit bracket.published to BroadcastBus with correct payload', async () => {
      await groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const broadcastBus = new BroadcastBus()
      const received: Array<{ event: string; data: unknown }> = []
      broadcastBus.subscribe(tournamentId, (event, data) => received.push({ event, data }))

      await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue, broadcastBus }
      )

      expect(received).toHaveLength(1)
      expect(received[0].event).toBe('bracket.published')
      const data = received[0].data as any
      expect(typeof data.matchCount).toBe('number')
      expect(typeof data.byeCount).toBe('number')
    })

    it('should not throw when broadcastBus is not provided', async () => {
      await groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      await expect(
        processBracketGenerate(
          { tournamentId },
          { groupRepo, knockoutRepo }
        )
      ).resolves.toBeDefined()
    })
  })

  describe('Consolidation', () => {
    it('should handle deduplicated jobs correctly', async () => {
      await groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      await groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const jobId = `bracket.generate:${tournamentId}`

      await jobQueue.add('bracket.generate', { tournamentId }, { jobId })
      await jobQueue.add('bracket.generate', { tournamentId }, { jobId })

      expect(jobQueue.getAll()).toHaveLength(1)

      const matches = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      expect(matches).toHaveLength(1)
      expect(await knockoutRepo.findKnockoutMatchesByTournament(tournamentId)).toHaveLength(1)
    })
  })
})
