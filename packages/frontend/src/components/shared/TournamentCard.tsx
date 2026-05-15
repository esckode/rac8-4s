import React from 'react'
import type { Tournament } from '@shared/types'
import { Badge } from './Badge'
import '../../../styles/tokens.css'

export interface TournamentCardProps {
  tournament: Tournament
  meta?: string
  onClick?: () => void
  className?: string
}

export const TournamentCard: React.FC<TournamentCardProps> = ({
  tournament,
  meta,
  onClick,
  className,
}) => {
  const getPhaseVariant = (status: string): 'group' | 'knockout' | 'live' | 'registration' | 'complete' => {
    if (status.includes('group')) return 'group'
    if (status.includes('knockout')) return 'knockout'
    return 'live'
  }

  const getPhaseLabel = (status: string): string => {
    if (status.includes('group')) {
      if (status.includes('complete')) return 'Group Stage Complete'
      return 'Group Stage'
    }
    if (status.includes('knockout')) {
      if (status.includes('active')) return 'Knockout Active'
      return 'Knockout'
    }
    if (status.includes('registration')) {
      if (status.includes('closed')) return 'Registration Closed'
      return 'Registration Open'
    }
    if (status.includes('complete')) return 'Tournament Complete'
    return 'Draft'
  }

  const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div
      onClick={onClick}
      className={`
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
      {/* Header: Title and Phase Badge */}
      <div className="flex items-start justify-between gap-[--s-3] mb-[--s-3]">
        <h3 className="text-lg font-bold text-[--ink-900] flex-1 line-clamp-2">
          {tournament.name}
        </h3>
        <Badge variant={getPhaseVariant(tournament.status)}>
          {getPhaseLabel(tournament.status)}
        </Badge>
      </div>

      {/* Sport and Meta */}
      <div className="flex items-center gap-[--s-2] mb-[--s-4]">
        <p className="text-sm text-[--ink-600]">
          {tournament.sport}
          {tournament.matchFormat && ` • ${tournament.matchFormat}`}
        </p>
      </div>

      {/* Meta information */}
      {meta && (
        <p className="text-sm font-medium text-[--ink-700] mb-[--s-3]">
          {meta}
        </p>
      )}

      {/* Dates */}
      <div className="space-y-[--s-2] text-xs text-[--ink-600]">
        {tournament.registrationDeadline && (
          <p>
            Registration:{' '}
            <span className="font-medium text-[--ink-700]">
              {formatDate(tournament.registrationDeadline)}
            </span>
          </p>
        )}
        {tournament.groupStageDeadline && (
          <p>
            Group Stage:{' '}
            <span className="font-medium text-[--ink-700]">
              {formatDate(tournament.groupStageDeadline)}
            </span>
          </p>
        )}
        {tournament.knockoutStageDeadline && (
          <p>
            Knockout:{' '}
            <span className="font-medium text-[--ink-700]">
              {formatDate(tournament.knockoutStageDeadline)}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
