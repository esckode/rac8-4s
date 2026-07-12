/**
 * B3.2 [RED→GREEN] — GroupChatPanel wiring for ActionCard
 *
 * type='assistant' messages carrying a card render an ActionCard (in
 * addition to the existing assistant-message bubble). Confirm/Dismiss are
 * wired to the real confirm/cancel routes, proposer-only, mirroring the
 * poll launch wiring pattern (GroupChatPanelLaunch.spec.tsx).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GroupChatPanel } from '../../components/GroupChatPanel'
import { clearGroupMessageStores } from '../../hooks/useGroupMessages'

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
    user: { id: 'acc_1', role: 'player', playerId: 'player_proposer', email: 'proposer@test.com' },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const makeCardMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_card_1',
  conversationId: 'conv_1',
  playerId: null,
  senderName: 'Coach',
  body: 'Coach drafted a score — You 6-4, 6-3 Bob.',
  type: 'assistant' as const,
  createdAt: new Date().toISOString(),
  removedAt: null,
  metadata: { cardId: 'card_1' },
  cardId: 'card_1',
  cardAction: 'propose_score',
  cardArgs: { tournamentId: 't1', matchId: 'm1' },
  cardStatus: 'pending' as const,
  cardExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  cardSchemaVersion: 1,
  cardResult: null,
  cardProposerPlayerId: 'player_proposer',
  ...overrides,
})

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  jest.clearAllMocks()
  clearGroupMessageStores()
})

describe('GroupChatPanel — ActionCard wiring (B3.2)', () => {
  it('renders an action-card for a type=assistant message with a card', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [makeCardMessage()] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('action-card')).toBeInTheDocument()
    })
  })

  it('shows Confirm/Dismiss to the proposer', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [makeCardMessage()] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => expect(screen.getByTestId('action-card-confirm-button')).toBeInTheDocument())
  })

  it('hides Confirm/Dismiss from a non-proposer', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [makeCardMessage({ cardProposerPlayerId: 'someone_else' })] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => expect(screen.getByTestId('action-card')).toBeInTheDocument())
    expect(screen.queryByTestId('action-card-confirm-button')).toBeNull()
  })

  it('clicking Confirm POSTs to the confirm route', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [makeCardMessage()] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ card: { id: 'card_1', status: 'confirmed' } }) })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => expect(screen.getByTestId('action-card-confirm-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('action-card-confirm-button'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/player/groups/grp_1/assistant-cards/card_1/confirm'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('clicking Dismiss POSTs to the cancel route', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [makeCardMessage()] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ card: { id: 'card_1', status: 'cancelled' } }) })

    renderWithRouter(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => expect(screen.getByTestId('action-card-dismiss-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('action-card-dismiss-button'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/player/groups/grp_1/assistant-cards/card_1/cancel'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})
