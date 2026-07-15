/**
 * S8 — 1:1 Coach: DSR export + erasure (RED first)
 *
 * COACH_1TO1_DESIGN.md §5.2's compliance requirement: the ids-only args rule
 * breaks deliberately for propose_remember (args carry the actual text), so
 * the erasure cascade must explicitly cover assistant_cards.args for
 * action='remember' rows and player_memories itself — this is the "blind
 * spot guarded by a test, not convention" the design calls for.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerFactory } from '../factories'
import { DataSubjectRequestService } from '../../dsr-service'
import { ConversationRepository } from '../../repositories/conversation-repository'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'
import { PlayerMemoryRepository } from '../../repositories/player-memory-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('S8 — 1:1 Coach DSR export + erasure', () => {
  let pool: Pool
  let svc: DataSubjectRequestService
  let conversationRepo: ConversationRepository
  let cardRepo: AssistantCardRepository
  let memoryRepo: PlayerMemoryRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    svc = new DataSubjectRequestService(pool)
    conversationRepo = new ConversationRepository(pool)
    cardRepo = new AssistantCardRepository(pool)
    memoryRepo = new PlayerMemoryRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('export', () => {
    it("includes the player's coach-thread messages, memories, and remember-card count", async () => {
      const player = await PlayerFactory.create(pool)
      const conversationId = await conversationRepo.resolveCoachConversation(player.id)

      await pool.query(
        `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, $2, $3, 'who am I playing next?', 'text')`,
        [conversationId, player.id, player.name]
      )
      await pool.query(
        `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, NULL, 'Coach', 'No upcoming match scheduled.', 'assistant')`,
        [conversationId]
      )
      await memoryRepo.insertMemory({ playerId: player.id, body: 'prefers morning matches', source: 'player' })
      await cardRepo.createCoachCard({
        conversationId,
        proposerPlayerId: player.id,
        action: 'remember',
        args: { text: 'prefers morning matches' },
        body: 'Coach wants to remember: "prefers morning matches". Only you can confirm.',
      })

      const result = await svc.export(player.email)
      expect(result.status).toBe('exported')
      if (result.status !== 'exported') return

      expect(result.data.coachMessageCount).toBeGreaterThanOrEqual(2) // player's own + Coach's reply
      expect(result.data.memories).toEqual([
        expect.objectContaining({ body: 'prefers morning matches', source: 'player' }),
      ])
      expect(result.data.rememberCardCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('erasure — the personal-scope card compliance requirement', () => {
    it('confirmed remember card args are scrubbed, player_memories rows are gone, and the coach conversation is hard-deleted', async () => {
      const player = await PlayerFactory.create(pool)
      const conversationId = await conversationRepo.resolveCoachConversation(player.id)

      await pool.query(
        `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, $2, $3, 'remember I prefer morning matches', 'text')`,
        [conversationId, player.id, player.name]
      )
      const memory = await memoryRepo.insertMemory({ playerId: player.id, body: 'prefers morning matches', source: 'player' })
      const { card } = await cardRepo.createCoachCard({
        conversationId,
        proposerPlayerId: player.id,
        action: 'remember',
        args: { text: 'prefers morning matches' },
        body: 'Coach wants to remember: "prefers morning matches". Only you can confirm.',
      })
      await cardRepo.claimCard(card.id, 'confirmed', { memoryId: memory.id })

      const result = await svc.erase(player.email)
      expect(result.status).toBe('erased')

      const memories = await pool.query(`SELECT * FROM public.player_memories WHERE player_id = $1`, [player.id])
      expect(memories.rows).toHaveLength(0)

      // The card row itself is gone (hard-delete of the whole coach conversation) —
      // strictly stronger than "args scrubbed to {}" for a row that no longer exists.
      const cardRow = await pool.query(`SELECT * FROM messaging.assistant_cards WHERE id = $1`, [card.id])
      expect(cardRow.rows).toHaveLength(0)

      const conv = await pool.query(`SELECT * FROM messaging.conversations WHERE id = $1`, [conversationId])
      expect(conv.rows).toHaveLength(0)

      const messages = await pool.query(`SELECT * FROM messaging.group_messages WHERE conversation_id = $1`, [conversationId])
      expect(messages.rows).toHaveLength(0)
    })

    it('a pending (unconfirmed) remember card is also removed by erasure', async () => {
      const player = await PlayerFactory.create(pool)
      const conversationId = await conversationRepo.resolveCoachConversation(player.id)
      const { card } = await cardRepo.createCoachCard({
        conversationId,
        proposerPlayerId: player.id,
        action: 'remember',
        args: { text: 'never confirmed' },
        body: 'Coach wants to remember: "never confirmed". Only you can confirm.',
      })

      await svc.erase(player.email)

      const cardRow = await pool.query(`SELECT * FROM messaging.assistant_cards WHERE id = $1`, [card.id])
      expect(cardRow.rows).toHaveLength(0)
    })

    it("does not touch another player's coach conversation or memories", async () => {
      const target = await PlayerFactory.create(pool)
      const other = await PlayerFactory.create(pool)
      const otherConversationId = await conversationRepo.resolveCoachConversation(other.id)
      await memoryRepo.insertMemory({ playerId: other.id, body: 'other player memory', source: 'player' })

      await svc.erase(target.email)

      const otherMemories = await memoryRepo.listMemories(other.id)
      expect(otherMemories).toHaveLength(1)
      const otherConv = await pool.query(`SELECT * FROM messaging.conversations WHERE id = $1`, [otherConversationId])
      expect(otherConv.rows).toHaveLength(1)
    })
  })
})
