/**
 * S4.3/S4.4 — Nav tab badges from usePendingActions (P5)
 *
 * Matches tab badges my unscored-match count; Groups tab badges my
 * open-polls + pending-cards count (additive to the pre-existing unread
 * chat badge, a different signal). Numeric, capped at "9+".
 */
/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../../../hooks/useAuth'
import { ResponsiveLayout } from '../ResponsiveLayout'

const mockFetch = jest.fn()
global.fetch = mockFetch

function meResponse() {
  return {
    ok: true,
    json: async () => ({
      id: 'account_1', email: 'p@e.com', role: 'player', playerId: 'player_1',
      settings: { timezone: null, timezoneManual: false, tableDensity: 'comfortable' },
    }),
  }
}

function pendingActionsResponse(overrides: Partial<{ unscoredMatches: unknown[]; openPolls: unknown[]; pendingCards: unknown[] }> = {}) {
  return {
    ok: true,
    json: async () => ({
      unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null,
      ...overrides,
    }),
  }
}

function groupsResponse(groups: Array<{ id: string; unreadCount: number }> = []) {
  return { ok: true, json: async () => ({ groups }) }
}

function mockFetchRouter(
  pending: Partial<{ unscoredMatches: unknown[]; openPolls: unknown[]; pendingCards: unknown[] }>,
  groups: Array<{ id: string; unreadCount: number }> = []
) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/pending-actions')) return Promise.resolve(pendingActionsResponse(pending))
    if (url.includes('/api/auth/me')) return Promise.resolve(meResponse())
    if (url.includes('/player/groups')) return Promise.resolve(groupsResponse(groups))
    return Promise.resolve({ ok: false, json: async () => ({}) })
  })
}

function renderWithProviders() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <ResponsiveLayout showNav>
          <div>Content</div>
        </ResponsiveLayout>
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('ResponsiveLayout — pending-actions nav badges', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  it('shows no badges when nothing is pending', async () => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetchRouter({})
    renderWithProviders()

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(screen.queryByTestId('nav-badge-matches')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-badge-groups')).not.toBeInTheDocument()
  })

  it('shows the unscored-match count on the Matches tab', async () => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetchRouter({ unscoredMatches: [{}, {}, {}] })
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByTestId('nav-badge-matches')).toHaveTextContent('3')
    })
  })

  it('shows the open-polls + pending-cards count on the Groups tab, capped at 9+', async () => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetchRouter({
      openPolls: new Array(7).fill({}),
      pendingCards: new Array(5).fill({}),
    })
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByTestId('nav-badge-groups')).toHaveTextContent('9+')
    })
  })

  // ISSUE-56: the Groups tab's unread badge (distinct from nav-badge-groups
  // above, which is polls/cards) counts *groups with unread*, not total
  // unread messages.
  it('the groups-unread-badge counts groups with unread, not total messages', async () => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetchRouter({}, [
      { id: 'g1', unreadCount: 40 },
      { id: 'g2', unreadCount: 40 },
      { id: 'g3', unreadCount: 40 },
    ])
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByTestId('groups-unread-badge')).toHaveTextContent('3')
    })
  })
})
