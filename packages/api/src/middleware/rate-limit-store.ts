/**
 * RateLimitCounterStore — pluggable counter-store interface for the rate-limit middleware.
 *
 * Two implementations:
 * - InMemoryCounterStore: default, no Redis required (dev/test/CI)
 * - RedisCounterStore: atomic INCR+EXPIRE on first hit — shared across instances (R-17.10.2)
 *
 * Env-selection (mirrors selectTokenStore / selectBroadcastBus):
 *   RATE_LIMIT_STORE=redis + REDIS_URL → RedisCounterStore
 *   anything else → InMemoryCounterStore
 */

import Redis from 'ioredis'
import { getLogger } from '../logger'

const log = getLogger('rate-limit-store')

// ─── Interface ────────────────────────────────────────────────────────────────

/**
 * Counter store used by the rate-limit middleware.
 *
 * Each key tracks one rate-limit "bucket" (e.g. `login:email:ip`).
 * The window TTL (in seconds) is applied on the FIRST increment — subsequent
 * increments within the window do not extend the TTL.
 */
export interface RateLimitCounterStore {
  /**
   * Atomically increment the counter for `key`.  If the key does not exist yet,
   * create it with a TTL of `windowSeconds`.
   *
   * Returns the new value after incrementing (1 on first call, 2 on second, …).
   */
  increment(key: string, windowSeconds: number): Promise<number>

  /**
   * Delete the counter for `key` (e.g. after a successful auth resets the window).
   * No-op when key does not exist.
   */
  reset(key: string): Promise<void>

  /**
   * Optional teardown — close any underlying connections.
   * Called on graceful shutdown or in test afterEach.
   */
  close?(): Promise<void>
}

// ─── In-memory implementation ─────────────────────────────────────────────────

interface CounterEntry {
  value: number
  expiresAt: number
}

export class InMemoryCounterStore implements RateLimitCounterStore {
  private store = new Map<string, CounterEntry>()

  async increment(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now()
    const existing = this.store.get(key)

    if (existing && now < existing.expiresAt) {
      existing.value += 1
      return existing.value
    }

    // Key absent or expired — start a new window
    const entry: CounterEntry = { value: 1, expiresAt: now + windowSeconds * 1000 }
    this.store.set(key, entry)
    return 1
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
  }

  /** Test helper: force the entry to appear expired without waiting. */
  _expireForTest(key: string): void {
    const entry = this.store.get(key)
    if (entry) {
      this.store.set(key, { value: entry.value, expiresAt: Date.now() - 1 })
    }
  }
}

// ─── Redis-backed implementation ──────────────────────────────────────────────

/**
 * RedisCounterStore — atomic, shared rate-limit counter (R-17.10.2).
 *
 * Uses a Lua script to ensure that INCR and EXPIRE are executed atomically,
 * so the window TTL is set exactly once (on the first increment) and is never
 * accidentally extended by a concurrent increment on another instance.
 *
 * Script logic:
 *   1. INCR key          → new value (atomic)
 *   2. if new value == 1 then EXPIRE key windowSeconds  (only on first hit)
 *
 * This is the standard Redis rate-limit pattern:
 *   https://redis.io/commands/incr/#pattern-rate-limiter
 */

const INCR_LUA = `
local v = redis.call('INCR', KEYS[1])
if v == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return v
`

export class RedisCounterStore implements RateLimitCounterStore {
  private client: Redis

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 0,
      lazyConnect: false,
    })
    this.client.on('error', (err) => {
      log.warn('redis.rate-limit-store.error', { message: err.message })
    })
  }

  async increment(key: string, windowSeconds: number): Promise<number> {
    const result = await this.client.eval(INCR_LUA, 1, key, String(windowSeconds))
    return result as number
  }

  async reset(key: string): Promise<void> {
    await this.client.del(key)
  }

  async close(): Promise<void> {
    this.client.disconnect()
  }
}

// ─── Factory (env-selection) ──────────────────────────────────────────────────

/**
 * Select the RateLimitCounterStore implementation based on RATE_LIMIT_STORE and REDIS_URL.
 *
 * - RATE_LIMIT_STORE=redis + REDIS_URL set → RedisCounterStore
 * - anything else (or REDIS_URL missing) → InMemoryCounterStore
 *
 * Mirrors selectTokenStore() / selectBroadcastBus() / selectJobQueue().
 */
export function selectRateLimitStore(): RateLimitCounterStore {
  const backend = process.env.RATE_LIMIT_STORE ?? 'memory'
  const redisUrl = process.env.REDIS_URL

  if (backend === 'redis' && redisUrl) {
    log.info('rate-limit-store.selected', { backend: 'redis', url: redisUrl })
    return new RedisCounterStore(redisUrl)
  }

  if (backend === 'redis' && !redisUrl) {
    log.warn('rate-limit-store.fallback', {
      note: 'RATE_LIMIT_STORE=redis but REDIS_URL is not set; falling back to InMemoryCounterStore',
    })
  }

  return new InMemoryCounterStore()
}
