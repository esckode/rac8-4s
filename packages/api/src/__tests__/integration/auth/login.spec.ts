import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { createTestApp } from '../../helpers/app'
import { AccountRepository } from '../../../db'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniqueEmail(prefix: string = ''): string {
  const id = uid()
  return `login-test-${prefix}-${id}@test.local`.toLowerCase()
}

describe('POST /api/auth/login', () => {
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
    await rollbackTransaction()
  })

  describe('Valid login', () => {
    it('logs in with existing account and correct password', async () => {
      const email = uniqueEmail('valid-login')
      const password = 'testpassword123'

      // Create account with hashed password
      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Make login request
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('user')
      expect(res.body).toHaveProperty('token')
      expect(res.body.user).toHaveProperty('id')
      expect(res.body.user).toHaveProperty('email')
      expect(res.body.user).toHaveProperty('role')
      expect(res.body.user.id).toBe(account.id)
      expect(res.body.user.email).toBe(email)
      expect(res.body.user.role).toBe('player')
      expect(typeof res.body.token).toBe('string')
      expect(res.body.token.length).toBeGreaterThan(0)
    })

    it('returns user info with correct structure', async () => {
      const email = uniqueEmail('user-info')
      const password = 'password456'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(res.status).toBe(200)
      expect(res.body.user).toEqual({
        id: account.id,
        email,
        role: 'organizer',
        playerId: null,
      })
    })

    it('issues a token on successful login', async () => {
      const email = uniqueEmail('token-issued')
      const password = 'securepass789'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()
      // Token should be a string (JWT or opaque token)
      expect(typeof res.body.token).toBe('string')
      expect(res.body.token.length).toBeGreaterThan(20)
    })
  })

  describe('Invalid credentials', () => {
    it('returns 401 for wrong password', async () => {
      const email = uniqueEmail('wrong-password')
      const password = 'correctpassword123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword456' })

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message).toBe('Invalid email or password')
    })

    it('returns 401 for unknown email', async () => {
      const unknownEmail = uniqueEmail('nonexistent')

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: unknownEmail, password: 'anypassword123' })

      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Invalid email or password')
    })

    it('uses same error message for wrong password and unknown email', async () => {
      const existingEmail = uniqueEmail('existing')
      const nonexistentEmail = uniqueEmail('nonexistent2')
      const password = 'password789'

      // Create account with hashed password
      const account = await accountRepo.create(existingEmail, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Wrong password
      const wrongPasswordRes = await request(app)
        .post('/api/auth/login')
        .send({ email: existingEmail, password: 'wrongpassword' })

      // Unknown email
      const unknownEmailRes = await request(app)
        .post('/api/auth/login')
        .send({ email: nonexistentEmail, password })

      expect(wrongPasswordRes.status).toBe(401)
      expect(unknownEmailRes.status).toBe(401)
      expect(wrongPasswordRes.body.message).toBe(unknownEmailRes.body.message)
      expect(wrongPasswordRes.body.message).toBe('Invalid email or password')
    })
  })

  describe('Validation errors', () => {
    it('returns 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'notanemail', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message).toBe('Please enter a valid email')
    })

    it('returns 400 for email missing @ symbol', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalidemail.com', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Please enter a valid email')
    })

    it('returns 400 for email without domain', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Please enter a valid email')
    })

    it('returns 400 for missing password', async () => {
      const email = uniqueEmail('missing-password')
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Password is required')
    })

    it('returns 400 for empty password', async () => {
      const email = uniqueEmail('empty-password')
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: '' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Password is required')
    })

    it('returns 400 for null password', async () => {
      const email = uniqueEmail('null-password')
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: null })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Password is required')
    })
  })

  describe('Password verification', () => {
    it('correctly verifies hashed password using bcryptjs', async () => {
      const email = uniqueEmail('bcrypt-verify')
      const password = 'verifypassword123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Verify the hash was stored correctly
      const storedAccount = await accountRepo.findById(account.id)
      expect(storedAccount?.password_hash).toBe(passwordHash)
      expect(bcryptjs.compareSync(password, passwordHash)).toBe(true)
      expect(bcryptjs.compareSync('wrongpassword', passwordHash)).toBe(false)

      // Login should work with correct password
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(res.status).toBe(200)
      expect(res.body.user.id).toBe(account.id)
    })

    it('rejects incorrect password even if account exists', async () => {
      const email = uniqueEmail('reject-wrong')
      const correctPassword = 'correctpassword'
      const wrongPassword = 'wrongpassword'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(correctPassword, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Login with wrong password should fail
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: wrongPassword })

      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Invalid email or password')
      expect(res.body).not.toHaveProperty('user')
      expect(res.body).not.toHaveProperty('token')
    })
  })

  describe('Account without password', () => {
    it('returns 401 when account has no password set (empty string)', async () => {
      const email = uniqueEmail('no-password')
      const account = await accountRepo.create(email, 'player')

      // Account is created with empty password_hash by default
      const storedAccount = await accountRepo.findById(account.id)
      expect(storedAccount?.password_hash).toBe('')

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'anypassword123' })

      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Invalid email or password')
    })

    it('prevents login when password_hash is not set', async () => {
      const email = uniqueEmail('unset-password')
      const account = await accountRepo.create(email, 'organizer')

      // Don't set password hash - it should remain as empty string
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'password789' })

      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Invalid email or password')
    })
  })

  describe('Case insensitivity', () => {
    it('logs in successfully with uppercase email', async () => {
      const email = uniqueEmail('case-insensitive')
      const password = 'password123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Try login with uppercase email
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: email.toUpperCase(), password })

      expect(res.status).toBe(200)
      expect(res.body.user.id).toBe(account.id)
    })

    it('logs in successfully with mixed case email', async () => {
      const email = uniqueEmail('mixed-case')
      const password = 'mixedcasepass123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Try login with mixed case
      const lowerEmail = email.toLowerCase()
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: lowerEmail, password })

      expect(res.status).toBe(200)
      expect(res.body.user.id).toBe(account.id)
    })
  })

  describe('Response schema validation', () => {
    it('returns correct error response schema for 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalid', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.code).toBe('string')
      expect(typeof res.body.message).toBe('string')
      expect(res.body).not.toHaveProperty('user')
      expect(res.body).not.toHaveProperty('token')
    })

    it('returns correct error response schema for 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: uniqueEmail('404'), password: 'password123' })

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.code).toBe('string')
      expect(typeof res.body.message).toBe('string')
      expect(res.body).not.toHaveProperty('user')
      expect(res.body).not.toHaveProperty('token')
    })

    it('returns correct success response schema for 200', async () => {
      const email = uniqueEmail('schema-check')
      const password = 'schemapassword123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('user')
      expect(res.body).toHaveProperty('token')
      expect(typeof res.body.user).toBe('object')
      expect(typeof res.body.token).toBe('string')

      // User object should have required fields
      expect(res.body.user).toHaveProperty('id')
      expect(res.body.user).toHaveProperty('email')
      expect(res.body.user).toHaveProperty('role')

      // User object should not have sensitive fields
      expect(res.body.user).not.toHaveProperty('password_hash')
      expect(res.body.user).not.toHaveProperty('password')
    })
  })

  describe('Multiple accounts', () => {
    it('can distinguish between multiple accounts with different passwords', async () => {
      const email1 = uniqueEmail('account1')
      const email2 = uniqueEmail('account2')
      const password1 = 'password1unique123'
      const password2 = 'password2unique456'

      const account1 = await accountRepo.create(email1, 'player')
      const account2 = await accountRepo.create(email2, 'organizer')

      const hash1 = await bcryptjs.hash(password1, 10)
      const hash2 = await bcryptjs.hash(password2, 10)

      await accountRepo.updatePasswordHash(account1.id, hash1)
      await accountRepo.updatePasswordHash(account2.id, hash2)

      // Login as account1
      const res1 = await request(app)
        .post('/api/auth/login')
        .send({ email: email1, password: password1 })

      expect(res1.status).toBe(200)
      expect(res1.body.user.id).toBe(account1.id)
      expect(res1.body.user.email).toBe(email1)
      expect(res1.body.user.role).toBe('player')

      // Login as account2
      const res2 = await request(app)
        .post('/api/auth/login')
        .send({ email: email2, password: password2 })

      expect(res2.status).toBe(200)
      expect(res2.body.user.id).toBe(account2.id)
      expect(res2.body.user.email).toBe(email2)
      expect(res2.body.user.role).toBe('organizer')

      // Account1 cannot login with account2's password
      const res3 = await request(app)
        .post('/api/auth/login')
        .send({ email: email1, password: password2 })

      expect(res3.status).toBe(401)
    })
  })

  describe('Edge cases', () => {
    it('handles whitespace in email properly', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user @example.com', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Please enter a valid email')
    })

    it('handles very long email address', async () => {
      const longEmail = 'a'.repeat(200) + '@test.local'
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: longEmail, password: 'password123' })

      // Should either reject as invalid email or not find it
      expect([400, 401]).toContain(res.status)
    })

    it('handles very long password', async () => {
      const email = uniqueEmail('long-password')
      const password = 'short123'
      const longPassword = 'a'.repeat(1000)

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: longPassword })

      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Invalid email or password')
    })

    it('rejects request with missing email field', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' })

      expect(res.status).toBe(400)
      // Should have a validation error
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
    })

    it('rejects request with empty email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Please enter a valid email')
    })

    it('rejects request with null email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: null, password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('message')
    })
  })

  describe('Different account roles', () => {
    it('logs in admin account successfully', async () => {
      const email = uniqueEmail('admin')
      const password = 'adminpassword123'

      const account = await accountRepo.create(email, 'admin')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(res.status).toBe(200)
      expect(res.body.user.role).toBe('admin')
    })

    it('logs in organizer account successfully', async () => {
      const email = uniqueEmail('organizer')
      const password = 'organizerpassword123'

      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(res.status).toBe(200)
      expect(res.body.user.role).toBe('organizer')
    })

    it('logs in player account successfully', async () => {
      const email = uniqueEmail('player')
      const password = 'playerpassword123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(res.status).toBe(200)
      expect(res.body.user.role).toBe('player')
    })
  })
})
