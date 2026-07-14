/**
 * PlayerSettingsRepository — Player Personalization P0.
 *
 * One row per player, lazily created on first PATCH. `getOrDefaults` never
 * creates a row — defaults are served in-memory when absent, so simply
 * reading settings (e.g. GET /me) never writes to the DB.
 */
import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('player-settings-repository')

export interface PlayerSettings {
  timezone: string | null
  timezoneManual: boolean
  tableDensity: 'comfortable' | 'compact'
  notifyMentions: boolean
  notifyPolls: boolean
  notifyNudges: boolean
  quietHoursStart: number | null
  quietHoursEnd: number | null
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  timezone: null,
  timezoneManual: false,
  tableDensity: 'comfortable',
  notifyMentions: true,
  notifyPolls: true,
  notifyNudges: true,
  quietHoursStart: null,
  quietHoursEnd: null,
}

export interface PlayerSettingsUpdate {
  timezone?: string | null
  timezoneManual?: boolean
  tableDensity?: 'comfortable' | 'compact'
  notifyMentions?: boolean
  notifyPolls?: boolean
  notifyNudges?: boolean
  quietHoursStart?: number | null
  quietHoursEnd?: number | null
}

function rowToSettings(row: any): PlayerSettings {
  return {
    timezone: row.timezone,
    timezoneManual: row.timezone_manual,
    tableDensity: row.table_density,
    notifyMentions: row.notify_mentions,
    notifyPolls: row.notify_polls,
    notifyNudges: row.notify_nudges,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
  }
}

export class PlayerSettingsRepository {
  constructor(private pool: Pool) {}

  async getOrDefaults(playerId: string): Promise<PlayerSettings> {
    const res = await this.pool.query(`SELECT * FROM public.player_settings WHERE player_id = $1`, [playerId])
    if (res.rows.length === 0) return { ...DEFAULT_PLAYER_SETTINGS }
    return rowToSettings(res.rows[0])
  }

  /**
   * Lazily upsert: merges `updates` onto the current row (or defaults if
   * absent) and writes the full row back.
   */
  async upsert(playerId: string, updates: PlayerSettingsUpdate): Promise<PlayerSettings> {
    const current = await this.getOrDefaults(playerId)
    const merged: PlayerSettings = {
      timezone: updates.timezone !== undefined ? updates.timezone : current.timezone,
      timezoneManual: updates.timezoneManual !== undefined ? updates.timezoneManual : current.timezoneManual,
      tableDensity: updates.tableDensity !== undefined ? updates.tableDensity : current.tableDensity,
      notifyMentions: updates.notifyMentions !== undefined ? updates.notifyMentions : current.notifyMentions,
      notifyPolls: updates.notifyPolls !== undefined ? updates.notifyPolls : current.notifyPolls,
      notifyNudges: updates.notifyNudges !== undefined ? updates.notifyNudges : current.notifyNudges,
      quietHoursStart: updates.quietHoursStart !== undefined ? updates.quietHoursStart : current.quietHoursStart,
      quietHoursEnd: updates.quietHoursEnd !== undefined ? updates.quietHoursEnd : current.quietHoursEnd,
    }

    const res = await this.pool.query(
      `INSERT INTO public.player_settings
         (player_id, timezone, timezone_manual, table_density,
          notify_mentions, notify_polls, notify_nudges, quiet_hours_start, quiet_hours_end, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (player_id) DO UPDATE SET
         timezone = $2, timezone_manual = $3, table_density = $4,
         notify_mentions = $5, notify_polls = $6, notify_nudges = $7,
         quiet_hours_start = $8, quiet_hours_end = $9, updated_at = now()
       RETURNING *`,
      [
        playerId, merged.timezone, merged.timezoneManual, merged.tableDensity,
        merged.notifyMentions, merged.notifyPolls, merged.notifyNudges,
        merged.quietHoursStart, merged.quietHoursEnd,
      ]
    )
    return rowToSettings(res.rows[0])
  }

  /** Idempotent — no error if the row doesn't exist. Used by DSR erasure. */
  async deleteFor(playerId: string): Promise<void> {
    await this.pool.query(`DELETE FROM public.player_settings WHERE player_id = $1`, [playerId])
    log.debug('player_settings.deleted', { playerId })
  }
}
