/**
 * Timezone hierarchy — Player Personalization P1 (design §P1).
 *
 * Pure helpers shared by the group-settings route (owner pin), the digest
 * sweep (timing gate), and Coach's group prose (absolute times).
 */

/**
 * Majority-derived timezone across a set of member timezones. Ties break to
 * the lexically-earlier IANA zone name. Empty/all-null input → null.
 */
export function majorityTimezone(timezones: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>()
  for (const tz of timezones) {
    if (!tz) continue
    counts.set(tz, (counts.get(tz) ?? 0) + 1)
  }

  let winner: string | null = null
  let winnerCount = 0
  for (const [tz, count] of counts) {
    if (count > winnerCount || (count === winnerCount && winner !== null && tz < winner)) {
      winner = tz
      winnerCount = count
    }
  }
  return winner
}

/** Effective group timezone: owner pin wins, else the member majority, else null (UTC fallback). */
export function effectiveGroupTimezone(
  pin: string | null | undefined,
  memberTimezones: Array<string | null | undefined>
): string | null {
  return pin ?? majorityTimezone(memberTimezones)
}
