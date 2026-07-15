/**
 * S7.2 — CoachChat page (RED first)
 *
 * Route /coach: renders history (assistant rows including the intro),
 * composer posts + clears, remember-card renders via ActionCard with
 * Confirm/Dismiss wired to the S6.2 card routes.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CoachChat } from '../CoachChat'
import { clearCoachMessageStore } from '../../hooks/useCoachMessages'

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
    user: { id: 'acc_1', role: 'player', playerId: 'player_1', email: 'p@e.com' },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const introMessage = {
  id: 'msg_intro',
  conversationId: 'conv_1',
  playerId: null,
  senderName: 'Coach',
  body: "Hi, I'm Coach 👋",
  type: 'assistant',
  createdAt: new Date('2026-07-14T10:00:00Z').toISOString(),
  metadata: { intro: true },
}

const playerMessage = {
  id: 'msg_1',
  conversationId: 'conv_1',
  playerId: 'player_1',
  senderName: 'Me',
  body: 'who am I playing next?',
  type: 'text',
  createdAt: new Date('2026-07-14T10:01:00Z').toISOString(),
}

const cardMessage = {
  id: 'msg_card',
  conversationId: 'conv_1',
  playerId: null,
  senderName: 'Coach',
  body: 'Coach wants to remember: "prefers morning matches". Only you can confirm.',
  type: 'assistant',
  createdAt: new Date('2026-07-14T10:02:00Z').toISOString(),
  cardId: 'card_1',
  cardAction: 'remember',
  cardArgs: { text: 'prefers morning matches' },
  cardStatus: 'pending',
  cardExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  cardProposerPlayerId: 'player_1',
}

function messagesResponse(messages: Array<Record<string, unknown>>) {
  return { ok: true, json: async () => ({ conversationId: 'conv_1', messages }) }
}

describe('CoachChat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('auth_token', 'test-token')
    clearCoachMessageStore()
  })

  it('renders the intro message like any assistant row', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/player/coach/messages')) return Promise.resolve(messagesResponse([introMessage]))
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })

    render(<MemoryRouter><CoachChat /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText(/Hi, I'm Coach/)).toBeInTheDocument()
    })
  })

  it('renders history with player bubbles and Coach bubbles distinguishably', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/player/coach/messages')) return Promise.resolve(messagesResponse([introMessage, playerMessage]))
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })

    render(<MemoryRouter><CoachChat /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText('who am I playing next?')).toBeInTheDocument()
    })
    expect(screen.getAllByTestId('coach-player-bubble')).toHaveLength(1)
    expect(screen.getAllByTestId('coach-assistant-bubble')).toHaveLength(1)
  })

  it('composer posts to POST /player/coach/messages and clears', async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/player/coach/messages') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'msg_2', conversationId: 'conv_1', playerId: 'player_1', senderName: 'Me',
            body: 'hello', type: 'text', createdAt: new Date().toISOString(),
          }),
        })
      }
      if (url.includes('/player/coach/messages')) return Promise.resolve(messagesResponse([]))
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })

    render(<MemoryRouter><CoachChat /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('coach-message-input')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('coach-message-input'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByTestId('coach-message-send-button'))

    await waitFor(() => {
      expect(screen.getByTestId('coach-message-input')).toHaveValue('')
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/player/coach/messages',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('renders a remember card via ActionCard, wired to confirm/dismiss', async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/cards/card_1/confirm')) {
        return Promise.resolve({ ok: true, json: async () => ({ card: { id: 'card_1', status: 'confirmed' } }) })
      }
      if (url.includes('/player/coach/messages') && (!opts || opts.method === undefined)) {
        return Promise.resolve(messagesResponse([cardMessage]))
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })

    render(<MemoryRouter><CoachChat /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('action-card')).toBeInTheDocument()
    })
    expect(screen.getByTestId('action-card-confirm-button')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('action-card-confirm-button'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/player/coach/cards/card_1/confirm',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})
