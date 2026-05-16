import React from 'react'
import type { Match } from '@shared/types'
import { playerCache } from '../../state'
import { Badge } from './Badge'
import { LoadingSpinner } from './LoadingSpinner'
import { Button } from './Button'
import '../../../styles/globals.css'

export interface MatchCardProps {
  match: Match
  userRole?: 'player' | 'organizer'
  isLoading?: boolean
  onClick?: () => void
  onSubmitScore?: (matchId: string) => void
  onOverride?: (matchId: string) => void
  className?: string
}

const MatchCardComponent: React.FC<MatchCardProps> = ({
  match,
  userRole = 'player',
  isLoading = false,
  onClick,
  onSubmitScore,
  onOverride,
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

  const canSubmitScore = userRole === 'player' && match.status === 'pending'
  const canOverride = userRole === 'organizer'

  return (
    <div
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

      {/* Actions section */}
      <div className="flex gap-[--s-2]">
        {canSubmitScore && onSubmitScore && (
          <Button
            variant="primary"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              onSubmitScore(match.id)
            }}
            className="flex-1"
          >
            Submit Score
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

        {!canSubmitScore && !canOverride && (
          <div className="flex-1" />
        )}
      </div>
    </div>
  )
}

export const MatchCard = React.memo(MatchCardComponent)
