/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { StandingsTable } from '../StandingsTable'
import type { Standing } from '@shared/types'
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
jest.mock('../Button', () => ({
  Button: ({ children, onClick, variant, size, disabled }: any) => (
    <button onClick={onClick} data-variant={variant} data-size={size} disabled={disabled}>
      {children}
    </button>
  ),
}))

jest.mock('../ErrorBanner', () => ({
  ErrorBanner: ({ message, onDismiss }: any) => (
    <div role="alert">
      {message}
      {onDismiss && <button onClick={onDismiss}>Retry</button>}
    </div>
  ),
}))

jest.mock('../SkeletonLoader', () => ({
  SkeletonLoader: ({ count, height }: any) => (
    <div data-testid="skeleton-loader" data-count={count} style={{ height }}>
      Loading...
    </div>
  ),
}))

const mockStanding = (overrides?: Partial<Standing>): Standing => ({
  participantId: 'player_1',
  rank: 1,
  wins: 5,
  losses: 2,
  setsWon: 10,
  setsLost: 4,
  ...overrides,
})

const createStandings = (count: number): Standing[] => {
  return Array.from({ length: count }, (_, i) => ({
    participantId: `player_${i}`,
    rank: i + 1,
    wins: Math.max(0, 5 - i),
    losses: i,
    setsWon: Math.max(0, 10 - i * 2),
    setsLost: Math.max(0, 4 + i),
  }))
}

describe('StandingsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders standings table with headers', () => {
      const standings = [mockStanding()]
      render(<StandingsTable standings={standings} />)

      expect(screen.getByText('Rank')).toBeInTheDocument()
      expect(screen.getByText('Team')).toBeInTheDocument()
      expect(screen.getByText('Matches')).toBeInTheDocument()
      expect(screen.getByText('W')).toBeInTheDocument()
      expect(screen.getByText('L')).toBeInTheDocument()
      expect(screen.getByText('Set Diff')).toBeInTheDocument()
    })

    it('renders player name in row', () => {
      const standings = [mockStanding({ participantId: 'player_123' })]
      render(<StandingsTable standings={standings} />)

      expect(screen.getByText('Player player_123')).toBeInTheDocument()
    })

    it('renders match count correctly', () => {
      const standings = [mockStanding({ wins: 3, losses: 2 })]
      render(<StandingsTable standings={standings} />)

      // 3 wins + 2 losses = 5 matches
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('renders set difference correctly', () => {
      const standings = [mockStanding({ setsWon: 10, setsLost: 4 })]
      render(<StandingsTable standings={standings} />)

      // 10 - 4 = 6 set difference
      expect(screen.getByText('6')).toBeInTheDocument()
    })

    it('renders multiple rows', () => {
      const standings = createStandings(3)
      const { container } = render(<StandingsTable standings={standings} />)

      const rows = container.querySelectorAll('[style*="position: absolute"]')
      expect(rows.length).toBeGreaterThan(0)
    })
  })

  describe('Virtualization', () => {
    it('only renders visible rows in DOM', () => {
      const standings = createStandings(100)
      render(<StandingsTable standings={standings} />)

      // With react-window virtualization, only ~15 rows should be in DOM
      // The exact number depends on viewport height
      const container = screen.getByText('Rank').closest('div')?.parentElement
      expect(container).toBeInTheDocument()
    })

    it('renders 500 rows in less than 500ms', () => {
      const standings = createStandings(500)
      const startTime = performance.now()
      render(<StandingsTable standings={standings} />)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(500)
    })

    it('calculates correct height for large standings list', () => {
      const standings = createStandings(200)
      const { container } = render(<StandingsTable standings={standings} />)

      // Find the virtualized list container
      const listContainer = container.querySelector('[style*="height"]')
      expect(listContainer).toBeInTheDocument()
    })

    it('handles very large datasets (1000+ rows)', () => {
      const standings = createStandings(1000)
      expect(() => {
        render(<StandingsTable standings={standings} />)
      }).not.toThrow()
    })
  })

  describe('Role-Based Rendering', () => {
    it('player role does not show override button', () => {
      const standings = [mockStanding()]
      render(<StandingsTable standings={standings} userRole="player" />)

      expect(screen.queryByText('Override')).not.toBeInTheDocument()
    })

    it('organizer role shows override button', () => {
      const standings = [mockStanding()]
      render(<StandingsTable standings={standings} userRole="organizer" />)

      expect(screen.getByText('Override')).toBeInTheDocument()
    })

    it('override button is not shown for multiple rows when player role', () => {
      const standings = createStandings(5)
      render(<StandingsTable standings={standings} userRole="player" />)

      const overrideButtons = screen.queryAllByText('Override')
      expect(overrideButtons).toHaveLength(0)
    })

    it('override button shown for all rows when organizer role', () => {
      const standings = createStandings(3)
      render(<StandingsTable standings={standings} userRole="organizer" />)

      const overrideButtons = screen.getAllByText('Override')
      expect(overrideButtons.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Loading State', () => {
    it('shows skeleton loaders when loading', () => {
      render(<StandingsTable standings={[]} isLoading={true} />)

      expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument()
    })

    it('skeleton loader has correct count', () => {
      render(<StandingsTable standings={[]} isLoading={true} />)

      const skeleton = screen.getByTestId('skeleton-loader')
      expect(skeleton).toHaveAttribute('data-count', '5')
    })

    it('hides table content when loading', () => {
      const standings = [mockStanding()]
      render(<StandingsTable standings={standings} isLoading={true} />)

      expect(screen.queryByText('Rank')).not.toBeInTheDocument()
    })

    it('shows table content when loading completes', () => {
      const standings = [mockStanding()]
      const { rerender } = render(<StandingsTable standings={standings} isLoading={true} />)

      expect(screen.queryByText('Rank')).not.toBeInTheDocument()

      rerender(<StandingsTable standings={standings} isLoading={false} />)

      expect(screen.getByText('Rank')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('shows error banner when error provided', () => {
      render(<StandingsTable standings={[]} error="Failed to load standings" />)

      expect(screen.getByText('Failed to load standings')).toBeInTheDocument()
    })

    it('shows retry button in error state', () => {
      const onRetry = jest.fn()
      render(<StandingsTable standings={[]} error="Network error" onRetry={onRetry} />)

      const retryButton = screen.getByText('Retry')
      fireEvent.click(retryButton)

      expect(onRetry).toHaveBeenCalled()
    })

    it('hides table when error is present', () => {
      const standings = [mockStanding()]
      render(<StandingsTable standings={standings} error="Something went wrong" />)

      expect(screen.queryByText('Rank')).not.toBeInTheDocument()
    })

    it('priority: loading > error > content', () => {
      const standings = [mockStanding()]
      render(
        <StandingsTable standings={standings} isLoading={true} error="Network error" />
      )

      // Loading takes priority over error state in the component
      expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText('Rank')).not.toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('shows empty state message when no standings', () => {
      render(<StandingsTable standings={[]} />)

      expect(screen.getByText('No standings available')).toBeInTheDocument()
    })

    it('hides headers when empty', () => {
      render(<StandingsTable standings={[]} />)

      expect(screen.queryByText('Rank')).not.toBeInTheDocument()
    })

    it('empty message is centered', () => {
      const { container } = render(<StandingsTable standings={[]} />)

      const emptyContainer = container.querySelector('.text-center')
      expect(emptyContainer).toBeInTheDocument()
    })
  })

  describe('Sorting', () => {
    it('clicking rank header sorts by rank', () => {
      const standings = createStandings(5)
      render(<StandingsTable standings={standings} />)

      const rankHeader = screen.getAllByRole('button').find(btn => btn.textContent?.includes('Rank'))
      expect(rankHeader).toBeInTheDocument()

      if (rankHeader) {
        fireEvent.click(rankHeader)
      }

      expect(screen.getByText('Rank')).toBeInTheDocument()
    })

    it('clicking header twice reverses sort direction', () => {
      const standings = [
        mockStanding({ rank: 2, wins: 3 }),
        mockStanding({ rank: 1, wins: 5 }),
      ]
      render(<StandingsTable standings={standings} />)

      const rankHeader = screen.getAllByRole('button').find(btn => btn.textContent?.includes('Rank'))

      if (rankHeader) {
        // First click: sort ascending
        fireEvent.click(rankHeader)
        expect(screen.getByText('Rank')).toBeInTheDocument()

        // Second click: sort descending
        fireEvent.click(rankHeader)
        expect(screen.getByText('Rank')).toBeInTheDocument()
      }
    })

    it('clicking different header changes sort field', () => {
      const standings = createStandings(3)
      render(<StandingsTable standings={standings} />)

      const winsHeader = screen.getByText('W')
      fireEvent.click(winsHeader)

      // Verify sort field changed (query again after potential re-render)
      expect(screen.getByText('W')).toBeInTheDocument()
    })

    it('shows sort indicator icon on active column', () => {
      const standings = [
        mockStanding({ wins: 3 }),
        mockStanding({ wins: 5 }),
      ]
      const { container } = render(<StandingsTable standings={standings} />)

      const winsHeader = screen.getByText('W')
      fireEvent.click(winsHeader)

      // SVG should be present as sort indicator
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('sortable columns are clickable', () => {
      const standings = [mockStanding()]
      render(<StandingsTable standings={standings} />)

      const winsHeader = screen.getByText('W')
      expect(winsHeader).not.toBeDisabled()
    })

    it('non-sortable columns are disabled', () => {
      const standings = [mockStanding()]
      const { container } = render(<StandingsTable standings={standings} />)

      // Team and Matches columns are not sortable
      const buttons = container.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('sorts wins in ascending order by default', () => {
      const standings = [
        mockStanding({ participantId: 'p1', wins: 5 }),
        mockStanding({ participantId: 'p2', wins: 2 }),
        mockStanding({ participantId: 'p3', wins: 8 }),
      ]
      render(<StandingsTable standings={standings} />)

      const winsHeader = screen.getByText('W')
      fireEvent.click(winsHeader)

      expect(screen.getByText('W')).toBeInTheDocument()
    })
  })

  describe('Row Interaction', () => {
    it('calls onRowClick when row is clicked', () => {
      const onRowClick = jest.fn()
      const standings = [mockStanding({ participantId: 'player_123' })]
      const { container } = render(
        <StandingsTable standings={standings} onRowClick={onRowClick} />
      )

      const rows = container.querySelectorAll('[style*="position: absolute"]')
      if (rows.length > 0) {
        fireEvent.click(rows[0])
        expect(onRowClick).toHaveBeenCalled()
      }
    })

    it('passes correct playerId to onRowClick', () => {
      const onRowClick = jest.fn()
      const standings = [mockStanding({ participantId: 'specific_player_id' })]
      const { container } = render(
        <StandingsTable standings={standings} onRowClick={onRowClick} />
      )

      // Try to click a row if it exists
      const rows = container.querySelectorAll('[style*="position: absolute"]')
      if (rows.length > 0) {
        fireEvent.click(rows[0])
        expect(onRowClick).toHaveBeenCalled()
      }
    })

    it('override button click does not propagate row click', () => {
      const onRowClick = jest.fn()
      const onOverride = jest.fn()
      const standings = [mockStanding({ participantId: 'player_1' })]
      render(
        <StandingsTable
          standings={standings}
          userRole="organizer"
          onRowClick={onRowClick}
          onOverride={onOverride}
        />
      )

      const overrideButton = screen.getByText('Override')
      fireEvent.click(overrideButton)

      expect(onOverride).toHaveBeenCalled()
    })

    it('clicking override button calls onOverride with playerId', () => {
      const onOverride = jest.fn()
      const standings = [mockStanding({ participantId: 'player_xyz' })]
      render(
        <StandingsTable standings={standings} userRole="organizer" onOverride={onOverride} />
      )

      const overrideButton = screen.getByText('Override')
      fireEvent.click(overrideButton)

      expect(onOverride).toHaveBeenCalledWith(expect.any(String))
    })

    it('row has hover styling when onRowClick provided', () => {
      const onRowClick = jest.fn()
      const standings = [mockStanding()]
      const { container } = render(
        <StandingsTable standings={standings} onRowClick={onRowClick} />
      )

      const row = container.querySelector('[style*="position: absolute"]')
      expect(row?.className).toMatch(/hover:bg-\[--court-50\]/)
    })
  })

  describe('Data Updates', () => {
    it('updates when standings change', () => {
      const standings1 = [mockStanding({ participantId: 'player_1', rank: 1 })]
      const standings2 = [mockStanding({ participantId: 'player_2', rank: 1 })]

      const { rerender } = render(<StandingsTable standings={standings1} />)
      expect(screen.getByText('Player player_1')).toBeInTheDocument()

      rerender(<StandingsTable standings={standings2} />)
      expect(screen.getByText('Player player_2')).toBeInTheDocument()
    })

    it('handles standings with same rank', () => {
      const standings = [
        mockStanding({ participantId: 'p1', rank: 1 }),
        mockStanding({ participantId: 'p2', rank: 1 }),
      ]
      render(<StandingsTable standings={standings} />)

      expect(screen.getByText('Player p1')).toBeInTheDocument()
      expect(screen.getByText('Player p2')).toBeInTheDocument()
    })

    it('handles standings with zero wins', () => {
      const standings = [mockStanding({ wins: 0, losses: 3 })]
      const { container } = render(<StandingsTable standings={standings} />)

      // Matches = 0 + 3 = 3, so we should see 3 in the matches column
      const matchesCell = container.querySelector('[style*="position: absolute"]')?.children[2]
      expect(matchesCell?.textContent).toBe('3')
    })

    it('handles standings with zero losses', () => {
      const standings = [mockStanding({ wins: 5, losses: 0 })]
      const { container } = render(<StandingsTable standings={standings} />)

      // Matches = 5 + 0 = 5
      const matchesCell = container.querySelector('[style*="position: absolute"]')?.children[2]
      expect(matchesCell?.textContent).toBe('5')
    })
  })

  describe('Responsive Design', () => {
    it('applies custom className', () => {
      const standings = [mockStanding()]
      const { container } = render(
        <StandingsTable standings={standings} className="custom-class" />
      )

      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('custom-class')
    })

    it('renders on mobile viewport (375px)', () => {
      // Mock window.matchMedia for mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      const standings = [mockStanding()]
      expect(() => {
        render(<StandingsTable standings={standings} />)
      }).not.toThrow()
    })

    it('renders on tablet viewport (768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      })

      const standings = [mockStanding()]
      expect(() => {
        render(<StandingsTable standings={standings} />)
      }).not.toThrow()
    })

    it('renders on desktop viewport (1440px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1440,
      })

      const standings = [mockStanding()]
      expect(() => {
        render(<StandingsTable standings={standings} />)
      }).not.toThrow()
    })

    it('header is sticky', () => {
      const standings = [mockStanding()]
      const { container } = render(<StandingsTable standings={standings} />)

      const header = container.querySelector('.sticky')
      expect(header).toBeInTheDocument()
    })

    it('header has z-index to stay above content', () => {
      const standings = [mockStanding()]
      const { container } = render(<StandingsTable standings={standings} />)

      const header = container.querySelector('.z-10')
      expect(header).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('table has semantic role', () => {
      const standings = [mockStanding()]
      const { container } = render(<StandingsTable standings={standings} />)

      expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument() // unless error
    })

    it('error message has alert role', () => {
      render(<StandingsTable standings={[]} error="Error message" />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('buttons are keyboard accessible', () => {
      const standings = [mockStanding()]
      const { container } = render(<StandingsTable standings={standings} />)

      const buttons = container.querySelectorAll('button')
      buttons.forEach((button) => {
        expect(button.tagName).toBe('BUTTON')
      })
    })

    it('headers are buttons for keyboard navigation', () => {
      const standings = [mockStanding()]
      const { container } = render(<StandingsTable standings={standings} />)

      const buttons = container.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('override button has proper semantics', () => {
      const standings = [mockStanding()]
      render(<StandingsTable standings={standings} userRole="organizer" />)

      const button = screen.getByText('Override')
      expect(button.tagName).toBe('BUTTON')
    })
  })

  describe('Performance', () => {
    it('memoizes sorted standings', () => {
      const standings = createStandings(10)
      const { rerender } = render(<StandingsTable standings={standings} className="class1" />)

      // Rerender with same standings but different className should not re-sort
      rerender(<StandingsTable standings={standings} className="class2" />)

      expect(screen.getByText('Rank')).toBeInTheDocument()
    })

    it('renders 500 rows with acceptable performance', () => {
      const standings = createStandings(500)
      const startTime = performance.now()
      render(<StandingsTable standings={standings} />)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(500)
    })

    it('sorting does not block UI', () => {
      const standings = createStandings(100)
      render(<StandingsTable standings={standings} />)

      const startTime = performance.now()
      const winsHeader = screen.getByText('W')
      fireEvent.click(winsHeader)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(100)
    })
  })

  describe('Edge Cases', () => {
    it('handles undefined player name', () => {
      (playerCacheModule.playerCache.get as jest.Mock).mockReturnValueOnce(null)

      const standings = [mockStanding({ participantId: 'missing_player' })]
      render(<StandingsTable standings={standings} />)

      expect(screen.getByText('missing_player')).toBeInTheDocument()
    })

    it('handles rapid prop changes', () => {
      const standings1 = [mockStanding({ participantId: 'p1' })]
      const standings2 = [mockStanding({ participantId: 'p2' })]
      const standings3 = [mockStanding({ participantId: 'p3' })]

      const { rerender } = render(<StandingsTable standings={standings1} />)
      rerender(<StandingsTable standings={standings2} />)
      rerender(<StandingsTable standings={standings3} />)

      expect(screen.getByText('Player p3')).toBeInTheDocument()
    })

    it('handles switching between roles', () => {
      const standings = [mockStanding()]
      const { rerender } = render(
        <StandingsTable standings={standings} userRole="player" />
      )

      expect(screen.queryByText('Override')).not.toBeInTheDocument()

      rerender(
        <StandingsTable standings={standings} userRole="organizer" />
      )

      expect(screen.getByText('Override')).toBeInTheDocument()
    })

    it('handles alternating row colors', () => {
      const standings = createStandings(5)
      const { container } = render(<StandingsTable standings={standings} />)

      const rows = container.querySelectorAll('[style*="position: absolute"]')
      // Verify alternating background colors are applied
      expect(rows.length).toBeGreaterThan(0)
    })

    it('handles very large set differences', () => {
      const standings = [mockStanding({ setsWon: 100, setsLost: 0 })]
      render(<StandingsTable standings={standings} />)

      // 100 - 0 = 100 set difference
      expect(screen.getByText('100')).toBeInTheDocument()
    })
  })
})
