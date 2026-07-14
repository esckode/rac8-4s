/**
 * S4.3/S4.5 — usePendingActions (P5)
 *
 * Fetches GET /api/auth/me/pending-actions on mount and on window refocus
 * (the primary refresh mechanism — SSE is per-conversation and only live
 * while a group chat is open, so it's a supplement, never the sole path).
 * No-ops without an auth token. Returns the full payload — consumed as
 * counts by the nav badges (P5) and as items by the up-next strip (P6).
 */
import { renderHook, waitFor } from '@testing-library/react'
import { usePendingActions } from '../usePendingActions'

const mockFetch = jest.fn()
global.fetch = mockFetch

function payload(overrides: Partial<{ unscoredMatches: unknown[]; openPolls: unknown[]; pendingCards: unknown[]; nearestDeadline: unknown }> = {}) {
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

  it('returns an empty payload and does not fetch without an auth token', async () => {
    const { result } = renderHook(() => usePendingActions())
    expect(result.current).toEqual({ unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches on mount and returns the payload', async () => {
    localStorage.setItem('auth_token', 'test-token')
    const matches = [{ tournamentId: 't1', tournamentName: 'T1', matchId: 'm1', opponentName: 'Bob' }]
    mockFetch.mockResolvedValueOnce(payload({ unscoredMatches: matches }))

    const { result } = renderHook(() => usePendingActions())

    await waitFor(() => {
      expect(result.current.unscoredMatches).toEqual(matches)
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

    const cards = [{ groupId: 'g1', groupName: 'G1', cardId: 'c1', action: 'propose_score' }]
    mockFetch.mockResolvedValueOnce(payload({ pendingCards: cards }))
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(result.current.pendingCards).toEqual(cards)
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
