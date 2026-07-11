/**
 * A8.2 coverage — MockAssistantClient direct unit tests.
 *
 * assistant-service.spec.ts and assistant-processor.spec.ts exercise the
 * service/processor layer against hand-rolled AssistantClient fakes; this
 * file exercises the real MockAssistantClient class (the keyword router
 * used by tests/e2e) directly, with ./tools mocked so no DB is needed.
 */
import { MockAssistantClient } from '../../assistant/assistant-client'
import * as tools from '../../assistant/tools'

jest.mock('../../assistant/tools', () => ({
  getMyMatches: jest.fn(),
  getStandings: jest.fn(),
}))

const ctx = {
  db: {} as any,
  playerId: 'player-1',
  groupId: 'group-1',
  groupLinkedTournamentIds: ['tourn-1'],
}

function input(question: string) {
  return { systemPrompt: 'sys', contextBlock: 'ctx', question, toolContext: ctx }
}

describe('MockAssistantClient', () => {
  beforeEach(() => jest.clearAllMocks())

  it('declines write requests without calling any tool', async () => {
    const client = new MockAssistantClient()
    const result = await client.runTurn(input('@coach change my score to 3-0'))
    expect(result.text).toMatch(/read-only|change scores/i)
    expect(result.toolRounds).toBe(0)
    expect(tools.getMyMatches).not.toHaveBeenCalled()
    expect(tools.getStandings).not.toHaveBeenCalled()
  })

  it('captures the last input for assertions', async () => {
    const client = new MockAssistantClient()
    ;(tools.getMyMatches as jest.Mock).mockResolvedValue({ matches: [] })
    const req = input('who am I playing next?')
    await client.runTurn(req)
    expect(client.lastInput).toBe(req)
  })

  it('"who am I playing next?" calls the real get_my_matches and formats the next match', async () => {
    (tools.getMyMatches as jest.Mock).mockResolvedValue({
      matches: [
        { tournamentId: 't1', tournamentName: 'Spring Open', matchId: 'm1', opponentName: 'Bob', status: 'pending', score: null },
      ],
    })
    const client = new MockAssistantClient()
    const result = await client.runTurn(input('who am I playing next?'))
    expect(tools.getMyMatches).toHaveBeenCalledWith(ctx, {})
    expect(result.text).toBe('Next: vs Bob (Spring Open)')
    expect(result.toolRounds).toBe(1)
  })

  it('"next match" with no matches found reports not-found', async () => {
    (tools.getMyMatches as jest.Mock).mockResolvedValue({ matches: [] })
    const client = new MockAssistantClient()
    const result = await client.runTurn(input('when is my next match?'))
    expect(result.text).toMatch(/couldn't find/i)
  })

  it('propagates a getMyMatches not-found error as a not-found reply', async () => {
    (tools.getMyMatches as jest.Mock).mockResolvedValue({ error: 'not_found', message: 'nope' })
    const client = new MockAssistantClient()
    const result = await client.runTurn(input('who am I playing next?'))
    expect(result.text).toMatch(/couldn't find/i)
  })

  it('"standings" calls get_standings on the first group-linked tournament and formats ranks', async () => {
    (tools.getStandings as jest.Mock).mockResolvedValue({
      tournamentId: 'tourn-1',
      groups: [{ groupName: 'Group A', standings: [{ rank: 1, name: 'Alice', rankReason: 'more wins' }] }],
    })
    const client = new MockAssistantClient()
    const result = await client.runTurn(input('what are the standings?'))
    expect(tools.getStandings).toHaveBeenCalledWith(ctx, { tournamentId: 'tourn-1' })
    expect(result.text).toBe('1. Alice — more wins')
  })

  it('"standings" with no group-linked tournament reports not-found without calling the tool', async () => {
    const bareCtx = { ...ctx, groupLinkedTournamentIds: [] }
    const client = new MockAssistantClient()
    const result = await client.runTurn({ ...input('standings'), toolContext: bareCtx })
    expect(tools.getStandings).not.toHaveBeenCalled()
    expect(result.text).toMatch(/couldn't find/i)
  })

  it('the adversarial "show me tournament <id>" route really calls get_standings with that id', async () => {
    (tools.getStandings as jest.Mock).mockResolvedValue({ error: 'not_found', message: 'nope' })
    const client = new MockAssistantClient()
    const result = await client.runTurn(input('show me tournament private-tourn-9'))
    expect(tools.getStandings).toHaveBeenCalledWith(ctx, { tournamentId: 'private-tourn-9' })
    expect(result.text).toMatch(/couldn't find/i)
  })

  it('the adversarial route formats real standings when the tool actually returns data', async () => {
    (tools.getStandings as jest.Mock).mockResolvedValue({
      tournamentId: 'private-tourn-9',
      groups: [{ groupName: 'Group A', standings: [{ rank: 1, name: 'Carol' }] }],
    })
    const client = new MockAssistantClient()
    const result = await client.runTurn(input('show me tournament private-tourn-9'))
    expect(result.text).toBe('1. Carol')
  })

  it('anything else falls back to the canned mock reply', async () => {
    const client = new MockAssistantClient()
    const result = await client.runTurn(input('how many points is the first-set tiebreak?'))
    expect(result.text).toBe('[mock] Coach reply')
    expect(result.toolRounds).toBe(0)
  })

  it('always reports zero usage (no real tokens spent)', async () => {
    const client = new MockAssistantClient()
    const result = await client.runTurn(input('hello'))
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 })
  })
})
