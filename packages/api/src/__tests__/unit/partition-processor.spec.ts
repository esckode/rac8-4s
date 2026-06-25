/**
 * Unit tests for workers/partition-processor.ts
 *
 * Covers processPartitionEnsure and processPartitionPurge, including
 * the error paths that the processor re-throws after logging.
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
import {
  processPartitionEnsure,
  processPartitionPurge,
} from '../../workers/partition-processor'

function makePool(
  queryImpl: (sql: string, params?: unknown[]) => Promise<unknown>
): Pool {
  return {
    query: jest.fn((sql: string, params?: unknown[]) => queryImpl(sql, params)),
  } as unknown as Pool
}

describe('processPartitionEnsure', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls ensureFuturePartitions with default monthsAhead=2 when not specified', async () => {
    const allParams: unknown[][] = []
    const pool = makePool(async (_sql, params) => {
      allParams.push(params ?? [])
      return { rows: [], rowCount: 0 }
    })

    await processPartitionEnsure({}, { pool })

    // One of the queries must have used monthsAhead=2
    const flat = allParams.flat()
    expect(flat).toContain(2)
    expect(mockLog.info).toHaveBeenCalledWith(
      'partition.ensure.job.done',
      expect.objectContaining({ monthsAhead: 2 })
    )
  })

  it('passes custom monthsAhead through to the partition manager', async () => {
    const allParams: unknown[][] = []
    const pool = makePool(async (_sql, params) => {
      allParams.push(params ?? [])
      return { rows: [], rowCount: 0 }
    })

    await processPartitionEnsure({ monthsAhead: 4 }, { pool })

    const flat = allParams.flat()
    expect(flat).toContain(4)
    expect(mockLog.info).toHaveBeenCalledWith(
      'partition.ensure.job.done',
      expect.objectContaining({ monthsAhead: 4 })
    )
  })

  it('logs an error and re-throws when the partition manager fails', async () => {
    const boom = new Error('PG error')
    const pool = makePool(async () => { throw boom })

    await expect(processPartitionEnsure({}, { pool })).rejects.toThrow('PG error')

    expect(mockLog.error).toHaveBeenCalledWith(
      'partition.ensure.job.failed',
      expect.objectContaining({ message: 'PG error', monthsAhead: 2 })
    )
  })

  it('logs the error message for non-Error thrown values', async () => {
    const pool = makePool(async () => { throw 'string-error' })

    await expect(processPartitionEnsure({}, { pool })).rejects.toBe('string-error')

    expect(mockLog.error).toHaveBeenCalledWith(
      'partition.ensure.job.failed',
      expect.objectContaining({ message: 'string-error' })
    )
  })
})

describe('processPartitionPurge', () => {
  beforeEach(() => jest.clearAllMocks())

  const droppedRows = [
    { partition: 'messaging.messages_2024_01', action: 'DROPPED' as const },
    { partition: 'messaging.message_recipients_2024_01', action: 'DROPPED' as const },
  ]
  const detachedRows = [
    { partition: 'messaging.messages_2024_02', action: 'DETACHED' as const },
  ]

  it('returns dropped and detached counts from purge actions', async () => {
    const pool = makePool(async () => ({
      rows: [...droppedRows, ...detachedRows],
      rowCount: 3,
    }))

    const result = await processPartitionPurge(
      { retentionDays: 90, dropPaddingDays: 45 },
      { pool }
    )

    expect(result.dropped).toBe(2)
    expect(result.detached).toBe(1)
    expect(mockLog.info).toHaveBeenCalledWith(
      'partition.purge.job.done',
      expect.objectContaining({ dropped: 2, detached: 1, dryRun: false })
    )
  })

  it('uses default retentionDays=90 and dropPaddingDays=45 when not specified', async () => {
    const allParams: unknown[][] = []
    const pool = makePool(async (_sql, params) => {
      allParams.push(params ?? [])
      return { rows: [], rowCount: 0 }
    })

    await processPartitionPurge({}, { pool })

    const flat = allParams.flat()
    expect(flat).toContain(90)
    expect(flat).toContain(45)
  })

  it('returns 0/0 when no partitions were acted on', async () => {
    const pool = makePool(async () => ({ rows: [], rowCount: 0 }))

    const result = await processPartitionPurge({}, { pool })

    expect(result.dropped).toBe(0)
    expect(result.detached).toBe(0)
  })

  it('passes dryRun=true through to partition manager (queries pg_class, not the purge fn)', async () => {
    const calledSqls: string[] = []
    const pool = makePool(async (sql) => {
      calledSqls.push(sql)
      return { rows: [], rowCount: 0 }
    })

    const result = await processPartitionPurge(
      { dryRun: true, retentionDays: 90, dropPaddingDays: 45 },
      { pool }
    )

    // dry-run must NOT call the real purge function
    expect(calledSqls.some(s => s.includes('purge_old_partitions'))).toBe(false)
    // dry-run returns dropped=0 and detached=0 (no DRY_RUN rows match either action)
    expect(result.dropped).toBe(0)
    expect(result.detached).toBe(0)
    expect(mockLog.info).toHaveBeenCalledWith(
      'partition.purge.job.done',
      expect.objectContaining({ dryRun: true })
    )
  })

  it('logs an error and re-throws when the partition manager fails', async () => {
    const boom = new Error('purge failed')
    const pool = makePool(async () => { throw boom })

    await expect(
      processPartitionPurge({ retentionDays: 90 }, { pool })
    ).rejects.toThrow('purge failed')

    expect(mockLog.error).toHaveBeenCalledWith(
      'partition.purge.job.failed',
      expect.objectContaining({ message: 'purge failed' })
    )
  })

  it('logs the error message for non-Error thrown values', async () => {
    const pool = makePool(async () => { throw 42 })

    await expect(processPartitionPurge({}, { pool })).rejects.toBe(42)

    expect(mockLog.error).toHaveBeenCalledWith(
      'partition.purge.job.failed',
      expect.objectContaining({ message: '42' })
    )
  })
})
