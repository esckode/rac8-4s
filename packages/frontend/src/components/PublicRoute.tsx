/**
 * PublicRoute - Route wrapper that prevents authenticated users from accessing auth pages
 *
 * Redirects authenticated users to /browse (dashboard).
 * Shows loading spinner while auth state is being determined.
 * Allows anonymous users to access auth pages.
 * Prevents flash of auth pages when user is already logged in.
 */

import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LoadingSpinner } from './shared'

export interface PublicRouteProps {
  children: React.ReactNode
}

export const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <LoadingSpinner size="lg" label="Loading..." />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/browse" replace />
  }

  return <>{children}</>
}
