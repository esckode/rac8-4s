/**
 * ISSUE-10 — "Register soon" featured selection: replaces the old
 * positional filteredTournaments[0] with a curated set.
 * Eligibility: open, deadline not yet passed, has spots available.
 * Sort: most-registered first, tiebreak soonest-closing.
 * Capped at 3.
 */
export interface FeaturedEligibleTournament {
  id: string
  status: string
  registrationDeadline: string
  maxPlayers: number
  registeredCount: number
}

const MAX_FEATURED = 3

export function selectFeatured<T extends FeaturedEligibleTournament>(tournaments: T[]): T[] {
  const now = Date.now()
  return tournaments
    .filter(t =>
      t.status === 'registration_open' &&
      new Date(t.registrationDeadline).getTime() > now &&
      t.registeredCount < t.maxPlayers
    )
    .sort((a, b) => {
      if (b.registeredCount !== a.registeredCount) return b.registeredCount - a.registeredCount
      return new Date(a.registrationDeadline).getTime() - new Date(b.registrationDeadline).getTime()
    })
    .slice(0, MAX_FEATURED)
}
