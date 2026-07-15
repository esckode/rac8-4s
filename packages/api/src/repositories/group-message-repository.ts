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
  type: 'text' | 'poll' | 'system' | 'announcement' | 'assistant'
  createdAt: Date
  removedAt: Date | null
  removedBy: string | null
  metadata: Record<string, unknown> | null
  // Present only when type === 'poll'
  pollId?: string | null
  targetTime?: Date | null
  closedAt?: Date | null
  autoCloseAt?: Date | null
  autoLaunch?: boolean
  // Present (nullable) only on getGroupHistory rows; populated when type === 'assistant'
  // AND a messaging.assistant_cards row exists for the message (B3.0 — the poll precedent).
  cardId?: string | null
  cardAction?: string | null
  cardArgs?: Record<string, unknown> | null
  cardStatus?: 'pending' | 'confirmed' | 'failed' | 'cancelled' | null
  cardExpiresAt?: Date | null
  cardSchemaVersion?: number | null
  cardResult?: Record<string, unknown> | null
  cardProposerPlayerId?: string | null
}

export interface SendGroupMessageInput {
  groupId: string
  playerId: string
  body: string
  type?: 'text' | 'poll' | 'system' | 'announcement'
}

export interface SendAssistantMessageInput {
  groupId: string
  body: string
  metadata?: Record<string, unknown>
}

export interface GetGroupHistoryInput {
  conversationId: string
  limit?: number
}

function rowToGroupMessage(row: any): GroupMessageRow {
  const base: GroupMessageRow = {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    playerId: row.player_id ?? null,
    senderName: row.sender_name_snapshot !== '' ? (row.sender_name_snapshot ?? null) : null,
    body: row.removed_at != null ? 'message removed' : (row.body as string),
    type: row.type as GroupMessageRow['type'],
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    removedAt: row.removed_at ? (row.removed_at instanceof Date ? row.removed_at : new Date(row.removed_at)) : null,
    removedBy: row.removed_by ?? null,
    metadata: row.metadata ?? null,
  }
  if (row.poll_id !== undefined) {
    base.pollId = row.poll_id ?? null
    base.targetTime = row.target_time ? (row.target_time instanceof Date ? row.target_time : new Date(row.target_time)) : null
    base.closedAt = row.closed_at ? (row.closed_at instanceof Date ? row.closed_at : new Date(row.closed_at)) : null
    base.autoCloseAt = row.poll_auto_close_at ? (row.poll_auto_close_at instanceof Date ? row.poll_auto_close_at : new Date(row.poll_auto_close_at)) : null
    base.autoLaunch = row.poll_auto_launch ?? false
  }
  if (row.card_id !== undefined) {
    base.cardId = row.card_id ?? null
    base.cardAction = row.card_action ?? null
    base.cardArgs = row.card_args ?? null
    base.cardStatus = row.card_status ?? null
    base.cardExpiresAt = row.card_expires_at
      ? (row.card_expires_at instanceof Date ? row.card_expires_at : new Date(row.card_expires_at))
      : null
    base.cardSchemaVersion = row.card_schema_version ?? null
    base.cardResult = row.card_result ?? null
    base.cardProposerPlayerId = row.card_proposer_player_id ?? null
  }
  return base
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
   * Post an assistant (@coach) reply into a group conversation.
   * Bot rows: type='assistant', player_id=NULL, sender_name_snapshot='Coach' — the
   * explicit type keeps them unambiguous against DSR tombstones (also player_id=NULL).
   * Optional metadata carries provenance markers ({replyTo: <messageId>} for
   * idempotency, {intro: true} for the one-time enable intro).
   */
  async sendAssistantMessage(
    input: SendAssistantMessageInput
  ): Promise<{ message: GroupMessageRow; conversationId: string }> {
    const { groupId, body, metadata } = input

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const conversationId = await this.resolveConversationId(client, groupId)

      const result = await client.query(
        `INSERT INTO messaging.group_messages
           (conversation_id, player_id, sender_name_snapshot, body, type, metadata)
         VALUES ($1, NULL, 'Coach', $2, 'assistant', $3)
         RETURNING id, conversation_id, player_id, sender_name_snapshot, body, type,
                   created_at, metadata`,
        [conversationId, body, metadata ?? null]
      )

      await client.query('COMMIT')

      const message = rowToGroupMessage(result.rows[0])

      log.info('assistant.message.sent', {
        groupId,
        conversationId,
        messageId: message.id,
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
   * Get the newest N messages of a conversation in chronological order — the
   * assistant's bounded context window (design Q13, ~20 messages).
   */
  async getRecentMessages(input: GetGroupHistoryInput): Promise<GroupMessageRow[]> {
    const { conversationId, limit = 20 } = input

    const result = await this.pool.query(
      `SELECT id, conversation_id, player_id, sender_name_snapshot, body,
              type, created_at, removed_at, removed_by, metadata
       FROM messaging.group_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [conversationId, Math.min(limit, 100)]
    )

    return result.rows.map(rowToGroupMessage).reverse()
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
   * Tombstone a group message (owner-only moderation soft-delete).
   *
   * Sets:
   *   - body                 → '' (cleared)
   *   - player_id            → NULL (attribution dropped)
   *   - sender_name_snapshot → '' (attribution dropped; distinguishable from DSR
   *                               which sets it to 'Former player')
   *   - removed_at           → now() (marks moderation removal; DSR leaves this NULL)
   *   - removed_by           → actorPlayerId (who removed it; for audit purposes)
   *
   * Returns the updated row, or null if the message does not exist (for 404 handling).
   *
   * This is distinct from DSR anonymization (anonymizeGroupMessagesFor), which sets
   * sender_name_snapshot='Former player' and does NOT set removed_at/removed_by.
   */
  async removeGroupMessage(
    messageId: string,
    actorPlayerId: string
  ): Promise<GroupMessageRow | null> {
    const result = await this.pool.query(
      `UPDATE messaging.group_messages
       SET body                 = '',
           player_id            = NULL,
           sender_name_snapshot = '',
           removed_at           = now(),
           removed_by           = $2
       WHERE id = $1
       RETURNING id, conversation_id, player_id, sender_name_snapshot, body, type,
                 created_at, removed_at, removed_by`,
      [messageId, actorPlayerId]
    )
    if (result.rows.length === 0) return null
    const row = rowToGroupMessage(result.rows[0])
    log.info('group.message.removed', {
      messageId,
      removedBy: actorPlayerId,
    })
    return row
  }

  /**
   * Post a system notification into a player's personal conversation thread.
   * Used for private events: kick, promote, demote, auto-transfer.
   * Writes a recipient row so the unread badge and digest processor can act on it.
   */
  async postPersonalNotification(playerId: string, body: string): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      // Resolve or create the personal conversation for this player
      const convResult = await client.query(
        `INSERT INTO messaging.conversations (type, player_id)
         VALUES ('personal', $1)
         ON CONFLICT (player_id) WHERE type = 'personal' DO NOTHING
         RETURNING id`,
        [playerId]
      )
      let conversationId: string
      if (convResult.rows.length > 0) {
        conversationId = convResult.rows[0].id as string
      } else {
        const sel = await client.query(
          `SELECT id FROM messaging.conversations WHERE player_id = $1 AND type = 'personal'`,
          [playerId]
        )
        conversationId = sel.rows[0].id as string
      }

      const msgResult = await client.query(
        `INSERT INTO messaging.group_messages
           (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, NULL, 'system', $2, 'system')
         RETURNING id`,
        [conversationId, body]
      )
      const messageId = msgResult.rows[0].id as string

      // Write recipient row for unread + digest tracking
      await client.query(
        `INSERT INTO messaging.group_message_recipients (message_id, player_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [messageId, playerId]
      )

      await client.query('COMMIT')

      log.info('personal.notification.posted', { playerId, conversationId, body })
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
      `SELECT gm.id, gm.conversation_id, gm.player_id, gm.sender_name_snapshot, gm.body,
              gm.type, gm.created_at, gm.removed_at, gm.removed_by, gm.metadata,
              p.id AS poll_id, p.target_time, p.closed_at,
              p.auto_close_at AS poll_auto_close_at, p.auto_launch AS poll_auto_launch,
              ac.id AS card_id, ac.action AS card_action, ac.args AS card_args,
              ac.status AS card_status, ac.expires_at AS card_expires_at,
              ac.schema_version AS card_schema_version, ac.result AS card_result,
              ac.proposer_player_id AS card_proposer_player_id
       FROM messaging.group_messages gm
       LEFT JOIN messaging.polls p ON p.message_id = gm.id
       LEFT JOIN messaging.assistant_cards ac ON ac.message_id = gm.id
       WHERE gm.conversation_id = $1
       ORDER BY gm.created_at ASC, gm.id ASC
       LIMIT $2`,
      [conversationId, Math.min(limit, 100)]
    )

    return result.rows.map(rowToGroupMessage)
  }

  // Seam for legal-hold check — returns false until the legal-hold mechanism lands.
  async isUnderLegalHold(_playerId: string): Promise<boolean> {
    return false
  }

  async deletePersonalThreadFor(playerId: string): Promise<void> {
    if (await this.isUnderLegalHold(playerId)) {
      log.info('personal.thread.hold.skipped', { playerId })
      return
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const convRes = await client.query(
        `SELECT id FROM messaging.conversations WHERE type = 'personal' AND player_id = $1`,
        [playerId],
      )
      if (convRes.rows.length === 0) {
        await client.query('COMMIT')
        return
      }
      const conversationId = convRes.rows[0].id as string

      // Delete recipients first (FK → group_messages)
      await client.query(
        `DELETE FROM messaging.group_message_recipients
         WHERE message_id IN (
           SELECT id FROM messaging.group_messages WHERE conversation_id = $1
         )`,
        [conversationId],
      )
      // Delete messages
      await client.query(
        `DELETE FROM messaging.group_messages WHERE conversation_id = $1`,
        [conversationId],
      )
      // Delete conversation
      await client.query(
        `DELETE FROM messaging.conversations WHERE id = $1`,
        [conversationId],
      )

      await client.query('COMMIT')
      log.info('personal.thread.deleted', { playerId, conversationId })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Hard-deletes every message (and card) in a conversation, but keeps the
   * conversation row itself — used by 1:1 Coach "clear conversation" (S2,
   * COACH_1TO1_DESIGN.md §7 #10b: player-initiated, hard-delete, not a
   * tombstone; distinct from deletePersonalThreadFor, which is a DSR
   * primitive that also removes the conversation row). Memories live in a
   * separate store and are untouched. Returns the number of message rows
   * deleted.
   */
  async clearConversation(conversationId: string): Promise<number> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      await client.query(
        `DELETE FROM messaging.assistant_cards WHERE conversation_id = $1`,
        [conversationId]
      )
      const result = await client.query(
        `DELETE FROM messaging.group_messages WHERE conversation_id = $1`,
        [conversationId]
      )

      await client.query('COMMIT')
      log.info('conversation.cleared', { conversationId, deleted: result.rowCount })
      return result.rowCount ?? 0
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
}
