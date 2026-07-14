/**
 * Player Personalization P9 — quiet-hours pure predicate.
 *
 * Evaluated in the player's own tz (P1a): callers resolve the player's
 * current local hour (0-23) before calling this. Handles wrap-around
 * windows (e.g. 22 -> 7) as well as normal (start < end) ones. Either
 * bound null, or start === end, means "no quiet-hours window".
 */
export function isWithinQuietHours(hour: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false
  if (start < end) {
    return hour >= start && hour < end
  }
  return hour >= start || hour < end
}
