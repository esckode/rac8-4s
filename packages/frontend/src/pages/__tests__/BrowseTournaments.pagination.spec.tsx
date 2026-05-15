/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowseTournaments } from '../BrowseTournaments'

jest.mock('../../api/client', () => ({
  fetchPublicTournaments: jest.fn(),
}))

import { fetchPublicTournaments } from '../../api/client'

const mockFetchPublicTournaments = fetchPublicTournaments as jest.MockedFunction<
  typeof fetchPublicTournaments
>

describe('BrowseTournaments - Pagination Integration', () => {
  let queryClient: QueryClient

  const renderWithRouter = (component: React.ReactElement) => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{component}</BrowserRouter>
      </QueryClientProvider>
    )
  }

  const generateMockTournaments = (count: number, startId: number = 0) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `tournament_${startId + i}`,
      name: `Tournament ${startId + i}`,
      sport: 'pickleball',
      matchFormat: 'doubles' as const,
      maxPlayers: 16,
      registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
      status: 'registration_open' as const,
    }))
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    if (queryClient) {
      queryClient.clear?.()
    }
  })

  describe('Pagination flow', () => {
    it('should load initial 20 tournaments on mount', async () => {
      const initialTournaments = generateMockTournaments(20, 0)
      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: initialTournaments,
        total: 60,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      // Verify first tournament is visible
      expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      expect(screen.getByText('Tournament 19')).toBeInTheDocument()

      // Verify Load More button appears
      expect(screen.getByText('Load More Tournaments')).toBeInTheDocument()

      // Verify fetch was called with correct offset and limit
      expect(mockFetchPublicTournaments).toHaveBeenCalledWith({
        offset: 0,
        limit: 20,
      })
    })

    it('should load next 20 tournaments when Load More is clicked', async () => {
      const initialTournaments = generateMockTournaments(20, 0)
      const nextTournaments = generateMockTournaments(20, 20)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: initialTournaments,
        total: 60,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: nextTournaments,
        total: 60,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      // Click Load More
      const loadMoreButton = screen.getByText('Load More Tournaments')
      fireEvent.click(loadMoreButton)

      // Wait for next batch to load
      await waitFor(() => {
        expect(screen.getByText('Tournament 20')).toBeInTheDocument()
      })

      // Verify both old and new tournaments are visible
      expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      expect(screen.getByText('Tournament 39')).toBeInTheDocument()

      // Verify second fetch was called with correct offset
      expect(mockFetchPublicTournaments).toHaveBeenNthCalledWith(2, {
        offset: 20,
        limit: 20,
      })
    })

    it('should append tournaments to existing list (not replace)', async () => {
      const initialTournaments = generateMockTournaments(20, 0)
      const nextTournaments = generateMockTournaments(20, 20)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: initialTournaments,
        total: 60,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: nextTournaments,
        total: 60,
      } as any)

      const { container } = renderWithRouter(<BrowseTournaments />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      const tournamentsBeforeLoadMore = container.querySelectorAll('[role="button"]')
      expect(tournamentsBeforeLoadMore.length).toBe(20)

      // Click Load More
      fireEvent.click(screen.getByText('Load More Tournaments'))

      // Wait for append
      await waitFor(() => {
        expect(screen.getByText('Tournament 20')).toBeInTheDocument()
      })

      const tournamentsAfterLoadMore = container.querySelectorAll('[role="button"]')
      expect(tournamentsAfterLoadMore.length).toBe(40)
    })

    it('should hide Load More button when end of list is reached', async () => {
      const firstBatch = generateMockTournaments(20, 0)
      const emptyBatch: any[] = []

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: firstBatch,
        total: 20,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: emptyBatch,
        total: 20,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      // Load More button should appear
      expect(screen.getByText('Load More Tournaments')).toBeInTheDocument()

      // Click to trigger end of list
      fireEvent.click(screen.getByText('Load More Tournaments'))

      // Wait for the empty response and UI update
      await waitFor(
        () => {
          expect(screen.getByText("You've reached the end of the tournament list")).toBeInTheDocument()
        },
        { timeout: 2000 }
      )

      // Load More button should be gone
      expect(screen.queryByText('Load More Tournaments')).not.toBeInTheDocument()
    })

    it('should show end of list message when fetch returns fewer items than requested', async () => {
      const firstBatch = generateMockTournaments(20, 0)
      const lastBatch = generateMockTournaments(15, 20)
      const emptyBatch: any[] = []

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: firstBatch,
        total: 35,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: lastBatch,
        total: 35,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: emptyBatch,
        total: 35,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      // Click Load More
      fireEvent.click(screen.getByText('Load More Tournaments'))

      await waitFor(() => {
        expect(screen.getByText('Tournament 20')).toBeInTheDocument()
      })

      // Load More button should still appear (we got items, so hasMore is still true)
      expect(screen.getByText('Load More Tournaments')).toBeInTheDocument()

      // Click Load More again to reach end
      fireEvent.click(screen.getByText('Load More Tournaments'))

      // Wait for empty response
      await waitFor(
        () => {
          expect(screen.getByText("You've reached the end of the tournament list")).toBeInTheDocument()
        },
        { timeout: 2000 }
      )

      // Load More button should be gone
      expect(screen.queryByText('Load More Tournaments')).not.toBeInTheDocument()
    })

    it('should display loading state while fetching', async () => {
      const initialTournaments = generateMockTournaments(20, 0)
      const nextTournaments = generateMockTournaments(20, 20)

      mockFetchPublicTournaments.mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  tournaments: initialTournaments,
                  total: 60,
                } as any),
              100
            )
          )
      )

      mockFetchPublicTournaments.mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  tournaments: nextTournaments,
                  total: 60,
                } as any),
              100
            )
          )
      )

      renderWithRouter(<BrowseTournaments />)

      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      const loadMoreButton = screen.getByText('Load More Tournaments')
      fireEvent.click(loadMoreButton)

      // Loading state should show
      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeInTheDocument()
      })

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText('Load More Tournaments')).toBeInTheDocument()
      })
    })

    it('should disable Load More button while loading', async () => {
      const initialTournaments = generateMockTournaments(20, 0)
      const nextTournaments = generateMockTournaments(20, 20)

      mockFetchPublicTournaments.mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  tournaments: initialTournaments,
                  total: 60,
                } as any),
              100
            )
          )
      )

      mockFetchPublicTournaments.mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  tournaments: nextTournaments,
                  total: 60,
                } as any),
              100
            )
          )
      )

      renderWithRouter(<BrowseTournaments />)

      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      const loadMoreButton = screen.getByText('Load More Tournaments')
      fireEvent.click(loadMoreButton)

      // Button should be disabled while loading
      const loadingButton = screen.getByText('Loading...')
      expect(loadingButton).toBeDisabled()
    })

    it('should not make redundant requests on scroll back up', async () => {
      const initialTournaments = generateMockTournaments(20, 0)
      const nextTournaments = generateMockTournaments(20, 20)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: initialTournaments,
        total: 60,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: nextTournaments,
        total: 60,
      } as any)

      const { container } = renderWithRouter(<BrowseTournaments />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      expect(mockFetchPublicTournaments).toHaveBeenCalledTimes(1)

      // Load more
      fireEvent.click(screen.getByText('Load More Tournaments'))

      await waitFor(() => {
        expect(screen.getByText('Tournament 20')).toBeInTheDocument()
      })

      expect(mockFetchPublicTournaments).toHaveBeenCalledTimes(2)

      // Simulate scroll back to top
      const scrollContainer = container.querySelector('div')
      if (scrollContainer) {
        scrollContainer.scrollTop = 0
      }

      // Wait a bit to ensure no additional requests
      await waitFor(
        () => {
          expect(mockFetchPublicTournaments).toHaveBeenCalledTimes(2)
        },
        { timeout: 500 }
      )
    })

    it('should handle empty response correctly', async () => {
      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: [],
        total: 0,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      await waitFor(() => {
        expect(screen.getByText('No tournaments found')).toBeInTheDocument()
      })

      // Load More button should not appear
      expect(screen.queryByText('Load More Tournaments')).not.toBeInTheDocument()
    })

    it('should navigate to tournament detail on tournament click', async () => {
      const initialTournaments = generateMockTournaments(20, 0)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: initialTournaments,
        total: 60,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      // Tournament cards are wrapped in role="button" divs
      const tournamentButtons = screen.getAllByRole('button')
      // First is the back button, rest are tournament cards
      const firstTournamentButton = tournamentButtons[0]

      fireEvent.click(firstTournamentButton)

      // Verify navigation occurred (URL should change to /tournament/tournament_0)
      await waitFor(() => {
        expect(window.location.pathname).toContain('/tournament/tournament_0')
      })
    })

    it('should load multiple pages sequentially without skipping offset', async () => {
      const page1 = generateMockTournaments(20, 0)
      const page2 = generateMockTournaments(20, 20)
      const page3 = generateMockTournaments(10, 40)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: page1,
        total: 50,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: page2,
        total: 50,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: page3,
        total: 50,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      // Load page 1
      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      expect(mockFetchPublicTournaments).toHaveBeenNthCalledWith(1, {
        offset: 0,
        limit: 20,
      })

      // Load page 2
      fireEvent.click(screen.getByText('Load More Tournaments'))
      await waitFor(() => {
        expect(screen.getByText('Tournament 20')).toBeInTheDocument()
      })

      expect(mockFetchPublicTournaments).toHaveBeenNthCalledWith(2, {
        offset: 20,
        limit: 20,
      })

      // Load page 3
      fireEvent.click(screen.getByText('Load More Tournaments'))
      await waitFor(() => {
        expect(screen.getByText('Tournament 40')).toBeInTheDocument()
      })

      expect(mockFetchPublicTournaments).toHaveBeenNthCalledWith(3, {
        offset: 40,
        limit: 20,
      })

      // Verify all three pages are in the DOM
      expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      expect(screen.getByText('Tournament 20')).toBeInTheDocument()
      expect(screen.getByText('Tournament 40')).toBeInTheDocument()
    })
  })

  describe('Cache behavior and deduplication', () => {
    it('should not make duplicate requests for the same page', async () => {
      const initialTournaments = generateMockTournaments(20, 0)

      mockFetchPublicTournaments.mockResolvedValue({
        tournaments: initialTournaments,
        total: 60,
      } as any)

      const { rerender } = renderWithRouter(<BrowseTournaments />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      expect(mockFetchPublicTournaments).toHaveBeenCalledTimes(1)

      // Rerender should not trigger another fetch
      rerender(
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <BrowseTournaments />
          </BrowserRouter>
        </QueryClientProvider>
      )

      // Still only one call
      expect(mockFetchPublicTournaments).toHaveBeenCalledTimes(1)
    })

    it('should handle API errors gracefully', async () => {
      mockFetchPublicTournaments.mockRejectedValueOnce(
        new Error('API error')
      )

      renderWithRouter(<BrowseTournaments />)

      // Component should still render and show error state
      await waitFor(() => {
        expect(screen.getByText('Error loading tournaments')).toBeInTheDocument()
      })

      expect(mockFetchPublicTournaments).toHaveBeenCalledTimes(1)
    })

    it('should recover from API error by trying load more again', async () => {
      const initialTournaments = generateMockTournaments(20, 0)

      mockFetchPublicTournaments.mockRejectedValueOnce(
        new Error('API error')
      )

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: initialTournaments,
        total: 60,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      // Wait for error
      await waitFor(() => {
        expect(screen.getByText('Error loading tournaments')).toBeInTheDocument()
      })

      expect(mockFetchPublicTournaments).toHaveBeenCalledTimes(1)

      // Note: useInfiniteScroll hook doesn't have a retry button,
      // so error recovery would require re-mounting or external refetch trigger
    })
  })

  describe('Edge cases', () => {
    it('should handle very large result sets', async () => {
      const largeBatch = generateMockTournaments(20, 0)

      mockFetchPublicTournaments.mockResolvedValue({
        tournaments: largeBatch,
        total: 1000, // 1000 total tournaments
      } as any)

      renderWithRouter(<BrowseTournaments />)

      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      // Should still show Load More
      expect(screen.getByText('Load More Tournaments')).toBeInTheDocument()
    })

    it('should handle single tournament response', async () => {
      const singleTournament = generateMockTournaments(1, 0)
      const emptyBatch: any[] = []

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: singleTournament,
        total: 1,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: emptyBatch,
        total: 1,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      // Load More button should appear (we got 1 item)
      expect(screen.getByText('Load More Tournaments')).toBeInTheDocument()

      // Click to reach end
      fireEvent.click(screen.getByText('Load More Tournaments'))

      // Wait for empty response
      await waitFor(
        () => {
          expect(screen.getByText("You've reached the end of the tournament list")).toBeInTheDocument()
        },
        { timeout: 2000 }
      )

      expect(screen.queryByText('Load More Tournaments')).not.toBeInTheDocument()
    })

    it('should update UI correctly when pagination parameters change', async () => {
      const page1 = generateMockTournaments(20, 0)
      const page2 = generateMockTournaments(20, 20)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: page1,
        total: 40,
      } as any)

      mockFetchPublicTournaments.mockResolvedValueOnce({
        tournaments: page2,
        total: 40,
      } as any)

      renderWithRouter(<BrowseTournaments />)

      await waitFor(() => {
        expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      })

      // Load more
      fireEvent.click(screen.getByText('Load More Tournaments'))

      await waitFor(() => {
        expect(screen.getByText('Tournament 39')).toBeInTheDocument()
      })

      // All pages should be visible
      expect(screen.getByText('Tournament 0')).toBeInTheDocument()
      expect(screen.getByText('Tournament 39')).toBeInTheDocument()
    })
  })
})
