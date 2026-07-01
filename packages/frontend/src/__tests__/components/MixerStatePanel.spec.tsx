/**
 * P3.8 RED — MixerStatePanel unit tests
 *
 * MixerStatePanel shows players sitting out the current round.
 * The sitting-out list is: roster names - names of players in current-round matches.
 *
 * Props:
 *   rosterNames: string[]       — all registered players (by name)
 *   activePlayerIds: string[]   — player IDs currently in the round's matches
 *   rosterById: Record<string, string>  — playerId → name mapping
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { MixerStatePanel, type MixerStatePanelProps } from '../../components/MixerStatePanel'

function makeProps(overrides: Partial<MixerStatePanelProps> = {}): MixerStatePanelProps {
  return {
    rosterById: {
      p1: 'Alice',
      p2: 'Bob',
      p3: 'Carol',
      p4: 'Dan',
    },
    activePlayerIds: ['p1', 'p2'],
    ...overrides,
  }
}

describe('MixerStatePanel', () => {
  it('renders the panel container', () => {
    render(<MixerStatePanel {...makeProps()} />)
    expect(screen.getByTestId('mixer-state-panel')).toBeInTheDocument()
  })

  it('shows sitting-out players (roster - active)', () => {
    render(<MixerStatePanel {...makeProps()} />)
    expect(screen.getByTestId('sitting-out-list')).toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
    expect(screen.getByText('Dan')).toBeInTheDocument()
  })

  it('does NOT show active players in sitting-out list', () => {
    render(<MixerStatePanel {...makeProps()} />)
    const list = screen.getByTestId('sitting-out-list')
    expect(list).not.toHaveTextContent('Alice')
    expect(list).not.toHaveTextContent('Bob')
  })

  it('shows "Everyone is playing" when no one is sitting out', () => {
    render(
      <MixerStatePanel
        {...makeProps({ activePlayerIds: ['p1', 'p2', 'p3', 'p4'] })}
      />
    )
    expect(screen.getByTestId('mixer-all-active')).toBeInTheDocument()
    expect(screen.queryByTestId('sitting-out-list')).toBeNull()
  })

  it('handles empty roster gracefully', () => {
    render(<MixerStatePanel rosterById={{}} activePlayerIds={[]} />)
    expect(screen.getByTestId('mixer-state-panel')).toBeInTheDocument()
    expect(screen.getByTestId('mixer-all-active')).toBeInTheDocument()
  })

  it('handles unknown activePlayerIds gracefully (not in roster)', () => {
    render(<MixerStatePanel {...makeProps({ activePlayerIds: ['unknown_id'] })} />)
    // All roster players are sitting out (unknown is not in roster)
    const list = screen.getByTestId('sitting-out-list')
    expect(list).toHaveTextContent('Alice')
    expect(list).toHaveTextContent('Bob')
    expect(list).toHaveTextContent('Carol')
    expect(list).toHaveTextContent('Dan')
  })
})
