import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { createTestApp, JwtConfig } from '../../helpers/app'
import { AccountRepository } from '../../../db'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniqueEmail(prefix: string = ''): string {
  const id = uid()
  return `me-test-${prefix}-${id}@test.local`.toLowerCase()
}

describe('GET /api/auth/me', () => {
  let pool: Pool
  let app: Express
  let accountRepo: AccountRepository
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    jwtConfig = deps.jwtConfig
    accountRepo = new AccountRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('Valid session', () => {
    it('returns user info with valid token', async () => {
      const email = uniqueEmail('valid-session')
      const password = 'testpassword123'
      const role = 'organizer'

      // Create account with hashed password
      const account = await accountRepo.create(email, role)
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Login to get a valid token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(loginRes.status).toBe(200)
      const token = loginRes.body.token

      // Call /me with valid token
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)
      expect(meRes.body).toHaveProperty('id')
      expect(meRes.body).toHaveProperty('email')
      expect(meRes.body).toHaveProperty('role')
      expect(meRes.body.id).toBe(account.id)
      expect(meRes.body.email).toBe(email)
      expect(meRes.body.role).toBe(role)
    })

    it('returns correct user object structure', async () => {
      const email = uniqueEmail('user-struct')
      const password = 'securepass456'
      const role = 'player'

      const account = await accountRepo.create(email, role)
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)
      // Verify response has the expected structure
      expect(Object.keys(meRes.body).sort()).toEqual(
        expect.arrayContaining(['id', 'email', 'role'])
      )
      // Verify no password hash is returned
      expect(meRes.body).not.toHaveProperty('password_hash')
      expect(meRes.body).not.toHaveProperty('password')
    })

    it('returns matching data from database', async () => {
      const email = uniqueEmail('db-match')
      const password = 'dbmatchpass789'
      const role = 'organizer'

      const account = await accountRepo.create(email, role)
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      // Get user info from /me
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      // Verify it matches database
      const dbAccount = await accountRepo.findById(account.id)
      expect(meRes.body.id).toBe(dbAccount!.id)
      expect(meRes.body.email).toBe(dbAccount!.email)
      expect(meRes.body.role).toBe(dbAccount!.role)
    })

    it('works with different user roles', async () => {
      const roles = ['player', 'organizer']

      for (const role of roles) {
        const email = uniqueEmail(`role-${role}`)
        const password = 'roletest123'

        const account = await accountRepo.create(email, role)
        const passwordHash = await bcryptjs.hash(password, 10)
        await accountRepo.updatePasswordHash(account.id, passwordHash)

        const loginRes = await request(app)
          .post('/api/auth/login')
          .send({ email, password })

        const token = loginRes.body.token

        const meRes = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`)

        expect(meRes.status).toBe(200)
        expect(meRes.body.role).toBe(role)
      }
    })

    it('returns 200 status on successful request', async () => {
      const email = uniqueEmail('status-200')
      const password = 'status123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)
    })
  })

  describe('Invalid token', () => {
    it('returns 401 with malformed token', async () => {
      const malformedToken = 'not.a.valid.jwt.token'

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${malformedToken}`)

      expect(meRes.status).toBe(401)
    })

    it('returns 401 with expired token', async () => {
      const email = uniqueEmail('expired-token')
      const password = 'expiredpass123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Create an expired token by signing with short expiry
      const jwt = require('jsonwebtoken')
      const expiredToken = jwt.sign(
        {
          sub: account.id,
          email: account.email,
          role: 'organizer',
        },
        jwtConfig.secret,
        {
          expiresIn: '-1s', // Already expired
        }
      )

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)

      expect(meRes.status).toBe(401)
    })

    it('returns 401 with invalid signature', async () => {
      const email = uniqueEmail('invalid-sig')
      const password = 'invalidpass123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const jwt = require('jsonwebtoken')
      // Sign with wrong secret
      const invalidToken = jwt.sign(
        {
          sub: account.id,
          email: account.email,
          role: 'organizer',
        },
        'wrong-secret-key',
        {
          expiresIn: jwtConfig.expiresInSeconds,
        }
      )

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${invalidToken}`)

      expect(meRes.status).toBe(401)
    })

    it('returns 401 with garbage token', async () => {
      const garbageToken = 'this_is_not_a_token_at_all!!!'

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${garbageToken}`)

      expect(meRes.status).toBe(401)
    })

    it('returns 401 with empty token', async () => {
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ')

      expect(meRes.status).toBe(401)
    })
  })

  describe('Missing authorization', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const meRes = await request(app)
        .get('/api/auth/me')

      expect(meRes.status).toBe(401)
    })

    it('returns 401 with empty Authorization header', async () => {
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', '')

      expect(meRes.status).toBe(401)
    })

    it('returns 401 without Bearer prefix', async () => {
      const email = uniqueEmail('no-bearer')
      const password = 'nobearer123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', token) // Missing "Bearer " prefix

      expect(meRes.status).toBe(401)
    })

    it('returns 401 with invalid Bearer format', async () => {
      const email = uniqueEmail('invalid-bearer')
      const password = 'invalidbearer123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Basic ${token}`) // Wrong auth scheme

      expect(meRes.status).toBe(401)
    })
  })

  describe('Response schema validation', () => {
    it('response includes id field', async () => {
      const email = uniqueEmail('has-id')
      const password = 'hasid123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.body).toHaveProperty('id')
      expect(typeof meRes.body.id).toBe('string')
      expect(meRes.body.id.length).toBeGreaterThan(0)
    })

    it('response includes email field', async () => {
      const email = uniqueEmail('has-email')
      const password = 'hasemail123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.body).toHaveProperty('email')
      expect(typeof meRes.body.email).toBe('string')
      expect(meRes.body.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    })

    it('response includes role field', async () => {
      const email = uniqueEmail('has-role')
      const password = 'hasrole123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.body).toHaveProperty('role')
      expect(typeof meRes.body.role).toBe('string')
      expect(['player', 'organizer']).toContain(meRes.body.role)
    })

    it('does not return password hash in response', async () => {
      const email = uniqueEmail('no-hash')
      const password = 'nohash123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.body).not.toHaveProperty('password_hash')
      expect(meRes.body).not.toHaveProperty('password')
      // Verify no sensitive fields are present
      const sensitiveFields = ['password_hash', 'password', 'deleted_at', 'updated_at', 'created_at']
      for (const field of sensitiveFields) {
        expect(meRes.body).not.toHaveProperty(field)
      }
    })
  })

  describe('Protected route behavior', () => {
    it('requires authentication on every request', async () => {
      const email = uniqueEmail('protected-check')
      const password = 'protected123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      // First request with token should succeed
      let meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)

      // Second request without token should fail
      meRes = await request(app)
        .get('/api/auth/me')

      expect(meRes.status).toBe(401)
    })

    it('does not leak user info to unauthenticated requests', async () => {
      const email = uniqueEmail('no-leak')
      const password = 'noleak123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Try to get /me without authentication
      const meRes = await request(app)
        .get('/api/auth/me')

      expect(meRes.status).toBe(401)
      // Should not return any user data
      expect(meRes.body).not.toHaveProperty('id')
      expect(meRes.body).not.toHaveProperty('email')
      expect(meRes.body).not.toHaveProperty('role')
    })

    it('returns consistent user data across multiple requests', async () => {
      const email = uniqueEmail('consistent')
      const password = 'consistent123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      // Make multiple requests with the same token
      const meRes1 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      const meRes2 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes1.status).toBe(200)
      expect(meRes2.status).toBe(200)
      expect(meRes1.body).toEqual(meRes2.body)
    })
  })

  describe('Case sensitivity and normalization', () => {
    it('returns email in lowercase', async () => {
      const email = uniqueEmail('UPPERCASE').toLowerCase()
      const password = 'lowercase123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)
      expect(meRes.body.email).toBe(email.toLowerCase())
    })
  })
})
