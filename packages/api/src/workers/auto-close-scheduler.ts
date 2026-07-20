/**
 * Poll auto-close sweep scheduler (BACKLOG.md BE-GAP-1).
 *
 * Registers a repeatable BullMQ job for processAutoCloseSweep
 * (auto-close-processor.ts). Same idempotent-registration pattern as
 * registerAssistantSweepJobs (assistant/sweep-scheduler.ts): BullMQ dedupes
 * repeatable jobs by their repeat key (queue name + job name + cron
 * expression), so calling this at boot from N worker instances yields
 * exactly one entry.
 */

import { Queue } from 'bullmq'

export interface AutoCloseSweepSchedulerOptions {
  /** Redis connection URL, e.g. "redis://localhost:6379" */
  redisUrl: string
  /** BullMQ queue key prefix. Must match the worker prefix. Default: "{bull}" */
  prefix?: string
}

/**
 * Register the poll auto-close sweep repeatable job.
 * Idempotent: safe to call multiple times (e.g. from N workers at boot).
 */
export async function registerAutoCloseSweepJob(options: AutoCloseSweepSchedulerOptions): Promise<void> {
  const { redisUrl, prefix = '{bull}' } = options
  const connection = { url: redisUrl } as any

  const queue = new Queue('poll.auto_close.sweep', { connection, prefix })

  try {
    // Every 5 minutes — tight enough that a tester setting a near-term
    // auto-close time during a live UAT round doesn't wait an hour for it.
    await queue.add(
      'poll.auto_close.sweep',
      {},
      {
        repeat: { pattern: '*/5 * * * *', utc: true },
        jobId: 'poll.auto_close.sweep.every5min',
      }
    )
  } finally {
    await queue.close()
  }
}
