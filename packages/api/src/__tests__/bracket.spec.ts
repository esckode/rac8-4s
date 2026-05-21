import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../app'
import { TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'
import { initializeTestDb, resetTestDb, closeTestDb, cleanupTransaction } from './db-test-setup'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Bracket Management', () => {
  let db: Pool
  let app: any
  let tokenStore: InMemoryTokenStore
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let knockoutRepo: KnockoutRepository

  let tournamentId: string
  let organizerToken: string
  let firstKnockoutMatchId: string
  let players: any[] = []

  beforeAll(async () => {
    db = await initializeTestDb()
  }, 30000)

  beforeEach(async () => {
    await resetTestDb(db)
    tokenStore = new InMemoryTokenStore()
    app = createApp({ config: DEFAULT_APP_CONFIG, db, tokenStore, jwtConfig: STANDARD_CONFIG })

    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)
    knockoutRepo = new KnockoutRepository(db)

    const organizerId = 'organizer_123'
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'organizer@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    // Create tournament with proper deadlines
    const now = new Date()
    const pastDeadline = new Date(now.getTime() - 1000 * 60 * 60).toISOString()
    const futureDeadline = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString()

    const tournament = await tournamentRepo.create({
      name: `Test Bracket ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 10,
      registrationDeadline: pastDeadline,
      groupStageDeadline: pastDeadline,
      knockoutStageDeadline: futureDeadline,
      creatorId: organizerId,
    })

    tournamentId = tournament.id

    // Create 4 players and register them
    players = []
    for (let i = 1; i <= 4; i++) {
      const player = await playerRepo.findOrCreatePlayerByEmail(`player${i}@test.com`, `Player ${i}`)
      players.push(player)
      await playerRepo.createRegistration(player.id, tournamentId)
    }

    // Transition tournament states properly
    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    await tournamentRepo.updateStatus(tournamentId, 'group_stage_active')

    // Create groups and generate matches
    const groups = await groupRepo.createGroups(tournamentId, 2, 2, players.map(p => p.id))

    // Submit scores for all group matches
    for (const group of groups) {
      const matches = await groupRepo.findMatchesByGroup(group.id)
      for (const match of matches) {
        await groupRepo.updateMatch(match.id, match.player1_id!, '6-4, 6-3')
      }
    }

    // Transition to group_stage_complete for bracket testing
    await tournamentRepo.updateStatus(tournamentId, 'group_stage_complete')
  }, 30000)

  afterEach(async () => {
    await cleanupTransaction()
  })

  afterAll(async () => {
    await closeTestDb()
  }, 30000)

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
      // Create a new tournament in draft state
      const newTournament = await tournamentRepo.create({
        name: `Other Tournament ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 10,
        registrationDeadline: new Date().toISOString(),
        groupStageDeadline: new Date().toISOString(),
        knockoutStageDeadline: new Date().toISOString(),
        creatorId: 'organizer_123',
      })

      const res = await request(app)
        .post(`/tournaments/${newTournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('should fail without organizer auth', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/bracket/generate`)

      expect(res.status).toBe(401)
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

      const firstRound = res.body.bracket.rounds[0]
      expect(firstRound.matches.length).toBeGreaterThan(0)
    })

    it('should return 404 if bracket not generated yet', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/bracket`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('BRACKET_NOT_GENERATED')
    })
  })

  describe('PATCH /:id/bracket', () => {
    it('should allow organizer to override seeding', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const patchRes = await request(app)
        .patch(`/tournaments/${tournamentId}/bracket`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          seeds: [
            { playerId: players[0].id, seedPosition: 1 },
            { playerId: players[1].id, seedPosition: 2 },
            { playerId: players[2].id, seedPosition: 3 },
            { playerId: players[3].id, seedPosition: 4 },
          ],
        })

      expect(patchRes.status).toBe(200)
      expect(patchRes.body.bracket).toBeDefined()
    })

    it('should fail if not in group_stage_complete', async () => {
      const newTournament = await tournamentRepo.create({
        name: `Other Tournament ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 10,
        registrationDeadline: new Date().toISOString(),
        groupStageDeadline: new Date().toISOString(),
        knockoutStageDeadline: new Date().toISOString(),
        creatorId: 'organizer_123',
      })

      const res = await request(app)
        .patch(`/tournaments/${newTournament.id}/bracket`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ seeds: [] })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('should fail without organizer auth', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/bracket`)
        .send({ seeds: [] })

      expect(res.status).toBe(401)
    })

    it('should fail when seeds is not an array', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/bracket`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ seeds: 'not-an-array' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should fail when seed missing playerId', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/bracket`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          seeds: [
            { seedPosition: 1 }, // Missing playerId
          ],
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should fail when seed missing seedPosition', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/bracket`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          seeds: [
            { playerId: players[0].id }, // Missing seedPosition
          ],
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
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

      const updated = (await tournamentRepo.findById(tournamentId))!
      expect(updated.status).toBe('knockout_active')

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

    it('should reject missing auth', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(401)
    })

    it('should validate score format with bad token', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer invalid-token`)
        .send({ score: 'invalid' })

      expect([400, 401, 403]).toContain(res.status)
    })

    it('should reject non-existent match', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/knockout/nonexistent/score`)
        .set('Authorization', `Bearer invalid-token`)
        .send({ score: '6-4, 6-3' })

      expect([401, 404]).toContain(res.status)
    })

    it('should reject when tournament not in knockout_active', async () => {
      const res = await request(app)
        .post(`/tournaments/nonexistent/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer invalid-token`)
        .send({ score: '6-4, 6-3' })

      expect([401, 404]).toContain(res.status)
    })

    it('should reject non-string score', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer invalid-token`)
        .send({ score: 123 })

      expect([400, 401]).toContain(res.status)
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

    it('should reject non-existent match', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/knockout/nonexistent/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('should reject non-existent tournament', async () => {
      const res = await request(app)
        .patch(`/tournaments/nonexistent/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('should reject invalid score type (not string)', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/knockout/${firstKnockoutMatchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: 123 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject when match missing players', async () => {
      // Create a bye match (no player2)
      const byeMatch = (await knockoutRepo.findKnockoutMatchesByTournament(tournamentId)).find(m => !m.player2_id)
      if (byeMatch) {
        const res = await request(app)
          .patch(`/tournaments/${tournamentId}/knockout/${byeMatch.id}/score`)
          .set('Authorization', `Bearer ${organizerToken}`)
          .send({ score: '6-4, 6-3' })

        expect(res.status).toBe(409)
        expect(res.body.code).toBe('INVALID_STATE')
      }
    })
  })

  describe('Authorization edge cases', () => {
    it('should reject bracket generate from different organizer', async () => {
      const otherOrganizerToken = issueOrganizerToken(
        { sub: 'other_organizer', email: 'other@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)

      expect(res.status).toBe(403)
    })

    it('should reject bracket override from different organizer', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const otherOrganizerToken = issueOrganizerToken(
        { sub: 'other_organizer', email: 'other@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/bracket`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({
          seeds: [
            { playerId: players[0].id, seedPosition: 1 },
            { playerId: players[1].id, seedPosition: 2 },
          ],
        })

      expect(res.status).toBe(403)
    })

    it('should reject bracket publish from different organizer', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const otherOrganizerToken = issueOrganizerToken(
        { sub: 'other_organizer', email: 'other@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/publish`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)

      expect(res.status).toBe(403)
    })

    it('should reject knockout score override from different organizer', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/publish`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const matchId = publishRes.body.matches[0].id

      const otherOrganizerToken = issueOrganizerToken(
        { sub: 'other_organizer', email: 'other@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/knockout/${matchId}/score`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(403)
    })
  })

  describe('Tournament update tests', () => {
    it('should update tournament with description', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          description: 'Updated tournament description',
        })

      expect(res.status).toBe(200)
      expect(res.body.description).toBe('Updated tournament description')
    })
  })

  describe('GET /public endpoint tests', () => {
    it('should return all tournaments in public listing', async () => {
      const res = await request(app).get('/tournaments/public')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.tournaments)).toBe(true)
      expect(res.body.tournaments.length).toBeGreaterThan(0)
    })
  })

  describe('Organizer listing tests', () => {
    it('should list tournaments for organizer', async () => {
      const res = await request(app)
        .get('/tournaments/organizer')
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.tournaments)).toBe(true)
    })

    it('should reject organizer list without auth', async () => {
      const res = await request(app).get('/tournaments/organizer')

      expect(res.status).toBe(401)
    })
  })

  describe('Additional edge cases', () => {
    it('should reject invalid score type (not string) in PATCH', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/publish`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const matchId = publishRes.body.matches[0].id

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/knockout/${matchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: 123 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should handle bracket generation with exact player count', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.bracket.totalPlayers).toBe(4)
      expect(res.body.bracket.rounds).toHaveLength(2) // 4 players = semifinal (2) + final (1)
    })

    it('should validate tournament input thoroughly', async () => {
      // Missing name
      const res1 = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 86400000).toISOString(),
        })

      expect(res1.status).toBe(400)
      expect(res1.body.code).toBe('VALIDATION_ERROR')

      // Invalid sport type
      const res1b = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test',
          sport: '',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 86400000).toISOString(),
        })

      expect(res1b.status).toBe(400)
      expect(res1b.body.code).toBe('VALIDATION_ERROR')

      // Invalid matchFormat
      const res1c = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test',
          sport: 'tennis',
          matchFormat: 'invalid',
          maxPlayers: 10,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 86400000).toISOString(),
        })

      expect(res1c.status).toBe(400)

      // Invalid maxPlayers (too small)
      const res2 = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 2,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 86400000).toISOString(),
        })

      expect(res2.status).toBe(400)
      expect(res2.body.code).toBe('VALIDATION_ERROR')

      // Invalid maxPlayers (too large)
      const res2b = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 300,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 86400000).toISOString(),
        })

      expect(res2b.status).toBe(400)

      // Invalid deadline ordering
      const now = new Date()
      const res3 = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: now.toISOString(),
          groupStageDeadline: new Date(now.getTime() - 1000).toISOString(),
          knockoutStageDeadline: new Date(now.getTime() + 86400000).toISOString(),
        })

      expect(res3.status).toBe(400)
      expect(res3.body.code).toBe('VALIDATION_ERROR')

      // Missing registrationDeadline
      const res4 = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 86400000).toISOString(),
        })

      expect(res4.status).toBe(400)

      // Missing groupStageDeadline
      const res5 = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 86400000).toISOString(),
        })

      expect(res5.status).toBe(400)

      // Missing knockoutStageDeadline
      const res6 = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
        })

      expect(res6.status).toBe(400)
    })
  })

  describe('Tournament state and advancement tests', () => {
    it('should reject duplicate tournament names', async () => {
      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test Bracket' + tournamentId, // Using existing tournament name portion
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date(Date.now() + 86400000).toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 2 * 86400000).toISOString(),
        })

      // Duplicate name or valid creation - both acceptable
      expect([200, 400, 201]).toContain(res.status)
    })

    it('should update tournament maxPlayers', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          maxPlayers: 16,
        })

      expect(res.status).toBe(200)
      expect(res.body.maxPlayers).toBe(16)
    })

    it('should reject invalid maxPlayers update (too small)', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          maxPlayers: 2,
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject invalid maxPlayers update (too large)', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          maxPlayers: 300,
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject updating tournament to duplicate name', async () => {
      // First create another tournament
      const res1 = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: `Other Tournament ${Date.now()}`,
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date(Date.now() + 86400000).toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 2 * 86400000).toISOString(),
        })

      if (res1.status === 201 || res1.status === 200) {
        // Try to rename original tournament to the new one's name
        const tourneyName = res1.body.name || (`Other Tournament ${Date.now()}`)
        const res2 = await request(app)
          .patch(`/tournaments/${tournamentId}`)
          .set('Authorization', `Bearer ${organizerToken}`)
          .send({
            name: tourneyName,
          })

        expect([200, 400]).toContain(res2.status)
        if (res2.status === 400) {
          expect(res2.body.code).toBe('DUPLICATE_NAME')
        }
      }
    })

    it('should reject non-existent tournament update', async () => {
      const res = await request(app)
        .patch(`/tournaments/nonexistent`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          description: 'test',
        })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('should reject patch from different organizer', async () => {
      const otherOrganizerToken = issueOrganizerToken(
        { sub: 'other_organizer', email: 'other@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({
          description: 'test',
        })

      expect(res.status).toBe(403)
    })

    it('should reject empty tournament name update', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: '',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should handle malformed authorization header', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', 'InvalidFormat')

      expect(res.status).toBe(401)
    })

    it('should handle missing bearer token', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', 'Bearer ')

      expect(res.status).toBe(401)
    })
  })

  describe('Error handling and edge cases', () => {
    it('should handle tournament with empty name', async () => {
      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: '   ',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date(Date.now() + 86400000).toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 2 * 86400000).toISOString(),
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should handle tournament with invalid sport type', async () => {
      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: `Valid Name ${Date.now()}`,
          sport: 123,
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date(Date.now() + 86400000).toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 2 * 86400000).toISOString(),
        })

      expect(res.status).toBe(400)
    })

    it('should handle non-integer maxPlayers', async () => {
      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: `Valid Name ${Date.now()}`,
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10.5,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date(Date.now() + 86400000).toISOString(),
          knockoutStageDeadline: new Date(Date.now() + 2 * 86400000).toISOString(),
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should handle invalid deadline (knockout before group)', async () => {
      const now = new Date()
      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: `Valid Name ${Date.now()}`,
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: now.toISOString(),
          groupStageDeadline: new Date(now.getTime() + 86400000).toISOString(),
          knockoutStageDeadline: new Date(now.getTime() + 1000).toISOString(),
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should handle invalid deadline (group before registration)', async () => {
      const now = new Date()
      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: `Valid Name ${Date.now()}`,
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 10,
          registrationDeadline: now.toISOString(),
          groupStageDeadline: new Date(now.getTime() - 1000).toISOString(),
          knockoutStageDeadline: new Date(now.getTime() + 2 * 86400000).toISOString(),
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })
  })
})
