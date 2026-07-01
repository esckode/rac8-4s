/**
 * P3.1 — Shared scheduler infrastructure (RED tests)
 *
 * Tests:
 *   1. InMemoryScheduler: register and fire a named handler
 *   2. InMemoryScheduler: unregistered name throws
 *   3. InMemoryScheduler: at-least-once — handler fired twice, idempotent handler produces same state
 *   4. InMemoryScheduler: tick() fires all registered handlers
 *   5. InMemoryScheduler: registeredNames() returns registered names
 *   6. InMemoryScheduler: `now` is forwarded to handler
 */

import { InMemoryScheduler } from '../scheduler'

describe('InMemoryScheduler', () => {
  it('registers and fires a named handler', async () => {
    const scheduler = new InMemoryScheduler()
    const calls: string[] = []

    scheduler.register('poll.auto_close', async () => {
      calls.push('fired')
    })

    await scheduler.fire('poll.auto_close')
    expect(calls).toEqual(['fired'])
  })

  it('throws when firing an unregistered handler', async () => {
    const scheduler = new InMemoryScheduler()
    await expect(scheduler.fire('no.such.handler')).rejects.toThrow()
  })

  it('at-least-once: firing same handler twice, idempotent handler produces same state', async () => {
    const scheduler = new InMemoryScheduler()

    // Simulate an idempotent handler: operates via a Set (deduplicated)
    const processed = new Set<string>()
    const jobId = 'poll-close-123'

    scheduler.register('poll.auto_close', async () => {
      processed.add(jobId) // idempotent: adding to a set is always safe
    })

    await scheduler.fire('poll.auto_close')
    await scheduler.fire('poll.auto_close') // simulate at-least-once re-delivery

    // Handler ran twice; idempotent result: set has exactly one entry
    expect(processed.size).toBe(1)
  })

  it('tick() fires all registered handlers once', async () => {
    const scheduler = new InMemoryScheduler()
    const log: string[] = []

    scheduler.register('job.a', async () => { log.push('a') })
    scheduler.register('job.b', async () => { log.push('b') })

    await scheduler.tick()

    expect(log).toContain('a')
    expect(log).toContain('b')
    expect(log).toHaveLength(2)
  })

  it('registeredNames() returns all registered handler names', () => {
    const scheduler = new InMemoryScheduler()
    scheduler.register('poll.auto_close', async () => {})
    scheduler.register('match.idle_sweep', async () => {})

    const names = scheduler.registeredNames()
    expect(names).toContain('poll.auto_close')
    expect(names).toContain('match.idle_sweep')
    expect(names).toHaveLength(2)
  })

  it('forwards the `now` timestamp to the handler', async () => {
    const scheduler = new InMemoryScheduler()
    const received: Date[] = []

    scheduler.register('test.job', async ({ now }) => {
      received.push(now)
    })

    const fixedNow = new Date('2026-07-01T00:00:00Z')
    await scheduler.fire('test.job', { now: fixedNow })

    expect(received).toHaveLength(1)
    expect(received[0].toISOString()).toBe(fixedNow.toISOString())
  })
})
