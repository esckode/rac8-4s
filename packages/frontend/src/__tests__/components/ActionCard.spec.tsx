/**
 * RTL unit tests for ActionCard — B3.1
 *
 * Confirm-card widget for @coach write-action proposals (design §11 B-Q1-B-Q9).
 * Tests:
 * - Renders the human-readable card body
 * - Confirm + Dismiss visible only to the proposer, only while pending & not expired
 * - Countdown from expiresAt, ticking down (fake timers)
 * - Inert renders: confirmed / failed(+reason) / cancelled / computed-expired
 */
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionCard, type ActionCardProps } from '../../components/ActionCard'

function makeCard(overrides: Partial<ActionCardProps> = {}): ActionCardProps {
  return {
    body: 'Coach drafted a score — You 6-4, 6-3 Bob (Spring Open).',
    status: 'pending',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    result: null,
    isProposer: true,
    onConfirm: jest.fn(),
    onDismiss: jest.fn(),
    action: 'propose_score',
    args: {},
    ...overrides,
  }
}

describe('ActionCard', () => {
  it('renders the card body', () => {
    render(<ActionCard {...makeCard()} />)
    expect(screen.getByTestId('action-card-body')).toHaveTextContent('You 6-4, 6-3 Bob')
  })

  it('shows Confirm and Dismiss to the proposer while pending', () => {
    render(<ActionCard {...makeCard({ isProposer: true })} />)
    expect(screen.getByTestId('action-card-confirm-button')).toBeInTheDocument()
    expect(screen.getByTestId('action-card-dismiss-button')).toBeInTheDocument()
  })

  it('hides Confirm and Dismiss from a non-proposer', () => {
    render(<ActionCard {...makeCard({ isProposer: false })} />)
    expect(screen.queryByTestId('action-card-confirm-button')).toBeNull()
    expect(screen.queryByTestId('action-card-dismiss-button')).toBeNull()
  })

  it('calls onConfirm when Confirm is clicked', async () => {
    const onConfirm = jest.fn()
    render(<ActionCard {...makeCard({ onConfirm })} />)
    await userEvent.click(screen.getByTestId('action-card-confirm-button'))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onDismiss when Dismiss is clicked', async () => {
    const onDismiss = jest.fn()
    render(<ActionCard {...makeCard({ onDismiss })} />)
    await userEvent.click(screen.getByTestId('action-card-dismiss-button'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('shows a countdown while pending', () => {
    render(<ActionCard {...makeCard({ expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() })} />)
    expect(screen.getByTestId('action-card-countdown')).toBeInTheDocument()
  })

  describe('countdown ticking', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('counts down as time passes', () => {
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString()
      render(<ActionCard {...makeCard({ expiresAt })} />)
      const before = screen.getByTestId('action-card-countdown').textContent
      act(() => {
        jest.advanceTimersByTime(61 * 1000)
      })
      const after = screen.getByTestId('action-card-countdown').textContent
      expect(after).not.toBe(before)
    })

    it('transitions to Expired once expiresAt passes, with no confirm/dismiss for the proposer', () => {
      const expiresAt = new Date(Date.now() + 5 * 1000).toISOString()
      render(<ActionCard {...makeCard({ expiresAt, isProposer: true })} />)
      expect(screen.getByTestId('action-card-confirm-button')).toBeInTheDocument()

      act(() => {
        jest.advanceTimersByTime(6 * 1000)
      })

      expect(screen.getByTestId('action-card-status')).toHaveTextContent(/expired/i)
      expect(screen.queryByTestId('action-card-confirm-button')).toBeNull()
      expect(screen.queryByTestId('action-card-dismiss-button')).toBeNull()
    })
  })

  it('inert render: confirmed shows status, no buttons', () => {
    render(<ActionCard {...makeCard({ status: 'confirmed' })} />)
    expect(screen.getByTestId('action-card-status')).toHaveTextContent(/confirmed/i)
    expect(screen.queryByTestId('action-card-confirm-button')).toBeNull()
    expect(screen.queryByTestId('action-card-dismiss-button')).toBeNull()
    expect(screen.queryByTestId('action-card-countdown')).toBeNull()
  })

  it('inert render: failed shows the rejection reason, no buttons', () => {
    render(
      <ActionCard
        {...makeCard({ status: 'failed', result: { reason: 'This match has already been scored.' } })}
      />
    )
    const statusEl = screen.getByTestId('action-card-status')
    expect(statusEl).toHaveTextContent(/failed/i)
    expect(statusEl).toHaveTextContent('This match has already been scored.')
    expect(screen.queryByTestId('action-card-confirm-button')).toBeNull()
  })

  it('inert render: cancelled shows status, no buttons', () => {
    render(<ActionCard {...makeCard({ status: 'cancelled' })} />)
    expect(screen.getByTestId('action-card-status')).toHaveTextContent(/dismiss|cancel/i)
    expect(screen.queryByTestId('action-card-confirm-button')).toBeNull()
  })

  it('computed-expired (status still pending, expiresAt in the past) renders inert even for the proposer', () => {
    render(
      <ActionCard
        {...makeCard({ status: 'pending', expiresAt: new Date(Date.now() - 1000).toISOString(), isProposer: true })}
      />
    )
    expect(screen.getByTestId('action-card-status')).toHaveTextContent(/expired/i)
    expect(screen.queryByTestId('action-card-confirm-button')).toBeNull()
    expect(screen.queryByTestId('action-card-dismiss-button')).toBeNull()
  })

  // ── B4.1 — poll cards render times viewer-local ─────────────────────────────

  describe('propose_poll target time (viewer-local)', () => {
    it('renders the poll targetTime formatted in the viewer local timezone', () => {
      const targetTime = '2026-08-01T18:00:00.000Z'
      render(
        <ActionCard
          {...makeCard({ action: 'propose_poll', args: { question: 'In tonight?', targetTime } })}
        />
      )
      const timeEl = screen.getByTestId('action-card-target-time')
      expect(timeEl).toBeInTheDocument()
      expect(timeEl.textContent).not.toContain('2026-08-01T18:00:00.000Z')
      expect(timeEl.textContent).toBe(new Date(targetTime).toLocaleString())
    })

    it('does not render a target time when the poll is open-ended', () => {
      render(<ActionCard {...makeCard({ action: 'propose_poll', args: { question: 'Anyone free?' } })} />)
      expect(screen.queryByTestId('action-card-target-time')).toBeNull()
    })

    it('does not render a target time for non-poll actions', () => {
      render(<ActionCard {...makeCard({ action: 'propose_score', args: { targetTime: '2026-08-01T18:00:00.000Z' } })} />)
      expect(screen.queryByTestId('action-card-target-time')).toBeNull()
    })
  })
})
