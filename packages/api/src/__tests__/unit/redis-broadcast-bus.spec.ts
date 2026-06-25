/**
 * V1.2 — RedisBroadcastBus unit spec (Redis-gated)
 *
 * SKIP MECHANISM: The outer describe.skipIf gates on REDIS_URL being set.
 * When Redis is not running, every test in this file skips cleanly — the
 * default CI suite (no Redis) never fails here. To run these tests:
 *
 *   REDIS_URL=redis://localhost:6379 npx jest redis-broadcast-bus.spec.ts
 *
 * Tests validated: local delivery via Redis, cross-node delivery between two
 * bus instances, channel isolation (one channel doesn't bleed into another).
 * (Multi-instance e2e validation with two real API processes is V2.2.)
 */

const REDIS_URL = process.env.REDIS_URL

// Jest 29+ supports describe.skip and conditionally skipping.
// We use a top-level describe to wrap everything so the gate is obvious.
const describeIfRedis = REDIS_URL ? describe : describe.skip

describeIfRedis('RedisBroadcastBus (Redis-gated — skip when REDIS_URL unset)', () => {
  let RedisBroadcastBus: any

  beforeAll(async () => {
    // Dynamic import after the gate so ioredis connections are only opened when Redis is available
    const mod = await import('../../broadcast-bus')
    RedisBroadcastBus = mod.RedisBroadcastBus
  })

  // Helper: wait up to timeoutMs for fn to return true
  function waitFor(fn: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const check = () => {
        if (fn()) return resolve()
        if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'))
        setTimeout(check, intervalMs)
      }
      check()
    })
  }

  describe('local delivery via Redis', () => {
    let bus: any

    beforeEach(async () => {
      bus = new RedisBroadcastBus(REDIS_URL!)
      await bus.whenReady()
    })

    afterEach(async () => {
      await bus.close()
    })

    it('a subscriber on the same bus instance receives an emitted event', async () => {
      const received: Array<[string, unknown]> = []
      bus.subscribe('conv_local', (event: string, data: unknown) => {
        received.push([event, data])
      })

      bus.emit('conv_local', 'message.created', { id: 'msg1' })

      await waitFor(() => received.length > 0)
      expect(received).toHaveLength(1)
      expect(received[0]).toEqual(['message.created', { id: 'msg1' }])
    })

    it('unsubscribe removes the listener', async () => {
      const received: unknown[] = []
      const unsub = bus.subscribe('conv_local2', (event: string, data: unknown) => {
        received.push([event, data])
      })

      bus.emit('conv_local2', 'ping', { seq: 1 })
      await waitFor(() => received.length > 0)
      expect(received).toHaveLength(1)

      unsub()
      bus.emit('conv_local2', 'ping', { seq: 2 })
      // Wait a bit to confirm the second event is NOT delivered
      await new Promise((r) => setTimeout(r, 100))
      expect(received).toHaveLength(1) // still 1
    })
  })

  describe('cross-node delivery between two bus instances', () => {
    let busA: any
    let busB: any

    beforeEach(async () => {
      busA = new RedisBroadcastBus(REDIS_URL!)
      busB = new RedisBroadcastBus(REDIS_URL!)
      await Promise.all([busA.whenReady(), busB.whenReady()])
    })

    afterEach(async () => {
      await Promise.all([busA.close(), busB.close()])
    })

    it('event emitted on busA is received by subscriber on busB', async () => {
      const received: Array<[string, unknown]> = []
      busB.subscribe('conv_cross', (event: string, data: unknown) => {
        received.push([event, data])
      })

      busA.emit('conv_cross', 'message.created', { id: 'cross1' })

      await waitFor(() => received.length > 0)
      expect(received).toHaveLength(1)
      expect(received[0]).toEqual(['message.created', { id: 'cross1' }])
    })

    it('event emitted on busB is received by subscriber on busA', async () => {
      const received: Array<[string, unknown]> = []
      busA.subscribe('conv_cross2', (event: string, data: unknown) => {
        received.push([event, data])
      })

      busB.emit('conv_cross2', 'standings.updated', { groupId: 'g1' })

      await waitFor(() => received.length > 0)
      expect(received[0]).toEqual(['standings.updated', { groupId: 'g1' }])
    })

    it('both local and cross-node subscribers receive the event', async () => {
      const receivedA: unknown[] = []
      const receivedB: unknown[] = []

      busA.subscribe('conv_both', (_e: string, d: unknown) => receivedA.push(d))
      busB.subscribe('conv_both', (_e: string, d: unknown) => receivedB.push(d))

      busA.emit('conv_both', 'bracket.updated', { matchId: 'm1' })

      await waitFor(() => receivedA.length > 0 && receivedB.length > 0)
      expect(receivedA).toHaveLength(1)
      expect(receivedB).toHaveLength(1)
    })
  })

  describe('channel isolation', () => {
    let bus: any

    beforeEach(async () => {
      bus = new RedisBroadcastBus(REDIS_URL!)
      await bus.whenReady()
    })

    afterEach(async () => {
      await bus.close()
    })

    it('event on conv_A does not trigger subscriber on conv_B', async () => {
      const receivedA: unknown[] = []
      const receivedB: unknown[] = []

      bus.subscribe('conv_iso_A', (_e: string, d: unknown) => receivedA.push(d))
      bus.subscribe('conv_iso_B', (_e: string, d: unknown) => receivedB.push(d))

      bus.emit('conv_iso_A', 'msg', { x: 1 })

      await waitFor(() => receivedA.length > 0)
      // Give extra time to confirm no bleed into B
      await new Promise((r) => setTimeout(r, 100))
      expect(receivedA).toHaveLength(1)
      expect(receivedB).toHaveLength(0)
    })

    it('two isolated channels can both receive their own events', async () => {
      const receivedA: unknown[] = []
      const receivedB: unknown[] = []

      bus.subscribe('conv_iso_C', (_e: string, d: unknown) => receivedA.push(d))
      bus.subscribe('conv_iso_D', (_e: string, d: unknown) => receivedB.push(d))

      bus.emit('conv_iso_C', 'msg', { src: 'C' })
      bus.emit('conv_iso_D', 'msg', { src: 'D' })

      await waitFor(() => receivedA.length > 0 && receivedB.length > 0)
      expect(receivedA[0]).toEqual({ src: 'C' })
      expect(receivedB[0]).toEqual({ src: 'D' })
    })
  })
})
