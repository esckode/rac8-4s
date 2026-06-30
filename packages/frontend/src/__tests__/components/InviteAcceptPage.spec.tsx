/**
 * RTL unit tests for InviteAcceptPage (P1.7)
 *
 * Tests the 5-state machine driven by the invite-accept API response:
 *  - loading    → auto-submits on mount
 *  - age_required → DobScreen rendered for 18+ attestation
 *  - underage   → terminal rejection message
 *  - token_invalid → invalid/expired link error
 *  - not_found  → group not found error
 *  - success    → "joined" message + token stored + redirect
 */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { InviteAcceptPage } from '../../pages/InviteAcceptPage'

const GROUP_ID = 'grp-abc'
const TOKEN = 'tok_invite_xyz'
const EMAIL = 'alice@example.com'

function renderPage(search = `?token=${encodeURIComponent(TOKEN)}&email=${encodeURIComponent(EMAIL)}`) {
  return render(
    <MemoryRouter initialEntries={[`/groups/${GROUP_ID}/invite${search}`]}>
      <Routes>
        <Route path="/groups/:groupId/invite" element={<InviteAcceptPage />} />
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

describe('InviteAcceptPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    // Mock window.location.replace
    Object.defineProperty(window, 'location', {
      value: { replace: jest.fn() },
      writable: true,
      configurable: true,
    })
  })

  // ── Root container ────────────────────────────────────────────────────────

  it('renders the page container', async () => {
    // Hang the fetch so we stay in loading
    global.fetch = jest.fn().mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByTestId('invite-accept-page')).toBeInTheDocument()
  })

  it('auto-submits POST on mount', async () => {
    mockFetch(200, { ok: true, groupId: GROUP_ID, playerId: 'pid-1', token: 'sess-tok' })
    renderPage()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`/player/groups/${GROUP_ID}/invites/accept`)
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body.token).toBe(TOKEN)
    expect(body.email).toBe(EMAIL)
  })

  // ── Success (200) ─────────────────────────────────────────────────────────

  it('shows success state on 200 response', async () => {
    mockFetch(200, { ok: true, groupId: GROUP_ID, playerId: 'pid-1', token: 'sess-tok' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('invite-success')).toBeInTheDocument())
  })

  it('stores the session token in localStorage on success', async () => {
    mockFetch(200, { ok: true, groupId: GROUP_ID, playerId: 'pid-1', token: 'my-session-token' })
    renderPage()
    await waitFor(() => screen.getByTestId('invite-success'))
    expect(localStorage.getItem('auth_token')).toBe('my-session-token')
  })

  it('redirects to the group detail page on success', async () => {
    mockFetch(200, { ok: true, groupId: GROUP_ID, playerId: 'pid-1', token: 'sess-tok' })
    renderPage()
    await waitFor(() => screen.getByTestId('invite-success'))
    // Redirect may be deferred; advance timers
    jest.useFakeTimers()
    jest.runAllTimers()
    jest.useRealTimers()
    expect(window.location.replace).toHaveBeenCalledWith(`/groups/${GROUP_ID}`)
  })

  // ── AGE_ATTESTATION_REQUIRED ──────────────────────────────────────────────

  it('shows the DobScreen age gate on AGE_ATTESTATION_REQUIRED', async () => {
    mockFetch(400, { code: 'AGE_ATTESTATION_REQUIRED', message: 'Age attestation required' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('invite-age-gate')).toBeInTheDocument())
    expect(screen.getByTestId('dob-input')).toBeInTheDocument()
    expect(screen.getByTestId('dob-submit')).toBeInTheDocument()
  })

  it('re-submits with ageAttestation when DobScreen confirms', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 'AGE_ATTESTATION_REQUIRED', message: 'Need age' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, groupId: GROUP_ID, playerId: 'pid-2', token: 'sess2' }),
      } as unknown as Response)

    renderPage()
    await waitFor(() => screen.getByTestId('invite-age-gate'))

    // Fill in a 25-year-old DOB
    const d = new Date()
    d.setFullYear(d.getFullYear() - 25)
    const dob = d.toISOString().slice(0, 10)
    fireEvent.change(screen.getByTestId('dob-input'), { target: { value: dob } })
    fireEvent.click(screen.getByTestId('dob-submit'))

    await waitFor(() => screen.getByTestId('invite-success'))
    expect(global.fetch).toHaveBeenCalledTimes(2)

    const [, secondOptions] = (global.fetch as jest.Mock).mock.calls[1]
    const secondBody = JSON.parse(secondOptions.body)
    expect(secondBody.ageAttestation).toBeDefined()
    expect(secondBody.ageAttestation.dateOfBirth).toBe(dob)
    expect(secondBody.ageAttestation.policyVersion).toBe('v1')
  })

  // ── UNDERAGE ──────────────────────────────────────────────────────────────

  it('shows terminal rejection on UNDERAGE response', async () => {
    mockFetch(400, { code: 'UNDERAGE', message: 'You must be 18 or older' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('invite-underage')).toBeInTheDocument())
  })

  it('UNDERAGE state does not store a token or redirect', async () => {
    mockFetch(400, { code: 'UNDERAGE', message: 'You must be 18 or older' })
    renderPage()
    await waitFor(() => screen.getByTestId('invite-underage'))
    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  // ── TOKEN_INVALID ─────────────────────────────────────────────────────────

  it('shows invalid link error on TOKEN_INVALID response', async () => {
    mockFetch(400, { code: 'TOKEN_INVALID', message: 'Token is invalid or expired' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('invite-invalid')).toBeInTheDocument())
  })

  it('TOKEN_INVALID state does not redirect', async () => {
    mockFetch(400, { code: 'TOKEN_INVALID', message: 'Token is invalid or expired' })
    renderPage()
    await waitFor(() => screen.getByTestId('invite-invalid'))
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  // ── NOT_FOUND ────────────────────────────────────────────────────────────

  it('shows group not found error on NOT_FOUND response', async () => {
    mockFetch(404, { code: 'NOT_FOUND', message: 'Group not found' })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('invite-not-found')).toBeInTheDocument())
  })

  it('NOT_FOUND state does not redirect', async () => {
    mockFetch(404, { code: 'NOT_FOUND', message: 'Group not found' })
    renderPage()
    await waitFor(() => screen.getByTestId('invite-not-found'))
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  // ── Fallback on unexpected error ──────────────────────────────────────────

  it('shows invalid error state on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'))
    renderPage()
    await waitFor(() => expect(screen.getByTestId('invite-invalid')).toBeInTheDocument())
  })
})
