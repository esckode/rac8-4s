/**
 * P0.3 — Poll auto-close sweep scheduler (BACKLOG.md BE-GAP-1)
 *
 * processAutoCloseSweep (workers/auto-close-processor.ts) is fully built and
 * tested but nothing schedules it — polls testers create would simply never
 * auto-close. This asserts registerAutoCloseSweepJob exists and registers a
 * BullMQ repeatable job, following the exact idempotent-registration pattern
 * as registerAssistantSweepJobs (assistant/sweep-scheduler.ts).
 *
 * SKIP MECHANISM: gates on REDIS_URL being set, matching
 * packages/worker/src/__tests__/partition-scheduler.spec.ts.
 * To run:
 *   REDIS_URL=redis://localhost:6379 npx jest auto-close-sweep-scheduler.spec.ts
 */
import { Queue } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL

const describeIfRedis = REDIS_URL ? describe : describe.skip

describeIfRedis('Auto-close sweep scheduler — repeatable-job registration (Redis-gated)', () => {
  const testPrefix = `{bull:auto-close-sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}}`
  let registerAutoCloseSweepJob: (options: { redisUrl: string; prefix?: string }) => Promise<void>

  beforeAll(async () => {
    const schedulerMod = await import('../../workers/auto-close-scheduler')
    registerAutoCloseSweepJob = schedulerMod.registerAutoCloseSweepJob
  })

  afterAll(async () => {
    const { BullMQJobQueue } = await import('@worker/bullmq-queue')
    const q = new BullMQJobQueue({ url: REDIS_URL!, prefix: testPrefix })
    await q.obliterate()
    await q.close()
  })

  it('registers a repeatable poll auto-close sweep job', async () => {
    const queue = new Queue('poll.auto_close.sweep', {
      connection: { url: REDIS_URL! } as any,
      prefix: testPrefix,
    })

    await registerAutoCloseSweepJob({ redisUrl: REDIS_URL!, prefix: testPrefix })

    const repeatable = await queue.getRepeatableJobs()
    expect(repeatable.length).toBeGreaterThanOrEqual(1)

    await queue.close()
  })

  it('calling registerAutoCloseSweepJob() twice does not duplicate the repeatable job (idempotent)', async () => {
    const queue = new Queue('poll.auto_close.sweep', {
      connection: { url: REDIS_URL! } as any,
      prefix: testPrefix,
    })

    await registerAutoCloseSweepJob({ redisUrl: REDIS_URL!, prefix: testPrefix })
    await registerAutoCloseSweepJob({ redisUrl: REDIS_URL!, prefix: testPrefix })

    const repeatable = await queue.getRepeatableJobs()
    const matching = repeatable.filter((j) => j.name === 'poll.auto_close.sweep')
    expect(matching.length).toBe(1)

    await queue.close()
  })
})
