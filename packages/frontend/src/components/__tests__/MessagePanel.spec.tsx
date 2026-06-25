/**
 * MessagePanel — messaging UI for in-tournament coordination.
 *
 * Tests cover:
 * - Renders message list and send form
 * - Shows "No messages yet" when empty
 * - Renders messages with unread styling
 * - Shows broadcast badge for announcements (recipientPlayerId === null)
 * - handleSend submits via fetch and clears the input
 * - handleSend shows error on failure
 * - handleAnnounce available only to organizers
 * - UnreadBadge renders count or nothing
 * - active prop triggers markRead for unread messages
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MessagePanel, UnreadBadge } from '../MessagePanel'
import { messageStore } from '../../state'

// ── Fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = jest.fn()
global.fetch = mockFetch

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn()

// ── Hook mocks ────────────────────────────────────────────────────────────────
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'player_1', role: 'player', playerId: 'player_1', email: 'p@e.com' },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../hooks/usePermissions', () => ({
  usePermissions: jest.fn(() => ({
    playerRole: true,
    organizerRole: false,
    canEditScores: false,
    canPublishBracket: false,
    canManageGroups: false,
    canViewAllStandings: false,
    canOrganize: false,
    canParticipate: true,
  })),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const usePermissionsMock = require('../../hooks/usePermissions').usePermissions as jest.Mock

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
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

describe('MessagePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    messageStore.clear()
    localStorage.setItem('auth_token', 'tok_abc')
    // Default: history fetch returns empty
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    })
  })

  afterEach(() => {
    localStorage.removeItem('auth_token')
  })

  describe('Initial render', () => {
    it('renders the message panel container', async () => {
      render(<MessagePanel tournamentId="tourn_1" />)
      expect(screen.getByTestId('message-panel')).toBeInTheDocument()
    })

    it('shows "No messages yet" when there are no messages', async () => {
      render(<MessagePanel tournamentId="tourn_1" />)
      await waitFor(() => {
        expect(screen.getByText('No messages yet')).toBeInTheDocument()
      })
    })

    it('renders messages from the store', async () => {
      const msg = makeMessage({ body: 'Test message content' })
      messageStore.setHistory([msg as any])

      render(<MessagePanel tournamentId="tourn_1" />)

      expect(screen.getByText('Test message content')).toBeInTheDocument()
    })

    it('renders message items with correct data-testid', async () => {
      const msgs = [
        makeMessage({ id: 'msg_a', body: 'First' }),
        makeMessage({ id: 'msg_b', body: 'Second' }),
      ]
      messageStore.setHistory(msgs as any)

      render(<MessagePanel tournamentId="tourn_1" />)

      const items = screen.getAllByTestId('message-item')
      expect(items).toHaveLength(2)
    })

    it('shows announcement badge for broadcast messages (recipientPlayerId === null)', async () => {
      const broadcast = makeMessage({ id: 'ann_1', body: 'Broadcast', recipientPlayerId: null })
      messageStore.setHistory([broadcast as any])

      render(<MessagePanel tournamentId="tourn_1" />)

      expect(screen.getByText(/Announcement/)).toBeInTheDocument()
    })
  })

  describe('Send DM', () => {
    it('renders the message input and send button', () => {
      render(<MessagePanel tournamentId="tourn_1" />)
      expect(screen.getByTestId('message-input')).toBeInTheDocument()
      expect(screen.getByTestId('message-send-button')).toBeInTheDocument()
    })

    it('submits a message via fetch and clears the input', async () => {
      const returned = makeMessage({ id: 'msg_new', body: 'Hi there', senderPlayerId: 'player_1' })
      // First call: history fetch; second: send
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => returned })

      render(<MessagePanel tournamentId="tourn_1" />)
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const input = screen.getByTestId('message-input') as HTMLInputElement
      const button = screen.getByTestId('message-send-button')

      fireEvent.change(input, { target: { value: 'Hi there' } })
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/tournaments/tourn_1/messages'),
          expect.objectContaining({ method: 'POST' })
        )
      })

      // Input should be cleared after send
      await waitFor(() => {
        expect(input.value).toBe('')
      })
    })

    it('shows an error message when send fails with a non-ok response', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Body too long' }),
        })

      render(<MessagePanel tournamentId="tourn_1" />)
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const input = screen.getByTestId('message-input')
      fireEvent.change(input, { target: { value: 'a'.repeat(10) } })
      fireEvent.click(screen.getByTestId('message-send-button'))

      await waitFor(() => {
        expect(screen.getByText('Body too long')).toBeInTheDocument()
      })
    })

    it('shows generic error when send fails with a non-Error thrown value', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          // json() also fails — triggers the catch(() => ({ message: 'Send failed' })) path
          json: async () => { throw new Error('parse fail') },
        })

      render(<MessagePanel tournamentId="tourn_1" />)
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const input = screen.getByTestId('message-input')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByTestId('message-send-button'))

      await waitFor(() => {
        expect(screen.getByText('Send failed')).toBeInTheDocument()
      })
    })

    it('does not submit when body is empty', async () => {
      render(<MessagePanel tournamentId="tourn_1" />)
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      fireEvent.click(screen.getByTestId('message-send-button'))

      // Still only 1 call (the history fetch)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Organizer broadcast', () => {
    beforeEach(() => {
      usePermissionsMock.mockReturnValue({
        playerRole: false,
        organizerRole: true,
        canEditScores: true,
        canPublishBracket: true,
        canManageGroups: true,
        canViewAllStandings: true,
        canOrganize: true,
        canParticipate: false,
      })
    })

    it('shows announce input and button for organizer', () => {
      render(<MessagePanel tournamentId="tourn_1" />)
      expect(screen.getByTestId('announce-input')).toBeInTheDocument()
      expect(screen.getByTestId('announce-button')).toBeInTheDocument()
    })

    it('submits announcement via fetch to /announcements endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            message: makeMessage({ id: 'ann_1', recipientPlayerId: null }),
            recipientCount: 3,
          }),
        })

      render(<MessagePanel tournamentId="tourn_1" />)
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const announceInput = screen.getByTestId('announce-input') as HTMLInputElement
      fireEvent.change(announceInput, { target: { value: 'Round 2 starts now!' } })
      fireEvent.click(screen.getByTestId('announce-button'))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/announcements'),
          expect.objectContaining({ method: 'POST' })
        )
      })

      await waitFor(() => {
        expect(announceInput.value).toBe('')
      })
    })

    it('shows error when announcement fetch fails', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Forbidden' }),
        })

      render(<MessagePanel tournamentId="tourn_1" />)
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const announceInput = screen.getByTestId('announce-input')
      fireEvent.change(announceInput, { target: { value: 'Test announcement' } })
      fireEvent.click(screen.getByTestId('announce-button'))

      await waitFor(() => {
        expect(screen.getByText('Forbidden')).toBeInTheDocument()
      })
    })

    it('shows generic error when announcement json() fails', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => { throw new Error('parse fail') },
        })

      render(<MessagePanel tournamentId="tourn_1" />)
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const announceInput = screen.getByTestId('announce-input')
      fireEvent.change(announceInput, { target: { value: 'Announcement' } })
      fireEvent.click(screen.getByTestId('announce-button'))

      await waitFor(() => {
        expect(screen.getByText('Announce failed')).toBeInTheDocument()
      })
    })

    it('does not show announce form for players', () => {
      // Reset to player
      usePermissionsMock.mockReturnValue({
        playerRole: true,
        organizerRole: false,
        canEditScores: false,
        canPublishBracket: false,
        canManageGroups: false,
        canViewAllStandings: false,
        canOrganize: false,
        canParticipate: true,
      })

      render(<MessagePanel tournamentId="tourn_1" />)
      expect(screen.queryByTestId('announce-input')).not.toBeInTheDocument()
    })
  })

  describe('active prop — mark all unread as read', () => {
    it('calls markRead for unread messages when active toggles to true', async () => {
      // Pre-populate the store so the history fetch is skipped (isLoaded() = true)
      const unreadMsg = makeMessage({ id: 'msg_unread', read_at: null })
      messageStore.setHistory([unreadMsg as any])

      // The active effect fires synchronously on mount — markRead fetch needs a mock
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })

      // Render with active=false first, then flip to active=true
      const { rerender } = render(<MessagePanel tournamentId="tourn_1" active={false} />)
      rerender(<MessagePanel tournamentId="tourn_1" active={true} />)

      await waitFor(() => {
        const markReadCalls = (mockFetch as jest.Mock).mock.calls.filter(
          ([url]: [string]) => typeof url === 'string' && url.includes('/read')
        )
        expect(markReadCalls.length).toBeGreaterThan(0)
      })
    })

    it('does not call markRead when active=false', () => {
      // Pre-populate the store
      const unreadMsg = makeMessage({ id: 'msg_unread', read_at: null })
      messageStore.setHistory([unreadMsg as any])

      render(<MessagePanel tournamentId="tourn_1" active={false} />)

      // No mark-read calls should have been made
      const markReadCalls = (mockFetch as jest.Mock).mock.calls.filter(
        ([url]: [string]) => typeof url === 'string' && url.includes('/read')
      )
      expect(markReadCalls).toHaveLength(0)
    })
  })
})

// ── V4.1 Sender attribution — "Name · time" rendering ────────────────────────

describe('V4.1 Sender attribution', () => {
  it('renders sender name followed by time for a message with senderName', async () => {
    const msg = makeMessage({ senderName: 'Alice Smith' } as any)
    messageStore.setHistory([msg as any])

    render(<MessagePanel tournamentId="tourn_1" />)

    // Both name and some time should appear in the item
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument()
    expect(screen.getByText(/Alice Smith\s*·/)).toBeInTheDocument()
  })

  it('renders two messages from different senders with distinguishable names', async () => {
    const msgs = [
      makeMessage({ id: 'msg_a', body: 'Hello', senderName: 'Alice Smith' } as any),
      makeMessage({ id: 'msg_b', body: 'Hi back', senderName: 'Bob Jones' } as any),
    ]
    messageStore.setHistory(msgs as any)

    render(<MessagePanel tournamentId="tourn_1" />)

    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument()
    expect(screen.getByText(/Bob Jones/)).toBeInTheDocument()
  })

  it('falls back gracefully when senderName is absent (no crash)', async () => {
    // Backward compat: messages without senderName should still render
    const msg = makeMessage()
    messageStore.setHistory([msg as any])

    render(<MessagePanel tournamentId="tourn_1" />)

    expect(screen.getByTestId('message-item')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})

// ── UnreadBadge ───────────────────────────────────────────────────────────────

describe('UnreadBadge', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<UnreadBadge count={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the count when greater than 0', () => {
    render(<UnreadBadge count={5} />)
    expect(screen.getByTestId('messages-unread-badge')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows "99+" when count exceeds 99', () => {
    render(<UnreadBadge count={100} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
