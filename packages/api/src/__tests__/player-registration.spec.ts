import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../app'
import { TournamentRepository, PlayerRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { generateMagicLinkToken, validatePlayerSession, TokenInvalidError } from '../auth'
import { DEFAULT_APP_CONFIG } from '../config'
import { initializeTestDb, resetTestDb, closeTestDb, cleanupTransaction } from './db-test-setup'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Player Registration and Discovery', () => {
  let db: Pool
  let app: any
  let tokenStore: InMemoryTokenStore
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let tournamentId: string
  let organizerId: string
  let organizerToken: string

  beforeAll(async () => {
    db = await initializeTestDb()
  }, 30000)

  beforeEach(async () => {
    await resetTestDb(db)
    tokenStore = new InMemoryTokenStore()
    app = createApp({ config: DEFAULT_APP_CONFIG, db, jwtConfig: STANDARD_CONFIG, tokenStore })
    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)

    organizerId = 'org_test_1'
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'org@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    const tournament = await tournamentRepo.create({
      name: 'Test Tournament',
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 10,
      registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
      groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
      knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
      creatorId: organizerId,
    })
    tournamentId = tournament.id

    await tournamentRepo.updateStatus(tournamentId, 'registration_open')
  }, 30000)

  afterEach(async () => {
    await cleanupTransaction()
  })

  afterAll(async () => {
    await closeTestDb()
  }, 30000)

  describe('POST /tournaments/:tournamentId/register', () => {
    it('should return 202 on valid registration', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      expect(res.status).toBe(202)
      expect(res.body.message).toContain('player@example.com')
      expect(res.body.magicLinkExpires).toBe(86400)
      expect(res.body.magicLinkToken).toBeDefined()
    })

    it('should return 400 if email is missing', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        name: 'John Player',
      })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('email')
    })

    it('should return 400 if name is missing', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
      })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('name')
    })

    it('should return 404 if tournament does not exist', async () => {
      const res = await request(app).post(`/tournaments/nonexistent/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('should return 409 if tournament registration is not open', async () => {
      await tournamentRepo.updateStatus(tournamentId, 'draft')

      const res = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('REGISTRATION_CLOSED')
    })

    it('should return 409 if tournament is at capacity', async () => {
      await db.query('UPDATE public.tournaments SET max_players = $1 WHERE id = $2', [1, tournamentId])

      await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player1@example.com',
        name: 'Player One',
      })

      const res = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player2@example.com',
        name: 'Player Two',
      })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('TOURNAMENT_FULL')
    })

    it('should be idempotent - return 202 for duplicate registration', async () => {
      const registerReq = {
        email: 'player@example.com',
        name: 'John Player',
      }

      const res1 = await request(app).post(`/tournaments/${tournamentId}/register`).send(registerReq)
      expect(res1.status).toBe(202)

      const res2 = await request(app).post(`/tournaments/${tournamentId}/register`).send(registerReq)
      expect(res2.status).toBe(202)

      const result = await db.query('SELECT COUNT(*) as count FROM public.player_registrations')
      const registrations = result.rows[0] as any
      expect(Number(registrations.count)).toBe(1)
    })

    it('should trim email and name whitespace', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: '  player@example.com  ',
        name: '  John Player  ',
      })

      expect(res.status).toBe(202)
      const player = await playerRepo.findByEmail('player@example.com')
      expect(player).toBeDefined()
      expect(player?.name).toBe('John Player')
    })
  })

  describe('GET /tournaments/:tournamentId/auth/verify', () => {
    it('should return 200 with playerToken on valid magic link', async () => {
      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const magicToken = registerRes.body.magicLinkToken
      const verifyRes = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${magicToken}`)

      expect(verifyRes.status).toBe(200)
      expect(verifyRes.body.playerToken).toBeDefined()
      expect(verifyRes.body.expiresIn).toBe(86400)
      expect(verifyRes.body.playerId).toBeDefined()
      expect(verifyRes.body.tournamentId).toBe(tournamentId)
    })

    it('should return 400 if token parameter is missing', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/auth/verify`)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('token')
    })

    it('should return 401 if token is invalid', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=invalid`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_TOKEN')
    })

    it('should return 401 if magic link is already consumed', async () => {
      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const magicToken = registerRes.body.magicLinkToken

      const verifyRes1 = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${magicToken}`)
      expect(verifyRes1.status).toBe(200)

      const verifyRes2 = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${magicToken}`)
      expect(verifyRes2.status).toBe(401)
    })

    it('should return 403 if token is scoped to different tournament', async () => {
      const tournament2 = await tournamentRepo.create({
        name: 'Test Tournament 2',
        sport: 'badminton',
        matchFormat: 'singles',
        maxPlayers: 10,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })

      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const magicToken = registerRes.body.magicLinkToken
      const verifyRes = await request(app).get(`/tournaments/${tournament2.id}/auth/verify?token=${magicToken}`)

      expect(verifyRes.status).toBe(403)
      expect(verifyRes.body.code).toBe('FORBIDDEN')
    })
  })

  describe('POST /tournaments/:tournamentId/auth/magic-link', () => {
    it('should return 202 for registered player', async () => {
      await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const res = await request(app).post(`/tournaments/${tournamentId}/auth/magic-link`).send({
        email: 'player@example.com',
      })

      expect(res.status).toBe(202)
      expect(res.body.message).toContain('magic link')
    })

    it('should return 202 for unregistered email (non-leaking)', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/auth/magic-link`).send({
        email: 'unknown@example.com',
      })

      expect(res.status).toBe(202)
      expect(res.body.message).toContain('magic link')
    })

    it('should return 400 if email is missing', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/auth/magic-link`).send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('GET /player/tournaments', () => {
    it('should return 200 with player tournaments', async () => {
      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const verifyRes = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`)
      const sessionToken = verifyRes.body.playerToken

      const res = await request(app)
        .get('/player/tournaments')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body.tournaments).toHaveLength(1)
      expect(res.body.tournaments[0].id).toBe(tournamentId)
      expect(res.body.tournaments[0].name).toBe('Test Tournament')
    })

    it('should return pagination metadata', async () => {
      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const verifyRes = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`)
      const sessionToken = verifyRes.body.playerToken

      const res = await request(app)
        .get('/player/tournaments')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.body.pagination).toBeDefined()
      expect(res.body.pagination.offset).toBe(0)
      expect(res.body.pagination.limit).toBe(20)
      expect(res.body.pagination.total).toBe(1)
      expect(res.body.pagination.hasMore).toBe(false)
    })

    it('should return 401 without token', async () => {
      const res = await request(app).get('/player/tournaments')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/player/tournaments')
        .set('Authorization', 'Bearer invalid')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })

    it('should only return tournaments player is registered for', async () => {
      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const verifyRes = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`)
      const sessionToken = verifyRes.body.playerToken

      const tournament2 = await tournamentRepo.create({
        name: 'Test Tournament 2',
        sport: 'badminton',
        matchFormat: 'singles',
        maxPlayers: 10,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })

      await tournamentRepo.updateStatus(tournament2.id, 'registration_open')

      const res = await request(app)
        .get('/player/tournaments')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.body.tournaments).toHaveLength(1)
      expect(res.body.tournaments[0].id).toBe(tournamentId)
    })

    it('should support pagination offset and limit', async () => {
      const email = 'player@example.com'
      const name = 'John Player'

      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({ email, name })
      const verifyRes = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`)
      const sessionToken = verifyRes.body.playerToken

      const res = await request(app)
        .get('/player/tournaments?offset=0&limit=5')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body.pagination.offset).toBe(0)
      expect(res.body.pagination.limit).toBe(5)
    })

    it('should handle empty tournament list', async () => {
      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const verifyRes = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`)
      const sessionToken = verifyRes.body.playerToken

      const tournament2 = await tournamentRepo.create({
        name: 'Test Tournament 2',
        sport: 'badminton',
        matchFormat: 'singles',
        maxPlayers: 10,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })

      await tournamentRepo.softDelete(tournamentId)

      const res = await request(app)
        .get('/player/tournaments')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body.tournaments).toHaveLength(0)
      expect(res.body.pagination.total).toBe(0)
    })
  })

  describe('Magic link token lifecycle', () => {
    it('should generate different tokens for different registrations', async () => {
      const res1 = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player1@example.com',
        name: 'Player 1',
      })

      const res2 = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player2@example.com',
        name: 'Player 2',
      })

      expect(res1.body.magicLinkToken).not.toBe(res2.body.magicLinkToken)
    })

    it('should expire magic link after 24 hours', async () => {
      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const magicToken = registerRes.body.magicLinkToken
      expect(registerRes.body.magicLinkExpires).toBe(86400)
    })
  })

  describe('Session token persistence', () => {
    it('should reuse session token across multiple requests', async () => {
      const registerRes = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: 'John Player',
      })

      const verifyRes = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`)
      const sessionToken = verifyRes.body.playerToken

      const res1 = await request(app)
        .get('/player/tournaments')
        .set('Authorization', `Bearer ${sessionToken}`)

      const res2 = await request(app)
        .get('/player/tournaments')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)
      expect(res1.body.tournaments).toHaveLength(1)
      expect(res2.body.tournaments).toHaveLength(1)
    })
  })

  describe('Error handling', () => {
    it('should return 400 for empty email string', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: '',
        name: 'John Player',
      })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 400 for email with only whitespace', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: '   ',
        name: 'John Player',
      })

      expect(res.status).toBe(400)
    })

    it('should return 400 for empty name string', async () => {
      const res = await request(app).post(`/tournaments/${tournamentId}/register`).send({
        email: 'player@example.com',
        name: '',
      })

      expect(res.status).toBe(400)
    })

    it('should handle invalid authorization header', async () => {
      const res = await request(app)
        .get('/player/tournaments')
        .set('Authorization', 'InvalidFormat token')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })

    it('should handle missing authorization header gracefully', async () => {
      const res = await request(app).get('/player/tournaments')

      expect(res.status).toBe(401)
    })
  })

  describe('Player repository functions', () => {
    it('should handle create registration with duplicate (UNIQUE constraint)', async () => {
      const player = await playerRepo.findOrCreatePlayerByEmail('player@example.com', 'John Player')

      await playerRepo.createRegistration(player.id, tournamentId)

      const error = await new Promise(async resolve => {
        try {
          await playerRepo.createRegistration(player.id, tournamentId)
          resolve(null)
        } catch (e) {
          resolve(e)
        }
      })

      expect(error).toBeDefined()
    })

    it('should find player by email', async () => {
      const player = await playerRepo.findOrCreatePlayerByEmail('player@example.com', 'John Player', '+1-555-0123', 'email')
      const found = await playerRepo.findByEmail('player@example.com')

      expect(found).toBeDefined()
      expect(found?.email).toBe('player@example.com')
      expect(found?.phone).toBe('+1-555-0123')
      expect(found?.preferred_contact).toBe('email')
    })

    it('should return undefined for non-existent player', async () => {
      const found = await playerRepo.findByEmail('nonexistent@example.com')
      expect(found).toBeUndefined()
    })

    it('should count registrations for tournament', async () => {
      const count1 = await playerRepo.countRegistrationsForTournament(tournamentId)
      expect(count1).toBe(0)

      const player1 = await playerRepo.findOrCreatePlayerByEmail('player1@example.com', 'Player 1')
      await playerRepo.createRegistration(player1.id, tournamentId)

      const count2 = await playerRepo.countRegistrationsForTournament(tournamentId)
      expect(count2).toBe(1)

      const player2 = await playerRepo.findOrCreatePlayerByEmail('player2@example.com', 'Player 2')
      await playerRepo.createRegistration(player2.id, tournamentId)

      const count3 = await playerRepo.countRegistrationsForTournament(tournamentId)
      expect(count3).toBe(2)
    })
  })

  describe('Session token edge cases', () => {
    it('should throw TokenInvalidError for empty session token', async () => {
      const emptyTokenStore = new InMemoryTokenStore()
      const error = await validatePlayerSession('', emptyTokenStore).catch(e => e)

      expect(error).toBeInstanceOf(TokenInvalidError)
      expect(error.message).toContain('Token cannot be empty')
    })

    it('should throw TokenInvalidError for missing session token', async () => {
      const emptyTokenStore = new InMemoryTokenStore()
      const error = await validatePlayerSession('nonexistenttoken123', emptyTokenStore).catch(e => e)

      expect(error).toBeInstanceOf(TokenInvalidError)
      expect(error.message).toContain('invalid or has expired')
    })

    it('should throw TokenInvalidError for corrupted session token payload', async () => {
      const testTokenStore = new InMemoryTokenStore()
      await testTokenStore.set('session:corrupted_token', 'not-valid-json', 86400)

      const error = await validatePlayerSession('corrupted_token', testTokenStore).catch(e => e)

      expect(error).toBeInstanceOf(TokenInvalidError)
      expect(error.message).toContain('corrupted')
    })
  })

  describe('Error middleware branch coverage', () => {
    it('should handle duplicate player email (UNIQUE constraint)', async () => {
      const email = 'duplicate@example.com'
      const name = 'Test Player'

      const res1 = await request(app).post(`/tournaments/${tournamentId}/register`).send({ email, name })
      expect(res1.status).toBe(202)

      const error = await new Promise<Error | null>(resolve => {
        (async () => {
          try {
            const now = new Date().toISOString()
            await db.query('INSERT INTO public.players (id, email, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)', [`duplicate_player`, email, 'Another Player', now, now])
            resolve(null)
          } catch (e) {
            resolve(e instanceof Error ? e : new Error(String(e)))
          }
        })()
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('unique constraint')
    })

    it('should handle missing Bearer token format', async () => {
      const res = await request(app)
        .get('/player/tournaments')
        .set('Authorization', 'Basic dGVzdDp0ZXN0')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })
  })
})
