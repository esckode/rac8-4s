import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction, getTransactionClient } from '../../helpers/db'
import { PasswordResetCodeRepository } from '../../../db'

describe('PasswordResetCodeRepository', () => {
  let pool: Pool
  let client: any
  let repo: PasswordResetCodeRepository
  const testAccountId = `account_test_${Date.now()}_${Math.random().toString(36).slice(2)}`

  beforeAll(async () => {
    pool = await getTestPool()
    client = await beginTransaction(pool)
    repo = new PasswordResetCodeRepository(client)

    // Create a test account
    const now = new Date().toISOString()
    await client.query(
      `INSERT INTO auth.accounts (id, email, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testAccountId, `test_${Date.now()}@example.com`, 'hash123', 'player', 'active', now, now]
    )
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('generateCode', () => {
    it('should generate a 6-digit code', () => {
      const code = PasswordResetCodeRepository.generateCode()
      expect(code).toMatch(/^\d{6}$/)
      expect(code).toHaveLength(6)
    })

    it('should generate random codes', () => {
      const code1 = PasswordResetCodeRepository.generateCode()
      const code2 = PasswordResetCodeRepository.generateCode()
      const code3 = PasswordResetCodeRepository.generateCode()

      expect(code1).not.toBe(code2)
      expect(code2).not.toBe(code3)
    })
  })

  describe('create', () => {
    it('should create a reset code with correct expiration', async () => {
      const expirationMinutes = 15
      const code = '123456'
      const beforeTime = new Date()

      const result = await repo.create(testAccountId, code, expirationMinutes)

      const expiresAt = new Date(result.expires_at)
      const now = new Date()

      expect(result.id).toBeDefined()
      expect(result.account_id).toBe(testAccountId)
      expect(result.code).toBe(code)
      expect(result.attempts).toBe(0)
      expect(result.used_at).toBeNull()
      expect(result.created_at).toBeDefined()

      // Verify expiration is approximately 15 minutes from creation time
      const expectedMs = expirationMinutes * 60 * 1000
      const actualDiff = expiresAt.getTime() - new Date(result.created_at).getTime()

      // Should be within 2 seconds of the expected expiration
      expect(actualDiff).toBeGreaterThanOrEqual(expectedMs - 2000)
      expect(actualDiff).toBeLessThanOrEqual(expectedMs + 2000)
    })

    it('should store code as ISO 8601 timestamp', async () => {
      const code = '654321'
      const result = await repo.create(testAccountId, code, 15)

      // Verify it's a valid ISO 8601 string
      expect(new Date(result.expires_at).toISOString()).toBeDefined()
    })
  })

  describe('findByCode', () => {
    it('should find a code by exact match', async () => {
      const code = '111111'
      await repo.create(testAccountId, code, 15)

      const result = await repo.findByCode(code)

      expect(result).toBeDefined()
      expect(result!.code).toBe(code)
      expect(result!.account_id).toBe(testAccountId)
    })

    it('should return null for non-existent code', async () => {
      const result = await repo.findByCode('999999')
      expect(result).toBeNull()
    })
  })

  describe('findByAccountId', () => {
    it('should find the latest code for an account', async () => {
      const code1 = '222222'
      const code2 = '333333'

      await repo.create(testAccountId, code1, 15)
      // Small delay to ensure different created_at
      await new Promise(resolve => setTimeout(resolve, 10))
      const result2 = await repo.create(testAccountId, code2, 15)

      const result = await repo.findByAccountId(testAccountId)

      expect(result).toBeDefined()
      expect(result!.code).toBe(code2)
      expect(result!.id).toBe(result2.id)
    })

    it('should return null if no codes exist for account', async () => {
      const result = await repo.findByAccountId('nonexistent_account')
      expect(result).toBeNull()
    })
  })

  describe('isExpired', () => {
    it('should return true for expired codes', async () => {
      const code = '444444'
      // Use a hardcoded timestamp from the past
      const id = `prc_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const now = new Date().toISOString()
      const expiresAtPast = '2020-01-01T00:00:00.000Z' // 5+ years ago

      await client.query(
        `INSERT INTO auth.password_reset_codes (id, account_id, code, attempts, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, testAccountId, code, 0, expiresAtPast, now]
      )

      const result = await repo.findByCode(code)
      expect(result).not.toBeNull()

      const isExpired = PasswordResetCodeRepository.isExpired(result!)
      expect(isExpired).toBe(true)
    })

    it('should return false for non-expired codes', async () => {
      const code = '555555'
      const result = await repo.create(testAccountId, code, 60)

      const isExpired = PasswordResetCodeRepository.isExpired(result)
      expect(isExpired).toBe(false)
    })
  })

  describe('isUsed', () => {
    it('should return false for unused codes', async () => {
      const code = '666666'
      const result = await repo.create(testAccountId, code, 15)

      const isUsed = PasswordResetCodeRepository.isUsed(result)
      expect(isUsed).toBe(false)
    })

    it('should return true for used codes', async () => {
      const code = '777777'
      const result = await repo.create(testAccountId, code, 15)

      await repo.markAsUsed(result.id)
      const updatedResult = await repo.findByCode(code)

      const isUsed = PasswordResetCodeRepository.isUsed(updatedResult!)
      expect(isUsed).toBe(true)
    })
  })

  describe('incrementAttempts', () => {
    it('should increment attempt counter from 0', async () => {
      const code = '888888'
      const created = await repo.create(testAccountId, code, 15)

      expect(created.attempts).toBe(0)

      const newCount = await repo.incrementAttempts(created.id)
      expect(newCount).toBe(1)
    })

    it('should increment attempt counter multiple times', async () => {
      const code = '999999'
      const created = await repo.create(testAccountId, code, 15)

      const count1 = await repo.incrementAttempts(created.id)
      expect(count1).toBe(1)

      const count2 = await repo.incrementAttempts(created.id)
      expect(count2).toBe(2)

      const count3 = await repo.incrementAttempts(created.id)
      expect(count3).toBe(3)
    })

    it('should return the new count after increment', async () => {
      const code = '101010'
      const created = await repo.create(testAccountId, code, 15)

      const newCount = await repo.incrementAttempts(created.id)

      const updated = await repo.findByCode(code)
      expect(updated!.attempts).toBe(newCount)
    })
  })

  describe('markAsUsed', () => {
    it('should mark code as used', async () => {
      const code = '111112'
      const created = await repo.create(testAccountId, code, 15)

      expect(created.used_at).toBeNull()

      await repo.markAsUsed(created.id)

      const updated = await repo.findByCode(code)
      expect(updated!.used_at).not.toBeNull()
      expect(new Date(updated!.used_at!).getTime()).toBeGreaterThan(0)
    })

    it('should prevent reuse of marked codes', async () => {
      const code = '111113'
      const created = await repo.create(testAccountId, code, 15)

      await repo.markAsUsed(created.id)

      const result = await repo.findByCode(code)
      expect(PasswordResetCodeRepository.isUsed(result!)).toBe(true)
    })
  })

  describe('deleteExpired', () => {
    it('should delete expired codes', async () => {
      const expiredCode = '211111'
      const validCode = '311111'

      // Create expired code by inserting directly with past expiration
      const id1 = `prc_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const now = new Date()
      const expiredAt = new Date(now.getTime() - 60 * 1000) // 1 minute ago

      await client.query(
        `INSERT INTO auth.password_reset_codes (id, account_id, code, attempts, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id1, testAccountId, expiredCode, 0, expiredAt.toISOString(), now.toISOString()]
      )

      // Create valid code (60 minute expiration)
      await repo.create(testAccountId, validCode, 60)

      const deleted = await repo.deleteExpired()

      expect(deleted).toBeGreaterThanOrEqual(1)

      const expiredResult = await repo.findByCode(expiredCode)
      expect(expiredResult).toBeNull()

      const validResult = await repo.findByCode(validCode)
      expect(validResult).toBeDefined()
    })

    it('should only delete expired codes, not recent ones', async () => {
      const expiredCode = '411111'
      const recentCode1 = '511111'
      const recentCode2 = '611111'

      // Create expired code directly
      const id1 = `prc_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const now = new Date()
      const expiredAt = new Date(now.getTime() - 60 * 1000)

      await client.query(
        `INSERT INTO auth.password_reset_codes (id, account_id, code, attempts, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id1, testAccountId, expiredCode, 0, expiredAt.toISOString(), now.toISOString()]
      )

      const count1 = await repo.deleteExpired()
      expect(count1).toBeGreaterThanOrEqual(1)

      // Create fresh codes
      await repo.create(testAccountId, recentCode1, 60)
      await repo.create(testAccountId, recentCode2, 60)

      const count2 = await repo.deleteExpired()

      // Second cleanup should delete nothing since codes are fresh
      expect(count2).toBe(0)

      const result1 = await repo.findByCode(recentCode1)
      expect(result1).toBeDefined()

      const result2 = await repo.findByCode(recentCode2)
      expect(result2).toBeDefined()
    })

    it('should return count of deleted rows', async () => {
      const code1 = '711111'
      const code2 = '811111'

      const id1 = `prc_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const id2 = `prc_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const now = new Date()
      const expiredAt = new Date(now.getTime() - 60 * 1000)

      await client.query(
        `INSERT INTO auth.password_reset_codes (id, account_id, code, attempts, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)`,
        [
          id1, testAccountId, code1, 0, expiredAt.toISOString(), now.toISOString(),
          id2, testAccountId, code2, 0, expiredAt.toISOString(), now.toISOString()
        ]
      )

      const deleted = await repo.deleteExpired()

      expect(typeof deleted).toBe('number')
      expect(deleted).toBeGreaterThanOrEqual(2)
    })
  })

  describe('error cases', () => {
    it('should handle non-existent code ID for incrementAttempts', async () => {
      // Should not throw, but may not update anything
      const count = await repo.incrementAttempts('nonexistent_id')
      expect(count).toBe(0)
    })

    it('should handle non-existent code ID for markAsUsed', async () => {
      // Should not throw
      await expect(repo.markAsUsed('nonexistent_id')).resolves.not.toThrow()
    })
  })

  describe('timestamp handling', () => {
    it('should store created_at as ISO 8601 timestamp', async () => {
      const code = '912111'
      const result = await repo.create(testAccountId, code, 15)

      const createdAt = new Date(result.created_at)
      expect(createdAt).toBeInstanceOf(Date)
      expect(createdAt.getTime()).toBeGreaterThan(0)
    })

    it('should store expires_at as ISO 8601 timestamp', async () => {
      const code = '912112'
      const result = await repo.create(testAccountId, code, 15)

      const expiresAt = new Date(result.expires_at)
      expect(expiresAt).toBeInstanceOf(Date)
      expect(expiresAt.getTime()).toBeGreaterThan(new Date().getTime())
    })

    it('should store used_at as ISO 8601 timestamp when marked', async () => {
      const code = '912113'
      const created = await repo.create(testAccountId, code, 15)

      expect(created.used_at).toBeNull()

      await repo.markAsUsed(created.id)

      const updated = await repo.findByCode(code)
      expect(updated!.used_at).not.toBeNull()

      const usedAt = new Date(updated!.used_at!)
      expect(usedAt).toBeInstanceOf(Date)
      expect(usedAt.getTime()).toBeGreaterThan(0)
    })
  })
})
