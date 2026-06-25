/**
 * V2.1 — Unit tests for partition coverage signal in PartitionManager.
 *
 * Tests:
 *  - getCoverageStatus() returns 'ok' when furthest partition is > 2 months ahead
 *  - getCoverageStatus() returns 'low' when furthest partition is 1–2 months ahead
 *  - getCoverageStatus() returns 'critical' when furthest partition is < 1 month ahead
 *  - getCoverageStatus() returns 'critical' when no partitions exist
 *  - Audit row written correctly (counts, dry_run, success flags)
 */

const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}

jest.mock('../../logger', () => ({
  getLogger: jest.fn(() => mockLog),
}))

import { Pool } from 'pg'
import { PartitionManager } from '../../services/partition-manager'

function makePool(
  queryImpl: (sql: string, params?: unknown[]) => Promise<unknown>
): Pool {
  return {
    query: jest.fn((sql: string, params?: unknown[]) => queryImpl(sql, params)),
  } as unknown as Pool
}

describe('PartitionManager.getCoverageStatus()', () => {
  beforeEach(() => jest.clearAllMocks())

  const now = new Date()

  function daysFromNow(days: number): Date {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    return d
  }

  it('returns ok when furthest partition is > 60 days ahead', async () => {
    const furthestDate = daysFromNow(70)
    const pool = makePool(async () => ({
      rows: [{ max_end: furthestDate.toISOString() }],
      rowCount: 1,
    }))

    const manager = new PartitionManager(pool)
    const status = await manager.getCoverageStatus()

    expect(status.level).toBe('ok')
    expect(status.daysAhead).toBeGreaterThan(60)
  })

  it('returns low when furthest partition is 30–60 days ahead', async () => {
    const furthestDate = daysFromNow(45)
    const pool = makePool(async () => ({
      rows: [{ max_end: furthestDate.toISOString() }],
      rowCount: 1,
    }))

    const manager = new PartitionManager(pool)
    const status = await manager.getCoverageStatus()

    expect(status.level).toBe('low')
    expect(mockLog.warn).toHaveBeenCalledWith(
      'partition.coverage.low',
      expect.objectContaining({ daysAhead: expect.any(Number) })
    )
  })

  it('returns critical when furthest partition is < 30 days ahead', async () => {
    const furthestDate = daysFromNow(10)
    const pool = makePool(async () => ({
      rows: [{ max_end: furthestDate.toISOString() }],
      rowCount: 1,
    }))

    const manager = new PartitionManager(pool)
    const status = await manager.getCoverageStatus()

    expect(status.level).toBe('critical')
    expect(mockLog.warn).toHaveBeenCalledWith(
      'partition.coverage.critical',
      expect.objectContaining({ daysAhead: expect.any(Number) })
    )
  })

  it('returns critical when no attached partitions exist', async () => {
    const pool = makePool(async () => ({
      rows: [{ max_end: null }],
      rowCount: 1,
    }))

    const manager = new PartitionManager(pool)
    const status = await manager.getCoverageStatus()

    expect(status.level).toBe('critical')
    expect(status.furthestPartitionDate).toBeNull()
    expect(status.daysAhead).toBe(0)
  })

  it('queries pg_class for attached partitions of messaging.messages', async () => {
    let capturedSql = ''
    const pool = makePool(async (sql) => {
      capturedSql = sql
      return { rows: [{ max_end: daysFromNow(90).toISOString() }], rowCount: 1 }
    })

    const manager = new PartitionManager(pool)
    await manager.getCoverageStatus()

    expect(capturedSql).toContain('pg_class')
    expect(capturedSql).toContain('messaging')
    expect(capturedSql).toContain('messages')
  })
})

describe('PartitionManager audit row writing', () => {
  beforeEach(() => jest.clearAllMocks())

  it('inserts an audit row with run_type=ensure after ensureFuturePartitions', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const pool = makePool(async (sql, params) => {
      queries.push({ sql, params })
      return { rows: [], rowCount: 0 }
    })

    const manager = new PartitionManager(pool)
    await manager.ensureFuturePartitions(3)

    const auditInsert = queries.find(
      (q) =>
        q.sql.includes('partition_maintenance_runs') &&
        q.sql.toLowerCase().includes('insert')
    )
    expect(auditInsert).toBeDefined()
    // Should include run_type = 'ensure'
    const paramsStr = JSON.stringify(auditInsert?.params ?? [])
    expect(paramsStr).toContain('ensure')
  })

  it('inserts an audit row with run_type=purge and dry_run=false', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const pool = makePool(async (sql, params) => {
      queries.push({ sql, params })
      // Fake return for purge_old_partitions
      if (sql.includes('purge_old_partitions')) {
        return {
          rows: [
            { partition: 'messaging.messages_2024_01', action: 'DROPPED' },
            { partition: 'messaging.message_recipients_2024_01', action: 'DROPPED' },
          ],
          rowCount: 2,
        }
      }
      return { rows: [], rowCount: 0 }
    })

    const manager = new PartitionManager(pool)
    await manager.purgeOldPartitions({ retentionDays: 90, dropPaddingDays: 45 })

    const auditInsert = queries.find(
      (q) =>
        q.sql.includes('partition_maintenance_runs') &&
        q.sql.toLowerCase().includes('insert')
    )
    expect(auditInsert).toBeDefined()
    const paramsStr = JSON.stringify(auditInsert?.params ?? [])
    expect(paramsStr).toContain('purge')
    // dry_run=false should be in params
    expect(paramsStr).toContain('false')
  })

  it('inserts an audit row with dry_run=true for dryRun option', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const pool = makePool(async (sql, params) => {
      queries.push({ sql, params })
      // Dry run queries pg_class, returns some rows
      if (sql.includes('pg_inherits') || sql.includes('pg_class')) {
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 0 }
    })

    const manager = new PartitionManager(pool)
    await manager.purgeOldPartitions({ retentionDays: 90, dropPaddingDays: 45, dryRun: true })

    const auditInsert = queries.find(
      (q) =>
        q.sql.includes('partition_maintenance_runs') &&
        q.sql.toLowerCase().includes('insert')
    )
    expect(auditInsert).toBeDefined()
    const paramsStr = JSON.stringify(auditInsert?.params ?? [])
    expect(paramsStr).toContain('true') // dry_run=true
  })
})
