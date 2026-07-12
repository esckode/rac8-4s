/**
 * A8.2 coverage (follow-up) — AnthropicAssistantClient direct unit tests.
 *
 * The real Anthropic/AWS SDK client constructors are mocked (no network),
 * but betaZodTool itself is real (pure schema/wrapper code, no I/O) so the
 * tool definitions built in buildTools() — including each tool's `run`
 * closure — are exercised exactly as the real tool runner would call them.
 * ./tools is mocked so those closures never touch a DB.
 */
import * as tools from '../../assistant/tools'
import * as proposeScoreModule from '../../assistant/propose-score'

jest.mock('../../assistant/tools', () => ({
  getMyMatches: jest.fn(),
  getStandings: jest.fn(),
  getBracket: jest.fn(),
  getTournament: jest.fn(),
}))

jest.mock('../../assistant/propose-score', () => ({
  proposeScore: jest.fn(),
}))

const mockToolRunner = jest.fn()
const mockAnthropicCtor = jest.fn().mockImplementation(() => ({
  beta: { messages: { toolRunner: mockToolRunner } },
}))
const mockAnthropicAwsCtor = jest.fn().mockImplementation(() => ({
  beta: { messages: { toolRunner: mockToolRunner } },
}))

jest.mock('@anthropic-ai/sdk', () => ({ default: mockAnthropicCtor }), { virtual: true })
jest.mock('@anthropic-ai/aws-sdk', () => ({ default: mockAnthropicAwsCtor }), { virtual: true })

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AnthropicAssistantClient } = require('../../assistant/assistant-client')

const ctx = {
  db: {} as any,
  playerId: 'player-1',
  groupId: 'group-1',
  groupLinkedTournamentIds: ['tourn-1'],
}

function turnInput(question = 'hello') {
  return { systemPrompt: 'sys', contextBlock: 'ctx', question, toolContext: ctx }
}

describe('AnthropicAssistantClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('construction', () => {
    it('adapter "anthropic-aws" constructs the AWS SDK client', () => {
      // eslint-disable-next-line no-new
      new AnthropicAssistantClient({ adapter: 'anthropic-aws', model: 'claude-haiku-4-5' })
      expect(mockAnthropicAwsCtor).toHaveBeenCalledTimes(1)
      expect(mockAnthropicCtor).not.toHaveBeenCalled()
    })

    it('adapter "anthropic" constructs the first-party SDK client', () => {
      // eslint-disable-next-line no-new
      new AnthropicAssistantClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })
      expect(mockAnthropicCtor).toHaveBeenCalledTimes(1)
      expect(mockAnthropicAwsCtor).not.toHaveBeenCalled()
    })
  })

  describe('runTurn', () => {
    it('calls toolRunner with the design-mandated fixed params and maps usage snake_case → camelCase', async () => {
      mockToolRunner.mockReturnValue(
        Promise.resolve({
          content: [{ type: 'text', text: 'Saturday 9am vs Bob.' }],
          usage: { input_tokens: 2000, output_tokens: 100, cache_read_input_tokens: 1500 },
        })
      )
      const client = new AnthropicAssistantClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })
      const result = await client.runTurn(turnInput())

      expect(mockToolRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5',
          max_tokens: 150,
          max_iterations: 5,
          system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: 'ctx' }],
        })
      )
      expect(result).toEqual({
        text: 'Saturday 9am vs Bob.',
        usage: { inputTokens: 2000, outputTokens: 100, cacheReadInputTokens: 1500 },
        toolRounds: 0,
      })
    })

    it('joins and trims multiple text blocks, ignoring non-text blocks', async () => {
      mockToolRunner.mockReturnValue(
        Promise.resolve({
          content: [
            { type: 'tool_use', id: 'x', name: 'get_my_matches', input: {} },
            { type: 'text', text: '  Hello ' },
            { type: 'text', text: 'world  ' },
          ],
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
        })
      )
      const client = new AnthropicAssistantClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })
      const result = await client.runTurn(turnInput())
      // text blocks joined with no separator, non-text blocks skipped, whole result trimmed
      expect(result.text).toBe('Hello world')
    })

    it('defaults usage fields to 0 when the SDK omits them', async () => {
      mockToolRunner.mockReturnValue(Promise.resolve({ content: [{ type: 'text', text: 'hi' }] }))
      const client = new AnthropicAssistantClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })
      const result = await client.runTurn(turnInput())
      expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 })
    })

    it('registers the four Phase A read-only tools plus the Phase B propose_score tool', async () => {
      mockToolRunner.mockReturnValue(Promise.resolve({ content: [], usage: {} }))
      const client = new AnthropicAssistantClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })
      await client.runTurn(turnInput())

      const opts = mockToolRunner.mock.calls[0][0]
      expect(opts.tools.map((t: { name: string }) => t.name)).toEqual([
        'get_my_matches',
        'get_standings',
        'get_bracket',
        'get_tournament',
        'propose_score',
      ])
    })

    it('counts a tool round each time the runner invokes a tool run() closure', async () => {
      (tools.getMyMatches as jest.Mock).mockResolvedValue({ matches: [] })
      ;(tools.getStandings as jest.Mock).mockResolvedValue({ tournamentId: 'tourn-1', groups: [] })
      mockToolRunner.mockImplementation(async (opts: { tools: Array<{ name: string; run: (i: any) => Promise<string> }> }) => {
        const myMatches = opts.tools.find(t => t.name === 'get_my_matches')!
        const standings = opts.tools.find(t => t.name === 'get_standings')!
        const r1 = await myMatches.run({})
        const r2 = await standings.run({ tournamentId: 'tourn-1' })
        expect(JSON.parse(r1)).toEqual({ matches: [] })
        expect(JSON.parse(r2)).toEqual({ tournamentId: 'tourn-1', groups: [] })
        return { content: [{ type: 'text', text: 'done' }], usage: {} }
      })

      const client = new AnthropicAssistantClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })
      const result = await client.runTurn(turnInput())

      expect(tools.getMyMatches).toHaveBeenCalledWith(ctx, {})
      expect(tools.getStandings).toHaveBeenCalledWith(ctx, { tournamentId: 'tourn-1' })
      expect(result.toolRounds).toBe(2)
    })

    it('the get_bracket and get_tournament tool run() closures also delegate to the real tools', async () => {
      (tools.getBracket as jest.Mock).mockResolvedValue({ tournamentId: 'tourn-1', matches: [] })
      ;(tools.getTournament as jest.Mock).mockResolvedValue({ id: 'tourn-1', name: 'Spring Open' })
      mockToolRunner.mockImplementation(async (opts: { tools: Array<{ name: string; run: (i: any) => Promise<string> }> }) => {
        const bracket = opts.tools.find(t => t.name === 'get_bracket')!
        const tournament = opts.tools.find(t => t.name === 'get_tournament')!
        await bracket.run({ tournamentId: 'tourn-1' })
        await tournament.run({ tournamentId: 'tourn-1' })
        return { content: [{ type: 'text', text: 'done' }], usage: {} }
      })

      const client = new AnthropicAssistantClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })
      const result = await client.runTurn(turnInput())

      expect(tools.getBracket).toHaveBeenCalledWith(ctx, { tournamentId: 'tourn-1' })
      expect(tools.getTournament).toHaveBeenCalledWith(ctx, { tournamentId: 'tourn-1' })
      expect(result.toolRounds).toBe(2)
    })

    it('the propose_score tool run() closure delegates to the real propose-score module', async () => {
      (proposeScoreModule.proposeScore as jest.Mock).mockResolvedValue({
        status: 'card_posted',
        cardId: 'card-1',
        messageId: 'msg-1',
      })
      mockToolRunner.mockImplementation(async (opts: { tools: Array<{ name: string; run: (i: any) => Promise<string> }> }) => {
        const proposeScoreTool = opts.tools.find(t => t.name === 'propose_score')!
        const r = await proposeScoreTool.run({ opponentName: 'Bob', score: '6-4, 6-3' })
        expect(JSON.parse(r)).toEqual({ status: 'card_posted', cardId: 'card-1', messageId: 'msg-1' })
        return { content: [{ type: 'text', text: 'done' }], usage: {} }
      })

      const client = new AnthropicAssistantClient({ adapter: 'anthropic', model: 'claude-haiku-4-5' })
      const result = await client.runTurn(turnInput())

      expect(proposeScoreModule.proposeScore).toHaveBeenCalledWith(ctx, { opponentName: 'Bob', score: '6-4, 6-3' })
      expect(result.toolRounds).toBe(1)
    })
  })
})
