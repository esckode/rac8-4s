import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('message-repository')

export interface MessageRow {
  id: string
  tournamentId: string
  senderPlayerId: string
  recipientPlayerId: string | null
  matchId: string | null
  body: string
  createdAt: Date
  legalHold: boolean
  /** Present only when getHistory is called with viewerPlayerId; null means unread. */
  read_at?: Date | null
}

export interface SendDirectMessageInput {
  tournamentId: string
  senderPlayerId: string
  recipientPlayerId: string
  body: string
  matchId?: string
}

export interface SendBroadcastInput {
  tournamentId: string
  senderPlayerId: string
  body: string
}

export interface HistoryCursor {
  createdAt: Date
  id: string
}

export interface GetHistoryInput {
  tournamentId: string
  limit: number
  before?: HistoryCursor
  /** When provided, LEFT JOINs message_recipients to include per-player read_at. */
  viewerPlayerId?: string
}

export interface GetHistoryByConversationInput {
  conversationId: string
  limit: number
  before?: HistoryCursor
  /** When provided, LEFT JOINs message_recipients to include per-player read_at. */
  viewerPlayerId?: string
}

export interface MarkReadInput {
  messageId: string
  messageCreatedAt: Date
  playerId: string
}

export interface GetUnreadCountInput {
  playerId: string
  tournamentId?: string
}

function rowToMessage(row: any): MessageRow {
  const msg: MessageRow = {
    id: row.id,
    tournamentId: row.tournament_id,
    senderPlayerId: row.sender_player_id,
    recipientPlayerId: row.recipient_player_id ?? null,
    matchId: row.match_id ?? null,
    body: row.body,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    legalHold: !!row.legal_hold,
  }
  if ('viewer_read_at' in row) {
    msg.read_at = row.viewer_read_at instanceof Date
      ? row.viewer_read_at
      : row.viewer_read_at
        ? new Date(row.viewer_read_at)
        : null
  }
  return msg
}

export class MessageRepository {
  constructor(private pool: Pool) {}

  /**
   * Resolve (or create) the conversation_id for a tournament.
   * Idempotent: safe to call concurrently — uses INSERT ON CONFLICT.
   */
  private async resolveConversationId(client: { query: (text: string, params?: unknown[]) => Promise<any> }, tournamentId: string): Promise<string> {
    const ins = await client.query(
      `INSERT INTO messaging.conversations (type, tournament_id)
       VALUES ('tournament', $1)
       ON CONFLICT (tournament_id) WHERE tournament_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [tournamentId]
    )
    if (ins.rows.length > 0) return ins.rows[0].id as string
    const sel = await client.query(
      `SELECT id FROM messaging.conversations WHERE tournament_id = $1`,
      [tournamentId]
    )
    return sel.rows[0].id as string
  }

  /**
   * Send a direct message from one player to another.
   *
   * Uses a single CTE that inserts one row into messaging.messages (with
   * recipient_player_id set) and one row into messaging.message_recipients,
   * all in one SQL statement. This is required to work around the PG 15
   * limitation where FK constraints on partitioned tables cannot see rows
   * inserted earlier in the same transaction via separate statements.
   */
  async sendDirectMessage(input: SendDirectMessageInput): Promise<MessageRow> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const conversationId = await this.resolveConversationId(client, input.tournamentId)

      const result = await client.query(
        `WITH msg AS (
           INSERT INTO messaging.messages
             (tournament_id, conversation_id, sender_player_id, recipient_player_id, match_id, body)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, tournament_id, sender_player_id, recipient_player_id,
                     match_id, body, created_at, legal_hold
         ),
         ins_recipients AS (
           INSERT INTO messaging.message_recipients
             (message_id, message_created_at, player_id)
           SELECT id, created_at, $4 FROM msg
         )
         SELECT * FROM msg`,
        [
          input.tournamentId,
          conversationId,
          input.senderPlayerId,
          input.recipientPlayerId,
          input.matchId ?? null,
          input.body,
        ]
      )

      await client.query('COMMIT')

      const message = rowToMessage(result.rows[0])

      log.info('message.sent', {
        tournamentId: input.tournamentId,
        messageId: message.id,
        senderPlayerId: input.senderPlayerId,
        recipientPlayerId: input.recipientPlayerId,
      })

      return message
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Broadcast a message to all current tournament participants.
   *
   * Uses a single CTE that inserts one row into messaging.messages
   * (recipient_player_id = NULL) and fans out to all participants via a
   * single multi-row INSERT (`INSERT INTO ... SELECT ... CROSS JOIN
   * player_registrations`). Both inserts happen in one SQL statement,
   * which is inherently atomic and works around the PG 15 FK/partition
   * visibility limitation.
   */
  async sendBroadcast(
    input: SendBroadcastInput
  ): Promise<{ message: MessageRow; recipientCount: number; recipientIds: string[] }> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const conversationId = await this.resolveConversationId(client, input.tournamentId)

      // Single CTE: insert message + fan-out recipient rows in one statement,
      // returning recipient player_ids for job enqueue.
      const result = await client.query(
        `WITH msg AS (
           INSERT INTO messaging.messages
             (tournament_id, conversation_id, sender_player_id, recipient_player_id, body)
           VALUES ($1, $2, $3, NULL, $4)
           RETURNING id, tournament_id, sender_player_id, recipient_player_id,
                     match_id, body, created_at, legal_hold
         ),
         ins_recipients AS (
           INSERT INTO messaging.message_recipients
             (message_id, message_created_at, player_id)
           SELECT msg.id, msg.created_at, pr.player_id
           FROM msg
           CROSS JOIN public.player_registrations pr
           WHERE pr.tournament_id = $1
           RETURNING player_id
         )
         SELECT
           (SELECT row_to_json(msg.*) FROM msg) AS message_row,
           array_agg(ins_recipients.player_id) AS recipient_ids
         FROM ins_recipients`,
        [input.tournamentId, conversationId, input.senderPlayerId, input.body]
      )

      await client.query('COMMIT')

      const row = result.rows[0]
      const message = rowToMessage(row.message_row)
      const recipientIds: string[] = row.recipient_ids ?? []
      const recipientCount = recipientIds.length

      log.info('announcement.sent', {
        tournamentId: input.tournamentId,
        messageId: message.id,
        senderPlayerId: input.senderPlayerId,
        recipientCount,
      })

      return { message, recipientCount, recipientIds }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Get paginated message history for a tournament.
   * Ordered by (created_at ASC, id ASC) for stable pagination.
   * Optional `before` cursor excludes messages at or after the cursor position.
   *
   * When `viewerPlayerId` is provided, LEFT JOINs messaging.message_recipients so
   * each row includes the viewer's per-message read_at (returned as `viewer_read_at`).
   * This lets the frontend distinguish unread messages without a separate query.
   */
  async getHistory(input: GetHistoryInput): Promise<MessageRow[]> {
    const { tournamentId, limit, before, viewerPlayerId } = input
    const readAtSelect = viewerPlayerId ? ', mr.read_at AS viewer_read_at' : ''

    if (before) {
      // Params: $1=tournamentId, $2=before.createdAt, $3=before.id, $4=limit,
      //         $5=viewerPlayerId (optional)
      const joinClause = viewerPlayerId
        ? `LEFT JOIN messaging.message_recipients mr
               ON mr.message_id = m.id AND mr.player_id = $5`
        : ''
      const params: unknown[] = [tournamentId, before.createdAt, before.id, limit]
      if (viewerPlayerId) params.push(viewerPlayerId)

      const result = await this.pool.query(
        `SELECT m.id, m.tournament_id, m.sender_player_id, m.recipient_player_id,
                m.match_id, m.body, m.created_at, m.legal_hold${readAtSelect}
         FROM messaging.messages m
         ${joinClause}
         WHERE m.tournament_id = $1
           AND (date_trunc('milliseconds', m.created_at), m.id)
               < (date_trunc('milliseconds', $2::timestamptz), $3)
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT $4`,
        params
      )
      return result.rows.map(rowToMessage)
    }

    // Params: $1=tournamentId, $2=limit, $3=viewerPlayerId (optional)
    const joinClause = viewerPlayerId
      ? `LEFT JOIN messaging.message_recipients mr
             ON mr.message_id = m.id AND mr.player_id = $3`
      : ''
    const params: unknown[] = [tournamentId, limit]
    if (viewerPlayerId) params.push(viewerPlayerId)

    const result = await this.pool.query(
      `SELECT m.id, m.tournament_id, m.sender_player_id, m.recipient_player_id,
              m.match_id, m.body, m.created_at, m.legal_hold${readAtSelect}
       FROM messaging.messages m
       ${joinClause}
       WHERE m.tournament_id = $1
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT $2`,
      params
    )
    return result.rows.map(rowToMessage)
  }

  /**
   * Get paginated message history for a conversation (keyed by conversation_id).
   * Mirrors getHistory but keys on conversation_id rather than tournament_id,
   * making it the forward-compatible variant (works for both tournament and
   * group conversations once Player Groups is built).
   */
  async getHistoryByConversation(input: GetHistoryByConversationInput): Promise<MessageRow[]> {
    const { conversationId, limit, before, viewerPlayerId } = input
    const readAtSelect = viewerPlayerId ? ', mr.read_at AS viewer_read_at' : ''

    if (before) {
      const joinClause = viewerPlayerId
        ? `LEFT JOIN messaging.message_recipients mr
               ON mr.message_id = m.id AND mr.player_id = $5`
        : ''
      const params: unknown[] = [conversationId, before.createdAt, before.id, limit]
      if (viewerPlayerId) params.push(viewerPlayerId)

      const result = await this.pool.query(
        `SELECT m.id, m.tournament_id, m.sender_player_id, m.recipient_player_id,
                m.match_id, m.body, m.created_at, m.legal_hold${readAtSelect}
         FROM messaging.messages m
         ${joinClause}
         WHERE m.conversation_id = $1
           AND (date_trunc('milliseconds', m.created_at), m.id)
               < (date_trunc('milliseconds', $2::timestamptz), $3)
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT $4`,
        params
      )
      return result.rows.map(rowToMessage)
    }

    const joinClause = viewerPlayerId
      ? `LEFT JOIN messaging.message_recipients mr
             ON mr.message_id = m.id AND mr.player_id = $3`
      : ''
    const params: unknown[] = [conversationId, limit]
    if (viewerPlayerId) params.push(viewerPlayerId)

    const result = await this.pool.query(
      `SELECT m.id, m.tournament_id, m.sender_player_id, m.recipient_player_id,
              m.match_id, m.body, m.created_at, m.legal_hold${readAtSelect}
       FROM messaging.messages m
       ${joinClause}
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT $2`,
      params
    )
    return result.rows.map(rowToMessage)
  }

  /**
   * Mark a specific message as read by a player.
   * Sets read_at = now() on the recipient row.
   * Idempotent: safe to call multiple times.
   *
   * Note: message_created_at is intentionally excluded from the WHERE clause.
   * PG 15 FK constraints on partitioned tables use a different snapshot than
   * the current transaction's MVCC snapshot, which means a JS Date returned
   * from `now()` is truncated to milliseconds and won't match the stored
   * microsecond-precision timestamp. Omitting it causes a cross-partition scan
   * (only 3 partitions per message so the cost is negligible) and avoids
   * the precision mismatch.
   */
  async markRead(input: MarkReadInput): Promise<void> {
    await this.pool.query(
      `UPDATE messaging.message_recipients
       SET read_at = now()
       WHERE message_id = $1
         AND player_id = $2
         AND read_at IS NULL`,
      [input.messageId, input.playerId]
    )
  }

  /**
   * Mark multiple (messageId, playerId) pairs as read in a single bulk UPDATE.
   * Deduplicates pairs before issuing the statement.
   * Idempotent: pairs already read (read_at IS NOT NULL) are skipped.
   *
   * Uses a CTE-based JOIN rather than an IN (VALUES ...) row-constructor, which
   * avoids Postgres type-inference issues (text vs uuid) when binding parameters
   * in a row comparison context.
   *
   * Does nothing if the input array is empty.
   */
  async markReadBatch(reads: Array<{ messageId: string; playerId: string }>): Promise<void> {
    if (reads.length === 0) return

    // Deduplicate by "messageId|playerId" key.
    const seen = new Set<string>()
    const unique: Array<{ messageId: string; playerId: string }> = []
    for (const r of reads) {
      const key = `${r.messageId}|${r.playerId}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(r)
      }
    }

    // Build a FROM (VALUES ...) subquery to match (message_id, player_id) pairs.
    // Note: message_id is uuid but player_id is text in message_recipients — casts
    // must match the column types exactly. Using FROM ... WHERE rather than
    // IN (VALUES ...) to avoid Postgres's row-constructor type-inference issues.
    //
    // Shape: FROM (VALUES ($1::uuid, $2), ($3::uuid, $4)) AS v(mid, pid)
    const valuePlaceholders = unique
      .map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2})`)
      .join(', ')
    const params = unique.flatMap((r) => [r.messageId, r.playerId])

    await this.pool.query(
      `UPDATE messaging.message_recipients mr
       SET read_at = now()
       FROM (VALUES ${valuePlaceholders}) AS v(mid, pid)
       WHERE mr.message_id = v.mid
         AND mr.player_id = v.pid
         AND mr.read_at IS NULL`,
      params
    )
  }

  /**
   * Count unread messages for a player.
   * Optionally scoped to a specific tournament.
   */
  async getUnreadCount(input: GetUnreadCountInput): Promise<number> {
    if (input.tournamentId) {
      const result = await this.pool.query(
        `SELECT COUNT(*) AS n
         FROM messaging.message_recipients mr
         JOIN messaging.messages m
           ON m.id = mr.message_id AND m.created_at = mr.message_created_at
         WHERE mr.player_id = $1
           AND m.tournament_id = $2
           AND mr.read_at IS NULL`,
        [input.playerId, input.tournamentId]
      )
      return Number(result.rows[0].n)
    }

    const result = await this.pool.query(
      `SELECT COUNT(*) AS n
       FROM messaging.message_recipients
       WHERE player_id = $1 AND read_at IS NULL`,
      [input.playerId]
    )
    return Number(result.rows[0].n)
  }
}
