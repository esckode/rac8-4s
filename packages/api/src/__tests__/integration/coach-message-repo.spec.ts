/**
 * S5.3 (prep) — GroupMessageRepository.sendAssistantMessageToConversation (RED first)
 *
 * Coach replies have no group — this is the conversation-first sibling of
 * sendAssistantMessage (which resolves a group's conversation internally).
 */
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { ConversationRepository } from '../../repositories/conversation-repository'
import { GroupMessageRepository } from '../../repositories/group-message-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('GroupMessageRepository.sendAssistantMessageToConversation', () => {
  let pool: Pool
  let conversationRepo: ConversationRepository
  let repo: GroupMessageRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    conversationRepo = new ConversationRepository(pool)
    repo = new GroupMessageRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('inserts an assistant row directly into the given conversation, with metadata', async () => {
    const playerRepo = new PlayerRepository(pool)
    const player = await playerRepo.findOrCreatePlayerByEmail(
      `coach-msg-${uid()}@test.local`, `Player ${uid()}`, undefined, undefined, defaultAdultAttestation()
    )
    const conversationId = await conversationRepo.resolveCoachConversation(player.id)

    const { message } = await repo.sendAssistantMessageToConversation(conversationId, 'a reply', { replyTo: 'msg-1' })

    expect(message.conversationId).toBe(conversationId)
    expect(message.playerId).toBeNull()
    expect(message.senderName).toBe('Coach')
    expect(message.type).toBe('assistant')
    expect(message.body).toBe('a reply')
    expect(message.metadata).toEqual({ replyTo: 'msg-1' })

    const row = await pool.query(`SELECT type, player_id FROM messaging.group_messages WHERE id = $1`, [message.id])
    expect(row.rows[0]).toMatchObject({ type: 'assistant', player_id: null })
  })
})
