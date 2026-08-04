/**
 * S1.3 — Profile page (P0); S5.3 notify/density; S7.3 availability grid (P12)
 *
 * Renders settings from GET /api/auth/me + availability from
 * GET /api/auth/me/availability; density/notify/quiet-hours PATCH
 * /api/auth/me/settings; the availability grid PUTs the full grid to
 * /api/auth/me/availability on every toggle. Ratings/partners moved to the
 * dedicated Ratings page (ISSUE-59) — see Ratings.spec.tsx.
 */

import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Profile } from '../Profile'

const mockFetch = jest.fn()
global.fetch = mockFetch

function meResponse(overrides: Partial<{
  timezone: string | null
  timezoneManual: boolean
  tableDensity: string
  notifyMentions: boolean
  notifyPolls: boolean
  notifyNudges: boolean
  quietHoursEnabled: boolean
  quietHoursStart: number | null
  quietHoursEnd: number | null
}> = {}, accountOverrides: Partial<{ email: string; name: string | null }> = {}) {
  return {
    ok: true,
    json: async () => ({
      id: 'account_1',
      email: 'p@e.com',
      role: 'player',
      playerId: 'player_1',
      name: 'Test Player',
      ...accountOverrides,
      settings: {
        timezone: null,
        timezoneManual: false,
        tableDensity: 'comfortable',
        notifyMentions: true,
        notifyPolls: true,
        notifyNudges: true,
        quietHoursStart: null,
        quietHoursEnd: null,
        ...overrides,
      },
    }),
  }
}

function availabilityResponse(
  slots: Array<{ weekday: number; dayPart: string }> = [],
  updatedAt: string | null = null
) {
  return { ok: true, json: async () => ({ slots, updatedAt }) }
}

/** Routes each fetch call by URL so tests don't depend on call order. */
function mockFetchRouter(
  avail: { slots?: Array<{ weekday: number; dayPart: string }>; updatedAt?: string | null } = {},
  meOverrides: Parameters<typeof meResponse>[0] = {}
) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/auth/me/availability')) {
      return Promise.resolve(availabilityResponse(avail.slots ?? [], avail.updatedAt ?? null))
    }
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(meResponse(meOverrides))
    }
    return Promise.resolve({ ok: false, json: async () => ({}) })
  })
}

describe('Profile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('auth_token', 'test-token')
  })

  it('renders with data-testid="profile-page"', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('profile-page')).toBeInTheDocument()
    })
  })

  it('renders the current table density from settings', async () => {
    mockFetchRouter({}, { tableDensity: 'compact' })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('density-select')).toHaveValue('compact')
    })
  })

  it('changing the density toggle PATCHes /api/auth/me/settings', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('density-select')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('density-select'), { target: { value: 'compact' } })

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url, opts]: [string, any]) => url.includes('/api/auth/me/settings') && opts?.method === 'PATCH'
      )
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual({ tableDensity: 'compact' })
    })
  })

  it('renders the notify toggles reflecting current settings', async () => {
    mockFetchRouter({}, { notifyMentions: false })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('notify-mentions-toggle')).not.toBeChecked()
      expect(screen.getByTestId('notify-polls-toggle')).toBeChecked()
      expect(screen.getByTestId('notify-nudges-toggle')).toBeChecked()
    })
  })

  it('toggling notify_mentions off PATCHes /api/auth/me/settings', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('notify-mentions-toggle')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('notify-mentions-toggle'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url, opts]: [string, any]) => url.includes('/api/auth/me/settings') && opts?.method === 'PATCH'
      )
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual({ notifyMentions: false })
    })
  })

  // The window controls are <select>s (bf62816 converted them from number
  // inputs), so toHaveValue reads a string here, not a number.
  it('renders quiet hours inputs and PATCHes on change', async () => {
    mockFetchRouter({}, { quietHoursEnabled: true, quietHoursStart: 22, quietHoursEnd: 7 })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('quiet-hours-start')).toHaveValue('22')
      expect(screen.getByTestId('quiet-hours-end')).toHaveValue('7')
    })

    fireEvent.change(screen.getByTestId('quiet-hours-start'), { target: { value: '23' } })

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url, opts]: [string, any]) => url.includes('/api/auth/me/settings') && opts?.method === 'PATCH'
      )
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual({ quietHoursStart: 23 })
    })
  })

  // ISSUE-66: off by default, and the window is not editable until switched on
  // — the toggle is the only "off" state, since every hour 0-23 is a valid bound.
  it('leaves quiet hours off by default and disables the window until enabled', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('quiet-hours-enabled')).not.toBeChecked()
    })
    expect(screen.getByTestId('quiet-hours-start')).toBeDisabled()
    expect(screen.getByTestId('quiet-hours-end')).toBeDisabled()

    fireEvent.click(screen.getByTestId('quiet-hours-enabled'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url, opts]: [string, any]) => url.includes('/api/auth/me/settings') && opts?.method === 'PATCH'
      )
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual({ quietHoursEnabled: true })
    })
    expect(screen.getByTestId('quiet-hours-start')).toBeEnabled()
  })

  // ── S7.3 — availability grid (P12) ────────────────────────────────────────

  it('renders 21 availability checkboxes (7 weekdays x 3 day-parts)', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('avail-0-morning')).toBeInTheDocument()
      expect(screen.getByTestId('avail-6-evening')).toBeInTheDocument()
    })
    const checkboxes = screen.getAllByTestId(/^avail-\d-(morning|afternoon|evening)$/)
    expect(checkboxes).toHaveLength(21)
  })

  it('checks the boxes matching the fetched slots', async () => {
    mockFetchRouter({ slots: [{ weekday: 2, dayPart: 'evening' }] })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('avail-2-evening')).toBeChecked()
      expect(screen.getByTestId('avail-2-morning')).not.toBeChecked()
    })
  })

  it('toggling a slot PUTs the full updated grid to /api/auth/me/availability', async () => {
    mockFetchRouter({ slots: [{ weekday: 2, dayPart: 'evening' }] })
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('avail-2-evening')).toBeChecked())

    fireEvent.click(screen.getByTestId('avail-3-morning'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url, opts]: [string, any]) => url.includes('/api/auth/me/availability') && opts?.method === 'PUT'
      )
      expect(call).toBeDefined()
      const body = JSON.parse(call[1].body)
      expect(body.slots).toEqual(expect.arrayContaining([
        { weekday: 2, dayPart: 'evening' },
        { weekday: 3, dayPart: 'morning' },
      ]))
      expect(body.slots).toHaveLength(2)
    })
  })

  it('unchecking a slot removes it from the PUT body', async () => {
    mockFetchRouter({ slots: [{ weekday: 2, dayPart: 'evening' }] })
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('avail-2-evening')).toBeChecked())

    fireEvent.click(screen.getByTestId('avail-2-evening'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url, opts]: [string, any]) => url.includes('/api/auth/me/availability') && opts?.method === 'PUT'
      )
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body).slots).toEqual([])
    })
  })

  it('shows when availability was last updated', async () => {
    mockFetchRouter({ slots: [{ weekday: 2, dayPart: 'evening' }], updatedAt: new Date().toISOString() })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('availability-last-updated')).toBeInTheDocument()
    })
  })

  it('shows a re-confirm prompt when availability was last updated more than 60 days ago', async () => {
    const old = new Date(Date.now() - 61 * 24 * 3_600_000).toISOString()
    mockFetchRouter({ slots: [{ weekday: 2, dayPart: 'evening' }], updatedAt: old })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('availability-reconfirm-prompt')).toBeInTheDocument()
    })
  })

  it('does not show a re-confirm prompt when recently updated', async () => {
    const recent = new Date(Date.now() - 5 * 24 * 3_600_000).toISOString()
    mockFetchRouter({ slots: [{ weekday: 2, dayPart: 'evening' }], updatedAt: recent })
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('availability-last-updated')).toBeInTheDocument())
    expect(screen.queryByTestId('availability-reconfirm-prompt')).not.toBeInTheDocument()
  })

  // ISSUE-59: ratings + partners moved to the dedicated Ratings page — Profile
  // must not render them (or fetch their endpoints) anymore.
  it('does not render the ratings or partners sections (moved to /ratings, ISSUE-59)', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('profile-page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Your Rating')).not.toBeInTheDocument()
    expect(screen.queryByText('Recent Partners')).not.toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('/player/ratings'), expect.anything())
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('/player/partners'), expect.anything())
  })

  // ─── ISSUE-64: Profile is account-only — a guest (magic-link) session must ──
  // ─── get an honest state, not fake defaults it can't actually save. ────────

  it('renders a signup prompt instead of the settings form when /api/auth/me is 401 (guest session)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    render(<Profile />)

    await waitFor(() => {
      expect(screen.getByTestId('profile-signup-prompt')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('density-select')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /sign up/i })
    expect(link).toHaveAttribute('href', '/signup')
  })

  it('does not fetch availability or coach memories for a guest (401) session', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    render(<Profile />)

    await waitFor(() => expect(screen.getByTestId('profile-signup-prompt')).toBeInTheDocument())
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/auth/me/availability'), expect.anything())
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('/player/coach/memories'), expect.anything())
  })

  it('a registered account still sees the full settings form (unaffected by the 401 guard)', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('density-select')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('profile-signup-prompt')).not.toBeInTheDocument()
  })

  it('surfaces a visible error when a settings save fails', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('density-select')).toBeInTheDocument())

    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url.includes('/api/auth/me/settings') && opts?.method === 'PATCH') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ message: 'Server error' }) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    fireEvent.change(screen.getByTestId('density-select'), { target: { value: 'compact' } })

    await waitFor(() => {
      expect(screen.getByTestId('profile-save-error')).toBeInTheDocument()
    })
  })

  it('clears the save error once a save succeeds again', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('density-select')).toBeInTheDocument())

    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url.includes('/api/auth/me/settings') && opts?.method === 'PATCH') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ message: 'Server error' }) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    fireEvent.change(screen.getByTestId('density-select'), { target: { value: 'compact' } })
    await waitFor(() => expect(screen.getByTestId('profile-save-error')).toBeInTheDocument())

    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url.includes('/api/auth/me/settings') && opts?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    fireEvent.change(screen.getByTestId('density-select'), { target: { value: 'comfortable' } })

    await waitFor(() => {
      expect(screen.queryByTestId('profile-save-error')).not.toBeInTheDocument()
    })
  })

  // ─── ISSUE-58: Account section (email, editable name, change password) ─────

  it('renders an Account section with the email from /api/auth/me', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('account-email')).toHaveTextContent('p@e.com')
    })
  })

  it('renders the current display name in the editable field', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me/availability')) return Promise.resolve(availabilityResponse())
      if (url.includes('/api/auth/me')) return Promise.resolve(meResponse({}, { name: 'Alice Example' }))
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('display-name-input')).toHaveValue('Alice Example')
    })
  })

  it('submitting a new display name PATCHes /player/name', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('display-name-input')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('display-name-input'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByTestId('display-name-save'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url, opts]: [string, any]) => url === '/player/name' && opts?.method === 'PATCH'
      )
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual({ name: 'New Name' })
    })
  })

  it('shows an inline error when the rename is rejected', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('display-name-input')).toBeInTheDocument())

    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === '/player/name' && opts?.method === 'PATCH') {
        return Promise.resolve({ ok: false, status: 400, json: async () => ({ code: 'VALIDATION_ERROR', message: 'name is reserved' }) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    fireEvent.change(screen.getByTestId('display-name-input'), { target: { value: 'Ref' } })
    fireEvent.click(screen.getByTestId('display-name-save'))

    await waitFor(() => {
      expect(screen.getByTestId('display-name-error')).toHaveTextContent('name is reserved')
    })
  })

  it('the Change password button posts to forgot-password and shows a confirmation', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('change-password-button')).toBeInTheDocument())

    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === '/api/auth/forgot-password' && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    fireEvent.click(screen.getByTestId('change-password-button'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(([url]: [string]) => url === '/api/auth/forgot-password')
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual({ email: 'p@e.com' })
      expect(screen.getByTestId('password-reset-confirmation')).toHaveTextContent(/check your email/i)
    })
  })
})
