import { selectFeatured, type FeaturedEligibleTournament } from '../featuredSelection'

const FUTURE = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

function makeTournament(overrides: Partial<FeaturedEligibleTournament> = {}): FeaturedEligibleTournament {
  return {
    id: 't1',
    status: 'registration_open',
    registrationDeadline: FUTURE(7),
    maxPlayers: 16,
    registeredCount: 0,
    ...overrides,
  }
}

describe('selectFeatured (ISSUE-10)', () => {
  it('excludes tournaments that are not registration_open', () => {
    const t = makeTournament({ status: 'group_stage_active' })
    expect(selectFeatured([t])).toEqual([])
  })

  it('excludes tournaments with a past registration deadline', () => {
    const t = makeTournament({ registrationDeadline: PAST })
    expect(selectFeatured([t])).toEqual([])
  })

  it('excludes full tournaments (registeredCount >= maxPlayers)', () => {
    const t = makeTournament({ maxPlayers: 8, registeredCount: 8 })
    expect(selectFeatured([t])).toEqual([])
  })

  it('includes an eligible tournament', () => {
    const t = makeTournament({ id: 'eligible', maxPlayers: 8, registeredCount: 3 })
    expect(selectFeatured([t]).map(x => x.id)).toEqual(['eligible'])
  })

  it('sorts by registeredCount descending (most-registered first)', () => {
    const low = makeTournament({ id: 'low', registeredCount: 1 })
    const high = makeTournament({ id: 'high', registeredCount: 5 })
    expect(selectFeatured([low, high]).map(t => t.id)).toEqual(['high', 'low'])
  })

  it('tiebreaks equal registeredCount by soonest registrationDeadline ascending', () => {
    const soon = makeTournament({ id: 'soon', registeredCount: 2, registrationDeadline: FUTURE(1) })
    const later = makeTournament({ id: 'later', registeredCount: 2, registrationDeadline: FUTURE(10) })
    expect(selectFeatured([later, soon]).map(t => t.id)).toEqual(['soon', 'later'])
  })

  it('caps the result at 3', () => {
    const tournaments = [1, 2, 3, 4, 5].map(n => makeTournament({ id: `t${n}`, registeredCount: n }))
    expect(selectFeatured(tournaments)).toHaveLength(3)
  })

  it('the top 3 are the most-registered', () => {
    const tournaments = [1, 2, 3, 4, 5].map(n => makeTournament({ id: `t${n}`, registeredCount: n }))
    expect(selectFeatured(tournaments).map(t => t.id)).toEqual(['t5', 't4', 't3'])
  })

  it('returns an empty array when nothing is eligible', () => {
    expect(selectFeatured([])).toEqual([])
  })
})
