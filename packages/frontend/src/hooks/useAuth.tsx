import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

const API_BASE_URL = ''  // Use relative paths with Vite proxy (/api)
const TOKEN_KEY = 'auth_token'

export interface AuthUser {
  id: string
  email: string
  name?: string
  role: 'player' | 'organizer'
}

export interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, name: string, password: string, token?: string) => Promise<void>
  forgotPassword: (email: string) => Promise<void>
  resetPassword: (email: string, code: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
}

interface LoginResponse {
  user: AuthUser
  token: string
}

interface SignupResponse {
  user: AuthUser
  token: string
}

interface MeResponse {
  id: string
  email: string
  role: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const restoreSession = useCallback(async (token: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const userData = (await response.json()) as MeResponse
        setUser({
          id: userData.id,
          email: userData.email,
          role: userData.role as 'player' | 'organizer',
        })
      } else if (response.status === 401) {
        // Invalid token, clear it
        localStorage.removeItem(TOKEN_KEY)
        setUser(null)
      } else {
        throw new Error(`Unexpected response status: ${response.status}`)
      }
    } catch (error) {
      // Network error or other issue, clear token to be safe
      localStorage.removeItem(TOKEN_KEY)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      restoreSession(token)
    } else {
      setLoading(false)
    }
  }, [restoreSession])

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Login failed' }))
        const errorMessage = errorData.message || `Login failed with status ${response.status}`
        // Use standard error message for authentication failures
        if (response.status === 401) {
          throw new Error('Invalid email or password')
        }
        throw new Error(errorMessage)
      }

      const data = (await response.json()) as LoginResponse
      localStorage.setItem(TOKEN_KEY, data.token)
      setUser(data.user)
      setLoading(false)
    } catch (error) {
      setLoading(false)
      throw error
    }
  }, [])

  const signup = useCallback(
    async (email: string, name: string, password: string, token?: string): Promise<void> => {
      setLoading(true)
      try {
        const body: Record<string, string> = { email, name, password }
        if (token !== undefined) {
          body.token = token
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Signup failed' }))
          throw new Error(errorData.message || `Signup failed with status ${response.status}`)
        }

        const data = (await response.json()) as SignupResponse
        localStorage.setItem(TOKEN_KEY, data.token)
        setUser(data.user)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const forgotPassword = useCallback(async (email: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Request failed' }))
        throw new Error(errorData.message || `Request failed with status ${response.status}`)
      }
    } catch (error) {
      throw error
    }
  }, [])

  const resetPassword = useCallback(
    async (email: string, code: string, password: string): Promise<void> => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, code, password }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Reset failed' }))
          throw new Error(errorData.message || `Reset failed with status ${response.status}`)
        }
      } catch (error) {
        throw error
      }
    },
    []
  )

  const logout = useCallback(async (): Promise<void> => {
    const token = localStorage.getItem(TOKEN_KEY)
    try {
      if (token) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      }
    } finally {
      localStorage.removeItem(TOKEN_KEY)
      setUser(null)
    }
  }, [])

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    signup,
    forgotPassword,
    resetPassword,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// For backward compatibility with existing tests that use AuthState
export function useAuthState(): AuthState {
  const auth = useAuth()
  return {
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
  }
}
