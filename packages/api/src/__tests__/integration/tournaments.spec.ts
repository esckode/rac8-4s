import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, OrganizerFactory, PlayerFactory } from '../factories'
import { TournamentRepository } from '../../db'

describe('Tournaments API', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    ;({ app, jwtConfig } = createTestApp(pool))
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

    it('rejects invalid maxPlayers', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      const data = TournamentFactory.data({ maxPlayers: 1 }) // too small

      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(400)
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
})
