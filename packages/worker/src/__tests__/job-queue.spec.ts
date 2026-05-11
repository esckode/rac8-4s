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

  describe('Retry and DLQ simulation', () => {
    it('should increment attemptsMade when failed', async () => {
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
      expect(queue.getFailedJobs()).toHaveLength(0) // Still in queue
    })

    it('should move job to DLQ after max attempts', async () => {
      const job = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
      }, {
        jobId: 'dlq_test_job',
      })

      await queue.fail('dlq_test_job', 'Attempt 1', 3)
      await queue.fail('dlq_test_job', 'Attempt 2', 3)
      await queue.fail('dlq_test_job', 'Attempt 3', 3)

      const inQueue = await queue.getJob('dlq_test_job')
      expect(inQueue).toBeNull() // Removed from queue

      const failed = queue.getFailedJobs()
      expect(failed).toHaveLength(1)
      expect(failed[0].id).toBe('dlq_test_job')
      expect(failed[0].failedReason).toBe('Attempt 3')
      expect(failed[0].attemptsMade).toBe(3)
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
