/**
 * V2.3 — RateLimitCounterStore contract tests + RedisCounterStore (Redis-gated)
 *
 * Structure:
 * 1. RateLimitCounterStore contract suite — run against InMemoryCounterStore (always runs, no Redis).
 * 2. RedisCounterStore spec (Redis-gated) — skips cleanly when REDIS_URL is unset:
 *    - contract (same suite) against RedisCounterStore
 *    - window reset: increment after TTL returns 1 (counter restarted)
 *    - cross-instance test: proves R-17.10.2 — a limit consumed via storeA is seen by storeB
 *      (simulates two API instances sharing Redis under a round-robin LB; this is the
 *       whole point of V2.3).
 * 3. selectRateLimitStore() env-selection tests (no Redis required).
 *
 * Redis-gating mechanism: `const describeIfRedis = REDIS_URL ? describe : describe.skip`
 * All Redis imports are inside the gated block so ioredis connections are never opened
 * when Redis is absent.
 *
 * To run gated tests:
 *   REDIS_URL=redis://localhost:6379 npx jest rate-limit-store.spec.ts
 */

import { InMemoryCounterStore, RateLimitCounterStore } from '../../middleware/rate-limit-store'

// ─── Shared contract suite ─────────────────────────────────────────────────────
// Runs identically against any RateLimitCounterStore implementation.

function runContractSuite(label: string, factory: () => RateLimitCounterStore) {
  describe(`RateLimitCounterStore contract — ${label}`, () => {
    let store: RateLimitCounterStore

    beforeEach(() => {
      store = factory()
    })

    afterEach(async () => {
      await store.close?.()
    })

    it('increment returns 1 on first call for a key', async () => {
      const count = await store.increment(`test-first-${Date.now()}`, 60)
      expect(count).toBe(1)
    })

    it('increment returns 2 on second call within window', async () => {
      const key = `test-seq-${Date.now()}`
      await store.increment(key, 60)
      const count = await store.increment(key, 60)
      expect(count).toBe(2)
    })

    it('increment accumulates correctly', async () => {
      const key = `test-accum-${Date.now()}`
      const counts: number[] = []
      for (let i = 0; i < 5; i++) {
        counts.push(await store.increment(key, 60))
      }
      expect(counts).toEqual([1, 2, 3, 4, 5])
    })

    it('reset removes the key so increment returns 1 again', async () => {
      const key = `test-reset-${Date.now()}`
      await store.increment(key, 60)
      await store.increment(key, 60)
      await store.reset(key)
      const count = await store.increment(key, 60)
      expect(count).toBe(1)
    })

    it('reset is a no-op for a key that does not exist', async () => {
      await expect(store.reset(`no-such-key-${Date.now()}`)).resolves.toBeUndefined()
    })

    it('independent keys do not interfere', async () => {
      const keyA = `test-a-${Date.now()}`
      const keyB = `test-b-${Date.now()}`
      await store.increment(keyA, 60)
      await store.increment(keyA, 60)
      await store.increment(keyA, 60)
      const countB = await store.increment(keyB, 60)
      expect(countB).toBe(1)
    })
  })
}

// ─── InMemoryCounterStore — contract (always runs, no Redis) ──────────────────

runContractSuite('InMemoryCounterStore', () => new InMemoryCounterStore())

describe('InMemoryCounterStore — window expiry', () => {
  it('returns 1 after the window has expired (_expireForTest helper)', async () => {
    const store = new InMemoryCounterStore()
    const key = `expiry-test-${Date.now()}`
    await store.increment(key, 60)
    await store.increment(key, 60)
    store._expireForTest(key)
    const count = await store.increment(key, 60) // new window → resets to 1
    expect(count).toBe(1)
  })
})

// ─── selectRateLimitStore() env-selection (no Redis required) ─────────────────

describe('rate-limit-store env-selection (selectRateLimitStore)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns InMemoryCounterStore when RATE_LIMIT_STORE is not set', async () => {
    delete process.env.RATE_LIMIT_STORE
    delete process.env.REDIS_URL
    const { selectRateLimitStore, InMemoryCounterStore: Cls } = await import('../../middleware/rate-limit-store')
    const store = selectRateLimitStore()
    expect(store).toBeInstanceOf(Cls)
    await store.close?.()
  })

  it('returns InMemoryCounterStore when RATE_LIMIT_STORE=memory', async () => {
    process.env.RATE_LIMIT_STORE = 'memory'
    delete process.env.REDIS_URL
    const { selectRateLimitStore, InMemoryCounterStore: Cls } = await import('../../middleware/rate-limit-store')
    const store = selectRateLimitStore()
    expect(store).toBeInstanceOf(Cls)
    await store.close?.()
  })

  it('returns InMemoryCounterStore when RATE_LIMIT_STORE=redis but REDIS_URL is unset', async () => {
    process.env.RATE_LIMIT_STORE = 'redis'
    delete process.env.REDIS_URL
    const { selectRateLimitStore, InMemoryCounterStore: Cls } = await import('../../middleware/rate-limit-store')
    const store = selectRateLimitStore()
    // Falls back to in-memory when REDIS_URL is missing
    expect(store).toBeInstanceOf(Cls)
    await store.close?.()
  })

  it('returns RedisCounterStore when RATE_LIMIT_STORE=redis and REDIS_URL is set', async () => {
    process.env.RATE_LIMIT_STORE = 'redis'
    process.env.REDIS_URL = 'redis://localhost:6379'
    const { selectRateLimitStore, RedisCounterStore } = await import('../../middleware/rate-limit-store')
    const store = selectRateLimitStore()
    expect(store).toBeInstanceOf(RedisCounterStore)
    await store.close?.()
  })
})

// ─── RedisCounterStore — Redis-gated ─────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL
const describeIfRedis = REDIS_URL ? describe : describe.skip

describeIfRedis('RedisCounterStore (Redis-gated — skip when REDIS_URL unset)', () => {
  let RedisCounterStore: any

  beforeAll(async () => {
    // Dynamic import inside gate so ioredis connections are only opened when Redis is available
    const mod = await import('../../middleware/rate-limit-store')
    RedisCounterStore = mod.RedisCounterStore
  })

  // Contract suite against RedisCounterStore
  runContractSuite('RedisCounterStore', () => new RedisCounterStore(REDIS_URL!))

  describe('window reset (real Redis key expiry)', () => {
    let store: any

    beforeEach(() => {
      store = new RedisCounterStore(REDIS_URL!)
    })

    afterEach(async () => {
      await store.close()
    })

    it('increment returns 1 after TTL has elapsed (2s TTL, 2.5s wait)', async () => {
      const key = `rl-ttl-${Date.now()}`
      const first = await store.increment(key, 2) // 2 second window
      expect(first).toBe(1)
      const second = await store.increment(key, 2)
      expect(second).toBe(2)

      // Wait for Redis key to expire
      await new Promise((r) => setTimeout(r, 2500))

      // Key has expired — should restart at 1
      const after = await store.increment(key, 2)
      expect(after).toBe(1)
    }, 10000)
  })

  // THE critical cross-instance test (proves R-17.10.2)
  describe('cross-instance: limit consumed via storeA is seen by storeB', () => {
    let storeA: any
    let storeB: any

    beforeEach(() => {
      // Two independent RedisCounterStore instances — simulates two API instances
      // behind a load balancer sharing the same Redis.
      storeA = new RedisCounterStore(REDIS_URL!)
      storeB = new RedisCounterStore(REDIS_URL!)
    })

    afterEach(async () => {
      await Promise.all([storeA.close(), storeB.close()])
    })

    it('counter incremented via storeA is seen by storeB', async () => {
      const key = `cross-rl-${Date.now()}`

      // storeA increments twice (simulates 2 requests hitting instance A)
      await storeA.increment(key, 60)
      await storeA.increment(key, 60)

      // storeB increments once — should see 3 (shared counter)
      const count = await storeB.increment(key, 60)
      expect(count).toBe(3)
    })

    it('counter reset via storeA is seen by storeB', async () => {
      const key = `cross-reset-rl-${Date.now()}`

      await storeA.increment(key, 60)
      await storeA.increment(key, 60)

      await storeA.reset(key)

      // storeB should see counter start fresh
      const count = await storeB.increment(key, 60)
      expect(count).toBe(1)
    })

    it('limit enforced across instances: after storeA fills limit, storeB reflects it', async () => {
      const key = `cross-limit-rl-${Date.now()}`
      const maxAttempts = 5

      // Fill 4 increments via storeA
      for (let i = 0; i < 4; i++) {
        await storeA.increment(key, 60)
      }

      // storeB's increment returns 5 — at the limit
      const count = await storeB.increment(key, 60)
      expect(count).toBe(maxAttempts)
    })
  })
})
