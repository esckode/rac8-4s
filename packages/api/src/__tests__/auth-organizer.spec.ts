import { hashPassword, verifyPassword } from '../auth/password'
import { DEFAULT_APP_CONFIG } from '../config'
import {
  issueOrganizerToken,
  verifyOrganizerToken,
  invalidateOrganizerToken,
  isTokenInvalidated,
  refreshOrganizerToken,
  OrganizerPayload,
  JwtConfig,
} from '../auth/tokens'
import { TokenExpiredError, TokenInvalidError, InvalidCredentialsError, UserNotFoundError } from '../auth/errors'
import { InMemoryTokenStore } from '../auth/token-store'
import jwt from 'jsonwebtoken'

const TEST_JWT_SECRET = 'test-secret-at-least-32-chars-long-for-testing!'
const SHORT_TTL_CONFIG: JwtConfig = {
  secret: TEST_JWT_SECRET,
  expiresInSeconds: 1,
}
const STANDARD_CONFIG: JwtConfig = {
  secret: TEST_JWT_SECRET,
  expiresInSeconds: 3600,
}
const TEST_ORGANIZER_ID = 'org_test_001'
const TEST_EMAIL = 'organizer@example.com'

describe('Organizer Password Authentication', () => {
  describe('hashPassword', () => {
    it('should return a bcrypt hash starting with $2b$', async () => {
      const hash = await hashPassword('password123')
      expect(hash).toMatch(/^\$2[aby]\$/)
    })

    it('should produce different hashes for the same password', async () => {
      const password = 'password123'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)
      expect(hash1).not.toBe(hash2)
    })

    it('should throw if saltRounds is less than 10', async () => {
      await expect(hashPassword('password123', 9)).rejects.toThrow(
        /salt rounds must be/i
      )
    })

    it('should use saltRounds of exactly 10 by default', async () => {
      const hash = await hashPassword('password123')
      const rounds = parseInt(hash.split('$')[2], 10)
      expect(rounds).toBe(10)
    })

    it('should accept saltRounds >= 10', async () => {
      const hash = await hashPassword('password123', 12)
      const rounds = parseInt(hash.split('$')[2], 10)
      expect(rounds).toBe(12)
    })
  })

  describe('verifyPassword', () => {
    it('should return true for matching password', async () => {
      const password = 'mySecurePassword'
      const hash = await hashPassword(password)
      const result = await verifyPassword(password, hash)
      expect(result).toBe(true)
    })

    it('should return false for wrong password', async () => {
      const hash = await hashPassword('password123')
      const result = await verifyPassword('wrongpassword', hash)
      expect(result).toBe(false)
    })

    it('should return false for empty string against real hash', async () => {
      const hash = await hashPassword('password123')
      const result = await verifyPassword('', hash)
      expect(result).toBe(false)
    })

    it('should return false when comparing hash against hash', async () => {
      const hash = await hashPassword('password123')
      const result = await verifyPassword(hash, hash)
      expect(result).toBe(false)
    })

    it('should be case-sensitive', async () => {
      const hash = await hashPassword('Password123')
      const result = await verifyPassword('password123', hash)
      expect(result).toBe(false)
    })
  })
})

describe('Organizer JWT Tokens', () => {
  describe('issueOrganizerToken', () => {
    it('should return a string token and future expiresAt', () => {
      const before = Date.now()
      const result = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      const after = Date.now()

      expect(typeof result.accessToken).toBe('string')
      expect(result.accessToken.split('.')).toHaveLength(3)
      expect(result.expiresAt).toBeGreaterThanOrEqual(
        before + STANDARD_CONFIG.expiresInSeconds * 1000
      )
      expect(result.expiresAt).toBeLessThanOrEqual(
        after + STANDARD_CONFIG.expiresInSeconds * 1000
      )
    })

    it('should embed sub, email, role=organizer claims', () => {
      const result = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      const decoded = jwt.decode(result.accessToken) as OrganizerPayload
      expect(decoded.sub).toBe(TEST_ORGANIZER_ID)
      expect(decoded.email).toBe(TEST_EMAIL)
      expect(decoded.role).toBe('organizer')
    })

    it('should embed a jti claim (JWT ID) for blocklisting', () => {
      const result = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      const decoded = jwt.decode(result.accessToken) as any
      expect(decoded.jti).toBeDefined()
      expect(typeof decoded.jti).toBe('string')
    })

    it('should use expiresInSeconds from config', () => {
      const result = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        SHORT_TTL_CONFIG
      )
      const decoded = jwt.decode(result.accessToken) as any
      expect(decoded.exp && decoded.iat).toBeDefined()
      const expiresInSeconds = (decoded.exp - decoded.iat) as number
      expect(expiresInSeconds).toBe(SHORT_TTL_CONFIG.expiresInSeconds)
    })

    it('should generate unique jti on successive calls', () => {
      const result1 = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      const result2 = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      const decoded1 = jwt.decode(result1.accessToken) as any
      const decoded2 = jwt.decode(result2.accessToken) as any
      expect(decoded1.jti).not.toBe(decoded2.jti)
    })
  })

  describe('verifyOrganizerToken', () => {
    it('should return decoded payload for a valid token', () => {
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      const payload = verifyOrganizerToken(issued.accessToken, STANDARD_CONFIG)
      expect(payload.sub).toBe(TEST_ORGANIZER_ID)
      expect(payload.email).toBe(TEST_EMAIL)
      expect(payload.role).toBe('organizer')
    })

    it('should throw TokenExpiredError for an expired token', () => {
      jest.useFakeTimers()
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        SHORT_TTL_CONFIG
      )
      jest.advanceTimersByTime(2000)
      expect(() => verifyOrganizerToken(issued.accessToken, SHORT_TTL_CONFIG)).toThrow(
        TokenExpiredError
      )
      jest.useRealTimers()
    })

    it('should throw TokenInvalidError for a tampered token', () => {
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      const parts = issued.accessToken.split('.')
      const tampered = parts[0] + '.tampered.' + parts[2]
      expect(() => verifyOrganizerToken(tampered, STANDARD_CONFIG)).toThrow(
        TokenInvalidError
      )
    })

    it('should throw TokenInvalidError for a token signed with wrong secret', () => {
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      const wrongConfig: JwtConfig = {
        secret: 'different-secret-key',
        expiresInSeconds: 3600,
      }
      expect(() => verifyOrganizerToken(issued.accessToken, wrongConfig)).toThrow(
        TokenInvalidError
      )
    })

    it('should throw TokenInvalidError for a random string', () => {
      expect(() =>
        verifyOrganizerToken('not.a.token', STANDARD_CONFIG)
      ).toThrow(TokenInvalidError)
    })

    it('should throw TokenInvalidError for an empty string', () => {
      expect(() => verifyOrganizerToken('', STANDARD_CONFIG)).toThrow(
        TokenInvalidError
      )
    })
  })

  describe('invalidateOrganizerToken + isTokenInvalidated (logout)', () => {
    it('should mark a token as invalidated in the store', async () => {
      const store = new InMemoryTokenStore()
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      await invalidateOrganizerToken(
        issued.accessToken,
        STANDARD_CONFIG,
        store,
        3600
      )
      const invalidated = await isTokenInvalidated(issued.accessToken, store)
      expect(invalidated).toBe(true)
    })

    it('should return true for an invalidated token', async () => {
      const store = new InMemoryTokenStore()
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      await invalidateOrganizerToken(
        issued.accessToken,
        STANDARD_CONFIG,
        store,
        3600
      )
      expect(await isTokenInvalidated(issued.accessToken, store)).toBe(true)
    })

    it('should return false for a non-invalidated token', async () => {
      const store = new InMemoryTokenStore()
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      expect(await isTokenInvalidated(issued.accessToken, store)).toBe(false)
    })

    it('should be idempotent: invalidating twice does not throw', async () => {
      const store = new InMemoryTokenStore()
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      await invalidateOrganizerToken(
        issued.accessToken,
        STANDARD_CONFIG,
        store,
        3600
      )
      await expect(
        invalidateOrganizerToken(issued.accessToken, STANDARD_CONFIG, store, 3600)
      ).resolves.not.toThrow()
    })
  })

  describe('Error message validation', () => {
    it('should include specific error message in TokenInvalidError', () => {
      const error = new TokenInvalidError('custom message')
      expect(error.message).toBe('custom message')
      expect(error.code).toBe('TOKEN_INVALID')
    })

    it('should handle null decoding gracefully when blocklisting', async () => {
      const store = new InMemoryTokenStore()
      const fakeToken = 'not-a-valid-jwt-token'
      await expect(
        invalidateOrganizerToken(fakeToken, STANDARD_CONFIG, store, 3600)
      ).resolves.not.toThrow()
    })
  })

  describe('refreshOrganizerToken', () => {
    it('should return a new token pair with a fresh expiresAt', async () => {
      const store = new InMemoryTokenStore()
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      const refreshed = await refreshOrganizerToken(
        issued.accessToken,
        STANDARD_CONFIG,
        store,
        STANDARD_CONFIG.expiresInSeconds,
        3600
      )
      expect(refreshed.accessToken).not.toBe(issued.accessToken)
      expect(refreshed.expiresAt).toBeGreaterThanOrEqual(issued.expiresAt)
    })

    it('should invalidate the old token after refresh', async () => {
      const store = new InMemoryTokenStore()
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      await refreshOrganizerToken(
        issued.accessToken,
        STANDARD_CONFIG,
        store,
        STANDARD_CONFIG.expiresInSeconds,
        3600
      )
      expect(await isTokenInvalidated(issued.accessToken, store)).toBe(true)
    })

    it('should throw TokenExpiredError if the old token is expired', async () => {
      const store = new InMemoryTokenStore()
      jest.useFakeTimers()
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        SHORT_TTL_CONFIG
      )
      jest.advanceTimersByTime(2000)
      await expect(
        refreshOrganizerToken(
          issued.accessToken,
          SHORT_TTL_CONFIG,
          store,
          SHORT_TTL_CONFIG.expiresInSeconds,
          3600
        )
      ).rejects.toThrow(TokenExpiredError)
      jest.useRealTimers()
    })

    it('should throw TokenInvalidError if old token is already invalidated (logged out)', async () => {
      const store = new InMemoryTokenStore()
      const issued = issueOrganizerToken(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
        STANDARD_CONFIG
      )
      await invalidateOrganizerToken(
        issued.accessToken,
        STANDARD_CONFIG,
        store,
        3600
      )
      await expect(
        refreshOrganizerToken(
          issued.accessToken,
          STANDARD_CONFIG,
          store,
          STANDARD_CONFIG.expiresInSeconds,
          3600
        )
      ).rejects.toThrow(TokenInvalidError)
    })
  })
})
