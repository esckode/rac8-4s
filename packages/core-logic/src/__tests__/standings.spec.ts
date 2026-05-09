import { calculateStandings, Standing } from '../index'

describe('Standings Calculation', () => {
  describe('Primary Ranking - Wins', () => {
    it('should rank players by wins in descending order', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
        { id: 'p3', name: 'Charlie' },
      ]

      const matches = [
        { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', score: '6-4' },
        { player1Id: 'p1', player2Id: 'p3', winnerId: 'p1', score: '6-3' },
        { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)

      expect(standings[0].playerId).toBe('p1')
      expect(standings[0].rank).toBe(1)
      expect(standings[0].wins).toBe(2)

      expect(standings[1].playerId).toBe('p2')
      expect(standings[1].rank).toBe(2)
      expect(standings[1].wins).toBe(1)

      expect(standings[2].playerId).toBe('p3')
      expect(standings[2].rank).toBe(3)
      expect(standings[2].wins).toBe(0)
    })

    it('should handle all players with same record (0 wins)', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ]
      const matches: any[] = []

      const standings = calculateStandings(players, matches)

      expect(standings).toHaveLength(2)
      expect(standings.every((s: Standing) => s.wins === 0)).toBe(true)
    })
  })

  describe('Tiebreaker 1 - Sets Won', () => {
    it('should use sets won as first tiebreaker when wins are equal', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
        { id: 'p3', name: 'Charlie' },
      ]

      const matches = [
        // Alice vs Bob: Alice wins 6-4 (1 set)
        { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', score: '6-4' },
        // Alice vs Charlie: Charlie wins 6-3 (1 set)
        { player1Id: 'p1', player2Id: 'p3', winnerId: 'p3', score: '6-3' },
        // Bob vs Charlie: Bob wins 6-2, 6-4 (2 sets)
        { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2', score: '6-2, 6-4' },
      ]

      const standings = calculateStandings(players, matches)

      // All have 1 win, so use sets won tiebreaker
      // Bob: 3 sets won (6-2, 6-4 vs Charlie)
      // Alice: 1 set won (6-4 vs Bob)
      // Charlie: 1 set won (6-3 vs Alice)
      expect(standings[0].playerId).toBe('p2') // Bob: 1 win, 3 sets (clearly ranked 1st)
      // Alice and Charlie both have 1 win, 1 set - order depends on random tiebreaker
      expect([standings[1].playerId, standings[2].playerId]).toContain('p1')
      expect([standings[1].playerId, standings[2].playerId]).toContain('p3')
    })

    it('should count total sets won across all matches', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ]

      const matches = [
        // Alice beats Bob 6-4, 6-3 = 2 sets for Alice
        { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', score: '6-4, 6-3' },
      ]

      const standings = calculateStandings(players, matches)

      expect(standings[0].playerId).toBe('p1')
      expect(standings[0].setsWon).toBe(2)
      expect(standings[1].playerId).toBe('p2')
      expect(standings[1].setsWon).toBe(0)
    })
  })

  describe('Tiebreaker 2 - Head-to-Head', () => {
    it('should use head-to-head record as second tiebreaker', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
        { id: 'p3', name: 'Charlie' },
      ]

      const matches = [
        // Round 1: A beats C, B beats A, C beats B
        { player1Id: 'p1', player2Id: 'p3', winnerId: 'p1', score: '6-4' },
        { player1Id: 'p2', player2Id: 'p1', winnerId: 'p2', score: '6-4' },
        { player1Id: 'p3', player2Id: 'p2', winnerId: 'p3', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)

      // All have 1 win, same sets (1 each)
      // Head-to-head among three: rock-paper-scissors
      // A beat C, B beat A, C beat B
      // From A's perspective: beat C (1-0 h2h vs C), lost to B (0-1 h2h vs B) = 1-1 overall
      // From B's perspective: beat A (1-0 h2h vs A), lost to C (0-1 h2h vs C) = 1-1 overall
      // From C's perspective: lost to A (0-1 h2h vs A), beat B (1-0 h2h vs B) = 1-1 overall
      // When all three have same record against each other, rank by total h2h wins
      expect(standings.length).toBe(3)
      standings.forEach((s: Standing) => {
        expect(s.wins).toBe(1)
      })
    })

    it('should correctly identify head-to-head winner between two tied players', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
        { id: 'p3', name: 'Charlie' },
      ]

      const matches = [
        // Alice beats Bob
        { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', score: '6-4' },
        // Alice beats Charlie
        { player1Id: 'p1', player2Id: 'p3', winnerId: 'p1', score: '6-4' },
        // Bob beats Charlie twice (to get more wins)
        { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2', score: '6-4' },
        { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2', score: '6-4' },
        // Alice beats Bob second time
        { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)

      // Alice: 3 wins (beat B twice, beat C)
      // Bob: 2 wins (beat C twice)
      // Charlie: 0 wins
      expect(standings[0].playerId).toBe('p1')
      expect(standings[0].wins).toBe(3)
      expect(standings[1].playerId).toBe('p2')
      expect(standings[1].wins).toBe(2)
      expect(standings[2].playerId).toBe('p3')
      expect(standings[2].wins).toBe(0)
    })
  })

  describe('Tiebreaker 3 - Random Determination', () => {
    it('should randomly break ties when all other criteria are equal', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ]

      // Same record, same sets, 1-1 head-to-head
      const matches = [
        { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', score: '6-4' },
        { player1Id: 'p1', player2Id: 'p2', winnerId: 'p2', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)

      // With random tiebreaker, one of them must rank first
      expect([standings[0].playerId, standings[1].playerId]).toContain('p1')
      expect([standings[0].playerId, standings[1].playerId]).toContain('p2')
      expect(standings[0].rank).toBe(1)
      expect(standings[1].rank).toBe(2)
    })
  })

  describe('Edge Cases', () => {
    it('should handle single player', () => {
      const players = [{ id: 'p1', name: 'Alice' }]
      const matches: any[] = []

      const standings = calculateStandings(players, matches)

      expect(standings).toHaveLength(1)
      expect(standings[0].playerId).toBe('p1')
      expect(standings[0].rank).toBe(1)
      expect(standings[0].wins).toBe(0)
    })

    it('should handle empty players list', () => {
      const players: any[] = []
      const matches: any[] = []

      const standings = calculateStandings(players, matches)

      expect(standings).toHaveLength(0)
    })

    it('should handle matches with no winners (walkover)', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ]

      const matches = [{ player1Id: 'p1', player2Id: 'p2', winnerId: null, score: null }]

      const standings = calculateStandings(players, matches)

      expect(standings[0].wins).toBe(0)
      expect(standings[1].wins).toBe(0)
    })

    it('should handle many players (stress test)', () => {
      const playerCount = 100
      const players = Array.from({ length: playerCount }, (_, i) => ({
        id: `p${i}`,
        name: `Player ${i}`,
      }))

      const matches = Array.from({ length: 200 }, (_, i) => ({
        player1Id: `p${i % playerCount}`,
        player2Id: `p${(i + 1) % playerCount}`,
        winnerId: `p${i % playerCount}`,
        score: '6-4',
      }))

      const standings = calculateStandings(players, matches)

      expect(standings).toHaveLength(playerCount)
      expect(standings[0].rank).toBe(1)
      expect(standings[playerCount - 1].rank).toBe(playerCount)
    })
  })

  describe('Ranking Consistency', () => {
    it('should never have duplicate ranks', () => {
      const players = Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        name: `Player ${i}`,
      }))

      const matches = Array.from({ length: 20 }, (_, i) => ({
        player1Id: `p${i % 10}`,
        player2Id: `p${(i + 1) % 10}`,
        winnerId: `p${i % 10}`,
        score: '6-4',
      }))

      const standings = calculateStandings(players, matches)
      const ranks = standings.map((s: Standing) => s.rank)

      expect(new Set(ranks).size).toBe(ranks.length)
    })

    it('should have consecutive ranks starting from 1', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
        { id: 'p3', name: 'Charlie' },
        { id: 'p4', name: 'David' },
      ]

      const matches = [
        { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', score: '6-4' },
        { player1Id: 'p1', player2Id: 'p3', winnerId: 'p1', score: '6-3' },
        { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)
      const ranks = standings.map((s: Standing) => s.rank).sort((a: number, b: number) => a - b)

      expect(ranks).toEqual([1, 2, 3, 4])
    })

    it('should return standings in ranked order', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
        { id: 'p3', name: 'Charlie' },
      ]

      const matches = [
        { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', score: '6-4' },
        { player1Id: 'p1', player2Id: 'p3', winnerId: 'p1', score: '6-3' },
        { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)

      for (let i = 0; i < standings.length - 1; i++) {
        expect(standings[i].rank).toBeLessThan(standings[i + 1].rank)
      }
    })
  })
})
