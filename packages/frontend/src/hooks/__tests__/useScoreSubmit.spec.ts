/**
 * Test suite for useScoreSubmit hook
 *
 * Validates retry state machine with exponential backoff:
 * - 4 total attempts (immediate + 1s/2s/4s delays)
 * - Proper status transitions through the lifecycle
 * - Manual retry and cancel capabilities
 * - Authentication guard
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useScoreSubmit } from '../useScoreSubmit'
import { useAuth } from '../useAuth'
import * as apiClient from '../../api/client'

// Mock dependencies
jest.mock('../../api/client')
jest.mock('../useAuth')

const mockSubmitScore = apiClient.submitScore as jest.MockedFunction<typeof apiClient.submitScore>
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('useScoreSubmit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetAllMocks()
    jest.useFakeTimers()

    mockUseAuth.mockReturnValue({
      user: { id: 'player_123', email: 'player@test.com', name: 'Test Player' },
      isAuthenticated: true,
      isLoading: false,
      signIn: jest.fn(),
      signOut: jest.fn(),
    } as any)

    // Reset all submitScore mocks
    mockSubmitScore.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const tournamentId = 'tourn_123'
  const matchId = 'match_456'

  describe('Initial state', () => {
    it('should have idle status and no error on mount', () => {
      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId))

      expect(result.current.status).toBe('idle')
      expect(result.current.error).toBeNull()
      expect(result.current.attemptCount).toBe(0)
    })
  })

  describe('Successful submission', () => {
    it('should transition to submitting then success', async () => {
      mockSubmitScore.mockResolvedValueOnce({ queued: false })

      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId))

      act(() => {
        result.current.submit('6-4')
      })

      expect(result.current.status).toBe('submitting')
      expect(result.current.attemptCount).toBe(1)

      await waitFor(() => {
        expect(result.current.status).toBe('success')
      })

      expect(result.current.error).toBeNull()
      expect(mockSubmitScore).toHaveBeenCalledWith(
        tournamentId,
        matchId,
        '6-4',
        'player_123',
        'group'
      )
    })
  })

  describe('First failure with retry', () => {
    it('should transition to retrying after first failure', async () => {
      mockSubmitScore
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ queued: false })

      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId))

      act(() => {
        result.current.submit('6-4')
      })

      expect(result.current.status).toBe('submitting')

      // Wait for first attempt to fail
      await waitFor(() => {
        expect(result.current.status).toBe('retrying')
      })

      expect(result.current.attemptCount).toBe(1)
      expect(result.current.error).toBe('Network error')

      // Fast-forward to trigger retry
      act(() => {
        jest.advanceTimersByTime(1000)
      })

      await waitFor(() => {
        expect(result.current.status).toBe('success')
      })

      expect(result.current.attemptCount).toBe(2)
      expect(mockSubmitScore).toHaveBeenCalledTimes(2)
    })
  })

  describe('Multiple retries', () => {
    it('should retry up to 4 total attempts with correct delays', async () => {
      mockSubmitScore
        .mockRejectedValueOnce(new Error('Attempt 1 failed'))
        .mockRejectedValueOnce(new Error('Attempt 2 failed'))
        .mockRejectedValueOnce(new Error('Attempt 3 failed'))
        .mockResolvedValueOnce({ queued: false })

      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId))

      act(() => {
        result.current.submit('6-4')
      })

      // Attempt 1: immediate
      expect(result.current.attemptCount).toBe(1)

      await waitFor(() => {
        expect(result.current.status).toBe('retrying')
      })

      // Retry 1: after 1s
      act(() => {
        jest.advanceTimersByTime(1000)
      })

      await waitFor(() => {
        expect(result.current.attemptCount).toBe(2)
      })

      // Retry 2: after 2s
      act(() => {
        jest.advanceTimersByTime(2000)
      })

      await waitFor(() => {
        expect(result.current.attemptCount).toBe(3)
      })

      // Retry 3: after 4s
      act(() => {
        jest.advanceTimersByTime(4000)
      })

      await waitFor(() => {
        expect(result.current.status).toBe('success')
        expect(result.current.attemptCount).toBe(4)
      })

      expect(mockSubmitScore).toHaveBeenCalledTimes(4)
    })
  })

  describe('All retries exhausted', () => {
    it('should be failed after max attempts', async () => {
      mockSubmitScore.mockRejectedValue(new Error('Permanent failure'))

      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId))

      act(() => {
        result.current.submit('6-4')
      })

      // Wait for first attempt to fail and enter retrying state
      await waitFor(() => expect(result.current.status).toBe('retrying'))
      expect(result.current.attemptCount).toBe(1)

      // Advance 1s for retry attempt 2
      act(() => {
        jest.advanceTimersByTime(1000)
      })
      await waitFor(() => expect(result.current.attemptCount).toBe(2))

      // Advance 2s for retry attempt 3
      act(() => {
        jest.advanceTimersByTime(2000)
      })
      await waitFor(() => expect(result.current.attemptCount).toBe(3))

      // Advance 4s for retry attempt 4
      act(() => {
        jest.advanceTimersByTime(4000)
      })

      await waitFor(() => {
        expect(result.current.status).toBe('failed')
        expect(result.current.attemptCount).toBe(4)
      })

      expect(result.current.error).toBe('Permanent failure')
      expect(mockSubmitScore).toHaveBeenCalledTimes(4)
    })
  })

  describe('Cancel', () => {
    it('should clear pending retry and reset to idle', async () => {
      mockSubmitScore
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ queued: false })

      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId))

      act(() => {
        result.current.submit('6-4')
      })

      await waitFor(() => {
        expect(result.current.status).toBe('retrying')
      })

      act(() => {
        result.current.cancel()
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.error).toBeNull()
      expect(result.current.attemptCount).toBe(0)

      // Advance timer — should NOT trigger retry
      act(() => {
        jest.advanceTimersByTime(1000)
      })

      // Still idle
      expect(result.current.status).toBe('idle')
      expect(mockSubmitScore).toHaveBeenCalledTimes(1) // Only the initial call
    })
  })

  describe('Retry after failure', () => {
    it('should reset count and restart from attempt 1 after manual retry', async () => {
      mockSubmitScore
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ queued: false })

      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId))

      act(() => {
        result.current.submit('6-4')
      })

      // First attempt fails immediately, enters retrying state
      await waitFor(() => {
        expect(result.current.status).toBe('retrying')
      })

      const firstAttemptCount = result.current.attemptCount
      const firstError = result.current.error

      // Manually call retry with new score (this cancels pending timer and resubmits)
      act(() => {
        result.current.retry('7-5')
      })

      // After retry, should reset and be in submitting state with new score
      expect(result.current.status).toBe('submitting')
      expect(result.current.attemptCount).toBe(1) // Reset to attempt 1
      expect(result.current.error).toBeNull() // Error cleared

      // Should succeed on second call
      await waitFor(() => {
        expect(result.current.status).toBe('success')
      })

      expect(mockSubmitScore).toHaveBeenCalledTimes(2)
      expect(mockSubmitScore).toHaveBeenLastCalledWith(
        tournamentId,
        matchId,
        '7-5',
        'player_123',
        'group'
      )
    })
  })

  describe('Queued (offline) submission', () => {
    it('transitions to queued, not success, and never enters the retry loop', async () => {
      mockSubmitScore.mockResolvedValueOnce({ queued: true })

      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId))

      act(() => {
        result.current.submit('6-4')
      })

      await waitFor(() => {
        expect(result.current.status).toBe('queued')
      })

      expect(result.current.error).toBeNull()
      expect(mockSubmitScore).toHaveBeenCalledTimes(1)

      // No retry timers should fire for a queued (202) result.
      act(() => {
        jest.advanceTimersByTime(10000)
      })
      expect(mockSubmitScore).toHaveBeenCalledTimes(1)
      expect(result.current.status).toBe('queued')
    })
  })

  describe('No-op when not authenticated', () => {
    it('should not submit when user is null', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
      } as any)

      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId))

      act(() => {
        result.current.submit('6-4')
      })

      expect(result.current.status).toBe('idle')
      expect(mockSubmitScore).not.toHaveBeenCalled()
    })
  })

  describe('Knockout match type', () => {
    it('should submit to knockout endpoint when matchType is knockout', async () => {
      mockSubmitScore.mockResolvedValueOnce({ queued: false })

      const { result } = renderHook(() => useScoreSubmit(tournamentId, matchId, 'knockout'))

      act(() => {
        result.current.submit('6-4')
      })

      expect(result.current.status).toBe('submitting')

      await waitFor(() => {
        expect(result.current.status).toBe('success')
      })

      expect(mockSubmitScore).toHaveBeenCalledWith(
        tournamentId,
        matchId,
        '6-4',
        'player_123',
        'knockout'
      )
    })
  })
})
