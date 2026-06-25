/**
 * MatchCard — V5.2 "Message opponent" affordance
 *
 * These tests extend the existing MatchCard spec to cover the
 * new onMessageOpponent prop added for thread model DM scoping.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MatchCard } from '../MatchCard'
import type { Match } from '@shared/types'

// Mock state
jest.mock('../../../state', () => ({
  playerCache: {
    get: jest.fn((playerId: string) => ({
      id: playerId,
      name: `Player ${playerId}`,
    })),
  },
}))

jest.mock('../Badge', () => ({
  Badge: ({ children }: any) => <div data-testid="badge">{children}</div>,
}))

jest.mock('../LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}))

jest.mock('../Button', () => ({
  Button: ({ children, onClick, 'data-testid': testId, disabled }: any) => (
    <button data-testid={testId} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

const mockMatch = (overrides?: Partial<Match>): Match => ({
  id: 'match_1',
  tournamentId: 'tournament_1',
  player1Id: 'player_1',
  player2Id: 'player_2',
  status: 'pending',
  ...overrides,
})

describe('MatchCard — Message opponent affordance (V5.2)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows "Message opponent" button when onMessageOpponent is provided and player has an opponent', () => {
    const onMessageOpponent = jest.fn()
    const match = mockMatch()
    render(
      <MatchCard
        match={match}
        userRole="player"
        onMessageOpponent={onMessageOpponent}
      />
    )
    expect(screen.getByTestId('message-opponent-button')).toBeInTheDocument()
  })

  it('calls onMessageOpponent with {matchId, opponentPlayerId} when clicked', () => {
    const onMessageOpponent = jest.fn()
    const match = mockMatch({ id: 'match_xyz', player1Id: 'viewer_player', player2Id: 'opponent_abc' })
    render(
      <MatchCard
        match={match}
        userRole="player"
        viewerPlayerId="viewer_player"
        onMessageOpponent={onMessageOpponent}
      />
    )
    fireEvent.click(screen.getByTestId('message-opponent-button'))
    expect(onMessageOpponent).toHaveBeenCalledWith({
      matchId: 'match_xyz',
      opponentPlayerId: 'opponent_abc',
    })
  })

  it('resolves opponent as player2 when viewer is player1', () => {
    const onMessageOpponent = jest.fn()
    const match = mockMatch({ player1Id: 'me', player2Id: 'them' })
    render(
      <MatchCard
        match={match}
        userRole="player"
        viewerPlayerId="me"
        onMessageOpponent={onMessageOpponent}
      />
    )
    fireEvent.click(screen.getByTestId('message-opponent-button'))
    expect(onMessageOpponent).toHaveBeenCalledWith({
      matchId: 'match_1',
      opponentPlayerId: 'them',
    })
  })

  it('resolves opponent as player1 when viewer is player2', () => {
    const onMessageOpponent = jest.fn()
    const match = mockMatch({ player1Id: 'alice', player2Id: 'bob' })
    render(
      <MatchCard
        match={match}
        userRole="player"
        viewerPlayerId="bob"
        onMessageOpponent={onMessageOpponent}
      />
    )
    fireEvent.click(screen.getByTestId('message-opponent-button'))
    expect(onMessageOpponent).toHaveBeenCalledWith({
      matchId: 'match_1',
      opponentPlayerId: 'alice',
    })
  })

  it('does NOT show "Message opponent" button when no opponent (player2 is undefined)', () => {
    const onMessageOpponent = jest.fn()
    const match = mockMatch({ player2Id: undefined })
    render(
      <MatchCard
        match={match}
        userRole="player"
        onMessageOpponent={onMessageOpponent}
      />
    )
    expect(screen.queryByTestId('message-opponent-button')).not.toBeInTheDocument()
  })

  it('does NOT show "Message opponent" button when onMessageOpponent is not provided', () => {
    const match = mockMatch()
    render(<MatchCard match={match} userRole="player" />)
    expect(screen.queryByTestId('message-opponent-button')).not.toBeInTheDocument()
  })

  it('does not propagate click to the card when "Message opponent" is clicked', () => {
    const onClick = jest.fn()
    const onMessageOpponent = jest.fn()
    const match = mockMatch()
    render(
      <MatchCard
        match={match}
        userRole="player"
        onClick={onClick}
        onMessageOpponent={onMessageOpponent}
      />
    )
    fireEvent.click(screen.getByTestId('message-opponent-button'))
    expect(onMessageOpponent).toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('organizers do not see "Message opponent" button', () => {
    const onMessageOpponent = jest.fn()
    const match = mockMatch()
    render(
      <MatchCard
        match={match}
        userRole="organizer"
        onMessageOpponent={onMessageOpponent}
      />
    )
    expect(screen.queryByTestId('message-opponent-button')).not.toBeInTheDocument()
  })
})
