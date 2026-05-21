import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../app'
import { TournamentRepository, PlayerRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'
import { initializeTestDb, resetTestDb, closeTestDb, cleanupTransaction } from './db-test-setup'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Player Registration and Auth Coverage', () => {
  let db: Pool
  let app: any
  let tokenStore: InMemoryTokenStore
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository

  let tournamentId: string
  let organizerToken: string

  beforeAll(async () => {
    db = await initializeTestDb()
  }, 30000)

  beforeEach(async () => {
    await resetTestDb(db)
    tokenStore = new InMemoryTokenStore()
    app = createApp({ config: DEFAULT_APP_CONFIG, db, tokenStore, jwtConfig: STANDARD_CONFIG })

    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)

    const organizerId = 'org_player_auth'
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'org@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    const now = new Date()
    const futureDeadline = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString()

    const tournament = await tournamentRepo.create({
      name: `Player Auth Test ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 100,
      registrationDeadline: futureDeadline,
      groupStageDeadline: futureDeadline,
      knockoutStageDeadline: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      creatorId: organizerId,
    })

    tournamentId = tournament.id
  }, 30000)

  afterEach(async () => {
    await cleanupTransaction()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  describe('POST /:tournamentId/register - Player registration validation', () => {
    it('should reject registration without email', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          name: 'New Player',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject registration with non-string email', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 123,
          name: 'New Player',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject registration with empty email', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: '   ',
          name: 'New Player',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject registration without name', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'player@test.com',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject registration with non-string name', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'player@test.com',
          name: 123,
        })

      expect(res.status).toBe(400)
    })

    it('should reject registration with empty name', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'player@test.com',
          name: '   ',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('GET /:tournamentId/auth/verify - Token verification', () => {
    it('should reject without token parameter', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/auth/verify`)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject with invalid token', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=invalid`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_TOKEN')
    })

    it('should reject with malformed token', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=malformed-token`)

      expect(res.status).toBe(401)
    })
  })

  describe('POST /:tournamentId/auth/magic-link - Magic link validation', () => {
    it('should not fail for non-registered email (security)', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/auth/magic-link`)
        .send({
          email: 'nonexistent@test.com',
        })

      expect(res.status).toBe(202)
    })

    it('should reject without email', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/auth/magic-link`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject with non-string email', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/auth/magic-link`)
        .send({
          email: 123,
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject with empty email', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/auth/magic-link`)
        .send({
          email: '   ',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })
  })
})
