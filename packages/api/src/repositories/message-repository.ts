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
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    senderPlayerId: row.sender_player_id,
    recipientPlayerId: row.recipient_player_id ?? null,
    matchId: row.match_id ?? null,
    body: row.body,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    legalHold: !!row.legal_hold,
  }
}

export class MessageRepository {
  constructor(private pool: Pool) {}

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

      const result = await client.query(
        `WITH msg AS (
           INSERT INTO messaging.messages
             (tournament_id, sender_player_id, recipient_player_id, match_id, body)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, tournament_id, sender_player_id, recipient_player_id,
                     match_id, body, created_at, legal_hold
         ),
         ins_recipients AS (
           INSERT INTO messaging.message_recipients
             (message_id, message_created_at, player_id)
           SELECT id, created_at, $3 FROM msg
         )
         SELECT * FROM msg`,
        [
          input.tournamentId,
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
  ): Promise<{ message: MessageRow; recipientCount: number }> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      // First count participants so we can return the count.
      const countResult = await client.query(
        `SELECT COUNT(*) AS n FROM public.player_registrations WHERE tournament_id = $1`,
        [input.tournamentId]
      )
      const recipientCount = Number(countResult.rows[0].n)

      // Single CTE: insert message + fan-out recipient rows in one statement.
      // The SELECT ... CROSS JOIN produces N recipient rows in a single INSERT,
      // satisfying the "single multi-row INSERT" requirement.
      const result = await client.query(
        `WITH msg AS (
           INSERT INTO messaging.messages
             (tournament_id, sender_player_id, recipient_player_id, body)
           VALUES ($1, $2, NULL, $3)
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
         )
         SELECT * FROM msg`,
        [input.tournamentId, input.senderPlayerId, input.body]
      )

      await client.query('COMMIT')

      const message = rowToMessage(result.rows[0])

      log.info('announcement.sent', {
        tournamentId: input.tournamentId,
        messageId: message.id,
        senderPlayerId: input.senderPlayerId,
        recipientCount,
      })

      return { message, recipientCount }
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
   */
  async getHistory(input: GetHistoryInput): Promise<MessageRow[]> {
    const { tournamentId, limit, before } = input

    if (before) {
      // Use date_trunc('milliseconds', ...) on both sides of the cursor comparison.
      // JavaScript Date objects have millisecond precision but Postgres stores
      // TIMESTAMPTZ with microsecond precision. Without truncation, a stored value
      // like 22:00:00.001421 would be GREATER than the JS cursor 22:00:00.001000,
      // causing all same-millisecond messages to be excluded from the page.
      // Truncating both sides to milliseconds produces correct keyset pagination.
      const result = await this.pool.query(
        `SELECT id, tournament_id, sender_player_id, recipient_player_id,
                match_id, body, created_at, legal_hold
         FROM messaging.messages
         WHERE tournament_id = $1
           AND (date_trunc('milliseconds', created_at), id)
               < (date_trunc('milliseconds', $2::timestamptz), $3)
         ORDER BY created_at ASC, id ASC
         LIMIT $4`,
        [tournamentId, before.createdAt, before.id, limit]
      )
      return result.rows.map(rowToMessage)
    }

    const result = await this.pool.query(
      `SELECT id, tournament_id, sender_player_id, recipient_player_id,
              match_id, body, created_at, legal_hold
       FROM messaging.messages
       WHERE tournament_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
      [tournamentId, limit]
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
