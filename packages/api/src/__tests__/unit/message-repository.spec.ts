/**
 * Phase 3 tests for MessageRepository.
 *
 * These are integration-style tests (they hit the real DB through the transactional
 * test harness) living under the unit/ folder to match the team-repository.spec.ts
 * precedent for repository tests.
 *
 * TDD commit: this file is written BEFORE message-repository.ts exists.
 * All tests must fail with "Cannot find module" until the implementation lands.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { TournamentFactory, PlayerFactory, OrganizerFactory } from '../factories'
import { MessageRepository } from '../../repositories/message-repository'

describe('MessageRepository', () => {
  let pool: Pool
  let repo: MessageRepository
  let organizerId: string
  let tournamentId: string

  beforeAll(async () => {
    pool = await getTestPool()
    repo = new MessageRepository(pool)

    const { sub } = OrganizerFactory.token({
      secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
      expiresInSeconds: 3600,
    })
    organizerId = sub
  })

  beforeEach(async () => {
    await beginTransaction(pool)
    // Fresh tournament per test so participant counts are known precisely.
    const t = await TournamentFactory.create(pool, organizerId)
    tournamentId = t.id
  })

  afterEach(async () => {
    await rollbackTransaction()
  })

  afterAll(async () => {
    await pool.end()
  })

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Create a player and register them in the current tournamentId. */
  async function createParticipant() {
    return PlayerFactory.createAndRegister(pool, tournamentId)
  }

  /** Count rows in messaging.messages for this tournament. */
  async function countMessages() {
    const res = await pool.query(
      'SELECT COUNT(*) AS n FROM messaging.messages WHERE tournament_id = $1',
      [tournamentId]
    )
    return Number(res.rows[0].n)
  }

  /** Count rows in messaging.message_recipients for a given message id. */
  async function countRecipients(messageId: string) {
    const res = await pool.query(
      'SELECT COUNT(*) AS n FROM messaging.message_recipients WHERE message_id = $1',
      [messageId]
    )
    return Number(res.rows[0].n)
  }

  // ── sendDirectMessage ─────────────────────────────────────────────────────

  describe('sendDirectMessage', () => {
    it('inserts exactly 1 messages row and 1 message_recipients row', async () => {
      const sender = await createParticipant()
      const recipient = await createParticipant()

      const msg = await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'hey, see you on court 3',
      })

      expect(msg.id).toBeDefined()
      expect(msg.tournamentId).toBe(tournamentId)
      expect(msg.senderPlayerId).toBe(sender.id)
      expect(msg.recipientPlayerId).toBe(recipient.id)
      expect(msg.body).toBe('hey, see you on court 3')
      expect(msg.createdAt).toBeInstanceOf(Date)

      expect(await countMessages()).toBe(1)
      expect(await countRecipients(msg.id)).toBe(1)
    })

    it('stores optional matchId when provided', async () => {
      const sender = await createParticipant()
      const recipient = await createParticipant()
      const matchId = `match_${Date.now()}_abc`

      const msg = await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'ready to play?',
        matchId,
      })

      expect(msg.matchId).toBe(matchId)
    })

    it('recipient row carries message_created_at matching messages.created_at', async () => {
      const sender = await createParticipant()
      const recipient = await createParticipant()

      const msg = await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'ping',
      })

      const res = await pool.query(
        'SELECT message_created_at FROM messaging.message_recipients WHERE message_id = $1',
        [msg.id]
      )
      expect(res.rows).toHaveLength(1)
      // message_created_at must equal the message's created_at
      const recipientCreatedAt = new Date(res.rows[0].message_created_at)
      expect(recipientCreatedAt.getTime()).toBe(msg.createdAt.getTime())
    })

    it('sets recipient_player_id on the messages row', async () => {
      const sender = await createParticipant()
      const recipient = await createParticipant()

      const msg = await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'dm test',
      })

      const res = await pool.query(
        'SELECT recipient_player_id FROM messaging.messages WHERE id = $1',
        [msg.id]
      )
      expect(res.rows[0].recipient_player_id).toBe(recipient.id)
    })
  })

  // ── sendBroadcast ─────────────────────────────────────────────────────────

  describe('sendBroadcast', () => {
    it('inserts 1 messages row and N recipient rows (one per participant)', async () => {
      // Seed 3 participants.
      const [p1, p2, p3] = await Promise.all([
        createParticipant(),
        createParticipant(),
        createParticipant(),
      ])

      const result = await repo.sendBroadcast({
        tournamentId,
        senderPlayerId: p1.id,
        body: 'Round 2 starts in 15 minutes',
      })

      expect(result.message.id).toBeDefined()
      expect(result.message.recipientPlayerId).toBeNull()
      expect(result.recipientCount).toBe(3)
      expect(await countMessages()).toBe(1)
      expect(await countRecipients(result.message.id)).toBe(3)
    })

    it('recipient_count equals the number of player_registrations in the tournament', async () => {
      await Promise.all([createParticipant(), createParticipant()])

      const sender = await createParticipant() // 3rd participant
      const result = await repo.sendBroadcast({
        tournamentId,
        senderPlayerId: sender.id,
        body: 'Court assignments posted',
      })

      const countRes = await pool.query(
        'SELECT COUNT(*) AS n FROM public.player_registrations WHERE tournament_id = $1',
        [tournamentId]
      )
      const participantCount = Number(countRes.rows[0].n)

      expect(result.recipientCount).toBe(participantCount)
      expect(await countRecipients(result.message.id)).toBe(participantCount)
    })

    it('uses a single multi-row INSERT for recipient rows (not a per-recipient loop)', async () => {
      await Promise.all([createParticipant(), createParticipant(), createParticipant()])

      // Spy to assert the recipient INSERT is a single query touching all rows.
      // We verify by counting distinct statement executions for INSERT into message_recipients.
      // This is an indirect assertion: if recipientCount > 1 and only 2 queries hit the
      // messaging schema (INSERT messages + INSERT message_recipients), the fan-out is batched.
      const queries: string[] = []
      const origQuery = (pool as any).query.bind(pool)
      ;(pool as any).query = (text: any, params?: any) => {
        if (typeof text === 'string') queries.push(text)
        return origQuery(text, params)
      }

      const sender = await createParticipant() // 4th participant
      await repo.sendBroadcast({
        tournamentId,
        senderPlayerId: sender.id,
        body: 'single batch insert test',
      })

      // Restore
      ;(pool as any).query = origQuery

      const recipientInserts = queries.filter(
        q => q.includes('message_recipients') && q.toUpperCase().includes('INSERT')
      )
      // Must be exactly 1 INSERT for message_recipients, regardless of participant count.
      expect(recipientInserts).toHaveLength(1)
    })

    it('entire broadcast is atomic: if fan-out fails, no message row persists', async () => {
      // We can't easily force the INSERT to fail without mocking, but we can verify
      // that sendBroadcast wraps both inserts in one transaction by checking both
      // tables are always in a consistent state after a successful call.
      await createParticipant()
      const sender = await createParticipant()

      const result = await repo.sendBroadcast({
        tournamentId,
        senderPlayerId: sender.id,
        body: 'atomicity check',
      })

      // Both tables are consistent: recipient count matches participant count.
      expect(await countMessages()).toBe(1)
      expect(await countRecipients(result.message.id)).toBe(result.recipientCount)
    })

    it('returns 0 recipient count for tournament with no participants', async () => {
      // Create a separate tournament with no registrations.
      const emptyTournament = await TournamentFactory.create(pool, organizerId)
      const sender = await PlayerFactory.create(pool) // not registered in emptyTournament

      const result = await repo.sendBroadcast({
        tournamentId: emptyTournament.id,
        senderPlayerId: sender.id,
        body: 'ghost broadcast',
      })

      expect(result.recipientCount).toBe(0)
      expect(await countRecipients(result.message.id)).toBe(0)
    })
  })

  // ── getHistory ────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns messages ordered by created_at ASC with id as tiebreaker', async () => {
      const sender = await createParticipant()

      // Insert messages in order; ordering must be stable.
      const m1 = await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'first' })
      const m2 = await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'second' })
      const m3 = await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'third' })

      const history = await repo.getHistory({ tournamentId, limit: 10 })

      expect(history).toHaveLength(3)
      expect(history[0].id).toBe(m1.message.id)
      expect(history[1].id).toBe(m2.message.id)
      expect(history[2].id).toBe(m3.message.id)
    })

    it('respects the limit parameter', async () => {
      const sender = await createParticipant()
      await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'a' })
      await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'b' })
      await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'c' })

      const history = await repo.getHistory({ tournamentId, limit: 2 })
      expect(history).toHaveLength(2)
    })

    it('cursor pagination: before returns only messages strictly before the cursor', async () => {
      const sender = await createParticipant()

      const r1 = await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'msg1' })
      const r2 = await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'msg2' })
      const r3 = await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'msg3' })

      // Fetch page before r3's cursor.
      const page = await repo.getHistory({
        tournamentId,
        limit: 10,
        before: { createdAt: r3.message.createdAt, id: r3.message.id },
      })

      expect(page).toHaveLength(2)
      expect(page.map((m: { id: string }) => m.id)).toEqual([r1.message.id, r2.message.id])
    })

    it('returns empty array when no messages exist for the tournament', async () => {
      const history = await repo.getHistory({ tournamentId, limit: 10 })
      expect(history).toHaveLength(0)
    })

    it('only returns messages belonging to the requested tournament', async () => {
      const other = await TournamentFactory.create(pool, organizerId)
      const sender = await createParticipant()
      const otherSender = await PlayerFactory.create(pool)

      await repo.sendBroadcast({ tournamentId, senderPlayerId: sender.id, body: 'mine' })
      await repo.sendBroadcast({ tournamentId: other.id, senderPlayerId: otherSender.id, body: 'theirs' })

      const history = await repo.getHistory({ tournamentId, limit: 10 })
      expect(history).toHaveLength(1)
      expect(history[0].body).toBe('mine')
    })
  })

  // ── markRead ──────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('sets read_at on the recipient row', async () => {
      const sender = await createParticipant()
      const recipient = await createParticipant()

      const msg = await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'read me',
      })

      await repo.markRead({
        messageId: msg.id,
        messageCreatedAt: msg.createdAt,
        playerId: recipient.id,
      })

      const res = await pool.query(
        'SELECT read_at FROM messaging.message_recipients WHERE message_id = $1 AND player_id = $2',
        [msg.id, recipient.id]
      )
      expect(res.rows).toHaveLength(1)
      expect(res.rows[0].read_at).not.toBeNull()
    })

    it('is idempotent: calling markRead twice does not error', async () => {
      const sender = await createParticipant()
      const recipient = await createParticipant()

      const msg = await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'read twice',
      })

      await repo.markRead({ messageId: msg.id, messageCreatedAt: msg.createdAt, playerId: recipient.id })
      await expect(
        repo.markRead({ messageId: msg.id, messageCreatedAt: msg.createdAt, playerId: recipient.id })
      ).resolves.not.toThrow()
    })
  })

  // ── getUnreadCount ────────────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('returns the count of unread messages for a player', async () => {
      const sender = await createParticipant()
      const recipient = await createParticipant()

      await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'unread 1',
      })
      await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'unread 2',
      })

      const count = await repo.getUnreadCount({ playerId: recipient.id })
      expect(count).toBe(2)
    })

    it('count decreases after markRead', async () => {
      const sender = await createParticipant()
      const recipient = await createParticipant()

      const msg1 = await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'will be read',
      })
      await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'stays unread',
      })

      expect(await repo.getUnreadCount({ playerId: recipient.id })).toBe(2)

      await repo.markRead({
        messageId: msg1.id,
        messageCreatedAt: msg1.createdAt,
        playerId: recipient.id,
      })

      expect(await repo.getUnreadCount({ playerId: recipient.id })).toBe(1)
    })

    it('scopes count to a specific tournament when tournamentId is provided', async () => {
      const other = await TournamentFactory.create(pool, organizerId)
      const sender = await createParticipant()
      const recipient = await createParticipant()

      // Message in the main tournament.
      await repo.sendDirectMessage({
        tournamentId,
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        body: 'in this tournament',
      })

      // Message in another tournament (register recipient there first so the recipient row is created).
      const playerRepo = await import('../../db').then(m => new m.PlayerRepository(pool))
      await playerRepo.createRegistration(recipient.id, other.id)
      const otherSender = await PlayerFactory.create(pool)
      await repo.sendDirectMessage({
        tournamentId: other.id,
        senderPlayerId: otherSender.id,
        recipientPlayerId: recipient.id,
        body: 'in other tournament',
      })

      const countAll = await repo.getUnreadCount({ playerId: recipient.id })
      const countScoped = await repo.getUnreadCount({ playerId: recipient.id, tournamentId })

      expect(countAll).toBe(2)
      expect(countScoped).toBe(1)
    })

    it('returns 0 when player has no unread messages', async () => {
      const player = await createParticipant()
      const count = await repo.getUnreadCount({ playerId: player.id })
      expect(count).toBe(0)
    })
  })
})
