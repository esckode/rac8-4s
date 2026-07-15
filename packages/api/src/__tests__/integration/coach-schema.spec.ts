/**
 * S1.1 — 1:1 Coach: migration 057 schema + repositories (RED first)
 *
 * Covers (COACH_1TO1_IMPLEMENTATION.md §S1.1):
 *  - conversations.type='coach' is accepted; a second coach conversation for the same
 *    player violates the new partial unique index; a player can hold both a 'personal'
 *    and a 'coach' conversation simultaneously (the narrowed idx_conversations_personal_
 *    player_id / new idx_conversations_coach_player_id split).
 *  - ConversationRepository.resolveCoachConversation(playerId) get-or-creates.
 *  - player_settings.coach_memory_enabled exists, defaults true.
 *  - player_memories round-trip via PlayerMemoryRepository; body >280 chars violates the
 *    CHECK; deleting another player's memory id affects 0 rows.
 *  - assistant_cards.conversation_id exists, NOT NULL, FK; existing group-card insert
 *    (via AssistantCardRepository.createCard) still works and populates it; a coach-scope
 *    card (conversation of type='coach', group_id NULL) inserts fine.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { ConversationRepository } from '../../repositories/conversation-repository'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'
import { PlayerMemoryRepository } from '../../repositories/player-memory-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    `coach-schema-${uid()}@test.local`,
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
    [`Coach Schema Group ${uid()}`, createdBy]
  )
  return res.rows[0].id as string
}

describe('S1.1 — coach schema (migration 057)', () => {
  let pool: Pool
  let conversationRepo: ConversationRepository
  let cardRepo: AssistantCardRepository
  let memoryRepo: PlayerMemoryRepository

  beforeAll(async () => {
    await beginTransaction()
    pool = await getTestPool()
    conversationRepo = new ConversationRepository(pool)
    cardRepo = new AssistantCardRepository(pool)
    memoryRepo = new PlayerMemoryRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it("accepts type='coach' and enforces at most one coach conversation per player", async () => {
    const player = await createPlayer(pool)

    const first = await pool.query(
      `INSERT INTO messaging.conversations (type, player_id) VALUES ('coach', $1) RETURNING id`,
      [player.id]
    )
    expect(first.rows).toHaveLength(1)

    await expect(
      pool.query(
        `INSERT INTO messaging.conversations (type, player_id) VALUES ('coach', $1)`,
        [player.id]
      )
    ).rejects.toThrow()
  })

  it('a player can hold both a personal and a coach conversation simultaneously', async () => {
    const player = await createPlayer(pool)

    await pool.query(
      `INSERT INTO messaging.conversations (type, player_id) VALUES ('personal', $1)`,
      [player.id]
    )
    const coach = await pool.query(
      `INSERT INTO messaging.conversations (type, player_id) VALUES ('coach', $1) RETURNING id`,
      [player.id]
    )
    expect(coach.rows).toHaveLength(1)
  })

  it('resolveCoachConversation get-or-creates idempotently', async () => {
    const player = await createPlayer(pool)

    const first = await conversationRepo.resolveCoachConversation(player.id)
    const second = await conversationRepo.resolveCoachConversation(player.id)

    expect(first).toBe(second)

    const row = await pool.query(
      `SELECT type, player_id FROM messaging.conversations WHERE id = $1`,
      [first]
    )
    expect(row.rows[0]).toMatchObject({ type: 'coach', player_id: player.id })
  })

  it('player_settings.coach_memory_enabled exists and defaults true', async () => {
    const player = await createPlayer(pool)

    const cols = await pool.query(
      `SELECT column_name, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'player_settings'
         AND column_name = 'coach_memory_enabled'`
    )
    expect(cols.rows).toHaveLength(1)

    await pool.query(
      `INSERT INTO public.player_settings (player_id) VALUES ($1)`,
      [player.id]
    )
    const row = await pool.query(
      `SELECT coach_memory_enabled FROM public.player_settings WHERE player_id = $1`,
      [player.id]
    )
    expect(row.rows[0].coach_memory_enabled).toBe(true)
  })

  describe('PlayerMemoryRepository', () => {
    it('inserts, lists newest-first, counts, and deletes scoped to the owner', async () => {
      const player = await createPlayer(pool)

      const m1 = await memoryRepo.insertMemory({ playerId: player.id, body: 'prefers morning matches', source: 'player' })
      const m2 = await memoryRepo.insertMemory({ playerId: player.id, body: 'plays two-handed backhand', source: 'coach' })

      expect(await memoryRepo.countMemories(player.id)).toBe(2)

      const list = await memoryRepo.listMemories(player.id)
      expect(list.map((m: { id: string }) => m.id)).toEqual([m2.id, m1.id])
      expect(list[0]).toMatchObject({ body: 'plays two-handed backhand', source: 'coach' })

      const deleted = await memoryRepo.deleteMemory(player.id, m1.id)
      expect(deleted).toBe(1)
      expect(await memoryRepo.countMemories(player.id)).toBe(1)
    })

    it('rejects a body over 280 chars via the CHECK constraint', async () => {
      const player = await createPlayer(pool)
      await expect(
        memoryRepo.insertMemory({ playerId: player.id, body: 'x'.repeat(281), source: 'player' })
      ).rejects.toThrow()
    })

    it("deleting another player's memory affects 0 rows", async () => {
      const owner = await createPlayer(pool)
      const intruder = await createPlayer(pool)
      const memory = await memoryRepo.insertMemory({ playerId: owner.id, body: 'owned by owner', source: 'player' })

      const deleted = await memoryRepo.deleteMemory(intruder.id, memory.id)
      expect(deleted).toBe(0)

      expect(await memoryRepo.countMemories(owner.id)).toBe(1)
    })
  })

  describe('assistant_cards.conversation_id', () => {
    it('exists, is NOT NULL, and FKs to messaging.conversations', async () => {
      const cols = await pool.query(
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'messaging' AND table_name = 'assistant_cards'
           AND column_name = 'conversation_id'`
      )
      expect(cols.rows).toHaveLength(1)
      expect(cols.rows[0].is_nullable).toBe('NO')

      const fks = await pool.query(
        `SELECT tc.constraint_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_schema = 'messaging' AND tc.table_name = 'assistant_cards'
           AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'conversation_id'`
      )
      expect(fks.rows.length).toBeGreaterThan(0)
    })

    it('existing-style group card insert still works and populates conversation_id (regression)', async () => {
      const player = await createPlayer(pool)
      const groupId = await createGroup(pool, player.id)

      const { card, conversationId } = await cardRepo.createCard({
        groupId,
        proposerPlayerId: player.id,
        action: 'score',
        args: { matchId: 'm1' },
        body: 'Coach wants to record a score.',
      })

      expect(card.groupId).toBe(groupId)
      const row = await pool.query(
        `SELECT conversation_id FROM messaging.assistant_cards WHERE id = $1`,
        [card.id]
      )
      expect(row.rows[0].conversation_id).toBe(conversationId)
    })

    it('a coach-scope card (conversation type=coach, group_id NULL) inserts fine', async () => {
      const player = await createPlayer(pool)
      const conversationId = await conversationRepo.resolveCoachConversation(player.id)

      const msg = await pool.query(
        `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, NULL, 'Coach', 'Coach wants to remember something.', 'assistant') RETURNING id`,
        [conversationId]
      )

      const cardRes = await pool.query(
        `INSERT INTO messaging.assistant_cards
           (message_id, conversation_id, group_id, proposer_player_id, action, args, status, expires_at)
         VALUES ($1, $2, NULL, $3, 'remember', '{}'::jsonb, 'pending', now() + interval '15 minutes')
         RETURNING id, group_id, conversation_id`,
        [msg.rows[0].id, conversationId, player.id]
      )
      expect(cardRes.rows[0].group_id).toBeNull()
      expect(cardRes.rows[0].conversation_id).toBe(conversationId)
    })
  })

  describe('S1.3 — AssistantCardRepository.createCoachCard', () => {
    it('inserts a coach-scope card + assistant message, group_id NULL, metadata.cardId set', async () => {
      const player = await createPlayer(pool)
      const conversationId = await conversationRepo.resolveCoachConversation(player.id)

      const { card } = await cardRepo.createCoachCard({
        conversationId,
        proposerPlayerId: player.id,
        action: 'remember',
        args: { text: 'prefers morning matches' },
        body: 'Coach wants to remember: "prefers morning matches". Only you can confirm.',
      })

      expect(card.groupId).toBeNull()
      expect(card.conversationId).toBe(conversationId)
      expect(card.status).toBe('pending')

      const msgRow = await pool.query(
        `SELECT type, metadata, sender_name_snapshot FROM messaging.group_messages WHERE id = $1`,
        [card.messageId]
      )
      expect(msgRow.rows[0].type).toBe('assistant')
      expect(msgRow.rows[0].sender_name_snapshot).toBe('Coach')
      expect(msgRow.rows[0].metadata).toMatchObject({ cardId: card.id })
    })

    it('getCard returns conversationId for a coach-scope card', async () => {
      const player = await createPlayer(pool)
      const conversationId = await conversationRepo.resolveCoachConversation(player.id)

      const { card } = await cardRepo.createCoachCard({
        conversationId,
        proposerPlayerId: player.id,
        action: 'remember',
        args: { text: 'plays lefty' },
        body: 'Coach wants to remember: "plays lefty". Only you can confirm.',
      })

      const fetched = await cardRepo.getCard(card.id)
      expect(fetched?.conversationId).toBe(conversationId)
      expect(fetched?.groupId).toBeNull()
    })
  })
})
