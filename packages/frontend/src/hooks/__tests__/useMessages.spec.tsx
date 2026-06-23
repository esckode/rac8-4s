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

    it('does not count broadcast messages (null recipientPlayerId) as unread for a player', async () => {
      const msgs = [
        makeMessage({ id: 'msg_1', read_at: null, recipientPlayerId: null }),
      ]
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: msgs }) })

      const { result } = renderHook(() => useMessages('tourn_1'), { wrapper: Wrapper })

      await waitFor(() => expect(result.current.messages).toHaveLength(1))
      // Broadcast messages addressed to no specific player don't count toward the personal badge
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
  })
})
