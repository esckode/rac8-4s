/**
 * S4.6 — State-aware composer quick chip (P7)
 *
 * Exactly one chip, highest applicable priority: Report score > Vote >
 * generic "@coach ...". Chips only pre-fill composer text or navigate —
 * never send, never mutate. Hidden entirely when the group's
 * assistantEnabled is false (mirrors the mention picker).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GroupChatPanel } from '../GroupChatPanel'

const mockMessages = [
  {
    id: 'msg-poll-1',
    groupId: 'grp-1',
    type: 'poll' as const,
    body: 'Play Saturday?',
    senderName: 'Bob',
    createdAt: new Date().toISOString(),
    pollId: 'poll-1',
    targetTime: null,
    closedAt: null,
    autoCloseAt: null,
    autoLaunch: false,
    tally: { in: 0, out: 0, maybe: 0 },
  },
]

let mockPendingActions: {
  unscoredMatches: Array<{ tournamentId: string; tournamentName: string; matchId: string; opponentName: string }>
  openPolls: Array<{ groupId: string; groupName: string; pollId: string; question: string }>
  pendingCards: unknown[]
  nearestDeadline: unknown
} = { unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null }

window.HTMLElement.prototype.scrollIntoView = jest.fn()

jest.mock('../../hooks/useGroupMessages', () => ({
  useGroupMessages: () => ({ messages: mockMessages, send: jest.fn() }),
}))

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Current User', playerId: 'pid-current' } }),
}))

jest.mock('../../hooks/usePendingActions', () => ({
  usePendingActions: () => mockPendingActions,
}))

global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ members: [] }) } as unknown as Response)

function renderPanel(assistantEnabled = true) {
  return render(
    <MemoryRouter>
      <GroupChatPanel groupId="grp-1" assistantEnabled={assistantEnabled} />
    </MemoryRouter>
  )
}

describe('GroupChatPanel composer chip (P7)', () => {
  beforeEach(() => {
    mockPendingActions = { unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null }
    jest.clearAllMocks()
  })

  it('shows a generic @coach chip when nothing is pending', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('composer-chip')).toBeInTheDocument())
    expect(screen.getByTestId('composer-chip')).toHaveTextContent(/@coach/i)
  })

  it('shows a Report score chip when an unscored match exists, and pre-fills without sending', async () => {
    mockPendingActions.unscoredMatches = [
      { tournamentId: 't1', tournamentName: 'T1', matchId: 'm1', opponentName: 'Alice' },
    ]
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('composer-chip')).toHaveTextContent(/report score/i))

    fireEvent.click(screen.getByTestId('composer-chip'))
    const input = screen.getByTestId('group-message-input') as HTMLInputElement
    expect(input.value).toBe('@coach beat Alice ')
    expect(screen.queryByTestId('group-system-event')).not.toBeInTheDocument()
  })

  it('shows a Vote chip when a poll in this group is open, and scrolls to it', async () => {
    mockPendingActions.openPolls = [
      { groupId: 'grp-1', groupName: 'Group 1', pollId: 'poll-1', question: 'Play Saturday?' },
    ]
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('composer-chip')).toHaveTextContent(/vote/i))

    fireEvent.click(screen.getByTestId('composer-chip'))
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('prioritizes Report score over Vote when both are pending', async () => {
    mockPendingActions.unscoredMatches = [
      { tournamentId: 't1', tournamentName: 'T1', matchId: 'm1', opponentName: 'Alice' },
    ]
    mockPendingActions.openPolls = [
      { groupId: 'grp-1', groupName: 'Group 1', pollId: 'poll-1', question: 'Play Saturday?' },
    ]
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('composer-chip')).toHaveTextContent(/report score/i))
  })

  it('ignores an open poll from a different group', async () => {
    mockPendingActions.openPolls = [
      { groupId: 'grp-other', groupName: 'Other', pollId: 'poll-9', question: 'Play Sunday?' },
    ]
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('composer-chip')).toHaveTextContent(/@coach/i))
  })

  it('hides the chip entirely when assistantEnabled is false, even with a pending match', async () => {
    mockPendingActions.unscoredMatches = [
      { tournamentId: 't1', tournamentName: 'T1', matchId: 'm1', opponentName: 'Alice' },
    ]
    renderPanel(false)
    await waitFor(() => expect(screen.getByTestId('group-chat-panel')).toBeInTheDocument())
    expect(screen.queryByTestId('composer-chip')).not.toBeInTheDocument()
  })
})
