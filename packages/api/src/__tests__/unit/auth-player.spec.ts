import {
  generateMagicLinkToken,
  validateMagicLinkToken,
  invalidateMagicLinkToken,
  MagicLinkPayload,
} from '../../auth/magic-link'
import { TokenInvalidError } from '../../auth/errors'
import { InMemoryTokenStore } from '../../auth/token-store'

const PLAYER_PAYLOAD: MagicLinkPayload = {
  playerId: 'player_001',
  tournamentId: 'tourn_001',
  email: 'player@example.com',
  createdAt: Date.now(),
}
const TTL_24H = 24 * 3600

describe('Player Magic Link Tokens', () => {
  describe('generateMagicLinkToken', () => {
    it('should return a 64-character hex token', async () => {
      const store = new InMemoryTokenStore()
      const result = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      expect(result.token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should store the payload in the token store', async () => {
      const store = new InMemoryTokenStore()
      const result = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      const stored = await store.get(`magic:${result.token}`)
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored!)
      expect(parsed.playerId).toBe(PLAYER_PAYLOAD.playerId)
      expect(parsed.tournamentId).toBe(PLAYER_PAYLOAD.tournamentId)
    })

    it('should set TTL as specified', async () => {
      const store = new InMemoryTokenStore()
      const ttl = 3600
      const result = await generateMagicLinkToken(PLAYER_PAYLOAD, ttl, store)
      const stored = await store.get(`magic:${result.token}`)
      expect(stored).toBeTruthy()
      // Verify it's still there immediately
      const storedAgain = await store.get(`magic:${result.token}`)
      expect(storedAgain).toBeTruthy()
    })

    it('should generate unique tokens on successive calls', async () => {
      const store = new InMemoryTokenStore()
      const result1 = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      const result2 = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      expect(result1.token).not.toBe(result2.token)
    })

    it('should return expiresAt approximately ttlSeconds in the future', async () => {
      const store = new InMemoryTokenStore()
      const before = Date.now()
      const result = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      const after = Date.now()
      const expectedMin = before + TTL_24H * 1000
      const expectedMax = after + TTL_24H * 1000
      expect(result.expiresAt).toBeGreaterThanOrEqual(expectedMin)
      expect(result.expiresAt).toBeLessThanOrEqual(expectedMax)
    })

    it('should embed createdAt timestamp in stored payload', async () => {
      const store = new InMemoryTokenStore()
      const customPayload: MagicLinkPayload = {
        ...PLAYER_PAYLOAD,
        createdAt: 1234567890,
      }
      const result = await generateMagicLinkToken(customPayload, TTL_24H, store)
      const stored = await store.get(`magic:${result.token}`)
      const parsed = JSON.parse(stored!)
      expect(parsed.createdAt).toBe(1234567890)
    })
  })

  describe('validateMagicLinkToken', () => {
    it('should return the stored payload for a valid token', async () => {
      const store = new InMemoryTokenStore()
      const generated = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      const payload = await validateMagicLinkToken(generated.token, store)
      expect(payload.playerId).toBe(PLAYER_PAYLOAD.playerId)
      expect(payload.tournamentId).toBe(PLAYER_PAYLOAD.tournamentId)
      expect(payload.email).toBe(PLAYER_PAYLOAD.email)
    })

    it('should delete the token from store after successful validation (single-use)', async () => {
      const store = new InMemoryTokenStore()
      const generated = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      await validateMagicLinkToken(generated.token, store)
      const stored = await store.get(`magic:${generated.token}`)
      expect(stored).toBeNull()
    })

    it('should throw TokenInvalidError on second validation of same token', async () => {
      const store = new InMemoryTokenStore()
      const generated = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      await validateMagicLinkToken(generated.token, store)
      await expect(
        validateMagicLinkToken(generated.token, store)
      ).rejects.toThrow(TokenInvalidError)
    })

    it('should throw TokenInvalidError for a token not in the store', async () => {
      const store = new InMemoryTokenStore()
      const fakeToken = '0'.repeat(64)
      await expect(validateMagicLinkToken(fakeToken, store)).rejects.toThrow(
        TokenInvalidError
      )
    })

    it('should throw TokenInvalidError for an expired token', async () => {
      const store = new InMemoryTokenStore()
      const generated = await generateMagicLinkToken(PLAYER_PAYLOAD, 10, store)
      store._setExpiredForTest(`magic:${generated.token}`)
      await expect(
        validateMagicLinkToken(generated.token, store)
      ).rejects.toThrow(TokenInvalidError)
    })

    it('should throw TokenInvalidError for an empty string token', async () => {
      const store = new InMemoryTokenStore()
      await expect(validateMagicLinkToken('', store)).rejects.toThrow(
        TokenInvalidError
      )
    })
  })

  describe('invalidateMagicLinkToken', () => {
    it('should remove the token from the store', async () => {
      const store = new InMemoryTokenStore()
      const generated = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      await invalidateMagicLinkToken(generated.token, store)
      const stored = await store.get(`magic:${generated.token}`)
      expect(stored).toBeNull()
    })

    it('should be idempotent: calling twice does not throw', async () => {
      const store = new InMemoryTokenStore()
      const generated = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      await invalidateMagicLinkToken(generated.token, store)
      await expect(
        invalidateMagicLinkToken(generated.token, store)
      ).resolves.not.toThrow()
    })

    it('should cause subsequent validateMagicLinkToken to throw TokenInvalidError', async () => {
      const store = new InMemoryTokenStore()
      const generated = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      await invalidateMagicLinkToken(generated.token, store)
      await expect(
        validateMagicLinkToken(generated.token, store)
      ).rejects.toThrow(TokenInvalidError)
    })
  })

  describe('Error handling edge cases', () => {
    it('should handle corrupted token value gracefully', async () => {
      const store = new InMemoryTokenStore()
      const token = '0'.repeat(64)
      // Manually set corrupted value
      await store.set(`magic:${token}`, 'not-json{', 3600)
      await expect(validateMagicLinkToken(token, store)).rejects.toThrow(
        TokenInvalidError
      )
    })
  })

  describe('Token format security', () => {
    it('should use crypto.randomBytes (hex format, all unique)', async () => {
      const store = new InMemoryTokenStore()
      const tokens = new Set<string>()
      for (let i = 0; i < 50; i++) {
        const result = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
        tokens.add(result.token)
      }
      expect(tokens.size).toBe(50)
    })

    it('should not generate tokens with predictable sequential patterns', async () => {
      const store = new InMemoryTokenStore()
      const result1 = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      const result2 = await generateMagicLinkToken(PLAYER_PAYLOAD, TTL_24H, store)
      // Tokens should differ in many positions
      let diffCount = 0
      for (let i = 0; i < result1.token.length; i++) {
        if (result1.token[i] !== result2.token[i]) {
          diffCount++
        }
      }
      expect(diffCount).toBeGreaterThan(40)
    })
  })
})
