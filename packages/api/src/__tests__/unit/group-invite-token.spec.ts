/**
 * G1.3 — Unit tests: group-invite token mint / validate
 *
 * Covers:
 *  - GroupInvitePayload carries groupId and type='group-invite'
 *  - Token is single-use (second validate fails)
 *  - Token is email-bound (wrong email cannot accept)
 */

import {
  generateGroupInviteToken,
  validateGroupInviteToken,
  GroupInvitePayload,
} from '../../auth/magic-link'
import { TokenInvalidError } from '../../auth/errors'
import { InMemoryTokenStore } from '../../auth/token-store'

const TTL = 24 * 3600

const INVITE_PAYLOAD: GroupInvitePayload = {
  type: 'group-invite',
  groupId: 'grp_abc123',
  email: 'invitee@example.com',
  createdAt: Date.now(),
}

describe('G1.3 — Group invite token: mint / validate', () => {
  describe('generateGroupInviteToken', () => {
    it('returns a 64-char hex token', async () => {
      const store = new InMemoryTokenStore()
      const result = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      expect(result.token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('payload carries groupId and type=group-invite', async () => {
      const store = new InMemoryTokenStore()
      const result = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      const stored = await store.get(`magic:${result.token}`)
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored!) as GroupInvitePayload
      expect(parsed.type).toBe('group-invite')
      expect(parsed.groupId).toBe(INVITE_PAYLOAD.groupId)
      expect(parsed.email).toBe(INVITE_PAYLOAD.email)
    })

    it('generates unique tokens on successive calls', async () => {
      const store = new InMemoryTokenStore()
      const r1 = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      const r2 = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      expect(r1.token).not.toBe(r2.token)
    })
  })

  describe('validateGroupInviteToken — single-use', () => {
    it('returns the payload for a valid token', async () => {
      const store = new InMemoryTokenStore()
      const { token } = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      const payload = await validateGroupInviteToken(token, INVITE_PAYLOAD.email, store)
      expect(payload.groupId).toBe(INVITE_PAYLOAD.groupId)
      expect(payload.type).toBe('group-invite')
    })

    it('SINGLE-USE: second validate on same token throws TokenInvalidError', async () => {
      const store = new InMemoryTokenStore()
      const { token } = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      await validateGroupInviteToken(token, INVITE_PAYLOAD.email, store)
      await expect(
        validateGroupInviteToken(token, INVITE_PAYLOAD.email, store)
      ).rejects.toThrow(TokenInvalidError)
    })

    it('SINGLE-USE: token is removed from store after consume', async () => {
      const store = new InMemoryTokenStore()
      const { token } = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      await validateGroupInviteToken(token, INVITE_PAYLOAD.email, store)
      const stored = await store.get(`magic:${token}`)
      expect(stored).toBeNull()
    })
  })

  describe('validateGroupInviteToken — email-bound', () => {
    it('EMAIL-BOUND: correct email accepts the token', async () => {
      const store = new InMemoryTokenStore()
      const { token } = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      await expect(
        validateGroupInviteToken(token, INVITE_PAYLOAD.email, store)
      ).resolves.toMatchObject({ groupId: INVITE_PAYLOAD.groupId })
    })

    it('EMAIL-BOUND: wrong email is rejected with TokenInvalidError', async () => {
      const store = new InMemoryTokenStore()
      const { token } = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      await expect(
        validateGroupInviteToken(token, 'wrong@example.com', store)
      ).rejects.toThrow(TokenInvalidError)
    })

    it('EMAIL-BOUND: wrong email does NOT consume the token (token still valid for right email)', async () => {
      const store = new InMemoryTokenStore()
      const { token } = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      // Wrong-email attempt should reject but NOT consume
      await expect(
        validateGroupInviteToken(token, 'attacker@example.com', store)
      ).rejects.toThrow(TokenInvalidError)
      // Token must still be valid for the correct email
      await expect(
        validateGroupInviteToken(token, INVITE_PAYLOAD.email, store)
      ).resolves.toMatchObject({ groupId: INVITE_PAYLOAD.groupId })
    })

    it('EMAIL-BOUND: email comparison is case-insensitive', async () => {
      const store = new InMemoryTokenStore()
      const { token } = await generateGroupInviteToken(INVITE_PAYLOAD, TTL, store)
      await expect(
        validateGroupInviteToken(token, INVITE_PAYLOAD.email.toUpperCase(), store)
      ).resolves.toMatchObject({ groupId: INVITE_PAYLOAD.groupId })
    })
  })

  describe('validateGroupInviteToken — invalid / expired', () => {
    it('throws TokenInvalidError for an unknown token', async () => {
      const store = new InMemoryTokenStore()
      await expect(
        validateGroupInviteToken('0'.repeat(64), INVITE_PAYLOAD.email, store)
      ).rejects.toThrow(TokenInvalidError)
    })

    it('throws TokenInvalidError for an empty token', async () => {
      const store = new InMemoryTokenStore()
      await expect(
        validateGroupInviteToken('', INVITE_PAYLOAD.email, store)
      ).rejects.toThrow(TokenInvalidError)
    })

    it('throws TokenInvalidError for an expired token', async () => {
      const store = new InMemoryTokenStore()
      const { token } = await generateGroupInviteToken(INVITE_PAYLOAD, 10, store)
      store._setExpiredForTest(`magic:${token}`)
      await expect(
        validateGroupInviteToken(token, INVITE_PAYLOAD.email, store)
      ).rejects.toThrow(TokenInvalidError)
    })

    it('rejects a payload with wrong type (not group-invite)', async () => {
      const store = new InMemoryTokenStore()
      // Manually store a token with wrong type
      const token = '1'.repeat(64)
      await store.set(`magic:${token}`, JSON.stringify({ type: 'player-login', email: INVITE_PAYLOAD.email, groupId: 'grp_x', createdAt: Date.now() }), TTL)
      await expect(
        validateGroupInviteToken(token, INVITE_PAYLOAD.email, store)
      ).rejects.toThrow(TokenInvalidError)
    })
  })

  describe('NO shareable / group-wide link path', () => {
    it('generateGroupInviteToken requires an email field (no anonymous invite)', async () => {
      const store = new InMemoryTokenStore()
      // Without email, the call must fail at runtime (TS catches this at compile time,
      // but we assert the payload structure requires it)
      const payloadWithoutEmail = { type: 'group-invite' as const, groupId: 'g1', createdAt: Date.now() } as any
      // If email is omitted, the email-binding check will reject it.
      // We assert there is no path that accepts a token without email validation.
      const { token } = await generateGroupInviteToken(payloadWithoutEmail, TTL, store)
      // A token generated without email should be rejected for any email presented
      // because the stored email is undefined, which !== any provided email
      await expect(
        validateGroupInviteToken(token, 'anyone@example.com', store)
      ).rejects.toThrow(TokenInvalidError)
    })
  })
})
