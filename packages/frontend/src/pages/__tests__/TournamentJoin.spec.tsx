/**
 * ISSUE-14 — the emailed magic link forced full account creation
 * (/signup?token=). The backend's GET /:tournamentId/auth/verify already
 * mints a guest player session — this route just wires the frontend to it:
 * click link → guest session → land in the tournament, no password.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TournamentJoin } from '../TournamentJoin'

const mockFetch = jest.fn()
global.fetch = mockFetch as any

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tournament/:tournamentId/join" element={<TournamentJoin />} />
        <Route path="/matches" element={<div>Matches Page</div>} />
        <Route path="/tournament/:tournamentId/browse" element={<div>Browse Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

function renderAtStrict(path: string) {
  return render(
    <React.StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tournament/:tournamentId/join" element={<TournamentJoin />} />
          <Route path="/matches" element={<div>Matches Page</div>} />
        </Routes>
      </MemoryRouter>
    </React.StrictMode>
  )
}

describe('ISSUE-14 — TournamentJoin (guest magic-link landing)', () => {
  const originalLocation = window.location

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    // jsdom doesn't implement navigation; stub it so we can assert on it.
    delete (window as any).location
    window.location = { ...originalLocation, href: '', assign: jest.fn() } as any
  })

  afterEach(() => {
    window.location = originalLocation
  })

  it('exchanges a valid token for a guest session and stores it', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ playerToken: 'guest-session-token', expiresIn: 86400, playerId: 'p1', tournamentId: 't1' }),
    })

    renderAt('/tournament/t1/join?token=abc123')

    await waitFor(() => expect(localStorage.getItem('auth_token')).toBe('guest-session-token'))
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/tournaments/t1/auth/verify?token=abc123'))
  })

  it('redirects into the tournament view after a successful exchange', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ playerToken: 'guest-session-token', expiresIn: 86400, playerId: 'p1', tournamentId: 't1' }),
    })

    renderAt('/tournament/t1/join?token=abc123')

    await waitFor(() => expect(window.location.href).toBe('/matches'))
  })

  it('shows an error with a path back to registration on an invalid/expired token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ code: 'INVALID_TOKEN', message: 'Token is invalid or has expired' }),
    })

    renderAt('/tournament/t1/join?token=expired')

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /register again/i })).toHaveAttribute('href', '/tournament/t1/browse')
    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('shows an error when the token query param is missing, without calling the API', async () => {
    renderAt('/tournament/t1/join')

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('strips the token from the URL after exchange so it is not left in history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ playerToken: 'guest-session-token', expiresIn: 86400, playerId: 'p1', tournamentId: 't1' }),
    })
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState')

    renderAt('/tournament/t1/join?token=abc123')
    await waitFor(() => expect(localStorage.getItem('auth_token')).toBe('guest-session-token'))

    expect(replaceStateSpy).toHaveBeenCalled()
    const strippedUrl = String(replaceStateSpy.mock.calls[0][2])
    expect(strippedUrl).not.toContain('abc123')
  })

  // Regression: the single-use verify token was hit twice under React
  // StrictMode's dev-mode double-invoke (mount → cleanup → mount again),
  // so the second (now-already-consumed) request always won the race and
  // showed "invalid or expired" even on a fresh, valid link. An
  // AbortController does not reliably win this race (the first request can
  // already be in flight to the server before the abort takes effect) — the
  // fix must prevent a second real request from firing at all.
  it('only calls the verify endpoint once under React.StrictMode (single-use token)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ playerToken: 'guest-session-token', expiresIn: 86400, playerId: 'p1', tournamentId: 't1' }),
    })

    renderAtStrict('/tournament/t1/join?token=abc123')

    await waitFor(() => expect(localStorage.getItem('auth_token')).toBe('guest-session-token'))
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
