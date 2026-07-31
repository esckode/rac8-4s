/**
 * RatingsRepository — Skill Ratings (P13)
 *
 * Two tables:
 * - player_ratings: current skill rating per player/sport/format
 * - player_rating_history: append-only audit trail for replays and corrections (R17)
 *
 * matches_played is load-bearing for K-decay (Phase 2).
 * Do not add UNIQUE constraints on history — corrections write a second row for the same match.
 */
import { Pool, PoolClient } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('ratings-repository')

export type DbConnection = Pool | PoolClient

export interface PlayerRating {
  playerId: string
  sport: string
  format: string
  rating: number
  matchesPlayed: number
  updatedAt: string
}

export interface RatingHistoryEntry {
  playerId: string
  sport: string
  format: string
  delta: number
  ratingAfter: number
  matchId: string | null
  createdAt: string
}

export class RatingsRepository {
  constructor(private pool: DbConnection) {}

  async getFor(playerId: string, sport: string, format: string): Promise<PlayerRating | undefined> {
    const res = await this.pool.query(
      `SELECT player_id, sport, format, rating, matches_played, updated_at
       FROM public.player_ratings
       WHERE player_id = $1 AND sport = $2 AND format = $3`,
      [playerId, sport, format]
    )

    if (res.rows.length === 0) return undefined

    const row = res.rows[0]
    return {
      playerId: row.player_id,
      sport: row.sport,
      format: row.format,
      rating: parseFloat(row.rating),
      matchesPlayed: row.matches_played,
      updatedAt: row.updated_at,
    }
  }

  async getAllFor(playerId: string): Promise<PlayerRating[]> {
    const res = await this.pool.query(
      `SELECT player_id, sport, format, rating, matches_played, updated_at
       FROM public.player_ratings
       WHERE player_id = $1`,
      [playerId]
    )

    return res.rows.map((row) => ({
      playerId: row.player_id,
      sport: row.sport,
      format: row.format,
      rating: parseFloat(row.rating),
      matchesPlayed: row.matches_played,
      updatedAt: row.updated_at,
    }))
  }

  async upsert(playerId: string, sport: string, format: string, rating: number, matchesPlayed: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.player_ratings (player_id, sport, format, rating, matches_played, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (player_id, sport, format) DO UPDATE SET
         rating = $4, matches_played = $5, updated_at = now()`,
      [playerId, sport, format, rating, matchesPlayed]
    )
  }

  async appendHistory(
    playerId: string,
    sport: string,
    format: string,
    delta: number,
    ratingAfter: number,
    matchId: string | null = null
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.player_rating_history (player_id, sport, format, delta, rating_after, match_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [playerId, sport, format, delta, ratingAfter, matchId]
    )
  }

  async findLatestHistoryFor(playerId: string, matchId: string): Promise<RatingHistoryEntry | undefined> {
    const res = await this.pool.query(
      `SELECT player_id, sport, format, delta, rating_after, match_id, created_at
       FROM public.player_rating_history
       WHERE player_id = $1 AND match_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [playerId, matchId]
    )

    if (res.rows.length === 0) return undefined

    const row = res.rows[0]
    return {
      playerId: row.player_id,
      sport: row.sport,
      format: row.format,
      delta: parseFloat(row.delta),
      ratingAfter: parseFloat(row.rating_after),
      matchId: row.match_id,
      createdAt: row.created_at,
    }
  }

  async findHistoryFor(playerId: string, sport: string, format: string): Promise<RatingHistoryEntry[]> {
    const res = await this.pool.query(
      `SELECT player_id, sport, format, delta, rating_after, match_id, created_at
       FROM public.player_rating_history
       WHERE player_id = $1 AND sport = $2 AND format = $3
       ORDER BY created_at ASC`,
      [playerId, sport, format]
    )

    return res.rows.map((row) => ({
      playerId: row.player_id,
      sport: row.sport,
      format: row.format,
      delta: parseFloat(row.delta),
      ratingAfter: parseFloat(row.rating_after),
      matchId: row.match_id,
      createdAt: row.created_at,
    }))
  }

  /** Idempotent — no error if the player has no ratings. Used by DSR erasure. */
  async deleteFor(playerId: string): Promise<void> {
    const client = await (this.pool as Pool).connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM public.player_rating_history WHERE player_id = $1`, [playerId])
      await client.query(`DELETE FROM public.player_ratings WHERE player_id = $1`, [playerId])
      await client.query('COMMIT')
      log.debug('player_ratings.deleted', { playerId })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
}
