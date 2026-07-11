/**
 * A3.1 — buildRankReason (RED first)
 *
 * Pure function over already-loaded standings rows: per-row string naming the
 * deciding tiebreaker vs the adjacent row (wins → sets won → head-to-head →
 * coin flip, HL §4.3). It explains the ordering @core's calculateStandings
 * already produced — NO new ranking logic. Mirrors compareStandings exactly,
 * including its quirk that head-to-head only applies to 2-participant
 * standings.
 */

import { buildRankReason, type RankReasonRow } from '../../assistant/rank-reason'

function row(partial: Partial<RankReasonRow> & { participantId: string; name: string }): RankReasonRow {
  return { rank: 0, wins: 0, setsWon: 0, ...partial }
}

describe('buildRankReason', () => {
  it('names wins as the decider when wins differ', () => {
    const rows = [
      row({ participantId: 'a', name: 'Alice', rank: 1, wins: 2, setsWon: 4 }),
      row({ participantId: 'b', name: 'Bob', rank: 2, wins: 1, setsWon: 5 }),
    ]
    const reasons = buildRankReason(rows, new Map())

    expect(reasons[0]).toBe('more wins than Bob (2 vs 1)')
    expect(reasons[1]).toBe('fewer wins than Alice (1 vs 2)')
  })

  it('names sets won when wins are equal', () => {
    const rows = [
      row({ participantId: 'a', name: 'Alice', rank: 1, wins: 2, setsWon: 4 }),
      row({ participantId: 'b', name: 'Bob', rank: 2, wins: 2, setsWon: 3 }),
      row({ participantId: 'c', name: 'Carol', rank: 3, wins: 1, setsWon: 5 }),
    ]
    const reasons = buildRankReason(rows, new Map())

    expect(reasons[0]).toBe('equal wins with Bob, more sets won (4 vs 3)')
    expect(reasons[1]).toBe('equal wins with Alice, fewer sets won (3 vs 4)')
    expect(reasons[2]).toBe('fewer wins than Bob (1 vs 2)')
  })

  it('names head-to-head when wins and sets are equal (2-player standings only)', () => {
    const rows = [
      row({ participantId: 'a', name: 'Alice', rank: 1, wins: 1, setsWon: 2 }),
      row({ participantId: 'b', name: 'Bob', rank: 2, wins: 1, setsWon: 2 }),
    ]
    // Alice beat Bob directly
    const headToHead = new Map([['a|b', 1]])
    const reasons = buildRankReason(rows, headToHead)

    expect(reasons[0]).toBe('equal wins and sets with Bob; won head-to-head')
    expect(reasons[1]).toBe('equal wins and sets with Alice; lost head-to-head')
  })

  it('falls to coin flip on a full tie', () => {
    const rows = [
      row({ participantId: 'a', name: 'Alice', rank: 1, wins: 1, setsWon: 2 }),
      row({ participantId: 'b', name: 'Bob', rank: 2, wins: 1, setsWon: 2 }),
    ]
    const reasons = buildRankReason(rows, new Map())

    expect(reasons[0]).toBe('equal wins and sets with Bob, no head-to-head decider — order decided by coin flip')
    expect(reasons[1]).toBe('equal wins and sets with Alice, no head-to-head decider — order decided by coin flip')
  })

  it('skips head-to-head in groups larger than 2 (mirrors compareStandings)', () => {
    const rows = [
      row({ participantId: 'a', name: 'Alice', rank: 1, wins: 1, setsWon: 2 }),
      row({ participantId: 'b', name: 'Bob', rank: 2, wins: 1, setsWon: 2 }),
      row({ participantId: 'c', name: 'Carol', rank: 3, wins: 1, setsWon: 1 }),
    ]
    // Even with a decisive head-to-head, a 3-player group never consults it
    const headToHead = new Map([['a|b', 1]])
    const reasons = buildRankReason(rows, headToHead)

    expect(reasons[0]).toBe('equal wins and sets with Bob, no head-to-head decider — order decided by coin flip')
    expect(reasons[1]).toBe('equal wins and sets with Alice, no head-to-head decider — order decided by coin flip')
    expect(reasons[2]).toBe('equal wins with Bob, fewer sets won (1 vs 2)')
  })

  it('handles a single-player group', () => {
    const rows = [row({ participantId: 'a', name: 'Alice', rank: 1, wins: 0, setsWon: 0 })]
    expect(buildRankReason(rows, new Map())).toEqual(['only player in the group'])
  })

  it('returns [] for empty standings', () => {
    expect(buildRankReason([], new Map())).toEqual([])
  })
})
