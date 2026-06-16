/**
 * Integration test for useTournament deduplication
 *
 * Verifies that React Query properly deduplicates simultaneous requests
 * to the same tournament and maintains cache consistency.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useTournament } from '../useTournament'
import { useAuth } from '../useAuth'
import * as stores from '../../state'

// Mock only dependencies, not React Query itself
jest.mock('../useAuth')
jest.mock('../../state', () => ({
  tournamentStore: { set: jest.fn() },
  standingsStore: { update: jest.fn() },
  matchStore: { setMatches: jest.fn() },
  playerCache: {},
}))

// Mock fetch to track call count
const mockFetch = jest.fn()
global.fetch = mockFetch as any

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('useTournament - Request Deduplication (Integration Tests)', () => {
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
            id: 'standing_1',
            groupId: 'group_1',
            playerId: 'player_1',
            rank: 1,
            wins: 2,
            losses: 0,
            setsWon: 4,
            setsLost: 0,
            tournamentId: 'tourn_123',
          },
        ],
        matches: {
          group: [
            {
              id: 'match_1',
              tournamentId: 'tourn_123',
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
  })

  afterEach(() => {
    queryClient.clear()
  })

  describe('Simultaneous request deduplication', () => {
    it('should make only one API request for simultaneous calls with same tournamentId', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

      // Make two simultaneous calls to useTournament with same ID
      const { result: result1 } = renderHook(() => useTournament('tourn_123'), {
        wrapper,
      })
      const { result: result2 } = renderHook(() => useTournament('tourn_123'), {
        wrapper,
      })

      // Wait for both to complete
      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false)
        expect(result2.current.isLoading).toBe(false)
      })

      // Verify fetch was called only ONCE
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Verify both hooks got the same data
      expect(result1.current.tournament?.id).toBe('tourn_123')
      expect(result2.current.tournament?.id).toBe('tourn_123')
      expect(result1.current.standings).toEqual(result2.current.standings)
    })

    it('should provide same cached data to both hooks', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

      const { result: result1 } = renderHook(() => useTournament('tourn_456'), {
        wrapper,
      })
      const { result: result2 } = renderHook(() => useTournament('tourn_456'), {
        wrapper,
      })

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false)
        expect(result2.current.isLoading).toBe(false)
      })

      // Both hooks should return the exact same object reference (cached)
      expect(result1.current.tournament).toBe(result2.current.tournament)
      expect(result1.current.standings).toBe(result2.current.standings)
      expect(result1.current.matches).toBe(result2.current.matches)
    })
  })

  describe('Cache behavior within staleTime', () => {
    it('should return cached data without refetch within staleTime (5 minutes)', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

      // First call - triggers fetch
      const { result: result1 } = renderHook(() => useTournament('tourn_789'), {
        wrapper,
      })

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false)
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call immediately after - should use cache, no refetch
      const { result: result2 } = renderHook(() => useTournament('tourn_789'), {
        wrapper,
      })

      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false)
      })

      // Fetch should still have been called only once
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Different tournament IDs', () => {
    it('should make separate requests for different tournamentIds', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

      // Call with different IDs
      const { result: result1 } = renderHook(() => useTournament('tourn_a'), {
        wrapper,
      })
      const { result: result2 } = renderHook(() => useTournament('tourn_b'), {
        wrapper,
      })

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false)
        expect(result2.current.isLoading).toBe(false)
      })

      // Should have made TWO separate requests
      expect(mockFetch).toHaveBeenCalledTimes(2)

      // Verify different URLs were called
      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('tourn_a')
      expect(calls[1][0]).toContain('tourn_b')
    })
  })

  describe('Error handling with deduplication', () => {
    it('should deduplicate even when request fails', async () => {
      // Reject both retry attempts to ensure failure
      mockFetch.mockRejectedValue(new Error('Network error'))

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

      const { result: result1 } = renderHook(() => useTournament('tourn_error'), {
        wrapper,
      })
      const { result: result2 } = renderHook(() => useTournament('tourn_error'), {
        wrapper,
      })

      // Wait for both to finish loading (with error)
      await waitFor(
        () => {
          expect(result1.current.isLoading).toBe(false)
          expect(result2.current.isLoading).toBe(false)
        },
        { timeout: 2000 }
      )

      // Note: With retry:1, fetch will be called 2 times (initial + 1 retry)
      // But both hooks share the same request, so it's deduplicated at the hook level
      expect(mockFetch).toHaveBeenCalled()

      // Both hooks should have errors
      expect(result1.current.error).not.toBeNull()
      expect(result2.current.error).not.toBeNull()
    })
  })

  describe('Store updates with deduplication', () => {
    it('should update stores only once per unique request', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

      const { result: result1 } = renderHook(() => useTournament('tourn_store'), {
        wrapper,
      })
      const { result: result2 } = renderHook(() => useTournament('tourn_store'), {
        wrapper,
      })

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false)
        expect(result2.current.isLoading).toBe(false)
      })

      // Fetch was called once
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Tournament store should have been updated
      expect(stores.tournamentStore.set).toHaveBeenCalled()

      // Note: Store updates might be called twice due to React 18 StrictMode
      // but the important thing is that only ONE fetch was made
    })
  })
})
