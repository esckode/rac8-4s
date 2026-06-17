/**
 * StandingsTable - Virtualized standings display with sorting
 *
 * Uses react-window FixedSizeList for virtualization.
 * Only renders visible rows (~15) + buffer for smooth scrolling.
 * Supports sorting, role-based actions, and responsive design.
 */

import React, { useState, useMemo } from 'react'
import { List } from 'react-window'
import type { Standing } from '@shared/types'
import { playerCache } from '../../state'
import { Button } from './Button'
import { ErrorBanner } from './ErrorBanner'
import { SkeletonLoader } from './SkeletonLoader'
import '../../styles/globals.css'

export interface StandingsTableProps {
  standings: Standing[]
  isLoading?: boolean
  error?: string | null
  userRole?: 'player' | 'organizer'
  onRowClick?: (playerId: string) => void
  onOverride?: (playerId: string) => void
  onRetry?: () => void
  className?: string
}

type SortField = 'rank' | 'wins' | 'losses' | 'setDiff'
type SortDirection = 'asc' | 'desc'

const StandingsTableComponent: React.FC<StandingsTableProps> = ({
  standings,
  isLoading = false,
  error = null,
  userRole = 'player',
  onRowClick,
  onOverride,
  onRetry,
  className,
}) => {
  const [sortField, setSortField] = useState<SortField>('rank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedStandings = useMemo(() => {
    const sorted = [...standings]
    sorted.sort((a, b) => {
      let aVal: number
      let bVal: number

      switch (sortField) {
        case 'wins':
          aVal = a.wins
          bVal = b.wins
          break
        case 'losses':
          aVal = a.losses
          bVal = b.losses
          break
        case 'setDiff':
          aVal = a.setsWon - a.setsLost
          bVal = b.setsWon - b.setsLost
          break
        case 'rank':
        default:
          aVal = a.rank
          bVal = b.rank
      }

      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
    })

    return sorted
  }, [standings, sortField, sortDirection])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null

    return (
      <svg className="w-4 h-4 inline-block ml-[--s-1]" viewBox="0 0 20 20" fill="currentColor">
        {sortDirection === 'asc' ? (
          <path
            fillRule="evenodd"
            d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M3 16a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zm0-6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z"
          />
        )}
      </svg>
    )
  }

  const HeaderCell = ({ field, label, sortable = true }: { field: SortField; label: string; sortable?: boolean }) => (
    <button
      onClick={() => sortable && handleSort(field)}
      disabled={!sortable}
      className={`
        flex
        items-center
        font-semibold
        text-[--ink-900]
        text-sm
        transition-colors
        duration-[--duration-normal]
        ${sortable ? 'hover:text-[--court-600] cursor-pointer' : 'cursor-default'}
      `}
    >
      {label}
      {sortable && <SortIcon field={field} />}
    </button>
  )

  const RowRenderer = ({ index, style }: { index: number; style: React.CSSProperties; ariaAttributes?: any }) => {
    const standing = sortedStandings[index]
    const player = playerCache.get(standing.participantId)
    const isEven = index % 2 === 0

    return (
      <div
        style={style}
        onClick={() => onRowClick?.(standing.participantId)}
        className={`
          flex
          items-center
          px-[--s-4]
          py-[--s-3]
          border-b
          border-[--border]
          text-sm
          transition-colors
          duration-[--duration-normal]
          ${isEven ? 'bg-white' : 'bg-[--ink-50]'}
          ${onRowClick ? 'hover:bg-[--court-50] cursor-pointer' : ''}
        `}
      >
        {/* Rank */}
        <div className="w-16 text-center font-semibold text-[--ink-900]">{standing.rank}</div>

        {/* Team Name */}
        <div className="flex-1 font-medium text-[--ink-900]">{player?.name || standing.participantId}</div>

        {/* Matches */}
        <div className="w-20 text-center text-[--ink-600]">{standing.wins + standing.losses}</div>

        {/* Wins */}
        <div className="w-16 text-center text-[--ink-600]">{standing.wins}</div>

        {/* Losses */}
        <div className="w-20 text-center text-[--ink-600]">{standing.losses}</div>

        {/* Set Difference */}
        <div className="w-24 text-center text-[--ink-600]">{standing.setsWon - standing.setsLost}</div>

        {/* Actions */}
        {userRole === 'organizer' && (
          <div className="w-24 flex justify-end">
            <Button
              variant="soft"
              size="sm"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                onOverride?.(standing.participantId)
              }}
            >
              Override
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={`bg-white rounded-[--r-lg] border border-[--border] p-[--s-4] ${className}`}>
        <SkeletonLoader count={5} height="40px" className="mb-[--s-3]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${className}`}>
        <ErrorBanner message={error} onDismiss={onRetry} />
      </div>
    )
  }

  if (standings.length === 0) {
    return (
      <div className={`bg-white rounded-[--r-lg] border border-[--border] p-[--s-8] text-center ${className}`}>
        <p className="text-[--ink-600] font-medium">No standings available</p>
      </div>
    )
  }

  return (
    <div data-testid="standings-table" className={`bg-white rounded-[--r-lg] border border-[--border] overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-[--ink-100] px-[--s-4] py-[--s-3] border-b border-[--border] grid grid-cols-auto gap-0 sticky top-0 z-10">
        <div className="w-16 text-center">
          <HeaderCell field="rank" label="Rank" />
        </div>
        <div className="flex-1">
          <HeaderCell field="rank" label="Team" sortable={false} />
        </div>
        <div className="w-20 text-center">
          <HeaderCell field="rank" label="Matches" sortable={false} />
        </div>
        <div className="w-16 text-center">
          <HeaderCell field="wins" label="W" />
        </div>
        <div className="w-20 text-center">
          <HeaderCell field="losses" label="L" />
        </div>
        <div className="w-24 text-center">
          <HeaderCell field="setDiff" label="Set Diff" />
        </div>
        {userRole === 'organizer' && <div className="w-24" />}
      </div>

      {/* Virtualized Body */}
      <div style={{ height: Math.min(sortedStandings.length * 44 + 44, 600), width: '100%' }}>
        <List
          rowCount={sortedStandings.length}
          rowHeight={44}
          rowComponent={RowRenderer as any}
          rowProps={{} as any}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  )
}

export const StandingsTable = React.memo(StandingsTableComponent)
