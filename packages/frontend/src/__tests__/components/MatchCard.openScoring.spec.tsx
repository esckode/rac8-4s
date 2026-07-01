/**
 * P3.8 RED — MatchCard open-scoring flag tests
 *
 * openScoring=true: any participant can submit/edit any current-round match.
 * scoredBy field: "Scored by: <name>" shown on completed matches when provided.
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

  it('accepts openScoring prop without crashing', () => {
    render(
      <MatchCard
        match={makeMatch()}
        openScoring
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.getByTestId('match-card')).toBeInTheDocument()
  })

  it('shows submit-score-button when openScoring=true and match is pending', () => {
    render(
      <MatchCard
        match={makeMatch()}
        openScoring
        userRole="player"
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.getByTestId('submit-score-button')).toBeInTheDocument()
  })

  it('shows edit-score-button when openScoring=true and match is completed', () => {
    render(
      <MatchCard
        match={makeMatch({ status: 'completed', score: '11-7, 11-9' })}
        openScoring
        userRole="player"
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.getByTestId('edit-score-button')).toBeInTheDocument()
  })

  it('does NOT show edit-score-button for walkover (terminal) even with openScoring', () => {
    render(
      <MatchCard
        match={makeMatch({ status: 'walkover', score: 'walkover' })}
        openScoring
        userRole="player"
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.queryByTestId('edit-score-button')).toBeNull()
  })

  it('shows "Scored by: <name>" when match.scoredBy is provided', () => {
    render(
      <MatchCard
        match={makeMatch({ status: 'completed', score: '11-7', scoredBy: 'Alice' })}
        openScoring
        userRole="player"
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.getByTestId('scored-by')).toHaveTextContent('Alice')
  })

  it('does NOT show scored-by element when scoredBy is null', () => {
    render(
      <MatchCard
        match={makeMatch({ status: 'completed', score: '11-7', scoredBy: null })}
        openScoring
        userRole="player"
        viewerPlayerId="p999"
        onSubmitScore={onSubmitScore}
      />
    )
    expect(screen.queryByTestId('scored-by')).toBeNull()
  })
})
