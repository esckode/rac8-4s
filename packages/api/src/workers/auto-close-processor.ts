import type { Pool } from 'pg'
import { PollRepository } from '../repositories/poll-repository'
import { getLogger } from '../logger'

const log = getLogger('auto-close-processor')

export interface AutoCloseSweepDeps {
  pool: Pool
  now?: Date
}

/**
 * Auto-close sweep (P3.3).
 *
 * Queries for all polls with auto_close_at <= :now AND closed_at IS NULL.
 * For each, delegates to PollRepository.closePoll which freezes the tally
 * and posts the system follow-up message. Idempotent: closePoll skips
 * already-closed polls (closed_at IS NOT NULL guard in the UPDATE).
 */
export async function processAutoCloseSweep(deps: AutoCloseSweepDeps): Promise<void> {
  const { pool, now = new Date() } = deps
  const pollRepo = new PollRepository(pool as any)

  // Find all polls due for auto-close, with their groupId from the conversation
  const result = await pool.query(
    `SELECT p.id AS poll_id, p.message_id, c.group_id
     FROM messaging.polls p
     JOIN messaging.group_messages gm ON gm.id = p.message_id
     JOIN messaging.conversations c ON c.id = gm.conversation_id
     WHERE p.auto_close_at <= $1
       AND p.closed_at IS NULL
       AND p.auto_close_at IS NOT NULL`,
    [now],
  )

  if (result.rows.length === 0) {
    log.debug('auto_close.sweep.nothing', { now: now.toISOString() })
    return
  }

  let closed = 0
  let skipped = 0

  for (const row of result.rows) {
    const { message_id: messageId, group_id: groupId } = row as {
      poll_id: string
      message_id: string
      group_id: string
    }

    try {
      await pollRepo.closePoll(messageId, groupId, 'system')
      closed++
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'POLL_ALREADY_CLOSED') {
        skipped++
      } else {
        log.error('auto_close.poll.failed', {
          messageId,
          groupId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  log.info('auto_close.sweep.done', { closed, skipped, total: result.rows.length })
}
