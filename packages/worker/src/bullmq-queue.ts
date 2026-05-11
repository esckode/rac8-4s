import { Queue, QueueOptions } from 'bullmq'
import { EnqueuedJob, JobName, JobOptions, JobPayload } from './types'
import { JobQueue } from './job-queue'

export class BullMQJobQueue implements JobQueue {
  private queues = new Map<string, Queue>()
  private connection: { host: string; port: number }

  constructor(connection: { host: string; port: number } = { host: 'localhost', port: 6379 }) {
    this.connection = connection
  }

  private getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      const queueOptions: QueueOptions = {
        connection: this.connection,
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
        }
      }
    }
    return null
  }

  getFailedJobs(): EnqueuedJob[] {
    // Would need to fetch from failed queue
    // For now, empty since BullMQ tracks failures in Redis
    return []
  }

  async close(): Promise<void> {
    const promises = Array.from(this.queues.values()).map((q) => q.close())
    await Promise.all(promises)
    this.queues.clear()
  }
}
