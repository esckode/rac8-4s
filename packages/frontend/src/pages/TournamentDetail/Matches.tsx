import React, { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import type { Match } from '@shared/types'
import { useTournament } from '../../hooks/useTournament'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { MatchCard } from '../../components/shared/MatchCard'
import { ScoreSubmitForm } from '../../components/ScoreSubmitForm'
import '../../styles/globals.css'

type FilterStatus = 'all' | 'pending' | 'completed'

export const Matches: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { isAuthenticated } = useAuth()
  const { matches, isLoading, error, refetch } = useTournament(tournamentId || '')
  const { organizerRole } = usePermissions(tournamentId || '')
  const [selectedStatus, setSelectedStatus] = useState<FilterStatus>('all')
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null)

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

  const allMatches: Match[] = useMemo(() => {
    return [...(matches.group || []), ...(matches.knockout || [])]
  }, [matches])

  const filteredMatches = useMemo(() => {
    return allMatches.filter((match) => {
      if (selectedStatus === 'all') return true
      return match.status === selectedStatus
    })
  }, [allMatches, selectedStatus])

  const userRole = organizerRole ? 'organizer' : 'player'

  const handleMatchClick = (matchId: string) => {
    setSelectedMatchId(matchId)
    // TODO: Open MatchDetails modal (Task 4.6e)
  }

  const handleSubmitScore = (matchId: string) => {
    setScoringMatchId(matchId)
  }

  const scoringMatch = allMatches.find((m) => m.id === scoringMatchId) || null

  const handleOverride = (matchId: string) => {
    // TODO: Open score override form (Task 4.6e)
  }

  if (isLoading && allMatches.length === 0) {
    return (
      <div className="space-y-[--s-6]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[--s-4]">
          <div>
            <h2 className="text-2xl font-bold text-[--ink-900]">Matches</h2>
            <p className="text-sm text-[--ink-600] mt-[--s-1]">Loading matches...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-[--s-6]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[--s-4]">
        <div>
          <h2 className="text-2xl font-bold text-[--ink-900]">Matches</h2>
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

      {/* Error state */}
      {error && (
        <div className="bg-[--rose-50] border border-[--rose-200] rounded-[--r-lg] p-[--s-4] text-[--rose-800]">
          <p className="font-medium">Failed to load matches</p>
          <p className="text-sm mt-[--s-2]">{error.message}</p>
          <button
            onClick={refetch}
            className="text-sm text-[--rose-700] hover:text-[--rose-900] mt-[--s-3] underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!error && filteredMatches.length === 0 && (
        <div className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-8] text-center">
          <p className="text-[--ink-600] font-medium">
            {allMatches.length === 0 ? 'No matches scheduled yet' : `No ${selectedStatus} matches`}
          </p>
        </div>
      )}

      {/* Matches list */}
      {!error && filteredMatches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[--s-4]">
          {filteredMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              userRole={userRole}
              isLoading={selectedMatchId === match.id && isLoading}
              onClick={() => handleMatchClick(match.id)}
              onSubmitScore={handleSubmitScore}
              onOverride={handleOverride}
            />
          ))}
        </div>
      )}

      {/* Score submission / edit form */}
      {scoringMatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-[--s-4]"
          onClick={() => setScoringMatchId(null)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <ScoreSubmitForm
              tournamentId={tournamentId || ''}
              match={scoringMatch}
              onSuccess={() => {
                setScoringMatchId(null)
                refetch()
              }}
              onClose={() => setScoringMatchId(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
