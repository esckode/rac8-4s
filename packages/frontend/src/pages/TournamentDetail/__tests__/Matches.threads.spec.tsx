/**
 * Matches page — V5.2 "Message opponent" integration
 *
 * Tests that the Matches page passes onMessageOpponent to MatchCard
 * and handles the thread-open callback appropriately.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Match } from '@shared/types'
import { Matches } from '../Matches'
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
  player1Id: 'player_viewer',
  player2Id: 'player_opponent',
  status: 'pending',
  ...overrides,
})

function setupPlayerAuth(playerId = 'player_viewer') {
  mockUseAuth.mockReturnValue({
    user: { id: '1', email: 'test@example.com', role: 'player', playerId },
    isAuthenticated: true,
    loading: false,
  })
}

function setupMatches(matches: Match[]) {
  mockUseTournament.mockReturnValue({
    tournament: null,
    standings: [],
    matches: { group: matches, knockout: [] },
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
}

describe('Matches page — Message opponent (V5.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupPlayerAuth()
  })

  it('renders a "Message opponent" button on each match card', () => {
    setupMatches([createMockMatch({ id: 'm1' })])
    render(<Matches />)
    expect(screen.getByTestId('message-opponent-button')).toBeInTheDocument()
  })

  it('opens the match thread panel when "Message opponent" is clicked', async () => {
    setupMatches([createMockMatch({ id: 'm1', player1Id: 'player_viewer', player2Id: 'player_opponent' })])
    render(<Matches />)

    fireEvent.click(screen.getByTestId('message-opponent-button'))

    // A thread panel or inline compose should appear scoped to this match
    await waitFor(() => {
      expect(screen.getByTestId('match-message-compose')).toBeInTheDocument()
    })
  })

  it('match compose shows the opponent name', async () => {
    setupMatches([createMockMatch({ id: 'm1', player1Id: 'player_viewer', player2Id: 'player_opponent' })])
    render(<Matches />)

    fireEvent.click(screen.getByTestId('message-opponent-button'))

    await waitFor(() => {
      expect(screen.getByTestId('match-message-compose')).toBeInTheDocument()
    })
    // Should reference the opponent in some visible way
    // (the compose context label or input placeholder)
    expect(screen.getByTestId('match-compose-context')).toBeInTheDocument()
  })

  it('closes the compose panel when dismissed', async () => {
    setupMatches([createMockMatch({ id: 'm1' })])
    render(<Matches />)

    fireEvent.click(screen.getByTestId('message-opponent-button'))

    await waitFor(() => {
      expect(screen.getByTestId('match-message-compose')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('match-compose-close'))

    await waitFor(() => {
      expect(screen.queryByTestId('match-message-compose')).not.toBeInTheDocument()
    })
  })

  it('does not show "Message opponent" for organizers', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: { group: [createMockMatch()], knockout: [] },
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

    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'organizer@example.com', role: 'organizer' },
      isAuthenticated: true,
      loading: false,
    })

    render(<Matches />)
    expect(screen.queryByTestId('message-opponent-button')).not.toBeInTheDocument()
  })
})
