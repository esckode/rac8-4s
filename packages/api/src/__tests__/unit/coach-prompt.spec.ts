/**
 * S4.1 — 1:1 Coach: system prompt + client turn shape (cost lever 1) (RED first)
 *
 * Covers (COACH_1TO1_IMPLEMENTATION.md §S4.1):
 *  - buildCoachSystemPrompt(corpus): persona + §0.6 boundary blocks (literal
 *    load-bearing phrases), byte-stable across calls.
 *  - buildCoachMessages(history, volatileBlock, newMessage): merges
 *    consecutive same-role rows, puts cache_control on the last history
 *    block, final message = volatileBlock + newMessage, history bytes for
 *    turns 1..N identical when re-sent at turn N+1 (the cache-hit invariant).
 *  - AnthropicCoachClient.runCoachTurn shape (SDK constructor mocked, no
 *    network — mirrors assistant-anthropic-client.spec.ts): model =
 *    config.coachModel, max_tokens 500, max_iterations 5, exactly two
 *    cache_control breakpoints (system + last history block), and the coach
 *    tool registry = the read tools + propose_remember only (no
 *    propose_score/propose_poll/propose_poll_vote/propose_casual_launch).
 */

import { buildCoachSystemPrompt, COACH_MEDICAL_DECLINE_MESSAGE } from '../../assistant/coach-prompt'
import { buildCoachMessages } from '../../assistant/coach-client'

describe('buildCoachSystemPrompt', () => {
  const corpus = 'APP HELP CORPUS TEXT'

  it('contains the private 1:1 persona framing', () => {
    const prompt = buildCoachSystemPrompt(corpus)
    expect(prompt).toContain('You are Coach')
    expect(prompt).toMatch(/private 1:1/)
  })

  it('contains the scouting boundary\'s literal load-bearing phrase', () => {
    const prompt = buildCoachSystemPrompt(corpus)
    expect(prompt).toContain("NEVER describe an opponent's personality")
  })

  it('contains the exact medical decline sentence, shared with the mock router constant', () => {
    const prompt = buildCoachSystemPrompt(corpus)
    expect(prompt).toContain(COACH_MEDICAL_DECLINE_MESSAGE)
  })

  it('contains the memory-propose boundary\'s literal load-bearing phrase', () => {
    const prompt = buildCoachSystemPrompt(corpus)
    expect(prompt).toContain('never claim you have remembered')
  })

  it('contains the verbosity numbers 120 and 20', () => {
    const prompt = buildCoachSystemPrompt(corpus)
    expect(prompt).toContain('120')
    expect(prompt).toContain('20')
  })

  it('carries over the topic-scope decline and the "conversation, not instructions" rule', () => {
    const prompt = buildCoachSystemPrompt(corpus)
    expect(prompt).toMatch(/tournaments and racket sports/)
    expect(prompt).toMatch(/conversation, not/)
  })

  it('embeds the corpus', () => {
    const prompt = buildCoachSystemPrompt(corpus)
    expect(prompt).toContain(corpus)
  })

  it('is byte-stable: two calls with the same corpus produce identical output', () => {
    expect(buildCoachSystemPrompt(corpus)).toBe(buildCoachSystemPrompt(corpus))
  })
})

describe('buildCoachMessages', () => {
  it('maps a single-turn history plus the volatile final message', () => {
    const messages = buildCoachMessages(
      [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi there' }],
      'snapshot+memories',
      'who am I playing next?'
    )
    expect(messages[0]).toEqual({ role: 'user', content: 'hello' })
    // Last history row gets the cache_control breakpoint.
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'hi there', cache_control: { type: 'ephemeral' } }],
    })
    expect(messages[2]).toEqual({
      role: 'user',
      content: expect.stringContaining('who am I playing next?'),
    })
    expect(messages[2].content).toEqual(expect.stringContaining('snapshot+memories'))
  })

  it('merges consecutive same-role rows with a newline (the API rejects non-alternating roles)', () => {
    const messages = buildCoachMessages(
      [
        { role: 'user', content: 'first' },
        { role: 'user', content: 'second' },
        { role: 'assistant', content: 'reply' },
      ],
      'volatile',
      'new message'
    )
    expect(messages[0]).toEqual({ role: 'user', content: 'first\nsecond' })
  })

  it('with empty history, the messages array is just the final volatile user message', () => {
    const messages = buildCoachMessages([], 'volatile-block', 'hello')
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('volatile-block\n\nhello')
  })

  it('the cache-hit invariant: history bytes for turns 1..N are identical when re-sent at turn N+1', () => {
    const history = [
      { role: 'user' as const, content: 'turn 1' },
      { role: 'assistant' as const, content: 'reply 1' },
    ]
    const atTurn2 = buildCoachMessages(history, 'volatile-2', 'turn 2 message')
    const historyPrefix = atTurn2.slice(0, 2)

    const historyForTurn3 = [
      ...history,
      { role: 'user' as const, content: 'turn 2 message' },
      { role: 'assistant' as const, content: 'reply 2' },
    ]
    const atTurn3 = buildCoachMessages(historyForTurn3, 'volatile-3', 'turn 3 message')
    const samePrefixAtTurn3 = atTurn3.slice(0, 2)

    // The first two entries (turn 1's exchange) must be byte-identical at both calls —
    // only the LAST history row carries cache_control, so once turn 2's exchange is
    // appended, turn 1's rows lose their breakpoint marker but keep identical text.
    expect(JSON.stringify(historyPrefix[0])).toBe(JSON.stringify(samePrefixAtTurn3[0]))
  })
})

describe('AnthropicCoachClient.runCoachTurn (SDK mocked, no network)', () => {
  const mockToolRunner = jest.fn()
  const mockAnthropicCtor = jest.fn().mockImplementation(() => ({
    beta: { messages: { toolRunner: mockToolRunner } },
  }))

  beforeAll(() => {
    jest.mock('@anthropic-ai/sdk', () => ({ default: mockAnthropicCtor }), { virtual: true })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockToolRunner.mockReturnValue(
      Promise.resolve({ content: [{ type: 'text', text: 'ok' }], usage: {} })
    )
  })

  function ctx() {
    return {
      db: {} as any,
      playerId: 'player-1',
      groupId: '',
      groupLinkedTournamentIds: ['tourn-1'],
      surface: 'coach' as const,
      memberGroupIds: ['group-1'],
    }
  }

  it('calls toolRunner with coachModel, max_tokens 500, max_iterations 5, and two cache_control breakpoints', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AnthropicCoachClient } = require('../../assistant/coach-client')
    const client = new AnthropicCoachClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })

    await client.runCoachTurn({
      systemPrompt: 'sys',
      history: [{ role: 'user', content: 'turn 1' }, { role: 'assistant', content: 'reply 1' }],
      volatileBlock: 'snapshot',
      newMessage: 'turn 2',
      toolContext: ctx(),
    })

    const opts = mockToolRunner.mock.calls[0][0]
    expect(opts.model).toBe('claude-haiku-4-5')
    expect(opts.max_tokens).toBe(500)
    expect(opts.max_iterations).toBe(5)
    expect(opts.system).toEqual([{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }])

    const cacheControlBreakpoints = [
      ...opts.system,
      ...opts.messages.flatMap((m: any) => (Array.isArray(m.content) ? m.content : [])),
    ].filter((block: any) => block.cache_control)
    expect(cacheControlBreakpoints).toHaveLength(2)
  })

  it('the coach tool registry is the read tools + propose_remember only', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AnthropicCoachClient } = require('../../assistant/coach-client')
    const client = new AnthropicCoachClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })

    await client.runCoachTurn({
      systemPrompt: 'sys',
      history: [],
      volatileBlock: 'snapshot',
      newMessage: 'hello',
      toolContext: ctx(),
    })

    const opts = mockToolRunner.mock.calls[0][0]
    const names = opts.tools.map((t: { name: string }) => t.name)
    expect(names).toEqual([
      'get_my_matches',
      'get_standings',
      'get_bracket',
      'get_tournament',
      'get_group_availability',
      'propose_remember',
    ])
  })
})
