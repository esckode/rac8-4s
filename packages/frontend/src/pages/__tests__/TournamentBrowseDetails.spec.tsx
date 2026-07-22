/**
 * ISSUE-12 + ISSUE-13 — TournamentBrowse (public detail + registration):
 * - guest copy is unambiguous ("register as a guest... no account/password")
 * - authenticated user gets a one-click Register (no re-typed email/name)
 * - doubles tournaments surface a partner-invite field
 * - the confirmation echoes the entered email with an edit/resend path
 * - description, deadline, and registered/capacity are rendered
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TournamentBrowse } from '../TournamentBrowse'

const mockUseAuth = jest.fn()
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const SINGLES = {
  id: 't_singles', name: 'Singles Open', sport: 'tennis', matchFormat: 'singles',
  maxPlayers: 16, status: 'registration_open', registrationDeadline: '2026-12-01T17:00:00.000Z',
  description: 'A friendly weeknight singles ladder.', registeredCount: 5,
}
const DOUBLES = { ...SINGLES, id: 't_doubles', matchFormat: 'doubles' }

function mockFetch(tournament: unknown, registerStatus = 202) {
  const fn = jest.fn((input: unknown, init?: unknown) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    const method = ((init as RequestInit)?.method ?? 'GET').toUpperCase()
    if (method === 'POST' && url.includes('/register')) {
      return Promise.resolve({
        ok: registerStatus < 400,
        status: registerStatus,
        json: async () => ({ message: 'ok' }),
      } as Response)
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => tournament } as Response)
  })
  global.fetch = fn as jest.Mock
  return fn
}

function renderPage(tournamentId: string) {
  return render(
    <MemoryRouter initialEntries={[`/tournament/${tournamentId}/browse`]}>
      <Routes>
        <Route path="/tournament/:tournamentId/browse" element={<TournamentBrowse />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ISSUE-12/13 — TournamentBrowse', () => {
  afterEach(() => {
    jest.clearAllMocks()
    delete (global as any).fetch
  })

  describe('guest', () => {
    beforeEach(() => mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null }))

    it('states plainly this is guest registration, no account/password needed', async () => {
      mockFetch(SINGLES)
      renderPage(SINGLES.id)
      await screen.findByText(SINGLES.name)
      expect(screen.getByText(/no account or password needed/i)).toBeInTheDocument()
    })

    it('renders the description', async () => {
      mockFetch(SINGLES)
      renderPage(SINGLES.id)
      expect(await screen.findByText(SINGLES.description)).toBeInTheDocument()
    })

    it('renders the registration deadline', async () => {
      mockFetch(SINGLES)
      renderPage(SINGLES.id)
      await screen.findByText(SINGLES.name)
      expect(screen.getByText(/dec/i)).toBeInTheDocument()
    })

    it('renders registered/capacity', async () => {
      mockFetch(SINGLES)
      renderPage(SINGLES.id)
      await screen.findByText(SINGLES.name)
      expect(screen.getByText(/5\s*\/\s*16/)).toBeInTheDocument()
    })

    it('renders a friendly status badge, not the raw enum', async () => {
      mockFetch({ ...SINGLES, status: 'group_stage_active' })
      renderPage(SINGLES.id)
      await screen.findByText(SINGLES.name)
      expect(screen.getByText('In Progress')).toBeInTheDocument()
    })

    it('does not show a partner field for singles', async () => {
      mockFetch(SINGLES)
      renderPage(SINGLES.id)
      await screen.findByText(SINGLES.name)
      expect(screen.queryByLabelText(/partner/i)).not.toBeInTheDocument()
    })

    it('shows a partner-invite field for doubles', async () => {
      mockFetch(DOUBLES)
      renderPage(DOUBLES.id)
      await screen.findByText(DOUBLES.name)
      expect(screen.getByLabelText(/partner/i)).toBeInTheDocument()
    })

    it('sends the partner invite email when provided (doubles)', async () => {
      const fetchSpy = mockFetch(DOUBLES)
      renderPage(DOUBLES.id)
      await screen.findByText(DOUBLES.name)

      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'guest@example.com' } })
      fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Guest Player' } })
      fireEvent.change(screen.getByLabelText(/partner/i), { target: { value: 'partner@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST')
        expect(call).toBeDefined()
        const body = JSON.parse((call![1] as RequestInit).body as string)
        expect(body.partnerSelection).toEqual({ type: 'invite', value: 'partner@example.com' })
      })
    })

    it('echoes the entered email on confirmation with an edit path', async () => {
      mockFetch(SINGLES)
      renderPage(SINGLES.id)
      await screen.findByText(SINGLES.name)

      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'typo@example.com' } })
      fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Guest' } })
      fireEvent.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => expect(screen.getByText(/typo@example\.com/)).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /edit|wrong email/i })).toBeInTheDocument()
    })

    it('edit control returns to the form for correction', async () => {
      mockFetch(SINGLES)
      renderPage(SINGLES.id)
      await screen.findByText(SINGLES.name)

      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'typo@example.com' } })
      fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Guest' } })
      fireEvent.click(screen.getByRole('button', { name: /register/i }))
      await waitFor(() => expect(screen.getByText(/typo@example\.com/)).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: /edit|wrong email/i }))
      expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
    })
  })

  describe('authenticated', () => {
    beforeEach(() => mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'acc_1', email: 'me@example.com', name: 'Me', role: 'player', playerId: 'player_1' },
    }))

    it('shows a one-click register button instead of the guest form', async () => {
      mockFetch(SINGLES)
      renderPage(SINGLES.id)
      await screen.findByText(SINGLES.name)
      expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
    })

    it('registers with the account email/name on one click, no typing required', async () => {
      const fetchSpy = mockFetch(SINGLES)
      renderPage(SINGLES.id)
      await screen.findByText(SINGLES.name)

      fireEvent.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST')
        expect(call).toBeDefined()
        const body = JSON.parse((call![1] as RequestInit).body as string)
        expect(body.email).toBe('me@example.com')
        expect(body.name).toBe('Me')
      })
      expect(await screen.findByText(/me@example\.com/)).toBeInTheDocument()
    })

    it('shows a partner-invite field for doubles and sends it on one-click register', async () => {
      const fetchSpy = mockFetch(DOUBLES)
      renderPage(DOUBLES.id)
      await screen.findByText(DOUBLES.name)

      fireEvent.change(screen.getByLabelText(/partner/i), { target: { value: 'partner@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST')
        expect(call).toBeDefined()
        const body = JSON.parse((call![1] as RequestInit).body as string)
        expect(body.partnerSelection).toEqual({ type: 'invite', value: 'partner@example.com' })
      })
    })
  })
})
