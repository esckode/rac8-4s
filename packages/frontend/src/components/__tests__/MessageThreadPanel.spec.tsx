/**
 * MessageThreadPanel — V5.2 thread-aware panel
 *
 * Tests:
 * - Renders the channel switcher
 * - Announcements is the default active thread
 * - Switching to Announcements shows only announcement messages (recipientPlayerId === null)
 * - Announcements channel is READ-ONLY for players (no compose box)
 * - Announcements channel IS writable for organizers (compose appears)
 * - A DM thread shows a recipient-scoped compose that sends with recipientPlayerId
 * - A match thread compose sends with recipientPlayerId + matchId
 * - No arbitrary-DM compose is available (can't start a DM from scratch)
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MessageThreadPanel } from '../MessageThreadPanel'
import { messageStore } from '../../state'

const mockFetch = jest.fn()
global.fetch = mockFetch
window.HTMLElement.prototype.scrollIntoView = jest.fn()

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'player_1', role: 'player', playerId: 'player_1', email: 'p@e.com' },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const usePermissionsMock = jest.fn(() => ({
  playerRole: true,
  organizerRole: false,
  canEditScores: false,
  canPublishBracket: false,
  canManageGroups: false,
  canViewAllStandings: false,
  canOrganize: false,
  canParticipate: true,
}))

jest.mock('../../hooks/usePermissions', () => ({
  usePermissions: (...args: unknown[]) => usePermissionsMock(...args),
}))

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  tournamentId: 'tourn_1',
  senderPlayerId: 'player_2',
  senderName: 'Player Two',
  recipientPlayerId: 'player_1',
  matchId: null,
  body: 'Hello',
  createdAt: new Date().toISOString(),
  legalHold: false,
  read_at: null,
  ...overrides,
})

describe('MessageThreadPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    messageStore.clear()
    localStorage.setItem('auth_token', 'tok_abc')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    })
  })

  afterEach(() => {
    localStorage.removeItem('auth_token')
  })

  describe('Channel switcher presence', () => {
    it('renders the channel switcher', async () => {
      render(<MessageThreadPanel tournamentId="tourn_1" />)
      expect(screen.getByTestId('channel-switcher')).toBeInTheDocument()
    })

    it('renders the Announcements channel button', async () => {
      render(<MessageThreadPanel tournamentId="tourn_1" />)
      expect(screen.getByTestId('channel-announcements')).toBeInTheDocument()
    })

    it('defaults to the Announcements channel', async () => {
      render(<MessageThreadPanel tournamentId="tourn_1" />)
      expect(screen.getByTestId('channel-announcements')).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('Announcements channel — read-only for players', () => {
    it('does NOT show a compose input in Announcements for a player', async () => {
      render(<MessageThreadPanel tournamentId="tourn_1" />)
      // Announcements is active by default; player should not see compose
      expect(screen.queryByTestId('message-input')).not.toBeInTheDocument()
    })

    it('shows a read-only notice in Announcements for a player', async () => {
      render(<MessageThreadPanel tournamentId="tourn_1" />)
      // Some indication that the channel is read-only
      expect(screen.getByTestId('announcements-readonly-notice')).toBeInTheDocument()
    })

    it('passes thread=announcements to the history fetch', async () => {
      render(<MessageThreadPanel tournamentId="tourn_1" />)
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('thread=announcements'),
          expect.anything()
        )
      })
    })

    it('shows only announcement messages in the Announcements channel', async () => {
      const announcement = makeMessage({
        id: 'ann_1',
        body: 'Broadcast msg',
        recipientPlayerId: null,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [announcement] }),
      })

      render(<MessageThreadPanel tournamentId="tourn_1" />)

      await waitFor(() => {
        expect(screen.getByText('Broadcast msg')).toBeInTheDocument()
      })
    })
  })

  describe('Announcements channel — writable for organizers', () => {
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

    it('shows the announce input and button for an organizer in Announcements', async () => {
      render(<MessageThreadPanel tournamentId="tourn_1" />)
      expect(screen.getByTestId('announce-input')).toBeInTheDocument()
      expect(screen.getByTestId('announce-button')).toBeInTheDocument()
    })

    it('does NOT show the read-only notice for organizers', async () => {
      render(<MessageThreadPanel tournamentId="tourn_1" />)
      expect(screen.queryByTestId('announcements-readonly-notice')).not.toBeInTheDocument()
    })
  })

  describe('DM thread — recipient-scoped compose', () => {
    it('shows a compose input when a DM thread is active', async () => {
      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="dm:player_2"
          dmThreads={[{ playerId: 'player_2', displayName: 'Player Two' }]}
        />
      )
      expect(screen.getByTestId('message-input')).toBeInTheDocument()
    })

    it('sends with recipientPlayerId when in a DM thread', async () => {
      const returned = makeMessage({ id: 'msg_new', body: 'Hey' })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => returned })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="dm:player_2"
          dmThreads={[{ playerId: 'player_2', displayName: 'Player Two' }]}
        />
      )
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'Hey' } })
      fireEvent.click(screen.getByTestId('message-send-button'))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/tournaments/tourn_1/messages'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"recipientPlayerId":"player_2"'),
          })
        )
      })
    })

    it('does NOT include matchId when in a plain DM thread', async () => {
      const returned = makeMessage({ id: 'msg_new', body: 'Hey' })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => returned })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="dm:player_2"
          dmThreads={[{ playerId: 'player_2', displayName: 'Player Two' }]}
        />
      )
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'Hey' } })
      fireEvent.click(screen.getByTestId('message-send-button'))

      await waitFor(() => {
        const sendCall = mockFetch.mock.calls.find(
          ([, opts]: [string, RequestInit]) => opts.method === 'POST'
        )
        const body = JSON.parse(sendCall[1].body as string)
        expect(body.matchId).toBeUndefined()
      })
    })
  })

  describe('Match thread — sends with matchId + recipientPlayerId', () => {
    it('shows a compose input when a match thread is active', async () => {
      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="match:match_1"
          matchThreads={[
            { matchId: 'match_1', label: 'Match vs Alice', opponentPlayerId: 'player_a' },
          ]}
        />
      )
      expect(screen.getByTestId('message-input')).toBeInTheDocument()
    })

    it('sends with recipientPlayerId AND matchId when in a match thread', async () => {
      const returned = makeMessage({ id: 'msg_new', body: 'See you court 3' })
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => returned })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="match:match_1"
          matchThreads={[
            { matchId: 'match_1', label: 'Match vs Alice', opponentPlayerId: 'player_a' },
          ]}
        />
      )
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'See you court 3' } })
      fireEvent.click(screen.getByTestId('message-send-button'))

      await waitFor(() => {
        const sendCall = mockFetch.mock.calls.find(
          ([, opts]: [string, RequestInit]) => opts.method === 'POST'
        )
        const body = JSON.parse(sendCall[1].body as string)
        expect(body.recipientPlayerId).toBe('player_a')
        expect(body.matchId).toBe('match_1')
      })
    })

    it('passes thread=match:{matchId} to the history fetch for match threads', async () => {
      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="match:match_1"
          matchThreads={[
            { matchId: 'match_1', label: 'Match vs Alice', opponentPlayerId: 'player_a' },
          ]}
        />
      )
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('thread=match%3Amatch_1'),
          expect.anything()
        )
      })
    })
  })

  describe('Channel switching updates fetch', () => {
    it('re-fetches with thread=dm:{playerId} when switching to a DM channel', async () => {
      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          dmThreads={[{ playerId: 'player_2', displayName: 'Player Two' }]}
        />
      )
      // Initial announcements fetch
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      // Switch to DM channel
      fireEvent.click(screen.getByTestId('channel-dm-player_2'))

      await waitFor(() => {
        const calls = mockFetch.mock.calls.map(([url]: [string]) => url)
        expect(calls.some((url: string) => url.includes('thread=dm%3Aplayer_2'))).toBe(true)
      })
    })
  })

  describe('Mark-as-read (active panel)', () => {
    it('marks an unread message as read once the async history fetch resolves it in', async () => {
      const unread = makeMessage({ id: 'ann_unread', body: 'Read me', recipientPlayerId: null, read_at: null })
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/read')) {
          return Promise.resolve({ ok: true, json: async () => ({}) })
        }
        // History fetch — resolves on a later tick than mount, same as the real
        // network round trip; the mark-as-read effect must not only fire once
        // against the still-empty initial `messages` array.
        return Promise.resolve({ ok: true, json: async () => ({ messages: [unread] }) })
      })

      render(<MessageThreadPanel tournamentId="tourn_1" active />)

      await waitFor(() => {
        const readCalls = mockFetch.mock.calls.filter(([url]: [string]) => url.includes('/read'))
        expect(readCalls.length).toBeGreaterThan(0)
      })
      const [readUrl, readInit] = mockFetch.mock.calls.find(([url]: [string]) => url.includes('/read'))!
      expect(readUrl).toContain('/messages/ann_unread/read')
      expect((readInit as RequestInit).method).toBe('POST')
    })
  })

  describe('No arbitrary DM affordance', () => {
    it('does not offer a "New DM" button anywhere', () => {
      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          dmThreads={[{ playerId: 'player_2', displayName: 'Player Two' }]}
        />
      )
      expect(screen.queryByTestId('channel-new-dm')).not.toBeInTheDocument()
      expect(screen.queryByText(/new dm|new direct|new message.*participant/i)).not.toBeInTheDocument()
    })
  })
})
