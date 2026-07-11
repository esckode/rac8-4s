/**
 * A5.3 — assistant.reply processor (RED first)
 *
 * The processor gates the service behind the rate limiter, posts the polite
 * cap message at most once per limited window, records real spend after a
 * successful turn, and resolves on service rejection (error logged, no
 * unhandled rejection / retry storm).
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
import { processAssistantReply, ASSISTANT_CAP_REPLY } from '../../workers/assistant-processor'
import type { AssistantClient, AssistantTurnResult } from '../../assistant/assistant-client'
import type { GroupMessageRepository } from '../../repositories/group-message-repository'

function makePool(): Pool {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("metadata->>'replyTo'")) return { rows: [] }
      if (sql.includes('assistant_enabled')) return { rows: [{ assistant_enabled: true }] }
      return { rows: [] }
    }),
  } as unknown as Pool
}

function makeRepo(opts: { failSend?: boolean } = {}) {
  const sent: Array<{ groupId: string; body: string }> = []
  const repo = {
    getPlayerName: jest.fn(async () => 'Alice'),
    getRecentMessages: jest.fn(async () => []),
    sendAssistantMessage: jest.fn(async (input: { groupId: string; body: string }) => {
      if (opts.failSend) throw new Error('db down')
      sent.push(input)
      return {
        message: {
          id: `reply-${sent.length}`,
          conversationId: 'conv-1',
          playerId: null,
          senderName: 'Coach',
          body: input.body,
          type: 'assistant',
          createdAt: new Date(),
          removedAt: null,
          removedBy: null,
          metadata: null,
        },
        conversationId: 'conv-1',
      }
    }),
  }
  return { repo: repo as unknown as GroupMessageRepository, sent }
}

function makeClient(): { client: AssistantClient; calls: unknown[] } {
  const calls: unknown[] = []
  const client: AssistantClient = {
    runTurn: async (input): Promise<AssistantTurnResult> => {
      calls.push(input)
      return {
        text: 'a reply',
        usage: { inputTokens: 2000, outputTokens: 100, cacheReadInputTokens: 0 },
        toolRounds: 0,
      }
    },
  }
  return { client, calls }
}

const payload = {
  messageId: 'msg-1',
  conversationId: 'conv-1',
  groupId: 'group-1',
  playerId: 'player-1',
  body: '@coach hello',
}

const LIMITS = { playerPerHour: 10, groupPerHour: 30, dailyBudgetUsd: 5 }

describe('processAssistantReply', () => {
  beforeEach(() => jest.clearAllMocks())

  it('invokes the service with the payload when within limits', async () => {
    const { repo, sent } = makeRepo()
    const { client, calls } = makeClient()
    const limiter = new AssistantRateLimiter(new InMemoryCounterStore(), LIMITS)

    await processAssistantReply(payload, { pool: makePool(), groupMessageRepo: repo, client, rateLimiter: limiter })

    expect(calls).toHaveLength(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toBe('a reply')
  })

  it('records real spend against the daily budget after a successful turn', async () => {
    const { repo } = makeRepo()
    const { client } = makeClient()
    const limiter = new AssistantRateLimiter(new InMemoryCounterStore(), LIMITS)
    const spendSpy = jest.spyOn(limiter, 'recordSpend')

    await processAssistantReply(payload, { pool: makePool(), groupMessageRepo: repo, client, rateLimiter: limiter })

    // (2000*1 + 100*5)/1e6
    expect(spendSpy).toHaveBeenCalledWith(expect.closeTo(0.0025, 6))
  })

  it('rate-limited: service NOT invoked, cap message inserted at most once per window', async () => {
    const { repo, sent } = makeRepo()
    const { client, calls } = makeClient()
    const store = new InMemoryCounterStore()
    const limiter = new AssistantRateLimiter(store, { ...LIMITS, playerPerHour: 1 })

    await processAssistantReply(payload, { pool: makePool(), groupMessageRepo: repo, client, rateLimiter: limiter })
    expect(calls).toHaveLength(1) // first call allowed

    // second call limited → cap message once
    await processAssistantReply(payload, { pool: makePool(), groupMessageRepo: repo, client, rateLimiter: limiter })
    expect(calls).toHaveLength(1)
    expect(sent.map(s => s.body)).toEqual(['a reply', ASSISTANT_CAP_REPLY])

    // third call still limited → NO second cap message
    await processAssistantReply(payload, { pool: makePool(), groupMessageRepo: repo, client, rateLimiter: limiter })
    expect(calls).toHaveLength(1)
    expect(sent.filter(s => s.body === ASSISTANT_CAP_REPLY)).toHaveLength(1)
  })

  it('service rejection → processor resolves (error logged)', async () => {
    const { repo } = makeRepo({ failSend: true })
    const { client } = makeClient()
    const limiter = new AssistantRateLimiter(new InMemoryCounterStore(), LIMITS)

    await expect(
      processAssistantReply(payload, { pool: makePool(), groupMessageRepo: repo, client, rateLimiter: limiter })
    ).resolves.toBeUndefined()
    expect(mockLog.error).toHaveBeenCalled()
  })
})
