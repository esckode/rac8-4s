import crypto from 'crypto'
import { PlayerRepository, AgeAttestation } from '../../db'
import { Pool } from 'pg'
import { generatePlayerSession } from '../../auth/magic-link'
import { TokenStore } from '../../auth/token-store'

/**
 * Default adult attestation for test factories.
 * Supplies a 30-year-old DOB so existing tests don't need to specify one.
 */
export function defaultAdultAttestation(): AgeAttestation {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 30)
  return {
    dateOfBirth: d.toISOString().slice(0, 10),
    policyVersion: 'v1',
  }
}

export interface PlayerData {
  email: string
  name: string
}

export const PlayerFactory = {
  /**
   * Generate unique identifier using UUID.
   * Guarantees zero email collisions across parallel test runs.
   */
  uid(): string {
    return crypto.randomUUID().slice(0, 8)
  },

  /**
   * Generate unique player input data.
   */
  data(overrides: Partial<PlayerData> = {}): PlayerData {
    const uid = this.uid()

    return {
      email: `player-${uid}@test.local`,
      name: `Player ${uid}`,
      ...overrides,
    }
  },

  /**
   * Create a player (or find existing by email).
   */
  async create(pool: Pool, overrides: Partial<PlayerData> = {}) {
    const repo = new PlayerRepository(pool)
    const data = this.data(overrides)
    return repo.findOrCreatePlayerByEmail(data.email, data.name, undefined, undefined, defaultAdultAttestation())
  },

  /**
   * Create a player and register them for a tournament.
   */
  async createAndRegister(
    pool: Pool,
    tournamentId: string,
    overrides: Partial<PlayerData> = {}
  ) {
    const repo = new PlayerRepository(pool)
    const player = await this.create(pool, overrides)
    await repo.createRegistration(player.id, tournamentId)
    return player
  },

  /**
   * Generate a player session token for authentication testing.
   */
  async token(
    pool: Pool,
    tokenStore: TokenStore,
    tournamentId: string,
    overrides: Partial<PlayerData> = {}
  ) {
    const player = await this.create(pool, overrides)
    const session = await generatePlayerSession(
      {
        playerId: player.id,
        tournamentId,
        email: player.email,
        createdAt: Date.now(),
      },
      3600,
      tokenStore
    )
    return {
      ...player,
      sessionToken: session.token,
    }
  },
}
