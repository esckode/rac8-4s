/**
 * Phase 5 tests for the read-receipt batch processor.
 *
 * TDD commit: written BEFORE read-receipt-processor.ts and markReadBatch exist.
 * All tests must fail until the implementation lands.
 *
 * Key invariants under test:
 * 1. N read events (including duplicates) coalesce into a SINGLE bulk UPDATE.
 * 2. The batch is idempotent — flushing the same (messageId, playerId) pair twice is a no-op.
 * 3. Order of events does not affect correctness.
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
import { processReadReceiptFlush } from '../../workers/read-receipt-processor'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Capture every SQL string passed to pool.query. */
function makeCapturingPool(
  queryImpl?: (sql: string, params?: unknown[]) => Promise<unknown>
): { pool: Pool; queries: string[] } {
  const queries: string[] = []
  const pool = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push(sql)
      if (queryImpl) return queryImpl(sql, params)
      return { rows: [], rowCount: 0 }
    }),
  } as unknown as Pool
  return { pool, queries }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('processReadReceiptFlush', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls markReadBatch on the repository exactly once for multiple events', async () => {
    const { pool, queries } = makeCapturingPool()

    await processReadReceiptFlush(
      {
        reads: [
          { messageId: 'msg-1', playerId: 'player-a' },
          { messageId: 'msg-2', playerId: 'player-a' },
          { messageId: 'msg-3', playerId: 'player-b' },
        ],
      },
      { pool }
    )

    // A single bulk UPDATE must be issued — not one per read event.
    // The SQL must mention message_recipients (the target table) and
    // the IN/= ANY construct for bulk matching.
    const updateQueries = queries.filter((q) => q.includes('UPDATE') && q.includes('message_recipients'))
    expect(updateQueries).toHaveLength(1)
  })

  it('issues exactly ONE query total when given N distinct read events', async () => {
    const { pool, queries } = makeCapturingPool()

    const reads = Array.from({ length: 5 }, (_, i) => ({
      messageId: `msg-${i}`,
      playerId: `player-${i}`,
    }))

    await processReadReceiptFlush({ reads }, { pool })

    // Only one SQL statement should be emitted for the entire batch.
    expect(queries).toHaveLength(1)
  })

  it('coalesces duplicate (messageId, playerId) pairs before flushing', async () => {
    const { pool, queries } = makeCapturingPool()

    // Same pair repeated 4 times — should still produce a single bulk UPDATE.
    await processReadReceiptFlush(
      {
        reads: [
          { messageId: 'msg-dup', playerId: 'player-x' },
          { messageId: 'msg-dup', playerId: 'player-x' },
          { messageId: 'msg-dup', playerId: 'player-x' },
          { messageId: 'msg-dup', playerId: 'player-x' },
        ],
      },
      { pool }
    )

    // After deduplication: still exactly 1 bulk UPDATE.
    const updateQueries = queries.filter((q) => q.includes('UPDATE') && q.includes('message_recipients'))
    expect(updateQueries).toHaveLength(1)
    // And only one query total (no per-duplicate round trips).
    expect(queries).toHaveLength(1)
  })

  it('includes the read_at IS NULL guard in the bulk SQL (idempotency)', async () => {
    const { pool, queries } = makeCapturingPool()

    await processReadReceiptFlush(
      { reads: [{ messageId: 'msg-1', playerId: 'player-a' }] },
      { pool }
    )

    // The UPDATE must guard with read_at IS NULL so re-flushing an already-read
    // pair is a no-op at the database level.
    const sql = queries[0]
    expect(sql).toContain('read_at IS NULL')
  })

  it('does nothing (no query) when the reads array is empty', async () => {
    const { pool, queries } = makeCapturingPool()

    await processReadReceiptFlush({ reads: [] }, { pool })

    // An empty batch must not hit the DB at all.
    expect(queries).toHaveLength(0)
  })

  it('order of events does not affect the set of pairs flushed', async () => {
    // The bulk UPDATE passes pairs as a flat params array: [mid1, pid1, mid2, pid2, ...]
    // Regardless of input order, the SET of (messageId, playerId) pairs passed
    // to the DB must be equivalent across both calls.
    const capturedParams: unknown[][] = []
    const pool = {
      query: jest.fn(async (_sql: string, params?: unknown[]) => {
        if (params) capturedParams.push(params)
        return { rows: [], rowCount: 0 }
      }),
    } as unknown as Pool

    const readsAB = [
      { messageId: 'msg-1', playerId: 'player-a' },
      { messageId: 'msg-2', playerId: 'player-b' },
    ]
    const readsBA = [
      { messageId: 'msg-2', playerId: 'player-b' },
      { messageId: 'msg-1', playerId: 'player-a' },
    ]

    // Reset between calls
    ;(pool.query as jest.Mock).mockClear()
    capturedParams.length = 0
    await processReadReceiptFlush({ reads: readsAB }, { pool })
    const paramsAB = capturedParams.slice()

    ;(pool.query as jest.Mock).mockClear()
    capturedParams.length = 0
    await processReadReceiptFlush({ reads: readsBA }, { pool })
    const paramsBA = capturedParams.slice()

    // Both calls must issue exactly one query each.
    expect(paramsAB).toHaveLength(1)
    expect(paramsBA).toHaveLength(1)

    // Reconstruct the (messageId, playerId) pairs from the flat params array.
    // Params are interleaved: [mid1, pid1, mid2, pid2, ...]
    function toPairSet(flatParams: unknown[]): Set<string> {
      const pairs = new Set<string>()
      for (let i = 0; i < flatParams.length; i += 2) {
        pairs.add(`${flatParams[i]}|${flatParams[i + 1]}`)
      }
      return pairs
    }

    // The sets of pairs must be equal regardless of input order.
    expect(toPairSet(paramsAB[0] as unknown[])).toEqual(toPairSet(paramsBA[0] as unknown[]))
  })

  it('logs a structured info event after flushing', async () => {
    const { pool } = makeCapturingPool()

    await processReadReceiptFlush(
      {
        reads: [
          { messageId: 'msg-1', playerId: 'player-a' },
          { messageId: 'msg-1', playerId: 'player-a' }, // duplicate — coalesced
        ],
      },
      { pool }
    )

    // Should log a single info event after the flush with at least `count` in context.
    expect(mockLog.info).toHaveBeenCalledWith(
      'read_receipt.flush.done',
      expect.objectContaining({ count: 1 })
    )
  })

  it('logs error and re-throws when markReadBatch rejects with an Error', async () => {
    const boom = new Error('DB connection lost')
    const pool = {
      query: jest.fn(async () => { throw boom }),
    } as unknown as Pool

    await expect(
      processReadReceiptFlush(
        { reads: [{ messageId: 'msg-1', playerId: 'player-a' }] },
        { pool }
      )
    ).rejects.toThrow('DB connection lost')

    expect(mockLog.error).toHaveBeenCalledWith(
      'read_receipt.flush.failed',
      expect.objectContaining({ message: 'DB connection lost' })
    )
  })

  it('logs error and re-throws when markReadBatch rejects with a non-Error value', async () => {
    const pool = {
      query: jest.fn(async () => { throw 'unexpected string error' }),
    } as unknown as Pool

    await expect(
      processReadReceiptFlush(
        { reads: [{ messageId: 'msg-1', playerId: 'player-a' }] },
        { pool }
      )
    ).rejects.toBe('unexpected string error')

    expect(mockLog.error).toHaveBeenCalledWith(
      'read_receipt.flush.failed',
      expect.objectContaining({ message: 'unexpected string error' })
    )
  })
})
