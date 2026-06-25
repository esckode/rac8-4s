/**
 * V6.1 — Read-receipt visibility frontend unit tests (TDD RED first)
 *
 * RTL tests covering:
 * 1. Organizer sees "X of N read" on a broadcast message in MessageThreadPanel
 * 2. DM "seen" indicator shows for sender ONLY when recipient opted in
 * 3. DM "seen" indicator is ABSENT by default (not shown when recipientReadAt is undefined)
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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

const makeBroadcast = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_broadcast',
  tournamentId: 'tourn_1',
  senderPlayerId: 'organizer_1',
  senderName: null,
  recipientPlayerId: null,
  matchId: null,
  body: 'Courts are ready',
  createdAt: new Date().toISOString(),
  legalHold: false,
  read_at: new Date().toISOString(),
  ackCount: { read: 3, total: 5 },
  ...overrides,
})

const makeDm = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_dm_1',
  tournamentId: 'tourn_1',
  senderPlayerId: 'player_1', // current viewer is the sender
  senderName: 'Player One',
  recipientPlayerId: 'player_2',
  matchId: null,
  body: 'See you at court 3',
  createdAt: new Date().toISOString(),
  legalHold: false,
  read_at: null,
  // recipientReadAt present only when opted in
  ...overrides,
})

describe('V6.1 — Read-receipt visibility (frontend RTL)', () => {
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
    messageStore.clear()
  })

  // ── Organizer ack count ───────────────────────────────────────────────────

  describe('Organizer ack count on broadcast messages', () => {
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

    it('renders "X of N read" for a broadcast when ackCount is present and user is organizer', async () => {
      const broadcast = makeBroadcast({ ackCount: { read: 3, total: 5 } })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [broadcast] }),
      })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="announcements"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Courts are ready')).toBeInTheDocument()
      })

      // The ack count badge should appear
      expect(screen.getByTestId('broadcast-ack-count')).toBeInTheDocument()
      expect(screen.getByTestId('broadcast-ack-count')).toHaveTextContent('3 of 5 read')
    })

    it('does NOT render ack count when ackCount is absent from the message', async () => {
      const broadcastNoAck = makeBroadcast({ ackCount: undefined })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [broadcastNoAck] }),
      })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="announcements"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Courts are ready')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('broadcast-ack-count')).not.toBeInTheDocument()
    })
  })

  describe('Player does NOT see ack count on broadcast messages', () => {
    it('does NOT render ack count badge even when ackCount is in payload', async () => {
      // Player role
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

      const broadcast = makeBroadcast({ ackCount: { read: 2, total: 4 } })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [broadcast] }),
      })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="announcements"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Courts are ready')).toBeInTheDocument()
      })

      // Players should never see the ack count
      expect(screen.queryByTestId('broadcast-ack-count')).not.toBeInTheDocument()
    })
  })

  // ── DM "seen" indicator ───────────────────────────────────────────────────

  describe('DM "seen" indicator — opt-in only', () => {
    it('does NOT show "Seen" when recipientReadAt is absent (default, opt-out)', async () => {
      const dm = makeDm({ recipientReadAt: undefined })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [dm] }),
      })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="dm:player_2"
          dmThreads={[{ playerId: 'player_2', displayName: 'Player Two' }]}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('See you at court 3')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('dm-seen-indicator')).not.toBeInTheDocument()
    })

    it('shows "Seen" when recipientReadAt is present (recipient opted in)', async () => {
      const dm = makeDm({ recipientReadAt: new Date().toISOString() })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [dm] }),
      })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="dm:player_2"
          dmThreads={[{ playerId: 'player_2', displayName: 'Player Two' }]}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('See you at court 3')).toBeInTheDocument()
      })

      expect(screen.getByTestId('dm-seen-indicator')).toBeInTheDocument()
      expect(screen.getByTestId('dm-seen-indicator')).toHaveTextContent('Seen')
    })

    it('does NOT show "Seen" when recipient has not read yet (recipientReadAt is null)', async () => {
      // recipientReadAt: null means opted in but not yet read
      const dm = makeDm({ recipientReadAt: null })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [dm] }),
      })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="dm:player_2"
          dmThreads={[{ playerId: 'player_2', displayName: 'Player Two' }]}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('See you at court 3')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('dm-seen-indicator')).not.toBeInTheDocument()
    })

    it('sender sees "Seen" on THEIR OWN DMs only (not other players DMs in same thread)', async () => {
      // Current viewer is player_1 (the sender of msg_dm_1)
      // msg_dm_2 is from player_2 → player_1, so player_1 is the RECIPIENT, not sender
      // player_1 should see "Seen" on their own sent message but NOT on received ones
      const sentByViewer = makeDm({
        id: 'msg_dm_sent',
        senderPlayerId: 'player_1',
        recipientPlayerId: 'player_2',
        body: 'I sent this',
        recipientReadAt: new Date().toISOString(),
      })
      const receivedByViewer = {
        id: 'msg_dm_recv',
        tournamentId: 'tourn_1',
        senderPlayerId: 'player_2',
        senderName: 'Player Two',
        recipientPlayerId: 'player_1',
        matchId: null,
        body: 'You received this',
        createdAt: new Date().toISOString(),
        legalHold: false,
        read_at: null,
        // NO recipientReadAt — because the sender (player_2) hasn't opted in
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [sentByViewer, receivedByViewer] }),
      })

      render(
        <MessageThreadPanel
          tournamentId="tourn_1"
          initialThread="dm:player_2"
          dmThreads={[{ playerId: 'player_2', displayName: 'Player Two' }]}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('I sent this')).toBeInTheDocument()
        expect(screen.getByText('You received this')).toBeInTheDocument()
      })

      // Only the sent message should have a "Seen" indicator
      const seenIndicators = screen.queryAllByTestId('dm-seen-indicator')
      expect(seenIndicators).toHaveLength(1)
    })
  })
})
