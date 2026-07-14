/**
 * S3.1/S3.2 — "You" anchoring (P2): auto-scroll call-site logic.
 *
 * react-window virtualizes rows and doesn't recompute its visible range
 * under jsdom (no real scroll/resize events), so the *outcome* (row
 * rendered) can't be asserted reliably there. This test mocks react-window
 * itself and asserts our code calls its imperative scrollToRow API with
 * the right index — the real virtualization/scrolling is react-window's
 * own, already-tested behavior.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { StandingsTable } from '../StandingsTable'
import type { Standing } from '@shared/types'

jest.mock('../../../state', () => ({
  playerCache: {
    get: jest.fn((playerId: string) => ({ id: playerId, name: `Player ${playerId}` })),
  },
}))
jest.mock('../../../../styles/tokens.css', () => ({}))

const scrollToRow = jest.fn()
jest.mock('react-window', () => ({
  List: ({ rowComponent: RowComponent, rowCount }: any) => (
    <div>
      {Array.from({ length: rowCount }, (_, index) => (
        <RowComponent key={index} index={index} style={{}} />
      ))}
    </div>
  ),
  useListRef: () => ({ current: { scrollToRow } }),
}))

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

describe('StandingsTable — auto-scroll call site', () => {
  beforeEach(() => {
    scrollToRow.mockClear()
  })

  it('calls scrollToRow with the row just above the viewer (so context shows)', () => {
    const standings = createStandings(50)
    render(<StandingsTable standings={standings} currentPlayerId="player_40" />)

    expect(scrollToRow).toHaveBeenCalledWith(
      expect.objectContaining({ index: 39, align: 'start' })
    )
  })

  it('clamps to index 0 when the viewer is the top row', () => {
    const standings = createStandings(10)
    render(<StandingsTable standings={standings} currentPlayerId="player_0" />)

    expect(scrollToRow).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }))
  })

  it('does not call scrollToRow when there is no currentPlayerId', () => {
    const standings = createStandings(10)
    render(<StandingsTable standings={standings} />)

    expect(scrollToRow).not.toHaveBeenCalled()
  })

  it('does not call scrollToRow when the viewer has no row in these standings', () => {
    const standings = createStandings(10)
    render(<StandingsTable standings={standings} currentPlayerId="not_in_list" />)

    expect(scrollToRow).not.toHaveBeenCalled()
  })
})
