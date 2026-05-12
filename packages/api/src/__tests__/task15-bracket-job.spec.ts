import { openDatabase, TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository } from '../db'
import { InMemoryJobQueue } from '@worker/job-queue'
import { processBracketGenerate } from '../workers/bracket-processor'

describe('Task #15: Bracket Generation Job', () => {
  let db: any
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

  beforeEach(() => {
    db = openDatabase(':memory:')
    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)
    knockoutRepo = new KnockoutRepository(db)
    jobQueue = new InMemoryJobQueue()

    const now = new Date()
    const pastDeadline = new Date(now.getTime() - 86400000).toISOString()
    const futureDeadline = new Date(now.getTime() + 259200000).toISOString()

    const tournament = tournamentRepo.create({
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

    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const testTimestamp = Date.now()
    const emails = [
      `bracket_test_1_${testTimestamp}@test.com`,
      `bracket_test_2_${testTimestamp}@test.com`,
      `bracket_test_3_${testTimestamp}@test.com`,
      `bracket_test_4_${testTimestamp}@test.com`,
    ]

    for (const email of emails) {
      playerRepo.findOrCreatePlayerByEmail(email, email.split('@')[0])
    }

    const p1 = playerRepo.findByEmail(emails[0])!
    const p2 = playerRepo.findByEmail(emails[1])!
    const p3 = playerRepo.findByEmail(emails[2])!
    const p4 = playerRepo.findByEmail(emails[3])!

    player1Id = p1.id
    player2Id = p2.id
    player3Id = p3.id
    player4Id = p4.id

    tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    tournamentRepo.updateStatus(tournamentId, 'group_stage_active')

    const groups = groupRepo.createGroups(tournamentId, 2, 1, [player1Id, player2Id, player3Id, player4Id])
    group1Id = groups[0].id
    group2Id = groups[1].id

    const matches1 = groupRepo.findMatchesByGroup(group1Id)
    const matches2 = groupRepo.findMatchesByGroup(group2Id)
    match1Id = matches1[0].id
    match2Id = matches2[0].id
  })

  afterEach(() => {
    db.close()
  })

  describe('Job execution', () => {
    it('should generate bracket and return non-empty matches array', async () => {
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

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
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const result = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      const dbMatches = knockoutRepo.findKnockoutMatchesByTournament(tournamentId)

      expect(result).toHaveLength(dbMatches.length)
      expect(result.map(m => m.id).sort()).toEqual(dbMatches.map(m => m.id).sort())
    })
  })

  describe('Match creation', () => {
    it('should create knockout matches with correct advancing players', async () => {
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      const matches = knockoutRepo.findKnockoutMatchesByTournament(tournamentId)
      expect(matches).toHaveLength(1)

      const finalMatch = matches[0]
      const playerIds = [finalMatch.player1_id, finalMatch.player2_id].sort()
      const expectedPlayerIds = [player1Id, player3Id].sort()

      expect(playerIds).toEqual(expectedPlayerIds)
    })

    it('should correctly seed advancing players in bracket', async () => {
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      const seeds = knockoutRepo.getSeeds(tournamentId)
      expect(seeds).toHaveLength(2)
      expect(seeds.map(s => s.playerId).sort()).toEqual([player1Id, player3Id].sort())
    })
  })

  describe('Idempotent execution', () => {
    it('should return same matches when run twice without re-creating', async () => {
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

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

      const allMatches = knockoutRepo.findKnockoutMatchesByTournament(tournamentId)
      expect(allMatches).toHaveLength(1)
    })

    it('should only broadcast on first run, not on idempotent re-run', async () => {
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      const broadcasts1 = jobQueue.getByName('websocket.broadcast')
      expect(broadcasts1).toHaveLength(1)

      jobQueue.clear()

      await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      const broadcasts2 = jobQueue.getByName('websocket.broadcast')
      expect(broadcasts2).toHaveLength(0)
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
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const matches = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      expect(matches).toBeDefined()
      expect(Array.isArray(matches)).toBe(true)
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  describe('DLQ retry', () => {
    it('should move to failed jobs after max retries', async () => {
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

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

  describe('WebSocket broadcast trigger', () => {
    it('should enqueue websocket.broadcast job with correct payload', async () => {
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      expect(jobQueue.getByName('websocket.broadcast')).toHaveLength(0)

      await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      const broadcasts = jobQueue.getByName('websocket.broadcast')
      expect(broadcasts).toHaveLength(1)

      const job = broadcasts[0]
      const data = job.data as any

      expect(data.tournamentId).toBe(tournamentId)
      expect(data.event).toBe('bracket.published')
      expect(data.data.matchCount).toBeDefined()
      expect(typeof data.data.matchCount).toBe('number')
      expect(data.data.byeCount).toBeDefined()
      expect(typeof data.data.byeCount).toBe('number')
    })

    it('should not throw when jobQueue is not provided', async () => {
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

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
      groupRepo.updateMatch(match1Id, player1Id, '6-4, 6-3')
      groupRepo.updateMatch(match2Id, player3Id, '6-4, 6-2')

      const jobId = `bracket.generate:${tournamentId}`

      await jobQueue.add('bracket.generate', { tournamentId }, { jobId })
      await jobQueue.add('bracket.generate', { tournamentId }, { jobId })

      expect(jobQueue.getAll()).toHaveLength(1)

      const matches = await processBracketGenerate(
        { tournamentId },
        { groupRepo, knockoutRepo, jobQueue }
      )

      expect(matches).toHaveLength(1)
      expect(knockoutRepo.findKnockoutMatchesByTournament(tournamentId)).toHaveLength(1)
    })
  })
})
