/**
 * Coverage — MockCoachClient direct unit tests (mirrors assistant-mock-client.spec.ts).
 *
 * coach-prompt.spec.ts exercises AnthropicCoachClient's shape and
 * buildCoachMessages; this file exercises the real MockCoachClient (§0.8's
 * deterministic router, used by tests/e2e) directly, with ./tools and
 * ./propose-remember mocked so no DB is needed.
 */
import { MockCoachClient } from '../../assistant/coach-client'
import { COACH_MEDICAL_DECLINE_MESSAGE } from '../../assistant/coach-prompt'
import * as tools from '../../assistant/tools'
import * as proposeRememberModule from '../../assistant/propose-remember'

jest.mock('../../assistant/tools', () => ({
  getMyMatches: jest.fn(),
  getStandings: jest.fn(),
  getTournament: jest.fn(),
}))

jest.mock('../../assistant/propose-remember', () => ({
  proposeRemember: jest.fn(),
}))

const ctx = {
  db: {} as any,
  playerId: 'player-1',
  groupId: '',
  groupLinkedTournamentIds: ['tourn-1'],
  surface: 'coach' as const,
}

function input(newMessage: string, memoryEnabled = true) {
  return { systemPrompt: 'sys', history: [], volatileBlock: 'vol', newMessage, toolContext: ctx, memoryEnabled }
}

describe('MockCoachClient', () => {
  beforeEach(() => jest.clearAllMocks())

  it('declines with the exact medical sentence, no tool called', async () => {
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('my elbow hurts when I serve'))
    expect(result.text).toBe(COACH_MEDICAL_DECLINE_MESSAGE)
    expect(result.toolRounds).toBe(0)
    expect(tools.getMyMatches).not.toHaveBeenCalled()
  })

  it('remember: calls the real proposeRemember and reports card_posted', async () => {
    (proposeRememberModule.proposeRemember as jest.Mock).mockResolvedValue({
      status: 'card_posted', cardId: 'card-1', messageId: 'msg-1',
    })
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('remember I prefer morning matches'))
    expect(proposeRememberModule.proposeRemember).toHaveBeenCalledWith(ctx, { text: 'I prefer morning matches' })
    expect(result.text).toMatch(/confirm/i)
    expect(result.toolRounds).toBe(1)
  })

  it('remember: surfaces a decline message when proposeRemember declines', async () => {
    (proposeRememberModule.proposeRemember as jest.Mock).mockResolvedValue({
      status: 'declined', message: 'I already remember that.',
    })
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('remember I prefer morning matches'))
    expect(result.text).toBe('I already remember that.')
  })

  it('remember: honors memoryEnabled=false without calling proposeRemember', async () => {
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('remember I prefer morning matches', false))
    expect(proposeRememberModule.proposeRemember).not.toHaveBeenCalled()
    expect(result.text).toMatch(/turned off/i)
    expect(result.toolRounds).toBe(0)
  })

  it('declines write requests ("submit my score") without calling any tool', async () => {
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('submit my score 2-1'))
    expect(result.text).toMatch(/group chat/i)
    expect(result.toolRounds).toBe(0)
    expect(tools.getMyMatches).not.toHaveBeenCalled()
  })

  it('declines a "beat <name> <score>" write request too', async () => {
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('beat Bob 6-4, 6-3'))
    expect(result.text).toMatch(/group chat/i)
    expect(result.toolRounds).toBe(0)
  })

  it('adversarial-tournament: really calls get_tournament with the given id', async () => {
    (tools.getTournament as jest.Mock).mockResolvedValue({ error: 'not_found', message: 'Tournament not found' })
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('adversarial-tournament tourn-999'))
    expect(tools.getTournament).toHaveBeenCalledWith(ctx, { tournamentId: 'tourn-999' })
    expect(result.text).toContain('not_found')
    expect(result.toolRounds).toBe(1)
  })

  it('scouting: "how do I beat <name>" cites the real standings record', async () => {
    (tools.getStandings as jest.Mock).mockResolvedValue({
      tournamentId: 'tourn-1',
      groups: [{ groupName: 'A', standings: [{ rank: 1, name: 'Bob', wins: 4, losses: 1, setsWon: 8, setsLost: 3 }] }],
    })
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('how do I beat Bob'))
    expect(tools.getStandings).toHaveBeenCalledWith(ctx, { tournamentId: 'tourn-1' })
    expect(result.text).toContain('4-1')
    expect(result.toolRounds).toBe(1)
  })

  it('scouting: reports "no record found" when the opponent never appears in standings', async () => {
    (tools.getStandings as jest.Mock).mockResolvedValue({ tournamentId: 'tourn-1', groups: [] })
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('how do I beat Nobody'))
    expect(result.text).toContain('no record found')
  })

  it('next match: reports the asker\'s next pending match', async () => {
    (tools.getMyMatches as jest.Mock).mockResolvedValue({
      matches: [{ tournamentId: 't1', tournamentName: 'Summer Open', matchId: 'm1', opponentName: 'Carol', status: 'pending', score: null }],
    })
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('who am I playing next?'))
    expect(result.text).toBe('Next: vs Carol (Summer Open)')
    expect(result.toolRounds).toBe(1)
  })

  it('next match: reports "No upcoming match scheduled" when everything is completed', async () => {
    (tools.getMyMatches as jest.Mock).mockResolvedValue({
      matches: [{ tournamentId: 't1', tournamentName: 'Summer Open', matchId: 'm1', opponentName: 'Carol', status: 'completed', score: '6-4,6-3' }],
    })
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('next match'))
    expect(result.text).toBe('No upcoming match scheduled.')
  })

  it('standings: reports rank + rankReason from the first group-linked tournament', async () => {
    (tools.getStandings as jest.Mock).mockResolvedValue({
      tournamentId: 'tourn-1',
      groups: [{ groupName: 'A', standings: [{ rank: 2, name: 'Me', wins: 3, losses: 1, setsWon: 6, setsLost: 2, rankReason: 'won more sets' }] }],
    })
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('standings'))
    expect(tools.getStandings).toHaveBeenCalledWith(ctx, { tournamentId: 'tourn-1' })
    expect(result.text).toBe('Rank 2 — won more sets')
  })

  it('standings: reports "couldn\'t find standings" with no group-linked tournaments', async () => {
    const client = new MockCoachClient()
    const result = await client.runCoachTurn({ ...input('standings'), toolContext: { ...ctx, groupLinkedTournamentIds: [] } })
    expect(result.text).toMatch(/couldn't find standings/i)
    expect(result.toolRounds).toBe(0)
  })

  it('falls back to the generic mock reply for anything else', async () => {
    const client = new MockCoachClient()
    const result = await client.runCoachTurn(input('what a nice day'))
    expect(result.text).toBe('[mock] Coach 1:1 reply')
    expect(result.toolRounds).toBe(0)
  })

  it('captures the last input for assertions', async () => {
    const client = new MockCoachClient()
    const req = input('hello')
    await client.runCoachTurn(req)
    expect(client.lastInput).toBe(req)
  })
})
