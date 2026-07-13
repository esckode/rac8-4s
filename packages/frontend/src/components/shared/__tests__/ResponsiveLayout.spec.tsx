/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../../../hooks/useAuth'
import { ResponsiveLayout } from '../ResponsiveLayout'

describe('ResponsiveLayout', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <BrowserRouter>
        <AuthProvider>
          {component}
        </AuthProvider>
      </BrowserRouter>
    )
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

  it('renders navigation tabs when showNav is true', () => {
    renderWithRouter(
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

  it('renders a Groups link in the desktop TopNav (P1.10)', () => {
    renderWithRouter(
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
