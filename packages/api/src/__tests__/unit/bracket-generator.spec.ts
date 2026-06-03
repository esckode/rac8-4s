import { describe, it, expect } from '@jest/globals'
import {
  generateBracket,
  getQualifiedParticipants,
  getOptimalBracketSize,
  addByesToBracket,
  countBracketMatches
} from '../../utils/bracket-generator'

describe('Bracket Generator', () => {
  describe('generateBracket', () => {
    it('should generate finals bracket for 2 teams', () => {
      const teams = ['team_1', 'team_2']
      const bracket = generateBracket(teams)

      expect(bracket).toHaveLength(1)
      expect(bracket[0].round).toBe('round_1')
      expect(bracket[0].participant1Id).toBe('team_1')
      expect(bracket[0].participant2Id).toBe('team_2')
    })

    it('should generate 4-team bracket with correct structure', () => {
      const teams = ['team_1', 'team_2', 'team_3', 'team_4']
      const bracket = generateBracket(teams)

      // Round 1: 2 semifinals
      const round1 = bracket.filter((m) => m.round === 'round_1')
      expect(round1).toHaveLength(2)
      expect(round1[0].participant1Id).toBe('team_1')
      expect(round1[0].participant2Id).toBe('team_2')
      expect(round1[1].participant1Id).toBe('team_3')
      expect(round1[1].participant2Id).toBe('team_4')

      // Round 2: 1 final
      const round2 = bracket.filter((m) => m.round === 'round_2')
      expect(round2).toHaveLength(1)
    })

    it('should generate 8-team bracket with all rounds', () => {
      const teams = Array.from({ length: 8 }, (_, i) => `team_${i + 1}`)
      const bracket = generateBracket(teams)

      // Round 1: 4 quarterfinals
      const round1 = bracket.filter((m) => m.round === 'round_1')
      expect(round1).toHaveLength(4)

      // Round 2: 2 semifinals
      const round2 = bracket.filter((m) => m.round === 'round_2')
      expect(round2).toHaveLength(2)

      // Round 3: 1 final
      const round3 = bracket.filter((m) => m.round === 'round_3')
      expect(round3).toHaveLength(1)
    })

    it('should preserve seeding order', () => {
      const teams = ['seed_1', 'seed_2', 'seed_3', 'seed_4']
      const bracket = generateBracket(teams)

      const firstMatch = bracket.find((m) => m.position === 0 && m.round === 'round_1')
      expect(firstMatch?.participant1Id).toBe('seed_1')
      expect(firstMatch?.participant2Id).toBe('seed_2')

      const secondMatch = bracket.find((m) => m.position === 1 && m.round === 'round_1')
      expect(secondMatch?.participant1Id).toBe('seed_3')
      expect(secondMatch?.participant2Id).toBe('seed_4')
    })

    it('should throw error for single participant', () => {
      expect(() => generateBracket(['team_1'])).toThrow('At least 2 participants required')
    })

    it('should throw error for empty participants', () => {
      expect(() => generateBracket([])).toThrow('At least 2 participants required')
    })

    it('should set format to doubles when specified', () => {
      const teams = ['team_1', 'team_2']
      const bracket = generateBracket(teams, 'doubles')

      expect(bracket[0].format).toBe('doubles')
    })

    it('should default format to singles', () => {
      const teams = ['team_1', 'team_2']
      const bracket = generateBracket(teams)

      expect(bracket[0].format).toBe('singles')
    })
  })

  describe('getQualifiedParticipants', () => {
    it('should return top 2 participants by default', () => {
      const standings = [
        { participantId: 'team_1', wins: 3, losses: 0 },
        { participantId: 'team_2', wins: 2, losses: 1 },
        { participantId: 'team_3', wins: 1, losses: 2 },
        { participantId: 'team_4', wins: 0, losses: 3 }
      ]

      const qualified = getQualifiedParticipants(standings)

      expect(qualified).toEqual(['team_1', 'team_2'])
    })

    it('should return top 4 when requested', () => {
      const standings = [
        { participantId: 'team_1', wins: 3, losses: 0 },
        { participantId: 'team_2', wins: 2, losses: 1 },
        { participantId: 'team_3', wins: 2, losses: 1 },
        { participantId: 'team_4', wins: 1, losses: 2 }
      ]

      const qualified = getQualifiedParticipants(standings, 4)

      expect(qualified).toHaveLength(4)
      expect(qualified[0]).toBe('team_1')
    })

    it('should handle ties with consistent ordering', () => {
      const standings = [
        { participantId: 'team_c', wins: 1, losses: 2 },
        { participantId: 'team_a', wins: 1, losses: 2 },
        { participantId: 'team_b', wins: 1, losses: 2 }
      ]

      const qualified = getQualifiedParticipants(standings, 2)

      expect(qualified).toHaveLength(2)
      // Should pick first 2 with same wins/losses (ties)
      expect(qualified.includes('team_c')).toBe(true)
      expect(qualified.includes('team_a')).toBe(true)
    })

    it('should throw error for empty standings', () => {
      expect(() => getQualifiedParticipants([])).toThrow('No standings available')
    })

    it('should handle fewer participants than requested', () => {
      const standings = [
        { participantId: 'team_1', wins: 2, losses: 0 },
        { participantId: 'team_2', wins: 1, losses: 1 }
      ]

      const qualified = getQualifiedParticipants(standings, 4)

      expect(qualified).toEqual(['team_1', 'team_2'])
    })
  })

  describe('getOptimalBracketSize', () => {
    it('should return 2 for 1-2 participants', () => {
      expect(getOptimalBracketSize(1)).toBe(2)
      expect(getOptimalBracketSize(2)).toBe(2)
    })

    it('should return 4 for 3-4 participants', () => {
      expect(getOptimalBracketSize(3)).toBe(4)
      expect(getOptimalBracketSize(4)).toBe(4)
    })

    it('should return 8 for 5-8 participants', () => {
      expect(getOptimalBracketSize(5)).toBe(8)
      expect(getOptimalBracketSize(8)).toBe(8)
    })

    it('should return 16 for 9-16 participants', () => {
      expect(getOptimalBracketSize(9)).toBe(16)
      expect(getOptimalBracketSize(16)).toBe(16)
    })

    it('should return 64 for very large tournaments', () => {
      expect(getOptimalBracketSize(100)).toBe(64)
    })
  })

  describe('addByesToBracket', () => {
    it('should not add byes if enough participants', () => {
      const participants = ['team_1', 'team_2', 'team_3', 'team_4']
      const result = addByesToBracket(participants, 4)

      expect(result).toEqual(participants)
    })

    it('should add byes to fill bracket size', () => {
      const participants = ['team_1', 'team_2']
      const result = addByesToBracket(participants, 4)

      expect(result).toHaveLength(4)
      expect(result[0]).toBe('team_1')
      expect(result[1]).toBe('team_2')
      expect(result[2]).toMatch(/bye_/)
      expect(result[3]).toMatch(/bye_/)
    })

    it('should truncate if more participants than bracket size', () => {
      const participants = ['team_1', 'team_2', 'team_3', 'team_4', 'team_5']
      const result = addByesToBracket(participants, 4)

      expect(result).toHaveLength(4)
      expect(result).toEqual(['team_1', 'team_2', 'team_3', 'team_4'])
    })
  })

  describe('countBracketMatches', () => {
    it('should return 0 for 1 participant', () => {
      expect(countBracketMatches(1)).toBe(0)
    })

    it('should return 1 for 2 participants (finals)', () => {
      expect(countBracketMatches(2)).toBe(1)
    })

    it('should return 3 for 4 participants', () => {
      expect(countBracketMatches(4)).toBe(3)
    })

    it('should return 7 for 8 participants', () => {
      expect(countBracketMatches(8)).toBe(7)
    })

    it('should return 15 for 16 participants', () => {
      expect(countBracketMatches(16)).toBe(15)
    })
  })
})
