/**
 * S5.3 — usePlayerSettings (P10 density wiring)
 *
 * Fetches GET /api/auth/me once on mount and exposes tableDensity. Defaults
 * to 'comfortable' (and never throws) when unauthenticated, unlinked, or
 * the request fails - density is a cosmetic nicety, never worth an error
 * state. Known scope boundary: this reads the account-JWT-only /api/auth/me
 * (not the pending-actions dual-auth route), so a magic-link player-session
 * visitor sees the default density - noted in BACKLOG.md, not a bug fix
 * needed here (unlike pending-actions, nothing breaks; it just doesn't
 * personalize for that session type yet).
 */
import { renderHook, waitFor } from '@testing-library/react'
import { usePlayerSettings } from '../usePlayerSettings'

const mockFetch = jest.fn()
global.fetch = mockFetch

function meResponse(tableDensity: 'comfortable' | 'compact') {
  return {
    ok: true,
    json: async () => ({
      id: 'account_1', email: 'p@e.com', role: 'player', playerId: 'player_1',
      settings: { timezone: null, timezoneManual: false, tableDensity },
    }),
  }
}

describe('usePlayerSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  it('defaults to comfortable without an auth token', () => {
    const { result } = renderHook(() => usePlayerSettings())
    expect(result.current.tableDensity).toBe('comfortable')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches and returns the compact density', async () => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetch.mockResolvedValueOnce(meResponse('compact'))

    const { result } = renderHook(() => usePlayerSettings())

    await waitFor(() => expect(result.current.tableDensity).toBe('compact'))
  })

  it('defaults to comfortable when the request fails', async () => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) })

    const { result } = renderHook(() => usePlayerSettings())

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(result.current.tableDensity).toBe('comfortable')
  })
})
