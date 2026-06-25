import { Queue, QueueOptions } from 'bullmq'
import { EnqueuedJob, JobName, JobOptions, JobPayload } from './types'
import { JobQueue } from './job-queue'

export type { EnqueuedJob, JobName, JobOptions, JobPayload }

export interface BullMQJobQueueOptions {
  /** Redis connection URL, e.g. "redis://localhost:6379" */
  url?: string
  /** Legacy host/port form (used when url is not provided) */
  host?: string
  port?: number
  /** Queue key prefix (useful in tests to isolate suites). Default: "{bull}" */
  prefix?: string
}

export class BullMQJobQueue implements JobQueue {
  private queues = new Map<string, Queue>()
  private connection: { host: string; port: number } | { url: string }
  private prefix: string

  constructor(options: BullMQJobQueueOptions = {}) {
    if (options.url) {
      this.connection = { url: options.url }
    } else {
      this.connection = { host: options.host ?? 'localhost', port: options.port ?? 6379 }
    }
    this.prefix = options.prefix ?? '{bull}'
  }

  private getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      const queueOptions: QueueOptions = {
        connection: this.connection as any,
        prefix: this.prefix,
      }
      this.queues.set(name, new Queue(name, queueOptions))
    }
    return this.queues.get(name)!
  }

  async add<K extends JobName>(
    name: K,
    data: JobPayload[K],
    opts: JobOptions = {}
  ): Promise<EnqueuedJob<JobPayload[K]>> {
    const queue = this.getQueue(name)
    const job = await queue.add(name, data, {
      jobId: opts.jobId,
      attempts: opts.attempts ?? 3,
      backoff: opts.backoff ?? { type: 'exponential', delay: 1000 },
    })

    return {
      id: job.id!,
      name,
      data: data as unknown,
      opts,
      attemptsMade: 0,
      enqueuedAt: Date.now(),
    } as EnqueuedJob<JobPayload[K]>
  }

  async getJob(jobId: string): Promise<EnqueuedJob | null> {
    // Search across all queues
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(jobId)
      if (job) {
        return {
          id: job.id!,
          name: job.name as JobName,
          data: job.data,
          opts: {},
          attemptsMade: job.attemptsMade,
          enqueuedAt: job.timestamp || Date.now(),
        }
      }
    }
    return null
  }

  getFailedJobs(): EnqueuedJob[] {
    // BullMQ tracks failures in Redis — not needed for the contract
    return []
  }

  async close(): Promise<void> {
    const promises = Array.from(this.queues.values()).map((q) => q.close())
    await Promise.all(promises)
    this.queues.clear()
  }

  /**
   * Test helper: obliterate all queues (removes all jobs and queue data from Redis).
   * Only call this in tests.
   */
  async obliterate(): Promise<void> {
    const promises = Array.from(this.queues.values()).map((q) =>
      q.obliterate({ force: true }).catch(() => {})
    )
    await Promise.all(promises)
  }
}
