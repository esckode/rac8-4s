/**
 * V1.2 — IBroadcastBus interface + env-selection + bus health signal tests
 *
 * CRITICAL: these tests MUST NOT require a running Redis.
 * - IBroadcastBus contract tests: run against BroadcastBus (in-memory) — no Redis.
 * - Env-selection tests: verify correct class is chosen — no Redis.
 * - Bus health signal tests: extend /health via mock — no Redis.
 *
 * Redis-gated RedisBroadcastBus spec lives in redis-broadcast-bus.spec.ts and
 * skips automatically when REDIS_URL is not set.
 */

import type { IBroadcastBus } from '../../broadcast-bus'

// --- IBroadcastBus contract tests (run against in-memory BroadcastBus) ---

describe('IBroadcastBus contract (BroadcastBus)', () => {
  let bus: IBroadcastBus

  beforeEach(async () => {
    const { BroadcastBus } = await import('../../broadcast-bus')
    bus = new BroadcastBus()
  })

  it('emit + subscribe: listener receives the event', () => {
    const fn = jest.fn()
    bus.subscribe('conv_1', fn)
    bus.emit('conv_1', 'message.created', { id: 'msg1' })
    expect(fn).toHaveBeenCalledWith('message.created', { id: 'msg1' })
  })

  it('subscribe returns an unsubscribe function', () => {
    const fn = jest.fn()
    const unsub = bus.subscribe('conv_1', fn)
    expect(typeof unsub).toBe('function')
    unsub()
    bus.emit('conv_1', 'x', {})
    expect(fn).not.toHaveBeenCalled()
  })

  it('isolates channels — conv_1 event does not reach conv_2 subscriber', () => {
    const fn1 = jest.fn()
    const fn2 = jest.fn()
    bus.subscribe('conv_1', fn1)
    bus.subscribe('conv_2', fn2)
    bus.emit('conv_1', 'ping', {})
    expect(fn1).toHaveBeenCalledTimes(1)
    expect(fn2).not.toHaveBeenCalled()
  })
})

// --- Env-selection tests (no Redis running required) ---

describe('bus env-selection (selectBroadcastBus)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns BroadcastBus when SSE_BUS is not set', async () => {
    delete process.env.SSE_BUS
    delete process.env.REDIS_URL
    const { selectBroadcastBus } = await import('../../broadcast-bus')
    const { BroadcastBus } = await import('../../broadcast-bus')
    const bus = selectBroadcastBus()
    expect(bus).toBeInstanceOf(BroadcastBus)
  })

  it('returns BroadcastBus when SSE_BUS=memory', async () => {
    process.env.SSE_BUS = 'memory'
    delete process.env.REDIS_URL
    const { selectBroadcastBus, BroadcastBus } = await import('../../broadcast-bus')
    const bus = selectBroadcastBus()
    expect(bus).toBeInstanceOf(BroadcastBus)
  })

  it('returns BroadcastBus when SSE_BUS=redis but no REDIS_URL is set', async () => {
    process.env.SSE_BUS = 'redis'
    delete process.env.REDIS_URL
    const { selectBroadcastBus, BroadcastBus } = await import('../../broadcast-bus')
    const bus = selectBroadcastBus()
    // Falls back to in-memory when REDIS_URL is missing
    expect(bus).toBeInstanceOf(BroadcastBus)
  })

  it('returns RedisBroadcastBus when SSE_BUS=redis and REDIS_URL is set', async () => {
    process.env.SSE_BUS = 'redis'
    process.env.REDIS_URL = 'redis://localhost:6379'
    const { selectBroadcastBus, RedisBroadcastBus } = await import('../../broadcast-bus')
    const bus = selectBroadcastBus()
    expect(bus).toBeInstanceOf(RedisBroadcastBus)
    // Clean up Redis connections without actually connecting
    await (bus as any).close?.().catch(() => {})
  })
})

// --- Bus health signal tests ---

import request from 'supertest'
import { createApp } from '../../app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { Pool } from 'pg'
import { DEFAULT_APP_CONFIG } from '../../config'

function makeApp(opts: { bus?: IBroadcastBus; redis?: any } = {}) {
  const pool = {
    connect: async () => ({
      query: async () => {},
      release: () => {},
    }),
  } as unknown as Pool

  return createApp({
    db: pool,
    jwtConfig: { secret: 'test-secret-at-least-32-chars-long!!', expiresInSeconds: 3600 },
    tokenStore: new InMemoryTokenStore(),
    config: DEFAULT_APP_CONFIG,
    redis: opts.redis ?? null,
    broadcastBus: opts.bus,
  })
}

describe('/health - bus connectivity signal', () => {
  it('reports bus: in-process when in-memory BroadcastBus is used', async () => {
    const { BroadcastBus } = await import('../../broadcast-bus')
    const bus = new BroadcastBus()
    const app = makeApp({ bus })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('bus', 'in-process')
  })

  it('reports bus: in-process when no bus is provided', async () => {
    const app = makeApp({})
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('bus', 'in-process')
  })

  it('reports bus: connected when RedisBroadcastBus reports connected', async () => {
    // Use a mock bus that reports as redis-backed and healthy
    const mockBus: IBroadcastBus & { busHealthStatus?: () => Promise<'connected' | 'down'> } = {
      emit: jest.fn(),
      subscribe: jest.fn().mockReturnValue(() => {}),
      busHealthStatus: jest.fn().mockResolvedValue('connected'),
    }
    const app = makeApp({ bus: mockBus })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('bus', 'connected')
  })

  it('reports bus: down when RedisBroadcastBus reports down', async () => {
    const mockBus: IBroadcastBus & { busHealthStatus?: () => Promise<'connected' | 'down'> } = {
      emit: jest.fn(),
      subscribe: jest.fn().mockReturnValue(() => {}),
      busHealthStatus: jest.fn().mockResolvedValue('down'),
    }
    const app = makeApp({ bus: mockBus })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('bus', 'down')
  })
})
