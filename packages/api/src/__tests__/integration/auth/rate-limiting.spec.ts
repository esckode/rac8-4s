import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { createTestApp } from '../../helpers/app'
import { AccountRepository } from '../../../db'
import { clearRateLimitStore, stopCleanupInterval } from '../../../middleware/rate-limit'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniqueEmail(prefix: string = ''): string {
  const id = uid()
  return `ratelimit-test-${prefix}-${id}@test.local`.toLowerCase()
}

describe('Rate Limiting', () => {
  let pool: Pool
  let app: Express
  let accountRepo: AccountRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    accountRepo = new AccountRepository(pool)
  })

  afterAll(async () => {
    clearRateLimitStore()
    stopCleanupInterval()
    await rollbackTransaction()
  })

  beforeEach(() => {
    clearRateLimitStore()
  })

  describe('POST /api/auth/login - Rate limiting', () => {
    it('allows successful logins without rate limit', async () => {
      const email = uniqueEmail('success')
      const password = 'testpassword123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Should allow multiple successful logins
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password })

        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('token')
      }
    })

    it('clears counter after successful login', async () => {
      const email = uniqueEmail('clear-counter')
      const password = 'correctpassword'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Make 3 failed attempts
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' })

        expect(res.status).toBe(401)
      }

      // Successful login should clear the counter
      const successRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(successRes.status).toBe(200)

      // Should be able to make more failed attempts after success
      const failRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(failRes.status).toBe(401)
    })

    it('increments counter on failed login attempts', async () => {
      const email = uniqueEmail('increment')
      const password = 'correctpassword'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Make 3 failed attempts
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' })

        expect(res.status).toBe(401)
      }

      // 4th request should be allowed (still under limit)
      const res4 = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(res4.status).toBe(401)
    })

    it('returns 429 after 5 failed login attempts', async () => {
      const email = uniqueEmail('exceeded')
      const password = 'correctpassword'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Make 4 failed attempts (under limit)
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' })

        expect(res.status).toBe(401)
      }

      // 5th request should be rate limited (at maxAttempts=5)
      const res5 = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(res5.status).toBe(429)
      expect(res5.body).toHaveProperty('code')
      expect(res5.body.code).toBe('RATE_LIMITED')
      expect(res5.body).toHaveProperty('message')
    })

    it('returns 429 with correct error schema when rate limited', async () => {
      const email = uniqueEmail('schema')
      const password = 'correctpassword'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Exceed rate limit
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' })
      }

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(res.status).toBe(429)
      expect(res.body).toEqual({
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Try again later.',
      })
      expect(res.body).not.toHaveProperty('user')
      expect(res.body).not.toHaveProperty('token')
    })

    it('tracks by email and IP combination', async () => {
      const email = uniqueEmail('ip-combo')
      const password = 'correctpassword'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Make 3 failed attempts with IP 127.0.0.1
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' })

        expect(res.status).toBe(401)
      }

      // 4th attempt with same email and IP should succeed (still under limit, at 4)
      const res4 = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(res4.status).toBe(401)

      // 5th attempt with same email and IP should be rate limited
      const res5 = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(res5.status).toBe(429)
    })

    it('uses case-insensitive email for rate limiting', async () => {
      const email = uniqueEmail('case-limit')
      const password = 'correctpassword'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Make attempts with different email cases
      for (let i = 0; i < 2; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: email.toLowerCase(), password: 'wrongpassword' })

        expect(res.status).toBe(401)
      }

      // Uppercase email should count toward same limit
      for (let i = 0; i < 2; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: email.toUpperCase(), password: 'wrongpassword' })

        expect(res.status).toBe(401)
      }

      // 5th attempt (mixed case) should be rate limited
      const res5 = await request(app)
        .post('/api/auth/login')
        .send({ email: email.slice(0, 5).toUpperCase() + email.slice(5), password: 'wrongpassword' })

      expect(res5.status).toBe(429)
    })

    it('counts validation errors toward rate limit', async () => {
      // Invalid email format should return 400 and count toward rate limit
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: 'notanemail', password: 'password123' })

        expect(res.status).toBe(400)
      }

      // 5th request should be rate limited
      const res5 = await request(app)
        .post('/api/auth/login')
        .send({ email: 'notanemail', password: 'password123' })

      expect(res5.status).toBe(429)
    })

    it('counts missing password toward rate limit', async () => {
      const email = uniqueEmail('no-password-limit')

      // Missing password should return 400 and count toward rate limit
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email })

        expect(res.status).toBe(400)
      }

      // 5th request should be rate limited
      const res5 = await request(app)
        .post('/api/auth/login')
        .send({ email })

      expect(res5.status).toBe(429)
    })
  })

  describe('POST /api/auth/forgot-password - Rate limiting', () => {
    it('allows multiple forgot-password requests without rate limit', async () => {
      const email = uniqueEmail('forgot-success')

      const account = await accountRepo.create(email, 'player')

      // Should allow multiple requests for different emails
      const emails = [
        email,
        uniqueEmail('forgot-success-2'),
        uniqueEmail('forgot-success-3'),
      ]

      for (let i = 1; i < emails.length; i++) {
        const e = emails[i]
        await accountRepo.create(e, 'player')
      }

      for (const e of emails) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email: e })

        expect(res.status).toBe(202)
      }
    })

    it('returns 429 after 5 forgot-password requests for same email', async () => {
      const email = uniqueEmail('forgot-limit')

      const account = await accountRepo.create(email, 'player')

      // Make 4 requests (under limit)
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email })

        expect(res.status).toBe(202)
      }

      // 5th request should be rate limited
      const res5 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res5.status).toBe(429)
      expect(res5.body.code).toBe('RATE_LIMITED')
    })

    it('returns 429 with correct error schema when rate limited', async () => {
      const email = uniqueEmail('forgot-schema')

      const account = await accountRepo.create(email, 'player')

      // Exceed rate limit
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/forgot-password')
          .send({ email })
      }

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(429)
      expect(res.body).toEqual({
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Try again later.',
      })
    })

    it('tracks by email only (not IP)', async () => {
      const email = uniqueEmail('forgot-email-only')

      const account = await accountRepo.create(email, 'player')

      // Make 4 requests
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email })

        expect(res.status).toBe(202)
      }

      // 5th request should be rate limited regardless of IP
      const res5 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res5.status).toBe(429)
    })

    it('uses case-insensitive email for rate limiting', async () => {
      const email = uniqueEmail('forgot-case')

      const account = await accountRepo.create(email, 'player')

      // Make requests with different email cases
      for (let i = 0; i < 2; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email: email.toLowerCase() })

        expect(res.status).toBe(202)
      }

      // Uppercase email should count toward same limit
      for (let i = 0; i < 2; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email: email.toUpperCase() })

        expect(res.status).toBe(202)
      }

      // 5th request (mixed case) should be rate limited
      const res5 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email.slice(0, 5).toUpperCase() + email.slice(5) })

      expect(res5.status).toBe(429)
    })

    it('rate limits validation errors on email format', async () => {
      // Invalid email format should return 400 and count toward rate limit
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email: 'notanemail' })

        expect(res.status).toBe(400)
      }

      // 5th request should be rate limited
      const res5 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'notanemail' })

      expect(res5.status).toBe(429)
    })

    it('allows requests for non-existent emails without revealing enumeration', async () => {
      const email = uniqueEmail('nonexistent')

      // Make 4 requests for non-existent email
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email })

        expect(res.status).toBe(202) // Still 202 to not reveal if email exists
      }

      // 5th request should be rate limited
      const res5 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res5.status).toBe(429)
    })

    it('does not allow bypass with email case manipulation', async () => {
      const email = uniqueEmail('forgot-bypass')

      const account = await accountRepo.create(email, 'player')

      // Make 4 requests to reach limit (using various case combinations)
      // All should count toward the same limit since emails are normalized to lowercase
      const res1 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email.toLowerCase() })
      expect(res1.status).toBe(202)

      const res2 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email.toUpperCase() })
      expect(res2.status).toBe(202)

      const res3 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email })
      expect(res3.status).toBe(202)

      const res4 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email.charAt(0).toUpperCase() + email.slice(1).toLowerCase() })
      expect(res4.status).toBe(202)

      // 5th request with any case variation should be rate limited
      const resBlocked = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email.toUpperCase() })

      expect(resBlocked.status).toBe(429)
    })
  })

  describe('Rate limit window expiration', () => {
    it('resets counter after time window expires for login', async () => {
      const email = uniqueEmail('window-reset')
      const password = 'correctpassword'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Make 4 failed attempts
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' })

        expect(res.status).toBe(401)
      }

      // Should be rate limited now on 5th attempt
      let res5 = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(res5.status).toBe(429)

      // Clear the store to simulate window expiration
      clearRateLimitStore()

      // Now should be able to make requests again
      res5 = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(res5.status).toBe(401) // Back to regular error
    })

    it('resets counter after time window expires for forgot-password', async () => {
      const email = uniqueEmail('forgot-window-reset')

      const account = await accountRepo.create(email, 'player')

      // Make 4 requests (under limit)
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email })

        expect(res.status).toBe(202)
      }

      // Should be rate limited now
      let res6 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res6.status).toBe(429)

      // Clear the store to simulate window expiration
      clearRateLimitStore()

      // Now should be able to make requests again
      res6 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res6.status).toBe(202)
    })
  })

  describe('Different emails are rate limited separately', () => {
    it('login rate limiting is separate per email', async () => {
      const email1 = uniqueEmail('separate-1')
      const email2 = uniqueEmail('separate-2')
      const password = 'correctpassword'

      const account1 = await accountRepo.create(email1, 'player')
      const account2 = await accountRepo.create(email2, 'player')

      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account1.id, passwordHash)
      await accountRepo.updatePasswordHash(account2.id, passwordHash)

      // Make 4 failed attempts for email1 (under limit)
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: email1, password: 'wrongpassword' })

        expect(res.status).toBe(401)
      }

      // 5th attempt should be rate limited
      let res = await request(app)
        .post('/api/auth/login')
        .send({ email: email1, password: 'wrongpassword' })

      expect(res.status).toBe(429)

      // But email2 should not be rate limited
      res = await request(app)
        .post('/api/auth/login')
        .send({ email: email2, password: 'wrongpassword' })

      expect(res.status).toBe(401)
    })

    it('forgot-password rate limiting is separate per email', async () => {
      const email1 = uniqueEmail('forgot-sep-1')
      const email2 = uniqueEmail('forgot-sep-2')

      const account1 = await accountRepo.create(email1, 'player')
      const account2 = await accountRepo.create(email2, 'player')

      // Make 4 requests for email1 (under limit)
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/forgot-password')
          .send({ email: email1 })

        expect(res.status).toBe(202)
      }

      // 5th request should be rate limited
      let res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email1 })

      expect(res.status).toBe(429)

      // But email2 should not be rate limited
      res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email2 })

      expect(res.status).toBe(202)
    })
  })
})
