/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTournament } from '../../../hooks/useTournament'
import { useSSE } from '../../../hooks/useSSE'

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch as any

// Mock ReconnectingEventSource for SSE
class MockEventSource {
  url: string
  listeners: Map<string, Function[]> = new Map()
  closed = false

  constructor(url: string) {
    this.url = url
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(handler)
  }

  removeEventListener(event: string, handler: Function) {
    const handlers = this.listeners.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  close() {
    this.closed = true
  }

  simulateEvent(eventType: string, data: any) {
    const handlers = this.listeners.get(eventType) || []
    handlers.forEach(handler => {
      const event = new MessageEvent(eventType, {
        data: typeof data === 'string' ? data : JSON.stringify(data),
      })
      handler(event)
    })
  }

  simulateOpen() {
    const handlers = this.listeners.get('open') || []
    handlers.forEach(handler => handler(new Event('open')))
  }
}

let mockEventSourceInstance: MockEventSource | null = null

jest.mock('reconnecting-eventsource', () => {
  return jest.fn((url: string) => {
    mockEventSourceInstance = new MockEventSource(url)
    setTimeout(() => mockEventSourceInstance?.simulateOpen(), 0)
    return mockEventSourceInstance
  })
})

jest.mock('../../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../../hooks/useAnalytics', () => ({
  useAnalytics: jest.fn(),
}))

jest.mock('../../../state', () => ({
  tournamentStore: {
    set: jest.fn(),
  },
  standingsStore: {
    update: jest.fn(),
  },
  matchStore: {
    setMatches: jest.fn(),
  },
  playerCache: {
    setMany: jest.fn(),
  },
}))

import { useAuth } from '../../../hooks/useAuth'
import { useAnalytics } from '../../../hooks/useAnalytics'
import * as stores from '../../../state'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockUseAnalytics = useAnalytics as jest.MockedFunction<typeof useAnalytics>

// Simple test component that uses the hooks
const TestComponent: React.FC<{ tournamentId: string }> = ({ tournamentId }) => {
  const tournament = useTournament(tournamentId)
  const sse = useSSE(tournamentId)

  return (
    <div>
      <div data-testid="tournament-status">
        {tournament.isLoading ? 'Loading' : tournament.tournament?.name || 'No tournament'}
      </div>
      <div data-testid="sse-status">
        {sse.connected ? 'Connected' : 'Disconnected'}
      </div>
      <div data-testid="bundle-data">
        {tournament.standings.length > 0 && `Standings: ${tournament.standings.length}`}
      </div>
    </div>
  )
}

describe('TournamentDetail - Integration Flow Tests', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('auth_token', 'test-session-token')
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    mockUseAuth.mockReturnValue({
      user: { id: 'user_1', email: 'test@test.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    mockUseAnalytics.mockReturnValue({
      track: jest.fn(),
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tournament: {
          id: 'tourn_123',
          name: 'Test Tournament',
          creatorId: 'org_789',
          sport: 'pickleball',
          matchFormat: 'doubles' as const,
          maxPlayers: 16,
          status: 'group_stage_active' as const,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [
          {
            groupId: 'group_1',
            groupName: 'Group A',
            standings: [
              {
                playerId: 'player_1',
                rank: 1,
                wins: 2,
                losses: 0,
                setsWon: 4,
                setsLost: 0,
              },
            ],
          },
        ],
        matches: {
          group: [
            {
              id: 'match_1',
              tournamentId: 'tourn_123',
              groupId: 'group_1',
              player1Id: 'player_1',
              player2Id: 'player_2',
              status: 'completed' as const,
              score: '2-0',
              deadline: new Date().toISOString(),
            },
          ],
          knockout: [],
        },
        bracket: {
          rounds: [],
          totalPlayers: 16,
          byeCount: 0,
        },
      }),
    } as any)

    mockEventSourceInstance = null
  })

  afterEach(() => {
    if (mockEventSourceInstance) {
      mockEventSourceInstance.close()
    }
    queryClient.clear()
  })

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/tournament/:tournamentId/*" element={component} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    )
  }

  describe('Complete tournament detail flow', () => {
    it('should load tournament data on mount via /bundle endpoint', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')
      renderWithProviders(<TestComponent tournamentId="tourn_123" />)

      // Wait for bundle to load
      await waitFor(() => {
        expect(screen.getByTestId('tournament-status')).toHaveTextContent('Test Tournament')
      })

      // Verify /bundle endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tournaments/tourn_123/bundle'),
        expect.any(Object)
      )

      // Verify stores were updated
      expect(stores.tournamentStore.set).toHaveBeenCalled()
      expect(stores.standingsStore.update).toHaveBeenCalled()
      expect(stores.matchStore.setMatches).toHaveBeenCalled()
    })

    it('should establish SSE connection after data loads', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')
      renderWithProviders(<TestComponent tournamentId="tourn_123" />)

      // Wait for SSE to connect
      await waitFor(() => {
        expect(screen.getByTestId('sse-status')).toHaveTextContent('Connected')
      })

      // Verify SSE connection is established
      expect(mockEventSourceInstance).toBeTruthy()
      expect(mockEventSourceInstance?.url).toContain('/tournaments/tourn_123/events')
    })

    it('should deduplicate simultaneous /bundle requests from multiple hooks', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')

      const MultiHookComponent: React.FC = () => {
        const tournament1 = useTournament('tourn_123')
        const tournament2 = useTournament('tourn_123')
        return (
          <div>
            <div data-testid="hook1">{tournament1.tournament?.name}</div>
            <div data-testid="hook2">{tournament2.tournament?.name}</div>
          </div>
        )
      }

      renderWithProviders(<MultiHookComponent />)

      // Wait for both hooks to load
      await waitFor(() => {
        expect(screen.getByTestId('hook1')).toHaveTextContent('Test Tournament')
        expect(screen.getByTestId('hook2')).toHaveTextContent('Test Tournament')
      })

      // /bundle should only be called once despite two simultaneous hook calls
      const bundleCalls = mockFetch.mock.calls.filter(call =>
        call[0].includes('/tournaments/tourn_123/bundle')
      )
      expect(bundleCalls.length).toBe(1)
    })

    it('should handle SSE standings.updated event and update stores', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')
      renderWithProviders(<TestComponent tournamentId="tourn_123" />)

      // Wait for SSE connection
      await waitFor(() => {
        expect(mockEventSourceInstance).toBeTruthy()
      })

      ;(stores.standingsStore.update as jest.Mock).mockClear()

      // Simulate SSE event
      mockEventSourceInstance!.simulateEvent('standings.updated', {
        groupId: 'group_1',
        groupName: 'Group A',
        standings: [
          {
            playerId: 'player_1',
            rank: 1,
            wins: 3,
            losses: 0,
            setsWon: 6,
            setsLost: 0,
          },
        ],
      })

      // Verify store was updated with new data
      await waitFor(() => {
        expect(stores.standingsStore.update).toHaveBeenCalledWith(
          expect.objectContaining({
            groupId: 'group_1',
            standings: expect.arrayContaining([
              expect.objectContaining({
                playerId: 'player_1',
                wins: 3,
              }),
            ]),
          })
        )
      })
    })

    it('should close SSE connection on unmount', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')
      const { unmount } = renderWithProviders(<TestComponent tournamentId="tourn_123" />)

      // Wait for SSE to connect
      await waitFor(() => {
        expect(mockEventSourceInstance).toBeTruthy()
      })

      const eventSourceToClose = mockEventSourceInstance!

      // Unmount component
      unmount()

      // Verify EventSource was closed
      expect(eventSourceToClose.closed).toBe(true)
    })
  })

  describe('Cache behavior', () => {
    it('should return cached data within React Query staleTime', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')

      // Component that uses the same tournament twice
      const DualHookComponent: React.FC = () => {
        const tournament1 = useTournament('tourn_123')
        const tournament2 = useTournament('tourn_123')
        return (
          <div>
            <div data-testid="hook1">{tournament1.tournament?.name}</div>
            <div data-testid="hook2">{tournament2.tournament?.name}</div>
          </div>
        )
      }

      renderWithProviders(<DualHookComponent />)

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByTestId('hook1')).toHaveTextContent('Test Tournament')
      })

      // Should have made only ONE fetch call despite two hooks requesting the same tournament
      const bundleCalls = mockFetch.mock.calls.filter(call =>
        call[0].includes('/tournaments/tourn_123/bundle')
      )
      expect(bundleCalls.length).toBe(1)
    })

    it('should make separate requests for different tournament IDs', async () => {
      window.history.pushState({}, 'Test', '/tournament/test')

      // Component that requests two different tournaments
      const DualTournamentComponent: React.FC = () => {
        const tournament1 = useTournament('tourn_123')
        const tournament2 = useTournament('tourn_456')
        return (
          <div>
            <div data-testid="t1">{tournament1.tournament?.name}</div>
            <div data-testid="t2">{tournament2.tournament?.name}</div>
          </div>
        )
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tournament: { ...mockFetch.mock.results[0].value, id: 'tourn_123', name: 'Test Tournament 1' },
          standings: [],
          matches: { group: [], knockout: [] },
          bracket: { rounds: [], totalPlayers: 16, byeCount: 0 },
        }),
      } as any)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tournament: { ...mockFetch.mock.results[0].value, id: 'tourn_456', name: 'Test Tournament 2' },
          standings: [],
          matches: { group: [], knockout: [] },
          bracket: { rounds: [], totalPlayers: 16, byeCount: 0 },
        }),
      } as any)

      renderWithProviders(<DualTournamentComponent />)

      // Wait for both to load
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2)
      })

      // Verify different tournament IDs were called
      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('tourn_123')
      expect(calls[1][0]).toContain('tourn_456')
    })
  })

  describe('Error handling', () => {
    it('should handle /bundle endpoint errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')
      renderWithProviders(<TestComponent tournamentId="tourn_123" />)

      // Component should still render without crashing
      await waitFor(() => {
        expect(screen.getByTestId('tournament-status')).toBeInTheDocument()
      })
    })

    it('should handle SSE connection errors', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')
      renderWithProviders(<TestComponent tournamentId="tourn_123" />)

      // Wait for initial connection
      await waitFor(() => {
        expect(mockEventSourceInstance).toBeTruthy()
      })

      // Simulate error event
      const errorHandlers = mockEventSourceInstance!.listeners.get('error') || []
      errorHandlers.forEach(handler => handler(new Event('error')))

      // Component should continue to work despite error
      expect(screen.getByTestId('tournament-status')).toBeInTheDocument()
    })
  })

  describe('Store population', () => {
    it('should populate tournament store from bundle response', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')
      renderWithProviders(<TestComponent tournamentId="tourn_123" />)

      await waitFor(() => {
        expect(stores.tournamentStore.set).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'tourn_123',
            name: 'Test Tournament',
          })
        )
      })
    })

    it('should populate standings store from bundle response', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')
      renderWithProviders(<TestComponent tournamentId="tourn_123" />)

      await waitFor(() => {
        expect(stores.standingsStore.update).toHaveBeenCalled()
      })
    })

    it('should populate match store from bundle response', async () => {
      window.history.pushState({}, 'Test', '/tournament/tourn_123/standings')
      renderWithProviders(<TestComponent tournamentId="tourn_123" />)

      await waitFor(() => {
        expect(stores.matchStore.setMatches).toHaveBeenCalled()
      })
    })
  })
})
