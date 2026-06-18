import React from 'react'
import type { BracketRound } from '../../types'
import { playerCache } from '../../state'
import { Badge } from './Badge'
import { Button } from './Button'
import '../../styles/globals.css'

type RoundMatch = BracketRound['matches'][number]

export interface BracketTreeProps {
  rounds: BracketRound[]
  userRole: 'player' | 'organizer'
  onSubmitScore: (matchId: string) => void
}

/**
 * Label a round by its distance from the final, so a 4-participant bracket reads
 * "Semifinals → Final" and an 8-participant one "Quarterfinals → Semifinals → Final".
 */
function roundLabel(roundsCount: number, indexFromStart: number): string {
  const fromEnd = roundsCount - 1 - indexFromStart
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round ${indexFromStart + 1}`
}

/** Resolve a participant id to a display name; never surface a raw id. */
function nameFor(id: string | null): string {
  if (!id) return 'TBD'
  return playerCache.get(id)?.name || 'TBD'
}

const BracketMatchNode: React.FC<{
  match: RoundMatch
  userRole: 'player' | 'organizer'
  onSubmitScore: (matchId: string) => void
}> = ({ match, userRole, onSubmitScore }) => {
  const completed = match.status === 'completed'
  const canSubmit = userRole === 'player' && match.status === 'pending'
  const canEdit = userRole === 'player' && completed

  return (
    <div
      data-testid="match-card"
      className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-3] w-[--s-56] space-y-[--s-2]"
    >
      <div className="flex items-center justify-between gap-[--s-2]">
        <p className="font-medium text-[--ink-900] truncate">{nameFor(match.player1Id)}</p>
        <span className="text-xs text-[--ink-500]">vs</span>
        <p className="font-medium text-[--ink-900] truncate text-right">{nameFor(match.player2Id)}</p>
      </div>

      <div className="flex items-center justify-between gap-[--s-2]">
        <Badge variant={completed ? 'complete' : 'live'}>{completed ? 'Completed' : 'Pending'}</Badge>
        {completed && match.score && <p className="font-bold text-[--ink-900]">{match.score}</p>}
      </div>

      {canSubmit && (
        <Button
          variant="primary"
          size="sm"
          data-testid="submit-score-button"
          onClick={() => onSubmitScore(match.id)}
          className="w-full"
        >
          Submit Score
        </Button>
      )}
      {canEdit && (
        <Button
          variant="soft"
          size="sm"
          data-testid="edit-score-button"
          onClick={() => onSubmitScore(match.id)}
          className="w-full"
        >
          Edit Score
        </Button>
      )}
    </div>
  )
}

/**
 * Single-elimination bracket as left-to-right round columns with connector lines
 * feeding each round into the next. Scrolls horizontally on narrow screens.
 */
export const BracketTree: React.FC<BracketTreeProps> = ({ rounds, userRole, onSubmitScore }) => {
  return (
    <div data-testid="bracket-tree" className="flex gap-[--s-4] overflow-x-auto pb-[--s-4]">
      {rounds.map((round, i) => {
        const isLastRound = i === rounds.length - 1
        return (
          <div
            key={round.round}
            data-testid="bracket-round"
            className="flex flex-col min-w-[--s-56]"
          >
            <h3 className="text-sm font-semibold text-[--ink-700] mb-[--s-3]">
              {roundLabel(rounds.length, i)}
            </h3>
            <div className="flex flex-col justify-around gap-[--s-6] flex-1">
              {round.matches.map((m) => (
                <div key={m.id} className="relative flex items-center">
                  <BracketMatchNode match={m} userRole={userRole} onSubmitScore={onSubmitScore} />
                  {!isLastRound && (
                    <span
                      aria-hidden
                      className="ml-[--s-2] w-[--s-4] border-t border-[--border]"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
