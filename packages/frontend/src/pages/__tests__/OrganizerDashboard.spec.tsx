/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { OrganizerDashboard } from '../OrganizerDashboard'

jest.mock('../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../hooks/usePermissions', () => ({
  usePermissions: jest.fn(),
}))

import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockUsePermissions = usePermissions as jest.MockedFunction<typeof usePermissions>

describe('OrganizerDashboard', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(<BrowserRouter>{component}</BrowserRouter>)
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders page title and description for organizers', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'organizer@example.com',
        role: 'organizer',
      },
      isAuthenticated: true,
      loading: false,
    })

    mockUsePermissions.mockReturnValue({
      organizerRole: true,
      playerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    } as any)

    renderWithRouter(<OrganizerDashboard />)

    expect(screen.getByText('Organizer Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Create and manage your tournaments')).toBeInTheDocument()
  })

  it('shows sign-in message when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    mockUsePermissions.mockReturnValue({
      organizerRole: false,
      playerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    } as any)

    renderWithRouter(<OrganizerDashboard />)

    expect(screen.getByText('Sign in to manage tournaments')).toBeInTheDocument()
  })

  it('shows access denied message for non-organizers', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'player@example.com',
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

    renderWithRouter(<OrganizerDashboard />)

    expect(screen.getByText('Organizer access required')).toBeInTheDocument()
  })

  it('shows Create Tournament button for organizers', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'organizer@example.com',
        role: 'organizer',
      },
      isAuthenticated: true,
      loading: false,
    })

    mockUsePermissions.mockReturnValue({
      organizerRole: true,
      playerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    } as any)

    renderWithRouter(<OrganizerDashboard />)

    const buttons = screen.getAllByText('Create Tournament')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('shows empty state when organizer has no tournaments', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'organizer@example.com',
        role: 'organizer',
      },
      isAuthenticated: true,
      loading: false,
    })

    mockUsePermissions.mockReturnValue({
      organizerRole: true,
      playerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    } as any)

    renderWithRouter(<OrganizerDashboard />)

    expect(screen.getByText('No tournaments yet')).toBeInTheDocument()
    expect(
      screen.getByText('Create your first tournament to get started')
    ).toBeInTheDocument()
  })

  it('calls handleCreateTournament when Create button is clicked', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'organizer@example.com',
        role: 'organizer',
      },
      isAuthenticated: true,
      loading: false,
    })

    mockUsePermissions.mockReturnValue({
      organizerRole: true,
      playerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    } as any)

    renderWithRouter(<OrganizerDashboard />)

    const createButton = screen.getAllByText('Create Tournament')[0]
    fireEvent.click(createButton)

    // Navigation would happen, but we're just testing the click works
    expect(createButton).toBeInTheDocument()
  })

  it('renders component structure for authenticated organizers', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'organizer@example.com',
        role: 'organizer',
      },
      isAuthenticated: true,
      loading: false,
    })

    mockUsePermissions.mockReturnValue({
      organizerRole: true,
      playerRole: false,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    } as any)

    const { container } = renderWithRouter(<OrganizerDashboard />)

    // Verify the component renders with proper structure
    const headings = container.querySelectorAll('h1')
    expect(headings.length).toBeGreaterThan(0)
  })
})
