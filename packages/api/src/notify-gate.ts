/**
 * Player Personalization P9 — per-event notify prefs.
 *
 * The AND-layer applied on top of the existing group-level notify_level dial
 * (group-notify-selector.ts, untouched — B-Q11 regression stays intact): a
 * recipient selected by that dial can still be suppressed by their own
 * global per-event toggle. This gates the alert channel only — the durable
 * Notifications Center row is written regardless (ISSUE-67), since that record
 * is what makes dropping an alert rather than deferring it acceptable.
 *
 * Quiet hours are stored (player_settings.quiet_hours_enabled/start/end) and
 * surfaced in Profile, but deliberately gate nothing here (ISSUE-66). The only
 * channel messaging.notify drives today is email — notify-processor.ts takes an
 * emailAdapter, and there is no web push in the repo — so suppressing it buys
 * no quiet while costing a notification the player never learns about. When a
 * device channel exists, quiet hours belong in the service worker, where the
 * device knows its own local time instead of depending on a stored timezone
 * that may be absent or stale. `quiet-hours.ts` holds the predicate for then.
 */
import { Pool } from 'pg'
import { PlayerSettingsRepository } from './repositories/player-settings-repository'

export type NotifyEventType = 'mentions' | 'polls' | 'nudges' | null

export async function shouldEnqueueNotify(
  pool: Pool,
  playerId: string,
  eventType: NotifyEventType
): Promise<boolean> {
  const settings = await new PlayerSettingsRepository(pool).getOrDefaults(playerId)

  if (eventType === 'mentions' && !settings.notifyMentions) return false
  if (eventType === 'polls' && !settings.notifyPolls) return false
  if (eventType === 'nudges' && !settings.notifyNudges) return false

  return true
}
