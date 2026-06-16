import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { createTestApp } from '../../helpers/app'
import { AccountRepository, PasswordResetCodeRepository } from '../../../db'


function uniqueEmail(prefix: string = ''): string {
  const id = crypto.randomUUID().slice(0, 8)
  return `forgot-password-${prefix}-${id}@test.local`.toLowerCase()
}

describe('POST /api/auth/forgot-password', () => {
  let pool: Pool
  let app: Express
  let emailAdapter: any
  let accountRepo: AccountRepository
  let resetCodeRepo: PasswordResetCodeRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    emailAdapter = deps.emailAdapter
    accountRepo = new AccountRepository(pool)
    resetCodeRepo = new PasswordResetCodeRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('Valid email (account exists)', () => {
    it('returns 202 response when email has existing account', async () => {
      const email = uniqueEmail('existing')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.message).toBe('string')
    })

    it('creates a password reset code in database', async () => {
      const email = uniqueEmail('db-create')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      // Verify code was created in database
      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode).toBeDefined()
      expect(resetCode?.account_id).toBe(account.id)
    })

    it('reset code has 15 minute expiration', async () => {
      const email = uniqueEmail('expiration')
      const account = await accountRepo.create(email, 'player')
      const beforeTime = new Date()

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      // Verify expiration is approximately 15 minutes
      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode).toBeDefined()

      const expiresAt = new Date(resetCode!.expires_at)
      const createdAt = new Date(resetCode!.created_at)
      const diffMs = expiresAt.getTime() - createdAt.getTime()
      const fifteenMinutesMs = 15 * 60 * 1000

      // Should be within 2 seconds of 15 minutes
      expect(diffMs).toBeGreaterThanOrEqual(fifteenMinutesMs - 2000)
      expect(diffMs).toBeLessThanOrEqual(fifteenMinutesMs + 2000)
    })

    it('reset code is 6 random digits', async () => {
      const email = uniqueEmail('code-format')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      // Verify code format
      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode).toBeDefined()
      expect(resetCode!.code).toMatch(/^\d{6}$/)
      expect(resetCode!.code).toHaveLength(6)
    })

    it('reset code has 0 attempts initially', async () => {
      const email = uniqueEmail('zero-attempts')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      // Verify attempts counter
      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode).toBeDefined()
      expect(resetCode!.attempts).toBe(0)
    })

    it('reset code is not marked as used initially', async () => {
      const email = uniqueEmail('not-used')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      // Verify used_at is null
      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode).toBeDefined()
      expect(resetCode!.used_at).toBeNull()
    })
  })

  describe('Unknown email (security)', () => {
    it('returns 202 for valid email format without account (security)', async () => {
      const unknownEmail = uniqueEmail('nonexistent')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: unknownEmail })

      // Must return 202 for security - don't reveal if email exists
      expect(res.status).toBe(202)
      expect(res.body).toHaveProperty('message')
    })

    it('uses same response status for existing and non-existing emails', async () => {
      const existingEmail = uniqueEmail('existing-for-compare')
      const unknownEmail = uniqueEmail('nonexistent-for-compare')

      // Create account for existing email
      await accountRepo.create(existingEmail, 'player')

      const existingRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: existingEmail })

      const unknownRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: unknownEmail })

      // Both should return 202 (security)
      expect(existingRes.status).toBe(202)
      expect(unknownRes.status).toBe(202)
    })

    it('does not create reset code for non-existent email', async () => {
      const unknownEmail = uniqueEmail('no-code-created')

      // Get initial count of reset codes
      const client = pool as any
      const countBefore = await client.query(
        'SELECT COUNT(*) as count FROM auth.password_reset_codes'
      )
      const beforeCount = parseInt(countBefore.rows[0].count, 10)

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: unknownEmail })

      expect(res.status).toBe(202)

      // Verify no new reset code was created
      const countAfter = await client.query(
        'SELECT COUNT(*) as count FROM auth.password_reset_codes'
      )
      const afterCount = parseInt(countAfter.rows[0].count, 10)
      expect(afterCount).toBe(beforeCount)
    })
  })

  describe('Invalid email format', () => {
    it('returns 400 for email without @', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'notanemail.local' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message.toLowerCase()).toMatch(/valid.*email|email.*format|invalid/)
    })

    it('returns 400 for email without domain', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
    })

    it('returns 400 for email with space', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user @example.com' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
    })

    it('returns 400 for empty email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: '' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
    })

    it('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
    })

    it('returns 400 for email with multiple @', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@@example.com' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
    })
  })

  describe('Reset code properties', () => {
    it('code is exactly 6 digits', async () => {
      const email = uniqueEmail('code-digits')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode!.code).toMatch(/^\d{6}$/)
      expect(resetCode!.code.length).toBe(6)
    })

    it('code only contains numeric characters', async () => {
      const email = uniqueEmail('code-numeric')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      const code = resetCode!.code
      expect(/^[0-9]+$/.test(code)).toBe(true)
    })

    it('expiration is approximately 15 minutes from creation', async () => {
      const email = uniqueEmail('exp-15min')
      const account = await accountRepo.create(email, 'player')
      const beforeTime = Date.now()

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      const expiresAt = new Date(resetCode!.expires_at).getTime()
      const createdAt = new Date(resetCode!.created_at).getTime()
      const expectedExpiration = 15 * 60 * 1000 // 15 minutes in milliseconds

      // Check expiration is within 2 seconds of expected
      const actualExpiration = expiresAt - createdAt
      expect(actualExpiration).toBeGreaterThanOrEqual(expectedExpiration - 2000)
      expect(actualExpiration).toBeLessThanOrEqual(expectedExpiration + 2000)
    })

    it('attempts counter starts at 0', async () => {
      const email = uniqueEmail('attempts-0')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode!.attempts).toBe(0)
    })

    it('created_at is set to current time', async () => {
      const email = uniqueEmail('created-at')
      const account = await accountRepo.create(email, 'player')
      const beforeTime = Date.now()

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      const createdAt = new Date(resetCode!.created_at).getTime()

      // Should be within 5 seconds of current time
      expect(createdAt).toBeGreaterThanOrEqual(beforeTime - 1000)
      expect(createdAt).toBeLessThanOrEqual(Date.now() + 1000)
    })
  })

  describe('Response schema compliance', () => {
    it('returns correct schema for 202 success response', async () => {
      const email = uniqueEmail('schema-202')
      await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)
      expect(res.body).toEqual(
        expect.objectContaining({
          message: expect.any(String),
        })
      )
    })

    it('202 response message is a non-empty string', async () => {
      const email = uniqueEmail('msg-nonempty')
      await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)
      expect(res.body.message).toBeDefined()
      expect(typeof res.body.message).toBe('string')
      expect(res.body.message.length).toBeGreaterThan(0)
    })

    it('returns correct schema for 400 validation error', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'notanemail' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        })
      )
    })

    it('400 error has non-empty code and message', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
      expect(typeof res.body.code).toBe('string')
      expect(res.body.code.length).toBeGreaterThan(0)
      expect(res.body.message).toBeDefined()
      expect(typeof res.body.message).toBe('string')
      expect(res.body.message.length).toBeGreaterThan(0)
    })
  })

  describe('Multiple reset code requests', () => {
    it('can request multiple reset codes for same account', async () => {
      const email = uniqueEmail('multiple')
      const account = await accountRepo.create(email, 'player')

      const res1 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res1.status).toBe(202)

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10))

      const res2 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res2.status).toBe(202)

      // Both should succeed
      const code1 = await resetCodeRepo.findByCode('000000') // This won't match but tests the lookup
      // Instead verify by account
      const latestCode = await resetCodeRepo.findByAccountId(account.id)
      expect(latestCode).toBeDefined()
    })

    it('subsequent reset code requests generate different codes', async () => {
      const email = uniqueEmail('different-codes')
      const account = await accountRepo.create(email, 'player')

      const res1 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res1.status).toBe(202)

      const code1 = await resetCodeRepo.findByAccountId(account.id)

      // Wait a bit and request again
      await new Promise(resolve => setTimeout(resolve, 50))

      const res2 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res2.status).toBe(202)

      const code2 = await resetCodeRepo.findByAccountId(account.id)

      // Codes should be different (with high probability for random 6-digit codes)
      expect(code1!.code).not.toBe(code2!.code)
    })
  })

  describe('Edge cases and isolation', () => {
    it('handles uppercase email by normalizing to lowercase', async () => {
      const emailLower = uniqueEmail('upper-case')
      const emailUpper = emailLower.toUpperCase()
      const account = await accountRepo.create(emailLower, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: emailUpper })

      expect(res.status).toBe(202)

      // Verify reset code was created for the account
      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode).toBeDefined()
    })

    it('handles email with whitespace by trimming or rejecting', async () => {
      const baseEmail = uniqueEmail('whitespace')
      const trimmedEmail = baseEmail.trim()
      const account = await accountRepo.create(trimmedEmail, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: ' ' + trimmedEmail + ' ' })

      // Should either trim and succeed (202) or validate and fail (400)
      // Most systems trim, so expect 202
      if (res.status === 202) {
        const resetCode = await resetCodeRepo.findByAccountId(account.id)
        expect(resetCode).toBeDefined()
      } else {
        expect(res.status).toBe(400)
      }
    })

    it('different accounts can request reset codes independently', async () => {
      const email1 = uniqueEmail('indep1')
      const email2 = uniqueEmail('indep2')
      const account1 = await accountRepo.create(email1, 'player')
      const account2 = await accountRepo.create(email2, 'organizer')

      const res1 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email1 })

      const res2 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: email2 })

      expect(res1.status).toBe(202)
      expect(res2.status).toBe(202)

      const code1 = await resetCodeRepo.findByAccountId(account1.id)
      const code2 = await resetCodeRepo.findByAccountId(account2.id)

      expect(code1).toBeDefined()
      expect(code2).toBeDefined()
      expect(code1!.code).not.toBe(code2!.code)
      expect(code1!.account_id).toBe(account1.id)
      expect(code2!.account_id).toBe(account2.id)
    })

    it('reset code is associated with correct account', async () => {
      const email = uniqueEmail('correct-account')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode).toBeDefined()
      expect(resetCode!.account_id).toBe(account.id)
    })
  })

  describe('Unprotected endpoint', () => {
    it('does not require authentication', async () => {
      const email = uniqueEmail('no-auth')
      await accountRepo.create(email, 'player')

      // No Authorization header
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      // Should succeed (202) without authentication
      expect(res.status).toBe(202)
    })

    it('accepts requests without bearer token', async () => {
      const email = uniqueEmail('no-token')
      await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .set('Authorization', '')
        .send({ email })

      expect(res.status).toBe(202)
    })
  })

  describe('Email sending integration', () => {
    beforeEach(() => {
      // Clear sent emails before each test
      emailAdapter.clear()
    })

    it('sends password reset email when account exists', async () => {
      const email = uniqueEmail('email-send')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      // Verify email was sent via adapter
      const sentEmails = emailAdapter.getSentTo(email)
      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0].subject).toBe('Reset Your Password')
    })

    it('email includes formatted reset code as "XX XX XX"', async () => {
      const email = uniqueEmail('email-code-format')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const sentEmails = emailAdapter.getSentTo(email)
      expect(sentEmails).toHaveLength(1)

      const emailBody = sentEmails[0].body
      // Verify code is formatted as "XX XX XX" (regex matches 2 digits space 2 digits space 2 digits)
      expect(emailBody).toMatch(/\b\d{2}\s\d{2}\s\d{2}\b/)
    })

    it('email includes reset link with code parameter', async () => {
      const email = uniqueEmail('email-link')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const sentEmails = emailAdapter.getSentTo(email)
      const emailBody = sentEmails[0].body

      expect(emailBody).toContain('/reset-password')
      expect(emailBody).toContain(`email=${encodeURIComponent(email)}`)
      expect(emailBody).toContain('code=')
    })

    it('email includes 15-minute expiration notice', async () => {
      const email = uniqueEmail('email-expiration')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const sentEmails = emailAdapter.getSentTo(email)
      const emailBody = sentEmails[0].body

      expect(emailBody).toContain('15 minutes')
      expect(emailBody).toContain('expires')
    })

    it('email includes security note about ignoring', async () => {
      const email = uniqueEmail('email-security')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const sentEmails = emailAdapter.getSentTo(email)
      const emailBody = sentEmails[0].body

      expect(emailBody).toMatch(/[Dd]idn't\s+request/i)
      expect(emailBody).toMatch(/[Ii]gnore\s+this\s+email/i)
    })

    it('does not send email for non-existent account', async () => {
      const unknownEmail = uniqueEmail('nonexistent-no-email')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: unknownEmail })

      expect(res.status).toBe(202)

      // No email should be sent for non-existent account
      const sentEmails = emailAdapter.getSentTo(unknownEmail)
      expect(sentEmails).toHaveLength(0)
    })

    it('sends email with HTML content type formatting', async () => {
      const email = uniqueEmail('email-html')
      const account = await accountRepo.create(email, 'player')

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(res.status).toBe(202)

      const sentEmails = emailAdapter.getSentTo(email)
      const emailBody = sentEmails[0].body

      // Verify HTML formatting
      expect(emailBody).toContain('<h1>')
      expect(emailBody).toContain('</h1>')
      expect(emailBody).toContain('<p>')
      expect(emailBody).toContain('</p>')
    })
  })
})
