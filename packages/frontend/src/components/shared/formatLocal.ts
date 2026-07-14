/**
 * formatLocal — Player Personalization P4 (local-time rendering).
 *
 * FE-rendered timestamps always use the viewer's browser tz (the client
 * always knows it — no fallback logic needed, stored tz is server-side
 * only). Returns an absolute primary string + a relative phrase demoted to
 * secondary — applied to deadlines, poll target times, and match schedules.
 */

export interface LocalTimeParts {
  absolute: string
  relative: string
}

function pluralize(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

function relativePhrase(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime()
  if (Math.abs(diffMs) < 60_000) return 'just now'

  const isFuture = diffMs > 0
  const absMs = Math.abs(diffMs)

  const magnitude =
    absMs >= 86_400_000
      ? pluralize(Math.round(absMs / 86_400_000), 'day')
      : absMs >= 3_600_000
        ? pluralize(Math.round(absMs / 3_600_000), 'hour')
        : pluralize(Math.round(absMs / 60_000), 'minute')

  return isFuture ? `in ${magnitude}` : `${magnitude} ago`
}

/** `now` is injectable for deterministic tests; defaults to the real clock. */
export function formatLocal(iso: string, now: Date = new Date()): LocalTimeParts {
  const target = new Date(iso)
  const absolute = target.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return { absolute, relative: relativePhrase(target, now) }
}
