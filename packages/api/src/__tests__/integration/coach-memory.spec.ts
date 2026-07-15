/**
 * S6.1-S6.3 — 1:1 Coach memory: propose_remember, confirm/cancel, management routes (RED first)
 *
 * COACH_1TO1_IMPLEMENTATION.md §S6, design §5.2: propose_remember validates as
 * the asker (opt-in on, cap, length, near-duplicate) and drafts a coach-scope
 * card; confirm is mutate-first (memory service inserts player_memories) then
 * an atomic pending->confirmed flip, with the cap re-checked at confirm;
 * cancel needs no revalidation; forget (DELETE) needs no card at all.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { AccountRepository, PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { buildCoachToolContext } from '../../assistant/tools'
import { proposeRemember } from '../../assistant/propose-remember'
import { PlayerMemoryRepository } from '../../repositories/player-memory-repository'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'
import { ConversationRepository } from '../../repositories/conversation-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('S6 — 1:1 Coach memory', () => {
  let pool: Pool
  let app: Express
  let accountRepo: AccountRepository
  let playerRepo: PlayerRepository
  let memoryRepo: PlayerMemoryRepository
  let cardRepo: AssistantCardRepository

  const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool, { broadcastBus: broadcastBus as any })
    app = deps.app
    accountRepo = new AccountRepository(pool)
    playerRepo = new PlayerRepository(pool)
    memoryRepo = new PlayerMemoryRepository(pool)
    cardRepo = new AssistantCardRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function loginAndGetToken(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/auth/login').send({ email, password })
    if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`)
    return res.body.token as string
  }

  async function createAccountHolder(): Promise<{ token: string; playerId: string }> {
    const email = `coach-mem-${uid()}@test.local`
    const password = 'testpassword123'
    const player = await playerRepo.findOrCreatePlayerByEmail(
      email, `Player ${uid()}`, undefined, undefined, defaultAdultAttestation()
    )
    const account = await accountRepo.create(email, 'player')
    const passwordHash = await bcryptjs.hash(password, 10)
    await accountRepo.updatePasswordHash(account.id, passwordHash)
    await accountRepo.linkPlayer(account.id, player.id)
    const token = await loginAndGetToken(email, password)
    return { token, playerId: player.id }
  }

  describe('propose_remember (S6.1)', () => {
    it('creates a coach-scope card with the exact body shape and 15-min expiry', async () => {
      const { playerId } = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, playerId)

      const result = await proposeRemember(ctx, { text: 'prefers morning matches' })

      expect(result.status).toBe('card_posted')
      const card = await cardRepo.getCard((result as { cardId: string }).cardId)
      expect(card).toMatchObject({
        action: 'remember',
        args: { text: 'prefers morning matches' },
        status: 'pending',
        groupId: null,
      })
      expect(card!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000)
      expect(card!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 5000)
    })

    it('declines when coach_memory_enabled is off, no card created', async () => {
      const { playerId } = await createAccountHolder()
      await pool.query(
        `INSERT INTO public.player_settings (player_id, coach_memory_enabled) VALUES ($1, false)
         ON CONFLICT (player_id) DO UPDATE SET coach_memory_enabled = false`,
        [playerId]
      )
      const ctx = await buildCoachToolContext(pool, playerId)

      const before = await memoryRepo.countMemories(playerId)
      const result = await proposeRemember(ctx, { text: 'anything' })
      expect(result.status).toBe('declined')
      expect(await memoryRepo.countMemories(playerId)).toBe(before)
    })

    it('declines when the ~20 cap is already reached, no card created', async () => {
      const { playerId } = await createAccountHolder()
      for (let i = 0; i < 20; i++) {
        await memoryRepo.insertMemory({ playerId, body: `memory ${i}`, source: 'player' })
      }
      const ctx = await buildCoachToolContext(pool, playerId)

      const result = await proposeRemember(ctx, { text: 'one more' })
      expect(result.status).toBe('declined')
      expect(await memoryRepo.countMemories(playerId)).toBe(20)
    })

    it('declines a body over 280 chars, no card created', async () => {
      const { playerId } = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, playerId)

      const result = await proposeRemember(ctx, { text: 'x'.repeat(281) })
      expect(result.status).toBe('declined')
      expect(await memoryRepo.countMemories(playerId)).toBe(0)
    })

    it('declines a case-insensitive near-duplicate of an existing memory, no card created', async () => {
      const { playerId } = await createAccountHolder()
      await memoryRepo.insertMemory({ playerId, body: 'Prefers Morning Matches', source: 'player' })
      const ctx = await buildCoachToolContext(pool, playerId)

      const result = await proposeRemember(ctx, { text: 'prefers morning matches' })
      expect(result.status).toBe('declined')
      expect(await memoryRepo.countMemories(playerId)).toBe(1)
    })
  })

  describe('POST /player/coach/cards/:cardId/confirm (S6.2)', () => {
    it('happy path: inserts the memory then flips the card to confirmed', async () => {
      const { token, playerId } = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, playerId)
      const proposed = await proposeRemember(ctx, { text: 'plays lefty' })
      const cardId = (proposed as { cardId: string }).cardId

      const res = await request(app)
        .post(`/player/coach/cards/${cardId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.card.status).toBe('confirmed')

      const memories = await memoryRepo.listMemories(playerId)
      expect(memories.some(m => m.body === 'plays lefty')).toBe(true)
    })

    it('emits card.updated on the coach conversation channel', async () => {
      const { token, playerId } = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, playerId)
      const conversationId = await new ConversationRepository(pool).resolveCoachConversation(playerId)
      const proposed = await proposeRemember(ctx, { text: 'emit test' })
      const cardId = (proposed as { cardId: string }).cardId

      const before = broadcastBus.emit.mock.calls.length
      await request(app).post(`/player/coach/cards/${cardId}/confirm`).set('Authorization', `Bearer ${token}`)

      const calls = broadcastBus.emit.mock.calls.slice(before) as any[]
      expect(calls).toHaveLength(1)
      expect(calls[0][0]).toBe(conversationId)
      expect(calls[0][1]).toBe('card.updated')
      expect(calls[0][2]).toMatchObject({ cardId, status: 'confirmed' })
    })

    it('another player cannot confirm someone else\'s card (403/404)', async () => {
      const owner = await createAccountHolder()
      const intruder = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, owner.playerId)
      const proposed = await proposeRemember(ctx, { text: 'a private preference' })
      const cardId = (proposed as { cardId: string }).cardId

      const res = await request(app)
        .post(`/player/coach/cards/${cardId}/confirm`)
        .set('Authorization', `Bearer ${intruder.token}`)
      expect([403, 404]).toContain(res.status)
    })

    it('an unknown card id is 404', async () => {
      const { token } = await createAccountHolder()
      const res = await request(app)
        .post(`/player/coach/cards/${crypto.randomUUID()}/confirm`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(404)
    })

    it('an already-confirmed card is 409', async () => {
      const { token, playerId } = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, playerId)
      const proposed = await proposeRemember(ctx, { text: 'already confirmed once' })
      const cardId = (proposed as { cardId: string }).cardId

      await request(app).post(`/player/coach/cards/${cardId}/confirm`).set('Authorization', `Bearer ${token}`)
      const second = await request(app)
        .post(`/player/coach/cards/${cardId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
      expect(second.status).toBe(409)
    })

    it('an expired card is 409', async () => {
      const { token, playerId } = await createAccountHolder()
      const convRepo = new ConversationRepository(pool)
      const convId = await convRepo.resolveCoachConversation(playerId)
      const { card } = await cardRepo.createCoachCard({
        conversationId: convId,
        proposerPlayerId: playerId,
        action: 'remember',
        args: { text: 'expired one' },
        body: 'Coach wants to remember: "expired one". Only you can confirm.',
        expiresInSeconds: -1,
      })

      const res = await request(app)
        .post(`/player/coach/cards/${card.id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(409)
    })

    it('cap re-check at confirm: 20 memories added between draft and confirm -> card fails', async () => {
      const { token, playerId } = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, playerId)
      const proposed = await proposeRemember(ctx, { text: 'squeezed in' })
      const cardId = (proposed as { cardId: string }).cardId

      for (let i = 0; i < 20; i++) {
        await memoryRepo.insertMemory({ playerId, body: `filler ${i}`, source: 'player' })
      }

      const res = await request(app)
        .post(`/player/coach/cards/${cardId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.card.status).toBe('failed')
      expect(await memoryRepo.countMemories(playerId)).toBe(20) // the squeezed-in memory was NOT added
    })
  })

  describe('POST /player/coach/cards/:cardId/cancel', () => {
    it('the proposer can cancel a pending card', async () => {
      const { token, playerId } = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, playerId)
      const proposed = await proposeRemember(ctx, { text: 'to be cancelled' })
      const cardId = (proposed as { cardId: string }).cardId

      const res = await request(app)
        .post(`/player/coach/cards/${cardId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.card.status).toBe('cancelled')
      expect(await memoryRepo.countMemories(playerId)).toBe(0)
    })

    it('emits card.updated with status cancelled', async () => {
      const { token, playerId } = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, playerId)
      const conversationId = await new ConversationRepository(pool).resolveCoachConversation(playerId)
      const proposed = await proposeRemember(ctx, { text: 'cancel emit test' })
      const cardId = (proposed as { cardId: string }).cardId

      const before = broadcastBus.emit.mock.calls.length
      await request(app).post(`/player/coach/cards/${cardId}/cancel`).set('Authorization', `Bearer ${token}`)

      const calls = broadcastBus.emit.mock.calls.slice(before) as any[]
      expect(calls).toHaveLength(1)
      expect(calls[0][0]).toBe(conversationId)
      expect(calls[0][1]).toBe('card.updated')
      expect(calls[0][2]).toMatchObject({ cardId, status: 'cancelled' })
    })

    it('an unknown card id is 404', async () => {
      const { token } = await createAccountHolder()
      const res = await request(app)
        .post(`/player/coach/cards/${crypto.randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(404)
    })

    it('another player cannot cancel someone else\'s card (403)', async () => {
      const owner = await createAccountHolder()
      const intruder = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, owner.playerId)
      const proposed = await proposeRemember(ctx, { text: 'not yours to cancel' })
      const cardId = (proposed as { cardId: string }).cardId

      const res = await request(app)
        .post(`/player/coach/cards/${cardId}/cancel`)
        .set('Authorization', `Bearer ${intruder.token}`)
      expect(res.status).toBe(403)
    })

    it('an already-resolved card is 409', async () => {
      const { token, playerId } = await createAccountHolder()
      const ctx = await buildCoachToolContext(pool, playerId)
      const proposed = await proposeRemember(ctx, { text: 'cancel twice' })
      const cardId = (proposed as { cardId: string }).cardId

      await request(app).post(`/player/coach/cards/${cardId}/cancel`).set('Authorization', `Bearer ${token}`)
      const second = await request(app)
        .post(`/player/coach/cards/${cardId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
      expect(second.status).toBe(409)
    })
  })

  describe('memory management routes (S6.3)', () => {
    it('GET /player/coach/memories lists the owner\'s memories newest-first', async () => {
      const { token, playerId } = await createAccountHolder()
      await memoryRepo.insertMemory({ playerId, body: 'first', source: 'player' })
      await memoryRepo.insertMemory({ playerId, body: 'second', source: 'coach' })

      const res = await request(app).get('/player/coach/memories').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.memories.map((m: any) => m.body)).toEqual(['second', 'first'])
      expect(res.body.memories[0]).toHaveProperty('id')
      expect(res.body.memories[0]).toHaveProperty('source', 'coach')
      expect(res.body.memories[0]).toHaveProperty('createdAt')
    })

    it('DELETE /player/coach/memories/:id removes the owner\'s memory (204)', async () => {
      const { token, playerId } = await createAccountHolder()
      const memory = await memoryRepo.insertMemory({ playerId, body: 'to delete', source: 'player' })

      const res = await request(app)
        .delete(`/player/coach/memories/${memory.id}`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(204)
      expect(await memoryRepo.countMemories(playerId)).toBe(0)
    })

    it('DELETE on a nonexistent/foreign memory id is 404', async () => {
      const owner = await createAccountHolder()
      const intruder = await createAccountHolder()
      const memory = await memoryRepo.insertMemory({ playerId: owner.playerId, body: 'owned', source: 'player' })

      const res = await request(app)
        .delete(`/player/coach/memories/${memory.id}`)
        .set('Authorization', `Bearer ${intruder.token}`)
      expect(res.status).toBe(404)
      expect(await memoryRepo.countMemories(owner.playerId)).toBe(1)
    })
  })
})
