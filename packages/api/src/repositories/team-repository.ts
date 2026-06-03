import { Pool } from 'pg'
import { getLogger } from '../logger'
import { Team, generateTeamId, validateTeamPlayers } from '@core/teams'

const log = getLogger('team-repository')

export class TeamRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new team with two players.
   */
  async createTeam(tournamentId: string, player1Id: string, player2Id: string): Promise<Team> {
    validateTeamPlayers(player1Id, player2Id)

    const id = generateTeamId()
    const now = new Date()

    try {
      const result = await this.pool.query(
        `INSERT INTO teams (id, tournament_id, player1_id, player2_id, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, tournament_id, player1_id, player2_id, created_at`,
        [id, tournamentId, player1Id, player2Id, now]
      )

      const row = result.rows[0]
      return {
        id: row.id,
        tournamentId: row.tournament_id,
        player1Id: row.player1_id,
        player2Id: row.player2_id,
        createdAt: row.created_at
      }
    } catch (err: any) {
      if (err.message.includes('unique') || err.message.includes('violate')) {
        throw new Error('Team with these players already exists for this tournament')
      }
      if (err.message.includes('different_players')) {
        throw new Error('Team must contain two different players')
      }
      throw err
    }
  }

  /**
   * Find all teams in a tournament.
   */
  async findTeamsByTournament(tournamentId: string): Promise<Team[]> {
    const result = await this.pool.query(
      `SELECT id, tournament_id, player1_id, player2_id, created_at
       FROM teams
       WHERE tournament_id = $1
       ORDER BY created_at ASC`,
      [tournamentId]
    )

    return result.rows.map(row => ({
      id: row.id,
      tournamentId: row.tournament_id,
      player1Id: row.player1_id,
      player2Id: row.player2_id,
      createdAt: row.created_at
    }))
  }

  /**
   * Find a single team by ID.
   */
  async findTeamById(teamId: string): Promise<Team | null> {
    const result = await this.pool.query(
      `SELECT id, tournament_id, player1_id, player2_id, created_at
       FROM teams
       WHERE id = $1`,
      [teamId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      id: row.id,
      tournamentId: row.tournament_id,
      player1Id: row.player1_id,
      player2Id: row.player2_id,
      createdAt: row.created_at
    }
  }

  /**
   * Get the player IDs in a team.
   */
  async getTeamPlayers(teamId: string): Promise<{ player1Id: string; player2Id: string }> {
    const result = await this.pool.query(
      `SELECT player1_id, player2_id FROM teams WHERE id = $1`,
      [teamId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Team ${teamId} not found`)
    }

    const row = result.rows[0]
    return {
      player1Id: row.player1_id,
      player2Id: row.player2_id
    }
  }

  /**
   * Get all teams in a specific group.
   */
  async getTeamsInGroup(groupId: string): Promise<Team[]> {
    const result = await this.pool.query(
      `SELECT t.id, t.tournament_id, t.player1_id, t.player2_id, t.created_at
       FROM teams t
       INNER JOIN group_memberships gm ON t.id = gm.team_id
       WHERE gm.group_id = $1
       ORDER BY t.created_at ASC`,
      [groupId]
    )

    return result.rows.map(row => ({
      id: row.id,
      tournamentId: row.tournament_id,
      player1Id: row.player1_id,
      player2Id: row.player2_id,
      createdAt: row.created_at
    }))
  }
}
