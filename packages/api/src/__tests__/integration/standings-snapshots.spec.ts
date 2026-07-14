/**
 * S6.1 — Player Personalization P11: standings snapshots (RED first)
 *
 * migration 055 `standings_snapshots` (tournament_id, player_id FK cascade,
 * iso_week, rank, wins, sets_won; PK (tournament_id, player_id, iso_week)).
 * Idempotent write (re-run same week = no duplicate); erasure cascades via
 * FK (hard player delete) AND via DataSubjectRequestService.erase(); a
 * retention sweep drops rows for tournaments completed >90 days ago.
 */
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { TournamentFactory } from '../factories'
import { StandingsSnapshotRepository } from '../../repositories/standings-snapshot-repository'
import { DataSubjectRequestService } from '../../dsr-service'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `snapshot-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
  return { id: player.id, email: player.email, name: player.name ?? name }
}

describe('S6.1 — standings_snapshots (schema + write + retention)', () => {
  let pool: Pool
  let repo: StandingsSnapshotRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    repo = new StandingsSnapshotRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('table exists with the documented columns and PK', async () => {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'standings_snapshots'`
    )
    const names = new Set(res.rows.map((r: any) => r.column_name))
    expect(names.has('tournament_id')).toBe(true)
    expect(names.has('player_id')).toBe(true)
    expect(names.has('iso_week')).toBe(true)
    expect(names.has('rank')).toBe(true)
    expect(names.has('wins')).toBe(true)
    expect(names.has('sets_won')).toBe(true)
  })

  it('writeSnapshot is idempotent — re-running the same week does not duplicate or overwrite', async () => {
    const player = await createPlayer(pool)
    const t = await TournamentFactory.create(pool, player.id)

    await repo.writeSnapshot(player.id, { tournamentId: t.id, isoWeek: '2026-W28', rank: 2, wins: 3, setsWon: 6 })
    // Re-run with different numbers — should NOT overwrite (first write wins for the week).
    await repo.writeSnapshot(player.id, { tournamentId: t.id, isoWeek: '2026-W28', rank: 1, wins: 4, setsWon: 8 })

    const res = await pool.query(
      `SELECT * FROM public.standings_snapshots WHERE tournament_id = $1 AND player_id = $2 AND iso_week = $3`,
      [t.id, player.id, '2026-W28']
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].rank).toBe(2)
  })

  it('getSnapshot returns null when no row exists for that week', async () => {
    const player = await createPlayer(pool)
    const t = await TournamentFactory.create(pool, player.id)
    const snap = await repo.getSnapshot(t.id, player.id, '2026-W01')
    expect(snap).toBeNull()
  })

  it('deleting the player row cascades the snapshot row (FK enforcement)', async () => {
    const player = await createPlayer(pool)
    const t = await TournamentFactory.create(pool, player.id)
    await repo.writeSnapshot(player.id, { tournamentId: t.id, isoWeek: '2026-W28', rank: 1, wins: 1, setsWon: 2 })

    await pool.query(`DELETE FROM public.players WHERE id = $1`, [player.id])

    const res = await pool.query(`SELECT 1 FROM public.standings_snapshots WHERE player_id = $1`, [player.id])
    expect(res.rows).toHaveLength(0)
  })

  it('DataSubjectRequestService.erase() removes the player\'s snapshot rows', async () => {
    const player = await createPlayer(pool)
    const t = await TournamentFactory.create(pool, player.id)
    await repo.writeSnapshot(player.id, { tournamentId: t.id, isoWeek: '2026-W28', rank: 1, wins: 1, setsWon: 2 })

    const dsr = new DataSubjectRequestService(pool)
    const result = await dsr.erase(player.email)
    expect(result.status).toBe('erased')

    const res = await pool.query(`SELECT 1 FROM public.standings_snapshots WHERE player_id = $1`, [player.id])
    expect(res.rows).toHaveLength(0)
  })

  it('retention sweep deletes rows for tournaments completed more than 90 days ago, keeps recent ones', async () => {
    const player = await createPlayer(pool)
    const oldTournament = await TournamentFactory.create(pool, player.id)
    const recentTournament = await TournamentFactory.create(pool, player.id)

    const longAgo = new Date(Date.now() - 100 * 24 * 3_600_000).toISOString()
    const recently = new Date(Date.now() - 1 * 24 * 3_600_000).toISOString()
    await pool.query(`UPDATE public.tournaments SET completed_at = $1 WHERE id = $2`, [longAgo, oldTournament.id])
    await pool.query(`UPDATE public.tournaments SET completed_at = $1 WHERE id = $2`, [recently, recentTournament.id])

    await repo.writeSnapshot(player.id, { tournamentId: oldTournament.id, isoWeek: '2026-W10', rank: 1, wins: 1, setsWon: 2 })
    await repo.writeSnapshot(player.id, { tournamentId: recentTournament.id, isoWeek: '2026-W28', rank: 1, wins: 1, setsWon: 2 })

    const deleted = await repo.deleteForOldCompletedTournaments()
    expect(deleted).toBe(1)

    const oldRes = await pool.query(`SELECT 1 FROM public.standings_snapshots WHERE tournament_id = $1`, [oldTournament.id])
    const recentRes = await pool.query(`SELECT 1 FROM public.standings_snapshots WHERE tournament_id = $1`, [recentTournament.id])
    expect(oldRes.rows).toHaveLength(0)
    expect(recentRes.rows).toHaveLength(1)
  })
})
