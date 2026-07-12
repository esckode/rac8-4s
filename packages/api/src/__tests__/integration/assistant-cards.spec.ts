/**
 * B1.1 — assistant_cards migration + AssistantCardRepository (RED first)
 *
 * Card storage is a dedicated table (design §11 B-Q2, the messaging.polls
 * precedent — migration 042): the assistant message's metadata carries only
 * {cardId}; card state (status, args, expiry, result) lives in
 * messaging.assistant_cards.
 *
 * Covers:
 *  - schema: status CHECK constraint
 *  - createCard(): atomically inserts the assistant message (type='assistant',
 *    player_id=NULL, sender 'Coach') + the card row + backfills
 *    message.metadata.cardId, in one transaction
 *  - claimCard(): atomic pending-only flip (returns null when the card is
 *    already confirmed/failed/cancelled — no double-flip)
 *  - concurrent confirm: two parallel claimCard calls on the same pending
 *    card → exactly one succeeds
 *  - expiry is NEVER stored — a card past its expires_at still reads back
 *    with status='pending' until something actually claims it
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    `card-${uid()}@test.local`,
    name,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, name: player.name ?? name }
}

async function createGroup(pool: Pool, createdBy: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`Card Group ${uid()}`, createdBy]
  )
  return res.rows[0].id as string
}

describe('assistant_cards schema + AssistantCardRepository (B1)', () => {
  let pool: Pool
  let repo: AssistantCardRepository

  beforeAll(async () => {
    await beginTransaction()
    pool = await getTestPool()
    repo = new AssistantCardRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('rejects an invalid status via the CHECK constraint', async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)
    const conv = await pool.query(
      `INSERT INTO messaging.conversations (type, group_id) VALUES ('group', $1) RETURNING id`,
      [groupId]
    )
    const msg = await pool.query(
      `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type)
       VALUES ($1, NULL, 'Coach', 'proposal', 'assistant') RETURNING id`,
      [conv.rows[0].id]
    )
    await expect(
      pool.query(
        `INSERT INTO messaging.assistant_cards
           (message_id, group_id, proposer_player_id, action, args, status, expires_at, schema_version)
         VALUES ($1, $2, $3, 'propose_score', '{}'::jsonb, 'bogus_status', now() + interval '15 minutes', 1)`,
        [msg.rows[0].id, groupId, player.id]
      )
    ).rejects.toThrow()
  })

  it('createCard() atomically inserts the assistant message + card row and backfills metadata.cardId', async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)

    const { card, conversationId } = await repo.createCard({
      groupId,
      proposerPlayerId: player.id,
      action: 'propose_score',
      args: { matchId: 'm1', score: '2-1' },
      body: 'Coach drafted a score — You 2 – 1 Sunil.',
    })

    expect(card.status).toBe('pending')
    expect(card.groupId).toBe(groupId)
    expect(card.proposerPlayerId).toBe(player.id)
    expect(card.action).toBe('propose_score')
    expect(card.args).toEqual({ matchId: 'm1', score: '2-1' })
    expect(card.schemaVersion).toBe(1)
    expect(card.result).toBeNull()
    expect(card.expiresAt.getTime()).toBeGreaterThan(Date.now())

    const msgRow = await pool.query(
      `SELECT player_id, sender_name_snapshot, type, body, metadata FROM messaging.group_messages WHERE id = $1`,
      [card.messageId]
    )
    expect(msgRow.rows[0].player_id).toBeNull()
    expect(msgRow.rows[0].sender_name_snapshot).toBe('Coach')
    expect(msgRow.rows[0].type).toBe('assistant')
    expect(msgRow.rows[0].body).toBe('Coach drafted a score — You 2 – 1 Sunil.')
    expect(msgRow.rows[0].metadata).toEqual({ cardId: card.id })
    expect(conversationId).toBeTruthy()
  })

  it('getCard() and getCardByMessageId() return the same row', async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)
    const { card } = await repo.createCard({
      groupId,
      proposerPlayerId: player.id,
      action: 'propose_score',
      args: {},
      body: 'proposal',
    })

    const byId = await repo.getCard(card.id)
    const byMessageId = await repo.getCardByMessageId(card.messageId)
    expect(byId).toEqual(card)
    expect(byMessageId).toEqual(card)
  })

  it('getCard() returns null for an unknown id', async () => {
    expect(await repo.getCard(crypto.randomUUID())).toBeNull()
  })

  describe('claimCard()', () => {
    it('flips pending → confirmed and returns the updated row', async () => {
      const player = await createPlayer(pool)
      const groupId = await createGroup(pool, player.id)
      const { card } = await repo.createCard({
        groupId, proposerPlayerId: player.id, action: 'propose_score', args: {}, body: 'x',
      })

      const claimed = await repo.claimCard(card.id, 'confirmed')
      expect(claimed?.status).toBe('confirmed')

      const reread = await repo.getCard(card.id)
      expect(reread?.status).toBe('confirmed')
    })

    it('stores a result alongside the flip (e.g. a failure reason)', async () => {
      const player = await createPlayer(pool)
      const groupId = await createGroup(pool, player.id)
      const { card } = await repo.createCard({
        groupId, proposerPlayerId: player.id, action: 'propose_score', args: {}, body: 'x',
      })

      const claimed = await repo.claimCard(card.id, 'failed', { reason: 'match already scored' })
      expect(claimed?.status).toBe('failed')
      expect(claimed?.result).toEqual({ reason: 'match already scored' })
    })

    it('returns null (no-op) when the card is already confirmed — no double-flip', async () => {
      const player = await createPlayer(pool)
      const groupId = await createGroup(pool, player.id)
      const { card } = await repo.createCard({
        groupId, proposerPlayerId: player.id, action: 'propose_score', args: {}, body: 'x',
      })

      await repo.claimCard(card.id, 'confirmed')
      const second = await repo.claimCard(card.id, 'cancelled')
      expect(second).toBeNull()

      const reread = await repo.getCard(card.id)
      expect(reread?.status).toBe('confirmed') // unchanged by the failed second claim
    })

    it('concurrent claims on the same pending card: exactly one succeeds', async () => {
      const player = await createPlayer(pool)
      const groupId = await createGroup(pool, player.id)
      const { card } = await repo.createCard({
        groupId, proposerPlayerId: player.id, action: 'propose_score', args: {}, body: 'x',
      })

      const [a, b] = await Promise.all([
        repo.claimCard(card.id, 'confirmed'),
        repo.claimCard(card.id, 'cancelled'),
      ])
      const results = [a, b]
      const succeeded = results.filter(r => r !== null)
      const failed = results.filter(r => r === null)
      expect(succeeded).toHaveLength(1)
      expect(failed).toHaveLength(1)
    })
  })

  it('setResult() attaches a result without requiring a status change', async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)
    const { card } = await repo.createCard({
      groupId, proposerPlayerId: player.id, action: 'propose_casual_launch', args: {}, body: 'x',
    })
    await repo.claimCard(card.id, 'confirmed')

    const updated = await repo.setResult(card.id, { tournamentId: 'tourn-99' })
    expect(updated?.result).toEqual({ tournamentId: 'tourn-99' })
    expect(updated?.status).toBe('confirmed')
  })

  it('a card past its expires_at is NOT auto-flipped — expiry is computed read-side only', async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)
    const { card } = await repo.createCard({
      groupId, proposerPlayerId: player.id, action: 'propose_score', args: {}, body: 'x',
      expiresInSeconds: -1, // already expired at creation
    })

    // No sweeper ran; the row is untouched
    const reread = await repo.getCard(card.id)
    expect(reread?.status).toBe('pending')
    expect(reread!.expiresAt.getTime()).toBeLessThan(Date.now())

    // A claim against an expired-but-still-pending card is the ROUTE's job to
    // reject (409) — the repository itself has no expiry awareness, matching
    // "expired is computed, never stored, no sweeper".
  })
})
