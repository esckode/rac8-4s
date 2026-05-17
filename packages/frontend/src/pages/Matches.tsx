import React, { useState, useMemo } from 'react'
import type { Match } from '@shared/types'
import { useAuth } from '../hooks/useAuth'
import { MatchCard } from '../components/shared/MatchCard'
import '../styles/globals.css'

type FilterStatus = 'all' | 'pending' | 'completed'

export const Matches: React.FC = () => {
  const { isAuthenticated, user } = useAuth()
  const [selectedStatus, setSelectedStatus] = useState<FilterStatus>('all')
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)

  if (!isAuthenticated) {
    return (
      <div
        className={`
          text-center
          py-[--s-12]
          rounded-[--r-lg]
          border
          border-dashed
          border-[--border]
          bg-[--ink-50]
        `}
      >
        <p className="text-lg text-[--ink-600]">Sign in to view matches</p>
      </div>
    )
  }

  // TODO: Fetch user's matches across all tournaments from API
  // For now, show empty state
  const userMatches: Match[] = []

  const filteredMatches = useMemo(() => {
    return userMatches.filter((match) => {
      if (selectedStatus === 'all') return true
      return match.status === selectedStatus
    })
  }, [userMatches, selectedStatus])

  const handleMatchClick = (matchId: string) => {
    setSelectedMatchId(matchId)
  }

  const handleSubmitScore = (matchId: string) => {
    // TODO: Open score submission form
  }

  const handleOverride = (matchId: string) => {
    // TODO: Open score override form (organizer only)
  }

  return (
    <div className="space-y-[--s-6]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[--s-4]">
        <div>
          <h2 className="text-2xl font-bold text-[--ink-900]">Your Matches</h2>
          <p className="text-sm text-[--ink-600] mt-[--s-1]">
            {filteredMatches.length > 0
              ? `${filteredMatches.length} ${filteredMatches.length === 1 ? 'match' : 'matches'}`
              : 'No matches scheduled'}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-[--s-3] border-b border-[--border] pb-[--s-3]">
        {(['all', 'pending', 'completed'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status)}
            className={`
              px-[--s-4]
              py-[--s-2]
              text-sm
              font-medium
              transition-colors
              duration-[--duration-normal]
              ${
                selectedStatus === status
                  ? 'text-[--court-600] border-b-2 border-[--court-500] -mb-[--s-3]'
                  : 'text-[--ink-600] hover:text-[--ink-900]'
              }
            `}
          >
            {status === 'all' && 'All'}
            {status === 'pending' && 'Upcoming'}
            {status === 'completed' && 'Completed'}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filteredMatches.length === 0 && (
        <div className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-8] text-center">
          <p className="text-[--ink-600] font-medium">
            {userMatches.length === 0
              ? 'No matches yet. Join a tournament to get started!'
              : `No ${selectedStatus} matches`}
          </p>
        </div>
      )}

      {/* Matches list */}
      {filteredMatches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[--s-4]">
          {filteredMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              userRole="player"
              isLoading={selectedMatchId === match.id}
              onClick={() => handleMatchClick(match.id)}
              onSubmitScore={handleSubmitScore}
              onOverride={handleOverride}
            />
          ))}
        </div>
      )}
    </div>
  )
}
