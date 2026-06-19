import { bracketToFlow } from '../bracketToFlow'
import type { BracketRound } from '../../../types'

const rounds: BracketRound[] = [
  {
    round: 1,
    matches: [
      { id: 'sf1', round: 1, position: 0, player1Id: 'p1', player2Id: 'p4', winnerId: null, score: null, status: 'pending' },
      { id: 'sf2', round: 1, position: 1, player1Id: 'p2', player2Id: 'p3', winnerId: null, score: null, status: 'pending' },
    ],
  },
  {
    round: 2,
    matches: [
      { id: 'final', round: 2, position: 0, player1Id: null, player2Id: null, winnerId: null, score: null, status: 'pending' },
    ],
  },
]

const nameOf = (id: string | null) =>
  id ? ({ p1: 'Player 1', p2: 'Player 2', p3: 'Player 3', p4: 'Player 4' } as Record<string, string>)[id] ?? 'TBD' : 'TBD'

describe('bracketToFlow', () => {
  it('produces a match node per match plus a round-label node per round', () => {
    const { nodes } = bracketToFlow(rounds, nameOf)
    const matchNodes = nodes.filter((n) => n.type === 'matchNode')
    const roundNodes = nodes.filter((n) => n.type === 'roundLabel')
    expect(matchNodes).toHaveLength(3)
    expect(roundNodes).toHaveLength(2)
  })

  it('resolves participant names into match node data (never raw ids)', () => {
    const { nodes } = bracketToFlow(rounds, nameOf)
    const sf1 = nodes.find((n) => n.id === 'sf1')!
    expect(sf1.data).toMatchObject({ player1: 'Player 1', player2: 'Player 4', status: 'pending' })
    const final = nodes.find((n) => n.id === 'final')!
    expect(final.data).toMatchObject({ player1: 'TBD', player2: 'TBD' })
  })

  it('labels rounds by distance from the final', () => {
    const { nodes } = bracketToFlow(rounds, nameOf)
    const labels = nodes.filter((n) => n.type === 'roundLabel').map((n) => (n.data as any).label)
    expect(labels).toEqual(['Semifinals', 'Final'])
  })

  it('lays out rounds left-to-right in separate columns', () => {
    const { nodes } = bracketToFlow(rounds, nameOf)
    const sf1 = nodes.find((n) => n.id === 'sf1')!
    const final = nodes.find((n) => n.id === 'final')!
    expect(final.position.x).toBeGreaterThan(sf1.position.x)
  })

  it('connects each match to its next-round match', () => {
    const { edges } = bracketToFlow(rounds, nameOf)
    expect(edges).toHaveLength(2)
    expect(edges.every((e) => e.target === 'final')).toBe(true)
    expect(edges.map((e) => e.source).sort()).toEqual(['sf1', 'sf2'])
  })

  it('labels deeper brackets (Round N → Quarterfinals → Semifinals → Final)', () => {
    const deep: BracketRound[] = [1, 2, 3, 4].map((round) => ({
      round,
      matches: [{ id: `r${round}`, round, position: 0, player1Id: null, player2Id: null, winnerId: null, score: null, status: 'pending' }],
    }))
    const labels = bracketToFlow(deep, nameOf)
      .nodes.filter((n) => n.type === 'roundLabel')
      .map((n) => (n.data as any).label)
    expect(labels).toEqual(['Round 1', 'Quarterfinals', 'Semifinals', 'Final'])
  })

  it('carries a completed score into node data', () => {
    const completed: BracketRound[] = [
      {
        round: 1,
        matches: [{ id: 'm', round: 1, position: 0, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', score: '11-9, 11-7', status: 'completed' }],
      },
    ]
    const { nodes } = bracketToFlow(completed, nameOf)
    expect((nodes.find((n) => n.id === 'm')!.data as any).score).toBe('11-9, 11-7')
  })
})
