import { Pool } from 'pg'
import type { EmailAdapter } from '../email-adapter'
import { getLogger } from '../logger'

const log = getLogger('notify-processor')

export interface MessagingNotifyPayload {
  conversationId: string
  tournamentId?: string
  groupId?: string
}

interface NotifyProcessorDeps {
  pool: Pool
  emailAdapter: EmailAdapter
}

/**
 * Handle the messaging.notify job.
 *
 * After a grace window (the job's delay in BullMQ; elapsed by the time this
 * processor runs), select all recipients in the conversation who:
 *   - have at least one unread message (read_at IS NULL), AND
 *   - have not yet been notified (notified_at IS NULL)
 *
 * For each such recipient, send ONE digest email (coalescing: N unread messages
 * per recipient → one email). Then set notified_at = now() so a retry or
 * second invocation is a no-op (idempotency).
 *
 * "Offline" is approximated by "unread after grace" (§17.2). No per-player
 * connection tracking is required.
 *
 * Logging: noun.verb; IDs only — never message bodies or PII beyond player IDs.
 */
export async function processMessagingNotify(
  payload: MessagingNotifyPayload,
  deps: NotifyProcessorDeps
): Promise<void> {
  const { conversationId, tournamentId } = payload
  const { pool, emailAdapter } = deps

  try {
    // Select offline recipients: unread AND not yet notified.
    // Joins players to get the email address for the digest.
    // One row per recipient — COUNT(mr.message_id) gives the unread count for
    // the subject line ("You have N unread messages").
    const result = await pool.query(
      `SELECT
         mr.player_id,
         p.email  AS player_email,
         COUNT(*) AS unread_count
       FROM messaging.message_recipients mr
       JOIN messaging.messages m
         ON m.id = mr.message_id
       JOIN public.players p
         ON p.id = mr.player_id
       WHERE m.conversation_id = $1
         AND mr.read_at    IS NULL
         AND mr.notified_at IS NULL
       GROUP BY mr.player_id, p.email`,
      [conversationId]
    )

    if (result.rows.length === 0) {
      log.debug('notification.skipped', { conversationId, tournamentId, reason: 'no_offline_recipients' })
      return
    }

    const playerIds: string[] = []

    for (const row of result.rows) {
      const { player_id: playerId, player_email: playerEmail, unread_count: unreadCount } = row as {
        player_id: string
        player_email: string
        unread_count: string
      }

      const count = Number(unreadCount)
      const subject = `You have ${count} unread message${count === 1 ? '' : 's'} in your tournament`
      const body = `You have ${count} unread message${count === 1 ? '' : 's'} waiting for you. Log in to read them.`

      await emailAdapter.send(playerEmail, subject, body)
      playerIds.push(playerId)
    }

    // Mark all notified recipients in one UPDATE (idempotency guard).
    if (playerIds.length > 0) {
      const placeholders = playerIds.map((_, i) => `$${i + 2}`).join(', ')
      await pool.query(
        `UPDATE messaging.message_recipients mr
         SET notified_at = now()
         FROM messaging.messages m
         WHERE m.id = mr.message_id
           AND m.conversation_id = $1
           AND mr.player_id IN (${placeholders})
           AND mr.notified_at IS NULL`,
        [conversationId, ...playerIds]
      )
    }

    log.info('notification.sent', {
      conversationId,
      tournamentId,
      recipientCount: playerIds.length,
    })
  } catch (error) {
    log.error('notification.failed', {
      conversationId,
      tournamentId,
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
