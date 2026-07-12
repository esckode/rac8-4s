/**
 * B5.1 — GroupChatPanel wiring for propose_casual_launch cards
 *
 * The card's Launch CTA opens the existing LaunchConfirmSheet seeded from
 * the card's own args (no votes fetch needed, unlike the poll-card launch
 * flow). Confirming the sheet calls the REAL launch route directly, then
 * the card's own /complete route to flip it - launch's authority/mutation
 * never moves into the card's dispatch.
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

const makeLaunchCardMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_launch_card_1',
  conversationId: 'conv_1',
  playerId: null,
  senderName: 'Coach',
  body: 'Coach drafted a tournament launch from "Saturday?" — 2 players in.',
  type: 'assistant' as const,
  createdAt: new Date().toISOString(),
  removedAt: null,
  metadata: { cardId: 'card_launch_1' },
  cardId: 'card_launch_1',
  cardAction: 'propose_casual_launch',
  cardArgs: { pollId: 'poll_1', messageId: 'msg_poll_1', inVoterNames: ['Alice', 'Bob'], defaultFormat: 'singles' },
  cardStatus: 'pending' as const,
  cardExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  cardSchemaVersion: 1,
  cardResult: null,
  cardProposerPlayerId: 'player_creator',
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

describe('GroupChatPanel — propose_casual_launch card wiring (B5.1)', () => {
  it('clicking the Launch CTA opens LaunchConfirmSheet seeded from the card args (no extra fetch)', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [makeLaunchCardMessage()] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => expect(screen.getByTestId('action-card-launch-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('action-card-launch-button'))

    await waitFor(() => {
      expect(screen.getByTestId('launch-confirm-sheet')).toBeInTheDocument()
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
  })

  it('confirming calls the real launch route, then the card /complete route, then navigates', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [makeLaunchCardMessage()] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tournamentId: 'tour_777', tournamentName: 'Group A — Jul 12' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ card: { id: 'card_launch_1', status: 'confirmed' } }) })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => expect(screen.getByTestId('action-card-launch-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('action-card-launch-button'))
    await waitFor(() => expect(screen.getByTestId('launch-confirm-sheet')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('launch-confirm-button'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/player/groups/grp_1/polls/msg_poll_1/launch'),
        expect.objectContaining({ method: 'POST' })
      )
    })
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/player/groups/grp_1/assistant-cards/card_launch_1/complete'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ tournamentId: 'tour_777' }) })
      )
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('tour_777'))
    })
  })

  it('cancelling the sheet closes it without calling launch or complete', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [makeLaunchCardMessage()] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => expect(screen.getByTestId('action-card-launch-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('action-card-launch-button'))
    await waitFor(() => expect(screen.getByTestId('launch-confirm-sheet')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('launch-cancel-button'))

    await waitFor(() => expect(screen.queryByTestId('launch-confirm-sheet')).toBeNull())
    const postCall = mockFetch.mock.calls.find(c => c[1]?.method === 'POST')
    expect(postCall).toBeUndefined()
  })

  it('a non-proposer never sees the Launch CTA', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [makeLaunchCardMessage({ cardProposerPlayerId: 'someone_else' })] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => expect(screen.getByTestId('action-card')).toBeInTheDocument())
    expect(screen.queryByTestId('action-card-launch-button')).toBeNull()
  })
})
