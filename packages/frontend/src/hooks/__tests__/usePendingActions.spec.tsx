/**
 * S4.3 — usePendingActions (P5)
 *
 * Fetches GET /api/auth/me/pending-actions on mount and on window refocus
 * (the primary refresh mechanism — SSE is per-conversation and only live
 * while a group chat is open, so it's a supplement, never the sole path).
 * No-ops without an auth token.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { usePendingActions } from '../usePendingActions'

const mockFetch = jest.fn()
global.fetch = mockFetch

function payload(overrides: Partial<{ unscoredMatches: unknown[]; openPolls: unknown[]; pendingCards: unknown[] }> = {}) {
  return {
    ok: true,
    json: async () => ({
      unscoredMatches: [],
      openPolls: [],
      pendingCards: [],
      nearestDeadline: null,
      ...overrides,
    }),
  }
}

describe('usePendingActions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  it('returns zeroed counts and does not fetch without an auth token', async () => {
    const { result } = renderHook(() => usePendingActions())
    expect(result.current).toEqual({ unscoredMatches: 0, openPolls: 0, pendingCards: 0 })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches on mount and returns counts from the payload', async () => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetch.mockResolvedValueOnce(payload({ unscoredMatches: [{}, {}], openPolls: [{}] }))

    const { result } = renderHook(() => usePendingActions())

    await waitFor(() => {
      expect(result.current).toEqual({ unscoredMatches: 2, openPolls: 1, pendingCards: 0 })
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/me/pending-actions',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } })
    )
  })

  it('refetches on window focus', async () => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetch.mockResolvedValueOnce(payload())
    const { result } = renderHook(() => usePendingActions())
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    mockFetch.mockResolvedValueOnce(payload({ pendingCards: [{}] }))
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(result.current).toEqual({ unscoredMatches: 0, openPolls: 0, pendingCards: 1 })
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
