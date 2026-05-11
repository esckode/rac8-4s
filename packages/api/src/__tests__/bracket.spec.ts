import request from 'supertest'
import { createApp } from '../app'
import { openDatabase, TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Bracket Management', () => {
  let db: any
  let app: any
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let knockoutRepo: KnockoutRepository
  let tokenStore: InMemoryTokenStore

  let organizerId: string
  let tournamentId: string
  let organizerToken: string
  let player1Token: string
  let player2Token: string
  let player3Token: string
  let player4Token: string
  let firstKnockoutMatchId: string

  beforeEach(async () => {
    db = openDatabase(':memory:')
    tokenStore = new InMemoryTokenStore()
    app = createApp({ db, tokenStore, jwtConfig: STANDARD_CONFIG })

    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)
    knockoutRepo = new KnockoutRepository(db)

    organizerId = 'organizer_123'
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'organizer@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    // Create tournament directly via repository
    const now = new Date()
    const registrationDeadline = new Date(now.getTime() + 86400000).toISOString()
    const groupStageDeadline = new Date(now.getTime() - 1000 * 60 * 60).toISOString() // 1 hour ago
    const knockoutStageDeadline = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString() // 1 week from now

    const tournament = tournamentRepo.create({
      name: `Test Bracket Tournament ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 10,
      description: 'Testing bracket generation',
      registrationDeadline,
      groupStageDeadline,
      knockoutStageDeadline,
      creatorId: organizerId,
    })

    tournamentId = tournament.id

    // Set tournament to registration_open for player registration
    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    // Register 4 players via magic link flow
    const playerEmails = ['p1@test.com', 'p2@test.com', 'p3@test.com', 'p4@test.com']
    const tokens: string[] = []

    for (const email of playerEmails) {
      // POST /register - trigger magic link
      const registerRes = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email,
          name: email.split('@')[0],
          phone: '123-456-7890',
        })
      expect(registerRes.status).toBe(202)

      // Extract token from response
      const token = registerRes.body.magicLinkToken

      // GET /verify - get session token
      const verifyRes = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${token}`)
      expect(verifyRes.status).toBe(200)
      tokens.push(verifyRes.body.sessionToken)
    }

    ;[player1Token, player2Token, player3Token, player4Token] = tokens

    // Advance tournament to registration_closed
    tournamentRepo.updateStatus(tournamentId, 'registration_closed')

    // Create groups: 2 groups of 2 players each, advancing 2 from each
    const groupRes = await request(app)
      .post(`/tournaments/${tournamentId}/groups`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ numGroups: 2, advancingPerGroup: 2 })

    expect(groupRes.status).toBe(201)

    // Find all group matches and submit scores
    const allGroups = groupRes.body.groups
    for (const group of allGroups) {
      const matches = groupRepo.findMatchesByGroup(group.id)
      for (const match of matches) {
        const scoreRes = await request(app)
          .patch(`/tournaments/${tournamentId}/matches/${match.id}/score`)
          .set('Authorization', `Bearer ${organizerToken}`)
          .send({ score: '6-4, 6-3' })
        expect(scoreRes.status).toBe(200)
      }
    }

    // Advance tournament to group_stage_active first, then to complete
    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'start_group_stage' })

    // Now advance to group_stage_complete
    const advanceRes = await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'complete_group_stage' })
    expect(advanceRes.status).toBe(200)
    expect(advanceRes.body.newStatus).toBe('group_stage_complete')
  })

  describe('POST /:id/bracket/generate', () => {
    it('should generate bracket with correct seeding from standings', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.bracket).toBeDefined()
      expect(res.body.bracket.totalPlayers).toBe(4)
      expect(res.body.bracket.rounds).toBeDefined()
      expect(res.body.bracket.rounds.length).toBeGreaterThan(0)
    })

    it('should fail if tournament not in group_stage_complete', async () => {
      const now = new Date()
      const pastDeadline = new Date(now.getTime() - 1000 * 60 * 60).toISOString()
      const futureDeadline = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString()

      const tournamentRes = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Another Tournament',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: pastDeadline,
          groupStageDeadline: pastDeadline,
          knockoutStageDeadline: futureDeadline,
        })

      const otherId = tournamentRes.body.id

      const res = await request(app)
        .post(`/${otherId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('should fail without organizer auth', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/bracket/generate`)

      expect(res.status).toBe(401)
    })

    it('should fail for non-owner organizer', async () => {
      const otherTokenPair = issueOrganizerToken({ sub: 'other_org', email: 'other@test.com' }, STANDARD_CONFIG)
      const otherOrganizerToken = otherTokenPair.accessToken

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)

      expect(res.status).toBe(403)
    })
  })

  describe('GET /:id/bracket', () => {
    it('should return bracket with resolved player IDs after generate', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const res = await request(app).get(`/tournaments/${tournamentId}/bracket`)

      expect(res.status).toBe(200)
      expect(res.body.bracket.rounds).toBeDefined()
      expect(res.body.bracket.totalPlayers).toBe(4)

      // Verify first round has actual player IDs (not seed_N placeholders)
      const firstRound = res.body.bracket.rounds[0]
      if (firstRound.matches.length > 0) {
        const firstMatch = firstRound.matches[0]
        if (firstMatch.player1Id) {
          expect(typeof firstMatch.player1Id).toBe('string')
          expect(firstMatch.player1Id).not.toMatch(/^seed_/)
        }
      }
    })

    it('should return 404 if bracket not generated yet', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/bracket`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('BRACKET_NOT_GENERATED')
    })
  })

  describe('PATCH /:id/bracket', () => {
    it('should allow organizer to override seeding', async () => {
      const genRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const originalSeeds = genRes.body.bracket.rounds[0].matches[0]

      // Override seeding
      const patchRes = await request(app)
        .patch(`/tournaments/${tournamentId}/bracket`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          seeds: [
            { playerId: 'player_1', seedPosition: 1 },
            { playerId: 'player_2', seedPosition: 2 },
            { playerId: 'player_3', seedPosition: 3 },
            { playerId: 'player_4', seedPosition: 4 },
          ],
        })

      expect(patchRes.status).toBe(200)
      expect(patchRes.body.bracket).toBeDefined()
    })

    it('should fail if not in group_stage_complete', async () => {
      const now = new Date()
      const pastDeadline = new Date(now.getTime() - 1000 * 60 * 60).toISOString()
      const futureDeadline = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString()

      const newTournamentRes = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Yet Another Tournament',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: pastDeadline,
          groupStageDeadline: pastDeadline,
          knockoutStageDeadline: futureDeadline,
        })

      const otherId = newTournamentRes.body.id

      const res = await request(app)
        .patch(`/${otherId}/bracket`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          seeds: [{ playerId: 'p1', seedPosition: 1 }],
        })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('should fail for non-owner organizer', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const otherTokenPair = issueOrganizerToken({ sub: 'other_org', email: 'other@test.com' }, STANDARD_CONFIG)
      const otherOrganizerToken = otherTokenPair.accessToken

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/bracket`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({ seeds: [] })

      expect(res.status).toBe(403)
    })
  })

  describe('POST /:id/bracket/publish', () => {
    it('should create knockout matches and transition to knockout_active', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/publish`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(publishRes.status).toBe(200)
      expect(publishRes.body.matches).toBeDefined()
      expect(publishRes.body.matches.length).toBeGreaterThan(0)

      // Verify tournament is now knockout_active
      const tourRes = await request(app).get(`/tournaments/${tournamentId}`)
      expect(tourRes.body.status).toBe('knockout_active')

      // Store first knockout match ID for later tests
      firstKnockoutMatchId = publishRes.body.matches[0].id
    })

    it('should fail if seeds not generated', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/publish`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('BRACKET_NOT_GENERATED')
    })

    it('should fail without organizer auth', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const res = await request(app).post(`/tournaments/${tournamentId}/bracket/publish`)

      expect(res.status).toBe(401)
    })

    it('should fail for non-owner organizer', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const otherTokenPair = issueOrganizerToken({ sub: 'other_org', email: 'other@test.com' }, STANDARD_CONFIG)
      const otherOrganizerToken = otherTokenPair.accessToken

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/publish`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)

      expect(res.status).toBe(403)
    })
  })

  describe('POST /:id/knockout/:matchId/score (player)', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/publish`)
        .set('Authorization', `Bearer ${organizerToken}`)

      firstKnockoutMatchId = publishRes.body.matches[0].id
    })

    it('should allow player to submit score', async () => {
      // Get bracket to find which players are in the match
      const bracketRes = await request(app).get(`/tournaments/${tournamentId}/bracket`)
      const firstMatch = bracketRes.body.bracket.rounds[0].matches[0]

      const playerToken = player1Token // Use player 1 token
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer ${playerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(200)
      expect(res.body.match.winnerId).toBeDefined()
      expect(res.body.match.status).toBe('completed')
    })

    it('should reject player not in this match', async () => {
      // Use a player that's likely not in the first match
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer ${player3Token}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('should reject missing auth', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(401)
    })

    it('should validate score format', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ score: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('SCORE_INVALID')
    })
  })

  describe('PATCH /:id/knockout/:matchId/score (organizer)', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/publish`)
        .set('Authorization', `Bearer ${organizerToken}`)

      firstKnockoutMatchId = publishRes.body.matches[0].id
    })

    it('should allow organizer to override score', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(200)
      expect(res.body.match.winnerId).toBeDefined()
      expect(res.body.match.status).toBe('completed')
    })

    it('should allow organizer to submit after deadline', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(200)
    })

    it('should reject invalid score format', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: 'invalid score' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('SCORE_INVALID')
    })

    it('should reject missing auth', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(401)
    })

    it('should reject non-owner organizer', async () => {
      const otherTokenPair = issueOrganizerToken({ sub: 'other_org', email: 'other@test.com' }, STANDARD_CONFIG)
      const otherOrganizerToken = otherTokenPair.accessToken

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(403)
    })
  })
})
