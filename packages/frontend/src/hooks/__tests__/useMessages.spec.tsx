/**
 * useMessages hook tests
 *
 * Validates that the hook:
 * - Fetches message history ONCE on mount (not on every render)
 * - Exposes messages, unreadCount, send, and markRead
 * - Applies incoming SSE message.created deltas into the store without re-fetching
 * - markRead calls POST /:id/messages/:msgId/read and decrements unreadCount
 * - send calls POST /:id/messages and appends the returned message
 * - Does not fetch when tournamentId is empty
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { useMessages } from '../useMessages'
import { messageStore } from '../../state'

// ── Fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = jest.fn()
global.fetch = mockFetch

// ── Auth mock ─────────────────────────────────────────────────────────────────
jest.mock('../useAuth', () => {
  return {
    useAuth: () => ({
      user: { id: 'player_1', role: 'player', playerId: 'player_1', email: 'p@e.com' },
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
    }),
    // AuthProvider becomes a passthrough in tests
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  }
})

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
)

const makeMessage = (overrides: Partial<{
  id: string
  body: string
  senderPlayerId: string
  recipientPlayerId: string | null
  read_at: string | null
}> = {}) => ({
  id: 'msg_1',
  tournamentId: 'tourn_1',
  senderPlayerId: 'player_2',
  recipientPlayerId: 'player_1',
  matchId: null,
  body: 'Hello',
  createdAt: new Date().toISOString(),
  legalHold: false,
  read_at: null,
  ...overrides,
})

describe('useMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    messageStore.clear()
    localStorage.setItem('auth_token', 'tok_abc')
  })

  afterEach(() => {
    localStorage.removeItem('auth_token')
  })

  describe('Initial fetch', () => {
    it('fetches history once on mount', async () => {
      const msgs = [makeMessage()]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: msgs }),
      })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1)
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tournaments/tourn_1/messages'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('does not fetch when tournamentId is empty', () => {
      renderHook(() => useMessages(''), { wrapper: Wrapper })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('starts with empty messages and zero unread before fetch resolves', () => {
      mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })

      expect(result.current.messages).toHaveLength(0)
      expect(result.current.unreadCount).toBe(0)
    })

    it('does not re-fetch on re-render', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [] }),
      })

      const { rerender } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      rerender()
      rerender()

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Unread count', () => {
    it('counts messages with null read_at addressed to the current player', async () => {
      const msgs = [
        makeMessage({ id: 'msg_1', read_at: null, recipientPlayerId: 'player_1' }),
        makeMessage({ id: 'msg_2', read_at: new Date().toISOString(), recipientPlayerId: 'player_1' }),
        makeMessage({ id: 'msg_3', read_at: null, recipientPlayerId: 'player_1' }),
      ]
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: msgs }) })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })

      await waitFor(() => expect(result.current.unreadCount).toBe(2))
    })

    it('counts unread broadcast messages (null recipientPlayerId) for a player', async () => {
      // Broadcasts have recipientPlayerId: null. The API joins message_recipients so
      // read_at is null (unread) for a participant who hasn't read the announcement.
      const msgs = [
        makeMessage({ id: 'msg_1', read_at: null, recipientPlayerId: null }),
      ]
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: msgs }) })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })

      await waitFor(() => expect(result.current.messages).toHaveLength(1))
      // Broadcast with read_at: null counts toward the personal unread badge
      expect(result.current.unreadCount).toBe(1)
    })

    it('does not count a read broadcast (read_at set) as unread', async () => {
      const msgs = [
        makeMessage({ id: 'msg_1', read_at: new Date().toISOString(), recipientPlayerId: null }),
      ]
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: msgs }) })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })

      await waitFor(() => expect(result.current.messages).toHaveLength(1))
      expect(result.current.unreadCount).toBe(0)
    })
  })

  describe('SSE delta application', () => {
    it('appendMessage adds a new message without re-fetching', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const newMsg = makeMessage({ id: 'msg_sse', body: 'via SSE' })
      act(() => {
        messageStore.append(newMsg)
      })

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1)
        expect(result.current.messages[0].id).toBe('msg_sse')
      })

      // No additional fetch triggered by the SSE delta
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('markRead', () => {
    it('calls POST /:id/messages/:msgId/read and marks the message read in the store', async () => {
      const msg = makeMessage({ id: 'msg_r1', read_at: null, recipientPlayerId: 'player_1' })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [msg] }) }) // history
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // mark read

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.unreadCount).toBe(1))

      await act(async () => {
        await result.current.markRead('msg_r1')
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tournaments/tourn_1/messages/msg_r1/read'),
        expect.objectContaining({ method: 'POST' })
      )
      await waitFor(() => expect(result.current.unreadCount).toBe(0))
    })
  })

  describe('send', () => {
    it('calls POST /:id/messages and appends the returned message', async () => {
      const returned = makeMessage({ id: 'msg_new', body: 'Hey', senderPlayerId: 'player_1' })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) }) // history
        .mockResolvedValueOnce({ ok: true, json: async () => returned }) // send

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      await act(async () => {
        await result.current.send({ body: 'Hey', recipientPlayerId: 'player_2' })
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tournaments/tourn_1/messages'),
        expect.objectContaining({ method: 'POST' })
      )

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1)
        expect(result.current.messages[0].id).toBe('msg_new')
      })
    })

    it('throws an error when send returns a non-ok response with a message', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Body too long' }),
        })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      await expect(
        act(async () => {
          await result.current.send({ body: 'x'.repeat(5000) })
        })
      ).rejects.toThrow('Body too long')
    })

    it('throws a generic error when send fails and json parse also fails', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => { throw new Error('parse error') },
        })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      await expect(
        act(async () => {
          await result.current.send({ body: 'test' })
        })
      ).rejects.toThrow('Send failed')
    })
  })

  describe('fetch error handling', () => {
    it('silently ignores network errors during history fetch', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })

      // Should not throw; messages remain empty
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
      expect(result.current.messages).toHaveLength(0)
    })

    it('silently ignores non-ok response during history fetch', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
      expect(result.current.messages).toHaveLength(0)
    })

    it('fetches without Authorization header when no auth_token in localStorage', async () => {
      // Remove token
      localStorage.removeItem('auth_token')
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })

      renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const [, opts] = mockFetch.mock.calls[0]
      expect(opts.headers.Authorization).toBeUndefined()
    })
  })

  describe('send without auth token', () => {
    it('sends without Authorization header when no token is stored', async () => {
      localStorage.removeItem('auth_token')
      const returned = makeMessage({ id: 'msg_no_token', senderPlayerId: 'player_1' })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => returned })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      await act(async () => {
        await result.current.send({ body: 'No token send' })
      })

      const [, opts] = mockFetch.mock.calls[1]
      expect(opts.headers.Authorization).toBeUndefined()
    })

    it('throws with generic message when err.message is undefined', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          // json returns object without message field
          json: async () => ({}),
        })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      await expect(
        act(async () => {
          await result.current.send({ body: 'test' })
        })
      ).rejects.toThrow('Send failed')
    })
  })

  describe('markRead without auth token', () => {
    it('calls markRead without Authorization header when no token', async () => {
      localStorage.removeItem('auth_token')
      const msg = makeMessage({ id: 'msg_r1', read_at: null, recipientPlayerId: 'player_1' })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [msg] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.messages).toHaveLength(1))

      await act(async () => {
        await result.current.markRead('msg_r1')
      })

      const [, opts] = mockFetch.mock.calls[1]
      expect(opts.headers.Authorization).toBeUndefined()
    })

    it('returns without marking read when markRead response is not ok', async () => {
      const msg = makeMessage({ id: 'msg_r2', read_at: null, recipientPlayerId: 'player_1' })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [msg] }) })
        .mockResolvedValueOnce({ ok: false, json: async () => ({}) })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })
      await waitFor(() => expect(result.current.unreadCount).toBe(1))

      await act(async () => {
        await result.current.markRead('msg_r2')
      })

      // unreadCount should still be 1 since the API returned non-ok
      expect(result.current.unreadCount).toBe(1)
    })
  })
})
