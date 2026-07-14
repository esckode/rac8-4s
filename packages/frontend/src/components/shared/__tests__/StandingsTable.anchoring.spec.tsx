/**
 * S3.1/S3.2 — "You" anchoring in standings (P2)
 *
 * The viewer's own row gets a distinct data-testid + highlight, and the
 * table auto-scrolls it into view on mount/update.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { StandingsTable } from '../StandingsTable'
import type { Standing } from '@shared/types'

jest.mock('../../../state', () => ({
  playerCache: {
    get: jest.fn((playerId: string) => ({ id: playerId, name: `Player ${playerId}` })),
  },
}))
jest.mock('../../../../styles/tokens.css', () => ({}))

function createStandings(count: number): Standing[] {
  return Array.from({ length: count }, (_, i) => ({
    participantId: `player_${i}`,
    rank: i + 1,
    wins: Math.max(0, count - i),
    losses: i,
    setsWon: Math.max(0, count * 2 - i * 2),
    setsLost: i,
  }))
}

describe('StandingsTable — viewer anchoring', () => {
  it('marks the viewer\'s own row with data-testid="standings-row-you"', () => {
    const standings = createStandings(5)
    render(<StandingsTable standings={standings} currentPlayerId="player_2" />)

    expect(screen.getByTestId('standings-row-you')).toBeInTheDocument()
  })

  it('shows a "you" marker on the viewer\'s row', () => {
    const standings = createStandings(5)
    render(<StandingsTable standings={standings} currentPlayerId="player_2" />)

    const row = screen.getByTestId('standings-row-you')
    expect(row).toHaveTextContent(/you/i)
  })

  it('does not mark any row when currentPlayerId is not provided', () => {
    const standings = createStandings(5)
    render(<StandingsTable standings={standings} />)

    expect(screen.queryByTestId('standings-row-you')).not.toBeInTheDocument()
  })

  it('does not throw when the viewer has no row in these standings', () => {
    const standings = createStandings(5)
    expect(() => {
      render(<StandingsTable standings={standings} currentPlayerId="not_in_list" />)
    }).not.toThrow()
    expect(screen.queryByTestId('standings-row-you')).not.toBeInTheDocument()
  })
})
