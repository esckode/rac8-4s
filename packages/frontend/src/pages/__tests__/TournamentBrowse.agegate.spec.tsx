/**
 * Tests for the age-gate (P1.8) overlay wired into tournament registration.
 * Verifies: AGE_ATTESTATION_REQUIRED → DobScreen; UNDER_AGE → terminal; re-submit.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TournamentBrowse } from '../TournamentBrowse'

const TOURNAMENT = {
  id: 'tid_1',
  name: 'Test Open',
  sport: 'pickleball',
  matchFormat: 'doubles',
  maxPlayers: 16,
  status: 'registration_open',
  registrationDeadline: '2026-12-01T17:00:00.000Z',
}

function setupFetch(registerResponses: Array<{ ok: boolean; body: unknown }>) {
  let regCall = 0
  global.fetch = jest.fn((input: unknown, init?: unknown) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    const method = ((init as RequestInit)?.method ?? 'GET').toUpperCase()
    if (method === 'POST' && url.includes('/register')) {
      const resp = registerResponses[regCall++] ?? { ok: false, body: {} }
      return Promise.resolve({ ok: resp.ok, status: resp.ok ? 202 : 400, json: async () => resp.body } as Response)
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => TOURNAMENT } as Response)
  }) as jest.Mock
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/tournament/${TOURNAMENT.id}/browse`]}>
      <Routes>
        <Route path="/tournament/:tournamentId/browse" element={<TournamentBrowse />} />
      </Routes>
    </MemoryRouter>
  )
}

async function fillAndRegister() {
  await screen.findByText(TOURNAMENT.name)
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'alice@example.com' } })
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Alice' } })
  fireEvent.click(screen.getByRole('button', { name: /register/i }))
}

describe('TournamentBrowse age-gate (P1.8)', () => {
  afterEach(() => { delete (global as any).fetch })

  it('shows DobScreen when register returns AGE_ATTESTATION_REQUIRED', async () => {
    setupFetch([{ ok: false, body: { code: 'AGE_ATTESTATION_REQUIRED' } }])
    renderPage()
    await fillAndRegister()
    await waitFor(() => expect(screen.getByTestId('dob-heading')).toBeInTheDocument())
  })

  it('re-registers with dob_attestation when DobScreen confirms', async () => {
    setupFetch([
      { ok: false, body: { code: 'AGE_ATTESTATION_REQUIRED' } },
      { ok: true, body: { message: 'ok' } },
    ])
    renderPage()
    await fillAndRegister()
    await waitFor(() => screen.getByTestId('dob-heading'))

    fireEvent.change(screen.getByTestId('dob-input'), { target: { value: '2000-01-01' } })
    fireEvent.click(screen.getByTestId('dob-submit'))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3)) // 1 GET + 2 POSTs
    const lastCall = (global.fetch as jest.Mock).mock.calls[2]
    const body = JSON.parse((lastCall[1] as RequestInit).body as string)
    expect(body.dob_attestation).toMatchObject({ dateOfBirth: '2000-01-01' })

    // A successful retry must dismiss the age gate — otherwise DobScreen's own
    // render-order check (ageGatePhase === 'required') keeps winning forever,
    // hiding the success message that doRegister already set behind it.
    await waitFor(() => expect(screen.queryByTestId('dob-heading')).not.toBeInTheDocument())
    expect(screen.getByText(/check your email/i)).toBeInTheDocument()
  })

  it('shows terminal underage message on UNDER_AGE', async () => {
    setupFetch([{ ok: false, body: { code: 'UNDER_AGE' } }])
    renderPage()
    await fillAndRegister()
    await waitFor(() =>
      expect(screen.getByTestId('registration-underage-error')).toBeInTheDocument()
    )
  })
})
