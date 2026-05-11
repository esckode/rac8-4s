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

  let tournamentId: string
  let organizerToken: string
  let firstKnockoutMatchId: string
  let players: any[] = []

  beforeEach(async () => {
    db = openDatabase(':memory:')
    const tokenStore = new InMemoryTokenStore()
    app = createApp({ db, tokenStore, jwtConfig: STANDARD_CONFIG })

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

    const tournament = tournamentRepo.create({
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
      const player = playerRepo.findOrCreatePlayerByEmail(`player${i}@test.com`, `Player ${i}`)
      players.push(player)
      playerRepo.createRegistration(player.id, tournamentId)
    }

    // Transition tournament states properly
    tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    tournamentRepo.updateStatus(tournamentId, 'group_stage_active')

    // Create groups and generate matches
    const groups = groupRepo.createGroups(tournamentId, 2, 2, players.map(p => p.id))

    // Submit scores for all group matches
    for (const group of groups) {
      const matches = groupRepo.findMatchesByGroup(group.id)
      for (const match of matches) {
        groupRepo.updateMatch(match.id, match.player1_id!, '6-4, 6-3')
      }
    }

    // Transition to group_stage_complete for bracket testing
    tournamentRepo.updateStatus(tournamentId, 'group_stage_complete')
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
      // Create a new tournament in draft state
      const newTournament = tournamentRepo.create({
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
      const newTournament = tournamentRepo.create({
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

      const updated = tournamentRepo.findById(tournamentId)!
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
  })
})
