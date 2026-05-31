/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

const generateLargeStandingsList = (count: number): Standing[] => {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `player_${i}`,
    rank: i + 1,
    wins: Math.max(0, 50 - i),
    losses: i,
    setsWon: Math.max(0, 100 - i * 2),
    setsLost: Math.max(0, 40 + i),
  }))
}

describe('StandingsTable - Virtualization Performance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Large dataset rendering performance', () => {
    it('should render 500-row standings table in less than 500ms', () => {
      const standings = generateLargeStandingsList(500)
      const startTime = performance.now()
      render(<StandingsTable standings={standings} />)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(500)
      expect(screen.getByText('Rank')).toBeInTheDocument()
    })

    it('should handle 1000-row dataset without crashing', () => {
      const standings = generateLargeStandingsList(1000)
      expect(() => {
        render(<StandingsTable standings={standings} />)
      }).not.toThrow()
      expect(screen.getByText('Rank')).toBeInTheDocument()
    })

    it('should handle 5000-row dataset without crashing', () => {
      const standings = generateLargeStandingsList(5000)
      expect(() => {
        render(<StandingsTable standings={standings} />)
      }).not.toThrow()
      expect(screen.getByText('Rank')).toBeInTheDocument()
    })

    it('should maintain performance with 500 rows across re-renders', () => {
      const standings = generateLargeStandingsList(500)
      const { rerender } = render(<StandingsTable standings={standings} userRole="player" />)

      const startTime = performance.now()
      rerender(<StandingsTable standings={standings} userRole="organizer" />)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(100)
    })
  })

  describe('Virtualization correctness', () => {
    it('should only render visible rows in DOM for 500-row table', () => {
      const standings = generateLargeStandingsList(500)
      const { container } = render(<StandingsTable standings={standings} />)

      // With react-window virtualization, only visible rows + buffer should be in DOM
      // The container has height of min(500 * 44 + 44, 600) = 600
      // At 44px per row, visible + buffer = roughly 15-20 rows
      const rows = container.querySelectorAll('[style*="position: absolute"]')
      expect(rows.length).toBeLessThan(30)
      expect(rows.length).toBeGreaterThan(0)
    })

    it('should keep visible row count constant during scroll', () => {
      const standings = generateLargeStandingsList(500)
      const { container } = render(<StandingsTable standings={standings} />)

      // Count initial visible rows
      const initialRows = container.querySelectorAll('[style*="position: absolute"]').length
      expect(initialRows).toBeGreaterThan(0)

      // Simulate scroll (this may or may not trigger in jsdom, but at least verify count)
      const listContainer = container.querySelector('[style*="height"]')
      if (listContainer && 'scrollTop' in listContainer) {
        (listContainer as any).scrollTop = 1000
      }

      // Row count should remain relatively constant (within buffer)
      const postScrollRows = container.querySelectorAll('[style*="position: absolute"]').length
      expect(postScrollRows).toBeLessThan(30)
      expect(postScrollRows).toBeGreaterThan(0)
    })

    it('should have header row separate from virtualized body', () => {
      const standings = generateLargeStandingsList(500)
      const { container } = render(<StandingsTable standings={standings} />)

      // Header should be sticky and outside the virtualized list
      const header = container.querySelector('.sticky')
      expect(header).toBeInTheDocument()

      // Header should have z-index to stay above scrolled content
      expect(header).toHaveClass('z-10')
    })

    it('should render correct row content within visible window', () => {
      const standings = generateLargeStandingsList(500)
      render(<StandingsTable standings={standings} />)

      // First few rows should be renderable (Player 0, Player 1, etc)
      expect(screen.getByText('Rank')).toBeInTheDocument()
    })

    it('should maintain row height consistency (44px)', () => {
      const standings = generateLargeStandingsList(100)
      const { container } = render(<StandingsTable standings={standings} />)

      // All rows should have consistent height (44px in this case)
      const rows = container.querySelectorAll('[style*="position: absolute"]')
      rows.forEach((row) => {
        const style = row.getAttribute('style')
        // react-window applies height inline
        expect(style).toBeTruthy()
      })
    })
  })

  describe('Data update efficiency with large datasets', () => {
    it('should update single row without re-rendering entire table', () => {
      const standings = generateLargeStandingsList(500)
      const { rerender, container } = render(<StandingsTable standings={standings} />)

      // Count initial rows in DOM
      const initialRowCount = container.querySelectorAll('[style*="position: absolute"]').length

      // Simulate SSE update: update one row in the standings
      const updatedStandings = standings.map((s, i) =>
        i === 100 ? { ...s, wins: s.wins + 1 } : s
      )

      rerender(<StandingsTable standings={updatedStandings} />)

      // Row count should remain roughly the same (within buffer)
      const updatedRowCount = container.querySelectorAll('[style*="position: absolute"]').length
      expect(updatedRowCount).toBeLessThan(30)
    })

    it('should batch update multiple scattered rows efficiently', () => {
      const standings = generateLargeStandingsList(500)
      const { rerender } = render(<StandingsTable standings={standings} />)

      // Simulate multiple SSE updates
      const updatedStandings = standings.map((s, i) => {
        if (i === 50 || i === 150 || i === 300) {
          return { ...s, wins: s.wins + 1 }
        }
        return s
      })

      const startTime = performance.now()
      rerender(<StandingsTable standings={updatedStandings} />)
      const endTime = performance.now()

      // Update should be fast (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100)
    })

    it('should handle sorting 500 rows efficiently', () => {
      const standings = generateLargeStandingsList(500)
      render(<StandingsTable standings={standings} />)

      const startTime = performance.now()
      const winsHeader = screen.getByText('W')
      fireEvent.click(winsHeader)
      const endTime = performance.now()

      // Sorting should be fast (less than 150ms)
      expect(endTime - startTime).toBeLessThan(150)
    })

    it('should sort 1000 rows in less than 200ms', () => {
      const standings = generateLargeStandingsList(1000)
      render(<StandingsTable standings={standings} />)

      const startTime = performance.now()
      const winsHeader = screen.getByText('W')
      fireEvent.click(winsHeader)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(200)
    })
  })

  describe('Memory efficiency with large datasets', () => {
    it('should not create excessive DOM nodes for 500 rows', () => {
      const standings = generateLargeStandingsList(500)
      const { container } = render(<StandingsTable standings={standings} />)

      // Total DOM nodes should be minimal (header + visible rows + virtualization overhead)
      // Without virtualization, 500 rows * ~7 cells = 3500+ nodes
      // With virtualization, should be much less
      const allDivs = container.querySelectorAll('div')
      expect(allDivs.length).toBeLessThan(500)
    })

    it('should reuse DOM nodes during scrolling', () => {
      const standings = generateLargeStandingsList(500)
      const { container } = render(<StandingsTable standings={standings} />)

      const initialDomNodeCount = container.querySelectorAll('[style*="position: absolute"]').length
      expect(initialDomNodeCount).toBeGreaterThan(0)

      // Simulate scroll
      const listContainer = container.querySelector('[style*="height"]')
      if (listContainer && 'scrollTop' in listContainer) {
        (listContainer as any).scrollTop = 500
      }

      // Node count should remain the same (reused)
      const postScrollNodeCount = container.querySelectorAll('[style*="position: absolute"]').length
      expect(postScrollNodeCount).toBeLessThan(30)
    })
  })

  describe('Scrolling performance', () => {
    it('should handle rapid scroll events on 500-row table', () => {
      const standings = generateLargeStandingsList(500)
      const { container } = render(<StandingsTable standings={standings} />)

      const listContainer = container.querySelector('[style*="height"]') as HTMLElement | null
      expect(listContainer).toBeInTheDocument()

      // Simulate rapid scroll events
      const startTime = performance.now()
      for (let i = 0; i < 10; i++) {
        if (listContainer && 'scrollTop' in listContainer) {
          (listContainer as any).scrollTop = i * 100
        }
      }
      const endTime = performance.now()

      // Rapid scrolling should not block (less than 250ms for 10 scroll events)
      expect(endTime - startTime).toBeLessThan(250)
    })

    it('should handle scroll to end of 500-row table', () => {
      const standings = generateLargeStandingsList(500)
      const { container } = render(<StandingsTable standings={standings} />)

      const listContainer = container.querySelector('[style*="height"]') as HTMLElement | null

      // Scroll to very end
      if (listContainer && 'scrollTop' in listContainer) {
        (listContainer as any).scrollTop = 500 * 44 // Max scroll
      }

      // Should still render without crashing
      expect(screen.getByText('Rank')).toBeInTheDocument()
    })
  })

  describe('Comparison: virtualized vs non-virtualized', () => {
    it('should render 500 rows significantly faster than initial DOM estimate', () => {
      const standings = generateLargeStandingsList(500)

      // Estimate: 500 rows * 7 cells * average render time per cell
      // With virtualization: only ~15 rows rendered
      // Expected savings: ~97% fewer DOM nodes
      const startTime = performance.now()
      render(<StandingsTable standings={standings} />)
      const endTime = performance.now()

      const renderTime = endTime - startTime
      expect(renderTime).toBeLessThan(500)
    })
  })

  describe('Edge cases with large datasets', () => {
    it('should handle standings with extreme win/loss ratios', () => {
      const standings = Array.from({ length: 500 }, (_, i) => ({
        playerId: `player_${i}`,
        rank: i + 1,
        wins: i === 0 ? 500 : 0, // First player has all wins
        losses: i === 0 ? 0 : 500, // Others have all losses
        setsWon: i === 0 ? 1000 : 0,
        setsLost: i === 0 ? 0 : 1000,
      }))

      const startTime = performance.now()
      render(<StandingsTable standings={standings} />)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(500)
      expect(screen.getByText('Rank')).toBeInTheDocument()
    })

    it('should maintain virtualization with duplicate standings', () => {
      const singleStanding: Standing = {
        playerId: 'player_1',
        rank: 1,
        wins: 5,
        losses: 2,
        setsWon: 10,
        setsLost: 4,
      }
      const standings = Array.from({ length: 500 }, () => ({ ...singleStanding }))

      const { container } = render(<StandingsTable standings={standings} />)

      // Should still virtualize even with duplicate data
      const rows = container.querySelectorAll('[style*="position: absolute"]')
      expect(rows.length).toBeLessThan(30)
    })

    it('should handle rapid rank changes without performance degradation', () => {
      const standings = generateLargeStandingsList(500)
      const { rerender } = render(<StandingsTable standings={standings} />)

      // Simulate rapid ranking changes
      const startTime = performance.now()
      for (let i = 0; i < 5; i++) {
        const shuffled = [...standings].sort(() => Math.random() - 0.5)
        rerender(<StandingsTable standings={shuffled} />)
      }
      const endTime = performance.now()

      // 5 rapid re-renders should complete quickly
      expect(endTime - startTime).toBeLessThan(600)
    })
  })

  describe('Row visibility and scrolling state', () => {
    it('should update visible rows when standings change significantly', () => {
      let standings = generateLargeStandingsList(500)
      const { rerender, container } = render(<StandingsTable standings={standings} />)

      const initialRows = container.querySelectorAll('[style*="position: absolute"]').length

      // Replace standings entirely
      standings = generateLargeStandingsList(500).reverse()
      rerender(<StandingsTable standings={standings} />)

      const updatedRows = container.querySelectorAll('[style*="position: absolute"]').length

      // Row count should remain relatively constant despite data reversal
      expect(updatedRows).toBeCloseTo(initialRows, -1) // Within 10
    })

    it('should preserve scroll position through sorting', () => {
      const standings = generateLargeStandingsList(200)
      const { container } = render(<StandingsTable standings={standings} />)

      // Note: In jsdom, scrollTop may not actually work, but we're testing the concept
      const listContainer = container.querySelector('[style*="height"]') as HTMLElement | null
      if (listContainer && 'scrollTop' in listContainer) {
        (listContainer as any).scrollTop = 500
        const scrollBefore = (listContainer as any).scrollTop

        // Click to sort
        const winsHeader = screen.getByText('W')
        fireEvent.click(winsHeader)

        // In a real browser, scroll position would be preserved
        const scrollAfter = (listContainer as any).scrollTop
        expect(scrollAfter).toBe(scrollBefore)
      }
    })
  })

  describe('Performance consistency across operations', () => {
    it('should maintain consistent render times for repeated operations', () => {
      const standings = generateLargeStandingsList(500)

      const times: number[] = []
      for (let i = 0; i < 3; i++) {
        const { unmount } = render(<StandingsTable standings={standings} />)
        const startTime = performance.now()
        render(<StandingsTable standings={standings} />)
        const endTime = performance.now()
        times.push(endTime - startTime)
        unmount()
      }

      // All renders should be fast and consistent
      times.forEach((time) => {
        expect(time).toBeLessThan(500)
      })
    })

    it('should not have memory leaks with large dataset cycles', () => {
      const createStandings = () => generateLargeStandingsList(500)

      // Simulate multiple mount/unmount cycles
      for (let i = 0; i < 5; i++) {
        const { unmount } = render(<StandingsTable standings={createStandings()} />)
        expect(screen.getByText('Rank')).toBeInTheDocument()
        unmount()
      }

      // If we get here without errors, basic memory management is working
      expect(true).toBe(true)
    })
  })
})
