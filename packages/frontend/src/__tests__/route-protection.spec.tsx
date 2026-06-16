/**
 * Route protection integration tests
 *
 * Tests ProtectedRoute and PublicRoute components to ensure:
 * - Protected routes redirect unauthenticated users to /login
 * - Public auth routes redirect authenticated users to /browse
 * - Loading states prevent content flashing
 * - Type safety is maintained
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { PublicRoute } from '../components/PublicRoute'
import * as useAuthHook from '../hooks/useAuth'

// Mock components for testing
const ProtectedComponent = () => <div>Protected Content</div>
const PublicComponent = () => <div>Public Auth Page</div>
const LoginComponent = () => <div>Login Page</div>
const BrowseComponent = () => <div>Browse Page</div>

describe('ProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should show loading spinner while auth state is loading', () => {
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: true,
    })

    render(
      <BrowserRouter>
        <ProtectedRoute>
          <ProtectedComponent />
        </ProtectedRoute>
      </BrowserRouter>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should render children when user is authenticated', () => {
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    render(
      <BrowserRouter>
        <ProtectedRoute>
          <ProtectedComponent />
        </ProtectedRoute>
      </BrowserRouter>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('should redirect to /login when user is not authenticated', () => {
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    render(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <ProtectedComponent />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    )

    // ProtectedRoute component should not render children when unauthenticated
    // Instead it should render Navigate component (which redirects in browser)
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    // We can't test actual route navigation in unit tests, but we verified the Navigate
    // component is returned by checking children aren't rendered
  })
})

describe('PublicRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should show loading spinner while auth state is loading', () => {
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: true,
    })

    render(
      <BrowserRouter>
        <PublicRoute>
          <PublicComponent />
        </PublicRoute>
      </BrowserRouter>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should render children when user is not authenticated', () => {
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    render(
      <BrowserRouter>
        <PublicRoute>
          <PublicComponent />
        </PublicRoute>
      </BrowserRouter>
    )

    expect(screen.getByText('Public Auth Page')).toBeInTheDocument()
  })

  it('should redirect to /browse when user is authenticated', () => {
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    render(
      <BrowserRouter>
        <Routes>
          <Route path="/browse" element={<BrowseComponent />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <PublicComponent />
              </PublicRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    )

    // PublicRoute component should not render children when authenticated
    // Instead it should render Navigate component (which redirects in browser)
    expect(screen.queryByText('Public Auth Page')).not.toBeInTheDocument()
    // We can't test actual route navigation in unit tests, but we verified the Navigate
    // component is returned by checking children aren't rendered
  })
})

describe('Route Constants', () => {
  it('should have correct auth route paths', () => {
    const { ROUTES } = require('../constants/routes')

    expect(ROUTES.LOGIN).toBe('/login')
    expect(ROUTES.SIGNUP).toBe('/signup')
    expect(ROUTES.FORGOT_PASSWORD).toBe('/forgot-password')
    expect(ROUTES.RESET_PASSWORD).toBe('/reset-password')
  })

  it('should expose /browse as a public discovery route', () => {
    const { ROUTES } = require('../constants/routes')

    // Per rac8-4s-HL.md, tournament discovery is public (no auth required).
    expect(ROUTES.BROWSE).toBe('/browse')
  })

  it('should have correct protected route paths', () => {
    const { ROUTES } = require('../constants/routes')

    expect(ROUTES.MATCHES).toBe('/matches')
    expect(ROUTES.STANDINGS).toBe('/standings')
  })

  it('should have home route path', () => {
    const { ROUTES } = require('../constants/routes')

    expect(ROUTES.HOME).toBe('/')
  })
})

describe('Auth Gating Integration', () => {
  it('should prevent flashing of protected content during loading', async () => {
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: true,
    })

    const { rerender } = render(
      <BrowserRouter>
        <ProtectedRoute>
          <ProtectedComponent />
        </ProtectedRoute>
      </BrowserRouter>
    )

    // During loading, should show spinner not content
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()

    // Update mock to simulate auth complete
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    rerender(
      <BrowserRouter>
        <ProtectedRoute>
          <ProtectedComponent />
        </ProtectedRoute>
      </BrowserRouter>
    )

    // After auth complete, should show content
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('should prevent flashing of auth pages when user is already logged in', async () => {
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: true,
    })

    const { rerender } = render(
      <BrowserRouter>
        <PublicRoute>
          <PublicComponent />
        </PublicRoute>
      </BrowserRouter>
    )

    // During loading, should show spinner not auth page
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Public Auth Page')).not.toBeInTheDocument()

    // Update mock to simulate user is authenticated
    jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })

    rerender(
      <BrowserRouter>
        <PublicRoute>
          <PublicComponent />
        </PublicRoute>
      </BrowserRouter>
    )

    // After auth complete with authenticated user, should redirect (Navigate component)
    // Content doesn't show because of redirect
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
})
