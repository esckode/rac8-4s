/**
 * Partition scheduler — V2.1
 *
 * Registers monthly BullMQ repeatable jobs for partition maintenance:
 *   - messaging.partition.ensure  (cron: 0 3 1 * *)  — 03:00 UTC on 1st of each month
 *   - messaging.partition.purge   (cron: 0 4 1 * *)  — 04:00 UTC on 1st of each month
 *
 * BullMQ deduplicates repeatable jobs by their repeat key (derived from
 * queue name + job name + cron expression). Calling registerPartitionJobs()
 * N times (e.g. N workers booting in parallel) results in exactly 1 entry
 * per cron schedule — the scheduler is idempotent.
 */

import { Queue } from 'bullmq'

export interface PartitionSchedulerOptions {
  /** Redis connection URL, e.g. "redis://localhost:6379" */
  redisUrl: string
  /** BullMQ queue key prefix. Must match the worker prefix. Default: "{bull}" */
  prefix?: string
  /**
   * Number of months ahead to pre-create on boot (in addition to current month).
   * Default: 3 (i.e. current + 3 future months)
   */
  monthsAhead?: number
  /**
   * Retention days passed to the purge job. Default: 90
   */
  retentionDays?: number
  /**
   * Drop padding days passed to the purge job. Default: 45
   */
  dropPaddingDays?: number
  /**
   * When true, purge runs in dry-run mode (logs would-be actions, no DDL).
   * Default: false
   */
  purgeDryRun?: boolean
}

/**
 * Register monthly repeatable jobs for partition ensure and purge.
 * Idempotent: safe to call multiple times (e.g. from N workers at boot).
 * BullMQ deduplicates by cron + job name (the repeat key).
 */
export async function registerPartitionJobs(options: PartitionSchedulerOptions): Promise<void> {
  const {
    redisUrl,
    prefix = '{bull}',
    monthsAhead = 3,
    retentionDays = 90,
    dropPaddingDays = 45,
    purgeDryRun = false,
  } = options

  const connection = { url: redisUrl } as any

  const ensureQueue = new Queue('messaging.partition.ensure', { connection, prefix })
  const purgeQueue = new Queue('messaging.partition.purge', { connection, prefix })
  const sweepQueue = new Queue('casual.idle.sweep', { connection, prefix })

  try {
    // Monthly ensure: 03:00 UTC on the 1st of each month
    await ensureQueue.add(
      'messaging.partition.ensure',
      { monthsAhead },
      {
        repeat: { pattern: '0 3 1 * *', utc: true },
        jobId: 'partition.ensure.monthly',
      }
    )

    // Monthly purge: 04:00 UTC on the 1st of each month
    await purgeQueue.add(
      'messaging.partition.purge',
      { retentionDays, dropPaddingDays, dryRun: purgeDryRun },
      {
        repeat: { pattern: '0 4 1 * *', utc: true },
        jobId: 'partition.purge.monthly',
      }
    )

    // Daily idle-sweep: 02:00 UTC every day
    await sweepQueue.add(
      'casual.idle.sweep',
      { idleDays: 7 },
      {
        repeat: { pattern: '0 2 * * *', utc: true },
        jobId: 'casual.idle.sweep.daily',
      }
    )
  } finally {
    await ensureQueue.close()
    await purgeQueue.close()
    await sweepQueue.close()
  }
}
