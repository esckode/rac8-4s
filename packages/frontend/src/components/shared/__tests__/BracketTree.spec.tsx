/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Player } from '@shared/types'
import { BracketTree } from '../BracketTree'
import type { BracketRound } from '../../../types'
import { playerCache } from '../../../state'

const rounds: BracketRound[] = [
  {
    round: 1,
    matches: [
      { id: 'sf1', round: 1, position: 0, player1Id: 'p1', player2Id: 'p4', winnerId: null, score: null, status: 'pending' },
      { id: 'sf2', round: 1, position: 1, player1Id: 'p2', player2Id: 'p3', winnerId: null, score: null, status: 'pending' },
    ],
  },
  {
    round: 2,
    matches: [
      { id: 'final', round: 2, position: 0, player1Id: null, player2Id: null, winnerId: null, score: null, status: 'pending' },
    ],
  },
]

describe('BracketTree', () => {
  beforeEach(() => {
    playerCache.clear()
    ;(['p1', 'p2', 'p3', 'p4'] as const).forEach((id, i) =>
      playerCache.set({ id, name: `Player ${i + 1}` } as Player)
    )
  })

  it('renders one column per round with human round labels', () => {
    render(<BracketTree rounds={rounds} userRole="organizer" onSubmitScore={jest.fn()} />)

    expect(screen.getByTestId('bracket-tree')).toBeInTheDocument()
    expect(screen.getAllByTestId('bracket-round')).toHaveLength(2)
    expect(screen.getByText('Semifinals')).toBeInTheDocument()
    expect(screen.getByText('Final')).toBeInTheDocument()
  })

  it('resolves participant names from the player cache, not raw IDs', () => {
    render(<BracketTree rounds={rounds} userRole="organizer" onSubmitScore={jest.fn()} />)

    expect(screen.getByText('Player 1')).toBeInTheDocument()
    expect(screen.getByText('Player 4')).toBeInTheDocument()
    expect(screen.queryByText('p1')).not.toBeInTheDocument()
  })

  it('shows TBD for an unfilled slot', () => {
    render(<BracketTree rounds={rounds} userRole="organizer" onSubmitScore={jest.fn()} />)
    // The final has two empty slots
    expect(screen.getAllByText('TBD').length).toBeGreaterThanOrEqual(2)
  })

  it('lets a player trigger score submission on a pending match', () => {
    const onSubmitScore = jest.fn()
    render(<BracketTree rounds={rounds} userRole="player" onSubmitScore={onSubmitScore} />)

    const firstSemi = within(screen.getAllByTestId('match-card')[0])
    fireEvent.click(firstSemi.getByTestId('submit-score-button'))

    expect(onSubmitScore).toHaveBeenCalledWith('sf1')
  })

  it('does not offer score submission to an organizer', () => {
    render(<BracketTree rounds={rounds} userRole="organizer" onSubmitScore={jest.fn()} />)
    expect(screen.queryByTestId('submit-score-button')).not.toBeInTheDocument()
  })

  it('labels deeper brackets (Round N, Quarterfinals, Semifinals, Final)', () => {
    const deep: BracketRound[] = [1, 2, 3, 4].map((round) => ({
      round,
      matches: [
        { id: `r${round}`, round, position: 0, player1Id: null, player2Id: null, winnerId: null, score: null, status: 'pending' },
      ],
    }))
    render(<BracketTree rounds={deep} userRole="organizer" onSubmitScore={jest.fn()} />)
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Quarterfinals')).toBeInTheDocument()
    expect(screen.getByText('Semifinals')).toBeInTheDocument()
    expect(screen.getByText('Final')).toBeInTheDocument()
  })

  it('renders a completed match score and an edit affordance for a player', () => {
    const completed: BracketRound[] = [
      {
        round: 1,
        matches: [
          { id: 'm', round: 1, position: 0, player1Id: 'p1', player2Id: 'unknownId', winnerId: 'p1', score: '11-9, 11-7', status: 'completed' },
        ],
      },
    ]
    const onSubmitScore = jest.fn()
    render(<BracketTree rounds={completed} userRole="player" onSubmitScore={onSubmitScore} />)

    expect(screen.getByText('11-9, 11-7')).toBeInTheDocument()
    // An id with no cache entry falls back to TBD (never a raw id)
    expect(screen.getByText('TBD')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('edit-score-button'))
    expect(onSubmitScore).toHaveBeenCalledWith('m')
  })
})
