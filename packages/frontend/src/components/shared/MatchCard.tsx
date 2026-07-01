import React from 'react'
import type { Match } from '@shared/types'
import { playerCache } from '../../state'
import { Badge } from './Badge'
import { LoadingSpinner } from './LoadingSpinner'
import { Button } from './Button'
import '../../styles/globals.css'

export interface MessageOpponentArgs {
  matchId: string
  opponentPlayerId: string
}

export interface MatchCardProps {
  match: Match
  userRole?: 'player' | 'organizer'
  isLoading?: boolean
  onClick?: () => void
  onSubmitScore?: (matchId: string) => void
  onOverride?: (matchId: string) => void
  /** V5.2: called when the player taps "Message opponent" */
  onMessageOpponent?: (args: MessageOpponentArgs) => void
  /** V5.2: the viewer's playerId, used to identify which player is the opponent */
  viewerPlayerId?: string
  /** P3.8: casual mode — any participant can submit/edit any match */
  openScoring?: boolean
  className?: string
}

const MatchCardComponent: React.FC<MatchCardProps> = ({
  match,
  userRole = 'player',
  isLoading = false,
  onClick,
  onSubmitScore,
  onOverride,
  onMessageOpponent,
  viewerPlayerId,
  openScoring = false,
  className,
}) => {
  const player1 = playerCache.get(match.player1Id)
  const player2 = match.player2Id ? playerCache.get(match.player2Id) : null

  const getStatusBadgeVariant = (status: string): 'live' | 'complete' | 'group' | 'knockout' | 'registration' => {
    switch (status) {
      case 'pending':
        return 'live'
      case 'completed':
        return 'complete'
      case 'walkover':
        return 'knockout'
      default:
        return 'group'
    }
  }

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'Pending'
      case 'completed':
        return 'Completed'
      case 'walkover':
        return 'Walkover'
      default:
        return status
    }
  }

  const canSubmitScore = (userRole === 'player' || openScoring) && match.status === 'pending'
  const canEditScore = (userRole === 'player' || openScoring) && match.status === 'completed'
  const canOverride = userRole === 'organizer'

  // V5.2: "Message opponent" is available to players when both sides are known
  // and the onMessageOpponent callback is provided.
  const opponentPlayerId = match.player2Id
    ? viewerPlayerId === match.player1Id
      ? match.player2Id
      : viewerPlayerId === match.player2Id
        ? match.player1Id
        : match.player2Id // default: treat player2 as opponent when viewerPlayerId unset
    : null

  const canMessageOpponent =
    userRole === 'player' &&
    !!onMessageOpponent &&
    !!match.player2Id &&
    !!opponentPlayerId

  return (
    <div
      data-testid="match-card"
      onClick={onClick}
      className={`
        relative
        bg-white
        border
        border-[--border]
        rounded-[--r-lg]
        p-[--s-4]
        transition-all
        duration-[--duration-normal]
        ${onClick ? 'hover:shadow-md hover:border-[--court-300] cursor-pointer' : ''}
        ${className}
      `}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 rounded-[--r-lg] flex items-center justify-center z-50">
          <LoadingSpinner size="md" />
        </div>
      )}

      {/* Player names section */}
      <div className="flex flex-col items-center gap-[--s-2] mb-[--s-4] sm:flex-row sm:justify-between">
        <div className="flex-1 text-center sm:text-left">
          <p className="text-lg font-semibold text-[--ink-900] truncate">
            {player1?.name || match.player1Id}
          </p>
        </div>

        <p className="text-sm text-[--ink-600] font-medium">vs</p>

        <div className="flex-1 text-center sm:text-right">
          <p className="text-lg font-semibold text-[--ink-900] truncate">
            {player2?.name || match.player2Id || 'TBD'}
          </p>
        </div>
      </div>

      {/* Status badge and score */}
      <div className="flex items-center justify-between gap-[--s-3] mb-[--s-4]">
        <Badge variant={getStatusBadgeVariant(match.status)}>
          {getStatusLabel(match.status)}
        </Badge>

        {match.status === 'completed' && match.score && (
          <p className="text-xl font-bold text-[--ink-900]">{match.score}</p>
        )}
      </div>

      {match.scoredBy && (
        <p className="text-xs text-[--ink-500] mb-[--s-2]">
          Scored by: <span data-testid="scored-by">{match.scoredBy}</span>
        </p>
      )}

      {/* Actions section */}
      <div className="flex gap-[--s-2]">
        {canSubmitScore && onSubmitScore && (
          <Button
            variant="primary"
            size="sm"
            data-testid="submit-score-button"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              onSubmitScore(match.id)
            }}
            className="flex-1"
          >
            Submit Score
          </Button>
        )}

        {canEditScore && onSubmitScore && (
          <Button
            variant="soft"
            size="sm"
            data-testid="edit-score-button"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              onSubmitScore(match.id)
            }}
            className="flex-1"
          >
            Edit Score
          </Button>
        )}

        {canOverride && onOverride && (
          <Button
            variant="soft"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              onOverride(match.id)
            }}
            className="flex-1"
          >
            Override
          </Button>
        )}

        {canMessageOpponent && (
          <Button
            variant="soft"
            size="sm"
            data-testid="message-opponent-button"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              onMessageOpponent!({ matchId: match.id, opponentPlayerId: opponentPlayerId! })
            }}
          >
            Message opponent
          </Button>
        )}

        {!canSubmitScore && !canEditScore && !canOverride && !canMessageOpponent && (
          <div className="flex-1" />
        )}
      </div>
    </div>
  )
}

export const MatchCard = React.memo(MatchCardComponent)
