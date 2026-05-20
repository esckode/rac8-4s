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

  it('renders hero heading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('See you at the court.')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText(/Find drop-in nights/)).toBeInTheDocument()
  })

  it('renders Browse tournaments button', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('Browse tournaments')).toBeInTheDocument()
  })

  it('renders sign up prompt', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText(/An account creates itself when you join your first night/)).toBeInTheDocument()
  })

  it('renders continue with email button when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('Continue with email')).toBeInTheDocument()
  })

  it('renders continue with email button regardless of auth state', () => {
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

    expect(screen.getByText('Continue with email')).toBeInTheDocument()
  })

  it('renders the same content when authenticated', () => {
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

    expect(screen.getByText('See you at the court.')).toBeInTheDocument()
  })

  it('renders navigation buttons for both authenticated and unauthenticated users', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    renderWithRouter(<Landing />)

    expect(screen.getByText('Continue with email')).toBeInTheDocument()
    expect(screen.getByText('Browse tournaments')).toBeInTheDocument()
  })
})
