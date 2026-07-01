/**
 * Tests for @mention composer and mention chip rendering in GroupChatPanel (P1.9)
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GroupChatPanel } from '../GroupChatPanel'

const mockMessages = [
  {
    id: 'msg-1',
    groupId: 'grp-1',
    type: 'text' as const,
    body: 'Hey @"Alice Smith" how are you',
    senderName: 'Bob',
    createdAt: new Date().toISOString(),
    pollId: null,
    targetTime: null,
    closedAt: null,
    tally: null,
  },
  {
    id: 'msg-2',
    groupId: 'grp-1',
    type: 'text' as const,
    body: 'Hello @"Current User" check this out',
    senderName: 'Alice',
    createdAt: new Date().toISOString(),
    pollId: null,
    targetTime: null,
    closedAt: null,
    tally: null,
  },
]

const mockMembers = [
  { playerId: 'pid-alice', name: 'Alice Smith', role: 'member' as const, joinedAt: '2026-01-01T00:00:00Z' },
  { playerId: 'pid-bob', name: 'Bob Jones', role: 'owner' as const, joinedAt: '2026-01-01T00:00:00Z' },
]

jest.mock('../../hooks/useGroupMessages', () => ({
  useGroupMessages: () => ({ messages: mockMessages, send: jest.fn() }),
}))

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Current User', playerId: 'pid-current' } }),
}))

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => mockMembers,
} as unknown as Response)

describe('GroupChatPanel mention rendering (P1.9)', () => {
  it('renders @"Alice Smith" as a highlighted mention chip', async () => {
    render(<GroupChatPanel groupId="grp-1" />)
    await waitFor(() =>
      expect(screen.getAllByTestId('mention-chip').length).toBeGreaterThan(0)
    )
    const chips = screen.getAllByTestId('mention-chip')
    expect(chips.some(c => c.textContent === 'Alice Smith')).toBe(true)
  })

  it('renders self-mention with a distinct testid', async () => {
    render(<GroupChatPanel groupId="grp-1" />)
    await waitFor(() =>
      expect(screen.getByTestId('mention-chip-self')).toBeInTheDocument()
    )
    expect(screen.getByTestId('mention-chip-self').textContent).toBe('Current User')
  })
})

describe('GroupChatPanel @mention composer (P1.9)', () => {
  it('opens autocomplete when @ is typed in the input', async () => {
    render(<GroupChatPanel groupId="grp-1" />)
    const input = screen.getByTestId('group-message-input')
    fireEvent.change(input, { target: { value: '@' } })
    await waitFor(() =>
      expect(screen.getByTestId('mention-autocomplete')).toBeInTheDocument()
    )
  })

  it('inserts @"Member Name" when a suggestion is selected', async () => {
    render(<GroupChatPanel groupId="grp-1" />)
    const input = screen.getByTestId('group-message-input')
    fireEvent.change(input, { target: { value: '@' } })
    await waitFor(() => screen.getByTestId('mention-autocomplete'))

    fireEvent.click(screen.getByText('Alice Smith'))
    expect((input as HTMLInputElement).value).toBe('@"Alice Smith" ')
  })

  it('closes autocomplete when Escape is pressed', async () => {
    render(<GroupChatPanel groupId="grp-1" />)
    const input = screen.getByTestId('group-message-input')
    fireEvent.change(input, { target: { value: '@' } })
    await waitFor(() => screen.getByTestId('mention-autocomplete'))

    fireEvent.keyDown(screen.getByTestId('mention-autocomplete'), { key: 'Escape' })
    expect(screen.queryByTestId('mention-autocomplete')).not.toBeInTheDocument()
  })

  it('does not show autocomplete for a non-member query', async () => {
    render(<GroupChatPanel groupId="grp-1" />)
    const input = screen.getByTestId('group-message-input')
    fireEvent.change(input, { target: { value: '@xyz_nobody' } })
    // Still shows autocomplete but with no options
    await waitFor(() => screen.getByTestId('mention-autocomplete'))
    expect(screen.queryByTestId('mention-option')).not.toBeInTheDocument()
  })
})
