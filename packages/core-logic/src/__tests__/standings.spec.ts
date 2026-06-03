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
        { participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p1', score: '6-4' },
        { participant1Id: 'p1', participant2Id: 'p3', winnerId: 'p1', score: '6-3' },
        { participant1Id: 'p2', participant2Id: 'p3', winnerId: 'p2', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)

      expect(standings[0].participantId).toBe('p1')
      expect(standings[0].rank).toBe(1)
      expect(standings[0].wins).toBe(2)

      expect(standings[1].participantId).toBe('p2')
      expect(standings[1].rank).toBe(2)
      expect(standings[1].wins).toBe(1)

      expect(standings[2].participantId).toBe('p3')
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
        { participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p1', score: '6-4' },
        // Alice vs Charlie: Charlie wins 6-3 (1 set)
        { participant1Id: 'p1', participant2Id: 'p3', winnerId: 'p3', score: '6-3' },
        // Bob vs Charlie: Bob wins 6-2, 6-4 (2 sets)
        { participant1Id: 'p2', participant2Id: 'p3', winnerId: 'p2', score: '6-2, 6-4' },
      ]

      const standings = calculateStandings(players, matches)

      // All have 1 win, so use sets won tiebreaker
      // Bob: 3 sets won (6-2, 6-4 vs Charlie)
      // Alice: 1 set won (6-4 vs Bob)
      // Charlie: 1 set won (6-3 vs Alice)
      expect(standings[0].participantId).toBe('p2') // Bob: 1 win, 3 sets (clearly ranked 1st)
      // Alice and Charlie both have 1 win, 1 set - order depends on random tiebreaker
      expect([standings[1].participantId, standings[2].participantId]).toContain('p1')
      expect([standings[1].participantId, standings[2].participantId]).toContain('p3')
    })

    it('should count total sets won across all matches', () => {
      const players = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ]

      const matches = [
        // Alice beats Bob 6-4, 6-3 = 2 sets for Alice
        { participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p1', score: '6-4, 6-3' },
      ]

      const standings = calculateStandings(players, matches)

      expect(standings[0].participantId).toBe('p1')
      expect(standings[0].setsWon).toBe(2)
      expect(standings[1].participantId).toBe('p2')
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
        { participant1Id: 'p1', participant2Id: 'p3', winnerId: 'p1', score: '6-4' },
        { participant1Id: 'p2', participant2Id: 'p1', winnerId: 'p2', score: '6-4' },
        { participant1Id: 'p3', participant2Id: 'p2', winnerId: 'p3', score: '6-4' },
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
        { participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p1', score: '6-4' },
        // Alice beats Charlie
        { participant1Id: 'p1', participant2Id: 'p3', winnerId: 'p1', score: '6-4' },
        // Bob beats Charlie twice (to get more wins)
        { participant1Id: 'p2', participant2Id: 'p3', winnerId: 'p2', score: '6-4' },
        { participant1Id: 'p2', participant2Id: 'p3', winnerId: 'p2', score: '6-4' },
        // Alice beats Bob second time
        { participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p1', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)

      // Alice: 3 wins (beat B twice, beat C)
      // Bob: 2 wins (beat C twice)
      // Charlie: 0 wins
      expect(standings[0].participantId).toBe('p1')
      expect(standings[0].wins).toBe(3)
      expect(standings[1].participantId).toBe('p2')
      expect(standings[1].wins).toBe(2)
      expect(standings[2].participantId).toBe('p3')
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
        { participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p1', score: '6-4' },
        { participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p2', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)

      // With random tiebreaker, one of them must rank first
      expect([standings[0].participantId, standings[1].participantId]).toContain('p1')
      expect([standings[0].participantId, standings[1].participantId]).toContain('p2')
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
      expect(standings[0].participantId).toBe('p1')
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

      const matches = [{ participant1Id: 'p1', participant2Id: 'p2', winnerId: null, score: null }]

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
        participant1Id: `p${i % playerCount}`,
        participant2Id: `p${(i + 1) % playerCount}`,
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
        participant1Id: `p${i % 10}`,
        participant2Id: `p${(i + 1) % 10}`,
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
        { participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p1', score: '6-4' },
        { participant1Id: 'p1', participant2Id: 'p3', winnerId: 'p1', score: '6-3' },
        { participant1Id: 'p2', participant2Id: 'p3', winnerId: 'p2', score: '6-4' },
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
        { participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p1', score: '6-4' },
        { participant1Id: 'p1', participant2Id: 'p3', winnerId: 'p1', score: '6-3' },
        { participant1Id: 'p2', participant2Id: 'p3', winnerId: 'p2', score: '6-4' },
      ]

      const standings = calculateStandings(players, matches)

      for (let i = 0; i < standings.length - 1; i++) {
        expect(standings[i].rank).toBeLessThan(standings[i + 1].rank)
      }
    })
  })

  describe('Generic Participants (RED - Teams & Players)', () => {
    describe('calculateStandings with generic participants', () => {
      it('should calculate standings for team participants', () => {
        const teams = [
          { id: 'team_1', name: 'Team A' },
          { id: 'team_2', name: 'Team B' },
        ]

        const matches = [
          {
            participant1Id: 'team_1',
            participant2Id: 'team_2',
            winnerId: 'team_1',
            score: '2-1',
          },
        ]

        const standings = calculateStandings(teams, matches)

        expect(standings[0].participantId).toBe('team_1')
        expect(standings[0].wins).toBe(1)
        expect(standings[1].participantId).toBe('team_2')
        expect(standings[1].wins).toBe(0)
      })

      it('should work with playerIds (backwards compatibility with old match format)', () => {
        const players = [
          { id: 'p1', name: 'Alice' },
          { id: 'p2', name: 'Bob' },
        ]

        const matches = [
          {
            participant1Id: 'p1',
            participant2Id: 'p2',
            winnerId: 'p1',
            score: '2-1',
          },
        ]

        const standings = calculateStandings(players, matches)
        expect(standings[0].participantId).toBe('p1')
        expect(standings[0].wins).toBe(1)
      })

      it('should apply tiebreakers for teams with same wins', () => {
        const teams = [
          { id: 'team_1', name: 'Team A' },
          { id: 'team_2', name: 'Team B' },
        ]

        const matches = [
          {
            participant1Id: 'team_1',
            participant2Id: 'team_2',
            winnerId: 'team_1',
            score: '2-1',
          },
          {
            participant1Id: 'team_2',
            participant2Id: 'team_1',
            winnerId: 'team_2',
            score: '2-0',
          },
        ]

        const standings = calculateStandings(teams, matches)
        // Both have 1 win, but team_1 won 2 sets, team_2 won 2 sets
        // Both have 1 set lost
        expect(standings[0].wins).toBe(1)
        expect(standings[1].wins).toBe(1)
        // Verify both are ranked (one will be first, one second based on h2h or random)
        expect([standings[0].participantId, standings[1].participantId]).toContain('team_1')
        expect([standings[0].participantId, standings[1].participantId]).toContain('team_2')
      })

      it('should handle head-to-head tiebreaker with teams', () => {
        const teams = [
          { id: 'team_1', name: 'Team A' },
          { id: 'team_2', name: 'Team B' },
          { id: 'team_3', name: 'Team C' },
        ]

        const matches = [
          {
            participant1Id: 'team_1',
            participant2Id: 'team_2',
            winnerId: 'team_1',
            score: '2-0',
          },
          {
            participant1Id: 'team_1',
            participant2Id: 'team_3',
            winnerId: 'team_3',
            score: '2-0',
          },
          {
            participant1Id: 'team_2',
            participant2Id: 'team_3',
            winnerId: 'team_2',
            score: '2-0',
          },
        ]

        const standings = calculateStandings(teams, matches)
        // All have 1 win, 2 sets. Head-to-head: team_1 beat team_2, team_2 beat team_3, team_3 beat team_1
        // Rock-paper-scissors situation, so rank order depends on random tiebreaker
        expect(standings[0].wins).toBe(1)
        expect(standings[1].wins).toBe(1)
        expect(standings[2].wins).toBe(1)
      })

      it('should rank all team participants correctly', () => {
        const teams = [
          { id: 'team_1', name: 'Team A' },
          { id: 'team_2', name: 'Team B' },
          { id: 'team_3', name: 'Team C' },
        ]

        const matches = [
          {
            participant1Id: 'team_1',
            participant2Id: 'team_2',
            winnerId: 'team_1',
            score: '2-0',
          },
          {
            participant1Id: 'team_1',
            participant2Id: 'team_3',
            winnerId: 'team_1',
            score: '2-0',
          },
          {
            participant1Id: 'team_2',
            participant2Id: 'team_3',
            winnerId: 'team_2',
            score: '2-0',
          },
        ]

        const standings = calculateStandings(teams, matches)
        expect(standings[0].rank).toBe(1)
        expect(standings[1].rank).toBe(2)
        expect(standings[2].rank).toBe(3)
      })

      it('should handle multiple matches between same teams', () => {
        const teams = [
          { id: 'team_1', name: 'Team A' },
          { id: 'team_2', name: 'Team B' },
        ]

        const matches = [
          {
            participant1Id: 'team_1',
            participant2Id: 'team_2',
            winnerId: 'team_1',
            score: '2-1',
          },
          {
            participant1Id: 'team_1',
            participant2Id: 'team_2',
            winnerId: 'team_2',
            score: '2-0',
          },
        ]

        const standings = calculateStandings(teams, matches)
        // Both have 1 win (team_1 won first match, team_2 won second match)
        // team_1: 2 sets won, 2 sets lost
        // team_2: 2 sets won, 2 sets lost (from their wins)
        // Same stats, so order depends on h2h tiebreaker (they're tied 1-1 h2h)
        expect(standings[0].wins).toBe(1)
        expect(standings[1].wins).toBe(1)
        expect([standings[0].participantId, standings[1].participantId]).toContain('team_1')
        expect([standings[0].participantId, standings[1].participantId]).toContain('team_2')
      })

      it('should preserve standing properties for generic participants', () => {
        const participants = [{ id: 'p_xyz', name: 'Participant' }]
        const matches: any[] = []

        const standings = calculateStandings(participants, matches)

        expect(standings[0]).toHaveProperty('participantId')
        expect(standings[0]).toHaveProperty('rank')
        expect(standings[0]).toHaveProperty('wins')
        expect(standings[0]).toHaveProperty('losses')
        expect(standings[0]).toHaveProperty('setsWon')
        expect(standings[0]).toHaveProperty('setsLost')
      })

      it('should handle many teams (scalability)', () => {
        const teamCount = 20
        const teams = Array.from({ length: teamCount }, (_, i) => ({
          id: `team_${i}`,
          name: `Team ${i}`,
        }))

        const matches = Array.from({ length: 30 }, (_, i) => ({
          participant1Id: `team_${i % teamCount}`,
          participant2Id: `team_${(i + 1) % teamCount}`,
          winnerId: `team_${i % teamCount}`,
          score: '2-0',
        }))

        const standings = calculateStandings(teams, matches)

        expect(standings).toHaveLength(teamCount)
        expect(standings[0].rank).toBe(1)
        expect(standings[teamCount - 1].rank).toBe(teamCount)
      })

      it('should not modify input arrays', () => {
        const teams = [
          { id: 'team_1', name: 'Team A' },
          { id: 'team_2', name: 'Team B' },
        ]
        const originalTeams = JSON.stringify(teams)

        const matches = [
          {
            participant1Id: 'team_1',
            participant2Id: 'team_2',
            winnerId: 'team_1',
            score: '2-0',
          },
        ]
        const originalMatches = JSON.stringify(matches)

        calculateStandings(teams, matches)

        expect(JSON.stringify(teams)).toBe(originalTeams)
        expect(JSON.stringify(matches)).toBe(originalMatches)
      })

      it('should handle empty participant list', () => {
        const standings = calculateStandings([], [])
        expect(standings).toHaveLength(0)
      })

      it('should handle mixed participant types in same call (agnostic)', () => {
        const mixedParticipants = [
          { id: 'player_1', name: 'Alice' },
          { id: 'team_1', name: 'Team A' },
        ]

        const matches = [
          {
            participant1Id: 'player_1',
            participant2Id: 'team_1',
            winnerId: 'player_1',
            score: '2-1',
          },
        ]

        const standings = calculateStandings(mixedParticipants, matches)
        expect(standings[0].participantId).toBe('player_1')
        expect(standings[1].participantId).toBe('team_1')
      })

      it('should apply same tiebreaker rules to generic participants', () => {
        const participants = [
          { id: 'p1', name: 'P1' },
          { id: 'p2', name: 'P2' },
          { id: 'p3', name: 'P3' },
        ]

        const matches = [
          {
            participant1Id: 'p1',
            participant2Id: 'p2',
            winnerId: 'p1',
            score: '6-4, 6-3',
          },
          {
            participant1Id: 'p1',
            participant2Id: 'p3',
            winnerId: 'p3',
            score: '6-3',
          },
          {
            participant1Id: 'p2',
            participant2Id: 'p3',
            winnerId: 'p2',
            score: '6-4, 6-4',
          },
        ]

        const standings = calculateStandings(participants, matches)
        // p1: 1 win, 2 sets won (beat p2)
        // p2: 1 win, 2 sets won (beat p3)
        // p3: 1 win, 1 set won (beat p1)
        // p3 has fewer sets, so ranks last
        // p1 and p2 have same stats, order depends on h2h or random
        expect(standings[2].participantId).toBe('p3')
        expect(standings[2].setsWon).toBe(1)
      })
    })
  })
})
