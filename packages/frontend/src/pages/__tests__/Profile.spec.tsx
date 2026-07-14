/**
 * S1.3 — Profile page (P0)
 *
 * Renders settings from GET /api/auth/me; density toggle PATCHes
 * /api/auth/me/settings and updates the UI.
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

describe('Profile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('auth_token', 'test-token')
  })

  it('renders with data-testid="profile-page"', async () => {
    mockFetch.mockResolvedValueOnce(meResponse())
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('profile-page')).toBeInTheDocument()
    })
  })

  it('renders the current table density from settings', async () => {
    mockFetch.mockResolvedValueOnce(meResponse({ tableDensity: 'compact' }))
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('density-select')).toHaveValue('compact')
    })
  })

  it('changing the density toggle PATCHes /api/auth/me/settings', async () => {
    mockFetch
      .mockResolvedValueOnce(meResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { timezone: null, timezoneManual: false, tableDensity: 'compact' } }) })

    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('density-select')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('density-select'), { target: { value: 'compact' } })

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/api/auth/me/settings')
      )
      expect(call).toBeDefined()
      expect(call[1]).toMatchObject({ method: 'PATCH' })
      expect(JSON.parse(call[1].body)).toEqual({ tableDensity: 'compact' })
    })
  })

  it('renders the notify toggles reflecting current settings', async () => {
    mockFetch.mockResolvedValueOnce(meResponse({ notifyMentions: false }))
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('notify-mentions-toggle')).not.toBeChecked()
      expect(screen.getByTestId('notify-polls-toggle')).toBeChecked()
      expect(screen.getByTestId('notify-nudges-toggle')).toBeChecked()
    })
  })

  it('toggling notify_mentions off PATCHes /api/auth/me/settings', async () => {
    mockFetch
      .mockResolvedValueOnce(meResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => (meResponse({ notifyMentions: false }).json()) })

    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('notify-mentions-toggle')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('notify-mentions-toggle'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/api/auth/me/settings')
      )
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual({ notifyMentions: false })
    })
  })

  it('renders quiet hours inputs and PATCHes on change', async () => {
    mockFetch
      .mockResolvedValueOnce(meResponse({ quietHoursStart: 22, quietHoursEnd: 7 }))
      .mockResolvedValueOnce({ ok: true, json: async () => (meResponse({ quietHoursStart: 23, quietHoursEnd: 7 }).json()) })

    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('quiet-hours-start')).toHaveValue(22)
      expect(screen.getByTestId('quiet-hours-end')).toHaveValue(7)
    })

    fireEvent.change(screen.getByTestId('quiet-hours-start'), { target: { value: '23' } })

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/api/auth/me/settings')
      )
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual({ quietHoursStart: 23 })
    })
  })
})
