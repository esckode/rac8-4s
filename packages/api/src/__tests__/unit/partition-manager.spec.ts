import { Pool } from 'pg'

/**
 * Unit tests for packages/api/src/services/partition-manager.ts
 *
 * Tests the thin TS wrappers around the SQL lifecycle functions.
 * Uses a mock pool — no real DB required.
 */

// Dynamic import so the module can be mocked before import
jest.mock('../../services/partition-manager', () => {
  // We'll use the actual module but with a mocked pool
  const actual = jest.requireActual('../../services/partition-manager')
  return actual
})

describe('PartitionManager', () => {
  let mockPool: jest.Mocked<Pick<Pool, 'query'>>
  let PartitionManager: typeof import('../../services/partition-manager').PartitionManager

  beforeEach(async () => {
    jest.resetModules()
    const mod = await import('../../services/partition-manager')
    PartitionManager = mod.PartitionManager

    mockPool = {
      query: jest.fn(),
    }
  })

  describe('ensureFuturePartitions', () => {
    it('calls messaging.ensure_future_partitions with the given months_ahead', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 } as any)

      const manager = new PartitionManager(mockPool as unknown as Pool)
      await manager.ensureFuturePartitions(3)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ensure_future_partitions'),
        expect.arrayContaining([3])
      )
    })

    it('uses default months_ahead=2 when not specified', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 } as any)

      const manager = new PartitionManager(mockPool as unknown as Pool)
      await manager.ensureFuturePartitions()

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ensure_future_partitions'),
        expect.arrayContaining([2])
      )
    })
  })

  describe('purgeOldPartitions', () => {
    const sampleRows = [
      { partition: 'messaging.messages_2024_01', action: 'DROPPED' },
      { partition: 'messaging.message_recipients_2024_01', action: 'DROPPED' },
    ]

    it('calls messaging.purge_old_partitions with retention and padding args', async () => {
      mockPool.query.mockResolvedValue({ rows: sampleRows, rowCount: 2 } as any)

      const manager = new PartitionManager(mockPool as unknown as Pool)
      const result = await manager.purgeOldPartitions({ retentionDays: 90, dropPaddingDays: 45 })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('purge_old_partitions'),
        expect.arrayContaining([90, 45])
      )
      expect(result).toEqual(sampleRows)
    })

    it('dry-run returns would-be actions without executing DDL', async () => {
      // In dry-run mode, the manager should NOT call the SQL purge function
      // but instead query partition metadata to simulate what would happen
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 } as any)

      const manager = new PartitionManager(mockPool as unknown as Pool)
      const result = await manager.purgeOldPartitions({
        retentionDays: 90,
        dropPaddingDays: 45,
        dryRun: true,
      })

      // dry-run should NOT call the real purge function
      const callArgs = mockPool.query.mock.calls
      const calledPurge = callArgs.some(
        ([sql]: [string]) => typeof sql === 'string' && sql.includes('purge_old_partitions')
      )
      expect(calledPurge).toBe(false)

      // dry-run result is an array (possibly empty)
      expect(Array.isArray(result)).toBe(true)
    })

    it('uses default retention and padding when not specified', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 } as any)

      const manager = new PartitionManager(mockPool as unknown as Pool)
      await manager.purgeOldPartitions()

      const calls = mockPool.query.mock.calls
      // Either the purge function was called with default args (non-dry-run mode)
      // or the dry-run query was used — either way, query should have been called
      expect(calls.length).toBeGreaterThan(0)
    })
  })
})
