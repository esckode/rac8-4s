/**
 * ISSUE-7 — guest bottom/top nav leaked the auth-gated Standings/Matches
 * (and desktop Groups) tabs. Both routes are protected and bounce an
 * unauthenticated tap to a context-free /login. Decision (owner,
 * 2026-07-21): Option B — hide them for a guest and show a single
 * "Sign in / Register" nav item in their place instead.
 */
/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
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

function renderLayout() {
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

async function renderAuthenticated() {
  localStorage.setItem('auth_token', 'test-token')
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/auth/me')) return Promise.resolve(meResponse())
    return Promise.resolve({ ok: false, json: async () => ({}) })
  })
  const result = renderLayout()
  await waitFor(() => expect(screen.getByTestId('nav-standings')).toBeInTheDocument())
  return result
}

describe('ISSUE-7 — guest nav does not leak auth-gated tabs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  describe('BottomNav (mobile)', () => {
    it('guest sees Tournaments + a sign-in item, not Standings/Matches/Groups/Notifications', () => {
      renderLayout()

      expect(screen.getByTestId('nav-browse')).toBeInTheDocument()
      expect(screen.getByTestId('nav-signin')).toBeInTheDocument()
      expect(screen.queryByTestId('nav-standings')).not.toBeInTheDocument()
      expect(screen.queryByTestId('nav-matches')).not.toBeInTheDocument()
      expect(screen.queryByTestId('nav-groups')).not.toBeInTheDocument()
      expect(screen.queryByTestId('nav-notifications')).not.toBeInTheDocument()
    })

    it('guest sign-in item links to /login', () => {
      renderLayout()
      expect(screen.getByTestId('nav-signin').closest('a')).toHaveAttribute('href', '/login')
    })

    it('authenticated user sees the full tab set unchanged, no sign-in item', async () => {
      await renderAuthenticated()

      expect(screen.getByTestId('nav-browse')).toBeInTheDocument()
      expect(screen.getByTestId('nav-standings')).toBeInTheDocument()
      expect(screen.getByTestId('nav-matches')).toBeInTheDocument()
      expect(screen.getByTestId('nav-groups')).toBeInTheDocument()
      expect(screen.getByTestId('nav-notifications')).toBeInTheDocument()
      expect(screen.queryByTestId('nav-signin')).not.toBeInTheDocument()
    })
  })

  describe('TopNav (desktop)', () => {
    it('guest does not see Groups/Standings/Matches links and sees a sign-in link', () => {
      renderLayout()
      const topNav = screen.getByLabelText('Main navigation')

      expect(within(topNav).queryByRole('link', { name: /groups/i })).not.toBeInTheDocument()
      expect(within(topNav).queryByRole('link', { name: /standings/i })).not.toBeInTheDocument()
      expect(within(topNav).queryByRole('link', { name: /matches/i })).not.toBeInTheDocument()
      expect(within(topNav).getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
    })

    it('authenticated user still sees the full desktop link set', async () => {
      await renderAuthenticated()
      const topNav = screen.getByLabelText('Main navigation')

      expect(within(topNav).getByRole('link', { name: /groups/i })).toHaveAttribute('href', '/groups')
      expect(within(topNav).getByRole('link', { name: /standings/i })).toHaveAttribute('href', '/standings')
      expect(within(topNav).getByRole('link', { name: /matches/i })).toHaveAttribute('href', '/matches')
    })
  })
})
