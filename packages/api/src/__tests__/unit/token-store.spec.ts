/**
 * V1.4 — TokenStore contract tests + RedisTokenStore (Redis-gated)
 *
 * Structure:
 * 1. TokenStore contract suite — run against InMemoryTokenStore (always runs, no Redis).
 * 2. RedisTokenStore spec (Redis-gated) — skips cleanly when REDIS_URL is unset:
 *    - contract (same suite) against RedisTokenStore
 *    - TTL expiry test (real expiry via short TTL + small wait)
 *    - cross-connection test: proves R-17.10.1 — token written via one RedisTokenStore
 *      instance is readable via a SECOND independent instance (simulates two API instances
 *      sharing ElastiCache; this is the whole point of V1.4).
 *    - magic-link round-trip
 *    - player-session round-trip
 * 3. selectTokenStore() env-selection tests (no Redis required).
 *
 * Redis-gating mechanism: `const describeIfRedis = REDIS_URL ? describe : describe.skip`
 * All Redis imports are inside the gated block so ioredis connections are never opened
 * when Redis is absent.
 *
 * To run gated tests:
 *   REDIS_URL=redis://localhost:6379 npx jest token-store.spec.ts
 */

import { InMemoryTokenStore, TokenStore } from '../../auth/token-store'
import { generateMagicLinkToken, validateMagicLinkToken } from '../../auth/magic-link'
import { generatePlayerSession, validatePlayerSession } from '../../auth/magic-link'

// ─── Shared contract suite ─────────────────────────────────────────────────────
// Runs identically against any TokenStore implementation.

function runContractSuite(label: string, factory: () => TokenStore) {
  describe(`TokenStore contract — ${label}`, () => {
    let store: TokenStore

    beforeEach(() => {
      store = factory()
    })

    afterEach(async () => {
      await store.close?.()
    })

    it('set + get returns the stored value within TTL', async () => {
      await store.set('k1', 'v1', 60)
      const result = await store.get('k1')
      expect(result).toBe('v1')
    })

    it('get returns null for a key that was never set', async () => {
      const result = await store.get('no-such-key')
      expect(result).toBeNull()
    })

    it('del removes the key so get returns null', async () => {
      await store.set('k2', 'v2', 60)
      await store.del('k2')
      const result = await store.get('k2')
      expect(result).toBeNull()
    })

    it('del is a no-op for a key that does not exist', async () => {
      await expect(store.del('non-existent')).resolves.toBeUndefined()
    })

    it('overwrites an existing key', async () => {
      await store.set('k3', 'original', 60)
      await store.set('k3', 'updated', 60)
      const result = await store.get('k3')
      expect(result).toBe('updated')
    })

    it('independent keys do not interfere', async () => {
      await store.set('ka', 'va', 60)
      await store.set('kb', 'vb', 60)
      expect(await store.get('ka')).toBe('va')
      expect(await store.get('kb')).toBe('vb')
      await store.del('ka')
      expect(await store.get('ka')).toBeNull()
      expect(await store.get('kb')).toBe('vb')
    })
  })
}

// ─── InMemoryTokenStore — contract (always runs, no Redis) ────────────────────

runContractSuite('InMemoryTokenStore', () => new InMemoryTokenStore())

describe('InMemoryTokenStore — TTL expiry', () => {
  it('get returns null for an expired entry (_setExpiredForTest helper)', async () => {
    const store = new InMemoryTokenStore()
    await store.set('expiring', 'val', 60)
    store._setExpiredForTest('expiring')
    const result = await store.get('expiring')
    expect(result).toBeNull()
  })
})

// ─── selectTokenStore() env-selection (no Redis required) ─────────────────────

describe('token-store env-selection (selectTokenStore)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns InMemoryTokenStore when TOKEN_STORE is not set', async () => {
    delete process.env.TOKEN_STORE
    delete process.env.REDIS_URL
    const { selectTokenStore } = await import('../../auth/token-store')
    const { InMemoryTokenStore: Cls } = await import('../../auth/token-store')
    const store = selectTokenStore()
    expect(store).toBeInstanceOf(Cls)
  })

  it('returns InMemoryTokenStore when TOKEN_STORE=memory', async () => {
    process.env.TOKEN_STORE = 'memory'
    delete process.env.REDIS_URL
    const { selectTokenStore } = await import('../../auth/token-store')
    const { InMemoryTokenStore: Cls } = await import('../../auth/token-store')
    const store = selectTokenStore()
    expect(store).toBeInstanceOf(Cls)
  })

  it('returns InMemoryTokenStore when TOKEN_STORE=redis but REDIS_URL is unset', async () => {
    process.env.TOKEN_STORE = 'redis'
    delete process.env.REDIS_URL
    const { selectTokenStore } = await import('../../auth/token-store')
    const { InMemoryTokenStore: Cls } = await import('../../auth/token-store')
    const store = selectTokenStore()
    // Falls back to in-memory when REDIS_URL is missing
    expect(store).toBeInstanceOf(Cls)
  })

  it('returns RedisTokenStore when TOKEN_STORE=redis and REDIS_URL is set', async () => {
    process.env.TOKEN_STORE = 'redis'
    process.env.REDIS_URL = 'redis://localhost:6379'
    const { selectTokenStore, RedisTokenStore } = await import('../../auth/token-store')
    const store = selectTokenStore()
    expect(store).toBeInstanceOf(RedisTokenStore)
    // Clean up without error
    await (store as any).close?.().catch(() => {})
  })
})

// ─── RedisTokenStore — Redis-gated ────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL
const describeIfRedis = REDIS_URL ? describe : describe.skip

describeIfRedis('RedisTokenStore (Redis-gated — skip when REDIS_URL unset)', () => {
  let RedisTokenStore: any

  beforeAll(async () => {
    // Dynamic import inside gate so ioredis connections are only opened when Redis is available
    const mod = await import('../../auth/token-store')
    RedisTokenStore = mod.RedisTokenStore
  })

  // Contract suite against RedisTokenStore
  runContractSuite('RedisTokenStore', () => new RedisTokenStore(REDIS_URL!))

  // Each test in this block creates its own store(s) and cleans up
  describe('TTL expiry (real Redis key expiry)', () => {
    let store: any

    beforeEach(() => {
      store = new RedisTokenStore(REDIS_URL!)
    })

    afterEach(async () => {
      await store.close()
    })

    it('get returns null after TTL has elapsed (2s TTL, 2.5s wait)', async () => {
      await store.set('ttl-key', 'ttl-val', 2) // 2 second TTL
      const before = await store.get('ttl-key')
      expect(before).toBe('ttl-val')

      // Wait for Redis key to expire
      await new Promise((r) => setTimeout(r, 2500))

      const after = await store.get('ttl-key')
      expect(after).toBeNull()
    }, 10000) // generous timeout for this test
  })

  // THE critical cross-connection test (proves R-17.10.1)
  describe('cross-connection: token written by one instance is readable by another', () => {
    let storeA: any
    let storeB: any

    beforeEach(() => {
      // Two independent RedisTokenStore instances — simulates two API instances
      // behind a load balancer sharing the same ElastiCache.
      storeA = new RedisTokenStore(REDIS_URL!)
      storeB = new RedisTokenStore(REDIS_URL!)
    })

    afterEach(async () => {
      await Promise.all([storeA.close(), storeB.close()])
    })

    it('token written via storeA is readable via storeB (simulates cross-instance auth)', async () => {
      const key = `cross-instance-test:${Date.now()}`
      await storeA.set(key, 'cross-instance-value', 60)

      // storeB is a separate connection — just like a second API instance would be
      const result = await storeB.get(key)
      expect(result).toBe('cross-instance-value')
    })

    it('token deleted via storeA is gone when read via storeB', async () => {
      const key = `cross-del-test:${Date.now()}`
      await storeA.set(key, 'to-be-deleted', 60)
      // Confirm storeB can read it first
      expect(await storeB.get(key)).toBe('to-be-deleted')

      await storeA.del(key)

      // storeB should now also see it gone
      expect(await storeB.get(key)).toBeNull()
    })
  })

  // Magic-link round-trip through RedisTokenStore
  describe('magic-link round-trip', () => {
    let store: any

    beforeEach(() => {
      store = new RedisTokenStore(REDIS_URL!)
    })

    afterEach(async () => {
      await store.close()
    })

    it('generateMagicLinkToken + validateMagicLinkToken round-trip', async () => {
      const payload = {
        playerId: 'player-1',
        tournamentId: 'tournament-1',
        email: 'test@example.com',
        createdAt: Date.now(),
      }
      const { token } = await generateMagicLinkToken(payload, 60, store)
      const validated = await validateMagicLinkToken(token, store)
      expect(validated).toEqual(payload)
    })

    it('token is invalidated (single-use) after validateMagicLinkToken', async () => {
      const payload = {
        playerId: 'player-2',
        tournamentId: 'tournament-1',
        email: 'test2@example.com',
        createdAt: Date.now(),
      }
      const { token } = await generateMagicLinkToken(payload, 60, store)
      await validateMagicLinkToken(token, store) // consumes the token
      await expect(validateMagicLinkToken(token, store)).rejects.toThrow('invalid or has expired')
    })
  })

  // Player-session round-trip through RedisTokenStore
  describe('player-session round-trip', () => {
    let store: any

    beforeEach(() => {
      store = new RedisTokenStore(REDIS_URL!)
    })

    afterEach(async () => {
      await store.close()
    })

    it('generatePlayerSession + validatePlayerSession round-trip', async () => {
      const payload = {
        playerId: 'player-3',
        tournamentId: 'tournament-2',
        email: 'test3@example.com',
        createdAt: Date.now(),
      }
      const { token } = await generatePlayerSession(payload, 60, store)
      const validated = await validatePlayerSession(token, store)
      expect(validated).toEqual(payload)
    })
  })
})
