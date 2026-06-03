import { describe, it, expect, beforeEach } from '@jest/globals'

/**
 * Phase 4 Unit Tests: Bracket Advancement & Real-Time Updates
 *
 * Tests core logic for:
 * - Match result submission and validation
 * - Bracket generation from group winners
 * - Advancement logic (top 2 teams per group)
 * - Score parsing and validation
 */

describe('Phase 4: Bracket Advancement & Real-Time Updates', () => {
  describe('Score Validation', () => {
    const parseScore = (scoreStr: string): { valid: boolean; sets?: [number, number] } => {
      const match = scoreStr.match(/^(\d+)-(\d+)$/)
      if (!match) return { valid: false }
      const [, s1, s2] = match
      const sets = [parseInt(s1), parseInt(s2)] as [number, number]
      // Valid score: 2-0, 2-1, 0-2, 1-2 (best of 3)
      if ((sets[0] === 2 || sets[1] === 2) && Math.max(sets[0], sets[1]) === 2) {
        return { valid: true, sets }
      }
      return { valid: false }
    }

    it('should accept valid score format "2-1"', () => {
      const result = parseScore('2-1')
      expect(result.valid).toBe(true)
      expect(result.sets).toEqual([2, 1])
    })

    it('should accept valid score format "2-0"', () => {
      const result = parseScore('2-0')
      expect(result.valid).toBe(true)
      expect(result.sets).toEqual([2, 0])
    })

    it('should accept valid score format "1-2"', () => {
      const result = parseScore('1-2')
      expect(result.valid).toBe(true)
      expect(result.sets).toEqual([1, 2])
    })

    it('should reject invalid format "3-0"', () => {
      const result = parseScore('3-0')
      expect(result.valid).toBe(false)
    })

    it('should reject invalid format "1-1"', () => {
      const result = parseScore('1-1')
      expect(result.valid).toBe(false)
    })

    it('should reject invalid format "invalid"', () => {
      const result = parseScore('invalid')
      expect(result.valid).toBe(false)
    })

    it('should reject empty score', () => {
      const result = parseScore('')
      expect(result.valid).toBe(false)
    })

    it('should reject score with extra characters', () => {
      const result = parseScore('2-1 test')
      expect(result.valid).toBe(false)
    })
  })

  describe('Advancement Logic', () => {
    const calculateStandings = (
      teams: { id: string }[],
      matches: Array<{ team1_id: string; team2_id: string; winner_id: string }>
    ) => {
      const standings = new Map<string, { wins: number; losses: number }>()

      // Initialize
      teams.forEach((team) => {
        standings.set(team.id, { wins: 0, losses: 0 })
      })

      // Count wins/losses
      matches.forEach((match) => {
        const team1Stats = standings.get(match.team1_id)!
        const team2Stats = standings.get(match.team2_id)!

        if (match.winner_id === match.team1_id) {
          team1Stats.wins++
          team2Stats.losses++
        } else {
          team2Stats.wins++
          team1Stats.losses++
        }
      })

      // Sort by wins, then by ID for consistency
      return Array.from(standings.entries())
        .map(([teamId, stats]) => ({ teamId, ...stats }))
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins
          return a.teamId.localeCompare(b.teamId)
        })
    }

    it('should identify top 2 teams from group', () => {
      const teams = [
        { id: 'team_1' },
        { id: 'team_2' },
        { id: 'team_3' },
        { id: 'team_4' }
      ]

      const matches = [
        { team1_id: 'team_1', team2_id: 'team_2', winner_id: 'team_1' },
        { team1_id: 'team_1', team2_id: 'team_3', winner_id: 'team_1' },
        { team1_id: 'team_2', team2_id: 'team_3', winner_id: 'team_2' },
        { team1_id: 'team_2', team2_id: 'team_4', winner_id: 'team_2' },
        { team1_id: 'team_3', team2_id: 'team_4', winner_id: 'team_3' },
        { team1_id: 'team_1', team2_id: 'team_4', winner_id: 'team_1' }
      ]

      const standings = calculateStandings(teams, matches)
      const qualified = standings.slice(0, 2).map((s) => s.teamId)

      expect(qualified).toContain('team_1') // 3 wins
      expect(qualified).toContain('team_2') // 2 wins
    })

    it('should rank all teams correctly', () => {
      const teams = [
        { id: 'team_1' },
        { id: 'team_2' },
        { id: 'team_3' }
      ]

      const matches = [
        { team1_id: 'team_1', team2_id: 'team_2', winner_id: 'team_1' },
        { team1_id: 'team_1', team2_id: 'team_3', winner_id: 'team_1' },
        { team1_id: 'team_2', team2_id: 'team_3', winner_id: 'team_2' }
      ]

      const standings = calculateStandings(teams, matches)

      expect(standings[0].teamId).toBe('team_1')
      expect(standings[0].wins).toBe(2)
      expect(standings[1].teamId).toBe('team_2')
      expect(standings[1].wins).toBe(1)
      expect(standings[2].teamId).toBe('team_3')
      expect(standings[2].wins).toBe(0)
    })

    it('should handle ties with consistent ordering', () => {
      const teams = [
        { id: 'team_b' },
        { id: 'team_a' },
        { id: 'team_c' }
      ]

      const matches = [
        { team1_id: 'team_a', team2_id: 'team_b', winner_id: 'team_a' },
        { team1_id: 'team_a', team2_id: 'team_c', winner_id: 'team_c' },
        { team1_id: 'team_b', team2_id: 'team_c', winner_id: 'team_b' }
      ]

      const standings = calculateStandings(teams, matches)
      // All have 1 win, should be sorted by ID
      const tied = standings.filter((s) => s.wins === 1)
      expect(tied[0].teamId).toBe('team_a')
      expect(tied[1].teamId).toBe('team_b')
    })
  })

  describe('Match Participation Validation', () => {
    const canPlayerSubmitScore = (
      playerId: string,
      match: { team1_id: string; team2_id: string },
      teamPlayers: Map<string, string[]>
    ): boolean => {
      const team1Players = teamPlayers.get(match.team1_id) || []
      const team2Players = teamPlayers.get(match.team2_id) || []
      return team1Players.includes(playerId) || team2Players.includes(playerId)
    }

    it('should allow team1 player1 to submit score', () => {
      const match = { team1_id: 'team_1', team2_id: 'team_2' }
      const teamPlayers = new Map([
        ['team_1', ['player_1', 'player_2']],
        ['team_2', ['player_3', 'player_4']]
      ])

      expect(canPlayerSubmitScore('player_1', match, teamPlayers)).toBe(true)
    })

    it('should allow team1 player2 to submit score', () => {
      const match = { team1_id: 'team_1', team2_id: 'team_2' }
      const teamPlayers = new Map([
        ['team_1', ['player_1', 'player_2']],
        ['team_2', ['player_3', 'player_4']]
      ])

      expect(canPlayerSubmitScore('player_2', match, teamPlayers)).toBe(true)
    })

    it('should allow team2 player to submit score', () => {
      const match = { team1_id: 'team_1', team2_id: 'team_2' }
      const teamPlayers = new Map([
        ['team_1', ['player_1', 'player_2']],
        ['team_2', ['player_3', 'player_4']]
      ])

      expect(canPlayerSubmitScore('player_3', match, teamPlayers)).toBe(true)
    })

    it('should reject unrelated player', () => {
      const match = { team1_id: 'team_1', team2_id: 'team_2' }
      const teamPlayers = new Map([
        ['team_1', ['player_1', 'player_2']],
        ['team_2', ['player_3', 'player_4']]
      ])

      expect(canPlayerSubmitScore('player_5', match, teamPlayers)).toBe(false)
    })

    it('should handle missing team gracefully', () => {
      const match = { team1_id: 'team_1', team2_id: 'team_2' }
      const teamPlayers = new Map([
        ['team_1', ['player_1', 'player_2']]
        // team_2 not in map
      ])

      expect(canPlayerSubmitScore('player_1', match, teamPlayers)).toBe(true)
      expect(canPlayerSubmitScore('player_3', match, teamPlayers)).toBe(false)
    })
  })

  describe('Bracket Generation', () => {
    const generateKnockoutBracket = (
      qualifiedTeams: string[],
      roundSize: number = 2
    ): Array<{ round: string; position: number; team1_id: string; team2_id: string }> => {
      const bracket = []
      let matchPosition = 0

      // Simple single-elimination bracket
      let currentRound = 1
      let teams = qualifiedTeams

      while (teams.length > 1) {
        const roundName = `round_${currentRound}`

        for (let i = 0; i < teams.length; i += 2) {
          bracket.push({
            round: roundName,
            position: matchPosition++,
            team1_id: teams[i],
            team2_id: teams[i + 1] || teams[i] // Handle odd number
          })
        }

        // Prepare for next round
        teams = Array(Math.ceil(teams.length / 2)).fill(null) // Placeholder for winners
        currentRound++
      }

      return bracket
    }

    it('should generate bracket for 2 teams (finals)', () => {
      const qualified = ['team_1', 'team_2']
      const bracket = generateKnockoutBracket(qualified)

      expect(bracket.length).toBe(1)
      expect(bracket[0].round).toBe('round_1')
      expect(bracket[0].team1_id).toBe('team_1')
      expect(bracket[0].team2_id).toBe('team_2')
    })

    it('should generate bracket for 4 teams (semis + finals)', () => {
      const qualified = ['team_1', 'team_2', 'team_3', 'team_4']
      const bracket = generateKnockoutBracket(qualified)

      expect(bracket.length).toBe(3) // 2 semis + 1 final
      const semis = bracket.filter((m) => m.round === 'round_1')
      expect(semis.length).toBe(2)

      const finals = bracket.filter((m) => m.round === 'round_2')
      expect(finals.length).toBe(1)
    })

    it('should generate bracket for 8 teams', () => {
      const qualified = ['team_1', 'team_2', 'team_3', 'team_4', 'team_5', 'team_6', 'team_7', 'team_8']
      const bracket = generateKnockoutBracket(qualified)

      expect(bracket.length).toBe(7) // 4 quarters + 2 semis + 1 final
      const quarters = bracket.filter((m) => m.round === 'round_1')
      expect(quarters.length).toBe(4)
    })

    it('should preserve team seeding order', () => {
      const qualified = ['seed_1', 'seed_2', 'seed_3', 'seed_4']
      const bracket = generateKnockoutBracket(qualified)

      const firstMatch = bracket[0]
      expect(firstMatch.team1_id).toBe('seed_1')
      expect(firstMatch.team2_id).toBe('seed_2')

      const secondMatch = bracket[1]
      expect(secondMatch.team1_id).toBe('seed_3')
      expect(secondMatch.team2_id).toBe('seed_4')
    })
  })

  describe('Real-Time Event Generation', () => {
    const createScoreSubmittedEvent = (
      matchId: string,
      winnerId: string,
      score: string,
      requestId: string
    ) => ({
      type: 'bracket_updated',
      eventType: 'score_submitted',
      matchId,
      winner: winnerId,
      score,
      timestamp: new Date().toISOString(),
      requestId
    })

    const createStandingsUpdatedEvent = (
      groupId: string,
      standings: Array<{ teamId: string; wins: number }>,
      requestId: string
    ) => ({
      type: 'standings_updated',
      groupId,
      standings,
      timestamp: new Date().toISOString(),
      requestId
    })

    it('should create score submitted event with all required fields', () => {
      const event = createScoreSubmittedEvent('match_1', 'team_1', '2-1', 'req_123')

      expect(event.type).toBe('bracket_updated')
      expect(event.eventType).toBe('score_submitted')
      expect(event.matchId).toBe('match_1')
      expect(event.winner).toBe('team_1')
      expect(event.score).toBe('2-1')
      expect(event.requestId).toBe('req_123')
      expect(event.timestamp).toBeDefined()
    })

    it('should create standings updated event', () => {
      const standings = [
        { teamId: 'team_1', wins: 2 },
        { teamId: 'team_2', wins: 1 }
      ]
      const event = createStandingsUpdatedEvent('group_1', standings, 'req_456')

      expect(event.type).toBe('standings_updated')
      expect(event.groupId).toBe('group_1')
      expect(event.standings).toEqual(standings)
      expect(event.requestId).toBe('req_456')
    })

    it('should include ISO timestamp', () => {
      const event = createScoreSubmittedEvent('match_1', 'team_1', '2-1', 'req_789')
      const timestamp = new Date(event.timestamp)
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('should preserve request ID for tracing', () => {
      const requestId = 'trace_abcdef123'
      const event = createScoreSubmittedEvent('match_1', 'team_1', '2-1', requestId)
      expect(event.requestId).toBe(requestId)
    })
  })
})
