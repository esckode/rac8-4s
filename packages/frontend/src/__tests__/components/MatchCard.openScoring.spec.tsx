/**
 * P3.8 RED — MatchCard open-scoring flag tests
 *
 * When openScoring=true, any participant (not just match participants) can
 * submit/edit a match score. The scored-by name is shown when provided.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { MatchCard } from '../../components/shared/MatchCard'
import type { Match } from '@shared/types'

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match_1',
    tournamentId: 'tour_1',
    player1Id: 'p1',
    player2Id: 'p2',
    status: 'pending' as const,
    ...overrides,
  }
}

const onSubmitScore = jest.fn()

describe('MatchCard — openScoring flag (P3.8)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows submit-score button when openScoring=true even for non-participant viewer', () => {
    render(
      <MatchCard
        match={makeMatch()}
        openScoring
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.getByTestId('submit-score-btn')).toBeInTheDocument()
  })

  it('shows edit-score button when openScoring=true and match is completed', () => {
    render(
      <MatchCard
        match={makeMatch({ status: 'completed', score: '11-7, 11-9' })}
        openScoring
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.getByTestId('edit-score-btn')).toBeInTheDocument()
  })

  it('does NOT show edit-score button in open-scoring mode for walkover (terminal)', () => {
    render(
      <MatchCard
        match={makeMatch({ status: 'walkover', score: 'walkover' })}
        openScoring
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.queryByTestId('edit-score-btn')).toBeNull()
  })

  it('shows "Scored by: <name>" when scoredBy is provided', () => {
    render(
      <MatchCard
        match={makeMatch({ status: 'completed', score: '11-7', scoredBy: 'Alice' })}
        openScoring
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.getByTestId('scored-by')).toHaveTextContent('Alice')
  })

  it('does NOT show scored-by when scoredBy is null', () => {
    render(
      <MatchCard
        match={makeMatch({ status: 'completed', score: '11-7', scoredBy: null })}
        openScoring
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.queryByTestId('scored-by')).toBeNull()
  })

  it('standard non-open mode: non-participant cannot submit score', () => {
    render(
      <MatchCard
        match={makeMatch()}
        openScoring={false}
        viewerPlayerId="p999"
        userRole="player"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.queryByTestId('submit-score-btn')).toBeNull()
  })
})
