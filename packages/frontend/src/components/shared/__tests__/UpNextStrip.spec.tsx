/**
 * S4.5 — "Up next" strip (P6)
 *
 * One glanceable strip at the top of the landing screen: unscored matches,
 * open polls, pending cards, nearest deadline — each deep-linking to its
 * screen. Renders only when the P5 payload has items; no dismiss
 * affordance (dismissing doesn't unscore the match — the badge still
 * shows the count regardless, design decision 2026-07-13).
 */
/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import { UpNextStrip } from '../UpNextStrip'
import type { PendingActions } from '../../../hooks/usePendingActions'

const EMPTY: PendingActions = { unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null }

describe('UpNextStrip', () => {
  it('renders nothing when nothing is pending', () => {
    const { container } = render(<UpNextStrip actions={EMPTY} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders no dismiss affordance', () => {
    render(<UpNextStrip actions={{ ...EMPTY, unscoredMatches: [
      { tournamentId: 't1', tournamentName: 'T1', matchId: 'm1', opponentName: 'Bob' },
    ] }} />)
    expect(screen.queryByRole('button', { name: /dismiss|close/i })).not.toBeInTheDocument()
  })

  it('lists an unscored match and deep-links to its tournament page', () => {
    render(<UpNextStrip actions={{ ...EMPTY, unscoredMatches: [
      { tournamentId: 't1', tournamentName: 'Tuesday Ladder', matchId: 'm1', opponentName: 'Bob' },
    ] }} />)

    const strip = screen.getByTestId('up-next-strip')
    expect(strip).toBeInTheDocument()
    const link = screen.getByTestId('up-next-match')
    expect(link).toHaveTextContent('Bob')
    expect(link.closest('a')).toHaveAttribute('href', '/tournament/t1/details')
  })

  it('lists an open poll and deep-links to its group chat', () => {
    render(<UpNextStrip actions={{ ...EMPTY, openPolls: [
      { groupId: 'g1', groupName: 'Tuesday Crew', pollId: 'p1', question: 'Play Saturday?' },
    ] }} />)

    const link = screen.getByTestId('up-next-poll')
    expect(link).toHaveTextContent('Play Saturday?')
    expect(link.closest('a')).toHaveAttribute('href', '/groups/g1')
  })

  it('lists a pending card and deep-links to its group chat', () => {
    render(<UpNextStrip actions={{ ...EMPTY, pendingCards: [
      { groupId: 'g1', groupName: 'Tuesday Crew', cardId: 'c1', action: 'propose_score' },
    ] }} />)

    const link = screen.getByTestId('up-next-card')
    expect(link.closest('a')).toHaveAttribute('href', '/groups/g1')
  })

  it('lists the nearest deadline and deep-links to its tournament page', () => {
    render(<UpNextStrip actions={{ ...EMPTY, nearestDeadline: {
      tournamentId: 't2', tournamentName: 'Weekend Cup', deadline: new Date(Date.now() + 3_600_000).toISOString(),
    } }} />)

    const link = screen.getByTestId('up-next-deadline')
    expect(link).toHaveTextContent('Weekend Cup')
    expect(link.closest('a')).toHaveAttribute('href', '/tournament/t2/details')
  })
})
