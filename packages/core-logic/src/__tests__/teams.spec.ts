import { describe, it, expect } from '@jest/globals'
import { generateTeamId, validateTeamPlayers, Team } from '../teams'

describe('Team Model', () => {
  describe('generateTeamId', () => {
    it('should generate unique team IDs', () => {
      const id1 = generateTeamId()
      const id2 = generateTeamId()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^team_/)
    })

    it('should generate string IDs', () => {
      const id = generateTeamId()
      expect(typeof id).toBe('string')
    })

    it('should generate IDs with minimum length', () => {
      const id = generateTeamId()
      expect(id.length).toBeGreaterThan(5)
    })

    it('should be deterministic in uniqueness across multiple calls', () => {
      const ids = new Set()
      for (let i = 0; i < 100; i++) {
        ids.add(generateTeamId())
      }
      expect(ids.size).toBe(100)
    })
  })

  describe('validateTeamPlayers', () => {
    it('should throw when both players are the same', () => {
      expect(() => validateTeamPlayers('p1', 'p1')).toThrow('Team must contain two different players')
    })

    it('should not throw when players are different', () => {
      expect(() => validateTeamPlayers('p1', 'p2')).not.toThrow()
    })

    it('should be case-sensitive for player IDs', () => {
      expect(() => validateTeamPlayers('p1', 'P1')).not.toThrow()
    })

    it('should throw on empty string same player IDs', () => {
      expect(() => validateTeamPlayers('', '')).toThrow()
    })

    it('should allow different players even if names similar', () => {
      expect(() => validateTeamPlayers('player_1', 'player_2')).not.toThrow()
    })
  })

  describe('Team interface', () => {
    it('should have required properties', () => {
      const team: Team = {
        id: 'team_1',
        tournamentId: 'tourney_1',
        player1Id: 'p1',
        player2Id: 'p2',
        createdAt: new Date()
      }
      expect(team.id).toBeDefined()
      expect(team.tournamentId).toBeDefined()
      expect(team.player1Id).toBeDefined()
      expect(team.player2Id).toBeDefined()
      expect(team.createdAt).toBeDefined()
    })

    it('should allow createdAt to be a Date instance', () => {
      const now = new Date()
      const team: Team = {
        id: 'team_1',
        tournamentId: 'tourney_1',
        player1Id: 'p1',
        player2Id: 'p2',
        createdAt: now
      }
      expect(team.createdAt).toBe(now)
      expect(team.createdAt instanceof Date).toBe(true)
    })

    it('should have string player IDs', () => {
      const team: Team = {
        id: 'team_1',
        tournamentId: 'tourney_1',
        player1Id: 'alice',
        player2Id: 'bob',
        createdAt: new Date()
      }
      expect(typeof team.player1Id).toBe('string')
      expect(typeof team.player2Id).toBe('string')
    })
  })
})
