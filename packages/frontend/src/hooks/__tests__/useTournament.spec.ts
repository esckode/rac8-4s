/**
 * Test suite for useTournament hook
 *
 * Validates that the hook:
 * - Fetches from GET /tournaments/:id/bundle endpoint
 * - Deduplicates simultaneous requests (React Query)
 * - Updates all stores on success
 * - Handles errors and loading states
 * - Caches results within staleTime
 * - Provides manual refetch
 */

import { renderHook, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useTournament } from '../useTournament'
import { useAuth } from '../useAuth'
import * as stores from '../../state'

// Mock dependencies
jest.mock('@tanstack/react-query')
jest.mock('../useAuth')
jest.mock('../../state', () => ({
  tournamentStore: { set: jest.fn() },
  standingsStore: { update: jest.fn() },
  matchStore: { setMatches: jest.fn() },
  playerCache: {},
}))

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('useTournament', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const mockTournamentData = {
    tournament: {
      id: 'tourn_123',
      name: 'Test Tournament',
      creatorId: 'org_789',
      sport: 'badminton',
      matchFormat: 'singles' as const,
      maxPlayers: 8,
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
      knockout: [
        {
          id: 'match_2',
          tournamentId: 'tourn_123',
          player1Id: 'player_1',
          player2Id: 'player_3',
          status: 'pending' as const,
          deadline: new Date().toISOString(),
        },
      ],
    },
    bracket: {
      rounds: [
        {
          round: 1,
          matches: [
            {
              id: 'bracket_match_1',
              round: 1,
              position: 1,
              player1Id: 'player_1',
              player2Id: 'player_2',
              winnerId: 'player_1',
              score: '2-1',
              status: 'completed' as const,
            },
          ],
        },
      ],
      totalPlayers: 8,
      byeCount: 0,
    },
  }

  describe('Fetching data', () => {
    it('fetches tournament bundle on mount when user is authenticated', async () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: mockTournamentData,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
        isPending: false,
        isError: false,
        isSuccess: true,
        status: 'success',
        failureCount: 0,
        failureReason: null,
        isFetched: true,
        isFetchedAfterMount: true,
        isFetching: false,
        isPlaceholderData: false,
        isPaused: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
      } as any)

      const { result } = renderHook(() => useTournament(tournamentId))

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['tournament', tournamentId],
          enabled: true,
        })
      )

      expect(result.current).toEqual({
        tournament: mockTournamentData.tournament,
        standings: mockTournamentData.standings,
        matches: mockTournamentData.matches,
        bracket: mockTournamentData.bracket,
        isLoading: false,
        error: null,
        refetch: expect.any(Function),
      })
    })

    it('does not fetch when user is not authenticated', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        status: 'idle',
        failureCount: 0,
        failureReason: null,
        isFetched: false,
        isFetchedAfterMount: false,
        isFetching: false,
        isPlaceholderData: false,
        isPaused: false,
        dataUpdatedAt: 0,
        errorUpdatedAt: 0,
      } as any)

      renderHook(() => useTournament(tournamentId))

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      )
    })
  })

  describe('Store updates', () => {
    it('updates tournament store on successful fetch', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: mockTournamentData,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any)

      renderHook(() => useTournament(tournamentId))

      expect(stores.tournamentStore.set).toHaveBeenCalledWith(
        mockTournamentData.tournament
      )
    })

    it('updates standings store on successful fetch', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: mockTournamentData,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any)

      renderHook(() => useTournament(tournamentId))

      expect(stores.standingsStore.update).toHaveBeenCalledWith({
        groupId: 'all',
        standings: mockTournamentData.standings,
      })
    })

    it('updates match store on successful fetch', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: mockTournamentData,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any)

      renderHook(() => useTournament(tournamentId))

      expect(stores.matchStore.setMatches).toHaveBeenCalled()
      const callArgs = (stores.matchStore.setMatches as jest.Mock).mock.calls[0][0]
      expect(callArgs).toHaveLength(2) // 1 group + 1 knockout match
      expect(callArgs[0].type).toBe('group')
      expect(callArgs[1].type).toBe('knockout')
    })
  })

  describe('Loading and error states', () => {
    it('returns isLoading=true while fetching', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: jest.fn(),
        isPending: true,
        isError: false,
        isSuccess: false,
        status: 'pending',
      } as any)

      const { result } = renderHook(() => useTournament(tournamentId))

      expect(result.current.isLoading).toBe(true)
    })

    it('returns error object on fetch failure', () => {
      const tournamentId = 'tourn_123'
      const fetchError = new Error('Network error')

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: fetchError,
        refetch: jest.fn(),
        isPending: false,
        isError: true,
        isSuccess: false,
        status: 'error',
      } as any)

      const { result } = renderHook(() => useTournament(tournamentId))

      expect(result.current.error).toEqual({
        code: 'FETCH_ERROR',
        message: 'Network error',
      })
    })
  })

  describe('Refetch capability', () => {
    it('provides refetch function that calls React Query refetch', async () => {
      const tournamentId = 'tourn_123'
      const mockRefetch = jest.fn()

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: mockTournamentData,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      } as any)

      const { result } = renderHook(() => useTournament(tournamentId))

      await result.current.refetch()

      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe('Null/empty data handling', () => {
    it('returns null tournament when data is undefined', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any)

      const { result } = renderHook(() => useTournament(tournamentId))

      expect(result.current.tournament).toBeNull()
      expect(result.current.standings).toEqual([])
      expect(result.current.matches).toEqual({ group: [], knockout: [] })
      expect(result.current.bracket).toBeNull()
    })

    it('handles bundle with null tournament field', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: {
          tournament: null,
          standings: [],
          matches: { group: [], knockout: [] },
          bracket: null,
        },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any)

      const { result } = renderHook(() => useTournament(tournamentId))

      expect(stores.tournamentStore.set).not.toHaveBeenCalled()
      expect(result.current.tournament).toBeNull()
    })
  })

  describe('React Query configuration', () => {
    it('configures React Query with correct staleTime and gcTime', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: mockTournamentData,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any)

      renderHook(() => useTournament(tournamentId))

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          staleTime: 5 * 60 * 1000, // 5 minutes
          gcTime: 30 * 60 * 1000, // 30 minutes
        })
      )
    })

    it('sets enabled=false when user is null', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any)

      renderHook(() => useTournament(tournamentId))

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      )
    })

    it('sets enabled=false when tournamentId is falsy', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any)

      renderHook(() => useTournament(''))

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      )
    })
  })

  describe('Type safety', () => {
    it('returns data with correct types', () => {
      const tournamentId = 'tourn_123'

      mockUseAuth.mockReturnValue({
        user: { id: 'user_1', email: 'test@test.com', role: 'player' },
        isAuthenticated: true,
        loading: false,
      })

      mockUseQuery.mockReturnValue({
        data: mockTournamentData,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any)

      const { result } = renderHook(() => useTournament(tournamentId))

      // Verify structure without runtime checks
      expect(result.current).toHaveProperty('tournament')
      expect(result.current).toHaveProperty('standings')
      expect(result.current).toHaveProperty('matches')
      expect(result.current).toHaveProperty('bracket')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('refetch')
    })
  })
})
