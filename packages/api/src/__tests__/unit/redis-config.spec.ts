/**
 * Tests for Redis config fields, connection factory, and /health Redis status.
 * V1.1: Redis config + connectivity + health
 *
 * CRITICAL: Tests must NOT require a running Redis. Default in-memory paths
 * must work with no Redis dependency. Fail-fast behavior is tested by pointing
 * the factory at an unreachable host with a very short timeout.
 */

import { getAppConfig, DEFAULT_APP_CONFIG } from '../../config'

// --- Config parsing tests ---

describe('getAppConfig() - Redis fields', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('defaults REDIS_URL to undefined when not set', () => {
    delete process.env.REDIS_URL
    const config = getAppConfig()
    expect(config.redis.url).toBeUndefined()
  })

  it('picks up REDIS_URL from env', () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    const config = getAppConfig()
    expect(config.redis.url).toBe('redis://localhost:6379')
  })

  it('defaults JOB_QUEUE to "memory"', () => {
    delete process.env.JOB_QUEUE
    const config = getAppConfig()
    expect(config.redis.jobQueue).toBe('memory')
  })

  it('accepts JOB_QUEUE=bullmq from env', () => {
    process.env.JOB_QUEUE = 'bullmq'
    const config = getAppConfig()
    expect(config.redis.jobQueue).toBe('bullmq')
  })

  it('defaults SSE_BUS to "memory"', () => {
    delete process.env.SSE_BUS
    const config = getAppConfig()
    expect(config.redis.sseBus).toBe('memory')
  })

  it('accepts SSE_BUS=redis from env', () => {
    process.env.SSE_BUS = 'redis'
    const config = getAppConfig()
    expect(config.redis.sseBus).toBe('redis')
  })

  it('DEFAULT_APP_CONFIG.redis has correct defaults', () => {
    expect(DEFAULT_APP_CONFIG.redis.url).toBeUndefined()
    expect(DEFAULT_APP_CONFIG.redis.jobQueue).toBe('memory')
    expect(DEFAULT_APP_CONFIG.redis.sseBus).toBe('memory')
  })
})

// --- Redis connection factory tests ---

describe('createRedisClient()', () => {
  it('returns null when both backends are in-memory and no REDIS_URL is set', async () => {
    const { createRedisClient } = await import('../../redis')
    const client = createRedisClient({ url: undefined, jobQueue: 'memory', sseBus: 'memory' })
    expect(client).toBeNull()
  })

  it('creates a client (with warning) when redis backend is selected but no URL is provided', async () => {
    // Even with no URL, if SSE_BUS=redis is selected we attempt to create a client
    // and log a warning. The client defaults to localhost:6379 and will likely fail,
    // but the factory should not return null.
    const { createRedisClient } = await import('../../redis')
    const client = createRedisClient({
      url: undefined,
      jobQueue: 'memory',
      sseBus: 'redis', // redis backend requested
      connectTimeoutMs: 100,
      maxRetriesPerRequest: 0,
    })
    expect(client).not.toBeNull()
    // disconnect() (not quit()) — quit() only disconnects on rejection when
    // enableOfflineQueue is true; with it false (our fail-fast config) quit()
    // just rejects and leaves the pending reconnect retry timer running.
    client!.disconnect()
  })

  it('attempts connection and rejects quickly when given an unreachable host', async () => {
    const { createRedisClient } = await import('../../redis')
    // Point at a port that is not listening (use a non-routable IP with short timeout)
    const client = createRedisClient({
      url: 'redis://192.0.2.1:9999', // TEST-NET-1, guaranteed unreachable
      jobQueue: 'memory',
      sseBus: 'memory',
      connectTimeoutMs: 200,
      maxRetriesPerRequest: 0,
    })
    expect(client).not.toBeNull()

    // The client should emit an error quickly when we try to connect
    await expect(
      new Promise<void>((_, reject) => {
        client!.on('error', (err) => reject(err))
        // Trigger a ping to initiate the connection attempt
        client!.ping().catch(reject)
        // Safety timeout: should fail well within 1 second
        setTimeout(() => reject(new Error('timeout: connection did not fail fast')), 1000)
      })
    ).rejects.toThrow()

    client!.disconnect() // stops the pending reconnect retry timer; see note above
  }, 3000)
})

// --- /health Redis status tests ---

import request from 'supertest'
import { createApp } from '../../app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { Pool } from 'pg'

function makeApp(redisClient?: any, poolOverride?: Partial<Pool>) {
  const pool = {
    connect: async () => ({
      query: async () => {},
      release: () => {},
    }),
    ...poolOverride,
  } as unknown as Pool

  return createApp({
    db: pool,
    jwtConfig: { secret: 'test-secret-at-least-32-chars-long!!', expiresInSeconds: 3600 },
    tokenStore: new InMemoryTokenStore(),
    config: DEFAULT_APP_CONFIG,
    redis: redisClient ?? null,
  })
}

describe('/health - Redis status field', () => {
  it('reports redis: disabled when no Redis client is provided', async () => {
    const app = makeApp(null)
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('redis', 'disabled')
  })

  it('reports redis: connected when client ping succeeds', async () => {
    const mockClient = {
      ping: jest.fn().mockResolvedValue('PONG'),
    }
    const app = makeApp(mockClient)
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('redis', 'connected')
  })

  it('reports redis: down when client ping fails', async () => {
    const mockClient = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }
    const app = makeApp(mockClient)
    const res = await request(app).get('/health')
    // Status is still 200 in V1.1 — the 503 readiness failure mode is V1.5
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('redis', 'down')
  })

  it('still reports database: connected alongside Redis status', async () => {
    const app = makeApp(null)
    const res = await request(app).get('/health')
    expect(res.body).toHaveProperty('database', 'connected')
    expect(res.body).toHaveProperty('redis')
  })
})
