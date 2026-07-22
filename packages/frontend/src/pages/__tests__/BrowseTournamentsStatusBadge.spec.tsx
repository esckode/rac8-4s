/**
 * ISSUE-9 — Browse discovery board showed raw status enums (e.g.
 * "Group_stage_active") and badged a past-deadline registration_open
 * tournament as "Reg Open". Asserts every rendered status badge is
 * friendly copy (never a raw snake_case enum) on both the featured card
 * and the list cards, and that an expired-open tournament badges
 * "Closed" instead of "Reg Open".
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowseTournaments } from '../BrowseTournaments'

jest.mock('../../hooks/usePendingActions', () => ({
  usePendingActions: () => ({ unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null }),
}))

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

function makeTournament(overrides: Partial<{
  id: string; name: string; sport: string; matchFormat: string; maxPlayers: number
  registrationDeadline: string; status: string; registeredCount: number
}> = {}) {
  return {
    id: 't1', name: 'Tournament', sport: 'tennis', matchFormat: 'singles', maxPlayers: 16,
    registrationDeadline: FUTURE, status: 'registration_open', registeredCount: 0,
    ...overrides,
  }
}

function mockTournaments(tournaments: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ tournaments }),
  } as unknown as Response)
}

describe('ISSUE-9 — Browse status badges', () => {
  it('never renders a raw snake_case status enum', async () => {
    mockTournaments([
      makeTournament({ id: 't1', name: 'Featured One', status: 'registration_open' }),
      makeTournament({ id: 't2', name: 'In Progress One', status: 'group_stage_active' }),
      makeTournament({ id: 't3', name: 'In Progress Two', status: 'group_stage_complete' }),
      makeTournament({ id: 't4', name: 'Knockout One', status: 'knockout_active' }),
    ])
    render(<BrowseTournaments />)

    await waitFor(() => expect(screen.getByText('Featured One')).toBeInTheDocument())

    expect(screen.queryByText('Group_stage_active')).not.toBeInTheDocument()
    expect(screen.queryByText('Group_stage_complete')).not.toBeInTheDocument()
    expect(screen.queryByText('Knockout_active')).not.toBeInTheDocument()
    expect(screen.queryByText(/_/)).not.toBeInTheDocument()
  })

  it('badges group_stage_active as "In Progress"', async () => {
    mockTournaments([
      makeTournament({ id: 't1', name: 'Featured', status: 'registration_open' }),
      makeTournament({ id: 't2', name: 'Ongoing Match', status: 'group_stage_active' }),
    ])
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByText('Ongoing Match')).toBeInTheDocument())
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0)
  })

  it('badges an open tournament with a future deadline as "Reg Open"', async () => {
    mockTournaments([makeTournament({ status: 'registration_open', registrationDeadline: FUTURE })])
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByText('Tournament')).toBeInTheDocument())
    expect(screen.getByText('Reg Open')).toBeInTheDocument()
  })

  it('badges an open tournament with a past deadline as "Closed", not "Reg Open"', async () => {
    mockTournaments([makeTournament({ status: 'registration_open', registrationDeadline: PAST })])
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByText('Tournament')).toBeInTheDocument())
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.queryByText('Reg Open')).not.toBeInTheDocument()
  })

  it('renders a status badge on the featured card', async () => {
    mockTournaments([makeTournament({ status: 'registration_open', registrationDeadline: FUTURE })])
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByTestId('tournament-list tournament-card')).toBeInTheDocument())
    expect(screen.getByTestId('tournament-list tournament-card')).toHaveTextContent('Reg Open')
  })
})
