import { InMemoryJobQueue } from '../job-queue'
import { JobName } from '../types'

describe('InMemoryJobQueue', () => {
  let queue: InMemoryJobQueue

  beforeEach(() => {
    queue = new InMemoryJobQueue()
  })

  afterEach(async () => {
    await queue.close()
  })

  describe('add - job creation and enqueueing', () => {
    it('should add a job with generated ID', async () => {
      const job = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      })

      expect(job).toBeDefined()
      expect(job.id).toMatch(/^job_\d+$/)
      expect(job.name).toBe('standings.recalculate')
      expect(job.data).toEqual({ tournamentId: 'tournament_1', groupId: 'group_1' })
      expect(job.attemptsMade).toBe(0)
    })

    it('should use explicit jobId when provided', async () => {
      const job = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'custom_job_id',
      })

      expect(job.id).toBe('custom_job_id')
    })

    it('should return same job when adding with duplicate jobId', async () => {
      const job1 = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'standings.recalculate:group_1',
      })

      const job2 = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'standings.recalculate:group_1',
      })

      expect(job2.id).toBe(job1.id)
      expect(job2).toEqual(job1)
    })

    it('should store different jobs independently', async () => {
      const job1 = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      })

      const job2 = await queue.add('bracket.generate', {
        tournamentId: 'tournament_1',
      })

      expect(job1.id).not.toBe(job2.id)
      expect(job1.name).toBe('standings.recalculate')
      expect(job2.name).toBe('bracket.generate')
      expect(queue.getAll()).toHaveLength(2)
    })
  })

  describe('getJob', () => {
    it('should return job by ID', async () => {
      const added = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      })

      const fetched = await queue.getJob(added.id)
      expect(fetched).toEqual(added)
    })

    it('should return null for unknown job ID', async () => {
      const result = await queue.getJob('unknown_job_id')
      expect(result).toBeNull()
    })
  })

  describe('getAll and getByName', () => {
    it('should return all enqueued jobs', async () => {
      const job1 = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      })

      const job2 = await queue.add('bracket.generate', {
        tournamentId: 'tournament_1',
      })

      const all = queue.getAll()
      expect(all).toHaveLength(2)
      expect(all).toContainEqual(job1)
      expect(all).toContainEqual(job2)
    })

    it('should filter jobs by name', async () => {
      await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      })

      await queue.add('standings.recalculate', {
        tournamentId: 'tournament_2',
        groupId: 'group_2',
      })

      await queue.add('bracket.generate', {
        tournamentId: 'tournament_1',
      })

      const standings = queue.getByName('standings.recalculate')
      expect(standings).toHaveLength(2)
      expect(standings.every((j) => j.name === 'standings.recalculate')).toBe(true)
    })
  })

  describe('Retry and DLQ with exponential backoff', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should increment attemptsMade and schedule retry on failure', async () => {
      const job = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'retry_test_job',
      })

      expect(job.attemptsMade).toBe(0)
      expect(queue.getFailedJobs()).toHaveLength(0)

      await queue.fail('retry_test_job', 'Test failure')
      const failed1 = await queue.getJob('retry_test_job')
      expect(failed1?.attemptsMade).toBe(1)
      expect(queue.getFailedJobs()).toHaveLength(0) // Still in queue (retry scheduled)
    })

    it('should schedule exponential backoff: 2^attempt * 1000ms', async () => {
      await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'backoff_test_job',
      })

      // First failure: delay = 2^1 * 1000 = 2000ms
      await queue.fail('backoff_test_job', 'Attempt 1', 3)
      expect(queue.getRetryDelay('backoff_test_job')).toBe(2000)

      // After first retry succeeds, second failure: delay = 2^2 * 1000 = 4000ms
      jest.advanceTimersByTime(2000)
      await queue.fail('backoff_test_job', 'Attempt 2', 3)
      expect(queue.getRetryDelay('backoff_test_job')).toBe(4000)

      // After second retry succeeds, third failure: delay = 2^3 * 1000 = 8000ms
      jest.advanceTimersByTime(4000)
      await queue.fail('backoff_test_job', 'Attempt 3', 3)
      expect(queue.getRetryDelay('backoff_test_job')).toBeNull() // Moved to DLQ
    })

    it('should move job to DLQ after max attempts', async () => {
      const job = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'dlq_test_job',
      })

      // First failure
      await queue.fail('dlq_test_job', 'Attempt 1', 3)
      expect(await queue.getJob('dlq_test_job')).toBeDefined()
      expect(queue.getFailedJobs()).toHaveLength(0)

      // Second failure
      jest.advanceTimersByTime(2000)
      await queue.fail('dlq_test_job', 'Attempt 2', 3)
      expect(await queue.getJob('dlq_test_job')).toBeDefined()
      expect(queue.getFailedJobs()).toHaveLength(0)

      // Third failure (max attempts reached)
      jest.advanceTimersByTime(4000)
      await queue.fail('dlq_test_job', 'Attempt 3', 3)

      const inQueue = await queue.getJob('dlq_test_job')
      expect(inQueue).toBeNull() // Removed from queue

      const failed = queue.getFailedJobs()
      expect(failed).toHaveLength(1)
      expect(failed[0].id).toBe('dlq_test_job')
      expect(failed[0].failedReason).toBe('Attempt 3')
      expect(failed[0].attemptsMade).toBe(3)
    })

    it('should track last error reason', async () => {
      await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'error_tracking_job',
      })

      await queue.fail('error_tracking_job', 'Database connection timeout')
      let job = await queue.getJob('error_tracking_job')
      expect(job?.lastError).toBe('Database connection timeout')

      jest.advanceTimersByTime(2000)
      await queue.fail('error_tracking_job', 'SMTP server error')
      job = await queue.getJob('error_tracking_job')
      expect(job?.lastError).toBe('SMTP server error')
    })

    it('should clear retry timers on close', async () => {
      await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'cleanup_test_job',
      })

      await queue.fail('cleanup_test_job', 'Test failure')
      expect(queue.getRetryDelay('cleanup_test_job')).toBe(2000)

      // Close should clear all timers
      await queue.close()

      // Verify no leaks
      expect(() => {
        jest.runAllTimers()
      }).not.toThrow()
    })

    it('should clear retry timers on clear', async () => {
      await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'clear_test_job',
      })

      await queue.fail('clear_test_job', 'Test failure')
      queue.clear()

      // Should not throw when timers are cleaned up
      jest.runAllTimers()
      expect(queue.getAll()).toHaveLength(0)
      expect(queue.getFailedJobs()).toHaveLength(0)
    })
  })

  describe('Configurable retry settings', () => {
    it('should use custom maxAttempts from config', async () => {
      jest.useFakeTimers()
      const customQueue = new InMemoryJobQueue({ maxAttempts: 2 })

      const job = await customQueue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'custom_attempts_test',
      })

      // First failure (attempt 1)
      await customQueue.fail('custom_attempts_test', 'Failure 1')
      expect(await customQueue.getJob('custom_attempts_test')).toBeDefined()
      expect(customQueue.getFailedJobs()).toHaveLength(0)

      // Second failure (attempt 2 = max, should move to DLQ)
      jest.advanceTimersByTime(2000)
      await customQueue.fail('custom_attempts_test', 'Failure 2')
      expect(await customQueue.getJob('custom_attempts_test')).toBeNull()
      expect(customQueue.getFailedJobs()).toHaveLength(1)

      jest.useRealTimers()
      await customQueue.close()
    })

    it('should use custom backoffBase from config', async () => {
      jest.useFakeTimers()
      const customQueue = new InMemoryJobQueue({ backoffBase: 500, maxAttempts: 4 })

      await customQueue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'custom_backoff_test',
      })

      // First failure: delay = 2^1 * 500 = 1000ms
      await customQueue.fail('custom_backoff_test', 'Failure 1')
      expect(customQueue.getRetryDelay('custom_backoff_test')).toBe(1000)

      // Second failure: delay = 2^2 * 500 = 2000ms
      jest.advanceTimersByTime(1000)
      await customQueue.fail('custom_backoff_test', 'Failure 2')
      expect(customQueue.getRetryDelay('custom_backoff_test')).toBe(2000)

      // Third failure: delay = 2^3 * 500 = 4000ms
      jest.advanceTimersByTime(2000)
      await customQueue.fail('custom_backoff_test', 'Failure 3')
      expect(customQueue.getRetryDelay('custom_backoff_test')).toBe(4000)

      jest.useRealTimers()
      await customQueue.close()
    })

    it('should use defaults when no config provided', async () => {
      jest.useFakeTimers()
      const defaultQueue = new InMemoryJobQueue()

      await defaultQueue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'default_config_test',
      })

      // First failure: delay = 2^1 * 1000 = 2000ms (default)
      await defaultQueue.fail('default_config_test', 'Failure 1')
      expect(defaultQueue.getRetryDelay('default_config_test')).toBe(2000)

      jest.useRealTimers()
      await defaultQueue.close()
    })

    it('should use both custom maxAttempts and backoffBase', async () => {
      jest.useFakeTimers()
      const customQueue = new InMemoryJobQueue({ maxAttempts: 2, backoffBase: 250 })

      await customQueue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'combined_config_test',
      })

      // First failure: delay = 2^1 * 250 = 500ms
      await customQueue.fail('combined_config_test', 'Failure 1')
      expect(customQueue.getRetryDelay('combined_config_test')).toBe(500)
      expect(customQueue.getFailedJobs()).toHaveLength(0)

      // Second failure: max attempts reached, move to DLQ
      jest.advanceTimersByTime(500)
      await customQueue.fail('combined_config_test', 'Failure 2')
      expect(await customQueue.getJob('combined_config_test')).toBeNull()
      expect(customQueue.getFailedJobs()).toHaveLength(1)

      jest.useRealTimers()
      await customQueue.close()
    })
  })

  describe('clear', () => {
    it('should clear all jobs and reset counter', async () => {
      await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      })

      await queue.add('bracket.generate', {
        tournamentId: 'tournament_1',
      })

      queue.clear()

      expect(queue.getAll()).toHaveLength(0)

      // Counter should reset
      const newJob = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_2',
        groupId: 'group_2',
      })
      expect(newJob.id).toBe('job_1') // Counter reset
    })
  })

  describe('close', () => {
    it('should resolve without error', async () => {
      await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      })

      await expect(queue.close()).resolves.not.toThrow()
    })
  })
})
