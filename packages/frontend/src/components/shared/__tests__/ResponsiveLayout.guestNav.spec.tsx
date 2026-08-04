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

// Plain codepoint scan rather than a Unicode regex range — avoids the
// security/detect-unsafe-regex false positive on \u{1F300}-\u{1FAFF} ranges.
function containsEmoji(text: string | null): boolean {
  if (!text) return false
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if ((cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf)) return true
  }
  return false
}

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

    // ISSUE-59: the bottom nav is fixed at 5 tabs for an authenticated user —
    // Browse never claims a 6th slot, even when discovery is enabled. It
    // moves into the More sheet instead.
    it('authenticated user never sees a Browse tab, even when publicDiscoveryEnabled is true (ISSUE-59)', async () => {
      await renderAuthenticated(true)

      expect(screen.queryByTestId('nav-browse')).not.toBeInTheDocument()
      expect(screen.getByTestId('nav-groups')).toBeInTheDocument()
      expect(screen.getByTestId('nav-play')).toBeInTheDocument()
      expect(screen.getByTestId('nav-ratings')).toBeInTheDocument()
      expect(screen.getByTestId('nav-notifications')).toBeInTheDocument()
      expect(screen.getByTestId('nav-more')).toBeInTheDocument()
    })

    it('Browse appears in the More sheet for an authenticated user when publicDiscoveryEnabled is true (ISSUE-59)', async () => {
      await renderAuthenticated(true)

      screen.getByTestId('nav-more').click()
      const dialog = await screen.findByRole('dialog', { name: 'More options' })
      expect(within(dialog).getByText('Browse')).toBeInTheDocument()
    })

    it('Browse does NOT appear in the More sheet when publicDiscoveryEnabled is false', async () => {
      await renderAuthenticated(false)

      screen.getByTestId('nav-more').click()
      const dialog = await screen.findByRole('dialog', { name: 'More options' })
      expect(within(dialog).queryByText('Browse')).not.toBeInTheDocument()
    })
  })

  // ISSUE-27: emoji nav icons render differently per platform and cannot be
  // recoloured for the active/inactive states — replaced with hand-rolled
  // SVGs using stroke="currentColor" so the existing .active CSS color rule
  // drives them for free, the one thing emoji structurally cannot do.
  describe('nav icons are SVG, not emoji text (ISSUE-27)', () => {
    it('renders an SVG icon (not a text node) for every visible bottom-nav item, authenticated', async () => {
      await renderAuthenticated()

      for (const testId of ['nav-play', 'nav-groups', 'nav-notifications']) {
        const item = screen.getByTestId(testId)
        const svg = item.querySelector('svg')
        expect(svg).toBeInTheDocument()
        expect(containsEmoji(item.textContent)).toBe(false)
      }
    })

    it('renders an SVG icon for the guest sign-in nav item', () => {
      renderLayout()

      const item = screen.getByTestId('nav-signin')
      expect(item.querySelector('svg')).toBeInTheDocument()
      expect(containsEmoji(item.textContent)).toBe(false)
    })

    it('the icon strokes with currentColor, so the nav-item .active color rule drives it', async () => {
      await renderAuthenticated()

      const svg = screen.getByTestId('nav-play').querySelector('svg')
      expect(svg).toHaveAttribute('stroke', 'currentColor')
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
