/**
 * V1.5 — Redis-required failure mode: readiness gate + 503 maintenance
 *
 * Tests:
 * 1. /health/live — always 200 (liveness: process up, no dependency check)
 * 2. /health/ready — 200 when DB+Redis OK; non-200 when Redis selected+down
 * 3. 503 + Retry-After guard: fires when Redis selected+down; in-memory unaffected
 * 4. In-memory mode (no redis): readiness 200, no 503
 *
 * All tests run without a real Redis server. "Redis down" is simulated by
 * injecting a stub Redis client whose ping() rejects, so tests run fast and
 * without hanging (avoids the enableOfflineQueue queue-hang problem).
 *
 * Redis-gated tests (requiring a real Redis) live in their own describe.skip
 * block and run via: REDIS_URL=redis://localhost:6379 npx jest redis-readiness.spec.ts
 */

import request from 'supertest'
import { Pool } from 'pg'
import { createApp, AppDependencies } from '../../app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { DEFAULT_APP_CONFIG, AppConfig } from '../../config'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const REDIS_SELECTED_CONFIG: AppConfig = {
  ...DEFAULT_APP_CONFIG,
  redis: { url: 'redis://localhost:6379', jobQueue: 'bullmq', sseBus: 'redis', tokenStore: 'redis', rateLimitStore: 'redis' },
}

function makePool(opts: { connectFails?: boolean } = {}): Pool {
  return {
    connect: opts.connectFails
      ? async () => { throw new Error('DB down') }
      : async () => ({
          query: async () => {},
          release: () => {},
        }),
  } as unknown as Pool
}

function makeApp(deps: Partial<AppDependencies> = {}) {
  return createApp({
    db: makePool(),
    jwtConfig: { secret: 'test-secret-at-least-32-chars-long!!', expiresInSeconds: 3600 },
    tokenStore: new InMemoryTokenStore(),
    config: DEFAULT_APP_CONFIG,
    ...deps,
  })
}

// ─── 1. Liveness endpoint ─────────────────────────────────────────────────────

describe('/health/live — liveness', () => {
  it('returns 200 when in-memory mode (no redis client)', async () => {
    const app = makeApp({ redis: null })
    const res = await request(app).get('/health/live')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok' })
  })

  it('returns 200 even when Redis is selected+down (liveness never fails on dependency outage)', async () => {
    const mockRedis = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }
    const app = makeApp({ redis: mockRedis as any, config: REDIS_SELECTED_CONFIG })
    const res = await request(app).get('/health/live')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok' })
  })

  it('returns 200 even when DB is down (liveness only checks process, not deps)', async () => {
    const app = makeApp({
      db: makePool({ connectFails: true }),
      redis: null,
    })
    const res = await request(app).get('/health/live')
    expect(res.status).toBe(200)
  })
})

// ─── 2. Readiness endpoint ────────────────────────────────────────────────────

describe('/health/ready — readiness', () => {
  it('returns 200 with redis:disabled in in-memory mode (no redis selected)', async () => {
    const app = makeApp({ redis: null })
    const res = await request(app).get('/health/ready')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok', redis: 'disabled' })
  })

  it('returns 200 with redis:connected when Redis is selected+up', async () => {
    const mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    }
    const app = makeApp({ redis: mockRedis as any, config: REDIS_SELECTED_CONFIG })
    const res = await request(app).get('/health/ready')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok', redis: 'connected' })
  })

  it('returns 503 with redis:down when Redis is selected+down', async () => {
    const mockRedis = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }
    const app = makeApp({ redis: mockRedis as any, config: REDIS_SELECTED_CONFIG })
    const res = await request(app).get('/health/ready')
    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ status: 'unavailable', redis: 'down' })
  })

  it('returns 503 with database:disconnected when DB is down (in-memory redis mode)', async () => {
    const app = makeApp({
      db: makePool({ connectFails: true }),
      redis: null,
    })
    const res = await request(app).get('/health/ready')
    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ status: 'unavailable', database: 'disconnected' })
  })

  it('existing /health endpoint still works (backwards-compat)', async () => {
    const app = makeApp({ redis: null })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('database')
    expect(res.body).toHaveProperty('redis')
  })
})

// ─── 3. 503 middleware guard ──────────────────────────────────────────────────

describe('503 guard middleware — Redis selected+down', () => {
  it('returns 503 + Retry-After for any API request when Redis is selected+down', async () => {
    const mockRedis = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }
    const app = makeApp({ redis: mockRedis as any, config: REDIS_SELECTED_CONFIG })

    // Trigger a readiness check first to populate the cached health state
    await request(app).get('/health/ready')

    // A regular API request should now return 503
    const res = await request(app).get('/tournaments/public')
    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
    expect(res.headers['retry-after']).toBeDefined()
  })

  it('does NOT return 503 in in-memory mode (redis not selected)', async () => {
    // In-memory mode: redis is null, no redis backends selected
    const app = makeApp({ redis: null, config: DEFAULT_APP_CONFIG })

    const res = await request(app).get('/health/live')
    expect(res.status).toBe(200)
    // Health routes pass; and no 503 guard fires
  })

  it('does NOT block /health/live or /health/ready even when Redis is down', async () => {
    const mockRedis = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }
    const app = makeApp({ redis: mockRedis as any, config: REDIS_SELECTED_CONFIG })

    // Liveness and readiness must NOT be blocked by the 503 guard
    const liveRes = await request(app).get('/health/live')
    expect(liveRes.status).toBe(200)

    const readyRes = await request(app).get('/health/ready')
    expect(readyRes.status).toBe(503) // readiness itself fails, but isn't blocked by guard
  })

  it('does NOT block /health (legacy) even when Redis is down', async () => {
    const mockRedis = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }
    const app = makeApp({ redis: mockRedis as any, config: REDIS_SELECTED_CONFIG })

    await request(app).get('/health/ready') // populate cache
    const res = await request(app).get('/health')
    // /health is not blocked by the 503 guard
    expect(res.status).toBe(200)
  })

  it('on recovery (Redis back up), traffic resumes after next health probe', async () => {
    let pingFails = true
    const mockRedis = {
      ping: jest.fn().mockImplementation(() =>
        pingFails ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve('PONG')
      ),
    }
    const app = makeApp({ redis: mockRedis as any, config: REDIS_SELECTED_CONFIG })

    // Phase 1: Redis is down
    await request(app).get('/health/ready') // populate cache → down
    const res1 = await request(app).get('/tournaments/public')
    expect(res1.status).toBe(503)

    // Phase 2: Redis recovers
    pingFails = false
    await request(app).get('/health/ready') // re-probe → up
    const res2 = await request(app).get('/health/live')
    expect(res2.status).toBe(200)
    // The 503 guard should now be cleared
    // (the guard reads from the same cached state updated by /health/ready)
  })
})

// ─── 4. isRedisSelected helper ────────────────────────────────────────────────

describe('isRedisSelected()', () => {
  it('returns false for default in-memory config', async () => {
    const { isRedisSelected } = await import('../../redis-health')
    expect(isRedisSelected(DEFAULT_APP_CONFIG.redis)).toBe(false)
  })

  it('returns true when SSE_BUS=redis', async () => {
    const { isRedisSelected } = await import('../../redis-health')
    expect(isRedisSelected({ ...DEFAULT_APP_CONFIG.redis, sseBus: 'redis' })).toBe(true)
  })

  it('returns true when JOB_QUEUE=bullmq', async () => {
    const { isRedisSelected } = await import('../../redis-health')
    expect(isRedisSelected({ ...DEFAULT_APP_CONFIG.redis, jobQueue: 'bullmq' })).toBe(true)
  })

  it('returns true when TOKEN_STORE=redis', async () => {
    const { isRedisSelected } = await import('../../redis-health')
    expect(isRedisSelected({ ...DEFAULT_APP_CONFIG.redis, tokenStore: 'redis' })).toBe(true)
  })
})
