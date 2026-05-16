/**
 * Test suite for usePermissions hook (TDD - tests define interface)
 *
 * These tests define the contract for usePermissions BEFORE implementation.
 * This allows Phase 3 components to mock this hook while Phase 2 implements it.
 */

import { renderHook } from '@testing-library/react'
import { usePermissions } from '../usePermissions'

// Mock useAuth and useTournament hooks
jest.mock('../useAuth', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../useTournament', () => ({
  useTournament: jest.fn(),
}))

import { useAuth } from '../useAuth'
import { useTournament } from '../useTournament'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockUseTournament = useTournament as jest.MockedFunction<typeof useTournament>

describe('usePermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Player role permissions', () => {
    it('returns correct permissions for a player', () => {
      const userId = 'player_123'
      const tournamentId = 'tourn_456'

      mockUseAuth.mockReturnValue({
        user: {
          id: userId,
          email: 'player@test.com',
          role: 'player',
        },
        isAuthenticated: true,
        loading: false,
      })

      mockUseTournament.mockReturnValue({
        tournament: {
          id: tournamentId,
          name: 'Test Tournament',
          creatorId: 'org_789',
          status: 'group_stage_active',
          sport: 'badminton',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => usePermissions(tournamentId))

      expect(result.current).toEqual({
        playerRole: true,
        organizerRole: false,
        canEditScores: false,
        canPublishBracket: false,
        canManageGroups: false,
        canViewAllStandings: false,
      })
    })
  })

  describe('Organizer role permissions', () => {
    it('returns correct permissions for an organizer who owns the tournament', () => {
      const userId = 'org_789'
      const tournamentId = 'tourn_456'

      mockUseAuth.mockReturnValue({
        user: {
          id: userId,
          email: 'organizer@test.com',
          role: 'organizer',
        },
        isAuthenticated: true,
        loading: false,
      })

      mockUseTournament.mockReturnValue({
        tournament: {
          id: tournamentId,
          name: 'Test Tournament',
          creatorId: userId, // Same as current user
          status: 'group_stage_active',
          sport: 'badminton',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => usePermissions(tournamentId))

      expect(result.current).toEqual({
        playerRole: false,
        organizerRole: true,
        canEditScores: true,
        canPublishBracket: true,
        canManageGroups: true,
        canViewAllStandings: true,
      })
    })

    it('returns correct permissions for an organizer who does not own the tournament', () => {
      const userId = 'org_different'
      const tournamentId = 'tourn_456'
      const creatorId = 'org_789'

      mockUseAuth.mockReturnValue({
        user: {
          id: userId,
          email: 'other-organizer@test.com',
          role: 'organizer',
        },
        isAuthenticated: true,
        loading: false,
      })

      mockUseTournament.mockReturnValue({
        tournament: {
          id: tournamentId,
          name: 'Test Tournament',
          creatorId: creatorId, // Different from current user
          status: 'group_stage_active',
          sport: 'badminton',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => usePermissions(tournamentId))

      expect(result.current).toEqual({
        playerRole: false,
        organizerRole: true,
        canEditScores: true,
        canPublishBracket: false, // Only creator can publish
        canManageGroups: false, // Only creator can manage
        canViewAllStandings: true, // All organizers can view
      })
    })
  })

  describe('Permissions reactivity', () => {
    it('updates permissions when user role changes', () => {
      const tournamentId = 'tourn_456'
      const creatorId = 'org_789'

      // Start as player
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user_123',
          email: 'user@test.com',
          role: 'player',
        },
        isAuthenticated: true,
        loading: false,
      })

      mockUseTournament.mockReturnValue({
        tournament: {
          id: tournamentId,
          name: 'Test Tournament',
          creatorId: creatorId,
          status: 'group_stage_active',
          sport: 'badminton',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result, rerender } = renderHook(() => usePermissions(tournamentId))

      expect(result.current.organizerRole).toBe(false)
      expect(result.current.playerRole).toBe(true)

      // Update to organizer
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user_123',
          email: 'user@test.com',
          role: 'organizer',
        },
        isAuthenticated: true,
        loading: false,
      })

      rerender()

      expect(result.current.organizerRole).toBe(true)
      expect(result.current.playerRole).toBe(false)
      expect(result.current.canEditScores).toBe(true)
    })

    it('updates permissions when tournament creatorId changes', () => {
      const userId = 'org_123'
      const tournamentId = 'tourn_456'

      mockUseAuth.mockReturnValue({
        user: {
          id: userId,
          email: 'organizer@test.com',
          role: 'organizer',
        },
        isAuthenticated: true,
        loading: false,
      })

      // Tournament owned by someone else
      mockUseTournament.mockReturnValue({
        tournament: {
          id: tournamentId,
          name: 'Test Tournament',
          creatorId: 'org_different',
          status: 'group_stage_active',
          sport: 'badminton',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result, rerender } = renderHook(() => usePermissions(tournamentId))

      expect(result.current.canPublishBracket).toBe(false)
      expect(result.current.canManageGroups).toBe(false)

      // Tournament now owned by current user
      mockUseTournament.mockReturnValue({
        tournament: {
          id: tournamentId,
          name: 'Test Tournament',
          creatorId: userId, // Changed to current user
          status: 'group_stage_active',
          sport: 'badminton',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      rerender()

      expect(result.current.canPublishBracket).toBe(true)
      expect(result.current.canManageGroups).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('handles null user gracefully', () => {
      const tournamentId = 'tourn_456'

      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
      })

      mockUseTournament.mockReturnValue({
        tournament: {
          id: tournamentId,
          name: 'Test Tournament',
          creatorId: 'org_789',
          status: 'group_stage_active',
          sport: 'badminton',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => usePermissions(tournamentId))

      expect(result.current).toEqual({
        playerRole: false,
        organizerRole: false,
        canEditScores: false,
        canPublishBracket: false,
        canManageGroups: false,
        canViewAllStandings: false,
      })
    })

    it('handles null tournament gracefully', () => {
      const tournamentId = 'tourn_456'

      mockUseAuth.mockReturnValue({
        user: {
          id: 'user_123',
          email: 'user@test.com',
          role: 'player',
        },
        isAuthenticated: true,
        loading: false,
      })

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => usePermissions(tournamentId))

      expect(result.current).toEqual({
        playerRole: true,
        organizerRole: false,
        canEditScores: false,
        canPublishBracket: false,
        canManageGroups: false,
        canViewAllStandings: false,
      })
    })

    it('returns all false permissions during auth loading', () => {
      const tournamentId = 'tourn_456'

      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true,
      })

      mockUseTournament.mockReturnValue({
        tournament: {
          id: tournamentId,
          name: 'Test Tournament',
          creatorId: 'org_789',
          status: 'group_stage_active',
          sport: 'badminton',
          matchFormat: 'singles',
          maxPlayers: 8,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => usePermissions(tournamentId))

      expect(result.current).toEqual({
        playerRole: false,
        organizerRole: false,
        canEditScores: false,
        canPublishBracket: false,
        canManageGroups: false,
        canViewAllStandings: false,
      })
    })
  })
})
