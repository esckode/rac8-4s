/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import type { Match } from '@shared/types'
import { Bracket } from '../Bracket'
import * as TournamentHook from '../../../hooks/useTournament'
import * as PermissionsHook from '../../../hooks/usePermissions'
import * as AuthHook from '../../../hooks/useAuth'

jest.mock('../../../hooks/useTournament')
jest.mock('../../../hooks/usePermissions')
jest.mock('../../../hooks/useAuth')

const mockUseTournament = TournamentHook.useTournament as jest.MockedFunction<typeof TournamentHook.useTournament>
const mockUsePermissions = PermissionsHook.usePermissions as jest.MockedFunction<typeof PermissionsHook.usePermissions>
const mockUseAuth = AuthHook.useAuth as jest.MockedFunction<typeof AuthHook.useAuth>

const createMockMatch = (overrides?: Partial<Match>): Match => ({
  id: 'm1',
  tournamentId: 't1',
  player1Id: 'p1',
  player2Id: 'p2',
  status: 'pending',
  ...overrides,
})

describe('Bracket', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
    })

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'player@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    render(<Bracket />)

    expect(screen.getByText('Bracket')).toBeInTheDocument()
    expect(screen.getByText('Loading bracket...')).toBeInTheDocument()
  })

  it('shows error state with retry button', () => {
    const refetchMock = jest.fn()

    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to load bracket' },
      refetch: refetchMock,
    })

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'player@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    render(<Bracket />)

    const errorTexts = screen.getAllByText('Failed to load bracket')
    expect(errorTexts.length).toBeGreaterThan(0)
  })

  it('shows player view with current match', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: {
        group: [],
        knockout: [
          createMockMatch({
            id: 'm1',
            player1Id: 'p1',
            player2Id: 'p2',
            status: 'pending',
          }),
        ],
      },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'player@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    render(<Bracket />)

    const bracketTexts = screen.getAllByText('Your Bracket')
    expect(bracketTexts.length).toBeGreaterThan(0)
    expect(screen.getByText('Current Match')).toBeInTheDocument()
    expect(screen.getByText('Submit Score')).toBeInTheDocument()
  })

  it('shows player view with match history', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: {
        group: [],
        knockout: [
          createMockMatch({
            id: 'm1',
            player1Id: 'p1',
            player2Id: 'p2',
            status: 'completed',
            score: '6-4, 6-3',
          }),
        ],
      },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'player@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    render(<Bracket />)

    const bracketTexts = screen.getAllByText('Your Bracket')
    expect(bracketTexts.length).toBeGreaterThan(0)
    expect(screen.getByText('Match History')).toBeInTheDocument()
    expect(screen.getByText('1 matches completed')).toBeInTheDocument()
  })

  it('shows organizer view with bracket', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: {
        group: [],
        knockout: [
          createMockMatch({
            id: 'm1',
            player1Id: 'p1',
            player2Id: 'p2',
            status: 'pending',
          }),
        ],
      },
      bracket: { rounds: [], totalPlayers: 4, byeCount: 0 },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    mockUsePermissions.mockReturnValue({
      playerRole: false,
      organizerRole: true,
      canEditScores: true,
      canPublishBracket: true,
      canManageGroups: true,
      canViewAllStandings: true,
    })

    mockUseAuth.mockReturnValue({
      user: { id: 'org1', email: 'organizer@example.com', role: 'organizer' },
      isAuthenticated: true,
      loading: false,
    })

    render(<Bracket />)

    expect(screen.getByText('Tournament Bracket')).toBeInTheDocument()
    expect(screen.getByText('Generate Bracket')).toBeInTheDocument()
    expect(screen.getByText('Edit Seeding')).toBeInTheDocument()
    expect(screen.getByText('Publish Bracket')).toBeInTheDocument()
  })

  it('shows organizer empty state when no bracket', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    mockUsePermissions.mockReturnValue({
      playerRole: false,
      organizerRole: true,
      canEditScores: true,
      canPublishBracket: true,
      canManageGroups: true,
      canViewAllStandings: true,
    })

    mockUseAuth.mockReturnValue({
      user: { id: 'org1', email: 'organizer@example.com', role: 'organizer' },
      isAuthenticated: true,
      loading: false,
    })

    render(<Bracket />)

    const texts = screen.getAllByText('Bracket not generated yet')
    expect(texts.length).toBeGreaterThan(0)
    expect(screen.getByText('Generate a bracket to start the knockout stage')).toBeInTheDocument()
  })

  it('shows player empty state when no matches', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    mockUsePermissions.mockReturnValue({
      playerRole: true,
      organizerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    })

    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'player@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    render(<Bracket />)

    const bracketTexts = screen.getAllByText('Your Bracket')
    expect(bracketTexts.length).toBeGreaterThan(0)
    expect(screen.getByText('No matches scheduled yet')).toBeInTheDocument()
  })

  it('displays match count for organizer', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: {
        group: [],
        knockout: [
          createMockMatch({ id: 'm1', status: 'pending' }),
          createMockMatch({ id: 'm2', status: 'pending' }),
        ],
      },
      bracket: { rounds: [], totalPlayers: 4, byeCount: 0 },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    mockUsePermissions.mockReturnValue({
      playerRole: false,
      organizerRole: true,
      canEditScores: true,
      canPublishBracket: true,
      canManageGroups: true,
      canViewAllStandings: true,
    })

    mockUseAuth.mockReturnValue({
      user: { id: 'org1', email: 'organizer@example.com', role: 'organizer' },
      isAuthenticated: true,
      loading: false,
    })

    render(<Bracket />)

    expect(screen.getByText('2 knockout matches')).toBeInTheDocument()
  })
})
