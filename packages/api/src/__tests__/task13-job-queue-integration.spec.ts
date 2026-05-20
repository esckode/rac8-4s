import request from 'supertest'
import { createApp } from '../app'
import { openDatabase, TournamentRepository, PlayerRepository, GroupRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { InMemoryJobQueue } from '@worker/job-queue'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Task #13: Job Queue Integration', () => {
  let db: any
  let app: any
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let tokenStore: InMemoryTokenStore
  let jobQueue: InMemoryJobQueue

  let tournamentId: string
  let organizerToken: string
  let player1Token: string
  let player2Token: string
  let player3Token: string
  let player4Token: string
  let groupId: string
  let matchId: string

  beforeEach(async () => {
    tokenStore = new InMemoryTokenStore()
    jobQueue = new InMemoryJobQueue()
    db = openDatabase(':memory:')
    app = createApp({

      config: DEFAULT_APP_CONFIG,      db,
      jwtConfig: STANDARD_CONFIG,
      tokenStore,
      jobQueue,
    })

    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)

    const organizerId = 'org_123'
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'organizer@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    // Create tournament
    const now = new Date()
    const pastDeadline = new Date(now.getTime() - 86400000).toISOString()
    const futureDeadline = new Date(now.getTime() + 259200000).toISOString()

    const tournament = await tournamentRepo.create({
      name: `Job Queue Test ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 8,
      registrationDeadline: pastDeadline,
      groupStageDeadline: futureDeadline,
      knockoutStageDeadline: futureDeadline,
      creatorId: organizerId,
    })
    tournamentId = tournament.id

    // Register 4 players
    await tournamentRepo.updateStatus(tournamentId, 'registration_open')
    const testTimestamp = Date.now()

    const emails = [
      `queue_test_1_${testTimestamp}@test.com`,
      `queue_test_2_${testTimestamp}@test.com`,
      `queue_test_3_${testTimestamp}@test.com`,
      `queue_test_4_${testTimestamp}@test.com`,
    ]

    const tokens: string[] = []
    for (let i = 0; i < emails.length; i++) {
      const registerRes = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({ email: emails[i], name: `Player ${i + 1}` })

      const verifyRes = await request(app).get(
        `/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`
      )

      tokens.push(verifyRes.body.playerToken)
    }

    player1Token = tokens[0]
    player2Token = tokens[1]
    player3Token = tokens[2]
    player4Token = tokens[3]

    const p1 = (await playerRepo.findByEmail(emails[0]))!
    const p2 = (await playerRepo.findByEmail(emails[1]))!
    const p3 = (await playerRepo.findByEmail(emails[2]))!
    const p4 = (await playerRepo.findByEmail(emails[3]))!

    // Create groups and matches
    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    await tournamentRepo.updateStatus(tournamentId, 'group_stage_active')
    const groups = await groupRepo.createGroups(tournamentId, 1, 2, [p1.id, p2.id, p3.id, p4.id])
    groupId = groups[0].id

    // Find a match between player1 and player2
    const allMatches = await groupRepo.findMatchesByGroup(groupId)
    const player1vs2Match = allMatches.find(m =>
      (m.player1_id === p1.id && m.player2_id === p2.id) ||
      (m.player1_id === p2.id && m.player2_id === p1.id)
    )

    if (!player1vs2Match) {
      throw new Error('No match found between player1 and player2')
    }
    matchId = player1vs2Match.id
  })

  afterEach(async () => {
    await jobQueue.close()
    db.close()
  })

  describe('Score submission enqueues standings.recalculate job', () => {
    it('should enqueue a standings.recalculate job after score submission', async () => {
      expect(jobQueue.getAll()).toHaveLength(0)

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(200)

      const enqueued = jobQueue.getAll()
      expect(enqueued).toHaveLength(1)
      expect(enqueued[0].name).toBe('standings.recalculate')
    })

    it('should include correct tournamentId and groupId in job payload', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(200)

      const enqueued = jobQueue.getAll()
      expect(enqueued[0].data).toEqual({
        tournamentId,
        groupId,
      })
    })

    it('should use deduplication jobId pattern: standings.recalculate:<groupId>', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(200)

      const enqueued = jobQueue.getAll()
      expect(enqueued[0].id).toBe(`standings.recalculate:${groupId}`)
    })

    it('should consolidate multiple score submissions for same group into 1 job', async () => {
      // Submit first score
      const res1 = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ score: '6-4, 6-3' })

      expect(res1.status).toBe(200)
      expect(jobQueue.getAll()).toHaveLength(1)

      // Submit another score from the same match (player2 submits same match)
      // This tests the consolidation when the same group has multiple submissions
      const res2 = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${player2Token}`)
        .send({ score: '6-4, 6-3' })

      expect(res2.status).toBe(200)
      // Should still be 1 job (deduplication by group_id)
      const allJobs = jobQueue.getAll()
      expect(allJobs).toHaveLength(1)
      expect(allJobs[0].id).toBe(`standings.recalculate:${groupId}`)
    })
  })

  describe('No job queue graceful handling', () => {
    it('should not throw when jobQueue is not provided', async () => {
      const appNoQueue = createApp({ config: DEFAULT_APP_CONFIG,
        db,
        jwtConfig: STANDARD_CONFIG,
        tokenStore,
        // no jobQueue
      })

      const res = await request(appNoQueue)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ score: '6-4, 6-3' })

      // Should succeed without error
      expect(res.status).toBe(200)
      expect(res.body.match.id).toBe(matchId)
    })
  })

  describe('Job options: attempts and backoff', () => {
    it('should include retry configuration in job options', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ score: '6-4, 6-3' })

      const enqueued = jobQueue.getAll()
      expect(enqueued[0].opts.attempts).toBe(3)
      expect(enqueued[0].opts.backoff).toEqual({ type: 'exponential', delay: 1000 })
    })
  })
})
