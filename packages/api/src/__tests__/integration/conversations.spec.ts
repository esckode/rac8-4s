/**
 * V1.0 — `conversations` abstraction
 *
 * These tests are written FIRST (TDD red step). They will fail until:
 *   1. Migration 034 is applied (conversations table + messages.conversation_id).
 *   2. ConversationRepository is implemented.
 *   3. MessageRepository methods are rekeyed to conversation_id.
 *   4. BroadcastBus / SSE subscribe on conversation_id.
 *
 * All DB work runs through the transactional test harness (getTestPool / getTestPool)
 * so the suite leaves no persistent data.
 */
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction, closeTestPool } from '../helpers/db'
import { TournamentFactory, OrganizerFactory, PlayerFactory } from '../factories'
import { ConversationRepository } from '../../repositories/conversation-repository'
import { MessageRepository } from '../../repositories/message-repository'
import { BroadcastBus } from '../../broadcast-bus'
import { InMemoryTokenStore } from '../../auth/token-store'
import { createTestApp } from '../helpers/app'
import { InMemoryJobQueue } from '@worker/job-queue'
import request from 'supertest'
import { generatePlayerSession } from '../../auth/magic-link'

describe('V1.0 conversations abstraction', () => {
  let pool: Pool
  let convRepo: ConversationRepository
  let msgRepo: MessageRepository
  let organizerId: string

  beforeAll(async () => {
    pool = await getTestPool()
    convRepo = new ConversationRepository(pool)
    msgRepo = new MessageRepository(pool)

    const { sub } = OrganizerFactory.token({
      secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
      expiresInSeconds: 3600,
    })
    organizerId = sub
  })

  afterAll(async () => {
    await closeTestPool()
  })

  beforeEach(async () => {
    await beginTransaction(pool)
  })

  afterEach(async () => {
    await rollbackTransaction()
  })

  // ── Migration: conversations table exists ─────────────────────────────────

  describe('conversations table (migration 034)', () => {
    it('messaging.conversations table exists with expected columns', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'messaging' AND table_name = 'conversations'
        ORDER BY ordinal_position
      `)
      const cols = res.rows.map((r: any) => r.column_name)
      expect(cols).toContain('id')
      expect(cols).toContain('type')
      expect(cols).toContain('tournament_id')
      expect(cols).toContain('group_id')
    })

    it('messaging.messages has conversation_id column (NOT NULL)', async () => {
      const res = await pool.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'messages'
          AND column_name = 'conversation_id'
      `)
      expect(res.rows.length).toBe(1)
      expect(res.rows[0].is_nullable).toBe('NO')
    })
  })

  // ── ConversationRepository.resolveConversation ────────────────────────────

  describe('ConversationRepository', () => {
    it('resolveConversation returns a UUID for a tournament', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const convId = await convRepo.resolveConversation(t.id)
      expect(typeof convId).toBe('string')
      // UUID format check
      expect(convId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('resolveConversation is idempotent — same tournament always returns same conversation_id', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const id1 = await convRepo.resolveConversation(t.id)
      const id2 = await convRepo.resolveConversation(t.id)
      expect(id1).toBe(id2)
    })

    it('different tournaments get different conversation_ids', async () => {
      const t1 = await TournamentFactory.create(pool, organizerId)
      const t2 = await TournamentFactory.create(pool, organizerId)
      const id1 = await convRepo.resolveConversation(t1.id)
      const id2 = await convRepo.resolveConversation(t2.id)
      expect(id1).not.toBe(id2)
    })

    it('created conversation has type=tournament', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const convId = await convRepo.resolveConversation(t.id)
      const res = await pool.query(
        'SELECT type, tournament_id FROM messaging.conversations WHERE id = $1',
        [convId]
      )
      expect(res.rows[0].type).toBe('tournament')
      expect(res.rows[0].tournament_id).toBe(t.id)
    })
  })

  // ── MessageRepository: operations keyed by conversation_id ────────────────

  describe('MessageRepository with conversation_id', () => {
    it('sendDirectMessage links message to conversation', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const convId = await convRepo.resolveConversation(t.id)
      const sender = await PlayerFactory.createAndRegister(pool, t.id)
      const recipient = await PlayerFactory.createAndRegister(pool, t.id)

      const msg = await msgRepo.sendDirectMessage({
        tournamentId: t.id,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'hello v1',
      })

      // The stored message must have conversation_id set
      const dbRow = await pool.query(
        'SELECT conversation_id FROM messaging.messages WHERE id = $1',
        [msg.id]
      )
      expect(dbRow.rows[0].conversation_id).toBe(convId)
    })

    it('sendBroadcast links message to conversation', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const convId = await convRepo.resolveConversation(t.id)
      await PlayerFactory.createAndRegister(pool, t.id)

      const { message } = await msgRepo.sendBroadcast({
        tournamentId: t.id,
        senderPlayerId: organizerId,
        body: 'broadcast v1',
      })

      const dbRow = await pool.query(
        'SELECT conversation_id FROM messaging.messages WHERE id = $1',
        [message.id]
      )
      expect(dbRow.rows[0].conversation_id).toBe(convId)
    })

    it('getHistory fetches messages by conversationId', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const convId = await convRepo.resolveConversation(t.id)
      const sender = await PlayerFactory.createAndRegister(pool, t.id)
      const recipient = await PlayerFactory.createAndRegister(pool, t.id)

      await msgRepo.sendDirectMessage({
        tournamentId: t.id,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'msg A',
      })
      await msgRepo.sendDirectMessage({
        tournamentId: t.id,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'msg B',
      })

      const messages = await msgRepo.getHistoryByConversation({ conversationId: convId, limit: 10 })
      expect(messages.length).toBe(2)
      expect(messages.map((m: any) => m.body).sort()).toEqual(['msg A', 'msg B'])
    })

    it('getHistory by conversationId isolates messages from other tournaments', async () => {
      const t1 = await TournamentFactory.create(pool, organizerId)
      const t2 = await TournamentFactory.create(pool, organizerId)
      const convId1 = await convRepo.resolveConversation(t1.id)
      const convId2 = await convRepo.resolveConversation(t2.id)
      const sender1 = await PlayerFactory.createAndRegister(pool, t1.id)
      const sender2 = await PlayerFactory.createAndRegister(pool, t2.id)
      const r1 = await PlayerFactory.createAndRegister(pool, t1.id)
      const r2 = await PlayerFactory.createAndRegister(pool, t2.id)

      await msgRepo.sendDirectMessage({ tournamentId: t1.id, senderPlayerId: sender1.id, recipientPlayerId: r1.id, body: 't1 msg' })
      await msgRepo.sendDirectMessage({ tournamentId: t2.id, senderPlayerId: sender2.id, recipientPlayerId: r2.id, body: 't2 msg' })

      const msgs1 = await msgRepo.getHistoryByConversation({ conversationId: convId1, limit: 10 })
      const msgs2 = await msgRepo.getHistoryByConversation({ conversationId: convId2, limit: 10 })

      expect(msgs1.length).toBe(1)
      expect(msgs1[0].body).toBe('t1 msg')
      expect(msgs2.length).toBe(1)
      expect(msgs2[0].body).toBe('t2 msg')
    })
  })

  // ── BroadcastBus: rekeyed on conversation_id ──────────────────────────────

  describe('BroadcastBus keyed on conversation_id', () => {
    it('bus emitting on conversation_id is received by subscriber on that conversation_id', () => {
      const bus = new BroadcastBus()
      const convId = 'conv-id-abc'
      const listener = jest.fn()

      bus.subscribe(convId, listener)
      bus.emit(convId, 'message.created', { body: 'hello' })

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith('message.created', { body: 'hello' })
    })

    it('bus subscriber on conversation_id does NOT receive events for a different conversation_id', () => {
      const bus = new BroadcastBus()
      const listener = jest.fn()

      bus.subscribe('conv-A', listener)
      bus.emit('conv-B', 'message.created', { body: 'nope' })

      expect(listener).not.toHaveBeenCalled()
    })
  })

  // ── HTTP routes resolve tournament → conversation (integration) ───────────

  describe('HTTP routes: tournament resolves to conversation_id for bus emit', () => {
    it('POST /tournaments/:id/messages emits message.created on the conversation_id channel (not tournamentId)', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const convId = await convRepo.resolveConversation(t.id)
      const sender = await PlayerFactory.createAndRegister(pool, t.id)
      const recipient = await PlayerFactory.createAndRegister(pool, t.id)

      // V5.1: sender and recipient must be matched opponents to send a DM via HTTP.
      const groupId = `grp_convtest_${Date.now()}`
      await pool.query(
        `INSERT INTO public.groups (id, tournament_id, name, created_at)
         VALUES ($1, $2, 'Conv Test Group', now())`,
        [groupId, t.id]
      )
      await pool.query(
        `INSERT INTO public.group_matches
           (id, group_id, tournament_id, format, player1_id, player2_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'singles', $4, $5, 'pending', now(), now())`,
        [`gm_convtest_${Date.now()}`, groupId, t.id, sender.id, recipient.id]
      )

      const tokenStore = new InMemoryTokenStore()
      const bus = new BroadcastBus()
      const jobQueue = new InMemoryJobQueue()
      const { app } = createTestApp(pool, { broadcastBus: bus, jobQueue })

      const session = await generatePlayerSession(
        { playerId: sender.id, tournamentId: t.id, email: sender.email, createdAt: Date.now() },
        3600,
        tokenStore
      )

      // Patch the app's tokenStore — createTestApp creates its own; we rebuild
      // using the exported helper that accepts overrides.
      // Instead: re-create app with a tokenStore that knows about this session.
      // The test helper doesn't expose tokenStore override, so we use the returned
      // tokenStore from createTestApp and generate a session there.
      const { app: testApp, tokenStore: ts } = createTestApp(pool, { broadcastBus: bus, jobQueue })
      const sess = await generatePlayerSession(
        { playerId: sender.id, tournamentId: t.id, email: sender.email, createdAt: Date.now() },
        3600,
        ts
      )

      // Subscribe on conversation_id
      const received: unknown[] = []
      bus.subscribe(convId, (_event: string, data: unknown) => received.push(data))

      // Subscribe on tournamentId to verify it does NOT receive the event
      const wrongChannel: unknown[] = []
      bus.subscribe(t.id, (_event: string, data: unknown) => wrongChannel.push(data))

      await request(testApp)
        .post(`/tournaments/${t.id}/messages`)
        .set('Authorization', `Bearer ${sess.token}`)
        .send({ body: 'hello world', recipientPlayerId: recipient.id })

      // The event should arrive on convId channel
      expect(received.length).toBe(1)
      // The event should NOT arrive on the raw tournamentId channel
      expect(wrongChannel.length).toBe(0)
    })

    it('GET /tournaments/:id/messages (history) returns messages by conversation', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const sender = await PlayerFactory.createAndRegister(pool, t.id)
      const recipient = await PlayerFactory.createAndRegister(pool, t.id)

      const { app: testApp, tokenStore: ts } = createTestApp(pool, { broadcastBus: new BroadcastBus(), jobQueue: new InMemoryJobQueue() })
      const sess = await generatePlayerSession(
        { playerId: sender.id, tournamentId: t.id, email: sender.email, createdAt: Date.now() },
        3600,
        ts
      )

      // Send a message via repo (direct, avoids second HTTP call)
      await msgRepo.sendDirectMessage({
        tournamentId: t.id,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'a message',
      })

      const res = await request(testApp)
        .get(`/tournaments/${t.id}/messages`)
        .set('Authorization', `Bearer ${sess.token}`)

      expect(res.status).toBe(200)
      expect(res.body.messages.length).toBe(1)
      expect(res.body.messages[0].body).toBe('a message')
    })
  })

  // ── Backfill: existing messages linked to their conversation ─────────────

  describe('migration backfill invariants', () => {
    it('every message has a non-null conversation_id', async () => {
      // Insert a message the normal way, then verify conversation_id is set
      const t = await TournamentFactory.create(pool, organizerId)
      const sender = await PlayerFactory.createAndRegister(pool, t.id)
      const recipient = await PlayerFactory.createAndRegister(pool, t.id)

      await msgRepo.sendDirectMessage({
        tournamentId: t.id,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'check conv_id',
      })

      const res = await pool.query(`
        SELECT COUNT(*) AS n
        FROM messaging.messages
        WHERE conversation_id IS NULL
      `)
      expect(Number(res.rows[0].n)).toBe(0)
    })

    it('each tournament has at most one conversation row of type=tournament', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      // Resolve multiple times — must still be exactly one row
      await convRepo.resolveConversation(t.id)
      await convRepo.resolveConversation(t.id)
      await convRepo.resolveConversation(t.id)

      const res = await pool.query(
        `SELECT COUNT(*) AS n FROM messaging.conversations WHERE tournament_id = $1 AND type = 'tournament'`,
        [t.id]
      )
      expect(Number(res.rows[0].n)).toBe(1)
    })

    it('all existing messages are linked to a conversation matching their tournament', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const sender = await PlayerFactory.createAndRegister(pool, t.id)
      const recipient = await PlayerFactory.createAndRegister(pool, t.id)

      await msgRepo.sendDirectMessage({
        tournamentId: t.id,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'linked check',
      })

      // Verify all messages for this tournament have a conversation whose tournament_id matches
      const res = await pool.query(`
        SELECT COUNT(*) AS n
        FROM messaging.messages m
        JOIN messaging.conversations c ON c.id = m.conversation_id
        WHERE m.tournament_id = $1
          AND c.tournament_id = m.tournament_id
      `, [t.id])
      expect(Number(res.rows[0].n)).toBe(1)
    })
  })
})
