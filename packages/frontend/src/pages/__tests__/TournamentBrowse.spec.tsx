/**
 * Unit tests for the public tournament details + guest registration page.
 *
 * Contract (per rac8-4s-HL.md "TOURNAMENT DETAILS PAGE: /tournament/:id/browse"):
 * - Public page; fetches tournament details by id and shows name + status.
 * - Shows a guest registration form (email + name) and a "Sign In" affordance.
 * - Submitting registers via POST /tournaments/:id/register and confirms (check email).
 * - A duplicate registration (409) surfaces a clear error instead of crashing.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TournamentBrowse } from '../TournamentBrowse'

const TOURNAMENT = {
  id: 'tournament_test_1',
  name: 'Sunset Pickleball Open',
  sport: 'pickleball',
  matchFormat: 'doubles',
  maxPlayers: 16,
  status: 'registration_open',
  registrationDeadline: '2026-07-01T17:00:00.000Z',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/tournament/${TOURNAMENT.id}/browse`]}>
      <Routes>
        <Route path="/tournament/:tournamentId/browse" element={<TournamentBrowse />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('TournamentBrowse (public details + guest registration)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    delete (global as any).fetch
  })

  function mockFetch(registerStatus = 202) {
    const fn = jest.fn((input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url
      const method = (init?.method || 'GET').toUpperCase()
      if (method === 'POST' && url.includes('/register')) {
        return Promise.resolve({
          ok: registerStatus < 400,
          status: registerStatus,
          json: async () => (registerStatus < 400
            ? { message: 'Registration email sent' }
            : { code: 'DUPLICATE_VALUE', message: 'Value already exists' }),
        } as Response)
      }
      // GET tournament details
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => TOURNAMENT,
      } as Response)
    })
    ;(global as any).fetch = fn
    return fn
  }

  it('renders the tournament name and status', async () => {
    mockFetch()
    renderPage()
    expect(await screen.findByText(TOURNAMENT.name)).toBeInTheDocument()
    expect(screen.getByText(/registration open/i)).toBeInTheDocument()
  })

  it('shows a guest registration form and a sign-in affordance', async () => {
    mockFetch()
    renderPage()
    await screen.findByText(TOURNAMENT.name)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
    expect(screen.getByText(/sign in/i)).toBeInTheDocument()
  })

  it('registers a guest and confirms with a check-email message', async () => {
    const fetchSpy = mockFetch(202)
    renderPage()
    await screen.findByText(TOURNAMENT.name)

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'guest@example.com' } })
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Guest Player' } })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/tournaments/${TOURNAMENT.id}/register`),
        expect.objectContaining({ method: 'POST' })
      )
    })
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })

  it('surfaces a clear error when the email is already registered (409)', async () => {
    mockFetch(409)
    renderPage()
    await screen.findByText(TOURNAMENT.name)

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'dupe@example.com' } })
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Dupe Player' } })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))

    expect(await screen.findByText(/already|exists|registered/i)).toBeInTheDocument()
  })
})
