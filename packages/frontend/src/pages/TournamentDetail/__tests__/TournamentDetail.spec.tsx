/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TournamentDetail } from '../index'

jest.mock('../../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../../hooks/usePermissions', () => ({
  usePermissions: jest.fn(),
}))

import { useAuth } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockUsePermissions = usePermissions as jest.MockedFunction<typeof usePermissions>

describe('TournamentDetail', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/tournament/:tournamentId/*" element={component} />
        </Routes>
      </BrowserRouter>
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'test@example.com',
        role: 'player',
      },
      isAuthenticated: true,
      loading: false,
    })

    mockUsePermissions.mockReturnValue({
      organizerRole: false,
      playerRole: true,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    } as any)
  })

  it('shows sign-in message when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    expect(screen.getByText('Sign in to view tournament details')).toBeInTheDocument()
  })

  it('renders tab navigation with all tabs', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    const standingsElements = screen.getAllByText('Standings')
    const matchesElements = screen.getAllByText('Matches')
    const bracketElements = screen.getAllByText('Bracket')
    const detailsElements = screen.getAllByText('Details')

    expect(standingsElements.length).toBeGreaterThan(0)
    expect(matchesElements.length).toBeGreaterThan(0)
    expect(bracketElements.length).toBeGreaterThan(0)
    expect(detailsElements.length).toBeGreaterThan(0)
  })

  it('renders back button', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    const backButton = screen.getByLabelText('Go back')
    expect(backButton).toBeInTheDocument()
  })

  it('renders page title', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    expect(screen.getByText('Tournament Details')).toBeInTheDocument()
  })

  it('displays current tab content placeholder', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    expect(
      screen.getByText(/Standings tab content will appear here/)
    ).toBeInTheDocument()
  })




  it('highlights current tab', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    const { container } = renderWithRouter(<TournamentDetail />)

    // Find the Standings tab button
    const tabs = container.querySelectorAll('button')
    const standingsTab = Array.from(tabs).find((tab) =>
      tab.textContent?.includes('Standings')
    )

    // Check that it has the active styling
    expect(standingsTab?.getAttribute('aria-selected')).toBe('true')
  })

  it('renders content placeholder', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    expect(
      screen.getByText(/Standings tab content will appear here/)
    ).toBeInTheDocument()
  })


  it('renders with authenticated player', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'player@example.com',
        role: 'player',
      },
      isAuthenticated: true,
      loading: false,
    })

    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    expect(screen.getByText('Tournament Details')).toBeInTheDocument()
  })
})
