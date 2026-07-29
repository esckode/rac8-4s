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
import { AppConfigProvider } from '../../../context/AppConfigContext'
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

// ISSUE-29: Browse is gated behind publicDiscoveryEnabled, default false.
function configResponse(publicDiscoveryEnabled: boolean) {
  return { ok: true, json: async () => ({ publicDiscoveryEnabled }) }
}

function renderLayout(publicDiscoveryEnabled = false) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/config')) return Promise.resolve(configResponse(publicDiscoveryEnabled))
    return Promise.resolve({ ok: false, json: async () => ({}) })
  })
  return render(
    <BrowserRouter>
      <AppConfigProvider>
        <AuthProvider>
          <ResponsiveLayout showNav>
            <div>Content</div>
          </ResponsiveLayout>
        </AuthProvider>
      </AppConfigProvider>
    </BrowserRouter>
  )
}

async function renderAuthenticated(publicDiscoveryEnabled = false) {
  localStorage.setItem('auth_token', 'test-token')
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/auth/me')) return Promise.resolve(meResponse())
    if (url.includes('/api/config')) return Promise.resolve(configResponse(publicDiscoveryEnabled))
    return Promise.resolve({ ok: false, json: async () => ({}) })
  })
  const result = render(
    <BrowserRouter>
      <AppConfigProvider>
        <AuthProvider>
          <ResponsiveLayout showNav>
            <div>Content</div>
          </ResponsiveLayout>
        </AuthProvider>
      </AppConfigProvider>
    </BrowserRouter>
  )
  await waitFor(() => expect(screen.getByTestId('nav-play')).toBeInTheDocument())
  return result
}

describe('ISSUE-7 — guest nav does not leak auth-gated tabs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  describe('BottomNav (mobile)', () => {
    it('guest collapses to just a sign-in item — Browse is blocked by default (ISSUE-29)', () => {
      renderLayout()

      expect(screen.queryByTestId('nav-browse')).not.toBeInTheDocument()
      expect(screen.getByTestId('nav-signin')).toBeInTheDocument()
      expect(screen.queryByTestId('nav-play')).not.toBeInTheDocument()
      expect(screen.queryByTestId('nav-groups')).not.toBeInTheDocument()
      expect(screen.queryByTestId('nav-notifications')).not.toBeInTheDocument()
    })

    it('guest sign-in item links to /login', () => {
      renderLayout()
      expect(screen.getByTestId('nav-signin').closest('a')).toHaveAttribute('href', '/login')
    })

    it('shows Browse for a guest when publicDiscoveryEnabled is true — the dormant testid reappears unchanged', async () => {
      renderLayout(true)

      await waitFor(() => expect(screen.getByTestId('nav-browse')).toBeInTheDocument())
      expect(screen.getByTestId('nav-signin')).toBeInTheDocument()
    })

    it('authenticated user sees Play/Groups/Alerts, no Browse by default, no sign-in item', async () => {
      await renderAuthenticated()

      expect(screen.queryByTestId('nav-browse')).not.toBeInTheDocument()
      expect(screen.getByTestId('nav-play')).toBeInTheDocument()
      expect(screen.getByTestId('nav-groups')).toBeInTheDocument()
      expect(screen.getByTestId('nav-notifications')).toBeInTheDocument()
      expect(screen.queryByTestId('nav-signin')).not.toBeInTheDocument()
    })
  })

  describe('TopNav (desktop)', () => {
    it('guest does not see Groups/Play links and sees a sign-in link', () => {
      renderLayout()
      const topNav = screen.getByLabelText('Main navigation')

      expect(within(topNav).queryByRole('link', { name: /groups/i })).not.toBeInTheDocument()
      expect(within(topNav).queryByRole('link', { name: /^play$/i })).not.toBeInTheDocument()
      expect(within(topNav).getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
    })

    it('authenticated user still sees the full desktop link set', async () => {
      await renderAuthenticated()
      const topNav = screen.getByLabelText('Main navigation')

      expect(within(topNav).getByRole('link', { name: /groups/i })).toHaveAttribute('href', '/groups')
      expect(within(topNav).getByRole('link', { name: /^play$/i })).toHaveAttribute('href', '/play')
    })
  })
})
