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

export class InMemoryJobQueue implements JobQueue {
  private jobs = new Map<string, EnqueuedJob>()
  private failed: EnqueuedJob[] = []
  private counter = 0

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
    // No-op for in-memory queue
  }

  // Test helpers
  getAll(): EnqueuedJob[] {
    return [...this.jobs.values()]
  }

  getByName(name: JobName): EnqueuedJob[] {
    return this.getAll().filter((j) => j.name === name)
  }

  clear(): void {
    this.jobs.clear()
    this.failed = []
    this.counter = 0
  }

  // Simulate failure (for testing DLQ behavior)
  async fail(jobId: string, reason: string, maxAttempts = 3): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return

    job.attemptsMade++
    if (job.attemptsMade >= maxAttempts) {
      job.failedReason = reason
      this.failed.push(job)
      this.jobs.delete(jobId)
    }
  }
}
