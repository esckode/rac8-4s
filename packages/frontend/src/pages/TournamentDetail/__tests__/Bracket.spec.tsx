/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Player } from '@shared/types'
import { Bracket } from '../Bracket'
import type { BracketRound } from '../../../types'
import * as TournamentHook from '../../../hooks/useTournament'
import * as PermissionsHook from '../../../hooks/usePermissions'
import * as AuthHook from '../../../hooks/useAuth'
import { playerCache } from '../../../state'

jest.mock('../../../hooks/useTournament')
jest.mock('../../../hooks/usePermissions')
jest.mock('../../../hooks/useAuth')
jest.mock('react-router-dom', () => ({ useParams: () => ({ tournamentId: 't1' }) }))
// The organizer tree is a React Flow canvas; stub it (covered by its own unit
// tests + e2e). Here we only assert it is the chosen organizer view.
jest.mock('../../../components/shared/OrganizerBracket', () => ({
  OrganizerBracket: ({ rounds }: { rounds: unknown[] }) => (
    <div data-testid="bracket-tree">tree:{rounds.length}</div>
  ),
}))
jest.mock('../../../api/client', () => ({
  submitScore: jest.fn().mockResolvedValue({ queued: false }),
  editScore: jest.fn().mockResolvedValue({ queued: false }),
}))
const { submitScore } = jest.requireMock('../../../api/client')

const mockUseTournament = TournamentHook.useTournament as jest.MockedFunction<typeof TournamentHook.useTournament>
const mockUsePermissions = PermissionsHook.usePermissions as jest.MockedFunction<typeof PermissionsHook.usePermissions>
const mockUseAuth = AuthHook.useAuth as jest.MockedFunction<typeof AuthHook.useAuth>

const rounds: BracketRound[] = [
  {
    round: 1,
    matches: [
      { id: 'sf1', round: 1, position: 0, player1Id: 'p1', player2Id: 'p4', winnerId: null, score: null, status: 'pending' },
      { id: 'sf2', round: 1, position: 1, player1Id: 'p2', player2Id: 'p3', winnerId: null, score: null, status: 'pending' },
    ],
  },
  {
    round: 2,
    matches: [
      { id: 'final', round: 2, position: 0, player1Id: null, player2Id: null, winnerId: null, score: null, status: 'pending' },
    ],
  },
]

function mockTournament(over: Partial<ReturnType<typeof TournamentHook.useTournament>> = {}) {
  mockUseTournament.mockReturnValue({
    tournament: null,
    standings: [],
    matches: { group: [], knockout: [] },
    bracket: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    retryIn: null,
    cancelAutoRetry: jest.fn(),
    ...over,
  } as any)
}

function asRole(role: 'player' | 'organizer') {
  mockUsePermissions.mockReturnValue({
    playerRole: role === 'player',
    organizerRole: role === 'organizer',
    canEditScores: role === 'organizer',
    canPublishBracket: role === 'organizer',
    canManageGroups: role === 'organizer',
    canViewAllStandings: role === 'organizer',
  })
  mockUseAuth.mockReturnValue({
    user: { id: role === 'player' ? 'p1' : 'org1', email: 'x@example.com', role },
    isAuthenticated: true,
    loading: false,
  } as any)
}

describe('Bracket', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    playerCache.clear()
    ;(['p1', 'p2', 'p3', 'p4'] as const).forEach((id, i) =>
      playerCache.set({ id, name: `Player ${i + 1}` } as Player)
    )
  })

  it('prompts sign-in when unauthenticated', () => {
    mockTournament()
    mockUsePermissions.mockReturnValue({
      playerRole: false, organizerRole: false, canEditScores: false,
      canPublishBracket: false, canManageGroups: false, canViewAllStandings: false,
    })
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, loading: false } as any)

    render(<Bracket />)
    expect(screen.getByText(/sign in to view bracket/i)).toBeInTheDocument()
  })

  it('shows the loading state', () => {
    mockTournament({ isLoading: true })
    asRole('player')
    render(<Bracket />)
    expect(screen.getByText(/loading bracket/i)).toBeInTheDocument()
  })

  it('shows the error state with a retry control', () => {
    const refetch = jest.fn()
    mockTournament({ error: { code: 'FETCH_ERROR', message: 'Network down' }, refetch })
    asRole('player')
    render(<Bracket />)
    expect(screen.getByText('Failed to load bracket')).toBeInTheDocument()
    expect(screen.getByText('Network down')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/try again/i))
    expect(refetch).toHaveBeenCalled()
  })

  it('shows a pending-generation message when the bracket is not yet generated', () => {
    mockTournament({ bracket: null })
    asRole('player')
    render(<Bracket />)
    expect(screen.getByTestId('bracket-pending')).toHaveTextContent(/group stage completes/i)
  })

  it('renders the React Flow tree for an organizer', () => {
    mockTournament({ bracket: { rounds, totalPlayers: 4, byeCount: 0 } })
    asRole('organizer')
    render(<Bracket />)
    expect(screen.getByTestId('bracket-tree')).toBeInTheDocument()
  })

  it('shows a match-focused list with submit for a player (only playable matches)', () => {
    mockTournament({ bracket: { rounds, totalPlayers: 4, byeCount: 0 } })
    asRole('player')
    render(<Bracket />)
    // sf1 + sf2 are playable; the TBD final is hidden
    expect(screen.getAllByTestId('match-card')).toHaveLength(2)
    expect(screen.queryByTestId('bracket-tree')).not.toBeInTheDocument()
  })

  it('closes the score form via cancel', () => {
    mockTournament({ bracket: { rounds, totalPlayers: 4, byeCount: 0 } })
    asRole('player')
    render(<Bracket />)
    fireEvent.click(screen.getAllByTestId('submit-score-button')[0])
    expect(screen.getByTestId('score-submit-form')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('score-submit-form')).not.toBeInTheDocument()
  })

  it('submits a knockout score and refetches on success', async () => {
    const refetch = jest.fn()
    localStorage.setItem('auth_token', 'tok')
    mockTournament({ bracket: { rounds, totalPlayers: 4, byeCount: 0 }, refetch })
    asRole('player')
    render(<Bracket />)

    fireEvent.click(screen.getAllByTestId('submit-score-button')[0])
    fireEvent.change(screen.getByTestId('score-input'), { target: { value: '11-9, 11-7' } })
    fireEvent.click(screen.getByTestId('score-submit'))

    await waitFor(() => expect(refetch).toHaveBeenCalled())
    expect(submitScore).toHaveBeenCalledWith('t1', 'sf1', '11-9, 11-7', 'tok', 'knockout')
    localStorage.clear()
  })

  it('shows "Updated HH:MM" on the pending-generation message when offline (D4)', () => {
    const updatedAtIso = new Date(2026, 6, 18, 10, 30).toISOString()
    mockTournament({ bracket: null, updatedAt: updatedAtIso })
    asRole('player')

    render(<Bracket />)

    expect(screen.getByTestId('bracket-pending')).toBeInTheDocument()
    expect(screen.getByTestId('snapshot-updated-at')).toHaveTextContent('Updated 10:30')
  })

  it('shows "Updated HH:MM" on the match list when offline (D4)', () => {
    const updatedAtIso = new Date(2026, 6, 18, 10, 30).toISOString()
    mockTournament({ bracket: { rounds, totalPlayers: 4, byeCount: 0 }, updatedAt: updatedAtIso })
    asRole('player')

    render(<Bracket />)

    expect(screen.getByTestId('snapshot-updated-at')).toHaveTextContent('Updated 10:30')
  })
})
