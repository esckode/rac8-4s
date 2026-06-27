import crypto from 'crypto'
import { TokenStore } from './token-store'
import { TokenInvalidError } from './errors'

const TOKEN_BYTE_LENGTH = 32
const KEY_PREFIX = 'magic:'

export interface MagicLinkPayload {
  playerId: string
  tournamentId: string
  email: string
  createdAt: number
}

/**
 * Group-invite token payload.
 * Email-bound: only the invited email may accept.
 * Single-use: consumed on validateGroupInviteToken.
 */
export interface GroupInvitePayload {
  type: 'group-invite'
  groupId: string
  email: string
  createdAt: number
}

export interface GeneratedMagicLink {
  token: string
  expiresAt: number
  payload: MagicLinkPayload
}

export async function generateMagicLinkToken(
  payload: MagicLinkPayload,
  ttlSeconds: number,
  store: TokenStore
): Promise<GeneratedMagicLink> {
  const token = crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('hex')
  const key = `${KEY_PREFIX}${token}`
  const value = JSON.stringify(payload)
  await store.set(key, value, ttlSeconds)

  return {
    token,
    expiresAt: Date.now() + ttlSeconds * 1000,
    payload,
  }
}

export async function validateMagicLinkToken(
  token: string,
  store: TokenStore
): Promise<MagicLinkPayload> {
  if (!token) {
    throw new TokenInvalidError('Token cannot be empty')
  }

  const key = `${KEY_PREFIX}${token}`
  const value = await store.get(key)

  if (!value) {
    throw new TokenInvalidError('Token is invalid or has expired')
  }

  await store.del(key)

  try {
    const payload = JSON.parse(value) as MagicLinkPayload
    return payload
  } catch {
    throw new TokenInvalidError('Token value is corrupted')
  }
}

export async function validateMagicLinkTokenReadOnly(
  token: string,
  store: TokenStore
): Promise<MagicLinkPayload> {
  if (!token) {
    throw new TokenInvalidError('Token cannot be empty')
  }

  const key = `${KEY_PREFIX}${token}`
  const value = await store.get(key)

  if (!value) {
    throw new TokenInvalidError('Token is invalid or has expired')
  }

  try {
    const payload = JSON.parse(value) as MagicLinkPayload
    return payload
  } catch {
    throw new TokenInvalidError('Token value is corrupted')
  }
}

export async function invalidateMagicLinkToken(
  token: string,
  store: TokenStore
): Promise<void> {
  const key = `${KEY_PREFIX}${token}`
  await store.del(key)
}

export interface GeneratedPlayerSession {
  token: string
  expiresAt: number
  payload: MagicLinkPayload
}

const SESSION_KEY_PREFIX = 'session:'

export async function generatePlayerSession(
  payload: MagicLinkPayload,
  ttlSeconds: number,
  store: TokenStore
): Promise<GeneratedPlayerSession> {
  const token = crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('hex')
  const key = `${SESSION_KEY_PREFIX}${token}`
  const value = JSON.stringify(payload)
  await store.set(key, value, ttlSeconds)

  return {
    token,
    expiresAt: Date.now() + ttlSeconds * 1000,
    payload,
  }
}

export async function validatePlayerSession(
  token: string,
  store: TokenStore
): Promise<MagicLinkPayload> {
  if (!token) {
    throw new TokenInvalidError('Token cannot be empty')
  }

  const key = `${SESSION_KEY_PREFIX}${token}`
  const value = await store.get(key)

  if (!value) {
    throw new TokenInvalidError('Token is invalid or has expired')
  }

  try {
    const payload = JSON.parse(value) as MagicLinkPayload
    return payload
  } catch {
    throw new TokenInvalidError('Token value is corrupted')
  }
}

export interface GeneratedGroupInvite {
  token: string
  expiresAt: number
  payload: GroupInvitePayload
}

/**
 * Mint a single-use, email-bound group-invite token.
 */
export async function generateGroupInviteToken(
  payload: GroupInvitePayload,
  ttlSeconds: number,
  store: TokenStore
): Promise<GeneratedGroupInvite> {
  const token = crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('hex')
  const key = `${KEY_PREFIX}${token}`
  const value = JSON.stringify(payload)
  await store.set(key, value, ttlSeconds)

  return {
    token,
    expiresAt: Date.now() + ttlSeconds * 1000,
    payload,
  }
}

/**
 * Validate a group-invite token.
 *
 * - Consumes the token (single-use).
 * - Enforces email binding: the presented email must match the stored email
 *   (case-insensitive). A wrong-email attempt does NOT consume the token.
 * - Enforces type=group-invite to prevent token-type confusion.
 */
export async function validateGroupInviteToken(
  token: string,
  presentedEmail: string,
  store: TokenStore
): Promise<GroupInvitePayload> {
  if (!token) {
    throw new TokenInvalidError('Token cannot be empty')
  }

  const key = `${KEY_PREFIX}${token}`
  const value = await store.get(key)

  if (!value) {
    throw new TokenInvalidError('Token is invalid or has expired')
  }

  let payload: GroupInvitePayload
  try {
    payload = JSON.parse(value) as GroupInvitePayload
  } catch {
    throw new TokenInvalidError('Token value is corrupted')
  }

  // Type guard — prevent using a player-login token on the invite accept path
  if (payload.type !== 'group-invite') {
    throw new TokenInvalidError('Token is not a group invite')
  }

  // Email binding — reject wrong email WITHOUT consuming the token
  if (!payload.email || payload.email.toLowerCase() !== presentedEmail.toLowerCase()) {
    throw new TokenInvalidError('Email does not match the invited address')
  }

  // Consume (single-use)
  await store.del(key)

  return payload
}
