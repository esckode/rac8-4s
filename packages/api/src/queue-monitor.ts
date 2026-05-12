import type { JobQueue, JobName, JobOptions, JobPayload, EnqueuedJob } from '@worker/job-queue'
import { getLogger } from './logger'

const log = getLogger('queue-monitor')

export class QueueMonitor implements JobQueue {
  constructor(private queue: JobQueue) {}

  async add<K extends JobName>(
    name: K,
    data: JobPayload[K],
    opts?: JobOptions
  ): Promise<EnqueuedJob<JobPayload[K]>> {
    const job = await this.queue.add(name, data, opts)

    // Monitor email.send jobs for anomalies
    if (name === 'email.send') {
      const emailData = data as JobPayload['email.send']
      const recipientCount = emailData.recipientIds.length

      // Audit: log jobs with >= 500 recipients
      if (recipientCount >= 500) {
        log.info('queue.job.audit', {
          jobId: job.id,
          jobType: name,
          recipientCount,
          enqueuedAt: new Date(job.enqueuedAt).toISOString(),
        })
      }

      // Warn: log jobs with > 100 recipients (near-enforcement boundary)
      if (recipientCount > 100) {
        log.warn('queue.job.near_limit', {
          jobId: job.id,
          jobType: name,
          recipientCount,
          maxLimit: 1000,
        })
      }
    }

    return job
  }

  async getJob(jobId: string): Promise<EnqueuedJob | null> {
    return this.queue.getJob(jobId)
  }

  getFailedJobs(): EnqueuedJob[] {
    return this.queue.getFailedJobs()
  }

  async close(): Promise<void> {
    return this.queue.close()
  }
}
