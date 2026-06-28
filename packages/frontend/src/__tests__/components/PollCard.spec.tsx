/**
 * RTL unit tests for PollCard — G3.3
 *
 * Tests:
 * - Renders question + target time
 * - Vote buttons (In/Out/Maybe) present on open polls
 * - Clicking a vote button calls the vote API
 * - Current user's active vote is highlighted
 * - Closed poll shows frozen tally, no vote buttons
 * - "Close poll" button visible to owners, hidden for members
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PollCard, type PollCardProps } from '../../components/PollCard'

// ── helpers ──────────────────────────────────────────────────────────────────

function makePoll(overrides: Partial<PollCardProps> = {}): PollCardProps {
  return {
    groupId: 'grp-1',
    messageId: 'msg-1',
    pollId: 'poll-1',
    question: 'Are you coming tonight?',
    targetTime: null,
    closedAt: null,
    tally: { in: 0, out: 0, maybe: 0 },
    currentUserVote: null,
    isOwner: false,
    isCreator: false,
    onVote: jest.fn(),
    onClose: jest.fn(),
    onLaunch: undefined,
    ...overrides,
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('PollCard', () => {
  it('renders the poll question', () => {
    render(<PollCard {...makePoll()} />)
    expect(screen.getByTestId('poll-question')).toHaveTextContent('Are you coming tonight?')
  })

  it('renders target time when provided', () => {
    render(<PollCard {...makePoll({ targetTime: '2026-07-01T18:00:00.000Z' })} />)
    expect(screen.getByTestId('poll-target-time')).toBeInTheDocument()
  })

  it('does not render target time when null', () => {
    render(<PollCard {...makePoll({ targetTime: null })} />)
    expect(screen.queryByTestId('poll-target-time')).toBeNull()
  })

  it('renders In/Out/Maybe vote buttons on open poll', () => {
    render(<PollCard {...makePoll()} />)
    expect(screen.getByTestId('poll-vote-in')).toBeInTheDocument()
    expect(screen.getByTestId('poll-vote-out')).toBeInTheDocument()
    expect(screen.getByTestId('poll-vote-maybe')).toBeInTheDocument()
  })

  it('renders live tally', () => {
    render(<PollCard {...makePoll({ tally: { in: 3, out: 1, maybe: 2 } })} />)
    const tally = screen.getByTestId('poll-tally')
    expect(tally).toHaveTextContent('3 in')
    expect(tally).toHaveTextContent('1 out')
    expect(tally).toHaveTextContent('2 maybe')
  })

  it('calls onVote with "in" when the In button is clicked', async () => {
    const onVote = jest.fn()
    render(<PollCard {...makePoll({ onVote })} />)
    await userEvent.click(screen.getByTestId('poll-vote-in'))
    expect(onVote).toHaveBeenCalledWith('in')
  })

  it('calls onVote with "out" when the Out button is clicked', async () => {
    const onVote = jest.fn()
    render(<PollCard {...makePoll({ onVote })} />)
    await userEvent.click(screen.getByTestId('poll-vote-out'))
    expect(onVote).toHaveBeenCalledWith('out')
  })

  it('calls onVote with "maybe" when the Maybe button is clicked', async () => {
    const onVote = jest.fn()
    render(<PollCard {...makePoll({ onVote })} />)
    await userEvent.click(screen.getByTestId('poll-vote-maybe'))
    expect(onVote).toHaveBeenCalledWith('maybe')
  })

  it('highlights the current user active vote', () => {
    render(<PollCard {...makePoll({ currentUserVote: 'in' })} />)
    const inBtn = screen.getByTestId('poll-vote-in')
    expect(inBtn).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('poll-vote-out')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('poll-vote-maybe')).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows frozen tally and no vote buttons when poll is closed', () => {
    render(
      <PollCard
        {...makePoll({
          closedAt: '2026-06-28T12:00:00.000Z',
          tally: { in: 4, out: 2, maybe: 1 },
        })}
      />
    )
    expect(screen.queryByTestId('poll-vote-in')).toBeNull()
    expect(screen.queryByTestId('poll-vote-out')).toBeNull()
    expect(screen.queryByTestId('poll-vote-maybe')).toBeNull()
    const tally = screen.getByTestId('poll-tally')
    expect(tally).toHaveTextContent('Final:')
    expect(tally).toHaveTextContent('4 in')
  })

  it('shows Close poll button to owner on open poll', () => {
    render(<PollCard {...makePoll({ isOwner: true })} />)
    expect(screen.getByTestId('poll-close-button')).toBeInTheDocument()
  })

  it('hides Close poll button for non-owner', () => {
    render(<PollCard {...makePoll({ isOwner: false })} />)
    expect(screen.queryByTestId('poll-close-button')).toBeNull()
  })

  it('hides Close poll button when poll is already closed', () => {
    render(
      <PollCard {...makePoll({ isOwner: true, closedAt: '2026-06-28T12:00:00.000Z' })} />
    )
    expect(screen.queryByTestId('poll-close-button')).toBeNull()
  })

  it('calls onClose when Close poll button is clicked', async () => {
    const onClose = jest.fn()
    render(<PollCard {...makePoll({ isOwner: true, onClose })} />)
    await userEvent.click(screen.getByTestId('poll-close-button'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows launch button to creator on closed polls', () => {
    const onLaunch = jest.fn()
    render(<PollCard {...makePoll({ isCreator: true, closedAt: '2026-07-01T10:00:00Z', onLaunch })} />)
    expect(screen.getByTestId('poll-launch-button')).toBeInTheDocument()
  })

  it('hides launch button for non-creators', () => {
    const onLaunch = jest.fn()
    render(<PollCard {...makePoll({ isCreator: false, closedAt: '2026-07-01T10:00:00Z', onLaunch })} />)
    expect(screen.queryByTestId('poll-launch-button')).not.toBeInTheDocument()
  })

  it('hides launch button on open polls even for creator', () => {
    const onLaunch = jest.fn()
    render(<PollCard {...makePoll({ isCreator: true, closedAt: null, onLaunch })} />)
    expect(screen.queryByTestId('poll-launch-button')).not.toBeInTheDocument()
  })
})
