import request from 'supertest'
import { Express } from 'express'
import { Pool, PoolClient } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction, getTransactionClient } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, OrganizerFactory, PlayerFactory } from '../factories'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../../db'
import { generatePlayerSession } from '../../auth/magic-link'
import { InMemoryTokenStore } from '../../auth/token-store'

// Helper to get the right database connection (transaction or pool)
function getDb(pool: Pool): Pool | PoolClient {
  return getTransactionClient() || pool
}

describe('Tournaments API', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool) as any
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('POST /tournaments', () => {
    it('creates a tournament with valid input', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(201)
      expect(res.body.name).toBe(data.name)
      expect(res.body.status).toBe('draft')
    })

    it('rejects duplicate tournament names', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()

      // Create first tournament via repository
      const repo = new TournamentRepository(pool)
      await repo.create({
        ...data,
        creatorId: organizerId,
      })

      // Try to create duplicate via API - returns 400 VALIDATION_ERROR
      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('DUPLICATE_NAME')
    })

    it('rejects missing auth', async () => {
      const data = TournamentFactory.data()

      const res = await request(app)
        .post('/tournaments')
        .send(data)

      expect(res.status).toBe(401)
    })

    it('rejects invalid input (missing fields)', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'incomplete-tournament',
          // missing other required fields
        })

      expect(res.status).toBe(400)
    })

    it('rejects invalid maxPlayers (too small)', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data({ maxPlayers: 1 })

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects invalid maxPlayers (too large)', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data({ maxPlayers: 201 })

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects non-integer maxPlayers', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...data, maxPlayers: 8.5 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects empty name string', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...data, name: '   ' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('name')
    })

    it('rejects missing name field', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()
      const { name, ...rest } = data

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(rest)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects missing sport field', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()
      const { sport, ...rest } = data

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(rest)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects empty sport string', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...data, sport: '  ' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('sport')
    })

    it('rejects invalid matchFormat', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...data, matchFormat: 'teams' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('matchFormat')
    })

    it('rejects missing matchFormat field', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()
      const { matchFormat, ...rest } = data

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(rest)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects missing registrationDeadline field', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()
      const { registrationDeadline, ...rest } = data

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(rest)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects missing groupStageDeadline field', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()
      const { groupStageDeadline, ...rest } = data

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(rest)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects missing knockoutStageDeadline field', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data()
      const { knockoutStageDeadline, ...rest } = data

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(rest)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects deadline ordering violation (registration >= group)', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const now = Date.now()
      const later = now + 86400000
      const muchLater = now + 172800000

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `tournament-${Date.now()}`,
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date(later).toISOString(),
          groupStageDeadline: new Date(later).toISOString(), // same as registration
          knockoutStageDeadline: new Date(muchLater).toISOString(),
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('deadline ordering')
    })

    it('rejects deadline ordering violation (group >= knockout)', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const now = Date.now()
      const later = now + 86400000
      const muchLater = now + 172800000

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `tournament-${Date.now()}`,
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date(now).toISOString(),
          groupStageDeadline: new Date(muchLater).toISOString(),
          knockoutStageDeadline: new Date(muchLater).toISOString(), // same as group
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('deadline ordering')
    })

    it('accepts valid matchFormat singles', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data({ matchFormat: 'singles' })

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(201)
    })

    it('accepts valid matchFormat doubles', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data({ matchFormat: 'doubles' })

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(201)
    })

    it('accepts maxPlayers at minimum boundary (4)', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data({ maxPlayers: 4 })

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(201)
    })

    it('accepts maxPlayers at maximum boundary (200)', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data({ maxPlayers: 200 })

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(201)
    })
  })

  describe('GET /tournaments/:id/bundle', () => {
    it('retrieves tournament bundle for organizer', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/bundle`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      expect(res.body.tournament).toBeDefined()
      expect(res.body.tournament.id).toBe(tournament.id)
      expect(res.body.tournament.name).toBe(tournament.name)
    })

    it('returns 404 for non-existent tournament', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const res = await request(app)
        .get('/tournaments/nonexistent/bundle')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(404)
    })

    it('requires authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app).get(`/tournaments/${tournament.id}/bundle`)

      expect(res.status).toBe(401)
    })
  })

  describe('GET /tournaments/public', () => {
    it('lists tournaments with registration_open status', async () => {
      const organizerId = OrganizerFactory.id()
      const tournament = await TournamentFactory.open(pool, organizerId)

      const res = await request(app).get('/tournaments/public')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.tournaments)).toBe(true)
      expect(res.body.pagination).toBeDefined()
    })

    it('excludes draft tournaments from public list', async () => {
      const organizerId = OrganizerFactory.id()
      const data = TournamentFactory.data()
      const repo = new TournamentRepository(pool)
      const draftTournament = await repo.create({
        ...data,
        creatorId: organizerId,
      })

      const res = await request(app).get('/tournaments/public')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.tournaments)).toBe(true)
      // Draft tournaments should not be in public list
      const ids = res.body.tournaments.map((t: any) => t.id)
      expect(ids).not.toContain(draftTournament.id)
    })

    it('returns empty list when no tournaments are public', async () => {
      const res = await request(app).get('/tournaments/public')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.tournaments)).toBe(true)
      expect(res.body.pagination).toBeDefined()
    })
  })

  describe('GET /tournaments/organizer', () => {
    it('lists organizer tournaments', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .get('/tournaments/organizer')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.tournaments)).toBe(true)
      expect(res.body.pagination).toBeDefined()
      // Should contain the created tournament
      const ids = res.body.tournaments.map((t: any) => t.id)
      expect(ids).toContain(tournament.id)
    })
  })

  describe('PATCH /tournaments/:id', () => {
    it('updates tournament', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const newName = `Updated-${Date.now()}`

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: newName })

      expect(res.status).toBe(200)
    })

    it('rejects unauthorized update', async () => {
      const organizerId = OrganizerFactory.id()
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Different organizer's token
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Hacked Tournament' })

      expect(res.status).toBe(403)
    })
  })

  describe('POST /tournaments/:id/groups', () => {
    it('creates groups for tournament in registration_closed status', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_closed')

      // Register players
      const playerRepo = new (require('../../db').PlayerRepository)(pool)
      const p1 = await PlayerFactory.create(pool)
      const p2 = await PlayerFactory.create(pool)
      const p3 = await PlayerFactory.create(pool)
      const p4 = await PlayerFactory.create(pool)
      await playerRepo.createRegistration(p1.id, tournament.id)
      await playerRepo.createRegistration(p2.id, tournament.id)
      await playerRepo.createRegistration(p3.id, tournament.id)
      await playerRepo.createRegistration(p4.id, tournament.id)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(201)
      expect(Array.isArray(res.body.groups)).toBe(true)
      expect(res.body.groups.length).toBe(2)
      expect(res.body.groups[0].playerCount).toBeGreaterThan(0)
    })

    it('rejects group creation if not in registration_closed status', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('rejects invalid numGroups', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 0, advancingPerGroup: 1 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects invalid advancingPerGroup', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects if not enough players for groups', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 5, advancingPerGroup: 1 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(401)
    })

    it('rejects unauthorized organizer', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_closed')

      const { accessToken: otherToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(403)
    })
  })

  describe('GET /tournaments/:id/groups', () => {
    it('lists groups for tournament', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.groups)).toBe(true)
    })

    it('returns 404 for non-existent tournament', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .get('/tournaments/nonexistent/groups')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(404)
    })

    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app).get(`/tournaments/${tournament.id}/groups`)

      expect(res.status).toBe(401)
    })

    it('rejects access from different organizer', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const { accessToken: otherToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${otherToken}`)

      expect(res.status).toBe(403)
    })
  })

  describe('POST /tournaments/:id/advance', () => {
    it('transitions from draft to registration_open', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/advance`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ action: 'OPEN_REGISTRATION' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('registration_open')
      expect(res.body.previousStatus).toBe('draft')
    })

    it('transitions from registration_open to registration_closed', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_open')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/advance`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ action: 'CLOSE_REGISTRATION' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('registration_closed')
    })

    it('rejects invalid action format', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/advance`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ action: 123 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects missing action', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/advance`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects non-existent tournament', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post('/tournaments/nonexistent/advance')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ action: 'OPEN_REGISTRATION' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/advance`)
        .send({ action: 'OPEN_REGISTRATION' })

      expect(res.status).toBe(401)
    })

    it('rejects transition from different organizer', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Different organizer's token
      const { accessToken: otherToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/advance`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ action: 'OPEN_REGISTRATION' })

      expect(res.status).toBe(403)
    })

    it('rejects invalid state transition', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'knockout_active')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/advance`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ action: 'OPEN_REGISTRATION' })

      expect(res.status).toBe(409)
    })

    it('allows forced advance from registration_closed to group_stage_active', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/advance`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ action: 'START_GROUP_STAGE', forceAdvance: true })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('group_stage_active')
    })

    it('requires players before starting group stage without force', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/advance`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ action: 'START_GROUP_STAGE', forceAdvance: false })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /tournaments/:id/bracket', () => {
    it('returns 404 if tournament not found', async () => {
      const res = await request(app)
        .get('/tournaments/nonexistent/bracket')

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('returns 404 if bracket not generated yet', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/bracket`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('BRACKET_NOT_GENERATED')
    })

    it('returns bracket structure after generation', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      // Set up tournament with groups and players
      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      // Create groups (while still in registration_closed status)
      await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      // Advance to group_stage_complete
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      // Generate bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Fetch bracket
      const res = await request(app)
        .get(`/tournaments/${tournament.id}/bracket`)

      expect(res.status).toBe(200)
      expect(res.body.bracket).toBeDefined()
      expect(res.body.bracket.rounds).toBeDefined()
      expect(Array.isArray(res.body.bracket.rounds)).toBe(true)
      expect(res.body.bracket.totalPlayers).toBe(2)
    })
  })

  describe('POST /tournaments/:id/bracket/generate', () => {
    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)

      expect(res.status).toBe(401)
    })

    it('rejects non-owner organizer', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      const { accessToken: otherToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${otherToken}`)

      expect(res.status).toBe(403)
    })

    it('returns 404 if tournament not found', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post('/tournaments/nonexistent/bracket/generate')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('requires group_stage_complete status', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('requires groups to exist', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('generates bracket from group standings', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      // Register 4 players
      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      // Create groups (while still in registration_closed status)
      await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      // Advance to group_stage_complete
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      // Generate bracket
      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      expect(res.body.bracket).toBeDefined()
      expect(res.body.bracket.rounds).toBeDefined()
      expect(res.body.bracket.totalPlayers).toBe(2)
      expect(Array.isArray(res.body.bracket.rounds)).toBe(true)
    })

    it('interleaves seeds by rank across groups', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      // Register 6 players for 3 groups with 2 advancing each
      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all(
        Array(6).fill(null).map(() => PlayerFactory.create(pool))
      )

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      // Create groups (while still in registration_closed status)
      await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 3, advancingPerGroup: 2 })

      // Advance to group_stage_complete
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      expect(res.body.bracket.totalPlayers).toBe(6)
    })
  })

  describe('PATCH /tournaments/:id/bracket', () => {
    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .send({ seeds: [] })

      expect(res.status).toBe(401)
    })

    it('rejects non-owner organizer', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      const { accessToken: otherToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ seeds: [] })

      expect(res.status).toBe(403)
    })

    it('returns 404 if tournament not found', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .patch('/tournaments/nonexistent/bracket')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds: [] })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('requires group_stage_complete status', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds: [] })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('requires bracket to be generated first', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds: [] })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('BRACKET_NOT_GENERATED')
    })

    it('validates seeds is an array', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      // Generate bracket first
      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      // Create groups (while still in registration_closed status)
      await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      // Advance to group_stage_complete
      await repo.updateStatus(tournament.id, 'group_stage_complete')
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Try to patch with non-array seeds
      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds: 'not-an-array' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('validates seed structure (playerId and seedPosition)', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      // Generate bracket first
      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      // Create groups (while still in registration_closed status)
      await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      // Advance to group_stage_complete
      await repo.updateStatus(tournament.id, 'group_stage_complete')
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Try to patch with invalid seed structure
      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds: [{ playerId: 'player1' }] }) // missing seedPosition

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('updates bracket with valid seeds', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      // Generate bracket first
      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      // Create groups (while still in registration_closed status)
      await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      // Advance to group_stage_complete
      await repo.updateStatus(tournament.id, 'group_stage_complete')
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Update seeding with reversed order
      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          seeds: [
            { playerId: players[3].id, seedPosition: 1 },
            { playerId: players[2].id, seedPosition: 2 },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.bracket).toBeDefined()
      expect(res.body.bracket.rounds).toBeDefined()
    })

    it('validates seedPosition is a number', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      // Generate bracket first
      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      // Create groups (while still in registration_closed status)
      await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      // Advance to group_stage_complete
      await repo.updateStatus(tournament.id, 'group_stage_complete')
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Try invalid seedPosition (string instead of number)
      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          seeds: [
            { playerId: players[0].id, seedPosition: '1' },
          ],
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('Match Scoring - Group Stage', () => {
    it('player submits score for group stage match', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(groupRes.status).toBe(201)

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      expect(matches.length).toBeGreaterThan(0)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const scoreRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-3' })

      expect(scoreRes.status).toBe(200)
      expect(scoreRes.body.match.score).toBe('6-4, 6-3')
      expect(scoreRes.body.match.winnerId).toBeDefined()
    })

    it('rejects score submission from non-participant', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const nonParticipantSession = await generatePlayerSession(
        {
          playerId: 'player_other',
          tournamentId: tournament.id,
          email: 'other@test.local',
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const scoreRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${nonParticipantSession.token}`)
        .send({ score: '6-4, 6-3' })

      expect(scoreRes.status).toBe(403)
      expect(scoreRes.body.code).toBe('FORBIDDEN')
    })

    it('rejects invalid score format', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const scoreRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: 'invalid' })

      expect(scoreRes.status).toBe(400)
      expect(scoreRes.body.code).toBe('SCORE_INVALID')
    })

    it('organizer overrides match score', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const overrideRes = await request(app)
        .patch(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ score: '7-5, 6-2' })

      expect(overrideRes.status).toBe(200)
      expect(overrideRes.body.match.score).toBe('7-5, 6-2')
    })

    it('rejects score submission after deadline', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const now = new Date()
      const pastDeadline = new Date(now.getTime() - 86400000)

      const tournament = await TournamentFactory.create(pool, organizerId, {
        groupStageDeadline: pastDeadline.toISOString(),
      })
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const scoreRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-3' })

      expect(scoreRes.status).toBe(409)
      expect(scoreRes.body.code).toBe('DEADLINE_PASSED')
    })
  })

  describe('Player Registration', () => {
    it('player registers with valid email and name', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_open')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({
          email: 'newplayer@test.local',
          name: 'New Player',
        })

      expect(res.status).toBe(202)
      expect(res.body.message).toContain('Registration email sent')
      expect(res.body.magicLinkToken).toBeDefined()
      expect(res.body.magicLinkExpires).toBeGreaterThan(0)
    })

    it('requires email field', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_open')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({ name: 'New Player' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('email')
    })

    it('requires name field', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_open')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({ email: 'player@test.local' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('name')
    })

    it('rejects empty email', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_open')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({ email: '  ', name: 'Player' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects empty name', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_open')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({ email: 'player@test.local', name: '   ' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('tournament not found', async () => {
      const res = await request(app)
        .post(`/tournaments/invalid_id/register`)
        .send({
          email: 'player@test.local',
          name: 'Player',
        })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('rejects registration when tournament not in registration_open state', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({
          email: 'player@test.local',
          name: 'Player',
        })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('REGISTRATION_CLOSED')
    })

    it('rejects registration when tournament is full', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId, { maxPlayers: 1 })
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_open')

      const player = await PlayerFactory.create(pool)
      const playerRepo = new PlayerRepository(pool)
      await playerRepo.createRegistration(player.id, tournament.id)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({
          email: 'newplayer@test.local',
          name: 'New Player',
        })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('TOURNAMENT_FULL')
    })

    it('allows re-registration of same email (idempotent)', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_open')

      const email = 'player@test.local'
      const res1 = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({ email, name: 'Player' })

      const res2 = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({ email, name: 'Player Updated' })

      expect(res1.status).toBe(202)
      expect(res2.status).toBe(202)
    })

    it('includes optional phone and preferredContact fields', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'registration_open')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({
          email: 'player@test.local',
          name: 'Player',
          phone: '+1234567890',
          preferredContact: 'email',
        })

      expect(res.status).toBe(202)
      expect(res.body.magicLinkToken).toBeDefined()
    })
  })

  describe('Partner Confirmation', () => {
    it('requires player session authentication', async () => {
      const res = await request(app)
        .patch(`/tournaments/registrations/some_id/confirm`)

      expect(res.status).toBe(401)
    })

    it('rejects when registration not found', async () => {
      const player = await PlayerFactory.create(pool)
      const session = await generatePlayerSession(
        {
          playerId: player.id,
          tournamentId: 'test_tournament',
          email: player.email,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const res = await request(app)
        .patch(`/tournaments/registrations/invalid_id/confirm`)
        .set('Authorization', `Bearer ${session.token}`)

      expect(res.status).toBe(404)
    })

    it('rejects when registration has no partner', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const playerRepo = new PlayerRepository(pool)

      const player = await PlayerFactory.create(pool)
      const reg = await playerRepo.createRegistration(player.id, tournament.id)

      const session = await generatePlayerSession(
        {
          playerId: player.id,
          tournamentId: tournament.id,
          email: player.email,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const res = await request(app)
        .patch(`/tournaments/registrations/${reg.id}/confirm`)
        .set('Authorization', `Bearer ${session.token}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
      expect(res.body.message).toContain('pending partner')
    })
  })

  describe('Tournament Withdrawal', () => {
    it('player withdraws from tournament before deadline', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      const tournament = await TournamentFactory.create(pool, organizerId, {
        registrationDeadline: futureDate,
      })
      const playerRepo = new PlayerRepository(pool)

      const player = await PlayerFactory.create(pool)
      const reg = await playerRepo.createRegistration(player.id, tournament.id)

      const session = await generatePlayerSession(
        {
          playerId: player.id,
          tournamentId: tournament.id,
          email: player.email,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const res = await request(app)
        .delete(`/tournaments/registrations/${reg.id}`)
        .set('Authorization', `Bearer ${session.token}`)

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('withdrawn')
      expect(res.body.withdrawnAt).toBeDefined()
    })

    it('player withdrawal requested after deadline', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const pastDate = new Date(Date.now() - 86400000).toISOString()
      const tournament = await TournamentFactory.create(pool, organizerId, {
        registrationDeadline: pastDate,
      })
      const playerRepo = new PlayerRepository(pool)

      const player = await PlayerFactory.create(pool)
      const reg = await playerRepo.createRegistration(player.id, tournament.id)

      const session = await generatePlayerSession(
        {
          playerId: player.id,
          tournamentId: tournament.id,
          email: player.email,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const res = await request(app)
        .delete(`/tournaments/registrations/${reg.id}`)
        .set('Authorization', `Bearer ${session.token}`)

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('withdrawal_pending')
      expect(res.body.withdrawnAt).toBeDefined()
    })

    it('requires player session authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const playerRepo = new PlayerRepository(pool)

      const player = await PlayerFactory.create(pool)
      const reg = await playerRepo.createRegistration(player.id, tournament.id)

      const res = await request(app)
        .delete(`/tournaments/registrations/${reg.id}`)

      expect(res.status).toBe(401)
    })

    it('rejects when registration not found', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const player = await PlayerFactory.create(pool)
      const session = await generatePlayerSession(
        {
          playerId: player.id,
          tournamentId: tournament.id,
          email: player.email,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const res = await request(app)
        .delete(`/tournaments/registrations/invalid_id`)
        .set('Authorization', `Bearer ${session.token}`)

      expect(res.status).toBe(404)
    })

    it('rejects when player does not own the registration', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const playerRepo = new PlayerRepository(pool)

      const player1 = await PlayerFactory.create(pool)
      const player2 = await PlayerFactory.create(pool)

      const reg = await playerRepo.createRegistration(player1.id, tournament.id)

      const session = await generatePlayerSession(
        {
          playerId: player2.id,
          tournamentId: tournament.id,
          email: player2.email,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const res = await request(app)
        .delete(`/tournaments/registrations/${reg.id}`)
        .set('Authorization', `Bearer ${session.token}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })
  })
})
