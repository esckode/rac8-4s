/**
 * S4.6 — Personalized empty state on /browse (P8)
 *
 * When there are no tournaments to show AND the player has pending
 * items (P5), the empty state names them instead of a generic message
 * ("settled by extension of P5-P7 patterns", design 2026-07-13).
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowseTournaments } from '../BrowseTournaments'

let mockPendingActions: {
  unscoredMatches: unknown[]
  openPolls: unknown[]
  pendingCards: unknown[]
  nearestDeadline: unknown
} = { unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null }

jest.mock('../../hooks/usePendingActions', () => ({
  usePendingActions: () => mockPendingActions,
}))

function mockEmptyTournaments() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ tournaments: [] }),
  } as unknown as Response)
}

describe('BrowseTournaments — personalized empty state (P8)', () => {
  beforeEach(() => {
    mockPendingActions = { unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null }
  })

  it('shows the generic empty state when nothing is pending', async () => {
    mockEmptyTournaments()
    render(<BrowseTournaments />)
    await waitFor(() => expect(screen.getByText('No tournaments available')).toBeInTheDocument())
  })

  it('shows a personalized empty state naming pending items', async () => {
    mockPendingActions.unscoredMatches = [
      { tournamentId: 't1', tournamentName: 'T1', matchId: 'm1', opponentName: 'Alice' },
    ]
    mockEmptyTournaments()
    render(<BrowseTournaments />)
    await waitFor(() => {
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument()
      expect(screen.getByText(/1 match/i)).toBeInTheDocument()
    })
    expect(screen.queryByText('No tournaments available')).not.toBeInTheDocument()
  })
})
