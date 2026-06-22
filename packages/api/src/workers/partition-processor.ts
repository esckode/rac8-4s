import { Pool } from 'pg'
import { PartitionManager } from '../services/partition-manager'
import { getLogger } from '../logger'

const log = getLogger('partition-processor')

interface PartitionProcessorDeps {
  pool: Pool
}

/**
 * Handle the messaging.partition.ensure job.
 * Calls ensure_future_partitions to pre-create aligned monthly partitions.
 */
export async function processPartitionEnsure(
  payload: { monthsAhead?: number },
  deps: PartitionProcessorDeps
): Promise<void> {
  const { monthsAhead = 2 } = payload
  const manager = new PartitionManager(deps.pool)
  try {
    await manager.ensureFuturePartitions(monthsAhead)
    log.info('partition.ensure.job.done', { monthsAhead })
  } catch (error) {
    log.error('partition.ensure.job.failed', {
      message: error instanceof Error ? error.message : String(error),
      monthsAhead,
    })
    throw error
  }
}

/**
 * Handle the messaging.partition.purge job.
 * Calls purge_old_partitions with the boundary-safe gate.
 */
export async function processPartitionPurge(
  payload: { retentionDays?: number; dropPaddingDays?: number; dryRun?: boolean },
  deps: PartitionProcessorDeps
): Promise<{ dropped: number; detached: number }> {
  const { retentionDays = 90, dropPaddingDays = 45, dryRun = false } = payload
  const manager = new PartitionManager(deps.pool)
  try {
    const actions = await manager.purgeOldPartitions({ retentionDays, dropPaddingDays, dryRun })
    const dropped = actions.filter((a) => a.action === 'DROPPED').length
    const detached = actions.filter((a) => a.action === 'DETACHED').length
    log.info('partition.purge.job.done', { dropped, detached, dryRun })
    return { dropped, detached }
  } catch (error) {
    log.error('partition.purge.job.failed', {
      message: error instanceof Error ? error.message : String(error),
      retentionDays,
      dropPaddingDays,
      dryRun,
    })
    throw error
  }
}
