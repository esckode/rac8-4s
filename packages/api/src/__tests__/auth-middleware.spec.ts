import {
  extractBearerToken,
  requireOrganizerAuth,
  requirePlayerAuth,
  assertOrganizerOwnsTournament,
  assertPlayerInTournament,
} from '../auth/middleware'
import { issueOrganizerToken, JwtConfig } from '../auth/tokens'
import { generateMagicLinkToken } from '../auth/magic-link'
import {
  MissingTokenError,
  TokenInvalidError,
  ForbiddenError,
  TokenExpiredError,
} from '../auth/errors'
import { InMemoryTokenStore } from '../auth/token-store'

const TEST_JWT_SECRET = 'test-secret-at-least-32-chars-long-for-testing!'
const STANDARD_CONFIG: JwtConfig = {
  secret: TEST_JWT_SECRET,
  expiresInSeconds: 3600,
}
const SHORT_TTL_CONFIG: JwtConfig = {
  secret: TEST_JWT_SECRET,
  expiresInSeconds: 1,
}
const TEST_ORGANIZER_ID = 'org_test_001'
const TEST_EMAIL = 'organizer@example.com'
const TEST_PLAYER_PAYLOAD = {
  playerId: 'player_001',
  tournamentId: 'tourn_001',
  email: 'player@example.com',
  createdAt: Date.now(),
}

describe('extractBearerToken', () => {
  it('should return the token from "Bearer <token>"', () => {
    const result = extractBearerToken('Bearer mytoken123')
    expect(result).toBe('mytoken123')
  })

  it('should handle tokens with special characters', () => {
    const result = extractBearerToken('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.xyz')
    expect(result).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.xyz')
  })

  it('should throw MissingTokenError for undefined', () => {
    expect(() => extractBearerToken(undefined)).toThrow(MissingTokenError)
  })

  it('should throw MissingTokenError for empty string', () => {
    expect(() => extractBearerToken('')).toThrow(MissingTokenError)
  })

  it('should throw MissingTokenError for whitespace only', () => {
    expect(() => extractBearerToken('   ')).toThrow(MissingTokenError)
  })

  it('should throw TokenInvalidError for "Basic abc123" (wrong scheme)', () => {
    expect(() => extractBearerToken('Basic abc123')).toThrow(TokenInvalidError)
  })

  it('should throw TokenInvalidError for "Bearer" with no token after', () => {
    expect(() => extractBearerToken('Bearer')).toThrow(TokenInvalidError)
  })

  it('should throw TokenInvalidError for "Bearer " with whitespace only', () => {
    expect(() => extractBearerToken('Bearer   ')).toThrow(TokenInvalidError)
  })

  it('should throw TokenInvalidError for a string with no space', () => {
    expect(() => extractBearerToken('notatoken')).toThrow(TokenInvalidError)
  })

  it('should trim bearer token value', () => {
    const result = extractBearerToken('Bearer mytoken')
    expect(result).toBe('mytoken')
    expect(result).not.toMatch(/\s/)
  })
})

describe('requireOrganizerAuth', () => {
  it('should return OrganizerPayload for a valid Bearer JWT', async () => {
    const store = new InMemoryTokenStore()
    const tokenPair = issueOrganizerToken(
      { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
      STANDARD_CONFIG
    )
    const result = await requireOrganizerAuth(
      `Bearer ${tokenPair.accessToken}`,
      STANDARD_CONFIG,
      store
    )
    expect(result.sub).toBe(TEST_ORGANIZER_ID)
    expect(result.email).toBe(TEST_EMAIL)
    expect(result.role).toBe('organizer')
  })

  it('should throw MissingTokenError for undefined authHeader', async () => {
    const store = new InMemoryTokenStore()
    await expect(
      requireOrganizerAuth(undefined, STANDARD_CONFIG, store)
    ).rejects.toThrow(MissingTokenError)
  })

  it('should throw TokenInvalidError for malformed header', async () => {
    const store = new InMemoryTokenStore()
    await expect(
      requireOrganizerAuth('NotBearer abc', STANDARD_CONFIG, store)
    ).rejects.toThrow(TokenInvalidError)
  })

  it('should throw TokenExpiredError for expired JWT', async () => {
    jest.useFakeTimers()
    const store = new InMemoryTokenStore()
    const tokenPair = issueOrganizerToken(
      { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
      SHORT_TTL_CONFIG
    )
    jest.advanceTimersByTime(2000)
    await expect(
      requireOrganizerAuth(
        `Bearer ${tokenPair.accessToken}`,
        SHORT_TTL_CONFIG,
        store
      )
    ).rejects.toThrow(TokenExpiredError)
    jest.useRealTimers()
  })

  it('should throw TokenInvalidError for a tampered JWT', async () => {
    const store = new InMemoryTokenStore()
    const tokenPair = issueOrganizerToken(
      { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
      STANDARD_CONFIG
    )
    const parts = tokenPair.accessToken.split('.')
    const tampered = parts[0] + '.tampered.' + parts[2]
    await expect(
      requireOrganizerAuth(`Bearer ${tampered}`, STANDARD_CONFIG, store)
    ).rejects.toThrow(TokenInvalidError)
  })

  it('should throw TokenInvalidError for a JWT on the blocklist (logged out)', async () => {
    const store = new InMemoryTokenStore()
    const tokenPair = issueOrganizerToken(
      { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
      STANDARD_CONFIG
    )
    // Manually mark as invalidated
    const { invalidateOrganizerToken } = await import('../auth/tokens')
    await invalidateOrganizerToken(tokenPair.accessToken, STANDARD_CONFIG, store, 3600)
    await expect(
      requireOrganizerAuth(
        `Bearer ${tokenPair.accessToken}`,
        STANDARD_CONFIG,
        store
      )
    ).rejects.toThrow(TokenInvalidError)
  })
})

describe('requirePlayerAuth', () => {
  it('should return MagicLinkPayload for a valid player token', async () => {
    const store = new InMemoryTokenStore()
    const generated = await generateMagicLinkToken(
      TEST_PLAYER_PAYLOAD,
      3600,
      store
    )
    const result = await requirePlayerAuth(
      `Bearer ${generated.token}`,
      store
    )
    expect(result.playerId).toBe(TEST_PLAYER_PAYLOAD.playerId)
    expect(result.tournamentId).toBe(TEST_PLAYER_PAYLOAD.tournamentId)
  })

  it('should throw MissingTokenError for undefined authHeader', async () => {
    const store = new InMemoryTokenStore()
    await expect(requirePlayerAuth(undefined, store)).rejects.toThrow(
      MissingTokenError
    )
  })

  it('should throw TokenInvalidError for an expired/consumed magic link token', async () => {
    const store = new InMemoryTokenStore()
    const generated = await generateMagicLinkToken(
      TEST_PLAYER_PAYLOAD,
      3600,
      store
    )
    await requirePlayerAuth(`Bearer ${generated.token}`, store)
    await expect(
      requirePlayerAuth(`Bearer ${generated.token}`, store)
    ).rejects.toThrow(TokenInvalidError)
  })

  it('should throw TokenInvalidError for a token not in store', async () => {
    const store = new InMemoryTokenStore()
    const fakeToken = '0'.repeat(64)
    await expect(
      requirePlayerAuth(`Bearer ${fakeToken}`, store)
    ).rejects.toThrow(TokenInvalidError)
  })

  it('should consume the magic link token (single-use after auth)', async () => {
    const store = new InMemoryTokenStore()
    const generated = await generateMagicLinkToken(
      TEST_PLAYER_PAYLOAD,
      3600,
      store
    )
    await requirePlayerAuth(`Bearer ${generated.token}`, store)
    const stored = await store.get(`magic:${generated.token}`)
    expect(stored).toBeNull()
  })
})

describe('assertOrganizerOwnsTournament', () => {
  it('should not throw when organizerId matches', () => {
    expect(() => {
      assertOrganizerOwnsTournament(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL, role: 'organizer' },
        TEST_ORGANIZER_ID
      )
    }).not.toThrow()
  })

  it('should throw ForbiddenError when organizerId does not match', () => {
    expect(() => {
      assertOrganizerOwnsTournament(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL, role: 'organizer' },
        'org_different_id'
      )
    }).toThrow(ForbiddenError)
  })

  it('ForbiddenError should have code FORBIDDEN', () => {
    try {
      assertOrganizerOwnsTournament(
        { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL, role: 'organizer' },
        'org_different_id'
      )
    } catch (e) {
      expect(e instanceof ForbiddenError).toBe(true)
      expect((e as ForbiddenError).code).toBe('FORBIDDEN')
    }
  })
})

describe('assertPlayerInTournament', () => {
  it('should not throw when tournamentId matches', () => {
    expect(() => {
      assertPlayerInTournament(TEST_PLAYER_PAYLOAD, 'tourn_001')
    }).not.toThrow()
  })

  it('should throw ForbiddenError when tournamentId does not match', () => {
    expect(() => {
      assertPlayerInTournament(TEST_PLAYER_PAYLOAD, 'tourn_different')
    }).toThrow(ForbiddenError)
  })

  it('ForbiddenError should have code FORBIDDEN', () => {
    try {
      assertPlayerInTournament(TEST_PLAYER_PAYLOAD, 'tourn_different')
    } catch (e) {
      expect(e instanceof ForbiddenError).toBe(true)
      expect((e as ForbiddenError).code).toBe('FORBIDDEN')
    }
  })
})

describe('Authorization - combined scenarios', () => {
  it('organizer cannot access another organizer\'s tournament', async () => {
    const store = new InMemoryTokenStore()
    const tokenPair = issueOrganizerToken(
      { sub: TEST_ORGANIZER_ID, email: TEST_EMAIL },
      STANDARD_CONFIG
    )
    const payload = await requireOrganizerAuth(
      `Bearer ${tokenPair.accessToken}`,
      STANDARD_CONFIG,
      store
    )
    expect(() => {
      assertOrganizerOwnsTournament(payload, 'org_other_creator_id')
    }).toThrow(ForbiddenError)
  })

  it('player cannot access a different tournament\'s resources', async () => {
    const store = new InMemoryTokenStore()
    const generated = await generateMagicLinkToken(
      TEST_PLAYER_PAYLOAD,
      3600,
      store
    )
    const payload = await requirePlayerAuth(
      `Bearer ${generated.token}`,
      store
    )
    expect(() => {
      assertPlayerInTournament(payload, 'tourn_different')
    }).toThrow(ForbiddenError)
  })
})
