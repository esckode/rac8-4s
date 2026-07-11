/**
 * A7.1 — @coach assistant message rendering in GroupChatPanel (RED first)
 *
 * type='assistant' rows render distinctly from player messages: sender
 * "Coach", data-testid="assistant-message", not the plain
 * data-testid="group-message-item" bubble.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GroupChatPanel } from '../GroupChatPanel'

const mockMessages = [
  {
    id: 'msg-1',
    groupId: 'grp-1',
    type: 'assistant' as const,
    body: 'Saturday 9am vs Bob, Court 2.',
    senderName: 'Coach',
    playerId: null,
    createdAt: new Date().toISOString(),
    pollId: null,
    targetTime: null,
    closedAt: null,
    tally: null,
  },
]

window.HTMLElement.prototype.scrollIntoView = jest.fn()

jest.mock('../../hooks/useGroupMessages', () => ({
  useGroupMessages: () => ({ messages: mockMessages, send: jest.fn() }),
}))

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Current User', playerId: 'pid-current' } }),
}))

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ members: [] }),
} as unknown as Response)

describe('GroupChatPanel — @coach assistant message rendering (A7.1)', () => {
  it('renders a type=assistant row with data-testid="assistant-message"', async () => {
    render(<MemoryRouter><GroupChatPanel groupId="grp-1" /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByTestId('assistant-message')).toBeInTheDocument()
    })
  })

  it('shows the sender as Coach and the reply body', async () => {
    render(<MemoryRouter><GroupChatPanel groupId="grp-1" /></MemoryRouter>)
    await waitFor(() => {
      const bubble = screen.getByTestId('assistant-message')
      expect(bubble).toHaveTextContent('Coach')
      expect(bubble).toHaveTextContent('Saturday 9am vs Bob, Court 2.')
    })
  })

  it('is not rendered as a plain player message bubble', async () => {
    render(<MemoryRouter><GroupChatPanel groupId="grp-1" /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByTestId('assistant-message')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('group-message-item')).not.toBeInTheDocument()
  })
})
