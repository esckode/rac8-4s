/**
 * V2.1 — Unit tests: partition coverage signal in /health endpoint.
 *
 * Tests:
 *  - GET /health includes partition_coverage field when PartitionManager is injected
 *  - partition_coverage = 'ok' | 'low' | 'critical'
 *  - /health/ready also includes partition_coverage
 */

import request from 'supertest'
import { createApp } from '../../app'
import { DEFAULT_APP_CONFIG } from '../../config'
import { InMemoryTokenStore } from '../../auth'
import { BroadcastBus } from '../../broadcast-bus'
import { InMemoryJobQueue } from '@worker/job-queue'
import { InMemoryStandingsCache } from '../../standings-cache'

jest.mock('../../logger', () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
  runWithRequestId: jest.fn((_id: string, fn: () => void) => fn()),
}))

// Mock PartitionManager so we can control the coverage status
jest.mock('../../services/partition-manager')

import { PartitionManager } from '../../services/partition-manager'

const MockPartitionManager = PartitionManager as jest.MockedClass<typeof PartitionManager>

function makeDeps(coverageLevel: 'ok' | 'low' | 'critical' = 'ok') {
  const db = {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      release: jest.fn(),
    }),
  } as any

  MockPartitionManager.prototype.getCoverageStatus = jest.fn().mockResolvedValue({
    level: coverageLevel,
    furthestPartitionDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    daysAhead: coverageLevel === 'ok' ? 90 : coverageLevel === 'low' ? 40 : 10,
  })

  return {
    db,
    jwtConfig: {
      secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
      expiresInSeconds: 3600,
    },
    tokenStore: new InMemoryTokenStore(),
    config: DEFAULT_APP_CONFIG,
    broadcastBus: new BroadcastBus(),
    jobQueue: new InMemoryJobQueue(),
    standingsCache: new InMemoryStandingsCache(),
    redis: null,
    partitionManager: new MockPartitionManager(db),
  }
}

describe('GET /health — partition coverage signal', () => {
  beforeEach(() => jest.clearAllMocks())

  it('includes partition_coverage=ok when coverage is healthy', async () => {
    const deps = makeDeps('ok')
    const app = createApp(deps)

    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('partition_coverage', 'ok')
  })

  it('includes partition_coverage=low when coverage is low', async () => {
    const deps = makeDeps('low')
    const app = createApp(deps)

    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('partition_coverage', 'low')
  })

  it('includes partition_coverage=critical when coverage is critical', async () => {
    const deps = makeDeps('critical')
    const app = createApp(deps)

    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('partition_coverage', 'critical')
  })

  it('GET /health/ready also includes partition_coverage', async () => {
    const deps = makeDeps('ok')
    const app = createApp(deps)

    const res = await request(app).get('/health/ready')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('partition_coverage')
  })

  it('omits partition_coverage gracefully when no partitionManager injected', async () => {
    const deps = makeDeps()
    const { partitionManager: _pm, ...depsWithoutManager } = deps
    const app = createApp(depsWithoutManager as any)

    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    // When no partition manager, field should be absent or 'disabled'
    if ('partition_coverage' in res.body) {
      expect(res.body.partition_coverage).toBe('disabled')
    }
  })
})
