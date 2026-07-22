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

  // Standings/Matches/Groups are auth-gated tabs (ISSUE-1 §Nav — a guest
  // gets nav-signin instead, see ResponsiveLayout.guestNav.spec.tsx), so
  // tests that assert their presence need an authenticated user.
  const renderAuthenticated = async (component: React.ReactElement) => {
    localStorage.setItem('auth_token', 'test-token')
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(meResponse())
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    const result = renderWithRouter(component)
    await waitFor(() => expect(screen.getAllByText('Standings').length).toBeGreaterThan(0))
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

    const standingsElements = screen.getAllByText('Standings')
    expect(standingsElements.length).toBeGreaterThan(0)
  })

  it('does not render navigation when showNav is false', () => {
    renderWithRouter(
      <ResponsiveLayout showNav={false}>
        <div>Content</div>
      </ResponsiveLayout>
    )

    expect(screen.queryByText('Standings')).not.toBeInTheDocument()
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
