import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { wipePlayerData, notifyLogin } from '../pwa/sw-bridge'
import { VENUE_TTL_MS } from '../workers/sw-lib/venue-cache'

const API_BASE_URL = ''  // Use relative paths with Vite proxy (/api)
const TOKEN_KEY = 'auth_token'
const LAST_PLAYER_KEY = 'last_player_id'
const SESSION_SNAPSHOT_KEY = 'auth_session_snapshot'

export interface AuthUser {
  id: string
  email: string
  name?: string
  role: 'player' | 'organizer' | 'admin'
  // Linked durable player identity, if any. Presence = participation capability
  // (an organizer with a playerId can also play). null/undefined = organize-only.
  playerId?: string | null
}

export interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  loading: boolean
  // D11: true when `user` was restored from a local session snapshot after a
  // network failure, not a real server validation — cleared on reconnect.
  offlineUnvalidated: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, name: string, password: string, token?: string, dobAttestation?: { dateOfBirth: string; policyVersion: string }) => Promise<void>
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
  playerId?: string | null
}

interface AuthSessionSnapshot {
  user: AuthUser
  validatedAt: string
}

// D11 — offline session survival. Written on every successful validation
// (restore/login/signup); read only when restore hits a network failure or
// an unexpected 5xx; trusted for VENUE_TTL_MS (48h, reused from D6 — offline
// identity never outlives the offline data it unlocks). Magic-link tokens
// are opaque, so this snapshot — not client-side token decoding — is how
// identity survives being offline.
function writeSessionSnapshot(user: AuthUser): void {
  const snapshot: AuthSessionSnapshot = { user, validatedAt: new Date().toISOString() }
  localStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(snapshot))
}

function readTrustedSessionSnapshot(): AuthSessionSnapshot | null {
  const raw = localStorage.getItem(SESSION_SNAPSHOT_KEY)
  if (!raw) return null
  try {
    const snapshot = JSON.parse(raw) as AuthSessionSnapshot
    const age = Date.now() - new Date(snapshot.validatedAt).getTime()
    return age <= VENUE_TTL_MS ? snapshot : null
  } catch {
    return null
  }
}

function clearSessionSnapshot(): void {
  localStorage.removeItem(SESSION_SNAPSHOT_KEY)
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [offlineUnvalidated, setOfflineUnvalidated] = useState(false)
  // A full page load of /signout races the mount-time restoreSession against
  // logout(): once logout has run, a late restore success must not setUser or
  // re-write the snapshot logout just cleared. Reset on login/signup.
  const signedOutRef = useRef(false)

  // D11: a network failure (or unexpected 5xx) during restore is not proof
  // the token is invalid — only a real 401 is. On failure, restore identity
  // from the trusted snapshot if one exists; never delete the token here.
  const handleUnvalidatedFailure = useCallback((): void => {
    if (signedOutRef.current) return
    const snapshot = readTrustedSessionSnapshot()
    if (snapshot) {
      setUser(snapshot.user)
      setOfflineUnvalidated(true)
    } else {
      setUser(null)
      setOfflineUnvalidated(false)
    }
  }, [])

  // Try a magic-link player session when the token is not an account JWT.
  // Returns true if the token is a valid player session (user is set).
  const restorePlayerSession = useCallback(async (token: string): Promise<boolean> => {
    const response = await fetch(`${API_BASE_URL}/player/session`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      return false
    }

    const data = (await response.json()) as { playerId: string; tournamentId: string }
    if (signedOutRef.current) return true
    const restoredUser: AuthUser = { id: data.playerId, email: '', role: 'player', playerId: data.playerId }
    setUser(restoredUser)
    setOfflineUnvalidated(false)
    writeSessionSnapshot(restoredUser)
    return true
  }, [])

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
        if (signedOutRef.current) return
        const restoredUser: AuthUser = {
          id: userData.id,
          email: userData.email,
          role: userData.role as AuthUser['role'],
          playerId: userData.playerId ?? null,
        }
        setUser(restoredUser)
        setOfflineUnvalidated(false)
        writeSessionSnapshot(restoredUser)
        return
      }

      if (response.status === 401) {
        // Not an account JWT — fall back to a magic-link player session
        const playerRestored = await restorePlayerSession(token)
        if (!playerRestored) {
          localStorage.removeItem(TOKEN_KEY)
          clearSessionSnapshot()
          setUser(null)
          setOfflineUnvalidated(false)
        }
        return
      }

      // Unexpected non-401 status (e.g. 5xx): D11 treats this like a network
      // failure, not a rejection — the server didn't actually reject the token.
      handleUnvalidatedFailure()
    } catch (error) {
      // Network error (offline/unreachable) — D11: never delete the token.
      handleUnvalidatedFailure()
    } finally {
      setLoading(false)
    }
  }, [restorePlayerSession, handleUnvalidatedFailure])

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      restoreSession(token)
    } else {
      setLoading(false)
    }
  }, [restoreSession])

  // D11: revalidate once connectivity returns while running on an
  // offline-unvalidated snapshot. A genuine 401 here means the token really
  // was invalid — clear it (+ snapshot) and extend the D5 wipe to this path.
  useEffect(() => {
    if (!offlineUnvalidated) return undefined

    const handleOnline = async (): Promise<void> => {
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) return
      await restoreSession(token)
      if (!localStorage.getItem(TOKEN_KEY)) {
        await wipePlayerData()
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [offlineUnvalidated, restoreSession])

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Login failed' }))
      // Use standard error message for authentication failures
      if (response.status === 401) {
        throw new Error('Invalid email or password')
      }
      const errorMessage = errorData.message || `Login failed with status ${response.status}`
      throw new Error(errorMessage)
    }

    const data = (await response.json()) as LoginResponse
    localStorage.setItem(TOKEN_KEY, data.token)

    // D5 — a different player/account signing in on this device wipes the
    // prior player's offline venue cache + sync queue. Nothing to wipe on
    // this device's very first login (no prior id stored).
    const newPlayerKey = data.user.playerId ?? data.user.id
    const lastPlayerKey = localStorage.getItem(LAST_PLAYER_KEY)
    if (lastPlayerKey && lastPlayerKey !== newPlayerKey) {
      await wipePlayerData()
    }
    localStorage.setItem(LAST_PLAYER_KEY, newPlayerKey)

    signedOutRef.current = false
    setUser(data.user)
    setOfflineUnvalidated(false)
    writeSessionSnapshot(data.user)
    notifyLogin()
  }, [])

  const signup = useCallback(
    async (email: string, name: string, password: string, token?: string, dobAttestation?: { dateOfBirth: string; policyVersion: string }): Promise<void> => {
      setLoading(true)
      try {
        const body: Record<string, unknown> = { email, name, password }
        if (token !== undefined) body.token = token
        if (dobAttestation) body.dobAttestation = dobAttestation

        const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Signup failed' }))
          const err = new Error(errorData.message || `Signup failed with status ${response.status}`) as Error & { code?: string }
          err.code = errorData.code
          throw err
        }

        const data = (await response.json()) as SignupResponse
        localStorage.setItem(TOKEN_KEY, data.token)
        signedOutRef.current = false
        setUser(data.user)
        setOfflineUnvalidated(false)
        writeSessionSnapshot(data.user)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const forgotPassword = useCallback(async (email: string): Promise<void> => {
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
  }, [])

  const resetPassword = useCallback(
    async (email: string, code: string, password: string): Promise<void> => {
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
    },
    []
  )

  const logout = useCallback(async (): Promise<void> => {
    signedOutRef.current = true
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
      clearSessionSnapshot()
      setUser(null)
      setOfflineUnvalidated(false)
    }
  }, [])

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    loading,
    offlineUnvalidated,
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
