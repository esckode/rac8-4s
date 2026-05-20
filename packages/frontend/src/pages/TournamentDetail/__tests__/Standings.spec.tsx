/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Standings } from '../Standings'
import * as TournamentHook from '../../../hooks/useTournament'
import * as PermissionsHook from '../../../hooks/usePermissions'
import * as AuthHook from '../../../hooks/useAuth'

jest.mock('../../../hooks/useTournament')
jest.mock('../../../hooks/usePermissions')
jest.mock('../../../hooks/useAuth')

const mockUseTournament = TournamentHook.useTournament as jest.MockedFunction<typeof TournamentHook.useTournament>
const mockUsePermissions = PermissionsHook.usePermissions as jest.MockedFunction<typeof PermissionsHook.usePermissions>
const mockUseAuth = AuthHook.useAuth as jest.MockedFunction<typeof AuthHook.useAuth>

describe('Standings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })
  })

  it('renders standings table with data', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [
        { playerId: '1', rank: 1, wins: 5, losses: 1, setsWon: 10, setsLost: 3 },
        { playerId: '2', rank: 2, wins: 4, losses: 2, setsWon: 9, setsLost: 5 },
      ],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    render(<Standings />)

    expect(screen.getByText('Standings')).toBeInTheDocument()
    expect(screen.getByText('2 players registered')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    })

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    render(<Standings />)

    expect(screen.getByText('Standings')).toBeInTheDocument()
  })

  it('shows error state with retry button', () => {
    const refetchMock = jest.fn()

    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to load standings' },
      refetch: refetchMock,
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    render(<Standings />)

    expect(screen.getByText('Standings')).toBeInTheDocument()
  })

  it('shows empty state when no standings', () => {
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
    })

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    render(<Standings />)

    expect(screen.getByText('Waiting for registrations')).toBeInTheDocument()
  })

  it('displays singular player count when only one player', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [
        { playerId: '1', rank: 1, wins: 0, losses: 0, setsWon: 0, setsLost: 0 },
      ],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    })

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    render(<Standings />)

    expect(screen.getByText('1 player registered')).toBeInTheDocument()
  })

  it('renders for organizer role', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [
        { playerId: '1', rank: 1, wins: 5, losses: 1, setsWon: 10, setsLost: 3 },
      ],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    })

    mockUsePermissions.mockReturnValue({
      playerRole: false,
      organizerRole: true,
      canEditScores: true,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: true,
    })

    render(<Standings />)

    expect(screen.getByText('Standings')).toBeInTheDocument()
    expect(screen.getByText('1 player registered')).toBeInTheDocument()
  })
})
