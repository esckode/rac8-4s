/**
 * S7.3 — Profile "Coach" section (RED first)
 *
 * coach_memory_enabled toggle (PATCH /api/auth/me/settings), memories list
 * with per-entry delete (optimistic on 204), Clear conversation button with
 * a confirm dialog (POST /player/coach/clear).
 */

import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Profile } from '../Profile'

const mockFetch = jest.fn()
global.fetch = mockFetch

function meResponse(overrides: Record<string, unknown> = {}) {
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
        coachMemoryEnabled: true,
        ...overrides,
      },
    }),
  }
}

function memoriesResponse(memories: Array<Record<string, unknown>>) {
  return { ok: true, json: async () => ({ memories }) }
}

function mockFetchRouter(opts: {
  meOverrides?: Record<string, unknown>
  memories?: Array<Record<string, unknown>>
} = {}) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/auth/me/availability')) {
      return Promise.resolve({ ok: true, json: async () => ({ slots: [], updatedAt: null }) })
    }
    if (url.includes('/player/coach/memories') && init?.method === 'DELETE') {
      return Promise.resolve({ ok: true, status: 204, json: async () => ({}) })
    }
    if (url.includes('/player/coach/memories')) {
      return Promise.resolve(memoriesResponse(opts.memories ?? []))
    }
    if (url.includes('/player/coach/clear')) {
      return Promise.resolve({ ok: true, json: async () => ({ cleared: 3 }) })
    }
    if (url.includes('/api/auth/me/settings')) {
      return Promise.resolve(meResponse(opts.meOverrides))
    }
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(meResponse(opts.meOverrides))
    }
    return Promise.resolve({ ok: false, json: async () => ({}) })
  })
}

describe('Profile — Coach section', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('auth_token', 'test-token')
  })

  it('renders the memory toggle reflecting current settings', async () => {
    mockFetchRouter({ meOverrides: { coachMemoryEnabled: false } })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByTestId('coach-memory-toggle')).not.toBeChecked()
    })
  })

  it('toggling memory PATCHes /api/auth/me/settings', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('coach-memory-toggle')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('coach-memory-toggle'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/me/settings',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ coachMemoryEnabled: false }),
        })
      )
    })
  })

  it('lists memories with created-at and a delete button per entry', async () => {
    mockFetchRouter({
      memories: [{ id: 'mem_1', body: 'prefers morning matches', source: 'player', createdAt: new Date('2026-07-01').toISOString() }],
    })
    render(<Profile />)

    await waitFor(() => {
      expect(screen.getByText('prefers morning matches')).toBeInTheDocument()
    })
    expect(screen.getByTestId('memory-delete')).toBeInTheDocument()
  })

  it('deleting a memory optimistically removes it on 204', async () => {
    mockFetchRouter({
      memories: [{ id: 'mem_1', body: 'prefers morning matches', source: 'player', createdAt: new Date('2026-07-01').toISOString() }],
    })
    render(<Profile />)
    await waitFor(() => expect(screen.getByText('prefers morning matches')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('memory-delete'))

    await waitFor(() => {
      expect(screen.queryByText('prefers morning matches')).not.toBeInTheDocument()
    })
  })

  it('links to the privacy policy in the footer (S9)', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('profile-page')).toBeInTheDocument())

    const link = screen.getByRole('link', { name: /privacy policy/i })
    expect(link).toHaveAttribute('href', '/privacy')
  })

  it('Clear conversation shows a confirm dialog, then POSTs /player/coach/clear', async () => {
    mockFetchRouter()
    render(<Profile />)
    await waitFor(() => expect(screen.getByTestId('coach-clear')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('coach-clear'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('coach-clear-confirm'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/player/coach/clear', expect.objectContaining({ method: 'POST' }))
    })
  })
})
