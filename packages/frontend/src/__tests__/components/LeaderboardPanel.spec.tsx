/**
 * RTL unit tests for LeaderboardPanel — G4.8
 *
 * Tests:
 * - Loading state renders loading indicator
 * - Empty state for individuals
 * - Empty state for pairs
 * - Renders individual rows with correct W/L
 * - Renders pair rows with correct partnership display
 * - Individual rows accept pre-sorted data (wins descending)
 * - Pair rows accept pre-sorted data (wins descending)
 * - Loading prop hides table content
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { LeaderboardPanel, type IndividualRow, type PairRow } from '../../components/LeaderboardPanel'

const twoIndividuals: IndividualRow[] = [
  { playerId: 'Alice', wins: 5, losses: 1 },
  { playerId: 'Bob', wins: 3, losses: 3 },
]

const onePair: PairRow[] = [{ playerA: 'Alice', playerB: 'Bob', wins: 4, losses: 2 }]

describe('LeaderboardPanel', () => {
  it('renders loading state when loading=true', () => {
    render(<LeaderboardPanel individuals={[]} pairs={[]} loading={true} />)
    expect(screen.getByTestId('leaderboard-loading')).toBeInTheDocument()
  })

  it('renders empty state for individuals with no data', () => {
    render(<LeaderboardPanel individuals={[]} pairs={[]} />)
    expect(screen.getByTestId('leaderboard-individual-empty')).toBeInTheDocument()
  })

  it('renders empty state for pairs with no data', () => {
    render(<LeaderboardPanel individuals={[]} pairs={[]} />)
    expect(screen.getByTestId('leaderboard-pairs-empty')).toBeInTheDocument()
  })

  it('renders individual rows with correct W/L', () => {
    render(<LeaderboardPanel individuals={twoIndividuals} pairs={[]} />)
    const rows = screen.getAllByTestId('leaderboard-individual-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Alice')
    expect(rows[0]).toHaveTextContent('5')
    expect(rows[0]).toHaveTextContent('1')
    expect(rows[1]).toHaveTextContent('Bob')
    expect(rows[1]).toHaveTextContent('3')
    expect(rows[1]).toHaveTextContent('3')
  })

  it('renders pair rows with correct partnership display', () => {
    render(<LeaderboardPanel individuals={[]} pairs={onePair} />)
    const rows = screen.getAllByTestId('leaderboard-pair-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Alice + Bob')
    expect(rows[0]).toHaveTextContent('4')
    expect(rows[0]).toHaveTextContent('2')
  })

  it('individual rows render in the order supplied (pre-sorted wins descending)', () => {
    const sorted: IndividualRow[] = [
      { playerId: 'Charlie', wins: 10, losses: 0 },
      { playerId: 'Dave', wins: 2, losses: 8 },
    ]
    render(<LeaderboardPanel individuals={sorted} pairs={[]} />)
    const rows = screen.getAllByTestId('leaderboard-individual-row')
    expect(rows[0]).toHaveTextContent('Charlie')
    expect(rows[1]).toHaveTextContent('Dave')
  })

  it('pair rows render in the order supplied (pre-sorted wins descending)', () => {
    const sorted: PairRow[] = [
      { playerA: 'Eve', playerB: 'Frank', wins: 7, losses: 1 },
      { playerA: 'Grace', playerB: 'Hank', wins: 2, losses: 6 },
    ]
    render(<LeaderboardPanel individuals={[]} pairs={sorted} />)
    const rows = screen.getAllByTestId('leaderboard-pair-row')
    expect(rows[0]).toHaveTextContent('Eve + Frank')
    expect(rows[1]).toHaveTextContent('Grace + Hank')
  })

  it('loading prop hides table content', () => {
    render(<LeaderboardPanel individuals={twoIndividuals} pairs={onePair} loading={true} />)
    expect(screen.queryByTestId('leaderboard-individual-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('leaderboard-pairs-table')).not.toBeInTheDocument()
  })
})
