import { playersFromBundleStandings, flattenBundleStandings } from '../standings-players'

describe('playersFromBundleStandings', () => {
  it('extracts {id,name} from grouped standings (the real bundle shape)', () => {
    const grouped = [
      {
        groupId: 'g1',
        groupName: 'Group A',
        standings: [
          { rank: 1, playerId: 'p1', name: 'Alice', wins: 1, losses: 0 },
          { rank: 2, playerId: 'p2', name: 'Bob', wins: 0, losses: 1 },
        ],
      },
      {
        groupId: 'g2',
        groupName: 'Group B',
        standings: [{ rank: 1, playerId: 't1', name: 'Carol & Dave', wins: 0, losses: 0 }],
      },
    ]

    const players = playersFromBundleStandings(grouped)

    expect(players).toEqual([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 't1', name: 'Carol & Dave' },
    ])
  })

  it('also handles a flat Standing[] shape (participantId)', () => {
    const flat = [
      { participantId: 'p1', name: 'Alice', rank: 1, wins: 1, losses: 0 },
      { participantId: 'p2', name: 'Bob', rank: 2, wins: 0, losses: 1 },
    ]

    expect(playersFromBundleStandings(flat)).toEqual([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ])
  })

  it('skips rows missing an id or name, and tolerates non-array input', () => {
    expect(playersFromBundleStandings(null)).toEqual([])
    expect(playersFromBundleStandings(undefined)).toEqual([])
    expect(
      playersFromBundleStandings([{ standings: [{ playerId: 'p1' }, { name: 'NoId' }, { playerId: 'p3', name: 'Eve' }] }])
    ).toEqual([{ id: 'p3', name: 'Eve' }])
  })
})

describe('flattenBundleStandings', () => {
  it('flattens grouped bundle standings into Standing[] keyed by participantId', () => {
    const grouped = [
      {
        groupId: 'g1',
        groupName: 'Group A',
        standings: [
          { rank: 1, playerId: 'p1', name: 'Alice', wins: 2, losses: 0, setsWon: 4, setsLost: 1 },
          { rank: 2, playerId: 'p2', name: 'Bob', wins: 0, losses: 2, setsWon: 1, setsLost: 4 },
        ],
      },
      {
        groupId: 'g2',
        groupName: 'Group B',
        standings: [{ rank: 1, playerId: 'p3', name: 'Carol', wins: 1, losses: 0, setsWon: 2, setsLost: 0 }],
      },
    ]

    expect(flattenBundleStandings(grouped)).toEqual([
      { participantId: 'p1', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 1 },
      { participantId: 'p2', rank: 2, wins: 0, losses: 2, setsWon: 1, setsLost: 4 },
      { participantId: 'p3', rank: 1, wins: 1, losses: 0, setsWon: 2, setsLost: 0 },
    ])
  })

  it('passes through an already-flat Standing[] (participantId)', () => {
    const flat = [{ participantId: 'p1', rank: 1, wins: 1, losses: 0, setsWon: 2, setsLost: 0 }]
    expect(flattenBundleStandings(flat)).toEqual(flat)
  })

  it('maps a flat playerId row to participantId, and tolerates non-array input', () => {
    expect(flattenBundleStandings(null)).toEqual([])
    expect(
      flattenBundleStandings([{ playerId: 'p1', rank: 1, wins: 1, losses: 0, setsWon: 2, setsLost: 0 }])
    ).toEqual([{ participantId: 'p1', rank: 1, wins: 1, losses: 0, setsWon: 2, setsLost: 0 }])
  })
})
