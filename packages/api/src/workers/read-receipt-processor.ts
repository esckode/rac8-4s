import { Pool } from 'pg'
import { MessageRepository } from '../repositories/message-repository'
import { getLogger } from '../logger'

const log = getLogger('read-receipt-processor')

interface ReadReceiptProcessorDeps {
  pool: Pool
}

/**
 * Handle the messaging.read_receipt.flush job.
 *
 * Takes a batch of read events, deduplicates them, then flushes all of them
 * in a single bulk UPDATE via MessageRepository.markReadBatch.
 *
 * This is intentionally a thin handler — the deduplication and SQL construction
 * live in the repository so they can be tested independently.
 */
export async function processReadReceiptFlush(
  payload: { reads: Array<{ messageId: string; playerId: string }> },
  deps: ReadReceiptProcessorDeps
): Promise<void> {
  const { reads } = payload
  if (reads.length === 0) {
    return
  }

  const repo = new MessageRepository(deps.pool)
  try {
    await repo.markReadBatch(reads)

    // Count unique pairs after deduplication for the log entry.
    const seen = new Set(reads.map((r) => `${r.messageId}|${r.playerId}`))
    log.info('read_receipt.flush.done', { count: seen.size })
  } catch (error) {
    log.error('read_receipt.flush.failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
