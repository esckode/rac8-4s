/**
 * G4.3 — Social-mixer doubles: random teams, best-effort rotation, sit-out
 *
 * RED tests: written FIRST; will fail until mixer-scheduler.ts is implemented.
 *
 * Suites:
 *   A. Basic output shape
 *   B. Sit-out rotation (odd N)
 *   C. Determinism (seeded RNG)
 *   D. Partner rotation (best-effort greedy)
 *   E. Edge cases (N=2, N=3)
 */

import {
  generateRoundPairings,
  type DoublesMatch,
  type RoundResult,
  type PriorPairing,
} from '../../mixer-scheduler'

// ── Suite A: Basic output shape ───────────────────────────────────────────

describe('A. Basic output shape', () => {
  it('N=4: produces 2 matches, 0 sit-outs, all players appear exactly once', () => {
    const players = ['p1', 'p2', 'p3', 'p4']
    const result = generateRoundPairings(players, 1, [], 42)
    expect(result.sitOut).toBeNull()
    expect(result.matches).toHaveLength(2)
    const allPlayers = result.matches.flatMap((m) => [...m.team1, ...m.team2])
    expect(allPlayers.sort()).toEqual(players.slice().sort())
  })

  it('N=6: produces 3 matches, 0 sit-outs, all players appear exactly once', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const result = generateRoundPairings(players, 1, [], 42)
    expect(result.sitOut).toBeNull()
    expect(result.matches).toHaveLength(3)
    const allPlayers = result.matches.flatMap((m) => [...m.team1, ...m.team2])
    expect(allPlayers.sort()).toEqual(players.slice().sort())
  })

  it('each match has exactly 2 players per team', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const result = generateRoundPairings(players, 1, [], 42)
    for (const match of result.matches) {
      expect(match.team1).toHaveLength(2)
      expect(match.team2).toHaveLength(2)
    }
  })
})

// ── Suite B: Sit-out rotation (odd N) ────────────────────────────────────

describe('B. Sit-out rotation (odd N)', () => {
  it('N=5: produces 2 matches + 1 sit-out', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5']
    const result = generateRoundPairings(players, 1, [], 42)
    expect(result.sitOut).not.toBeNull()
    expect(result.matches).toHaveLength(2)
    const activePlayers = result.matches.flatMap((m) => [...m.team1, ...m.team2])
    expect(activePlayers).toHaveLength(4)
    // sit-out player is from original set
    expect(players).toContain(result.sitOut)
    // sit-out player is NOT in any match
    expect(activePlayers).not.toContain(result.sitOut)
  })

  it('N=5: after 5 rounds each player sits out exactly once (using priorSitOuts)', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5']
    const sitOuts: string[] = []
    let priorPairings: PriorPairing[] = []

    for (let round = 1; round <= 5; round++) {
      // pass prior sit-outs to influence sit-out rotation
      const result = generateRoundPairings(players, round, priorPairings, 42, sitOuts)
      sitOuts.push(result.sitOut!)
      // accumulate pairings
      for (const m of result.matches) {
        priorPairings.push({ playerA: m.team1[0], playerB: m.team1[1] })
        priorPairings.push({ playerA: m.team2[0], playerB: m.team2[1] })
      }
    }

    // Each player sits out exactly once in 5 rounds
    const counts = new Map<string, number>()
    for (const s of sitOuts) {
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    for (const p of players) {
      expect(counts.get(p)).toBe(1)
    }
  })

  it('N=3: produces 1 match + 1 sit-out', () => {
    const players = ['p1', 'p2', 'p3']
    const result = generateRoundPairings(players, 1, [], 42)
    expect(result.sitOut).not.toBeNull()
    expect(result.matches).toHaveLength(1)
    const activePlayers = result.matches.flatMap((m) => [...m.team1, ...m.team2])
    expect(activePlayers).toHaveLength(2)
  })
})

// ── Suite C: Determinism (seeded RNG) ────────────────────────────────────

describe('C. Determinism', () => {
  it('same seed produces the same output on repeated calls', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const r1 = generateRoundPairings(players, 1, [], 12345)
    const r2 = generateRoundPairings(players, 1, [], 12345)
    expect(r1).toEqual(r2)
  })

  it('different seeds produce different outputs', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const r1 = generateRoundPairings(players, 1, [], 1)
    const r2 = generateRoundPairings(players, 1, [], 9999)
    // Very likely different; not guaranteed but practically certain with 6 players
    // (probability of identical: 1/15 team configs × ... effectively near zero)
    // We just check they're not ALWAYS equal — this is a probabilistic test
    // with these specific seeds, they produce different partner groupings
    const r1Teams = r1.matches.map((m) => [...m.team1, ...m.team2].sort().join(','))
    const r2Teams = r2.matches.map((m) => [...m.team1, ...m.team2].sort().join(','))
    expect(r1Teams).not.toEqual(r2Teams)
  })
})

// ── Suite D: Partner rotation (best-effort greedy) ────────────────────────

describe('D. Partner rotation (best-effort greedy)', () => {
  it('after 3 rounds with 6 players, repeated partnerships < purely random baseline', () => {
    // With 6 players there are C(6,2)=15 possible pairs.
    // 3 rounds × 3 partnerships/round = 9 partnerships chosen.
    // Purely random: expected repeats ≈ 9 × (pairs_seen / 15) growing each round.
    // Greedy should produce 0 or very few repeats with 6 players × 3 rounds
    // (15 pairs, 9 chosen — easily avoidable).
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const seed = 42
    let priorPairings: PriorPairing[] = []

    for (let round = 1; round <= 3; round++) {
      const result = generateRoundPairings(players, round, priorPairings, seed)
      for (const m of result.matches) {
        priorPairings.push({ playerA: m.team1[0], playerB: m.team1[1] })
        priorPairings.push({ playerA: m.team2[0], playerB: m.team2[1] })
      }
    }

    // Count repeated partnerships (same pair appearing more than once)
    const pairCounts = new Map<string, number>()
    for (const p of priorPairings) {
      const key = [p.playerA, p.playerB].sort().join('|')
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
    }
    const repeats = [...pairCounts.values()].filter((c) => c > 1).length

    // With greedy rotation and 6 players over 3 rounds (9 partnerships, 15 possible),
    // a good algorithm should produce 0 repeats.
    // We assert < 3 to be forgiving of algorithm variation, but still better than random.
    expect(repeats).toBeLessThan(3)
  })

  it('N=6 round 2: players avoid prior partners', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    // Round 1: fixed partnerships
    const round1: PriorPairing[] = [
      { playerA: 'p1', playerB: 'p2' },
      { playerA: 'p3', playerB: 'p4' },
      { playerA: 'p5', playerB: 'p6' },
    ]
    const result = generateRoundPairings(players, 2, round1, 42)
    const partnerships: string[][] = result.matches.flatMap((m) => [
      [m.team1[0], m.team1[1]],
      [m.team2[0], m.team2[1]],
    ])
    // None of the round 1 pairs should reappear in round 2
    for (const pair of round1) {
      const key = [pair.playerA, pair.playerB].sort().join('|')
      const found = partnerships.some(
        (p) => p.slice().sort().join('|') === key
      )
      expect(found).toBe(false)
    }
  })
})

// ── Suite E: Edge cases ───────────────────────────────────────────────────

describe('E. Edge cases', () => {
  it('N=2: 1 match, no sit-out', () => {
    const players = ['p1', 'p2']
    const result = generateRoundPairings(players, 1, [], 42)
    // With only 2 players we can form one match but need 4 players for doubles.
    // The spec says N=2 → 1 match (edge, noted explicitly in task).
    // This is degenerate doubles: 1 player per team.
    expect(result.matches).toHaveLength(1)
    expect(result.sitOut).toBeNull()
  })

  it('N=3: 1 match + 1 sit-out (edge)', () => {
    const players = ['p1', 'p2', 'p3']
    const result = generateRoundPairings(players, 1, [], 42)
    expect(result.matches).toHaveLength(1)
    expect(result.sitOut).not.toBeNull()
  })

  it('empty priorPairings does not crash', () => {
    const players = ['p1', 'p2', 'p3', 'p4']
    expect(() => generateRoundPairings(players, 1, [], 1)).not.toThrow()
  })
})
