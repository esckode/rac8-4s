/**
 * Weekly digest template (Phase C / T3.2 — design §11 C-Q11).
 *
 * Template-only in v1 (no standings-movement diffs — needs a snapshot store,
 * rejected). Three sections computed from existing repo data: results this
 * week, matches pending, nearest upcoming deadline. All three empty → null
 * (skip — no digest posts for a dead week).
 */

export interface DigestResult {
  player1Name: string
  player2Name: string
  score: string
}

export interface DigestUpcomingDeadline {
  tournamentName: string
  hoursRemaining: number
}

/** Pure template — digest ≤120 words (Q16 addendum). Null means "skip, nothing to say". */
export function buildDigest(
  groupName: string,
  resultsThisWeek: DigestResult[],
  pendingCount: number,
  upcomingDeadline: DigestUpcomingDeadline | null
): string | null {
  if (resultsThisWeek.length === 0 && pendingCount === 0 && upcomingDeadline === null) {
    return null
  }

  const parts: string[] = []

  if (resultsThisWeek.length > 0) {
    const lines = resultsThisWeek.map(r => `${r.player1Name} beat ${r.player2Name} ${r.score}`)
    parts.push(`Results this week: ${lines.join('; ')}.`)
  }

  if (pendingCount > 0) {
    parts.push(`Matches pending: ${pendingCount}.`)
  }

  if (upcomingDeadline) {
    const relative =
      upcomingDeadline.hoursRemaining <= 24
        ? 'less than a day left'
        : `${Math.ceil(upcomingDeadline.hoursRemaining / 24)} days left`
    parts.push(`Nearest deadline: ${upcomingDeadline.tournamentName} — ${relative}.`)
  }

  return `${groupName} weekly digest. ${parts.join(' ')}`
}
