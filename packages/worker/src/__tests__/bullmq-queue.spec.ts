/**
 * V1.3 — BullMQJobQueue contract tests (Redis-gated)
 *
 * SKIP MECHANISM: The outer describe gates on REDIS_URL being set.
 * When Redis is not running, every test in this file skips cleanly.
 * To run these tests:
 *
 *   REDIS_URL=redis://localhost:6379 npx jest bullmq-queue.spec.ts
 *
 * Shared contract: add/consume, dedup by jobId, retry/backoff behaviour.
 * BullMQ handles retry/backoff natively in Redis — we test observable state.
 */

const REDIS_URL = process.env.REDIS_URL

const describeIfRedis = REDIS_URL ? describe : describe.skip

describeIfRedis('BullMQJobQueue (Redis-gated — skip when REDIS_URL unset)', () => {
  let BullMQJobQueue: any
  let queue: any
  // Each test run uses a unique queue prefix to avoid cross-test pollution
  const testId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  beforeAll(async () => {
    const mod = await import('../bullmq-queue')
    BullMQJobQueue = mod.BullMQJobQueue
  })

  beforeEach(() => {
    queue = new BullMQJobQueue({ url: REDIS_URL!, prefix: `{bull:${testId}}` })
  })

  afterEach(async () => {
    await queue.obliterate()
    await queue.close()
  })

  describe('add — job creation and enqueueing', () => {
    it('adds a job and returns an EnqueuedJob', async () => {
      const job = await queue.add('standings.recalculate', {
        tournamentId: 'tournament_1',
        groupId: 'group_1',
        conversationId: 'conv_1',
      })

      expect(job).toBeDefined()
      expect(job.id).toBeDefined()
      expect(job.name).toBe('standings.recalculate')
      expect(job.data).toMatchObject({ tournamentId: 'tournament_1', groupId: 'group_1' })
      expect(job.attemptsMade).toBe(0)
    })

    it('uses explicit jobId when provided', async () => {
      const job = await queue.add(
        'standings.recalculate',
        { tournamentId: 'tournament_1', groupId: 'group_1', conversationId: 'conv_1' },
        { jobId: 'custom_job_id_bullmq' }
      )
      expect(job.id).toBe('custom_job_id_bullmq')
    })

    it('deduplicates: adding same jobId twice returns the existing job', async () => {
      const job1 = await queue.add(
        'standings.recalculate',
        { tournamentId: 't1', groupId: 'g1', conversationId: 'conv_1' },
        { jobId: 'dedup-test' }
      )
      const job2 = await queue.add(
        'standings.recalculate',
        { tournamentId: 't1', groupId: 'g1', conversationId: 'conv_1' },
        { jobId: 'dedup-test' }
      )
      expect(job2.id).toBe(job1.id)
    })

    it('stores different jobs independently (different names)', async () => {
      const job1 = await queue.add(
        'standings.recalculate',
        { tournamentId: 't1', groupId: 'g1', conversationId: 'conv_1' },
        { jobId: 'distinct-standings-job' }
      )
      const job2 = await queue.add('bracket.generate', {
        tournamentId: 't1',
        conversationId: 'conv_1',
      }, { jobId: 'distinct-bracket-job' })
      expect(job1.id).toBe('distinct-standings-job')
      expect(job2.id).toBe('distinct-bracket-job')
      expect(job1.name).toBe('standings.recalculate')
      expect(job2.name).toBe('bracket.generate')
    })
  })

  describe('getJob', () => {
    it('returns a job by ID', async () => {
      const added = await queue.add(
        'standings.recalculate',
        { tournamentId: 't1', groupId: 'g1', conversationId: 'conv_1' },
        { jobId: 'get-job-test' }
      )
      const fetched = await queue.getJob('get-job-test')
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(added.id)
      expect(fetched!.name).toBe('standings.recalculate')
    })

    it('returns null for an unknown jobId', async () => {
      const result = await queue.getJob('definitely-does-not-exist')
      expect(result).toBeNull()
    })
  })

  describe('close', () => {
    it('resolves without error', async () => {
      const q = new BullMQJobQueue({ url: REDIS_URL!, prefix: `{bull:${testId}-close}` })
      await q.add('standings.recalculate', {
        tournamentId: 't1',
        groupId: 'g1',
        conversationId: 'conv_1',
      })
      await q.obliterate()
      await expect(q.close()).resolves.not.toThrow()
    })
  })
})
