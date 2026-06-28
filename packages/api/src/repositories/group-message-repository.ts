/**
 * GroupMessageRepository — send and retrieve durable group messages.
 *
 * Group messages live in messaging.group_messages (a plain, non-partitioned durable
 * table, migration 040). Sender display name is snapshotted at send time so that a
 * DSR erasure (anonymizeGroupMessagesFor) can tombstone the attribution without
 * retroactively altering the shared conversation history (§0.5).
 *
 * Sender-name strategy: resolve from public.players.name at send time and store in
 * sender_name_snapshot. History reads directly from the snapshot — no extra join or
 * separate cache needed. This is the "cached at write" pattern described in §10.
 */
import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('group-message-repository')

export interface GroupMessageRow {
  id: string
  conversationId: string
  playerId: string | null
  senderName: string | null
  body: string
  type: 'text' | 'poll' | 'system' | 'announcement'
  createdAt: Date
}

export interface SendGroupMessageInput {
  groupId: string
  playerId: string
  body: string
  type?: 'text' | 'poll' | 'system' | 'announcement'
}

export interface GetGroupHistoryInput {
  conversationId: string
  limit?: number
}

function rowToGroupMessage(row: any): GroupMessageRow {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    playerId: row.player_id ?? null,
    senderName: row.sender_name_snapshot ?? null,
    body: row.body as string,
    type: row.type as GroupMessageRow['type'],
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }
}

export class GroupMessageRepository {
  constructor(private pool: Pool) {}

  /**
   * Resolve (or create) the conversation_id for a player group.
   * Idempotent — uses INSERT ON CONFLICT DO NOTHING + SELECT.
   */
  private async resolveConversationId(
    client: { query: (text: string, params?: unknown[]) => Promise<any> },
    groupId: string
  ): Promise<string> {
    const ins = await client.query(
      `INSERT INTO messaging.conversations (type, group_id)
       VALUES ('group', $1)
       ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [groupId]
    )
    if (ins.rows.length > 0) return ins.rows[0].id as string

    const sel = await client.query(
      `SELECT id FROM messaging.conversations WHERE group_id = $1`,
      [groupId]
    )
    return sel.rows[0].id as string
  }

  /**
   * Look up a player's display name by player_id.
   * Returns null when no row exists (system messages, anonymized senders).
   */
  async getPlayerName(playerId: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT name FROM public.players WHERE id = $1`,
      [playerId]
    )
    return result.rows[0]?.name ?? null
  }

  /**
   * Send a text message to a group conversation.
   * - Resolves or creates the group conversation.
   * - Snapshots the sender's display name from public.players.name at send time.
   * - Inserts into messaging.group_messages.
   *
   * Returns the newly created message row (including the conversation_id so the
   * caller can emit on the bus).
   */
  async sendGroupMessage(
    input: SendGroupMessageInput
  ): Promise<{ message: GroupMessageRow; conversationId: string }> {
    const { groupId, playerId, body, type = 'text' } = input

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const conversationId = await this.resolveConversationId(client, groupId)

      // Snapshot the sender's display name at send time (§0.5 / §10).
      const nameRes = await client.query(
        `SELECT name FROM public.players WHERE id = $1`,
        [playerId]
      )
      const senderNameSnapshot: string = nameRes.rows[0]?.name ?? 'Unknown'

      const result = await client.query(
        `INSERT INTO messaging.group_messages
           (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, conversation_id, player_id, sender_name_snapshot, body, type, created_at`,
        [conversationId, playerId, senderNameSnapshot, body, type]
      )

      await client.query('COMMIT')

      const message = rowToGroupMessage(result.rows[0])

      log.info('group.message.sent', {
        groupId,
        conversationId,
        messageId: message.id,
        playerId,
        messageType: type,
      })

      return { message, conversationId }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Post a system event message (e.g. "Sam joined", "Sam left") into a group conversation.
   * player_id is NULL for system events — they are not attributed to a specific user.
   *
   * Called from the membership flow (join via invite-accept, leave via leaveGroup) so that
   * system events appear inline in the chat history.
   */
  async postSystemEvent(groupId: string, body: string): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const conversationId = await this.resolveConversationId(client, groupId)

      await client.query(
        `INSERT INTO messaging.group_messages
           (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, NULL, 'system', $2, 'system')`,
        [conversationId, body]
      )

      await client.query('COMMIT')

      log.info('group.system.event', { groupId, conversationId, body })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Get paginated history for a group conversation.
   * Returns messages ordered by (created_at ASC, id ASC) — oldest first.
   * Includes text, poll, system, and announcement types so system events appear
   * inline alongside chat messages.
   *
   * Sender display name comes from sender_name_snapshot (stored at send time) so
   * history is stable even after DSR anonymization.
   */
  async getGroupHistory(input: GetGroupHistoryInput): Promise<GroupMessageRow[]> {
    const { conversationId, limit = 50 } = input

    const result = await this.pool.query(
      `SELECT id, conversation_id, player_id, sender_name_snapshot, body, type, created_at
       FROM messaging.group_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
      [conversationId, Math.min(limit, 100)]
    )

    return result.rows.map(rowToGroupMessage)
  }
}
