/**
 * ISSUE-10 — Featured section replaced with a curated "Register soon" set:
 * open + future-deadline + has-spots, sorted most-registered desc
 * (tiebreak soonest deadline), capped at 3, excluded from "All Tournaments"
 * so no card duplicates.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowseTournaments } from '../BrowseTournaments'

jest.mock('../../hooks/usePendingActions', () => ({
  usePendingActions: () => ({ unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null }),
}))

const FUTURE = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

function makeTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1', name: 'Tournament', sport: 'tennis', matchFormat: 'singles', maxPlayers: 16,
    registrationDeadline: FUTURE(7), status: 'registration_open', registeredCount: 0,
    ...overrides,
  }
}

function mockTournaments(tournaments: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ tournaments }),
  } as unknown as Response)
}

describe('ISSUE-10 — Featured "Register soon" curation', () => {
  it('relabels the section "Register soon" instead of "FEATURED"', async () => {
    mockTournaments([makeTournament({ id: 't1', name: 'Solo', registeredCount: 3, maxPlayers: 16 })])
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByText('Solo')).toBeInTheDocument())

    expect(screen.getByText('Register soon')).toBeInTheDocument()
    expect(screen.queryByText('FEATURED')).not.toBeInTheDocument()
  })

  it('features the most-registered eligible tournaments, capped at 3, excluded from All Tournaments', async () => {
    const tournaments = [
      makeTournament({ id: 'a', name: 'Almost Full', registeredCount: 15, maxPlayers: 16 }),
      makeTournament({ id: 'b', name: 'Half Full', registeredCount: 8, maxPlayers: 16 }),
      makeTournament({ id: 'c', name: 'Quarter Full', registeredCount: 4, maxPlayers: 16 }),
      makeTournament({ id: 'd', name: 'Sparse', registeredCount: 1, maxPlayers: 16 }),
      makeTournament({ id: 'e', name: 'Empty', registeredCount: 0, maxPlayers: 16 }),
    ]
    mockTournaments(tournaments)
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByText('Almost Full')).toBeInTheDocument())

    // Featured: top 3 most-registered
    expect(screen.getByText('Almost Full')).toBeInTheDocument()
    expect(screen.getByText('Half Full')).toBeInTheDocument()
    expect(screen.getByText('Quarter Full')).toBeInTheDocument()

    // All Tournaments: the remaining 2, and none of the featured 3 duplicate into it
    expect(screen.getByText('Sparse')).toBeInTheDocument()
    expect(screen.getByText('Empty')).toBeInTheDocument()
    expect(screen.getAllByText('Almost Full')).toHaveLength(1)
    expect(screen.getAllByText('Half Full')).toHaveLength(1)
    expect(screen.getAllByText('Quarter Full')).toHaveLength(1)
  })

  it('excludes a full tournament from Featured (registeredCount >= maxPlayers)', async () => {
    mockTournaments([
      makeTournament({ id: 'full', name: 'Full House', registeredCount: 16, maxPlayers: 16 }),
      makeTournament({ id: 'open', name: 'Has Spots', registeredCount: 1, maxPlayers: 16 }),
    ])
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByText('Has Spots')).toBeInTheDocument())

    expect(screen.getByText('Register soon')).toBeInTheDocument()
    // "Full House" still shows (discovery board keeps showing it), just not featured
    expect(screen.getByText('Full House')).toBeInTheDocument()
  })

  it('excludes an expired-deadline tournament from Featured', async () => {
    mockTournaments([
      makeTournament({ id: 'expired', name: 'Expired', registrationDeadline: PAST, registeredCount: 10 }),
      makeTournament({ id: 'open', name: 'Still Open', registeredCount: 1 }),
    ])
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByText('Still Open')).toBeInTheDocument())
    expect(screen.getByText('Register soon')).toBeInTheDocument()
  })

  it('hides the "Register soon" section entirely when nothing is eligible', async () => {
    mockTournaments([makeTournament({ id: 't1', name: 'In Progress Only', status: 'group_stage_active' })])
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByText('In Progress Only')).toBeInTheDocument())
    expect(screen.queryByText('Register soon')).not.toBeInTheDocument()
  })
})
