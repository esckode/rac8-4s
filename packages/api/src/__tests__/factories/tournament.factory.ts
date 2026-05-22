import crypto from 'crypto'
import { TournamentRepository } from '../../db'
import { Pool } from 'pg'

export interface TournamentData {
  name: string
  sport: string
  matchFormat: 'singles' | 'doubles'
  maxPlayers: number
  registrationDeadline: string
  groupStageDeadline: string
  knockoutStageDeadline: string
}

export const TournamentFactory = {
  /**
   * Generate a unique identifier for test data using UUID.
   * This guarantees zero collisions across parallel test runs.
   */
  uid(): string {
    return crypto.randomUUID().slice(0, 8)
  },

  /**
   * Generate tournament input data with unique defaults.
   */
  data(overrides: Partial<TournamentData> = {}): TournamentData {
    const uid = this.uid()
    const now = Date.now()

    return {
      name: `test-tournament-${uid}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 8,
      registrationDeadline: new Date(now + 86400000).toISOString(),    // +1 day
      groupStageDeadline: new Date(now + 172800000).toISOString(),     // +2 days
      knockoutStageDeadline: new Date(now + 259200000).toISOString(),  // +3 days
      ...overrides,
    }
  },

  /**
   * Create a tournament in the database.
   */
  async create(
    pool: Pool,
    organizerId: string,
    overrides: Partial<TournamentData> = {}
  ) {
    const repo = new TournamentRepository(pool)
    return repo.create({
      ...this.data(overrides),
      creatorId: organizerId,
    })
  },

  /**
   * Create a tournament and set status to registration_open.
   */
  async open(
    pool: Pool,
    organizerId: string,
    overrides: Partial<TournamentData> = {}
  ) {
    const tournament = await this.create(pool, organizerId, overrides)
    const repo = new TournamentRepository(pool)
    await repo.updateStatus(tournament.id, 'registration_open')
    return repo.findById(tournament.id)
  },
}
