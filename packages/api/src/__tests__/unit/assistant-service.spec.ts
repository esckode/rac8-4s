/**
 * A4.3 — Assistant service (RED first)
 *
 * handleAssistantJob: build context (asker + last 20 messages) → one client
 * turn → insert reply via sendAssistantMessage → bus emit. Idempotent on the
 * triggering message id (Q12); client failure inserts the fallback row and
 * RESOLVES (no retry storm); toggle-off between enqueue and processing → no
 * reply; usage logged without message bodies.
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
  handleAssistantJob,
  ASSISTANT_FALLBACK_REPLY,
  type AssistantJobPayload,
} from '../../assistant/assistant-service'
import type { AssistantClient, AssistantTurnResult } from '../../assistant/assistant-client'
import type { GroupMessageRepository } from '../../repositories/group-message-repository'

// ── fakes ────────────────────────────────────────────────────────────────────

interface FakeWorld {
  assistantEnabled: boolean
  alreadyReplied: boolean
  recentMessages: Array<{ senderName: string | null; body: string; type: string }>
}

function makePool(world: FakeWorld): Pool {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("metadata->>'replyTo'")) {
        return { rows: world.alreadyReplied ? [{ id: 'existing' }] : [] }
      }
      if (sql.includes('assistant_enabled')) {
        return { rows: [{ assistant_enabled: world.assistantEnabled }] }
      }
      if (sql.includes('FROM public.tournaments')) {
        return { rows: [] } // no group-linked tournaments needed for these tests
      }
      return { rows: [] }
    }),
  } as unknown as Pool
}

function makeRepo(world: FakeWorld) {
  const sent: Array<{ groupId: string; body: string; metadata?: Record<string, unknown> }> = []
  const repo = {
    getPlayerName: jest.fn(async () => 'Alice'),
    getRecentMessages: jest.fn(async () => world.recentMessages),
    sendAssistantMessage: jest.fn(async (input: { groupId: string; body: string; metadata?: Record<string, unknown> }) => {
      sent.push(input)
      return {
        message: {
          id: 'reply-1',
          conversationId: 'conv-1',
          playerId: null,
          senderName: 'Coach',
          body: input.body,
          type: 'assistant',
          createdAt: new Date(),
          removedAt: null,
          removedBy: null,
          metadata: input.metadata ?? null,
        },
        conversationId: 'conv-1',
      }
    }),
  }
  return { repo: repo as unknown as GroupMessageRepository, sent, fns: repo }
}

function makeClient(
  impl: () => Promise<AssistantTurnResult>
): { client: AssistantClient; calls: any[] } {
  const calls: any[] = []
  return {
    client: {
      runTurn: async (input) => {
        calls.push(input)
        return impl()
      },
    },
    calls,
  }
}

const okTurn = (): Promise<AssistantTurnResult> =>
  Promise.resolve({
    text: 'Saturday 9am vs Bob.',
    usage: { inputTokens: 1200, outputTokens: 40, cacheReadInputTokens: 1000 },
    toolRounds: 1,
  })

const payload: AssistantJobPayload = {
  messageId: 'msg-42',
  conversationId: 'conv-1',
  groupId: 'group-1',
  playerId: 'player-1',
  body: '@coach who am I playing next?',
}

function world(overrides: Partial<FakeWorld> = {}): FakeWorld {
  return {
    assistantEnabled: true,
    alreadyReplied: false,
    recentMessages: [
      { senderName: 'Bob', body: 'anyone up for saturday?', type: 'text' },
      { senderName: 'Alice', body: '@coach who am I playing next?', type: 'text' },
    ],
    ...overrides,
  }
}

describe('handleAssistantJob', () => {
  beforeEach(() => jest.clearAllMocks())

  it('happy path: builds context, runs one turn, inserts the reply, emits on the bus', async () => {
    const w = world()
    const { repo, sent } = makeRepo(w)
    const { client, calls } = makeClient(okTurn)
    const emitted: any[] = []
    const bus = { emit: (key: string, event: string, data: any) => emitted.push({ key, event, data }) }

    await handleAssistantJob(payload, {
      pool: makePool(w),
      groupMessageRepo: repo,
      client,
      broadcastBus: bus as any,
    })

    // client received asker + recent messages (newest last) + the question
    expect(calls).toHaveLength(1)
    expect(calls[0].contextBlock).toContain('Alice')
    expect(calls[0].contextBlock).toContain('anyone up for saturday?')
    expect(calls[0].contextBlock.indexOf('anyone up for saturday?')).toBeLessThan(
      calls[0].contextBlock.indexOf('who am I playing next?')
    )
    expect(calls[0].systemPrompt).toContain('You are Coach')

    // reply row with idempotency provenance
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      groupId: 'group-1',
      body: 'Saturday 9am vs Bob.',
      metadata: { replyTo: 'msg-42' },
    })

    // bus fan-out like any message
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({
      key: 'conv-1',
      event: 'message.created',
      data: { type: 'assistant', senderName: 'Coach', body: 'Saturday 9am vs Bob.' },
    })
  })

  it('idempotency: a second delivery of the same job inserts nothing', async () => {
    const w = world({ alreadyReplied: true })
    const { repo, sent } = makeRepo(w)
    const { client, calls } = makeClient(okTurn)

    await handleAssistantJob(payload, { pool: makePool(w), groupMessageRepo: repo, client })

    expect(calls).toHaveLength(0)
    expect(sent).toHaveLength(0)
  })

  it('client failure: inserts the fallback row and resolves (no retry storm)', async () => {
    const w = world()
    const { repo, sent } = makeRepo(w)
    const { client } = makeClient(() => Promise.reject(new Error('api down')))

    await expect(
      handleAssistantJob(payload, { pool: makePool(w), groupMessageRepo: repo, client })
    ).resolves.toBeUndefined()

    expect(sent).toHaveLength(1)
    expect(sent[0].body).toBe(ASSISTANT_FALLBACK_REPLY)
    expect(sent[0].metadata).toMatchObject({ replyTo: 'msg-42' })
  })

  it('group toggled off between enqueue and processing → no reply', async () => {
    const w = world({ assistantEnabled: false })
    const { repo, sent } = makeRepo(w)
    const { client, calls } = makeClient(okTurn)

    await handleAssistantJob(payload, { pool: makePool(w), groupMessageRepo: repo, client })

    expect(calls).toHaveLength(0)
    expect(sent).toHaveLength(0)
  })

  it('logs assistant.replied with usage — and never message bodies (CLAUDE.md §6)', async () => {
    const w = world()
    const { repo } = makeRepo(w)
    const { client } = makeClient(okTurn)

    await handleAssistantJob(payload, { pool: makePool(w), groupMessageRepo: repo, client })

    const replied = mockLog.info.mock.calls.find(([event]) => event === 'assistant.replied')
    expect(replied).toBeTruthy()
    expect(replied![1]).toMatchObject({
      groupId: 'group-1',
      playerId: 'player-1',
      inputTokens: 1200,
      outputTokens: 40,
      cacheReadInputTokens: 1000,
      toolRounds: 1,
      latencyMs: expect.any(Number),
    })
    const loggedText = JSON.stringify(mockLog.info.mock.calls)
    expect(loggedText).not.toContain('Saturday 9am vs Bob.')
    expect(loggedText).not.toContain('who am I playing next')
  })
})
