/**
 * Unit tests for packages/api/src/services/partition-manager.ts
 *
 * Tests the thin TS wrappers around the SQL lifecycle functions.
 * Uses a stub pool — no real DB required.
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

function makePool(queryImpl: (sql: string, params?: unknown[]) => Promise<unknown>): Pool {
  return {
    query: jest.fn((sql: string, params?: unknown[]) => queryImpl(sql, params)),
  } as unknown as Pool
}

describe('PartitionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('ensureFuturePartitions', () => {
    it('calls messaging.ensure_future_partitions with the given months_ahead', async () => {
      let capturedSql = ''
      let capturedParams: unknown[] = []
      const pool = makePool(async (sql, params) => {
        capturedSql = sql
        capturedParams = params ?? []
        return { rows: [], rowCount: 0 }
      })

      const manager = new PartitionManager(pool)
      await manager.ensureFuturePartitions(3)

      expect(capturedSql).toContain('ensure_future_partitions')
      expect(capturedParams).toContain(3)
    })

    it('uses default months_ahead=2 when not specified', async () => {
      let capturedParams: unknown[] = []
      const pool = makePool(async (_sql, params) => {
        capturedParams = params ?? []
        return { rows: [], rowCount: 0 }
      })

      const manager = new PartitionManager(pool)
      await manager.ensureFuturePartitions()

      expect(capturedParams).toContain(2)
    })
  })

  describe('purgeOldPartitions', () => {
    const sampleRows = [
      { partition: 'messaging.messages_2024_01', action: 'DROPPED' as const },
      { partition: 'messaging.message_recipients_2024_01', action: 'DROPPED' as const },
    ]

    it('calls messaging.purge_old_partitions with retention and padding args', async () => {
      let capturedSql = ''
      let capturedParams: unknown[] = []
      const pool = makePool(async (sql, params) => {
        capturedSql = sql
        capturedParams = params ?? []
        return { rows: sampleRows, rowCount: 2 }
      })

      const manager = new PartitionManager(pool)
      const result = await manager.purgeOldPartitions({ retentionDays: 90, dropPaddingDays: 45 })

      expect(capturedSql).toContain('purge_old_partitions')
      expect(capturedParams).toContain(90)
      expect(capturedParams).toContain(45)
      expect(result).toEqual(sampleRows)
    })

    it('dry-run does NOT call the SQL purge function', async () => {
      const calledSqls: string[] = []
      const pool = makePool(async (sql) => {
        calledSqls.push(sql)
        return { rows: [], rowCount: 0 }
      })

      const manager = new PartitionManager(pool)
      const result = await manager.purgeOldPartitions({
        retentionDays: 90,
        dropPaddingDays: 45,
        dryRun: true,
      })

      // The real purge function must not have been called
      const calledPurge = calledSqls.some((s) => s.includes('purge_old_partitions'))
      expect(calledPurge).toBe(false)

      // dry-run result is an array
      expect(Array.isArray(result)).toBe(true)
    })

    it('uses default retention=90 and padding=45 when not specified', async () => {
      let capturedParams: unknown[] = []
      const pool = makePool(async (_sql, params) => {
        capturedParams = params ?? []
        return { rows: [], rowCount: 0 }
      })

      const manager = new PartitionManager(pool)
      await manager.purgeOldPartitions()

      // Non-dry-run with defaults: purge function called with [90, 45]
      expect(capturedParams).toContain(90)
      expect(capturedParams).toContain(45)
    })
  })
})
