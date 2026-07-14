/**
 * StandingsSnapshotRepository — Player Personalization P11.
 *
 * One row per (tournament, player, iso_week), written by the weekly digest
 * sweep just before composing so a rank-movement line can be computed by
 * diffing against the previous week's row. Singles only (see migration 055
 * — a doubles team id has no players row to satisfy the FK).
 */
import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('standings-snapshot-repository')

export interface StandingsSnapshotRow {
  tournamentId: string
  playerId: string
  isoWeek: string
  rank: number
  wins: number
  setsWon: number
}

export interface SnapshotInput {
  tournamentId: string
  isoWeek: string
  rank: number
  wins: number
  setsWon: number
}

const RETENTION_DAYS = 90

export class StandingsSnapshotRepository {
  constructor(private pool: Pool) {}

  /** Idempotent — ON CONFLICT DO NOTHING, so re-running the same week is a no-op. */
  async writeSnapshot(playerId: string, input: SnapshotInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.standings_snapshots (tournament_id, player_id, iso_week, rank, wins, sets_won)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tournament_id, player_id, iso_week) DO NOTHING`,
      [input.tournamentId, playerId, input.isoWeek, input.rank, input.wins, input.setsWon]
    )
  }

  async getSnapshot(tournamentId: string, playerId: string, isoWeek: string): Promise<StandingsSnapshotRow | null> {
    const res = await this.pool.query(
      `SELECT tournament_id, player_id, iso_week, rank, wins, sets_won
       FROM public.standings_snapshots WHERE tournament_id = $1 AND player_id = $2 AND iso_week = $3`,
      [tournamentId, playerId, isoWeek]
    )
    if (res.rows.length === 0) return null
    const row = res.rows[0]
    return {
      tournamentId: row.tournament_id,
      playerId: row.player_id,
      isoWeek: row.iso_week,
      rank: row.rank,
      wins: row.wins,
      setsWon: row.sets_won,
    }
  }

  /** §0.5 — DSR erasure primitive. Idempotent: no rows matches is a no-op. */
  async deleteFor(playerId: string): Promise<void> {
    await this.pool.query(`DELETE FROM public.standings_snapshots WHERE player_id = $1`, [playerId])
    log.debug('standings_snapshots.deleted', { playerId })
  }

  /** Retention sweep: drop rows for tournaments completed more than 90 days ago. */
  async deleteForOldCompletedTournaments(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 3_600_000)
    const res = await this.pool.query(
      `DELETE FROM public.standings_snapshots s
       USING public.tournaments t
       WHERE s.tournament_id = t.id
         AND t.completed_at IS NOT NULL
         AND t.completed_at < $1`,
      [cutoff]
    )
    const deleted = res.rowCount ?? 0
    if (deleted > 0) log.info('standings_snapshots.retention_swept', { deleted })
    return deleted
  }
}
