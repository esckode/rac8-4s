/**
 * Group-timezone resolution — Player Personalization P1b.
 *
 * Thin DB-aware wrapper around the pure `effectiveGroupTimezone` helper
 * (kept pure/unit-testable in timezone.ts): owner pin wins, else the
 * majority of member timezones, else null (callers fall back to UTC).
 */
import { Pool } from 'pg'
import { effectiveGroupTimezone } from './timezone'

export async function resolveEffectiveGroupTimezone(pool: Pool, groupId: string): Promise<string | null> {
  const groupRes = await pool.query(`SELECT group_timezone FROM public.player_groups WHERE id = $1`, [groupId])
  const pin: string | null = groupRes.rows[0]?.group_timezone ?? null

  const membersRes = await pool.query(
    `SELECT ps.timezone
     FROM public.player_group_members m
     LEFT JOIN public.player_settings ps ON ps.player_id = m.player_id
     WHERE m.group_id = $1`,
    [groupId]
  )
  const memberTimezones: Array<string | null> = membersRes.rows.map((r: any) => r.timezone ?? null)

  return effectiveGroupTimezone(pin, memberTimezones)
}
