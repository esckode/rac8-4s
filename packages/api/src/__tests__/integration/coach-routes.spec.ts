/**
 * S2.1 — 1:1 Coach routes: messages, history, clear, SSE (RED first)
 *
 * Covers (COACH_1TO1_IMPLEMENTATION.md §S2.1):
 *  - GET /player/coach/messages lazily creates the conversation + posts the
 *    one-time intro exactly once; supports ?limit=; ascending order.
 *  - POST /player/coach/messages inserts the player's text row, enqueues a
 *    coach.turn job (jobId 'coach-<messageId>', hyphen not colon); body/
 *    timezone validation.
 *  - Auth: no header → 401; a magic-link/player-session token (no linked
 *    account) → 401/403 — the 1:1 surface is account-holders only.
 *  - POST /player/coach/clear hard-deletes the thread + its cards; returns
 *    {cleared: n}; a fresh intro re-posts on the next GET.
 *  - GET /player/coach/events is an SSE stream.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { InMemoryJobQueue } from '@worker/job-queue'
import { generatePlayerSession } from '../../auth/magic-link'
import { AccountRepository, PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { ConversationRepository } from '../../repositories/conversation-repository'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('S2.1 — 1:1 Coach routes', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jobQueue: InMemoryJobQueue
  let accountRepo: AccountRepository
  let playerRepo: PlayerRepository
  let conversationRepo: ConversationRepository
  // Mirrors bracket-sse.spec.ts's precedent: assert on the subscribe/emit surface
  // rather than driving a live SSE stream through supertest (which never ends).
  const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    jobQueue = new InMemoryJobQueue()
    const deps = createTestApp(pool, { jobQueue, broadcastBus: broadcastBus as any })
    app = deps.app
    tokenStore = deps.tokenStore
    accountRepo = new AccountRepository(pool)
    playerRepo = new PlayerRepository(pool)
    conversationRepo = new ConversationRepository(pool)
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
    const email = `coach-route-${uid()}@test.local`
    const password = 'testpassword123'

    const player = await playerRepo.findOrCreatePlayerByEmail(
      email,
      `Player ${uid()}`,
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    const account = await accountRepo.create(email, 'player')
    const passwordHash = await bcryptjs.hash(password, 10)
    await accountRepo.updatePasswordHash(account.id, passwordHash)
    await accountRepo.linkPlayer(account.id, player.id)

    const token = await loginAndGetToken(email, password)
    return { token, playerId: player.id }
  }

  async function createGuestToken(): Promise<string> {
    const player = await playerRepo.findOrCreatePlayerByEmail(
      `coach-guest-${uid()}@test.local`,
      `Guest ${uid()}`,
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    const session = await generatePlayerSession(
      { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return session.token
  }

  function coachJobs(before: number): any[] {
    const all = Array.from((jobQueue as any).jobs.values()) as any[]
    return all.slice(before).filter((j: any) => j.name === 'coach.turn')
  }

  describe('auth', () => {
    it('rejects with 401 when no auth header is present', async () => {
      const res = await request(app).get('/player/coach/messages')
      expect(res.status).toBe(401)
    })

    it('rejects a magic-link/player-session token (guest, no linked account) with 401/403', async () => {
      const guestToken = await createGuestToken()
      const res = await request(app)
        .get('/player/coach/messages')
        .set('Authorization', `Bearer ${guestToken}`)
      expect([401, 403]).toContain(res.status)
    })
  })

  describe('GET /player/coach/messages', () => {
    it('lazily creates the conversation and posts the one-time intro exactly once', async () => {
      const { token } = await createAccountHolder()

      const first = await request(app).get('/player/coach/messages').set('Authorization', `Bearer ${token}`)
      expect(first.status).toBe(200)
      expect(first.body.conversationId).toEqual(expect.any(String))
      expect(first.body.messages).toHaveLength(1)
      expect(first.body.messages[0].type).toBe('assistant')
      expect(first.body.messages[0].body).toMatch(/Coach/)

      const second = await request(app).get('/player/coach/messages').set('Authorization', `Bearer ${token}`)
      expect(second.status).toBe(200)
      expect(second.body.messages).toHaveLength(1)
      expect(second.body.conversationId).toBe(first.body.conversationId)
    })

    it('supports ?limit= (default 50, max 200) in ascending order', async () => {
      const { token } = await createAccountHolder()
      await request(app).get('/player/coach/messages').set('Authorization', `Bearer ${token}`)

      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/player/coach/messages')
          .set('Authorization', `Bearer ${token}`)
          .send({ body: `message ${i}` })
      }

      const res = await request(app)
        .get('/player/coach/messages?limit=2')
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.messages).toHaveLength(2)
      // ascending: earlier-created message first
      expect(new Date(res.body.messages[0].createdAt).getTime())
        .toBeLessThanOrEqual(new Date(res.body.messages[1].createdAt).getTime())
    })

    it('exposes card fields (cardId, cardStatus, ...) for a message with a coach-scope card — the ActionCard render path', async () => {
      const { token, playerId } = await createAccountHolder()
      const conversationRepo = new ConversationRepository(pool)
      const cardRepo = new AssistantCardRepository(pool)
      const conversationId = await conversationRepo.resolveCoachConversation(playerId)
      const { card } = await cardRepo.createCoachCard({
        conversationId,
        proposerPlayerId: playerId,
        action: 'remember',
        args: { text: 'prefers morning matches' },
        body: 'Coach wants to remember: "prefers morning matches". Only you can confirm.',
      })

      const res = await request(app).get('/player/coach/messages').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      const cardMessage = res.body.messages.find((m: any) => m.id === card.messageId)
      expect(cardMessage).toMatchObject({
        cardId: card.id,
        cardAction: 'remember',
        cardArgs: { text: 'prefers morning matches' },
        cardStatus: 'pending',
        cardProposerPlayerId: playerId,
      })
      expect(cardMessage.cardExpiresAt).toBeTruthy()
    })
  })

  describe('POST /player/coach/messages', () => {
    it('inserts the text row, enqueues coach.turn with the hyphen jobId, returns 201', async () => {
      const { token, playerId } = await createAccountHolder()
      const before = (jobQueue as any).jobs.size

      const res = await request(app)
        .post('/player/coach/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'who am I playing next?' })

      expect(res.status).toBe(201)
      expect(res.body.playerId).toBe(playerId)
      expect(res.body.type).toBe('text')

      const jobs = coachJobs(before)
      expect(jobs).toHaveLength(1)
      expect(jobs[0].id).toBe(`coach-${res.body.id}`)
      expect(jobs[0].data).toMatchObject({
        messageId: res.body.id,
        conversationId: res.body.conversationId,
        playerId,
        body: 'who am I playing next?',
      })
    })

    it('threads an optional timezone through to the job payload', async () => {
      const { token } = await createAccountHolder()
      const before = (jobQueue as any).jobs.size

      const res = await request(app)
        .post('/player/coach/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'hello', timezone: 'America/New_York' })

      expect(res.status).toBe(201)
      const jobs = coachJobs(before)
      expect(jobs[0].data.timezone).toBe('America/New_York')
    })

    it('rejects an empty body', async () => {
      const { token } = await createAccountHolder()
      const res = await request(app)
        .post('/player/coach/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: '   ' })
      expect(res.status).toBe(400)
    })

    it('rejects a body over the length cap', async () => {
      const { token } = await createAccountHolder()
      const res = await request(app)
        .post('/player/coach/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'x'.repeat(4001) })
      expect(res.status).toBe(400)
    })

    it('rejects a timezone longer than 64 characters', async () => {
      const { token } = await createAccountHolder()
      const res = await request(app)
        .post('/player/coach/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'hello', timezone: 'x'.repeat(65) })
      expect(res.status).toBe(400)
    })

    it('rejects with 401 when no auth header is present', async () => {
      const res = await request(app).post('/player/coach/messages').send({ body: 'hello' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /player/coach/clear', () => {
    it('hard-deletes the thread and re-posts a fresh intro on the next GET', async () => {
      const { token } = await createAccountHolder()
      await request(app).get('/player/coach/messages').set('Authorization', `Bearer ${token}`)
      await request(app)
        .post('/player/coach/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'hello' })

      const clearRes = await request(app).post('/player/coach/clear').set('Authorization', `Bearer ${token}`)
      expect(clearRes.status).toBe(200)
      expect(clearRes.body.cleared).toBeGreaterThanOrEqual(2)

      const after = await request(app).get('/player/coach/messages').set('Authorization', `Bearer ${token}`)
      expect(after.status).toBe(200)
      expect(after.body.messages).toHaveLength(1)
      expect(after.body.messages[0].type).toBe('assistant')
    })
  })

  describe('GET /player/coach/events', () => {
    // A real SSE connection is never fully driven at the integration-test level here
    // (the codebase's own precedent, bracket-sse.spec.ts, only asserts the emit/subscribe
    // surface from non-streaming routes) — opening and then aborting a live connection
    // through supertest left a dangling handle that hung the whole Jest process. The live
    // round trip is exercised for real by e2e/coach.spec.ts (S10.1 scenario 2) instead.
    it('rejects with 401 when no auth header is present', async () => {
      const res = await request(app).get('/player/coach/events')
      expect(res.status).toBe(401)
    })

    it('responds 503 when no broadcast bus is configured', async () => {
      const deps = createTestApp(pool, { jobQueue })
      const { token } = await createAccountHolder()
      const res = await request(deps.app)
        .get('/player/coach/events')
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(503)
    })
  })
})
