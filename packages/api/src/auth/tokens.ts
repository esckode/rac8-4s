import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { TokenStore } from './token-store'
import { TokenExpiredError, TokenInvalidError } from './errors'

export interface OrganizerPayload {
  sub: string
  email: string
  // Account JWTs are issued for both organizers and players; a player account's
  // token carries the linked playerId so it can act on player-scoped endpoints.
  role: 'organizer' | 'player'
  playerId?: string
  jti?: string
  iat?: number
  exp?: number
}

export interface JwtConfig {
  secret: string
  expiresInSeconds: number
}

export interface TokenPair {
  accessToken: string
  expiresAt: number
}

export function issueOrganizerToken(
  payload: Omit<OrganizerPayload, 'role' | 'iat' | 'exp' | 'jti'>,
  config: JwtConfig
): TokenPair {
  const jti = randomUUID()
  const token = jwt.sign(
    {
      ...payload,
      role: 'organizer',
      jti,
    },
    config.secret,
    {
      expiresIn: config.expiresInSeconds,
    }
  )

  return {
    accessToken: token,
    expiresAt: Date.now() + config.expiresInSeconds * 1000,
  }
}

export function verifyOrganizerToken(
  token: string,
  config: JwtConfig
): OrganizerPayload {
  try {
    const decoded = jwt.verify(token, config.secret) as OrganizerPayload
    return decoded
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError()
    }
    throw new TokenInvalidError()
  }
}

export async function invalidateOrganizerToken(
  token: string,
  config: JwtConfig,
  store: TokenStore,
  tokenBlocklistTtlSeconds: number
): Promise<void> {
  try {
    const decoded = jwt.decode(token) as any
    if (!decoded?.jti) {
      return
    }

    // Use token's remaining lifetime, or fallback to configured TTL if can't determine
    const remainingSeconds = decoded.exp ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000)) : tokenBlocklistTtlSeconds

    await store.set(`jwt:blocklist:${decoded.jti}`, 'true', remainingSeconds)
  } catch {
    // If token can't be decoded, just skip blocklisting
  }
}

export async function isTokenInvalidated(
  token: string,
  store: TokenStore
): Promise<boolean> {
  try {
    const decoded = jwt.decode(token) as any
    if (!decoded?.jti) {
      return false
    }

    const blocklisted = await store.get(`jwt:blocklist:${decoded.jti}`)
    return blocklisted !== null
  } catch {
    return false
  }
}

export async function refreshOrganizerToken(
  token: string,
  config: JwtConfig,
  store: TokenStore,
  sessionTtlSeconds: number,
  tokenBlocklistTtlSeconds: number
): Promise<TokenPair> {
  const payload = verifyOrganizerToken(token, config)
  const invalidated = await isTokenInvalidated(token, store)

  if (invalidated) {
    throw new TokenInvalidError('Token has been invalidated (logged out)')
  }

  await invalidateOrganizerToken(token, config, store, tokenBlocklistTtlSeconds)

  const newToken = issueOrganizerToken(
    {
      sub: payload.sub,
      email: payload.email,
    },
    {
      secret: config.secret,
      expiresInSeconds: sessionTtlSeconds,
    }
  )

  return newToken
}
