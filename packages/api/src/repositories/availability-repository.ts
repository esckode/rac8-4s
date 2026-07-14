/**
 * AvailabilityRepository — Player Personalization P12.
 *
 * A row = "I'm free this weekday/day-part" (existence, not a boolean
 * column). PUT does a full-grid replace: delete all of the caller's rows,
 * then insert one per selected slot, in one transaction — so a request
 * that fails partway never leaves a mixed old/new grid.
 */
import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('availability-repository')

export type DayPart = 'morning' | 'afternoon' | 'evening'

export interface AvailabilitySlot {
  weekday: number
  dayPart: DayPart
}

export class AvailabilityRepository {
  constructor(private pool: Pool) {}

  async getSlots(playerId: string): Promise<AvailabilitySlot[]> {
    const res = await this.pool.query(
      `SELECT weekday, day_part FROM public.player_availability WHERE player_id = $1
       ORDER BY weekday, day_part`,
      [playerId]
    )
    return res.rows.map(r => ({ weekday: r.weekday as number, dayPart: r.day_part as DayPart }))
  }

  /** Full-grid replace, transactional. Also stamps player_settings.availability_updated_at. */
  async replaceSlots(playerId: string, slots: AvailabilitySlot[]): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM public.player_availability WHERE player_id = $1`, [playerId])
      for (const slot of slots) {
        await client.query(
          `INSERT INTO public.player_availability (player_id, weekday, day_part, updated_at)
           VALUES ($1, $2, $3, now())`,
          [playerId, slot.weekday, slot.dayPart]
        )
      }
      await client.query(
        `INSERT INTO public.player_settings (player_id, availability_updated_at)
         VALUES ($1, now())
         ON CONFLICT (player_id) DO UPDATE SET availability_updated_at = now()`,
        [playerId]
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  async getAvailabilityUpdatedAt(playerId: string): Promise<Date | null> {
    const res = await this.pool.query(
      `SELECT availability_updated_at FROM public.player_settings WHERE player_id = $1`,
      [playerId]
    )
    const value = res.rows[0]?.availability_updated_at
    return value ? new Date(value) : null
  }

  /**
   * Aggregates counts (never names/ids) of members free per slot, across a
   * given roster — the P12 privacy rule, enforced here at the data layer so
   * no caller can accidentally leak per-member rows upstream.
   */
  async countFreeByGroup(memberIds: string[]): Promise<Array<{ weekday: number; dayPart: DayPart; freeCount: number }>> {
    if (memberIds.length === 0) return []
    const res = await this.pool.query(
      `SELECT weekday, day_part, COUNT(DISTINCT player_id)::int AS free_count
       FROM public.player_availability
       WHERE player_id = ANY($1)
       GROUP BY weekday, day_part
       ORDER BY weekday, day_part`,
      [memberIds]
    )
    return res.rows.map(r => ({
      weekday: r.weekday as number,
      dayPart: r.day_part as DayPart,
      freeCount: r.free_count as number,
    }))
  }

  /** §0.5 — DSR erasure primitive. Idempotent: no rows matched is a no-op. */
  async deleteFor(playerId: string): Promise<void> {
    await this.pool.query(`DELETE FROM public.player_availability WHERE player_id = $1`, [playerId])
    log.debug('player_availability.deleted', { playerId })
  }
}
