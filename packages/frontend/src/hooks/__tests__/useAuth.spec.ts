import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { AuthProvider, useAuth } from '../useAuth'
import * as swBridge from '../../pwa/sw-bridge'

jest.mock('../../pwa/sw-bridge')

// Set up mock environment
const originalEnv = process.env
const API_BASE = 'http://localhost:3000'

// Mock fetch globally
global.fetch = jest.fn()

const mockWipePlayerData = swBridge.wipePlayerData as jest.MockedFunction<typeof swBridge.wipePlayerData>
const mockNotifyLogin = swBridge.notifyLogin as jest.MockedFunction<typeof swBridge.notifyLogin>

const renderWithAuthProvider = (callback: () => any) => {
  return renderHook(callback, {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, {}, children),
  })
}

describe('useAuth', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.clearAllMocks()
    localStorage.clear()
    process.env.REACT_APP_API_BASE = API_BASE
    ;(global.fetch as jest.Mock).mockClear()
    mockWipePlayerData.mockResolvedValue(undefined)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('initialization and session restoration', () => {
    it('initializes with user and token from localStorage', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'player',
        playerId: null,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      })

      localStorage.setItem('auth_token', 'some-token')
      const { result } = renderWithAuthProvider(() => useAuth())

      // Initially in loading state
      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toEqual(mockUser)
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('sets loading to false when no token in localStorage', async () => {
      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('restores session from token in localStorage on mount', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'player',
        playerId: null,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      })

      localStorage.setItem('auth_token', 'valid-token')

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'player',
        playerId: null,
      })
      expect(result.current.isAuthenticated).toBe(true)

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer valid-token',
          }),
        })
      )
    })

    it('clears invalid token on 401 response', async () => {
      // /me rejects it, and the /player/session fallback also rejects it
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: false, status: 401 })

      localStorage.setItem('auth_token', 'invalid-token')

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('clears token on network error during session restoration', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      )

      localStorage.setItem('auth_token', 'some-token')

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('restores a magic-link player session when /me does not recognize the token', async () => {
      // First call: /api/auth/me rejects the player-session token (not an account JWT)
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 401 })
        // Second call: /player/session validates it and returns the player identity
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ playerId: 'player-789', tournamentId: 'tourn-1' }),
        })

      localStorage.setItem('auth_token', 'player-session-token')

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user).toMatchObject({ id: 'player-789', role: 'player' })
      // A valid player session must be retained, not cleared
      expect(localStorage.getItem('auth_token')).toBe('player-session-token')

      expect(global.fetch).toHaveBeenCalledWith(
        '/player/session',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer player-session-token',
          }),
        })
      )
    })

    it('clears the token only when neither /me nor /player/session validate it', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: false, status: 401 })

      localStorage.setItem('auth_token', 'bogus-token')

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorage.getItem('auth_token')).toBeNull()
    })
  })

  describe('login', () => {
    it('successfully logs in user and stores token', async () => {
      const mockResponse = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'player',
        },
        token: 'new-token-xyz',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.login('test@example.com', 'password123')
      })

      expect(result.current.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'player',
      })
      expect(result.current.isAuthenticated).toBe(true)
      expect(localStorage.getItem('auth_token')).toBe('new-token-xyz')

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        })
      )
    })

    it('handles login error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid email or password' }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'wrongpassword')
        })
      ).rejects.toThrow('Invalid email or password')

      expect(result.current.user).toBeNull()
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('handles login network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      )

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'password')
        })
      ).rejects.toThrow('Network error')

      expect(result.current.user).toBeNull()
    })

    it('wipes offline venue data when a different player logs in on this device (D5 account-switch)', async () => {
      localStorage.setItem('last_player_id', 'player-A')
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', email: 'b@example.com', role: 'player', playerId: 'player-B' },
          token: 'tok',
        }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.login('b@example.com', 'password123')
      })

      expect(mockWipePlayerData).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('last_player_id')).toBe('player-B')
    })

    it('does not wipe when the same player logs in again', async () => {
      localStorage.setItem('last_player_id', 'player-A')
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', email: 'a@example.com', role: 'player', playerId: 'player-A' },
          token: 'tok',
        }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.login('a@example.com', 'password123')
      })

      expect(mockWipePlayerData).not.toHaveBeenCalled()
    })

    it('does not wipe on the very first login on this device (no prior last_player_id)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', email: 'a@example.com', role: 'player', playerId: 'player-A' },
          token: 'tok',
        }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.login('a@example.com', 'password123')
      })

      expect(mockWipePlayerData).not.toHaveBeenCalled()
      expect(localStorage.getItem('last_player_id')).toBe('player-A')
    })

    it('falls back to the account id when the user has no playerId (organizer-only)', async () => {
      localStorage.setItem('last_player_id', 'user-999')
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', email: 'org@example.com', role: 'organizer' },
          token: 'tok',
        }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.login('org@example.com', 'password123')
      })

      expect(mockWipePlayerData).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('last_player_id')).toBe('user-123')
    })

    it('notifies the replay bridge (notifyLogin) after a successful login', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', email: 'a@example.com', role: 'player', playerId: 'player-A' },
          token: 'tok',
        }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.login('a@example.com', 'password123')
      })

      expect(mockNotifyLogin).toHaveBeenCalledTimes(1)
    })
  })

  describe('signup', () => {
    it('successfully signs up user and stores token', async () => {
      const mockResponse = {
        user: {
          id: 'new-user-456',
          email: 'newuser@example.com',
          name: 'New User',
          role: 'player',
        },
        token: 'signup-token-abc',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.signup(
          'newuser@example.com',
          'New User',
          'password123'
        )
      })

      expect(result.current.user).toEqual({
        id: 'new-user-456',
        email: 'newuser@example.com',
        name: 'New User',
        role: 'player',
      })
      expect(result.current.isAuthenticated).toBe(true)
      expect(localStorage.getItem('auth_token')).toBe('signup-token-abc')
    })

    it('signup with magic link token', async () => {
      const mockResponse = {
        user: {
          id: 'new-user-789',
          email: 'invited@example.com',
          role: 'organizer',
        },
        token: 'invited-token-def',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.signup(
          'invited@example.com',
          'Invited User',
          'password456',
          'magic-link-token'
        )
      })

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/signup',
        expect.objectContaining({
          body: JSON.stringify({
            email: 'invited@example.com',
            name: 'Invited User',
            password: 'password456',
            token: 'magic-link-token',
          }),
        })
      )
    })

    it('handles signup error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ message: 'Email already in use' }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.signup(
            'existing@example.com',
            'User',
            'password'
          )
        })
      ).rejects.toThrow('Email already in use')

      expect(result.current.user).toBeNull()
    })
  })

  describe('logout', () => {
    it('successfully logs out user and clears token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'player',
        playerId: null,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      })

      localStorage.setItem('auth_token', 'user-token')

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
        expect(result.current.user).toBeDefined()
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      })

      await act(async () => {
        await result.current.logout()
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorage.getItem('auth_token')).toBeNull()

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer user-token',
          }),
        })
      )
    })

    it('clears token even if logout endpoint fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'user-123',
          email: 'test@example.com',
          role: 'player',
        }),
      })

      localStorage.setItem('auth_token', 'user-token')

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.user).toBeDefined()
      })

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await act(async () => {
        await result.current.logout()
      })

      expect(result.current.user).toBeNull()
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('clears token even if logout endpoint throws', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'user-123',
          email: 'test@example.com',
          role: 'player',
        }),
      })

      localStorage.setItem('auth_token', 'user-token')

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.user).toBeDefined()
      })

      ;(global.fetch as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Network error')
      })

      // logout always succeeds even if endpoint throws
      // (token is cleared in finally block)
      await act(async () => {
        try {
          await result.current.logout()
        } catch (err) {
          // Expected - but token should still be cleared
        }
      })

      expect(result.current.user).toBeNull()
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('handles logout without token', async () => {
      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Should not throw even without a token
      await act(async () => {
        await result.current.logout()
      })

      expect(result.current.user).toBeNull()
      expect(localStorage.getItem('auth_token')).toBeNull()
    })
  })

  describe('forgotPassword', () => {
    it('successfully requests password reset', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'If an account exists for this email, a reset code has been sent',
        }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.forgotPassword('test@example.com')
      })

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/forgot-password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com' }),
        })
      )
    })

    it('handles forgot password error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid email' }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.forgotPassword('invalid-email')
        })
      ).rejects.toThrow('Invalid email')
    })
  })

  describe('resetPassword', () => {
    it('successfully resets password', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Password reset successfully' }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.resetPassword(
          'test@example.com',
          '123456',
          'newpassword'
        )
      })

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/reset-password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'test@example.com',
            code: '123456',
            password: 'newpassword',
          }),
        })
      )
    })

    it('handles reset password error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid reset code' }),
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.resetPassword(
            'test@example.com',
            'invalid-code',
            'newpassword'
          )
        })
      ).rejects.toThrow('Invalid reset code')
    })
  })

  describe('token persistence across page reloads', () => {
    it('persists token in localStorage and restores on new instance', async () => {
      // First instance: login
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'player',
        playerId: null,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: mockUser,
          token: 'persistent-token',
        }),
      })

      const { result: result1 } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result1.current.loading).toBe(false)
      })

      await act(async () => {
        await result1.current.login('test@example.com', 'password123')
      })

      const storedToken = localStorage.getItem('auth_token')
      expect(storedToken).toBe('persistent-token')

      // Simulate page reload by creating new hook instance
      jest.clearAllMocks()
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      })

      const { result: result2 } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result2.current.loading).toBe(false)
      })

      expect(result2.current.user).toEqual(mockUser)
      expect(result2.current.isAuthenticated).toBe(true)

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer persistent-token',
          }),
        })
      )
    })
  })

  describe('error handling', () => {
    it('handles fetch response without json when error occurs', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: jest.fn().mockRejectedValueOnce(new Error('Not JSON')),
      })

      const { result } = renderWithAuthProvider(() => useAuth())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'password')
        })
      ).rejects.toThrow('Login failed')
    })
  })
})
