/**
 * V3.1 — Unit tests for the messaging.notify processor.
 *
 * TDD commit: these tests are written BEFORE the implementation.
 * All tests here must fail until notify-processor.ts exists.
 *
 * Key invariants under test:
 * 1. Coalescing: N unread messages for the same recipient → one digest email.
 * 2. Debounce: a burst of enqueues for the same recipient collapses to one job (tested
 *    via job-dedup: the queue accepts a jobId and the processor sends only one email).
 * 3. Grace window: a recipient who read the message before the grace elapsed is NOT emailed.
 * 4. Offline selection: a recipient whose read_at IS NULL after grace receives the email.
 * 5. Idempotency: running the processor twice must not double-send (notified_at guard).
 * 6. Logging: noun.verb events, IDs only — no message bodies.
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
import { InMemoryEmailAdapter } from '../../email-adapter'
import { processMessagingNotify, MessagingNotifyPayload } from '../../workers/notify-processor'

// ── helpers ──────────────────────────────────────────────────────────────────

function makePool(
  queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
): Pool {
  return {
    query: jest.fn(async (sql: string, params?: unknown[]) => queryImpl(sql, params)),
  } as unknown as Pool
}

const TOURNAMENT_ID = 'tournament-1'

// ── tests ─────────────────────────────────────────────────────────────────────

describe('processMessagingNotify', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends one digest email to a recipient who has unread messages (offline selection)', async () => {
    const emailAdapter = new InMemoryEmailAdapter()
    const recipientId = 'player-offline'
    const recipientEmail = 'offline@test.local'

    // Pool returns: unread recipients (for notify query) + rows: [] for UPDATE
    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT') && sql.includes('notified_at IS NULL')) {
        return {
          rows: [{ player_id: recipientId, player_email: recipientEmail, unread_count: 2 }],
        }
      }
      return { rows: [] }
    })

    const payload: MessagingNotifyPayload = {
      conversationId: 'conv-1',
      tournamentId: TOURNAMENT_ID,
    }

    await processMessagingNotify(payload, { pool, emailAdapter })

    expect(emailAdapter.sent).toHaveLength(1)
    expect(emailAdapter.sent[0].to).toBe(recipientEmail)
  })

  it('does NOT email a recipient who has already read all messages (grace window respected)', async () => {
    const emailAdapter = new InMemoryEmailAdapter()

    // No unread recipients
    const pool = makePool(async () => ({ rows: [] }))

    const payload: MessagingNotifyPayload = {
      conversationId: 'conv-2',
      tournamentId: TOURNAMENT_ID,
    }

    await processMessagingNotify(payload, { pool, emailAdapter })

    expect(emailAdapter.sent).toHaveLength(0)
  })

  it('sends exactly ONE digest email even when multiple unread messages exist (coalescing)', async () => {
    const emailAdapter = new InMemoryEmailAdapter()
    const recipientId = 'player-a'
    const recipientEmail = 'player-a@test.local'

    // unread_count = 5 but one row per recipient (already coalesced by query GROUP BY)
    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT') && sql.includes('notified_at IS NULL')) {
        return {
          rows: [{ player_id: recipientId, player_email: recipientEmail, unread_count: 5 }],
        }
      }
      return { rows: [] }
    })

    const payload: MessagingNotifyPayload = {
      conversationId: 'conv-3',
      tournamentId: TOURNAMENT_ID,
    }

    await processMessagingNotify(payload, { pool, emailAdapter })

    // Exactly ONE email per recipient regardless of unread_count
    expect(emailAdapter.sent).toHaveLength(1)
    expect(emailAdapter.sent[0].to).toBe(recipientEmail)
  })

  it('sends one email per offline recipient (multiple recipients)', async () => {
    const emailAdapter = new InMemoryEmailAdapter()

    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT') && sql.includes('notified_at IS NULL')) {
        return {
          rows: [
            { player_id: 'player-a', player_email: 'a@test.local', unread_count: 1 },
            { player_id: 'player-b', player_email: 'b@test.local', unread_count: 3 },
          ],
        }
      }
      return { rows: [] }
    })

    const payload: MessagingNotifyPayload = {
      conversationId: 'conv-4',
      tournamentId: TOURNAMENT_ID,
    }

    await processMessagingNotify(payload, { pool, emailAdapter })

    expect(emailAdapter.sent).toHaveLength(2)
    const recipients = emailAdapter.sent.map((e) => e.to)
    expect(recipients).toContain('a@test.local')
    expect(recipients).toContain('b@test.local')
  })

  it('is idempotent: already-notified recipients are excluded (notified_at guard)', async () => {
    const emailAdapter = new InMemoryEmailAdapter()
    let updateCalled = false

    // First call: one unread+unnotified recipient
    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT') && sql.includes('notified_at IS NULL')) {
        return {
          rows: [{ player_id: 'player-x', player_email: 'x@test.local', unread_count: 1 }],
        }
      }
      if (sql.includes('SET notified_at')) {
        updateCalled = true
        return { rows: [] }
      }
      return { rows: [] }
    })

    const payload: MessagingNotifyPayload = {
      conversationId: 'conv-5',
      tournamentId: TOURNAMENT_ID,
    }

    await processMessagingNotify(payload, { pool, emailAdapter })
    expect(emailAdapter.sent).toHaveLength(1)
    expect(updateCalled).toBe(true)

    // Second call: no unread+unnotified recipients (already notified)
    const emailAdapter2 = new InMemoryEmailAdapter()
    const pool2 = makePool(async (sql) => {
      if (sql.includes('notified_at IS NULL') || sql.includes('read_at IS NULL')) {
        return { rows: [] } // already notified, filtered out
      }
      return { rows: [] }
    })

    await processMessagingNotify(payload, { pool: pool2, emailAdapter: emailAdapter2 })
    expect(emailAdapter2.sent).toHaveLength(0)
  })

  it('marks recipients as notified via UPDATE after sending email', async () => {
    const emailAdapter = new InMemoryEmailAdapter()
    const updates: string[] = []

    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT') && sql.includes('notified_at IS NULL')) {
        return {
          rows: [{ player_id: 'player-y', player_email: 'y@test.local', unread_count: 2 }],
        }
      }
      if (sql.includes('SET notified_at')) {
        updates.push(sql)
        return { rows: [] }
      }
      return { rows: [] }
    })

    const payload: MessagingNotifyPayload = {
      conversationId: 'conv-6',
      tournamentId: TOURNAMENT_ID,
    }

    await processMessagingNotify(payload, { pool, emailAdapter })

    expect(updates).toHaveLength(1)
    expect(updates[0]).toContain('notified_at')
  })

  it('logs notification.sent with IDs only (no message bodies)', async () => {
    const emailAdapter = new InMemoryEmailAdapter()

    const pool = makePool(async (sql) => {
      if (sql.includes('SELECT') && sql.includes('notified_at IS NULL')) {
        return {
          rows: [{ player_id: 'player-z', player_email: 'z@test.local', unread_count: 1 }],
        }
      }
      return { rows: [] }
    })

    const payload: MessagingNotifyPayload = {
      conversationId: 'conv-7',
      tournamentId: TOURNAMENT_ID,
    }

    await processMessagingNotify(payload, { pool, emailAdapter })

    expect(mockLog.info).toHaveBeenCalledWith(
      'notification.sent',
      expect.objectContaining({
        conversationId: 'conv-7',
        tournamentId: TOURNAMENT_ID,
      })
    )

    // Verify no message body is included in the log
    const loggedContext = mockLog.info.mock.calls.find(
      ([event]: [string]) => event === 'notification.sent'
    )?.[1]
    expect(loggedContext).not.toHaveProperty('body')
    expect(loggedContext).not.toHaveProperty('message')
  })

  it('logs notification.skipped when no offline recipients', async () => {
    const emailAdapter = new InMemoryEmailAdapter()

    const pool = makePool(async () => ({ rows: [] }))

    const payload: MessagingNotifyPayload = {
      conversationId: 'conv-8',
      tournamentId: TOURNAMENT_ID,
    }

    await processMessagingNotify(payload, { pool, emailAdapter })

    expect(mockLog.debug).toHaveBeenCalledWith(
      'notification.skipped',
      expect.objectContaining({ conversationId: 'conv-8', reason: 'no_offline_recipients' })
    )
  })

  it('logs error and re-throws when the query fails', async () => {
    const emailAdapter = new InMemoryEmailAdapter()
    const boom = new Error('DB gone')

    const pool = makePool(async () => { throw boom })

    const payload: MessagingNotifyPayload = {
      conversationId: 'conv-err',
      tournamentId: TOURNAMENT_ID,
    }

    await expect(processMessagingNotify(payload, { pool, emailAdapter })).rejects.toThrow('DB gone')

    expect(mockLog.error).toHaveBeenCalledWith(
      'notification.failed',
      expect.objectContaining({ conversationId: 'conv-err', message: 'DB gone' })
    )
  })
})
