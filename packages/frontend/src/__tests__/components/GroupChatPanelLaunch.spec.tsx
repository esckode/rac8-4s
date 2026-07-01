/**
 * P3.7 RED — GroupChatPanel launch wiring + deep-link rendering tests
 *
 * Tests:
 *   1. When poll message has isCreator=true (playerId === user.playerId), poll-launch-button is shown
 *   2. Clicking poll-launch-button fetches votes and opens LaunchConfirmSheet
 *   3. Confirming launch POSTs to /player/groups/:groupId/polls/:messageId/launch
 *   4. On 201, navigates to /tournament/:id
 *   5. System message with metadata.tournament_id renders as a deep-link (data-testid="tournament-deep-link")
 *   6. System message without metadata renders as plain text (no deep-link)
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GroupChatPanel } from '../../components/GroupChatPanel'
import { clearGroupMessageStores } from '../../hooks/useGroupMessages'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

window.HTMLElement.prototype.scrollIntoView = jest.fn()

jest.mock('reconnecting-eventsource', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  }))
})

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'acc_1', role: 'player', playerId: 'player_creator', email: 'creator@test.com' },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const makePollMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_poll_1',
  conversationId: 'conv_1',
  playerId: 'player_creator',
  senderName: 'Creator',
  body: 'Are you in tonight?',
  type: 'poll' as const,
  createdAt: new Date('2026-07-01T10:00:00Z').toISOString(),
  removedAt: null,
  pollId: 'poll_1',
  targetTime: null,
  closedAt: new Date('2026-07-01T12:00:00Z').toISOString(),
  autoCloseAt: null,
  autoLaunch: false,
  tally: { in: 2, out: 0, maybe: 0 },
  metadata: null,
  ...overrides,
})

const makeSystemMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_sys_1',
  conversationId: 'conv_1',
  playerId: null,
  senderName: null,
  body: 'Tournament started: Group A — Jul 1',
  type: 'system' as const,
  createdAt: new Date('2026-07-01T12:05:00Z').toISOString(),
  removedAt: null,
  metadata: null,
  ...overrides,
})

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  jest.clearAllMocks()
  clearGroupMessageStores()
  mockNavigate.mockReset()
})

describe('GroupChatPanel — launch wiring (P3.7)', () => {
  it('shows poll-launch-button when current user is the poll creator and poll is closed', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [makePollMessage()] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // members

    renderWithRouter(<GroupChatPanel groupId="grp_1" isOwner={false} />)

    await waitFor(() => {
      expect(screen.getByTestId('poll-launch-button')).toBeInTheDocument()
    })
  })

  it('does NOT show poll-launch-button when poll is open', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [makePollMessage({ closedAt: null })] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderWithRouter(<GroupChatPanel groupId="grp_1" isOwner={false} />)

    await waitFor(() => expect(screen.queryByTestId('poll-launch-button')).toBeNull())
  })

  it('clicking poll-launch-button fetches votes and opens LaunchConfirmSheet', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [makePollMessage()] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // members
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          votes: [
            { playerId: 'p1', choice: 'in', votedAt: new Date().toISOString(), voterName: 'Alice' },
            { playerId: 'p2', choice: 'in', votedAt: new Date().toISOString(), voterName: 'Bob' },
          ],
          tally: { in: 2, out: 0, maybe: 0 },
        }),
      })

    renderWithRouter(<GroupChatPanel groupId="grp_1" isOwner={false} />)

    await waitFor(() => expect(screen.getByTestId('poll-launch-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('poll-launch-button'))

    await waitFor(() => {
      expect(screen.getByTestId('launch-confirm-sheet')).toBeInTheDocument()
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
  })

  it('confirming launch POSTs to /launch and navigates to the tournament', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [makePollMessage()] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // members
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          votes: [{ playerId: 'p1', choice: 'in', votedAt: new Date().toISOString(), voterName: 'Alice' }],
          tally: { in: 1, out: 0, maybe: 0 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tournamentId: 'tour_999', tournamentName: 'Group A — Jul 1' }),
        status: 201,
      })

    renderWithRouter(<GroupChatPanel groupId="grp_1" isOwner={false} />)

    await waitFor(() => expect(screen.getByTestId('poll-launch-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('poll-launch-button'))

    await waitFor(() => expect(screen.getByTestId('launch-confirm-sheet')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('launch-confirm-button'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/player/groups/grp_1/polls/msg_poll_1/launch'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('tour_999'))
    })
  })

  it('cancelling the sheet closes it without POSTing', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [makePollMessage()] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ votes: [], tally: { in: 0, out: 0, maybe: 0 } }),
      })

    renderWithRouter(<GroupChatPanel groupId="grp_1" isOwner={false} />)

    await waitFor(() => expect(screen.getByTestId('poll-launch-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('poll-launch-button'))

    await waitFor(() => expect(screen.getByTestId('launch-confirm-sheet')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('launch-cancel-button'))

    await waitFor(() => expect(screen.queryByTestId('launch-confirm-sheet')).toBeNull())
    // No POST call (only initial 3 GETs)
    const postCall = mockFetch.mock.calls.find(c => c[1]?.method === 'POST')
    expect(postCall).toBeUndefined()
  })
})

describe('GroupChatPanel — deep-link rendering (P3.5)', () => {
  it('renders system message with metadata.tournament_id as a tournament deep-link', async () => {
    const sysMsg = makeSystemMessage({
      metadata: { tournament_id: 'tour_123' },
    })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [sysMsg] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('tournament-deep-link')).toBeInTheDocument()
    })
    const link = screen.getByTestId('tournament-deep-link')
    expect(link.getAttribute('href') ?? link.getAttribute('data-href')).toContain('tour_123')
  })

  it('renders system message without metadata as plain text (no deep-link)', async () => {
    const sysMsg = makeSystemMessage({ metadata: null, body: 'Sam joined the group' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [sysMsg] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => {
      expect(screen.getByText('Sam joined the group')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('tournament-deep-link')).toBeNull()
  })
})
