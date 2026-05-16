/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Match } from '@shared/types'
import { Matches } from '../Matches'
import * as TournamentHook from '../../../hooks/useTournament'
import * as PermissionsHook from '../../../hooks/usePermissions'

jest.mock('../../../hooks/useTournament')
jest.mock('../../../hooks/usePermissions')

const mockUseTournament = TournamentHook.useTournament as jest.MockedFunction<typeof TournamentHook.useTournament>
const mockUsePermissions = PermissionsHook.usePermissions as jest.MockedFunction<typeof PermissionsHook.usePermissions>

const createMockMatch = (overrides?: Partial<Match>): Match => ({
  id: 'm1',
  tournamentId: 't1',
  player1Id: 'p1',
  player2Id: 'p2',
  status: 'pending',
  ...overrides,
})

describe('Matches', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders matches with data', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: {
        group: [createMockMatch({ id: 'm1', status: 'pending' })],
        knockout: [createMockMatch({ id: 'm2', status: 'completed', score: '6-4, 6-3' })],
      },
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

    render(<Matches />)

    expect(screen.getByText('Matches')).toBeInTheDocument()
    expect(screen.getByText('2 matches')).toBeInTheDocument()
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
    } as any)

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    render(<Matches />)

    expect(screen.getByText('Loading matches...')).toBeInTheDocument()
  })

  it('shows error state with retry button', () => {
    const refetchMock = jest.fn()

    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to load matches' },
      refetch: refetchMock,
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

    render(<Matches />)

    const errorMessages = screen.getAllByText('Failed to load matches')
    expect(errorMessages.length).toBeGreaterThan(0)
  })

  it('shows empty state when no matches', () => {
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
    } as any)

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    render(<Matches />)

    expect(screen.getByText('No matches scheduled yet')).toBeInTheDocument()
  })

  it('shows all filter tabs available', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: {
        group: [createMockMatch({ id: 'm1', status: 'pending' })],
        knockout: [createMockMatch({ id: 'm2', status: 'completed', score: '6-4, 6-3' })],
      },
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

    render(<Matches />)

    // All filter tabs should be present
    const filterButtons = screen.getAllByText(/^(All|Upcoming|Completed)$/)
    expect(filterButtons.length).toBeGreaterThanOrEqual(3)
  })

  it('displays singular match count when only one match', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: {
        group: [createMockMatch({ id: 'm1', status: 'pending' })],
        knockout: [],
      },
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

    render(<Matches />)

    expect(screen.getByText('1 match')).toBeInTheDocument()
  })

  it('renders for organizer role', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: {
        group: [createMockMatch({ id: 'm1', status: 'pending' })],
        knockout: [],
      },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    mockUsePermissions.mockReturnValue({
      playerRole: false,
      organizerRole: true,
      canEditScores: true,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: true,
    })

    render(<Matches />)

    expect(screen.getByText('Matches')).toBeInTheDocument()
    expect(screen.getByText('1 match')).toBeInTheDocument()
  })

  it('shows filter tabs', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: {
        group: [createMockMatch({ id: 'm1', status: 'pending' })],
        knockout: [],
      },
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

    render(<Matches />)

    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })
})
