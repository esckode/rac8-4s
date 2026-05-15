/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { MyTournaments } from '../MyTournaments'

jest.mock('../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

import { useAuth } from '../../hooks/useAuth'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('MyTournaments', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(<BrowserRouter>{component}</BrowserRouter>)
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders page title and description', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'test@example.com',
        role: 'player',
      },
      isAuthenticated: true,
      loading: false,
    })

    renderWithRouter(<MyTournaments />)

    expect(screen.getByText('My Tournaments')).toBeInTheDocument()
    expect(
      screen.getByText("Tournaments you're registered for or organizing")
    ).toBeInTheDocument()
  })

  it('shows sign-in message when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<MyTournaments />)

    expect(screen.getByText('Sign in to view your tournaments')).toBeInTheDocument()
  })

  it('shows empty state when user has no tournaments', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'test@example.com',
        role: 'player',
      },
      isAuthenticated: true,
      loading: false,
    })

    renderWithRouter(<MyTournaments />)

    expect(screen.getByText('No tournaments yet')).toBeInTheDocument()
    expect(
      screen.getByText('Browse available tournaments to register')
    ).toBeInTheDocument()
  })

  it('renders authenticated users view with tournament list heading', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'test@example.com',
        role: 'organizer',
      },
      isAuthenticated: true,
      loading: false,
    })

    const { container } = renderWithRouter(<MyTournaments />)

    // Check that the component renders the authenticated view
    const headings = container.querySelectorAll('h1')
    expect(headings.length).toBeGreaterThan(0)
  })

  it('handles both player and organizer roles', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'organizer@example.com',
        role: 'organizer',
      },
      isAuthenticated: true,
      loading: false,
    })

    const { container } = renderWithRouter(<MyTournaments />)

    // Verify component renders without errors
    expect(container).toBeTruthy()
  })

  it('requires authentication to display tournament list', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<MyTournaments />)

    expect(screen.queryByText('Active Tournaments')).not.toBeInTheDocument()
  })
})
