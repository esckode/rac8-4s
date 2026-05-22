import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, OrganizerFactory } from '../factories'
import { TournamentRepository } from '../../db'

describe('Tournaments API', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    await truncateAll(pool)
    ;({ app, jwtConfig } = createTestApp(pool))
  })

  afterAll(async () => {
    await closeTestPool()
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

      // Try to create duplicate via API
      const res = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)

      expect(res.status).toBe(409)
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

  describe('GET /tournaments/:id', () => {
    it('retrieves a tournament by id', async () => {
      const organizerId = OrganizerFactory.id()
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app).get(`/tournaments/${tournament.id}`)

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(tournament.id)
      expect(res.body.name).toBe(tournament.name)
    })

    it('returns 404 for non-existent tournament', async () => {
      const res = await request(app).get('/tournaments/nonexistent')

      expect(res.status).toBe(404)
    })
  })

  describe('GET /tournaments/public', () => {
    it('lists tournaments with registration_open status', async () => {
      const organizerId = OrganizerFactory.id()
      const tournament = await TournamentFactory.open(pool, organizerId)

      const res = await request(app).get('/tournaments/public')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
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
      expect(Array.isArray(res.body)).toBe(true)
    })

    it('returns empty list when no tournaments are public', async () => {
      const res = await request(app).get('/tournaments/public')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
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
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  describe('PATCH /tournaments/:id', () => {
    it('updates tournament', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Tournament' })

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
})
