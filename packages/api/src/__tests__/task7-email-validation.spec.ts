import { validateEmailJobPayload } from '../validation/email-job-validator'
import { MAX_EMAIL_RECIPIENTS_PER_JOB } from '../constants'

describe('Task #7: Email Job Validation', () => {
  describe('Valid cases', () => {
    it('should accept single recipient', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['player1'],
      })

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.recipientCount).toBe(1)
      expect(result.duplicateCount).toBe(0)
    })

    it('should accept multiple distinct recipients', () => {
      const recipientIds = Array.from({ length: 100 }, (_, i) => `player${i}`)
      const result = validateEmailJobPayload({ recipientIds })

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.recipientCount).toBe(100)
      expect(result.duplicateCount).toBe(0)
    })

    it('should accept exactly at the limit (1000 recipients)', () => {
      const recipientIds = Array.from({ length: 1000 }, (_, i) => `player${i}`)
      const result = validateEmailJobPayload({ recipientIds })

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.recipientCount).toBe(1000)
      expect(result.duplicateCount).toBe(0)
    })
  })

  describe('Recipient limit violations', () => {
    it('should reject 0 recipients', () => {
      const result = validateEmailJobPayload({
        recipientIds: [],
      })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('at least one recipient')
      expect(result.recipientCount).toBe(0)
    })

    it('should reject more than 1000 recipients', () => {
      const recipientIds = Array.from({ length: 1001 }, (_, i) => `player${i}`)
      const result = validateEmailJobPayload({ recipientIds })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('exceeds maximum recipients')
      expect(result.error).toContain('1001')
      expect(result.error).toContain('1000')
      expect(result.recipientCount).toBe(1001)
    })

    it('should reject 5000 recipients with clear error message', () => {
      const recipientIds = Array.from({ length: 5000 }, (_, i) => `player${i}`)
      const result = validateEmailJobPayload({ recipientIds })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('5000')
      expect(result.error).toContain('1000')
      expect(result.recipientCount).toBe(5000)
    })
  })

  describe('Duplicate recipient validation', () => {
    it('should reject single duplicate', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['player1', 'player2', 'player1'],
      })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('duplicate')
      expect(result.error).toContain('1')
      expect(result.recipientCount).toBe(3)
      expect(result.duplicateCount).toBe(1)
    })

    it('should reject multiple duplicates', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['player1', 'player1', 'player2', 'player2', 'player3'],
      })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('duplicate')
      expect(result.error).toContain('2')
      expect(result.recipientCount).toBe(5)
      expect(result.duplicateCount).toBe(2)
    })

    it('should reject all duplicates (same ID repeated)', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['player1', 'player1', 'player1', 'player1'],
      })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('duplicate')
      expect(result.duplicateCount).toBe(3)
      expect(result.recipientCount).toBe(4)
    })

    it('should distinguish between duplicates and total count', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['p1', 'p2', 'p3', 'p1', 'p2'],
      })

      expect(result.valid).toBe(false)
      expect(result.recipientCount).toBe(5)
      expect(result.duplicateCount).toBe(2)
    })
  })

  describe('Combined validations (limit + duplicates)', () => {
    it('should detect duplicates even with small recipient count', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['p1', 'p1'],
      })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('duplicate')
    })

    it('should detect duplicates in large recipient lists', () => {
      const recipientIds = Array.from({ length: 999 }, (_, i) => `player${i}`)
      recipientIds.push('player0')

      const result = validateEmailJobPayload({ recipientIds })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('duplicate')
      expect(result.recipientCount).toBe(1000)
      expect(result.duplicateCount).toBe(1)
    })

    it('should prioritize limit check over duplicate check (both violations)', () => {
      const recipientIds = Array.from({ length: 1001 }, (_, i) => `player${Math.floor(i / 2)}`)
      const result = validateEmailJobPayload({ recipientIds })

      expect(result.valid).toBe(false)
      expect(result.error).toContain('exceeds maximum recipients')
    })
  })

  describe('Error message clarity', () => {
    it('should provide clear limit exceeded message with actual numbers', () => {
      const result = validateEmailJobPayload({
        recipientIds: Array.from({ length: 2000 }, (_, i) => `p${i}`),
      })

      expect(result.error).toContain('2000')
      expect(result.error).toContain('1000')
    })

    it('should provide clear duplicate message with count', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['a', 'b', 'c', 'a', 'b'],
      })

      expect(result.error).toContain('2')
      expect(result.error).toContain('duplicate')
    })

    it('should indicate empty recipient list clearly', () => {
      const result = validateEmailJobPayload({
        recipientIds: [],
      })

      expect(result.error).toContain('at least one recipient')
    })
  })

  describe('Response structure', () => {
    it('should include all fields on success', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['p1', 'p2'],
      })

      expect(result).toHaveProperty('valid', true)
      expect(result).toHaveProperty('recipientCount', 2)
      expect(result).toHaveProperty('duplicateCount', 0)
      expect(result).not.toHaveProperty('error')
    })

    it('should include error and counts on failure (limit)', () => {
      const result = validateEmailJobPayload({
        recipientIds: Array.from({ length: 1001 }, (_, i) => `p${i}`),
      })

      expect(result).toHaveProperty('valid', false)
      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('recipientCount', 1001)
      expect(result).toHaveProperty('duplicateCount', 0)
    })

    it('should include error and counts on failure (duplicates)', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['p1', 'p2', 'p1'],
      })

      expect(result).toHaveProperty('valid', false)
      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('recipientCount', 3)
      expect(result).toHaveProperty('duplicateCount', 1)
    })
  })

  describe('Edge cases', () => {
    it('should handle UUIDs as recipient IDs', () => {
      const uuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '550e8400-e29b-41d4-a716-446655440000',
      ]

      const result = validateEmailJobPayload({ recipientIds: uuids })

      expect(result.valid).toBe(false)
      expect(result.duplicateCount).toBe(1)
    })

    it('should be case-sensitive (treat different cases as different IDs)', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['Player1', 'player1'],
      })

      expect(result.valid).toBe(true)
      expect(result.duplicateCount).toBe(0)
    })

    it('should handle whitespace in IDs (treat as different)', () => {
      const result = validateEmailJobPayload({
        recipientIds: ['player1', 'player1 ', ' player1'],
      })

      expect(result.valid).toBe(true)
      expect(result.duplicateCount).toBe(0)
    })

    it('should handle very long lists efficiently', () => {
      const recipientIds = Array.from({ length: 999 }, (_, i) => `player${i}`)
      const start = Date.now()
      const result = validateEmailJobPayload({ recipientIds })
      const duration = Date.now() - start

      expect(result.valid).toBe(true)
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Constant validation', () => {
    it('should use MAX_EMAIL_RECIPIENTS_PER_JOB constant of 1000', () => {
      expect(MAX_EMAIL_RECIPIENTS_PER_JOB).toBe(1000)
    })

    it('should reject at limit + 1', () => {
      const recipientIds = Array.from({ length: MAX_EMAIL_RECIPIENTS_PER_JOB + 1 }, (_, i) => `p${i}`)
      const result = validateEmailJobPayload({ recipientIds })

      expect(result.valid).toBe(false)
    })

    it('should accept at limit', () => {
      const recipientIds = Array.from({ length: MAX_EMAIL_RECIPIENTS_PER_JOB }, (_, i) => `p${i}`)
      const result = validateEmailJobPayload({ recipientIds })

      expect(result.valid).toBe(true)
    })
  })
})
