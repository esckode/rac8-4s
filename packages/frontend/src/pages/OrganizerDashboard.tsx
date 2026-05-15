import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Tournament } from '@shared/types'
import { TournamentCard } from '../components/shared'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import '../../styles/globals.css'

export const OrganizerDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const permissions = usePermissions('') // Tournament ID not needed for role check
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !permissions.organizerRole) {
      setLoading(false)
      return
    }

    const loadTournaments = async () => {
      setLoading(true)
      setError(null)
      try {
        // TODO: Replace with actual API call to fetch organizer's tournaments
        // const response = await fetchOrganizerTournaments(user?.id)
        // setTournaments(response.tournaments)

        // Placeholder: mock data for now
        setTournaments([])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load tournaments'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    loadTournaments()
  }, [isAuthenticated, permissions.organizerRole, user?.id])

  const handleTournamentClick = (tournamentId: string) => {
    navigate(`/tournament/${tournamentId}/edit`)
  }

  const handleCreateTournament = () => {
    navigate('/tournaments/create')
  }

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
        <p className="text-lg text-[--ink-600]">Sign in to manage tournaments</p>
        <p className="text-sm text-[--ink-500] mt-[--s-2]">
          Log in to your account to create and organize tournaments
        </p>
      </div>
    )
  }

  if (!permissions.organizerRole) {
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
        <p className="text-lg text-[--ink-600]">Organizer access required</p>
        <p className="text-sm text-[--ink-500] mt-[--s-2]">
          Only tournament organizers can manage tournaments here
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-[--s-12]">
        <p className="text-[--ink-600]">Loading tournaments...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={`
          bg-[--rose-50]
          border
          border-[--rose-200]
          rounded-[--r-lg]
          p-[--s-4]
          text-[--rose-800]
        `}
      >
        <p className="font-medium">Error loading tournaments</p>
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-[--s-6]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[--s-4]">
        <div className="space-y-[--s-2]">
          <h1 className="text-3xl font-bold text-[--ink-900]">Organizer Dashboard</h1>
          <p className="text-[--ink-600]">Create and manage your tournaments</p>
        </div>
        <button
          onClick={handleCreateTournament}
          className={`
            px-[--s-6]
            py-[--s-3]
            bg-[--court-500]
            text-white
            rounded-[--r-lg]
            font-medium
            text-sm
            sm:text-base
            transition-all
            duration-[--duration-normal]
            hover:bg-[--court-600]
            active:scale-95
            focus:outline-none
            focus:ring-2
            focus:ring-[--court-400]
            focus:ring-offset-2
            whitespace-nowrap
          `}
        >
          Create Tournament
        </button>
      </div>

      {tournaments.length === 0 ? (
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
          <p className="text-lg text-[--ink-600]">No tournaments yet</p>
          <p className="text-sm text-[--ink-500] mt-[--s-2]">
            Create your first tournament to get started
          </p>
          <button
            onClick={handleCreateTournament}
            className={`
              mt-[--s-4]
              px-[--s-4]
              py-[--s-2]
              bg-[--court-500]
              text-white
              rounded-[--r-md]
              font-medium
              text-sm
              transition-all
              duration-[--duration-normal]
              hover:bg-[--court-600]
              focus:outline-none
              focus:ring-2
              focus:ring-[--court-400]
              focus:ring-offset-2
            `}
          >
            Create Your First Tournament
          </button>
        </div>
      ) : (
        <div
          className={`
            grid
            grid-cols-1
            md:grid-cols-2
            lg:grid-cols-3
            gap-[--s-4]
          `}
        >
          {tournaments.map((tournament) => (
            <div
              key={tournament.id}
              onClick={() => handleTournamentClick(tournament.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleTournamentClick(tournament.id)
                }
              }}
            >
              <TournamentCard
                tournament={tournament}
                onClick={() => handleTournamentClick(tournament.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
