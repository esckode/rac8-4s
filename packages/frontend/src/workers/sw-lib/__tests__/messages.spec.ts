import { isAppMessage, isSwMessage } from '../messages'

describe('isAppMessage', () => {
  it.each([
    [{ type: 'WIPE_PLAYER_DATA' }],
    [{ type: 'REPLAY_QUEUE' }],
  ])('accepts %j', (msg) => {
    expect(isAppMessage(msg)).toBe(true)
  })

  it.each([
    [null],
    [undefined],
    [42],
    ['WIPE_PLAYER_DATA'],
    [[]],
    [{}],
    [{ type: 'SKIP_WAITING' }], // handled by the vite-plugin-pwa flow, not our protocol
    [{ type: 'BOGUS' }],
  ])('rejects %j', (msg) => {
    expect(isAppMessage(msg)).toBe(false)
  })
})

describe('isSwMessage', () => {
  it('accepts a well-formed WIPE_DONE message', () => {
    expect(isSwMessage({ type: 'WIPE_DONE' })).toBe(true)
  })

  it('accepts REPLAY_RESULT with the optional detail key present but undefined', () => {
    // replayAll sends {detail: undefined} for a rejected replay whose 4xx body
    // had no string message; structured clone preserves the undefined-valued
    // key, and dropping the message here would strand the pending badge.
    expect(
      isSwMessage({ type: 'REPLAY_RESULT', outcome: 'rejected', tournamentId: 't1', matchId: 'm1', detail: undefined })
    ).toBe(true)
  })

  it.each(['success', 'needs-auth', 'rejected', 'expired'] as const)(
    'accepts a well-formed REPLAY_RESULT with outcome %s',
    (outcome) => {
      expect(
        isSwMessage({
          type: 'REPLAY_RESULT',
          outcome,
          tournamentId: 't1',
          matchId: 'm1',
        })
      ).toBe(true)
    }
  )

  it('accepts a REPLAY_RESULT with an optional detail string', () => {
    expect(
      isSwMessage({
        type: 'REPLAY_RESULT',
        outcome: 'rejected',
        tournamentId: 't1',
        matchId: 'm1',
        detail: 'already recorded',
      })
    ).toBe(true)
  })

  it.each([
    [null],
    [undefined],
    [42],
    [[]],
    [{}],
    [{ type: 'BOGUS' }],
    [{ type: 'REPLAY_RESULT' }], // missing outcome/tournamentId/matchId
    [{ type: 'REPLAY_RESULT', outcome: 'success' }], // missing tournamentId/matchId
    [{ type: 'REPLAY_RESULT', outcome: 'success', tournamentId: 't1' }], // missing matchId
    [{ type: 'REPLAY_RESULT', outcome: 'bogus-outcome', tournamentId: 't1', matchId: 'm1' }],
    [{ type: 'REPLAY_RESULT', outcome: 'success', tournamentId: 1, matchId: 'm1' }], // wrong types
    [{ type: 'REPLAY_RESULT', outcome: 'success', tournamentId: 't1', matchId: 'm1', detail: 42 }],
  ])('rejects malformed %j', (msg) => {
    expect(isSwMessage(msg)).toBe(false)
  })
})
