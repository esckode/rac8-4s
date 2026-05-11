import {
  OrganizerPayload,
  verifyOrganizerToken,
  isTokenInvalidated,
  JwtConfig,
} from './tokens'
import { MagicLinkPayload, validateMagicLinkToken, validatePlayerSession } from './magic-link'
import { TokenStore } from './token-store'
import { MissingTokenError, TokenInvalidError, ForbiddenError } from './errors'

export interface AuthContext {
  organizerPayload?: OrganizerPayload
  playerPayload?: MagicLinkPayload
}

export function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader || !authHeader.trim()) {
    throw new MissingTokenError()
  }

  const parts = authHeader.trim().split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new TokenInvalidError('Authorization header must be "Bearer <token>"')
  }

  const token = parts[1]
  if (!token || !token.trim()) {
    throw new TokenInvalidError('Token cannot be empty')
  }

  return token
}

export async function requireOrganizerAuth(
  authHeader: string | undefined,
  config: JwtConfig,
  store: TokenStore
): Promise<OrganizerPayload> {
  const token = extractBearerToken(authHeader)
  const payload = verifyOrganizerToken(token, config)
  const invalidated = await isTokenInvalidated(token, store)

  if (invalidated) {
    throw new TokenInvalidError('Token has been invalidated (logged out)')
  }

  return payload
}

export async function requirePlayerAuth(
  authHeader: string | undefined,
  store: TokenStore
): Promise<MagicLinkPayload> {
  const token = extractBearerToken(authHeader)
  return validateMagicLinkToken(token, store)
}

export async function requirePlayerSessionAuth(
  authHeader: string | undefined,
  store: TokenStore
): Promise<MagicLinkPayload> {
  const token = extractBearerToken(authHeader)
  return validatePlayerSession(token, store)
}

export function assertOrganizerOwnsTournament(
  organizerPayload: OrganizerPayload,
  tournamentOrganizerId: string
): void {
  if (organizerPayload.sub !== tournamentOrganizerId) {
    throw new ForbiddenError('tournament')
  }
}

export function assertPlayerInTournament(
  playerPayload: MagicLinkPayload,
  tournamentId: string
): void {
  if (playerPayload.tournamentId !== tournamentId) {
    throw new ForbiddenError('tournament')
  }
}
