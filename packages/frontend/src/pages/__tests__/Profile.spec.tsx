/**
 * S1.3 — Profile page (P0); S5.3 notify/density; S7.3 availability grid (P12)
 *
 * Renders settings from GET /api/auth/me + availability from
 * GET /api/auth/me/availability; density/notify/quiet-hours PATCH
 * /api/auth/me/settings; the availability grid PUTs the full grid to
 * /api/auth/me/availability on every toggle.
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
  quietHoursStart: number | null
  quietHoursEnd: number | null
}> = {}) {
  return {
    ok: true,
    json: async () => ({
      id: 'account_1',
      email: 'p@e.com',
      role: 'player',
      playerId: 'player_1',
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

  it('renders quiet hours inputs and PATCHes on change', async () => {
    mockFetchRouter({}, { quietHoursStart: 22, quietHoursEnd: 7 })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('quiet-hours-start')).toHaveValue(22)
      expect(screen.getByTestId('quiet-hours-end')).toHaveValue(7)
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
})
