/**
 * Assistant proactive sweep scheduler (Phase C — design §11 C0).
 *
 * Registers hourly BullMQ repeatable jobs for the nudge/recap sweeps (and,
 * eventually, the weekly digest). Same idempotent-registration pattern as
 * @worker/partition-scheduler: BullMQ dedupes repeatable jobs by their repeat
 * key (queue name + job name + cron expression), so calling this at boot from
 * N worker instances yields exactly one entry per schedule.
 */

import { Queue } from 'bullmq'

export interface AssistantSweepSchedulerOptions {
  /** Redis connection URL, e.g. "redis://localhost:6379" */
  redisUrl: string
  /** BullMQ queue key prefix. Must match the worker prefix. Default: "{bull}" */
  prefix?: string
}

/**
 * Register the hourly nudge-sweep and recap-sweep repeatable jobs.
 * Idempotent: safe to call multiple times (e.g. from N workers at boot).
 */
export async function registerAssistantSweepJobs(options: AssistantSweepSchedulerOptions): Promise<void> {
  const { redisUrl, prefix = '{bull}' } = options
  const connection = { url: redisUrl } as any

  const nudgeQueue = new Queue('assistant.nudge.sweep', { connection, prefix })
  const recapQueue = new Queue('assistant.recap.sweep', { connection, prefix })

  try {
    // Hourly, on the hour, UTC.
    await nudgeQueue.add(
      'assistant.nudge.sweep',
      {},
      {
        repeat: { pattern: '0 * * * *', utc: true },
        jobId: 'assistant.nudge.sweep.hourly',
      }
    )

    // Same hourly tick as the nudge sweep (design §11 C0).
    await recapQueue.add(
      'assistant.recap.sweep',
      {},
      {
        repeat: { pattern: '0 * * * *', utc: true },
        jobId: 'assistant.recap.sweep.hourly',
      }
    )
  } finally {
    await nudgeQueue.close()
    await recapQueue.close()
  }
}
