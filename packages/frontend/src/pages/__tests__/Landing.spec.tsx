/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Landing } from '../Landing'

jest.mock('../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

import { useAuth } from '../../hooks/useAuth'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('Landing', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(<BrowserRouter>{component}</BrowserRouter>)
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders app title', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    const titles = screen.getAllByText(/Doubles Pickleball Cup/)
    expect(titles.length).toBeGreaterThan(0)
  })

  it('renders hero heading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('Tournament Management Made Simple')).toBeInTheDocument()
  })

  it('renders Browse Tournaments button', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('Browse Tournaments')).toBeInTheDocument()
  })

  it('renders feature highlights', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('Live Standings')).toBeInTheDocument()
    expect(screen.getByText('Bracket View')).toBeInTheDocument()
    expect(screen.getByText('Match Info')).toBeInTheDocument()
  })

  it('renders login button when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('Login')).toBeInTheDocument()
  })

  it('renders user email and logout button when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'test@example.com',
        role: 'player',
      },
      isAuthenticated: true,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(screen.getByText('Logout')).toBeInTheDocument()
  })

  it('renders My Tournaments button when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'test@example.com',
        role: 'organizer',
      },
      isAuthenticated: true,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('My Tournaments')).toBeInTheDocument()
  })

  it('does not render My Tournaments button when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.queryByText('My Tournaments')).not.toBeInTheDocument()
  })

  it('renders footer', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText(/2026 Doubles Pickleball Cup/)).toBeInTheDocument()
  })
})
