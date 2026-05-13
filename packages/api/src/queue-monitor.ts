import type { JobQueue, JobName, JobOptions, JobPayload, EnqueuedJob } from '@worker/job-queue'
import type { AppConfig } from './config'
import { getLogger } from './logger'

const log = getLogger('queue-monitor')

export class QueueMonitor implements JobQueue {
  constructor(private queue: JobQueue, private config: AppConfig) {}

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
      const { auditLogThreshold, warningLogThreshold, warningPercentOfLimit } =
        this.config.limits.emailAuditThresholds
      const maxLimit = this.config.limits.emailRecipientsPerJob

      // Audit: log jobs exceeding audit threshold
      if (recipientCount >= auditLogThreshold) {
        log.info('queue.job.audit', {
          jobId: job.id,
          jobType: name,
          recipientCount,
          enqueuedAt: new Date(job.enqueuedAt).toISOString(),
        })
      }

      // Warn: log jobs exceeding warning threshold
      if (recipientCount >= warningLogThreshold) {
        log.warn('queue.job.near_limit', {
          jobId: job.id,
          jobType: name,
          recipientCount,
          maxLimit,
        })
      }

      // Warn: log jobs at percentage of limit
      const percentOfLimit = Math.round((recipientCount / maxLimit) * 100)
      if (percentOfLimit >= warningPercentOfLimit) {
        log.warn('queue.job.approaching_limit', {
          jobId: job.id,
          jobType: name,
          recipientCount,
          maxLimit,
          percentOfLimit,
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
