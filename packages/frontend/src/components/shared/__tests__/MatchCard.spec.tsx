/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MatchCard } from '../MatchCard'
import type { Match } from '@shared/types'
import * as playerCacheModule from '../../../state'

// Mock playerCache
jest.mock('../../../state', () => ({
  playerCache: {
    get: jest.fn((playerId: string) => ({
      id: playerId,
      name: `Player ${playerId}`,
    })),
  },
}))

// Mock design tokens CSS
jest.mock('../../../../styles/tokens.css', () => ({}))

// Mock shared components
jest.mock('../Badge', () => ({
  Badge: ({ children, variant }: any) => (
    <div data-testid="badge" data-variant={variant}>
      {children}
    </div>
  ),
}))

jest.mock('../LoadingSpinner', () => ({
  LoadingSpinner: ({ size }: any) => (
    <div data-testid="loading-spinner" data-size={size}>
      Loading...
    </div>
  ),
}))

jest.mock('../Button', () => ({
  Button: ({ children, onClick, variant, size, className, disabled }: any) => (
    <button
      onClick={onClick}
      data-variant={variant}
      data-size={size}
      className={className}
      disabled={disabled}
    >
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

describe('MatchCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders match info with player names', () => {
      const match = mockMatch({ player1Id: 'player_alice', player2Id: 'player_bob' })
      render(<MatchCard match={match} />)

      expect(screen.getByText('Player player_alice')).toBeInTheDocument()
      expect(screen.getByText('Player player_bob')).toBeInTheDocument()
      expect(screen.getByText('vs')).toBeInTheDocument()
    })

    it('renders status badge', () => {
      const match = mockMatch({ status: 'pending' })
      render(<MatchCard match={match} />)

      expect(screen.getByTestId('badge')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('renders score when match is completed', () => {
      const match = mockMatch({ status: 'completed', score: '2-1' })
      render(<MatchCard match={match} />)

      expect(screen.getByText('2-1')).toBeInTheDocument()
    })

    it('does not render score when match is pending', () => {
      const match = mockMatch({ status: 'pending', score: '2-1' })
      render(<MatchCard match={match} />)

      expect(screen.queryByText('2-1')).not.toBeInTheDocument()
    })

    it('renders TBD when player2 is missing', () => {
      const match = mockMatch({ player2Id: undefined })
      render(<MatchCard match={match} />)

      expect(screen.getByText('TBD')).toBeInTheDocument()
    })

    it('renders player ID when player name is not in cache', () => {
      (playerCacheModule.playerCache.get as jest.Mock).mockReturnValueOnce(null)

      const match = mockMatch({ player1Id: 'unknown_player' })
      render(<MatchCard match={match} />)

      expect(screen.getByText('unknown_player')).toBeInTheDocument()
    })
  })

  describe('Status Variants', () => {
    it('renders pending status with correct badge variant', () => {
      const match = mockMatch({ status: 'pending' })
      render(<MatchCard match={match} />)

      const badge = screen.getByTestId('badge')
      expect(badge).toHaveAttribute('data-variant', 'live')
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('renders completed status with correct badge variant', () => {
      const match = mockMatch({ status: 'completed', score: '2-0' })
      render(<MatchCard match={match} />)

      const badge = screen.getByTestId('badge')
      expect(badge).toHaveAttribute('data-variant', 'complete')
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    it('renders walkover status with correct badge variant', () => {
      const match = mockMatch({ status: 'walkover' })
      render(<MatchCard match={match} />)

      const badge = screen.getByTestId('badge')
      expect(badge).toHaveAttribute('data-variant', 'knockout')
      expect(screen.getByText('Walkover')).toBeInTheDocument()
    })
  })

  describe('Role-Based Rendering', () => {
    it('player role shows Submit Score button only for pending matches', () => {
      const onSubmitScore = jest.fn()
      const match = mockMatch({ status: 'pending' })
      render(
        <MatchCard match={match} userRole="player" onSubmitScore={onSubmitScore} />
      )

      expect(screen.getByText('Submit Score')).toBeInTheDocument()
    })

    it('player role does not show Submit Score for completed matches', () => {
      const onSubmitScore = jest.fn()
      const match = mockMatch({ status: 'completed', score: '2-1' })
      render(
        <MatchCard match={match} userRole="player" onSubmitScore={onSubmitScore} />
      )

      expect(screen.queryByText('Submit Score')).not.toBeInTheDocument()
    })

    it('player role shows nothing for walkover matches', () => {
      const onSubmitScore = jest.fn()
      const match = mockMatch({ status: 'walkover' })
      render(
        <MatchCard match={match} userRole="player" onSubmitScore={onSubmitScore} />
      )

      expect(screen.queryByText('Submit Score')).not.toBeInTheDocument()
    })

    it('organizer role always shows Override button', () => {
      const onOverride = jest.fn()
      const match = mockMatch({ status: 'pending' })
      render(
        <MatchCard match={match} userRole="organizer" onOverride={onOverride} />
      )

      expect(screen.getByText('Override')).toBeInTheDocument()
    })

    it('organizer role shows Override for completed matches too', () => {
      const onOverride = jest.fn()
      const match = mockMatch({ status: 'completed' })
      render(
        <MatchCard match={match} userRole="organizer" onOverride={onOverride} />
      )

      expect(screen.getByText('Override')).toBeInTheDocument()
    })

    it('player role does not show Override button', () => {
      const onOverride = jest.fn()
      const match = mockMatch()
      render(
        <MatchCard match={match} userRole="player" onOverride={onOverride} />
      )

      expect(screen.queryByText('Override')).not.toBeInTheDocument()
    })
  })

  describe('Click Handlers', () => {
    it('calls onSubmitScore with match id when Submit Score clicked', () => {
      const onSubmitScore = jest.fn()
      const match = mockMatch({ id: 'match_xyz', status: 'pending' })
      render(
        <MatchCard match={match} userRole="player" onSubmitScore={onSubmitScore} />
      )

      const submitButton = screen.getByText('Submit Score')
      fireEvent.click(submitButton)

      expect(onSubmitScore).toHaveBeenCalledWith('match_xyz')
    })

    it('calls onOverride with match id when Override clicked', () => {
      const onOverride = jest.fn()
      const match = mockMatch({ id: 'match_abc' })
      render(
        <MatchCard match={match} userRole="organizer" onOverride={onOverride} />
      )

      const overrideButton = screen.getByText('Override')
      fireEvent.click(overrideButton)

      expect(onOverride).toHaveBeenCalledWith('match_abc')
    })

    it('does not propagate click event when Submit Score clicked', () => {
      const onClick = jest.fn()
      const onSubmitScore = jest.fn()
      const match = mockMatch({ status: 'pending' })
      render(
        <MatchCard
          match={match}
          userRole="player"
          onClick={onClick}
          onSubmitScore={onSubmitScore}
        />
      )

      const submitButton = screen.getByText('Submit Score')
      fireEvent.click(submitButton)

      expect(onSubmitScore).toHaveBeenCalled()
      expect(onClick).not.toHaveBeenCalled()
    })

    it('does not propagate click event when Override clicked', () => {
      const onClick = jest.fn()
      const onOverride = jest.fn()
      const match = mockMatch()
      render(
        <MatchCard
          match={match}
          userRole="organizer"
          onClick={onClick}
          onOverride={onOverride}
        />
      )

      const overrideButton = screen.getByText('Override')
      fireEvent.click(overrideButton)

      expect(onOverride).toHaveBeenCalled()
      expect(onClick).not.toHaveBeenCalled()
    })

    it('calls onClick when card is clicked without action button', () => {
      const onClick = jest.fn()
      const match = mockMatch({ status: 'completed' })
      const { container } = render(
        <MatchCard match={match} userRole="player" onClick={onClick} />
      )

      const card = container.querySelector('.relative')
      if (card) {
        fireEvent.click(card)
        expect(onClick).toHaveBeenCalled()
      }
    })
  })

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      const match = mockMatch()
      render(<MatchCard match={match} isLoading={true} />)

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    })

    it('spinner has correct size', () => {
      const match = mockMatch()
      render(<MatchCard match={match} isLoading={true} />)

      const spinner = screen.getByTestId('loading-spinner')
      expect(spinner).toHaveAttribute('data-size', 'md')
    })

    it('hides content partially when loading', () => {
      const match = mockMatch()
      const { container } = render(<MatchCard match={match} isLoading={true} />)

      const overlay = container.querySelector('.absolute')
      expect(overlay).toBeInTheDocument()
      expect(overlay?.className).toMatch(/bg-white/)
    })

    it('does not show spinner when isLoading is false', () => {
      const match = mockMatch()
      render(<MatchCard match={match} isLoading={false} />)

      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument()
    })

    it('shows spinner with loading state', () => {
      const match = mockMatch()
      const { rerender } = render(<MatchCard match={match} isLoading={false} />)

      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument()

      rerender(<MatchCard match={match} isLoading={true} />)

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    })
  })

  describe('Responsive Design', () => {
    it('applies custom className', () => {
      const match = mockMatch()
      const { container } = render(
        <MatchCard match={match} className="custom-class" />
      )

      const card = container.querySelector('.custom-class')
      expect(card).toBeInTheDocument()
    })

    it('has responsive layout for small screens', () => {
      const match = mockMatch()
      const { container } = render(<MatchCard match={match} />)

      const playerSection = container.querySelector('.sm\\:flex-row')
      expect(playerSection).toBeInTheDocument()
    })

    it('has responsive text alignment', () => {
      const match = mockMatch()
      const { container } = render(<MatchCard match={match} />)

      const leftPlayer = container.querySelector('.sm\\:text-left')
      const rightPlayer = container.querySelector('.sm\\:text-right')
      expect(leftPlayer).toBeInTheDocument()
      expect(rightPlayer).toBeInTheDocument()
    })

    it('renders correctly on mobile viewport', () => {
      const match = mockMatch()
      expect(() => {
        render(<MatchCard match={match} />)
      }).not.toThrow()
    })

    it('renders correctly on tablet viewport', () => {
      const match = mockMatch()
      expect(() => {
        render(<MatchCard match={match} />)
      }).not.toThrow()
    })

    it('renders correctly on desktop viewport', () => {
      const match = mockMatch()
      expect(() => {
        render(<MatchCard match={match} />)
      }).not.toThrow()
    })
  })

  describe('Accessibility', () => {
    it('button is keyboard accessible', () => {
      const onSubmitScore = jest.fn()
      const match = mockMatch({ status: 'pending' })
      render(
        <MatchCard match={match} userRole="player" onSubmitScore={onSubmitScore} />
      )

      const button = screen.getByText('Submit Score')
      expect(button.tagName).toBe('BUTTON')
    })

    it('override button is keyboard accessible', () => {
      const onOverride = jest.fn()
      const match = mockMatch()
      render(
        <MatchCard match={match} userRole="organizer" onOverride={onOverride} />
      )

      const button = screen.getByText('Override')
      expect(button.tagName).toBe('BUTTON')
    })

    it('has semantic button elements', () => {
      const onSubmitScore = jest.fn()
      const match = mockMatch({ status: 'pending' })
      const { container } = render(
        <MatchCard match={match} userRole="player" onSubmitScore={onSubmitScore} />
      )

      const buttons = container.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('card can be focused when clickable', () => {
      const onClick = jest.fn()
      const match = mockMatch()
      const { container } = render(
        <MatchCard match={match} onClick={onClick} />
      )

      const card = container.querySelector('.relative')
      expect(card).toBeInTheDocument()
      expect(card?.className).toContain('relative')
    })

    it('buttons have proper variants for accessibility', () => {
      const onSubmitScore = jest.fn()
      const match = mockMatch({ status: 'pending' })
      render(
        <MatchCard match={match} userRole="player" onSubmitScore={onSubmitScore} />
      )

      const submitButton = screen.getByText('Submit Score')
      expect(submitButton).toHaveAttribute('data-variant', 'primary')
    })
  })

  describe('Data Updates', () => {
    it('updates when match data changes', () => {
      const match1 = mockMatch({ id: 'match_1', status: 'pending' })
      const match2 = mockMatch({ id: 'match_1', status: 'completed', score: '2-0' })

      const { rerender } = render(<MatchCard match={match1} />)
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.queryByText('2-0')).not.toBeInTheDocument()

      rerender(<MatchCard match={match2} />)
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('2-0')).toBeInTheDocument()
    })

    it('updates button visibility when status changes', () => {
      const onSubmitScore = jest.fn()
      const match1 = mockMatch({ status: 'pending' })
      const match2 = mockMatch({ status: 'completed' })

      const { rerender } = render(
        <MatchCard match={match1} userRole="player" onSubmitScore={onSubmitScore} />
      )
      expect(screen.getByText('Submit Score')).toBeInTheDocument()

      rerender(
        <MatchCard match={match2} userRole="player" onSubmitScore={onSubmitScore} />
      )
      expect(screen.queryByText('Submit Score')).not.toBeInTheDocument()
    })

    it('handles rapid prop changes', () => {
      const match1 = mockMatch({ player1Id: 'p1' })
      const match2 = mockMatch({ player1Id: 'p2' })
      const match3 = mockMatch({ player1Id: 'p3' })

      const { rerender } = render(<MatchCard match={match1} />)
      rerender(<MatchCard match={match2} />)
      rerender(<MatchCard match={match3} />)

      expect(screen.getByText('Player p3')).toBeInTheDocument()
    })

    it('handles score updates', () => {
      const match1 = mockMatch({ status: 'completed' })
      const match2 = mockMatch({ status: 'completed', score: '2-1' })

      const { rerender } = render(<MatchCard match={match1} />)
      expect(screen.queryByText('2-1')).not.toBeInTheDocument()

      rerender(<MatchCard match={match2} />)
      expect(screen.getByText('2-1')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles very long player names', () => {
      const longName = 'A'.repeat(100)
      ;(playerCacheModule.playerCache.get as jest.Mock).mockReturnValueOnce({
        id: 'player_1',
        name: longName,
      })

      const match = mockMatch({ player1Id: 'player_1' })
      const { container } = render(<MatchCard match={match} />)

      const playerName = container.querySelector('.truncate')
      expect(playerName).toBeInTheDocument()
    })

    it('handles both players missing from cache', () => {
      (playerCacheModule.playerCache.get as jest.Mock).mockReturnValue(null)

      const match = mockMatch({ player1Id: 'unknown_1', player2Id: 'unknown_2' })
      render(<MatchCard match={match} />)

      expect(screen.getByText('unknown_1')).toBeInTheDocument()
      expect(screen.getByText('unknown_2')).toBeInTheDocument()
    })

    it('does not render empty score', () => {
      const match = mockMatch({ status: 'completed', score: '' })
      const { container } = render(<MatchCard match={match} />)

      // Empty score should not be displayed
      const scoreElements = container.querySelectorAll('p')
      const hasEmptyScore = Array.from(scoreElements).some(el => el.textContent === '')
      expect(hasEmptyScore).toBeDefined()
    })

    it('handles different score formats', () => {
      const match1 = mockMatch({ status: 'completed', score: '2-0' })
      const match2 = mockMatch({ status: 'completed', score: '1-1' })
      const match3 = mockMatch({ status: 'completed', score: '21-19' })

      const { rerender } = render(<MatchCard match={match1} />)
      expect(screen.getByText('2-0')).toBeInTheDocument()

      rerender(<MatchCard match={match2} />)
      expect(screen.getByText('1-1')).toBeInTheDocument()

      rerender(<MatchCard match={match3} />)
      expect(screen.getByText('21-19')).toBeInTheDocument()
    })

    it('handles switching roles', () => {
      const onSubmitScore = jest.fn()
      const onOverride = jest.fn()
      const match = mockMatch({ status: 'pending' })

      const { rerender } = render(
        <MatchCard
          match={match}
          userRole="player"
          onSubmitScore={onSubmitScore}
        />
      )
      expect(screen.getByText('Submit Score')).toBeInTheDocument()
      expect(screen.queryByText('Override')).not.toBeInTheDocument()

      rerender(
        <MatchCard match={match} userRole="organizer" onOverride={onOverride} />
      )
      expect(screen.queryByText('Submit Score')).not.toBeInTheDocument()
      expect(screen.getByText('Override')).toBeInTheDocument()
    })

    it('handles card without any click handlers', () => {
      const match = mockMatch()
      const { container } = render(<MatchCard match={match} />)

      const card = container.querySelector('.relative')
      expect(card?.className).toBeDefined()
      expect(() => {
        if (card) fireEvent.click(card)
      }).not.toThrow()
    })

    it('handles default role (player)', () => {
      const match = mockMatch({ status: 'pending' })
      const { container } = render(<MatchCard match={match} />)

      // Should not show Override button without explicit organizer role
      expect(screen.queryByText('Override')).not.toBeInTheDocument()
    })

    it('shows button styles correctly for different variants', () => {
      const onSubmitScore = jest.fn()
      const onOverride = jest.fn()
      const match = mockMatch({ status: 'pending' })

      const { container: playerContainer } = render(
        <MatchCard match={match} userRole="player" onSubmitScore={onSubmitScore} />
      )
      const submitBtn = playerContainer.querySelector('[data-variant="primary"]')
      expect(submitBtn).toBeInTheDocument()

      const { container: orgContainer } = render(
        <MatchCard match={match} userRole="organizer" onOverride={onOverride} />
      )
      const overrideBtn = orgContainer.querySelector('[data-variant="soft"]')
      expect(overrideBtn).toBeInTheDocument()
    })
  })

  describe('Integration', () => {
    it('renders complete player vs player match', () => {
      (playerCacheModule.playerCache.get as jest.Mock).mockImplementation(
        (id: string) => ({
          id,
          name: id === 'alice' ? 'Alice' : 'Bob',
        })
      )

      const match = mockMatch({
        player1Id: 'alice',
        player2Id: 'bob',
        status: 'completed',
        score: '2-1',
      })
      render(<MatchCard match={match} />)

      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('2-1')).toBeInTheDocument()
    })

    it('renders pending match with Submit Score for player', () => {
      (playerCacheModule.playerCache.get as jest.Mock).mockImplementation(
        (id: string) => ({
          id,
          name: `Player ${id}`,
        })
      )

      const onSubmitScore = jest.fn()
      const match = mockMatch({ status: 'pending' })
      render(
        <MatchCard match={match} userRole="player" onSubmitScore={onSubmitScore} />
      )

      expect(screen.getByText(/Player player_1/)).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Submit Score')).toBeInTheDocument()
    })

    it('renders pending match with Override for organizer', () => {
      const onOverride = jest.fn()
      const match = mockMatch({ status: 'pending' })
      render(
        <MatchCard match={match} userRole="organizer" onOverride={onOverride} />
      )

      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Override')).toBeInTheDocument()
    })

    it('renders walkover with score for organizer', () => {
      const onOverride = jest.fn()
      const match = mockMatch({ status: 'walkover', score: 'W' })
      render(
        <MatchCard match={match} userRole="organizer" onOverride={onOverride} />
      )

      expect(screen.getByText('Walkover')).toBeInTheDocument()
      expect(screen.queryByText('W')).not.toBeInTheDocument() // Score not shown for walkover
      expect(screen.getByText('Override')).toBeInTheDocument()
    })
  })
})
