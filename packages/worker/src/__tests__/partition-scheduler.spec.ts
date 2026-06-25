/**
 * V2.1 — Partition scheduler: repeatable-job registration (Redis-gated)
 *
 * SKIP MECHANISM: gates on REDIS_URL being set.
 * To run:
 *   REDIS_URL=redis://localhost:6379 npx jest partition-scheduler.spec.ts
 *
 * Tests:
 *  - Registering repeatable monthly jobs is idempotent across N workers:
 *    calling registerPartitionJobs() multiple times does not create duplicates.
 *  - The dedup key is the repeat key (cron schedule string + job name prefix).
 *  - registerPartitionJobs() returns without error when called in parallel
 *    (simulating N workers booting simultaneously).
 */

const REDIS_URL = process.env.REDIS_URL

const describeIfRedis = REDIS_URL ? describe : describe.skip

describeIfRedis('Partition scheduler — repeatable-job dedup (Redis-gated)', () => {
  let BullMQJobQueue: any
  let registerPartitionJobs: any
  const testPrefix = `{bull:partition-sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}}`

  beforeAll(async () => {
    const queueMod = await import('../bullmq-queue')
    BullMQJobQueue = queueMod.BullMQJobQueue

    const schedulerMod = await import('../partition-scheduler')
    registerPartitionJobs = schedulerMod.registerPartitionJobs
  })

  afterAll(async () => {
    // Clean up the queues we created
    const q1 = new BullMQJobQueue({ url: REDIS_URL!, prefix: testPrefix })
    await q1.obliterate()
    await q1.close()
  })

  it('registerPartitionJobs registers ensure + purge repeatable jobs', async () => {
    const { Queue } = await import('bullmq')

    const ensureQueue = new Queue('messaging.partition.ensure', {
      connection: { url: REDIS_URL! } as any,
      prefix: testPrefix,
    })
    const purgeQueue = new Queue('messaging.partition.purge', {
      connection: { url: REDIS_URL! } as any,
      prefix: testPrefix,
    })

    await registerPartitionJobs({ redisUrl: REDIS_URL!, prefix: testPrefix })

    const ensureRepeatable = await ensureQueue.getRepeatableJobs()
    const purgeRepeatable = await purgeQueue.getRepeatableJobs()

    // At least one ensure repeatable job (monthly cron)
    expect(ensureRepeatable.length).toBeGreaterThanOrEqual(1)
    // At least one purge repeatable job
    expect(purgeRepeatable.length).toBeGreaterThanOrEqual(1)

    await ensureQueue.close()
    await purgeQueue.close()
  })

  it('calling registerPartitionJobs() twice does not duplicate repeatable jobs (idempotent)', async () => {
    const { Queue } = await import('bullmq')

    const ensureQueue = new Queue('messaging.partition.ensure', {
      connection: { url: REDIS_URL! } as any,
      prefix: testPrefix,
    })

    // Call twice (simulating two workers booting)
    await registerPartitionJobs({ redisUrl: REDIS_URL!, prefix: testPrefix })
    await registerPartitionJobs({ redisUrl: REDIS_URL!, prefix: testPrefix })

    const repeatableJobs = await ensureQueue.getRepeatableJobs()

    // BullMQ deduplicates by repeat key — must have exactly 1 ensure job
    const ensureJobs = repeatableJobs.filter((j: any) => j.name === 'messaging.partition.ensure')
    expect(ensureJobs.length).toBe(1)

    await ensureQueue.close()
  })

  it('calling registerPartitionJobs() in parallel (N workers) results in exactly 1 repeatable job', async () => {
    const { Queue } = await import('bullmq')

    const ensureQueue = new Queue('messaging.partition.ensure', {
      connection: { url: REDIS_URL! } as any,
      prefix: testPrefix,
    })
    const purgeQueue = new Queue('messaging.partition.purge', {
      connection: { url: REDIS_URL! } as any,
      prefix: testPrefix,
    })

    // Simulate 3 workers booting at the same time
    await Promise.all([
      registerPartitionJobs({ redisUrl: REDIS_URL!, prefix: testPrefix }),
      registerPartitionJobs({ redisUrl: REDIS_URL!, prefix: testPrefix }),
      registerPartitionJobs({ redisUrl: REDIS_URL!, prefix: testPrefix }),
    ])

    const ensureJobs = await ensureQueue.getRepeatableJobs()
    const purgeJobs = await purgeQueue.getRepeatableJobs()

    // BullMQ deduplicates by cron + name — each should have exactly 1
    const ensureCount = ensureJobs.filter((j: any) => j.name === 'messaging.partition.ensure').length
    const purgeCount = purgeJobs.filter((j: any) => j.name === 'messaging.partition.purge').length
    expect(ensureCount).toBe(1)
    expect(purgeCount).toBe(1)

    await ensureQueue.close()
    await purgeQueue.close()
  })
})
