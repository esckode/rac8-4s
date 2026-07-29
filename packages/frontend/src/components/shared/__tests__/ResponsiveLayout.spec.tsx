/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../../../hooks/useAuth'
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

describe('ResponsiveLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <BrowserRouter>
        <AuthProvider>
          {component}
        </AuthProvider>
      </BrowserRouter>
    )
  }

  // Play/Groups are auth-gated tabs (ISSUE-1 §Nav — a guest
  // gets nav-signin instead, see ResponsiveLayout.guestNav.spec.tsx), so
  // tests that assert their presence need an authenticated user.
  const renderAuthenticated = async (component: React.ReactElement) => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(meResponse())
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    const result = renderWithRouter(component)
    await waitFor(() => expect(screen.getAllByText('Play').length).toBeGreaterThan(0))
    return result
  }

  it('renders children content', () => {
    renderWithRouter(
      <ResponsiveLayout>
        <div>Test Content</div>
      </ResponsiveLayout>
    )

    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('renders header when showHeader is true', () => {
    renderWithRouter(
      <ResponsiveLayout showHeader>
        <div>Content</div>
      </ResponsiveLayout>
    )

    expect(screen.getByText('C.U.At.Court')).toBeInTheDocument()
  })

  it('does not render header when showHeader is false', () => {
    renderWithRouter(
      <ResponsiveLayout showHeader={false}>
        <div>Content</div>
      </ResponsiveLayout>
    )

    expect(screen.queryByText('C.U.At.Court')).not.toBeInTheDocument()
  })

  it('renders navigation tabs when showNav is true', async () => {
    await renderAuthenticated(
      <ResponsiveLayout showNav>
        <div>Content</div>
      </ResponsiveLayout>
    )

    const standingsElements = screen.getAllByText('Play')
    expect(standingsElements.length).toBeGreaterThan(0)
  })

  it('does not render navigation when showNav is false', () => {
    renderWithRouter(
      <ResponsiveLayout showNav={false}>
        <div>Content</div>
      </ResponsiveLayout>
    )

    expect(screen.queryByText('Play')).not.toBeInTheDocument()
  })

  it('renders a Groups link in the desktop TopNav for an authenticated user (P1.10)', async () => {
    await renderAuthenticated(
      <ResponsiveLayout showNav>
        <div>Content</div>
      </ResponsiveLayout>
    )
    // TopNav is desktop-only; at least one "Groups" link should exist
    const groupLinks = screen.getAllByRole('link', { name: /groups/i })
    expect(groupLinks.some(l => l.getAttribute('href') === '/groups')).toBe(true)
  })

  // ISSUE-27: the More menu (Account/Organizer Dashboard/Settings/About) and
  // Sign out used emoji, which cannot be recoloured and render differently
  // per platform — replaced with hand-rolled SVGs.
  it('renders SVG icons (not emoji text) for the More menu items and Sign out', async () => {
    await renderAuthenticated(
      <ResponsiveLayout showNav>
        <div>Content</div>
      </ResponsiveLayout>
    )

    const moreButton = screen.getByRole('button', { name: 'More' })
    moreButton.click()

    const dialog = await screen.findByRole('dialog', { name: 'More options' })
    for (const label of ['Account', 'Settings', 'About', 'Sign out']) {
      const item = within(dialog).getByText(label).closest('button') as HTMLElement
      expect(item.querySelector('svg')).toBeInTheDocument()
      expect(containsEmoji(item.textContent)).toBe(false)
    }
  })

  it('has a profile link in the header (Player Personalization P0)', () => {
    renderWithRouter(
      <ResponsiveLayout showHeader>
        <div>Content</div>
      </ResponsiveLayout>
    )

    const profileLink = screen.getByTestId('nav-profile')
    expect(profileLink).toBeInTheDocument()
    expect(profileLink.closest('a')).toHaveAttribute('href', '/profile')
  })
})
