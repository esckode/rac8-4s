import Redis from 'ioredis'
import { getLogger } from '../logger'

const log = getLogger('token-store')

export interface TokenStore {
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  get(key: string): Promise<string | null>
  del(key: string): Promise<void>

  /**
   * Optional teardown — close any underlying connections.
   * Called on graceful shutdown or in test afterEach.
   */
  close?(): Promise<void>
}

export class InMemoryTokenStore implements TokenStore {
  private store = new Map<string, { value: string; expiresAt: number }>()

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }

  _setExpiredForTest(key: string): void {
    const entry = this.store.get(key)
    if (entry) {
      this.store.set(key, { value: entry.value, expiresAt: Date.now() - 1 })
    }
  }
}

// ─── Redis-backed token store ─────────────────────────────────────────────────

/**
 * RedisTokenStore — Redis-backed TokenStore implementation (R-17.10.1).
 *
 * Uses native Redis key expiry (SET ... EX) so TTL is enforced by Redis itself,
 * not an in-process timer. This means:
 * - Tokens survive API restarts (durability win over InMemoryTokenStore).
 * - Tokens are shared across all API instances (solves random 401s under LB).
 *
 * The JWT account-session path is STATELESS and does not go through this store.
 * Only opaque tokens (magic-link, player-session, JWT blocklist) use TokenStore.
 */
export class RedisTokenStore implements TokenStore {
  private client: Redis

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 0,
      // enableOfflineQueue defaults to true: commands issued before the connection
      // is established are queued and sent once connected. This is safe for our use
      // case and avoids "Stream isn't writeable" errors on startup.
      lazyConnect: false,
    })
    this.client.on('error', (err) => {
      log.warn('redis.token-store.error', { message: err.message })
    })
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds)
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  async del(key: string): Promise<void> {
    await this.client.del(key)
  }

  /** Close the underlying Redis connection. Call on graceful shutdown. */
  async close(): Promise<void> {
    this.client.disconnect()
  }
}

// ─── Factory (env-selection) ──────────────────────────────────────────────────

/**
 * Select the TokenStore implementation based on TOKEN_STORE and REDIS_URL env vars.
 *
 * - TOKEN_STORE=redis + REDIS_URL set → RedisTokenStore
 * - anything else (or REDIS_URL missing) → InMemoryTokenStore
 *
 * Mirrors the selectBroadcastBus() / selectJobQueue() pattern.
 */
export function selectTokenStore(): TokenStore {
  const backend = process.env.TOKEN_STORE ?? 'memory'
  const redisUrl = process.env.REDIS_URL

  if (backend === 'redis' && redisUrl) {
    log.info('token-store.selected', { backend: 'redis', url: redisUrl })
    return new RedisTokenStore(redisUrl)
  }

  if (backend === 'redis' && !redisUrl) {
    log.warn('token-store.fallback', {
      note: 'TOKEN_STORE=redis but REDIS_URL is not set; falling back to InMemoryTokenStore',
    })
  }

  return new InMemoryTokenStore()
}
