import { getLogger } from '../logger'
import type { Pool } from 'pg'

const log = getLogger('leaderboard-repository')

export interface ParticipantSlot {
  playerId: string
  nameSnapshot: string
  side: 'team1' | 'team2'
}

export interface PairLeaderboardRow {
  playerA: string
  nameA: string
  playerB: string
  nameB: string
  wins: number
  losses: number
}

export interface IndividualLeaderboardRow {
  playerId: string
  nameSnapshot: string
  wins: number
  losses: number
}

export class LeaderboardRepository {
  constructor(private pool: Pool) {}

  /**
   * Writes one match log row + participant slots. UPSERT on match_ref (idempotent).
   * If the row already exists (ON CONFLICT), participant inserts are skipped.
   */
  async logMatch(
    tournamentId: string,
    groupId: string,
    matchRef: string,
    winningSide: 'team1' | 'team2' | 'draw',
    participants: ParticipantSlot[]
  ): Promise<void> {
    const insertLog = await this.pool.query<{ id: string }>(
      `INSERT INTO public.group_match_log (tournament_id, group_id, match_ref, winning_side)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_ref) DO NOTHING
       RETURNING id`,
      [tournamentId, groupId, matchRef, winningSide]
    )

    // If ON CONFLICT fired, no row returned — skip participant inserts (already written)
    if (insertLog.rows.length === 0) {
      return
    }

    const matchLogId = insertLog.rows[0].id

    for (let slot = 0; slot < participants.length; slot++) {
      const { playerId, nameSnapshot, side } = participants[slot]
      await this.pool.query(
        `INSERT INTO public.group_match_participants (match_log_id, slot, player_id, name_snapshot, side)
         VALUES ($1, $2, $3, $4, $5)`,
        [matchLogId, slot, playerId, nameSnapshot, side]
      )
    }

    log.info('match.logged', { tournamentId, groupId, matchRef })
  }

  /**
   * NULLs player_id for all participant slots belonging to this player.
   * Idempotent — calling multiple times produces the same result.
   */
  async anonymizeMatchLogSlotsFor(playerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.group_match_participants
       SET player_id = NULL
       WHERE player_id = $1`,
      [playerId]
    )
    log.info('match.anonymized', { playerId })
  }

  /**
   * Re-derives pair + individual leaderboard from the current log state.
   * Idempotent: calling N times produces the same result.
   */
  async recomputeLeaderboards(groupId: string): Promise<{
    pairs: PairLeaderboardRow[]
    individuals: IndividualLeaderboardRow[]
  }> {
    const [pairs, individuals] = await Promise.all([
      this.getPairLeaderboard(groupId),
      this.getIndividualLeaderboard(groupId),
    ])
    return { pairs, individuals }
  }

  /** Returns pair leaderboard sorted by wins DESC, losses ASC. */
  async getPairLeaderboard(groupId: string): Promise<PairLeaderboardRow[]> {
    const result = await this.pool.query<{
      player_a: string
      name_a: string
      player_b: string
      name_b: string
      wins: string
      losses: string
    }>(
      `SELECT
         LEAST(p1.player_id, p2.player_id)         AS player_a,
         GREATEST(p1.player_id, p2.player_id)      AS player_b,
         MIN(p1.name_snapshot) FILTER (WHERE p1.player_id < p2.player_id) AS name_a,
         MIN(p2.name_snapshot) FILTER (WHERE p1.player_id < p2.player_id) AS name_b,
         COUNT(*) FILTER (WHERE ml.winning_side = p1.side) AS wins,
         COUNT(*) FILTER (WHERE ml.winning_side != p1.side) AS losses
       FROM public.group_match_participants p1
       JOIN public.group_match_participants p2
         ON  p2.match_log_id = p1.match_log_id
         AND p2.side         = p1.side
         AND p2.slot         > p1.slot
         AND p2.player_id    IS NOT NULL
       JOIN public.group_match_log ml ON ml.id = p1.match_log_id
       WHERE p1.player_id IS NOT NULL AND ml.group_id = $1
       GROUP BY player_a, player_b
       ORDER BY wins DESC, losses ASC`,
      [groupId]
    )
    return result.rows.map(r => ({
      playerA: r.player_a,
      nameA: r.name_a ?? r.player_a,
      playerB: r.player_b,
      nameB: r.name_b ?? r.player_b,
      wins: Number(r.wins),
      losses: Number(r.losses),
    }))
  }

  /** Returns individual leaderboard sorted by wins DESC, losses ASC. */
  async getIndividualLeaderboard(groupId: string): Promise<IndividualLeaderboardRow[]> {
    const result = await this.pool.query<{
      player_id: string
      name_snapshot: string
      wins: string
      losses: string
    }>(
      `SELECT
         p.player_id,
         MIN(p.name_snapshot) AS name_snapshot,
         COUNT(*) FILTER (WHERE ml.winning_side = p.side) AS wins,
         COUNT(*) FILTER (WHERE ml.winning_side != p.side) AS losses
       FROM public.group_match_participants p
       JOIN public.group_match_log ml ON ml.id = p.match_log_id
       WHERE p.player_id IS NOT NULL AND ml.group_id = $1
       GROUP BY p.player_id
       ORDER BY wins DESC, losses ASC`,
      [groupId]
    )
    return result.rows.map(r => ({
      playerId: r.player_id,
      nameSnapshot: r.name_snapshot ?? r.player_id,
      wins: Number(r.wins),
      losses: Number(r.losses),
    }))
  }
}
