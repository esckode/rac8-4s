/**
 * StandingsTable - Virtualized standings display with sorting
 *
 * Uses react-window FixedSizeList for virtualization.
 * Only renders visible rows (~15) + buffer for smooth scrolling.
 * Supports sorting, role-based actions, and responsive design.
 */

import React, { useState, useMemo, useEffect } from 'react'
import { List, useListRef } from 'react-window'
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
  /** Player Personalization P2 — highlights and auto-scrolls to this row. */
  currentPlayerId?: string
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
  currentPlayerId,
}) => {
  const [sortField, setSortField] = useState<SortField>('rank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const listRef = useListRef(null)

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

  // P2 — auto-scroll the viewer's own row into view (~2nd from top so
  // context shows) — highlight + scroll, no sticky pin (scrolling away
  // afterward is free). react-window virtualizes rows, so bringing the
  // target row into the rendered window is done via its own imperative
  // scrollToRow API, not a plain DOM scrollIntoView.
  useEffect(() => {
    if (!currentPlayerId) return
    const index = sortedStandings.findIndex(s => s.participantId === currentPlayerId)
    if (index === -1) return
    listRef.current?.scrollToRow({ index: Math.max(0, index - 1), align: 'start', behavior: 'auto' })
  }, [currentPlayerId, sortedStandings, listRef])

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
    const isYou = currentPlayerId !== undefined && standing.participantId === currentPlayerId

    return (
      <div
        style={style}
        data-testid={isYou ? 'standings-row-you' : 'standings-row'}
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
          ${isYou ? 'bg-[--court-50] border-l-4 border-l-[--court-500]' : isEven ? 'bg-white' : 'bg-[--ink-50]'}
          ${onRowClick ? 'hover:bg-[--court-50] cursor-pointer' : ''}
        `}
      >
        {/* Rank */}
        <div className="w-16 text-center font-semibold text-[--ink-900]">{standing.rank}</div>

        {/* Team Name */}
        <div className="flex-1 font-medium text-[--ink-900]">
          {player?.name || standing.participantId}
          {isYou && <span className="ml-[--s-2] text-xs font-semibold text-[--court-600]">(You)</span>}
        </div>

        {/* Matches */}
        <div className="w-20 text-center text-[--ink-600]">{standing.wins + standing.losses}</div>

        {/* Wins */}
        <div data-testid="standings-wins" className="w-16 text-center text-[--ink-600]">{standing.wins}</div>

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
          listRef={listRef}
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
