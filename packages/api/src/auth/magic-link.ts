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
