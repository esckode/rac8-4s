/**
 * Player Personalization P9 — per-event notify prefs + quiet hours.
 *
 * The AND-layer applied on top of the existing group-level notify_level dial
 * (group-notify-selector.ts, untouched — B-Q11 regression stays intact): a
 * recipient selected by that dial can still be suppressed by their own
 * global per-event toggle or by their own quiet hours. Quiet hours DROP the
 * push entirely (no job enqueued, nothing deferred) — the item still shows
 * via pending-actions (P5), which has no dependency on notify settings.
 */
import { Pool } from 'pg'
import { PlayerSettingsRepository } from './repositories/player-settings-repository'
import { isWithinQuietHours } from './quiet-hours'

export type NotifyEventType = 'mentions' | 'polls' | 'nudges' | null

function hourInTimezone(now: Date, timezone: string): number {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(now)
  return parseInt(hourStr, 10) % 24
}

export async function shouldEnqueueNotify(
  pool: Pool,
  playerId: string,
  eventType: NotifyEventType,
  now: Date = new Date()
): Promise<boolean> {
  const settings = await new PlayerSettingsRepository(pool).getOrDefaults(playerId)

  if (eventType === 'mentions' && !settings.notifyMentions) return false
  if (eventType === 'polls' && !settings.notifyPolls) return false
  if (eventType === 'nudges' && !settings.notifyNudges) return false

  const hour = hourInTimezone(now, settings.timezone ?? 'UTC')
  if (isWithinQuietHours(hour, settings.quietHoursStart, settings.quietHoursEnd)) return false

  return true
}
