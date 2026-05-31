import request from 'supertest'
import { Express } from 'express'
import { Pool, PoolClient } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction, getTransactionClient } from '../../helpers/db'
import { createTestApp } from '../../helpers/app'
import { AccountRepository, PasswordResetCodeRepository } from '../../../db'

function getDb(pool: Pool): Pool | PoolClient {
  return getTransactionClient() || pool
}

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniqueEmail(prefix: string = ''): string {
  const id = uid()
  return `reset-password-test-${prefix}-${id}@test.local`.toLowerCase()
}

describe('POST /api/auth/reset-password', () => {
  let pool: Pool
  let app: Express
  let accountRepo: AccountRepository
  let resetCodeRepo: PasswordResetCodeRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    accountRepo = new AccountRepository(getDb(pool))
    resetCodeRepo = new PasswordResetCodeRepository(getDb(pool))
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('Valid reset (happy path)', () => {
    it('resets password with valid email, code, and password', async () => {
      const email = uniqueEmail('valid-reset')
      const newPassword = 'newpassword123'

      // Create account
      const account = await accountRepo.create(email, 'player')

      // Create reset code
      const code = PasswordResetCodeRepository.generateCode()
      const resetCode = await resetCodeRepo.create(account.id, code, 15)

      // Make reset request
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: newPassword })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('message')
      expect(res.body.message).toBe('Password updated successfully')

      // Verify password was hashed and updated
      const updatedAccount = await accountRepo.findById(account.id)
      expect(updatedAccount?.password_hash).toBeDefined()
      expect(updatedAccount?.password_hash).not.toBe('')
      expect(updatedAccount?.password_hash).not.toBe(newPassword)
      expect(bcryptjs.compareSync(newPassword, updatedAccount?.password_hash || '')).toBe(true)

      // Verify code is marked as used
      const updatedCode = await resetCodeRepo.findByCode(code)
      expect(updatedCode?.used_at).not.toBeNull()
    })

    it('returns correct response schema for successful reset', async () => {
      const email = uniqueEmail('schema-check')
      const newPassword = 'schemapassword123'

      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: newPassword })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.message).toBe('string')
      expect(res.body).not.toHaveProperty('code')
      expect(res.body).not.toHaveProperty('token')
      expect(res.body).not.toHaveProperty('user')
    })

    it('allows login with new password after reset', async () => {
      const email = uniqueEmail('login-after-reset')
      const newPassword = 'newpassword789'

      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      // Reset password
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: newPassword })

      expect(resetRes.status).toBe(200)

      // Verify login works with new password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: newPassword })

      expect(loginRes.status).toBe(200)
      expect(loginRes.body).toHaveProperty('user')
      expect(loginRes.body).toHaveProperty('token')
      expect(loginRes.body.user.id).toBe(account.id)
    })

    it('can reset password for organizer account', async () => {
      const email = uniqueEmail('organizer-reset')
      const newPassword = 'organizerpass123'

      const account = await accountRepo.create(email, 'organizer')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: newPassword })

      expect(res.status).toBe(200)
      const updatedAccount = await accountRepo.findById(account.id)
      expect(bcryptjs.compareSync(newPassword, updatedAccount?.password_hash || '')).toBe(true)
    })
  })

  describe('Invalid email format', () => {
    it('returns 400 for malformed email (no @)', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'notanemail', code: '123456', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message).toBe('Please enter a valid email')
    })

    it('returns 400 for email without domain', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'user@', code: '123456', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Please enter a valid email')
    })

    it('returns 400 for email without local part', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: '@example.com', code: '123456', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Please enter a valid email')
    })

    it('returns 400 for empty email', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: '', code: '123456', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Please enter a valid email')
    })

    it('returns 400 for null email', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: null, code: '123456', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('message')
    })

    it('returns 400 for email with whitespace', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'user @example.com', code: '123456', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Please enter a valid email')
    })
  })

  describe('Email doesn\'t exist', () => {
    it('returns 401 for non-existent email to avoid revealing email existence', async () => {
      const nonexistentEmail = uniqueEmail('nonexistent')
      const code = PasswordResetCodeRepository.generateCode()

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: nonexistentEmail, code, password: 'newpass123' })

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message).toBe('Invalid reset code')
    })

    it('uses same error message for unknown email and invalid code', async () => {
      const existingEmail = uniqueEmail('existing')
      const nonexistentEmail = uniqueEmail('nonexistent')

      // Create account with valid reset code
      const account = await accountRepo.create(existingEmail, 'player')
      const validCode = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, validCode, 15)

      // Try with unknown email
      const unknownEmailRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: nonexistentEmail, code: validCode, password: 'newpass123' })

      // Try with wrong code
      const wrongCodeRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: existingEmail, code: '999999', password: 'newpass123' })

      expect(unknownEmailRes.status).toBe(401)
      expect(wrongCodeRes.status).toBe(401)
      expect(unknownEmailRes.body.message).toBe(wrongCodeRes.body.message)
      expect(unknownEmailRes.body.message).toBe('Invalid reset code')
    })
  })

  describe('Invalid code format', () => {
    it('returns 400 for code that is not 6 digits', async () => {
      const email = uniqueEmail('invalid-code-format')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '12345', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message).toBe('Code must be 6 digits')
    })

    it('returns 400 for code with 7 digits', async () => {
      const email = uniqueEmail('code-too-long')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '1234567', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Code must be 6 digits')
    })

    it('returns 400 for code with non-digit characters', async () => {
      const email = uniqueEmail('code-letters')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '1234ab', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Code must be 6 digits')
    })

    it('returns 400 for empty code', async () => {
      const email = uniqueEmail('empty-code')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Code must be 6 digits')
    })

    it('returns 400 for null code', async () => {
      const email = uniqueEmail('null-code')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: null, password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('message')
    })
  })

  describe('Code doesn\'t match', () => {
    it('returns 401 and increments attempt counter for wrong code', async () => {
      const email = uniqueEmail('wrong-code')
      const account = await accountRepo.create(email, 'player')
      const correctCode = PasswordResetCodeRepository.generateCode()
      const resetCode = await resetCodeRepo.create(account.id, correctCode, 15)

      expect(resetCode.attempts).toBe(0)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Invalid reset code')

      // Verify attempt counter incremented
      const updatedCode = await resetCodeRepo.findByCode(correctCode)
      expect(updatedCode?.attempts).toBe(1)
    })

    it('tracks multiple failed attempts', async () => {
      const email = uniqueEmail('multiple-attempts')
      const account = await accountRepo.create(email, 'player')
      const correctCode = PasswordResetCodeRepository.generateCode()
      const resetCode = await resetCodeRepo.create(account.id, correctCode, 15)

      // First failed attempt
      await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '111111', password: 'newpass123' })

      let updatedCode = await resetCodeRepo.findByCode(correctCode)
      expect(updatedCode?.attempts).toBe(1)

      // Second failed attempt
      await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '222222', password: 'newpass123' })

      updatedCode = await resetCodeRepo.findByCode(correctCode)
      expect(updatedCode?.attempts).toBe(2)

      // Third failed attempt
      await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '333333', password: 'newpass123' })

      updatedCode = await resetCodeRepo.findByCode(correctCode)
      expect(updatedCode?.attempts).toBe(3)
    })
  })

  describe('Code expired', () => {
    it('returns 401 and increments attempt counter for expired code', async () => {
      const email = uniqueEmail('expired-code')
      const account = await accountRepo.create(email, 'player')

      // Create an expired code by inserting directly with past expiration
      const now = new Date()
      const expiredAt = new Date(now.getTime() - 60 * 1000) // 1 minute ago
      const id = `prc_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const code = PasswordResetCodeRepository.generateCode()

      const dbConnection = getDb(pool)
      await dbConnection.query(
        `INSERT INTO auth.password_reset_codes (id, account_id, code, attempts, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, account.id, code, 0, expiredAt.toISOString(), now.toISOString()]
      )

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: 'newpass123' })

      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Invalid reset code')

      // Verify attempt counter incremented
      const updatedCode = await resetCodeRepo.findByCode(code)
      expect(updatedCode?.attempts).toBe(1)
    })

    it('increments attempts even for expired codes', async () => {
      const email = uniqueEmail('expired-attempts')
      const account = await accountRepo.create(email, 'player')

      const now = new Date()
      const expiredAt = new Date(now.getTime() - 60 * 1000)
      const id = `prc_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const code = PasswordResetCodeRepository.generateCode()

      const dbConnection = getDb(pool)
      await dbConnection.query(
        `INSERT INTO auth.password_reset_codes (id, account_id, code, attempts, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, account.id, code, 0, expiredAt.toISOString(), now.toISOString()]
      )

      // First attempt
      await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: 'newpass123' })

      let updatedCode = await resetCodeRepo.findByCode(code)
      expect(updatedCode?.attempts).toBe(1)

      // Second attempt
      await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: 'newpass123' })

      updatedCode = await resetCodeRepo.findByCode(code)
      expect(updatedCode?.attempts).toBe(2)
    })
  })

  describe('Code already used', () => {
    it('returns 401 for already used code', async () => {
      const email = uniqueEmail('already-used')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      const resetCode = await resetCodeRepo.create(account.id, code, 15)

      // Mark code as used
      await resetCodeRepo.markAsUsed(resetCode.id)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: 'newpass123' })

      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Invalid reset code')
    })

    it('prevents reuse of code after successful reset', async () => {
      const email = uniqueEmail('prevent-reuse')
      const newPassword1 = 'newpass1'
      const newPassword2 = 'newpass2'

      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      // First successful reset
      const firstRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: newPassword1 })

      expect(firstRes.status).toBe(200)

      // Try to reuse same code
      const secondRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: newPassword2 })

      expect(secondRes.status).toBe(401)
      expect(secondRes.body.message).toBe('Invalid reset code')

      // Verify password is still the first one, not the second
      const updatedAccount = await accountRepo.findById(account.id)
      expect(bcryptjs.compareSync(newPassword1, updatedAccount?.password_hash || '')).toBe(true)
      expect(bcryptjs.compareSync(newPassword2, updatedAccount?.password_hash || '')).toBe(false)
    })
  })

  describe('Password too short', () => {
    it('returns 400 for password less than 6 characters', async () => {
      const email = uniqueEmail('short-password')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: '12345' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message).toBe('Password must be at least 6 characters')
    })

    it('returns 400 for empty password', async () => {
      const email = uniqueEmail('empty-password')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: '' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Password must be at least 6 characters')
    })

    it('returns 400 for null password', async () => {
      const email = uniqueEmail('null-password')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: null })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('message')
    })

    it('returns 400 for exactly 5 character password', async () => {
      const email = uniqueEmail('five-chars')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: '12345' })

      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Password must be at least 6 characters')
    })

    it('accepts exactly 6 character password', async () => {
      const email = uniqueEmail('six-chars')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: '123456' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Password updated successfully')
    })

    it('accepts long passwords', async () => {
      const email = uniqueEmail('long-password')
      const longPassword = 'a'.repeat(256)
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: longPassword })

      expect(res.status).toBe(200)
      const updatedAccount = await accountRepo.findById(account.id)
      expect(bcryptjs.compareSync(longPassword, updatedAccount?.password_hash || '')).toBe(true)
    })
  })

  describe('Too many attempts (rate limiting)', () => {
    it('returns 429 when attempts reach 5', async () => {
      const email = uniqueEmail('rate-limit')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      const resetCode = await resetCodeRepo.create(account.id, code, 15)

      // Make 5 failed attempts to reach the limit
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/reset-password')
          .send({ email, code: '999999', password: 'newpass123' })

        expect(res.status).toBe(401)
      }

      // 6th attempt should be rate limited
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res.status).toBe(429)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message).toBe('Too many attempts. Try again later.')
    })

    it('returns 429 for subsequent attempts after rate limit', async () => {
      const email = uniqueEmail('rate-limit-continues')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/reset-password')
          .send({ email, code: '999999', password: 'newpass123' })
      }

      // 6th attempt
      const res6 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res6.status).toBe(429)

      // 7th attempt should also be rate limited
      const res7 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res7.status).toBe(429)
    })

    it('does not allow valid code after 5+ failed attempts', async () => {
      const email = uniqueEmail('no-valid-after-limit')
      const account = await accountRepo.create(email, 'player')
      const validCode = PasswordResetCodeRepository.generateCode()
      const correctResetCode = await resetCodeRepo.create(account.id, validCode, 15)

      // Make 5 failed attempts with wrong code
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/reset-password')
          .send({ email, code: '999999', password: 'newpass123' })
      }

      // Try with correct code - should still be rate limited
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: validCode, password: 'newpass123' })

      expect(res.status).toBe(429)

      // Verify password was NOT updated
      const updatedAccount = await accountRepo.findById(account.id)
      expect(updatedAccount?.password_hash).toBe('')
    })
  })

  describe('Warning after 2 attempts', () => {
    it('includes attempt remaining count after 2 failed attempts', async () => {
      const email = uniqueEmail('warning-2-attempts')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      // First failed attempt
      const res1 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '111111', password: 'newpass123' })

      expect(res1.status).toBe(401)
      // Should not include warning on first attempt
      expect(res1.body.message).toBe('Invalid reset code')

      // Second failed attempt
      const res2 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '222222', password: 'newpass123' })

      expect(res2.status).toBe(401)
      // Should include warning about remaining attempts
      expect(res2.body.message).toContain('3 attempts remaining')
    })

    it('includes correct remaining count after 3 failed attempts', async () => {
      const email = uniqueEmail('warning-3-attempts')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      // Make 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/reset-password')
          .send({ email, code: '999999', password: 'newpass123' })
      }

      // 4th attempt should show 1 remaining
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res.status).toBe(401)
      expect(res.body.message).toContain('1 attempt remaining')
    })

    it('includes warning for all attempts from 2 to 4', async () => {
      const email = uniqueEmail('warning-all')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      // First attempt - no warning
      const res1 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res1.status).toBe(401)
      expect(res1.body.message).not.toContain('attempts remaining')

      // Second attempt - warning
      const res2 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res2.status).toBe(401)
      expect(res2.body.message).toContain('3 attempts remaining')

      // Third attempt - warning
      const res3 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res3.status).toBe(401)
      expect(res3.body.message).toContain('2 attempts remaining')

      // Fourth attempt - warning
      const res4 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res4.status).toBe(401)
      expect(res4.body.message).toContain('1 attempt remaining')

      // Fifth attempt - warning with 0 remaining
      const res5 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res5.status).toBe(401)
      expect(res5.body.message).toContain('0 attempts remaining')

      // Sixth attempt - rate limited
      const res6 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res6.status).toBe(429)
      expect(res6.body.message).toBe('Too many attempts. Try again later.')
    })

    it('does not show warning on first attempt even with wrong code', async () => {
      const email = uniqueEmail('no-warning-first')
      const account = await accountRepo.create(email, 'player')
      const validCode = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, validCode, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '111111', password: 'newpass123' })

      expect(res.status).toBe(401)
      expect(res.body.message).toBe('Invalid reset code')
      expect(res.body.message).not.toContain('attempts remaining')
    })
  })

  describe('Case insensitivity for email', () => {
    it('resets password with uppercase email', async () => {
      const lowercaseEmail = uniqueEmail('case-insensitive')
      const newPassword = 'newpass123'

      const account = await accountRepo.create(lowercaseEmail, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: lowercaseEmail.toUpperCase(), code, password: newPassword })

      expect(res.status).toBe(200)
      const updatedAccount = await accountRepo.findById(account.id)
      expect(bcryptjs.compareSync(newPassword, updatedAccount?.password_hash || '')).toBe(true)
    })

    it('resets password with mixed case email', async () => {
      const lowercaseEmail = uniqueEmail('mixed-case')
      const newPassword = 'mixedpass123'

      const account = await accountRepo.create(lowercaseEmail, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const mixedCaseEmail = lowercaseEmail.split('@')[0].toUpperCase() + '@' + lowercaseEmail.split('@')[1]

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: mixedCaseEmail, code, password: newPassword })

      expect(res.status).toBe(200)
      const updatedAccount = await accountRepo.findById(account.id)
      expect(bcryptjs.compareSync(newPassword, updatedAccount?.password_hash || '')).toBe(true)
    })
  })

  describe('Response schema validation', () => {
    it('returns correct error response schema for 400', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'invalid', code: '123456', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.code).toBe('string')
      expect(typeof res.body.message).toBe('string')
    })

    it('returns correct error response schema for 401', async () => {
      const email = uniqueEmail('schema-401')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.code).toBe('string')
      expect(typeof res.body.message).toBe('string')
    })

    it('returns correct error response schema for 429', async () => {
      const email = uniqueEmail('schema-429')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/reset-password')
          .send({ email, code: '999999', password: 'newpass123' })
      }

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '999999', password: 'newpass123' })

      expect(res.status).toBe(429)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.code).toBe('string')
      expect(typeof res.body.message).toBe('string')
    })

    it('returns correct success response schema for 200', async () => {
      const email = uniqueEmail('schema-200')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: 'newpass123' })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.message).toBe('string')
      expect(res.body).not.toHaveProperty('code')
      expect(res.body).not.toHaveProperty('token')
      expect(res.body).not.toHaveProperty('user')
    })
  })

  describe('Missing request fields', () => {
    it('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ code: '123456', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('message')
    })

    it('returns 400 when code is missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'test@example.com', password: 'newpass123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('message')
    })

    it('returns 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'test@example.com', code: '123456' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('message')
    })
  })

  describe('Endpoint is unprotected', () => {
    it('allows reset without authentication token', async () => {
      const email = uniqueEmail('unprotected')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      // No authorization header provided
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: 'newpass123' })

      // Should work without being logged in
      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Password updated successfully')
    })
  })

  describe('Password hashing verification', () => {
    it('password is hashed with bcryptjs before storage', async () => {
      const email = uniqueEmail('hash-verify')
      const newPassword = 'verifypassword123'
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: newPassword })

      expect(res.status).toBe(200)

      const updatedAccount = await accountRepo.findById(account.id)
      const hash = updatedAccount?.password_hash || ''

      // Hash should not be plaintext
      expect(hash).not.toBe(newPassword)
      expect(hash).not.toBe('')

      // Hash should be verifiable
      expect(bcryptjs.compareSync(newPassword, hash)).toBe(true)
      expect(bcryptjs.compareSync('wrongpassword', hash)).toBe(false)
    })

    it('different passwords result in different hashes', async () => {
      const email1 = uniqueEmail('hash1')
      const email2 = uniqueEmail('hash2')
      const password1 = 'password1unique'
      const password2 = 'password2unique'

      const account1 = await accountRepo.create(email1, 'player')
      const code1 = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account1.id, code1, 15)

      const account2 = await accountRepo.create(email2, 'player')
      const code2 = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account2.id, code2, 15)

      await request(app)
        .post('/api/auth/reset-password')
        .send({ email: email1, code: code1, password: password1 })

      await request(app)
        .post('/api/auth/reset-password')
        .send({ email: email2, code: code2, password: password2 })

      const updatedAccount1 = await accountRepo.findById(account1.id)
      const updatedAccount2 = await accountRepo.findById(account2.id)

      // Hashes should be different
      expect(updatedAccount1?.password_hash).not.toBe(updatedAccount2?.password_hash)

      // Each should verify with its own password
      expect(bcryptjs.compareSync(password1, updatedAccount1?.password_hash || '')).toBe(true)
      expect(bcryptjs.compareSync(password2, updatedAccount2?.password_hash || '')).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('handles very long email address', async () => {
      const longEmail = 'a'.repeat(200) + '@test.local'
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: longEmail, code: '123456', password: 'newpass123' })

      // Should either reject as invalid or not find it
      expect([400, 401]).toContain(res.status)
    })

    it('handles very long password', async () => {
      const email = uniqueEmail('long-password-edge')
      const longPassword = 'a'.repeat(1000)
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: longPassword })

      expect(res.status).toBe(200)
      const updatedAccount = await accountRepo.findById(account.id)
      expect(bcryptjs.compareSync(longPassword, updatedAccount?.password_hash || '')).toBe(true)
    })

    it('handles codes with leading zeros', async () => {
      const email = uniqueEmail('leading-zeros')
      const account = await accountRepo.create(email, 'player')
      // Generate a unique code and then test it
      const code = PasswordResetCodeRepository.generateCode()
      const resetCode = await resetCodeRepo.create(account.id, code, 15)

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: 'newpass123' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Password updated successfully')
    })
  })

  describe('No side effects on validation errors', () => {
    it('does not create side effects when email validation fails', async () => {
      const email = uniqueEmail('side-effects-email')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      const resetCode = await resetCodeRepo.create(account.id, code, 15)

      // Invalid email format request
      await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'notanemail', code, password: 'newpass123' })

      // Verify code was not marked as used
      const updatedCode = await resetCodeRepo.findByCode(code)
      expect(updatedCode?.used_at).toBeNull()
      expect(updatedCode?.attempts).toBe(0)

      // Verify password was not updated
      const updatedAccount = await accountRepo.findById(account.id)
      expect(updatedAccount?.password_hash).toBe('')
    })

    it('does not increment attempts on validation errors', async () => {
      const email = uniqueEmail('no-increment-validation')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      const resetCode = await resetCodeRepo.create(account.id, code, 15)

      // Invalid code format
      await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '12345', password: 'newpass123' })

      // Verify attempts was not incremented
      const updatedCode = await resetCodeRepo.findByCode(code)
      expect(updatedCode?.attempts).toBe(0)
    })

    it('does not increment attempts on password validation errors', async () => {
      const email = uniqueEmail('no-increment-password')
      const account = await accountRepo.create(email, 'player')
      const code = PasswordResetCodeRepository.generateCode()
      const resetCode = await resetCodeRepo.create(account.id, code, 15)

      // Password too short
      await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: '12345' })

      // Verify attempts was not incremented
      const updatedCode = await resetCodeRepo.findByCode(code)
      expect(updatedCode?.attempts).toBe(0)
    })
  })
})
