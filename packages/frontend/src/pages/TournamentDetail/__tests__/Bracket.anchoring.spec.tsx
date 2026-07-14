/**
 * S3.1/S3.2 — "You" anchoring in the bracket (P2)
 *
 * The player-facing bracket view (MatchCard list, not the organizer's
 * xyflow canvas) marks and auto-scrolls to the viewer's next playable
 * match.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
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
jest.mock('../../../components/shared/OrganizerBracket', () => ({
  OrganizerBracket: () => <div data-testid="bracket-tree" />,
}))

// jsdom doesn't implement scrollIntoView.
window.HTMLElement.prototype.scrollIntoView = jest.fn()

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
]

function mockTournament(over: Partial<ReturnType<typeof TournamentHook.useTournament>> = {}) {
  mockUseTournament.mockReturnValue({
    tournament: null,
    standings: [],
    matches: { group: [], knockout: [] },
    bracket: { rounds, totalPlayers: 4, byeCount: 0 },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    retryIn: null,
    cancelAutoRetry: jest.fn(),
    ...over,
  } as any)
}

function asPlayer(playerId: string) {
  mockUsePermissions.mockReturnValue({
    playerRole: true, organizerRole: false, canEditScores: false,
    canPublishBracket: false, canManageGroups: false, canViewAllStandings: false,
  })
  mockUseAuth.mockReturnValue({
    user: { id: 'account_1', email: 'x@example.com', role: 'player', playerId },
    isAuthenticated: true,
    loading: false,
  } as any)
}

describe('Bracket — viewer anchoring', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    playerCache.clear()
    ;(['p1', 'p2', 'p3', 'p4'] as const).forEach((id, i) =>
      playerCache.set({ id, name: `Player ${i + 1}` } as Player)
    )
  })

  it('marks the viewer\'s next match with data-testid="match-card-you"', () => {
    mockTournament()
    asPlayer('p1')
    render(<Bracket />)

    expect(screen.getByTestId('match-card-you')).toBeInTheDocument()
  })

  it('does not mark any match when the viewer has none pending', () => {
    mockTournament()
    asPlayer('someone_not_playing')
    render(<Bracket />)

    expect(screen.queryByTestId('match-card-you')).not.toBeInTheDocument()
  })
})
