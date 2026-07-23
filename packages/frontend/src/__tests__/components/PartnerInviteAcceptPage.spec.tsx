/**
 * RTL unit tests for PartnerInviteAcceptPage (ISSUE-15 branch C)
 *
 * Tests the 5-state machine driven by the partner-invite-accept API response:
 *  - loading       → auto-submits on mount
 *  - age_required  → DobScreen rendered for 18+ attestation
 *  - underage      → terminal rejection message
 *  - token_invalid → invalid/expired link error
 *  - not_found     → tournament not found error
 *  - success       → "on the team" message + token stored + redirect
 */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PartnerInviteAcceptPage } from '../../pages/PartnerInviteAcceptPage'

const TOURNAMENT_ID = 'tourn-abc'
const TOKEN = 'tok_partner_xyz'
const EMAIL = 'alice@example.com'

function renderPage(search = `?token=${encodeURIComponent(TOKEN)}&email=${encodeURIComponent(EMAIL)}`) {
  return render(
    <MemoryRouter initialEntries={[`/tournament/${TOURNAMENT_ID}/partner-invite${search}`]}>
      <Routes>
        <Route path="/tournament/:tournamentId/partner-invite" element={<PartnerInviteAcceptPage />} />
      </Routes>
    </MemoryRouter>
  )
}

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response)
}

describe('PartnerInviteAcceptPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(window, 'location', {
      value: { replace: jest.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('renders the page container', async () => {
    global.fetch = jest.fn().mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByTestId('partner-invite-accept-page')).toBeInTheDocument()
  })

  it('auto-submits POST on mount', async () => {
    mockFetch(200, { ok: true, tournamentId: TOURNAMENT_ID, playerId: 'pid-1', token: 'sess-tok' })
    renderPage()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`/tournaments/${TOURNAMENT_ID}/partner-invites/accept`)
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.token).toBe(TOKEN)
    expect(body.email).toBe(EMAIL)
  })

  it('shows success state on 200 response', async () => {
    mockFetch(200, { ok: true, tournamentId: TOURNAMENT_ID, playerId: 'pid-1', token: 'sess-tok' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('partner-invite-success')).toBeInTheDocument())
  })

  it('stores the session token in localStorage and redirects to /matches on success', async () => {
    mockFetch(200, { ok: true, tournamentId: TOURNAMENT_ID, playerId: 'pid-1', token: 'my-session-token' })
    renderPage()
    await waitFor(() => screen.getByTestId('partner-invite-success'))
    expect(localStorage.getItem('auth_token')).toBe('my-session-token')
    expect(window.location.replace).toHaveBeenCalledWith('/matches')
  })

  it('shows the DobScreen age gate on AGE_ATTESTATION_REQUIRED', async () => {
    mockFetch(400, { code: 'AGE_ATTESTATION_REQUIRED', message: 'Age attestation required' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('partner-invite-age-gate')).toBeInTheDocument())
    expect(screen.getByTestId('dob-input')).toBeInTheDocument()
    expect(screen.getByTestId('dob-submit')).toBeInTheDocument()
  })

  it('re-submits with dob_attestation when DobScreen confirms', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 'AGE_ATTESTATION_REQUIRED', message: 'Need age' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, tournamentId: TOURNAMENT_ID, playerId: 'pid-2', token: 'sess2' }),
      } as unknown as Response)

    renderPage()
    await waitFor(() => screen.getByTestId('partner-invite-age-gate'))

    const d = new Date()
    d.setFullYear(d.getFullYear() - 25)
    const dob = d.toISOString().slice(0, 10)
    fireEvent.change(screen.getByTestId('dob-input'), { target: { value: dob } })
    fireEvent.click(screen.getByTestId('dob-submit'))

    await waitFor(() => screen.getByTestId('partner-invite-success'))
    expect(global.fetch).toHaveBeenCalledTimes(2)

    const [, secondOptions] = (global.fetch as jest.Mock).mock.calls[1]
    const secondBody = JSON.parse(secondOptions.body)
    expect(secondBody.dob_attestation).toBeDefined()
    expect(secondBody.dob_attestation.dateOfBirth).toBe(dob)
  })

  it('shows terminal rejection on UNDER_AGE response', async () => {
    mockFetch(400, { code: 'UNDER_AGE', message: 'You must be 18 or older' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('partner-invite-underage')).toBeInTheDocument())
    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  it('shows invalid link error on TOKEN_INVALID response', async () => {
    mockFetch(400, { code: 'TOKEN_INVALID', message: 'Token is invalid or expired' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('partner-invite-invalid')).toBeInTheDocument())
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  it('shows tournament not found error on NOT_FOUND response', async () => {
    mockFetch(404, { code: 'NOT_FOUND', message: 'Tournament not found' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('partner-invite-not-found')).toBeInTheDocument())
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  it('shows invalid error state on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'))
    renderPage()
    await waitFor(() => expect(screen.getByTestId('partner-invite-invalid')).toBeInTheDocument())
  })
})
