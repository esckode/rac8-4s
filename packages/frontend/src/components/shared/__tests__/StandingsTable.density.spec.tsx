/**
 * S5.3 — StandingsTable table density (P10)
 *
 * `density="compact"` renders a visibly tighter row (less vertical
 * padding) than the default "comfortable" density. Marked with a stable
 * class so callers/tests don't depend on exact spacing values.
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

describe('StandingsTable — density (P10)', () => {
  it('defaults to comfortable density', () => {
    render(<StandingsTable standings={createStandings(3)} />)
    expect(screen.getByTestId('standings-table')).not.toHaveClass('standings-table--compact')
  })

  it('applies a compact class when density="compact"', () => {
    render(<StandingsTable standings={createStandings(3)} density="compact" />)
    expect(screen.getByTestId('standings-table')).toHaveClass('standings-table--compact')
  })
})
