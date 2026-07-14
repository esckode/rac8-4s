import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTournament } from '../../hooks/useTournament'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { StandingsTable } from '../../components/shared/StandingsTable'
import '../../styles/globals.css'

export const Standings: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { isAuthenticated, user } = useAuth()
  const { standings, isLoading, error, refetch } = useTournament(tournamentId || '')
  const { organizerRole } = usePermissions(tournamentId || '')
  const [overrideInProgress, setOverrideInProgress] = useState(false)

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
        <p className="text-lg text-[--ink-600]">Sign in to view standings</p>
      </div>
    )
  }

  const handleOverride = (playerId: string) => {
    setOverrideInProgress(true)
    // TODO: Implement score override modal (Task 4.6e)
    setTimeout(() => setOverrideInProgress(false), 500)
  }

  const userRole = organizerRole ? 'organizer' : 'player'

  return (
    <div className="space-y-[--s-6]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[--s-4]">
        <div>
          <h2 className="text-2xl font-bold text-[--ink-900]">Standings</h2>
          <p className="text-sm text-[--ink-600] mt-[--s-1]">
            {standings.length > 0
              ? `${standings.length} ${standings.length === 1 ? 'player' : 'players'} registered`
              : 'Waiting for registrations'}
          </p>
        </div>
      </div>

      <StandingsTable
        standings={standings}
        isLoading={isLoading}
        error={error?.message || null}
        userRole={userRole}
        onOverride={organizerRole ? handleOverride : undefined}
        onRetry={refetch}
        currentPlayerId={user?.playerId ?? undefined}
      />

      {overrideInProgress && (
        <div className="text-center text-sm text-[--ink-600]">
          Override in progress...
        </div>
      )}
    </div>
  )
}
