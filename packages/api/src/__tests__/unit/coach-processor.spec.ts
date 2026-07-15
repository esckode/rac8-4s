/**
 * S5.3 — 1:1 Coach processor (RED first)
 *
 * Copies the assistant-processor.spec.ts shape (stubbed CoachClient + fakes):
 * happy path (history + snapshot + memories → runCoachTurn → reply inserted
 * via the conversation-first send, emitted, spend recorded), idempotency
 * (duplicate delivery inserts nothing), heads-up footer appended to the
 * reply, capped (client NOT called, cap row at most once per window),
 * memory injection (age-annotated, toggle gates both the block AND
 * propose_remember's presence in the tool registry), client-throws fallback,
 * and coach.replied usage logging (never bodies).
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
import { InMemoryCounterStore } from '../../middleware/rate-limit-store'
import { AssistantRateLimiter } from '../../assistant/rate-limiter'
import { processCoachTurn, COACH_FALLBACK_REPLY, formatMemoryAge } from '../../workers/coach-processor'
import { COACH_CAP_MESSAGE } from '../../assistant/coach-constants'
import type { CoachClient, CoachTurnInput } from '../../assistant/coach-client'
import type { AssistantTurnResult } from '../../assistant/assistant-client'
import type { GroupMessageRepository } from '../../repositories/group-message-repository'
import type { PlayerMemoryRepository, PlayerMemoryRow } from '../../repositories/player-memory-repository'

function makePool(opts: { alreadyReplied?: boolean; coachMemoryEnabled?: boolean } = {}): Pool {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("metadata->>'replyTo'")) {
        return { rows: opts.alreadyReplied ? [{ x: 1 }] : [] }
      }
      if (sql.includes('coach_memory_enabled')) {
        return { rows: [{ coach_memory_enabled: opts.coachMemoryEnabled ?? true }] }
      }
      return { rows: [] }
    }),
  } as unknown as Pool
}

function makeRepo(opts: { failSend?: boolean } = {}) {
  const sent: Array<{ conversationId: string; body: string; metadata?: Record<string, unknown> }> = []
  const repo = {
    getRecentMessages: jest.fn(async () => []),
    sendAssistantMessageToConversation: jest.fn(
      async (conversationId: string, body: string, metadata?: Record<string, unknown>) => {
        if (opts.failSend) throw new Error('db down')
        sent.push({ conversationId, body, metadata })
        return {
          message: {
            id: `reply-${sent.length}`,
            conversationId,
            playerId: null,
            senderName: 'Coach',
            body,
            type: 'assistant',
            createdAt: new Date(),
            removedAt: null,
            removedBy: null,
            metadata: metadata ?? null,
          },
          conversationId,
        }
      }
    ),
  }
  return { repo: repo as unknown as GroupMessageRepository, sent }
}

function makeMemoryRepo(memories: PlayerMemoryRow[] = []) {
  return {
    listMemories: jest.fn(async () => memories),
  } as unknown as PlayerMemoryRepository
}

function makeClient(overrides: Partial<CoachClient> = {}): { client: CoachClient; calls: CoachTurnInput[] } {
  const calls: CoachTurnInput[] = []
  const client: CoachClient = {
    runCoachTurn: async (input): Promise<AssistantTurnResult> => {
      calls.push(input)
      return {
        text: 'a coach reply',
        usage: { inputTokens: 2000, outputTokens: 100, cacheReadInputTokens: 500 },
        toolRounds: 0,
      }
    },
    ...overrides,
  }
  return { client, calls }
}

const payload = {
  messageId: 'msg-1',
  conversationId: 'conv-1',
  playerId: 'player-1',
  body: 'who am I playing next?',
}

const LIMITS = { playerPerHour: 20, groupPerHour: 999, dailyBudgetUsd: 5 }

describe('processCoachTurn', () => {
  beforeEach(() => jest.clearAllMocks())

  it('happy path: loads history, calls runCoachTurn, inserts + emits the reply, records spend', async () => {
    const { repo, sent } = makeRepo()
    const memoryRepo = makeMemoryRepo()
    const { client, calls } = makeClient()
    const limiter = new AssistantRateLimiter(new InMemoryCounterStore(), LIMITS)
    const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }
    const spendSpy = jest.spyOn(limiter, 'recordSpend')

    await processCoachTurn(payload, {
      pool: makePool(),
      groupMessageRepo: repo,
      memoryRepo,
      client,
      rateLimiter: limiter,
      broadcastBus: broadcastBus as any,
    })

    expect(calls).toHaveLength(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toBe('a coach reply')
    expect(sent[0].metadata).toEqual({ replyTo: 'msg-1' })
    expect(broadcastBus.emit).toHaveBeenCalledWith('conv-1', 'message.created', expect.objectContaining({ body: 'a coach reply' }))
    expect(spendSpy).toHaveBeenCalledWith(expect.closeTo((2000 * 1 + 100 * 5) / 1e6, 6))
  })

  it('idempotency: a duplicate delivery (existing replyTo row) inserts nothing', async () => {
    const { repo, sent } = makeRepo()
    const memoryRepo = makeMemoryRepo()
    const { client, calls } = makeClient()
    const limiter = new AssistantRateLimiter(new InMemoryCounterStore(), LIMITS)

    await processCoachTurn(payload, {
      pool: makePool({ alreadyReplied: true }),
      groupMessageRepo: repo,
      memoryRepo,
      client,
      rateLimiter: limiter,
    })

    expect(calls).toHaveLength(0)
    expect(sent).toHaveLength(0)
  })

  it('heads-up: near the limit, the reply body gets the footer appended', async () => {
    const { repo, sent } = makeRepo()
    const memoryRepo = makeMemoryRepo()
    const { client } = makeClient()
    const store = new InMemoryCounterStore()
    const limiter = new AssistantRateLimiter(store, { ...LIMITS, playerPerHour: 20 })
    // Drive this player's hourly counter to 17 so this (18th) call leaves 2 remaining (limit 20).
    for (let i = 0; i < 17; i++) await store.increment(`coach:player:${payload.playerId}`, 3600)

    await processCoachTurn(payload, { pool: makePool(), groupMessageRepo: repo, memoryRepo, client, rateLimiter: limiter })

    expect(sent[0].body).toBe('a coach reply\n\n⚠ 2 messages left this hour')
  })

  it('capped: client NOT called, polite cap row inserted at most once per limited window', async () => {
    const { repo, sent } = makeRepo()
    const memoryRepo = makeMemoryRepo()
    const { client, calls } = makeClient()
    const store = new InMemoryCounterStore()
    const limiter = new AssistantRateLimiter(store, { ...LIMITS, playerPerHour: 1 })

    await processCoachTurn(payload, { pool: makePool(), groupMessageRepo: repo, memoryRepo, client, rateLimiter: limiter })
    expect(calls).toHaveLength(1) // first call allowed

    await processCoachTurn(
      { ...payload, messageId: 'msg-2' },
      { pool: makePool(), groupMessageRepo: repo, memoryRepo, client, rateLimiter: limiter }
    )
    expect(calls).toHaveLength(1)
    expect(sent.map(s => s.body)).toEqual(['a coach reply', COACH_CAP_MESSAGE])

    await processCoachTurn(
      { ...payload, messageId: 'msg-3' },
      { pool: makePool(), groupMessageRepo: repo, memoryRepo, client, rateLimiter: limiter }
    )
    expect(calls).toHaveLength(1)
    expect(sent.filter(s => s.body === COACH_CAP_MESSAGE)).toHaveLength(1)
  })

  it('memory injection: enabled → the volatile block contains age-annotated memory bodies', async () => {
    const { repo } = makeRepo()
    const memories: PlayerMemoryRow[] = [
      { id: 'm1', playerId: 'player-1', body: 'prefers morning matches', source: 'player', createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) },
    ]
    const memoryRepo = makeMemoryRepo(memories)
    const { client, calls } = makeClient()
    const limiter = new AssistantRateLimiter(new InMemoryCounterStore(), LIMITS)

    await processCoachTurn(payload, {
      pool: makePool({ coachMemoryEnabled: true }),
      groupMessageRepo: repo,
      memoryRepo,
      client,
      rateLimiter: limiter,
    })

    expect(calls[0].volatileBlock).toContain('prefers morning matches')
    expect(calls[0].memoryEnabled).toBe(true)
  })

  it('memory injection: disabled → no memories in the block and memoryEnabled is false', async () => {
    const { repo } = makeRepo()
    const memories: PlayerMemoryRow[] = [
      { id: 'm1', playerId: 'player-1', body: 'prefers morning matches', source: 'player', createdAt: new Date() },
    ]
    const memoryRepo = makeMemoryRepo(memories)
    const { client, calls } = makeClient()
    const limiter = new AssistantRateLimiter(new InMemoryCounterStore(), LIMITS)

    await processCoachTurn(payload, {
      pool: makePool({ coachMemoryEnabled: false }),
      groupMessageRepo: repo,
      memoryRepo,
      client,
      rateLimiter: limiter,
    })

    expect(calls[0].volatileBlock).not.toContain('prefers morning matches')
    expect(calls[0].memoryEnabled).toBe(false)
  })

  it('client throws → fallback row inserted, job resolves (no retry storm)', async () => {
    const { repo, sent } = makeRepo()
    const memoryRepo = makeMemoryRepo()
    const client: CoachClient = { runCoachTurn: async () => { throw new Error('SDK down') } }
    const limiter = new AssistantRateLimiter(new InMemoryCounterStore(), LIMITS)

    await expect(
      processCoachTurn(payload, { pool: makePool(), groupMessageRepo: repo, memoryRepo, client, rateLimiter: limiter })
    ).resolves.toBeUndefined()

    expect(sent[0].body).toBe(COACH_FALLBACK_REPLY)
  })

  it('logs coach.replied with usage fields, never bodies', async () => {
    const { repo } = makeRepo()
    const memoryRepo = makeMemoryRepo()
    const { client } = makeClient()
    const limiter = new AssistantRateLimiter(new InMemoryCounterStore(), LIMITS)

    await processCoachTurn(payload, { pool: makePool(), groupMessageRepo: repo, memoryRepo, client, rateLimiter: limiter })

    const call = mockLog.info.mock.calls.find(c => c[0] === 'coach.replied')
    expect(call).toBeDefined()
    expect(call![1]).toMatchObject({
      playerId: 'player-1',
      inputTokens: 2000,
      outputTokens: 100,
      cacheReadInputTokens: 500,
      toolRounds: 0,
    })
    expect(call![1]).toHaveProperty('latencyMs')
    expect(JSON.stringify(call![1])).not.toContain('who am I playing next')
    expect(JSON.stringify(call![1])).not.toContain('a coach reply')
  })
})

describe('formatMemoryAge', () => {
  const now = new Date('2026-07-15T00:00:00.000Z')

  it('renders days for anything under 14 days', () => {
    expect(formatMemoryAge(new Date('2026-07-12T00:00:00.000Z'), now)).toBe('3 days ago')
    expect(formatMemoryAge(new Date('2026-07-14T00:00:00.000Z'), now)).toBe('1 day ago')
  })

  it('renders weeks between 14 days and 9 weeks', () => {
    expect(formatMemoryAge(new Date('2026-07-01T00:00:00.000Z'), now)).toBe('2 weeks ago')
  })

  it('renders months beyond 9 weeks', () => {
    expect(formatMemoryAge(new Date('2026-01-15T00:00:00.000Z'), now)).toBe('6 months ago')
  })
})
