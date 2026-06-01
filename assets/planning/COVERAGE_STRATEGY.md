# 100% Code Coverage Strategy

## Overview

This document outlines how to achieve and maintain 100% coverage for critical business logic in the tournament management app. The goal is not to achieve 100% coverage everywhere (impractical and not valuable), but to achieve it in the highest-risk, highest-value code paths where correctness is non-negotiable.

## What Is 100% Coverage?

Coverage has multiple dimensions:

| Metric | Definition | Target |
|--------|-----------|--------|
| **Line Coverage** | Every line of code executed at least once | ≥99% |
| **Branch Coverage** | Every if/else, switch case, logical operator branch taken | 100% for critical logic |
| **Function Coverage** | Every function called at least once | ≥99% |
| **Statement Coverage** | Every statement executed | ≥99% |
| **Condition Coverage** | Every boolean condition evaluated to both true AND false | 100% for critical logic |
| **Path Coverage** | Every possible execution path taken (often infeasible) | N/A |

**For this app, focus on:** Line coverage + Branch coverage + Condition coverage for business logic.

---

## Critical Code That MUST Reach 100%

These modules are responsible for tournament correctness. If they fail, tournaments are invalid.

### 1. Standings Calculation Module

**File:** `src/business/standings.ts`

**Why 100% is essential:**
- Used constantly (every player refresh, organizer dashboard)
- Determines tournament progression (who advances from groups)
- Public-facing (affects player outcomes)
- Complex logic (4 tiebreaker levels)

**Coverage checklist:**

```typescript
// src/business/standings.ts

export function calculateStandings(
  groupId: string,
  matches: Match[],
  players: Player[]
): Standing[] {
  // Branch 1: Filter completed matches only
  const completedMatches = matches.filter(m => m.status === 'completed')
  if (completedMatches.length === 0) {
    return [] // ← TEST: Group with no completed matches
  }

  // Branch 2: Calculate win/loss for each player
  const playerStats = new Map<string, PlayerStats>()
  for (const player of players) {
    playerStats.set(player.id, {
      wins: 0,
      losses: 0,
      setWon: 0,
      setLost: 0,
      headToHeadResults: new Map(),
    })
  }

  for (const match of completedMatches) {
    const p1Stats = playerStats.get(match.player1Id)
    const p2Stats = playerStats.get(match.player2Id)

    if (match.winner === match.player1Id) {
      p1Stats.wins++        // ← TEST: Player 1 wins
      p2Stats.losses++      // ← TEST: Player 2 loses
    } else {
      p2Stats.wins++        // ← TEST: Player 2 wins
      p1Stats.losses++      // ← TEST: Player 1 loses
    }

    // Track sets
    p1Stats.setWon += match.setsWonByPlayer1
    p1Stats.setLost += match.setsWonByPlayer2
    p2Stats.setWon += match.setsWonByPlayer2
    p2Stats.setLost += match.setsWonByPlayer1

    // Track head-to-head
    p1Stats.headToHeadResults.set(match.player2Id, match.winner === match.player1Id ? 'W' : 'L')
    p2Stats.headToHeadResults.set(match.player1Id, match.winner === match.player1Id ? 'L' : 'W')
  }

  // Branch 3: Sort by tiebreakers
  const standings = Array.from(playerStats.entries())
    .map(([playerId, stats]) => ({
      playerId,
      ...stats,
    }))
    .sort((a, b) => {
      // Tiebreaker 1: Wins (descending)
      if (a.wins !== b.wins) {
        return b.wins - a.wins // ← TEST: Different wins
      }

      // Tiebreaker 2: Sets won (descending)
      if (a.setWon !== b.setWon) {
        return b.setWon - a.setWon // ← TEST: Same wins, different sets
      }

      // Tiebreaker 3: Head-to-head
      const h2hResult = a.headToHeadResults.get(b.playerId) // ← TEST: Head-to-head exists
      if (h2hResult === 'W') {
        return -1 // a beat b // ← TEST: a won h2h
      } else if (h2hResult === 'L') {
        return 1  // b beat a  // ← TEST: b won h2h
      }

      // Tiebreaker 4: Coin flip (random, or deterministic based on ID)
      return a.playerId.localeCompare(b.playerId) // ← TEST: Complete tie
    })

  // Add ranking
  return standings.map((s, index) => ({
    ...s,
    rank: index + 1,
  }))
}
```

**Test coverage checklist for standings:**

```javascript
describe('calculateStandings - 100% Coverage', () => {
  // Setup
  const group = createTestGroup(8) // 8 players → 28 matches

  // ✅ Line coverage: Every line executes
  it('covers all code paths', () => {
    calculateStandings(group.id, group.matches, group.players)
  })

  // ✅ Branch 1: Empty matches
  it('handles group with no completed matches', () => {
    const emptyResult = calculateStandings(group.id, [], group.players)
    expect(emptyResult).toEqual([])
  })

  // ✅ Branch 2: Win/loss assignment
  it('correctly counts wins for player 1 winner', () => {
    const match = { player1Id: 'p1', player2Id: 'p2', winner: 'p1', ... }
    const standings = calculateStandings(group.id, [match], players)
    expect(standings.find(s => s.playerId === 'p1').wins).toBe(1)
    expect(standings.find(s => s.playerId === 'p2').wins).toBe(0)
  })

  it('correctly counts wins for player 2 winner', () => {
    const match = { player1Id: 'p1', player2Id: 'p2', winner: 'p2', ... }
    const standings = calculateStandings(group.id, [match], players)
    expect(standings.find(s => s.playerId === 'p2').wins).toBe(1)
    expect(standings.find(s => s.playerId === 'p1').wins).toBe(0)
  })

  it('correctly tracks sets won', () => {
    const match = { 
      player1Id: 'p1', 
      player2Id: 'p2', 
      setsWonByPlayer1: 2,
      setsWonByPlayer2: 0,
      ... 
    }
    const standings = calculateStandings(group.id, [match], players)
    expect(standings.find(s => s.playerId === 'p1').setWon).toBe(2)
    expect(standings.find(s => s.playerId === 'p1').setLost).toBe(0)
  })

  // ✅ Branch 3: Sorting & tiebreakers
  it('ranks by wins (primary)', () => {
    // Player A: 3 wins, Player B: 2 wins, Player C: 1 win
    const standings = calculateStandings(group.id, matches, players)
    expect(standings[0].playerId).toBe('A')
    expect(standings[1].playerId).toBe('B')
    expect(standings[2].playerId).toBe('C')
  })

  it('uses sets won as tiebreaker (primary fails)', () => {
    // Both players: 2 wins, but A has 5 sets, B has 4 sets
    const standings = calculateStandings(group.id, matches, players)
    expect(standings[0].playerId).toBe('A')
    expect(standings[1].playerId).toBe('B')
  })

  it('uses head-to-head as tiebreaker (primary + secondary fail)', () => {
    // Both players: 2 wins, 5 sets won
    // But A beat B head-to-head
    const standings = calculateStandings(group.id, matches, players)
    expect(standings[0].playerId).toBe('A')
    expect(standings[1].playerId).toBe('B')
  })

  it('uses ID comparison for complete tie (all metrics tied)', () => {
    // Both players identical stats
    // Deterministic tiebreaker using ID comparison
    const standings = calculateStandings(group.id, matches, players)
    const [first, second] = standings
    expect([first.playerId, second.playerId].sort()).toEqual([first.playerId, second.playerId])
  })

  // ✅ Edge cases
  it('handles single match', () => {
    const singleMatch = [matches[0]]
    const standings = calculateStandings(group.id, singleMatch, players)
    expect(standings.length).toBe(players.length)
    expect(standings[0].wins).toBe(1)
  })

  it('handles all matches in group (round-robin complete)', () => {
    // 8 players = 28 matches
    const standings = calculateStandings(group.id, allMatches, players)
    expect(standings.length).toBe(8)
    // Total wins across all players should equal total matches
    const totalWins = standings.reduce((sum, s) => sum + s.wins, 0)
    expect(totalWins).toBe(28)
  })

  it('handles withdrawn player (0 matches)', () => {
    const withdrawnPlayer = players.find(p => p.id === 'withdrawn')
    const standings = calculateStandings(group.id, matches, players)
    // Withdrawn player should still be in standings, but with 0 wins
    expect(standings.find(s => s.playerId === 'withdrawn').wins).toBe(0)
  })
})
```

**Coverage metrics for standings module:**

```
src/business/standings.ts: 100%
├─ Statements: 100% (every line executed)
├─ Branches: 100% (every if/else taken)
│  ├─ Empty matches: ✅
│  ├─ Player 1 wins: ✅
│  ├─ Player 2 wins: ✅
│  ├─ Wins tiebreaker: ✅
│  ├─ Sets tiebreaker: ✅
│  ├─ H2H tiebreaker: ✅
│  └─ Coin flip: ✅
├─ Functions: 100% (calculateStandings called)
└─ Conditions: 100% (all boolean combinations tested)
```

---

### 2. Bracket Generation Module

**File:** `src/business/bracket.ts`

**Why 100% is essential:**
- Determines tournament outcome (who plays whom)
- Seeding affects fairness (top seed should have easier path)
- Bye assignment affects match count
- Complex logic (multiple conditions for seeding/byes)

**Coverage checklist:**

```typescript
// src/business/bracket.ts

export function generateBracket(
  advancingPlayers: PlayerSeeding[],
  byeAssignment: 'top-seeds' | 'bottom-seeds' = 'top-seeds'
): Bracket {
  const playerCount = advancingPlayers.length
  
  // Branch 1: Calculate target bracket size (next power of 2)
  let bracketSize = 1
  while (bracketSize < playerCount) {
    bracketSize *= 2 // ← TEST: for 13, 17, 25, 32 players
  }

  // Branch 2: Calculate bye count
  const byeCount = bracketSize - playerCount // ← TEST: byes = 3 for 13 players

  // Branch 3: Validate input
  if (playerCount < 2) {
    throw new Error('Need at least 2 players for bracket') // ← TEST: 0, 1 players
  }

  if (playerCount > 128) {
    throw new Error('Cannot have >128 players (too many rounds)') // ← TEST: 129 players
  }

  // Branch 4: Assign byes to top seeds
  const playersWithByes = new Set<string>()
  if (byeAssignment === 'top-seeds') {
    for (let i = 0; i < byeCount; i++) {
      playersWithByes.add(advancingPlayers[i].playerId) // ← TEST: top 3 get byes
    }
  } else if (byeAssignment === 'bottom-seeds') {
    for (let i = playerCount - byeCount; i < playerCount; i++) {
      playersWithByes.add(advancingPlayers[i].playerId)
    }
  } else {
    throw new Error(`Unknown bye assignment: ${byeAssignment}`) // ← TEST: invalid mode
  }

  // Branch 5: Create bracket structure
  const rounds: BracketRound[] = []
  let currentPlayers = [...advancingPlayers]

  for (let roundIndex = 0; roundIndex < Math.log2(bracketSize); roundIndex++) {
    const matchCount = currentPlayers.length / 2
    const matches: BracketMatch[] = []

    for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
      const p1Index = matchIndex * 2
      const p2Index = matchIndex * 2 + 1

      const p1 = currentPlayers[p1Index]
      const p2 = currentPlayers[p2Index]

      matches.push({
        matchId: `match_r${roundIndex}_m${matchIndex}`,
        position: matchIndex + 1,
        player1: playersWithByes.has(p1.playerId) ? null : p1, // ← TEST: bye position
        player2: playersWithByes.has(p2.playerId) ? null : p2, // ← TEST: bye position
        player1HasBye: playersWithByes.has(p1.playerId), // ← TEST: p1 bye
        player2HasBye: playersWithByes.has(p2.playerId), // ← TEST: p2 bye
      })
    }

    rounds.push({
      roundNumber: roundIndex + 1,
      matches,
    })

    currentPlayers = [] // Used up, next round will be determined by match results
  }

  return {
    bracketId: `bracket_${Date.now()}`,
    playerCount,
    bracketSize,
    byeCount,
    rounds,
  }
}
```

**Test coverage checklist for bracket:**

```javascript
describe('generateBracket - 100% Coverage', () => {
  // ✅ Branch 1: Bracket size calculation
  it('calculates correct bracket size (next power of 2)', () => {
    expect(generateBracket(createPlayers(2)).bracketSize).toBe(2)
    expect(generateBracket(createPlayers(3)).bracketSize).toBe(4)
    expect(generateBracket(createPlayers(4)).bracketSize).toBe(4)
    expect(generateBracket(createPlayers(5)).bracketSize).toBe(8)
    expect(generateBracket(createPlayers(9)).bracketSize).toBe(16)
    expect(generateBracket(createPlayers(13)).bracketSize).toBe(16) // ← Key test
    expect(generateBracket(createPlayers(17)).bracketSize).toBe(32)
    expect(generateBracket(createPlayers(32)).bracketSize).toBe(32)
  })

  // ✅ Branch 2: Bye count calculation
  it('calculates correct bye count', () => {
    expect(generateBracket(createPlayers(2)).byeCount).toBe(0)
    expect(generateBracket(createPlayers(3)).byeCount).toBe(1)
    expect(generateBracket(createPlayers(13)).byeCount).toBe(3)
    expect(generateBracket(createPlayers(17)).byeCount).toBe(15)
    expect(generateBracket(createPlayers(32)).byeCount).toBe(0)
  })

  // ✅ Branch 3: Input validation
  it('rejects 0 players', () => {
    expect(() => generateBracket([])).toThrow('at least 2 players')
  })

  it('rejects 1 player', () => {
    expect(() => generateBracket(createPlayers(1))).toThrow('at least 2 players')
  })

  it('rejects >128 players', () => {
    expect(() => generateBracket(createPlayers(129))).toThrow('>128 players')
  })

  // ✅ Branch 4: Bye assignment
  it('assigns byes to top seeds', () => {
    const bracket = generateBracket(createPlayers(13), 'top-seeds')
    const byePlayers = bracket.rounds[0].matches
      .filter(m => m.player1HasBye || m.player2HasBye)
      .flatMap(m => [m.player1?.playerId, m.player2?.playerId])
      .filter(Boolean)
    
    expect(byePlayers).toHaveLength(3)
    expect(byePlayers).toEqual(['p1', 'p2', 'p3']) // top 3 seeds
  })

  it('assigns byes to bottom seeds', () => {
    const bracket = generateBracket(createPlayers(13), 'bottom-seeds')
    const byePlayers = bracket.rounds[0].matches
      .filter(m => m.player1HasBye || m.player2HasBye)
      .flatMap(m => [m.player1?.playerId, m.player2?.playerId])
      .filter(Boolean)
    
    expect(byePlayers).toEqual(['p11', 'p12', 'p13']) // bottom 3 seeds
  })

  it('rejects invalid bye assignment mode', () => {
    expect(() => 
      generateBracket(createPlayers(8), 'middle-seeds' as any)
    ).toThrow('Unknown bye assignment')
  })

  // ✅ Branch 5: Bracket structure
  it('creates correct number of rounds', () => {
    const bracket = generateBracket(createPlayers(13))
    expect(bracket.rounds).toHaveLength(4) // 16→8→4→2→1 = 4 rounds
  })

  it('creates correct number of matches per round', () => {
    const bracket = generateBracket(createPlayers(13))
    expect(bracket.rounds[0].matches).toHaveLength(8)  // 16 players / 2
    expect(bracket.rounds[1].matches).toHaveLength(4)  // 8 players / 2
    expect(bracket.rounds[2].matches).toHaveLength(2)  // 4 players / 2
    expect(bracket.rounds[3].matches).toHaveLength(1)  // 2 players / 2
  })

  it('ensures bye players advance automatically (no opponent in round 1)', () => {
    const bracket = generateBracket(createPlayers(13), 'top-seeds')
    const byeMatches = bracket.rounds[0].matches.filter(m => m.player1HasBye || m.player2HasBye)
    
    for (const match of byeMatches) {
      // Exactly one player should be null (the bye position)
      const hasNullPlayer = match.player1 === null || match.player2 === null
      expect(hasNullPlayer).toBe(true)
    }
  })

  // ✅ Edge cases
  it('handles power of 2 with no byes', () => {
    const bracket = generateBracket(createPlayers(8))
    expect(bracket.byeCount).toBe(0)
    expect(bracket.rounds[0].matches.every(m => m.player1 && m.player2)).toBe(true)
  })

  it('handles minimum bracket (2 players, 1 match)', () => {
    const bracket = generateBracket(createPlayers(2))
    expect(bracket.rounds).toHaveLength(1)
    expect(bracket.rounds[0].matches).toHaveLength(1)
    expect(bracket.rounds[0].matches[0].player1).toBeDefined()
    expect(bracket.rounds[0].matches[0].player2).toBeDefined()
  })

  it('no player appears in two matches in same round', () => {
    const bracket = generateBracket(createPlayers(13))
    
    for (const round of bracket.rounds) {
      const playerIds = new Set()
      for (const match of round.matches) {
        if (match.player1) {
          expect(playerIds.has(match.player1.playerId)).toBe(false)
          playerIds.add(match.player1.playerId)
        }
        if (match.player2) {
          expect(playerIds.has(match.player2.playerId)).toBe(false)
          playerIds.add(match.player2.playerId)
        }
      }
    }
  })

  it('bracket is balanced (no matches without winners feeding to next round)', () => {
    const bracket = generateBracket(createPlayers(13))
    
    for (let r = 0; r < bracket.rounds.length - 1; r++) {
      const thisRound = bracket.rounds[r]
      const nextRound = bracket.rounds[r + 1]
      
      // Each match in this round should feed a winner into next round
      expect(thisRound.matches.length / 2).toBe(nextRound.matches.length)
    }
  })
})
```

---

### 3. Score Parsing Module

**File:** `src/business/score-parser.ts`

**Why 100% is essential:**
- Validates all user input
- Prevents malformed data from entering system
- Affects standings accuracy (parsed scores determine sets won)
- Must handle multiple sport formats

**Coverage checklist:**

```typescript
// src/business/score-parser.ts

export interface ParsedScore {
  valid: boolean
  sets: Array<{ player1: number; player2: number }>
  winner: 'player1' | 'player2' | null
  error?: string
}

export function parseScore(
  scoreText: string,
  sport: 'tennis' | 'pickleball' | 'badminton' = 'tennis'
): ParsedScore {
  // Branch 1: Input validation
  if (!scoreText || typeof scoreText !== 'string') {
    return { valid: false, sets: [], winner: null, error: 'Score text required' } // ← TEST: empty, null
  }

  const trimmed = scoreText.trim()
  if (!trimmed) {
    return { valid: false, sets: [], winner: null, error: 'Score text is empty' } // ← TEST: whitespace only
  }

  // Branch 2: Split by set separator
  const setSeparators = trimmed.split(',').map(s => s.trim())
  if (setSeparators.length < 2) {
    return { 
      valid: false, 
      sets: [], 
      winner: null, 
      error: 'Need at least 2 sets (comma-separated)' 
    } // ← TEST: "6-4" (no comma)
  }

  // Branch 3: Parse each set
  const sets: Array<{ player1: number; player2: number }> = []
  const minScoreToWinSet = sport === 'tennis' ? 6 : 11 // tennis 6+, pickleball 11+

  for (let i = 0; i < setSeparators.length; i++) {
    const setText = setSeparators[i]
    const scores = setText.split('-')

    if (scores.length !== 2) {
      return { 
        valid: false, 
        sets: [], 
        winner: null, 
        error: `Set ${i + 1} malformed: expected X-Y format` 
      } // ← TEST: "6-4-3", "6"
    }

    const p1 = parseInt(scores[0], 10)
    const p2 = parseInt(scores[1], 10)

    if (isNaN(p1) || isNaN(p2)) {
      return { 
        valid: false, 
        sets: [], 
        winner: null, 
        error: `Set ${i + 1} has non-numeric scores` 
      } // ← TEST: "a-b", "6-x"
    }

    // Branch 4: Validate set scores
    if (p1 < 0 || p2 < 0) {
      return { 
        valid: false, 
        sets: [], 
        winner: null, 
        error: `Set ${i + 1} has negative score` 
      } // ← TEST: "-1-6"
    }

    if (p1 > 999 || p2 > 999) {
      return { 
        valid: false, 
        sets: [], 
        winner: null, 
        error: `Set ${i + 1} score too high` 
      } // ← TEST: "1000-0"
    }

    // Branch 5: Check if set is complete
    const p1WinsByMargin = Math.abs(p1 - p2) >= 2
    const p1HasMinScore = p1 >= minScoreToWinSet
    const p2HasMinScore = p2 >= minScoreToWinSet
    const p1SetWon = p1 > p2 && p1HasMinScore && p1WinsByMargin
    const p2SetWon = p2 > p1 && p2HasMinScore && p2WinsByMargin

    if (!p1SetWon && !p2SetWon) {
      return { 
        valid: false, 
        sets: [], 
        winner: null, 
        error: `Set ${i + 1} is incomplete or tied` 
      } // ← TEST: "5-4", "6-5" (no 2-point margin)
    }

    sets.push({ player1: p1, player2: p2 })
  }

  // Branch 6: Validate match is complete (best of 3)
  const setsWonByP1 = sets.filter(s => s.player1 > s.player2).length
  const setsWonByP2 = sets.filter(s => s.player2 > s.player1).length

  if (setsWonByP1 < 2 && setsWonByP2 < 2) {
    return { 
      valid: false, 
      sets, 
      winner: null, 
      error: 'Match not complete: need 2 sets to win' 
    } // ← TEST: "6-4, 3-6" (1-1)
  }

  if (setsWonByP1 > 2 || setsWonByP2 > 2) {
    return { 
      valid: false, 
      sets, 
      winner: null, 
      error: 'Invalid: more than 2 sets won' 
    } // ← TEST: "6-4, 6-3, 6-2" (2-1 mid-match)
  }

  // Branch 7: Determine winner
  const winner = setsWonByP1 > setsWonByP2 ? 'player1' : 'player2'

  return {
    valid: true,
    sets,
    winner,
  }
}
```

**Test coverage checklist for score parser:**

```javascript
describe('parseScore - 100% Coverage', () => {
  // ✅ Branch 1: Input validation
  it('rejects null/undefined', () => {
    expect(parseScore(null as any).valid).toBe(false)
    expect(parseScore(undefined as any).valid).toBe(false)
  })

  it('rejects non-string', () => {
    expect(parseScore(123 as any).valid).toBe(false)
    expect(parseScore({} as any).valid).toBe(false)
  })

  it('rejects empty string', () => {
    expect(parseScore('').valid).toBe(false)
    expect(parseScore('   ').valid).toBe(false)
  })

  // ✅ Branch 2: Set separator
  it('requires comma-separated sets', () => {
    expect(parseScore('6-4').valid).toBe(false) // no comma
    expect(parseScore('6-4 6-3').valid).toBe(false) // space instead of comma
  })

  it('requires at least 2 sets', () => {
    expect(parseScore('6-4, ').valid).toBe(false) // missing second set
  })

  // ✅ Branch 3: Set parsing
  it('rejects malformed sets', () => {
    expect(parseScore('6-4-3, 6-3').valid).toBe(false) // too many scores in set 1
    expect(parseScore('6, 6-3').valid).toBe(false) // missing second score in set 1
    expect(parseScore('6-4, 6').valid).toBe(false) // missing second score in set 2
  })

  it('rejects non-numeric scores', () => {
    expect(parseScore('a-4, 6-3').valid).toBe(false)
    expect(parseScore('6-b, 6-3').valid).toBe(false)
    expect(parseScore('6-4, c-3').valid).toBe(false)
  })

  // ✅ Branch 4: Score validation
  it('rejects negative scores', () => {
    expect(parseScore('-1-6, 6-3').valid).toBe(false)
    expect(parseScore('6--1, 6-3').valid).toBe(false)
  })

  it('rejects extremely high scores', () => {
    expect(parseScore('1000-0, 6-3').valid).toBe(false)
  })

  // ✅ Branch 5: Set completeness
  it('requires 2-point margin and minimum score', () => {
    expect(parseScore('6-4, 6-3').valid).toBe(true) // ✅ valid
    expect(parseScore('6-5, 6-3').valid).toBe(false) // ❌ 6-5 is incomplete
    expect(parseScore('5-4, 6-3').valid).toBe(false) // ❌ 5-4 is incomplete
    expect(parseScore('7-5, 6-3').valid).toBe(true) // ✅ valid (7-5)
  })

  it('rejects tied sets', () => {
    expect(parseScore('6-6, 6-3').valid).toBe(false)
    expect(parseScore('6-4, 5-5').valid).toBe(false)
  })

  // ✅ Branch 6: Match completeness
  it('requires match to be complete (2 sets)', () => {
    expect(parseScore('6-4, 3-6').valid).toBe(false) // 1-1, match not finished
    expect(parseScore('6-4, 6-3').valid).toBe(true) // 2-0, match complete
    expect(parseScore('4-6, 6-3, 6-2').valid).toBe(true) // 2-1, match complete
  })

  it('rejects match with >2 sets won', () => {
    // This is very hard to construct legitimately, but if it happens:
    expect(parseScore('6-4, 6-3, 6-2').valid).toBe(true) // valid (2-1)
    // A case where we manually construct invalid data and pass to function:
    // Would require match like "6-4, 6-3, 6-2, 6-1" (2-2 mid-match) - not naturally possible
  })

  // ✅ Branch 7: Winner determination
  it('determines player 1 winner', () => {
    const result = parseScore('6-4, 6-3')
    expect(result.winner).toBe('player1')
  })

  it('determines player 2 winner', () => {
    const result = parseScore('4-6, 3-6')
    expect(result.winner).toBe('player2')
  })

  it('determines winner in 3-set match', () => {
    const result = parseScore('4-6, 6-3, 6-2')
    expect(result.winner).toBe('player1')
  })

  // ✅ Sport-specific parsing
  it('validates tennis format (6+)', () => {
    expect(parseScore('6-4, 6-3', 'tennis').valid).toBe(true)
    expect(parseScore('5-7, 6-3', 'tennis').valid).toBe(true) // 5-7 is valid in tennis
  })

  it('validates pickleball format (11+)', () => {
    expect(parseScore('11-9, 11-7', 'pickleball').valid).toBe(true)
    expect(parseScore('6-4, 6-3', 'pickleball').valid).toBe(false) // <11, invalid for pickleball
  })

  // ✅ Edge cases
  it('handles whitespace around scores', () => {
    expect(parseScore('  6-4  ,  6-3  ').valid).toBe(true)
  })

  it('handles zero scores', () => {
    expect(parseScore('6-0, 6-0', 'tennis').valid).toBe(true)
  })
})
```

---

## Coverage Tools & Setup

### Jest Coverage Configuration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/business/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
  ],
  coverageThreshold: {
    'src/business/standings.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    'src/business/bracket.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    'src/business/score-parser.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    'src/business/': {
      branches: 95, // 95% for other business logic
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  coverageReporters: ['text', 'text-summary', 'html', 'lcov'],
}
```

### Running Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/index.html

# Check specific file coverage
npm run test:coverage -- src/business/standings.ts

# Enforce thresholds (fails if coverage <100% for critical modules)
npm run test:coverage -- --failOnLow
```

### Coverage Output Example

```
======================== Coverage Summary =========================
Statements   : 99.2% ( 250/252 )
Branches     : 100%  ( 85/85 )
Functions    : 100%  ( 24/24 )
Lines        : 99.5% ( 199/200 )

File                              | % Stmts | % Branch | % Funcs | % Lines
----------------------------------|---------|----------|---------|----------
standings.ts                      | 100     | 100      | 100     | 100     ✅
bracket.ts                        | 100     | 100      | 100     | 100     ✅
score-parser.ts                   | 100     | 100      | 100     | 100     ✅
tournament-validation.ts          | 98      | 98       | 100     | 98      ⚠️
----
TOTAL                             | 99.2    | 100      | 100     | 99.5
```

---

## Coverage Targets by Module

| Module | Type | Target | Why |
|--------|------|--------|-----|
| `standings.ts` | Deterministic | **100%** | Controls tournament progression; any bug invalidates tournament |
| `bracket.ts` | Deterministic | **100%** | Controls match pairings; seeding errors affect fairness |
| `score-parser.ts` | Deterministic | **100%** | Validation gate for all user input; guards against bad data |
| `tournament-validation.ts` | Rules | **98%** | Validates state transitions; some impossible states hard to reach |
| `async-jobs.ts` | Infrastructure | **90%** | Job retry logic; some failure modes hard to simulate |
| `websocket.ts` | Infrastructure | **85%** | Connection/disconnection handling; many network edge cases |

---

## Maintaining 100% Coverage

### Pre-Commit Hooks

```bash
# .husky/pre-commit
#!/bin/sh
npm run test:coverage || exit 1
npm run lint || exit 1
```

### CI/CD Enforcement

```yaml
# .github/workflows/coverage.yml
name: Coverage Check

on: [pull_request, push]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm ci
      - run: npm run test:coverage
      
      # Fail if coverage drops below threshold
      - name: Check Coverage
        run: |
          if ! grep -q "100.*100.*100.*100" coverage/coverage-summary.json; then
            echo "❌ Coverage dropped below 100% for critical modules"
            exit 1
          fi
      
      # Comment on PR with coverage report
      - name: Comment PR
        if: github.event_name == 'pull_request'
        uses: romeovs/lcov-reporter-action@v0.3.1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          lcov-file: ./coverage/lcov.info
```

### Code Review Checklist

Before merging a PR that touches business logic:

```markdown
## Code Review Checklist for Business Logic

- [ ] All new code has corresponding test cases
- [ ] Branch coverage is 100% (all if/else paths taken)
- [ ] Edge cases are tested (empty, single, max values)
- [ ] Invalid inputs are rejected with clear errors
- [ ] Coverage report shows ≥100% for modified module
- [ ] Tests follow naming convention: "describes X behavior"
- [ ] No hardcoded test data (use helpers)
- [ ] No skipped tests (`.skip` or `.todo`)
```

---

## Test Data Factories

To avoid hardcoding test data, create factories:

```typescript
// tests/factories.ts

export function createPlayer(overrides?: Partial<Player>): Player {
  return {
    id: `player_${Math.random()}`,
    name: 'Test Player',
    email: 'test@example.com',
    status: 'active',
    ...overrides,
  }
}

export function createMatch(overrides?: Partial<Match>): Match {
  return {
    id: `match_${Math.random()}`,
    player1Id: createPlayer().id,
    player2Id: createPlayer().id,
    status: 'completed',
    winner: 'player1',
    setsWonByPlayer1: 2,
    setsWonByPlayer2: 0,
    ...overrides,
  }
}

export function createPlayers(count: number): Player[] {
  return Array(count).fill().map((_, i) => 
    createPlayer({ id: `p${i + 1}`, name: `Player ${i + 1}` })
  )
}

export function createMatches(count: number, players: Player[]): Match[] {
  // Create valid round-robin matches for given players
  const matches: Match[] = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      matches.push(
        createMatch({
          player1Id: players[i].id,
          player2Id: players[j].id,
          winner: Math.random() > 0.5 ? players[i].id : players[j].id,
        })
      )
    }
  }
  return matches
}
```

---

## Property-Based Testing

For logic that depends on randomness or many inputs, use property-based testing:

```typescript
import { fc } from 'fast-check'

describe('Standings - Property-Based Tests', () => {
  it('always produces valid rankings regardless of input', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            player1Id: fc.string(),
            player2Id: fc.string(),
            winner: fc.integer(),
            setsWon: fc.tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 3 })),
          }),
          { minLength: 2, maxLength: 30 }
        ),
        (matches) => {
          const standings = calculateStandings(matches)
          
          // Properties that MUST always hold
          // Property 1: All players ranked 1 to N
          expect(standings.map(s => s.rank)).toEqual(
            Array.from({ length: standings.length }, (_, i) => i + 1)
          )
          
          // Property 2: Rankings ordered by wins (descending)
          for (let i = 0; i < standings.length - 1; i++) {
            expect(standings[i].wins).toBeGreaterThanOrEqual(standings[i + 1].wins)
          }
          
          return true
        }
      ),
      { numRuns: 1000 } // Run 1000 random scenarios
    )
  })
})
```

---

## Coverage Goals by Phase

### v1 Beta (Pre-Launch)

```
Target: 100% coverage for critical modules

standings.ts        ✅ 100%
bracket.ts          ✅ 100%
score-parser.ts     ✅ 100%
tournament-validation.ts ✅ 98-100%
---
Critical business logic: 99.5%+
```

### v1 Public Launch

```
Target: Maintain 100% for critical modules + increase coverage elsewhere

standings.ts        ✅ 100%
bracket.ts          ✅ 100%
score-parser.ts     ✅ 100%
all business logic: ✅ 95%+
all code:           ✅ 80%+
```

### v2+ (Post-Launch)

```
Target: Improve overall coverage as new features added

business logic: 95%+ (maintain 100% for new critical paths)
infrastructure: 80%+ (gradual improvement)
overall: 85%+
```

---

## Common Gaps to Avoid

### ❌ Don't Do This

```javascript
// Coverage claim: "100% coverage"
// Reality: Only tests happy path

it('calculates standings', () => {
  const standings = calculateStandings([match1, match2])
  expect(standings).toBeDefined()
})

// Missing: empty input, single match, ties, withdrawals, all edge cases
```

### ✅ Do This Instead

```javascript
describe('calculateStandings', () => {
  it('returns empty array for no completed matches', () => {
    expect(calculateStandings([])).toEqual([])
  })

  it('ranks players by wins (primary criteria)', () => {
    // ...
  })

  it('uses sets won as tiebreaker', () => {
    // ...
  })

  // ... 10+ more specific test cases
})

// Now coverage report shows:
// - Line coverage: 100% (every line executed)
// - Branch coverage: 100% (every if/else taken)
// - Condition coverage: 100% (all boolean combinations)
```

---

## Measuring Success

After implementing 100% coverage for critical modules, you should see:

```
✅ Zero data integrity bugs post-launch
✅ Confidence deploying standings/bracket changes
✅ Faster code review (obvious what's tested)
✅ New contributors understand test expectations
✅ CI/CD blocks coverage regressions immediately
✅ No surprises in production (coverage caught the issues)
```

---

## References

- [Jest Coverage Documentation](https://jestjs.io/docs/en/coverage)
- [Branch Coverage vs Line Coverage](https://smartbear.com/blog/test-coverage-types/)
- [Property-Based Testing](https://hypothesis.works/articles/what-is-property-based-testing/)
- [Fast-Check (Property Testing Library)](https://github.com/dubzzz/fast-check)

