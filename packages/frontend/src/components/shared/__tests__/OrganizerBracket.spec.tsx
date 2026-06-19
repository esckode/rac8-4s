/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import type { Player } from '@shared/types'
import { MatchNode, RoundLabelNode, OrganizerBracket } from '../OrganizerBracket'
import type { BracketRound } from '../../../types'
import { playerCache } from '../../../state'

// React Flow custom nodes use <Handle>, which needs the provider context.
const wrap = (ui: React.ReactElement) => render(<ReactFlowProvider>{ui}</ReactFlowProvider>)

describe('OrganizerBracket nodes', () => {
  it('MatchNode shows resolved participant names and pending status', () => {
    wrap(<MatchNode {...({ data: { player1: 'Alice', player2: 'Bob', status: 'pending', score: null } } as any)} />)
    expect(screen.getByTestId('match-card')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('MatchNode shows the score for a completed match', () => {
    wrap(<MatchNode {...({ data: { player1: 'Alice', player2: 'Bob', status: 'completed', score: '11-9, 11-7' } } as any)} />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('11-9, 11-7')).toBeInTheDocument()
  })

  it('RoundLabelNode renders the round label', () => {
    wrap(<RoundLabelNode {...({ data: { label: 'Semifinals' } } as any)} />)
    expect(screen.getByTestId('bracket-round')).toHaveTextContent('Semifinals')
  })

  it('OrganizerBracket renders the tree container from rounds', () => {
    playerCache.clear()
    playerCache.set({ id: 'p1', name: 'Alice' } as Player)
    playerCache.set({ id: 'p2', name: 'Bob' } as Player)
    const rounds: BracketRound[] = [
      {
        round: 1,
        matches: [
          // resolved + null slot (→ TBD) and an unresolved id (→ TBD): exercises every nameOf branch
          { id: 'm1', round: 1, position: 0, player1Id: 'p1', player2Id: null, winnerId: null, score: null, status: 'pending' },
          { id: 'm2', round: 1, position: 1, player1Id: 'p2', player2Id: 'unknownX', winnerId: null, score: null, status: 'pending' },
        ],
      },
    ]
    render(<OrganizerBracket rounds={rounds} />)
    expect(screen.getByTestId('bracket-tree')).toBeInTheDocument()
  })
})
