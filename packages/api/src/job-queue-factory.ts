import { InMemoryJobQueue } from '@worker/job-queue'
import { BullMQJobQueue } from '@worker/bullmq-queue'
import type { JobQueue } from '@worker/job-queue'
import { getLogger } from './logger'

const log = getLogger('job-queue-factory')

/**
 * Create a JobQueue implementation based on JOB_QUEUE and REDIS_URL env vars.
 *
 * - JOB_QUEUE=bullmq + REDIS_URL set → BullMQJobQueue
 * - anything else (or REDIS_URL missing) → InMemoryJobQueue
 *
 * This mirrors the selectBroadcastBus() pattern from broadcast-bus.ts.
 */
export function selectJobQueue(): JobQueue {
  const backend = process.env.JOB_QUEUE ?? 'memory'
  const redisUrl = process.env.REDIS_URL

  if (backend === 'bullmq' && redisUrl) {
    log.info('job-queue.selected', { backend: 'bullmq', url: redisUrl })
    return new BullMQJobQueue({ url: redisUrl })
  }

  if (backend === 'bullmq' && !redisUrl) {
    log.warn('job-queue.fallback', {
      note: 'JOB_QUEUE=bullmq but REDIS_URL is not set; falling back to InMemoryJobQueue',
    })
  }

  return new InMemoryJobQueue()
}
