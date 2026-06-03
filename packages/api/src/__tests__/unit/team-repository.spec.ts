import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { TeamRepository } from '../../repositories/team-repository'
import { Team } from '@core/teams'

describe('TeamRepository', () => {
  let pool: Pool
  let repo: TeamRepository

  beforeAll(async () => {
    pool = await getTestPool()
    repo = new TeamRepository(pool)
  })

  beforeEach(async () => {
    await beginTransaction(pool)
  })

  afterEach(async () => {
    await rollbackTransaction()
  })

  afterAll(async () => {
    await pool.end()
  })

  async function createTestPlayers(count: number) {
    const players = []
    const now = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    for (let i = 0; i < count; i++) {
      const playerId = `p_${now}_${random}_${i}`
      await pool.query(
        'INSERT INTO players (id, email, name, created_at) VALUES ($1, $2, $3, $4)',
        [playerId, `test_${now}_${random}_${i}@test.com`, `Test Player ${i}`, new Date()]
      )
      players.push(playerId)
    }
    return players
  }

  async function createTestTournament(matchFormat = 'doubles', maxPlayers = 4) {
    const tournamentId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    await pool.query(
      `INSERT INTO tournaments (id, name, creator_id, sport, match_format, max_players, status, registration_deadline, group_stage_deadline, knockout_stage_deadline, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        tournamentId,
        'Test Tournament',
        'org1',
        'tennis',
        matchFormat,
        maxPlayers,
        'registration_closed',
        new Date(now.getTime() + 86400000),
        new Date(now.getTime() + 172800000),
        new Date(now.getTime() + 259200000),
        now
      ]
    )
    return tournamentId
  }

  describe('createTeam', () => {
    it('should create a team with two players', async () => {
      const tournamentId = await createTestTournament()
      const [p1, p2] = await createTestPlayers(2)

      const team = await repo.createTeam(tournamentId, p1, p2)

      expect(team).toBeDefined()
      expect(team.id).toBeDefined()
      expect(team.tournamentId).toBe(tournamentId)
      expect(team.player1Id).toBe(p1)
      expect(team.player2Id).toBe(p2)
    })

    it('should throw error when both players are the same', async () => {
      const tournamentId = await createTestTournament()
      const [p1] = await createTestPlayers(1)

      await expect(() => repo.createTeam(tournamentId, p1, p1)).rejects.toThrow()
    })

    it('should prevent exact duplicate partnerships', async () => {
      const tournamentId = await createTestTournament()
      const [p1, p2] = await createTestPlayers(2)

      // Create first team
      await repo.createTeam(tournamentId, p1, p2)

      // Attempt to create same partnership with exact same players in same order
      await expect(() => repo.createTeam(tournamentId, p1, p2)).rejects.toThrow()
    })
  })

  describe('findTeamsByTournament', () => {
    it('should return all teams for a tournament', async () => {
      const tournamentId = await createTestTournament('doubles', 8)
      const [p1, p2, p3, p4] = await createTestPlayers(4)

      await repo.createTeam(tournamentId, p1, p2)
      await repo.createTeam(tournamentId, p3, p4)

      const teams = await repo.findTeamsByTournament(tournamentId)

      expect(teams).toHaveLength(2)
      expect(teams[0]).toHaveProperty('id')
      expect(teams[0]).toHaveProperty('tournamentId')
    })

    it('should return empty array when no teams exist', async () => {
      const tournamentId = await createTestTournament()

      const teams = await repo.findTeamsByTournament(tournamentId)

      expect(teams).toEqual([])
    })
  })

  describe('getTeamPlayers', () => {
    it('should return both players in a team', async () => {
      const tournamentId = await createTestTournament()
      const [p1, p2] = await createTestPlayers(2)

      const team = await repo.createTeam(tournamentId, p1, p2)
      const players = await repo.getTeamPlayers(team.id)

      expect(players).toHaveProperty('player1Id')
      expect(players).toHaveProperty('player2Id')
      expect([players.player1Id, players.player2Id]).toContain(p1)
      expect([players.player1Id, players.player2Id]).toContain(p2)
    })

    it('should throw error for non-existent team', async () => {
      await expect(() => repo.getTeamPlayers('nonexistent_team')).rejects.toThrow()
    })
  })

  describe('findTeamById', () => {
    it('should find an existing team', async () => {
      const tournamentId = await createTestTournament()
      const [p1, p2] = await createTestPlayers(2)

      const created = await repo.createTeam(tournamentId, p1, p2)
      const found = await repo.findTeamById(created.id)

      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
    })

    it('should return null for non-existent team', async () => {
      const found = await repo.findTeamById('nonexistent_team')
      expect(found).toBeNull()
    })
  })
})
