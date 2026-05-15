/**
 * useAuth - Authentication hook for accessing current user info
 *
 * Returns authentication state and current user information.
 * This is a placeholder that Phase 2 tests will mock.
 * Full implementation expected from Task #18.
 */

export interface AuthUser {
  id: string
  email: string
  role: 'player' | 'organizer'
}

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
}

export function useAuth(): AuthState {
  // Placeholder implementation - will be properly implemented in Task #18
  return {
    user: null,
    isAuthenticated: false,
    loading: true,
  }
}
