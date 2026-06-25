/**
 * V1.3 — BullMQJobQueue env-selection tests
 *
 * Verifies that selectJobQueue() picks the right implementation based on
 * JOB_QUEUE and REDIS_URL env vars. No Redis needed — the BullMQ path
 * instantiates but we only assert type, not connect.
 */

describe('job queue env-selection (selectJobQueue)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(async () => {
    process.env = originalEnv
  })

  it('returns InMemoryJobQueue when JOB_QUEUE is not set', async () => {
    delete process.env.JOB_QUEUE
    delete process.env.REDIS_URL
    const { selectJobQueue } = await import('../../job-queue-factory')
    const { InMemoryJobQueue } = await import('@worker/job-queue')
    const queue = selectJobQueue()
    expect(queue).toBeInstanceOf(InMemoryJobQueue)
    await queue.close()
  })

  it('returns InMemoryJobQueue when JOB_QUEUE=memory', async () => {
    process.env.JOB_QUEUE = 'memory'
    delete process.env.REDIS_URL
    const { selectJobQueue } = await import('../../job-queue-factory')
    const { InMemoryJobQueue } = await import('@worker/job-queue')
    const queue = selectJobQueue()
    expect(queue).toBeInstanceOf(InMemoryJobQueue)
    await queue.close()
  })

  it('returns InMemoryJobQueue when JOB_QUEUE=bullmq but REDIS_URL is unset', async () => {
    process.env.JOB_QUEUE = 'bullmq'
    delete process.env.REDIS_URL
    const { selectJobQueue } = await import('../../job-queue-factory')
    const { InMemoryJobQueue } = await import('@worker/job-queue')
    const queue = selectJobQueue()
    // Falls back to in-memory when REDIS_URL is missing
    expect(queue).toBeInstanceOf(InMemoryJobQueue)
    await queue.close()
  })

  it('returns BullMQJobQueue when JOB_QUEUE=bullmq and REDIS_URL is set', async () => {
    process.env.JOB_QUEUE = 'bullmq'
    process.env.REDIS_URL = 'redis://localhost:6379'
    const { selectJobQueue } = await import('../../job-queue-factory')
    const { BullMQJobQueue } = await import('@worker/bullmq-queue')
    const queue = selectJobQueue()
    expect(queue).toBeInstanceOf(BullMQJobQueue)
    // Clean up without connecting — just close
    await queue.close().catch(() => {})
  })
})
