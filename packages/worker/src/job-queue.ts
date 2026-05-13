import { EnqueuedJob, JobName, JobOptions, JobPayload } from './types'

export type { EnqueuedJob, JobName, JobOptions, JobPayload }

export interface JobQueue {
  add<K extends JobName>(
    name: K,
    data: JobPayload[K],
    opts?: JobOptions
  ): Promise<EnqueuedJob<JobPayload[K]>>
  getJob(jobId: string): Promise<EnqueuedJob | null>
  getFailedJobs(): EnqueuedJob[]
  close(): Promise<void>
}

export interface RetryConfig {
  /** Maximum number of retry attempts before moving to DLQ (default: 3) */
  maxAttempts?: number
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  backoffBase?: number
}

export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  backoffBase: 1000,
}

export class InMemoryJobQueue implements JobQueue {
  private jobs = new Map<string, EnqueuedJob>()
  private failed: EnqueuedJob[] = []
  private counter = 0
  private retryTimers = new Map<string, NodeJS.Timeout>()
  private retryConfig: Required<RetryConfig>

  constructor(config: RetryConfig = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  }

  async add<K extends JobName>(
    name: K,
    data: JobPayload[K],
    opts: JobOptions = {}
  ): Promise<EnqueuedJob<JobPayload[K]>> {
    const id = opts.jobId ?? `job_${++this.counter}`

    // Deduplication: same jobId returns same job
    if (this.jobs.has(id)) {
      return this.jobs.get(id)! as EnqueuedJob<JobPayload[K]>
    }

    const job: EnqueuedJob = {
      id,
      name,
      data: data as unknown,
      opts,
      attemptsMade: 0,
      enqueuedAt: Date.now(),
    }

    this.jobs.set(id, job)
    return job as EnqueuedJob<JobPayload[K]>
  }

  async getJob(jobId: string): Promise<EnqueuedJob | null> {
    return this.jobs.get(jobId) ?? null
  }

  getFailedJobs(): EnqueuedJob[] {
    return [...this.failed]
  }

  async close(): Promise<void> {
    // Clear all pending retry timers
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer)
    }
    this.retryTimers.clear()
  }

  // Test helpers
  getAll(): EnqueuedJob[] {
    return [...this.jobs.values()]
  }

  getByName(name: JobName): EnqueuedJob[] {
    return this.getAll().filter((j) => j.name === name)
  }

  clear(): void {
    // Clear timers before clearing jobs
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer)
    }
    this.jobs.clear()
    this.failed = []
    this.counter = 0
    this.retryTimers.clear()
  }

  /**
   * Schedule a job for retry with exponential backoff: 2^attempt * backoffBase.
   * After maxAttempts, moves job to dead-letter queue.
   * Job remains in queue during retry period and is ready for re-execution.
   * @param jobId Job identifier
   * @param reason Failure reason
   * @param maxAttempts Override max attempts (uses config if not provided)
   */
  async fail(jobId: string, reason: string, maxAttempts?: number): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return

    job.attemptsMade++
    job.lastError = reason

    const attempts = maxAttempts ?? this.retryConfig.maxAttempts
    if (job.attemptsMade >= attempts) {
      // Max attempts reached, move to DLQ
      job.failedReason = reason
      this.failed.push(job)
      this.jobs.delete(jobId)
      return
    }

    // Schedule retry with exponential backoff: 2^attempt * backoffBase
    const delayMs = Math.pow(2, job.attemptsMade) * this.retryConfig.backoffBase
    const timer = setTimeout(() => {
      this.retryTimers.delete(jobId)
      // Job remains in queue, ready to be retried
    }, delayMs)

    this.retryTimers.set(jobId, timer)
  }

  /**
   * Test helper: get retry delay for a job (in ms).
   * Returns null if no retry scheduled.
   */
  getRetryDelay(jobId: string): number | null {
    const job = this.jobs.get(jobId)
    if (!job || job.attemptsMade === 0) return null
    return Math.pow(2, job.attemptsMade) * this.retryConfig.backoffBase
  }
}
