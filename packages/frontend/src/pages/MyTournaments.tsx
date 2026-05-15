import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Tournament } from '@shared/types'
import { TournamentCard } from '../components/shared'
import { useAuth } from '../hooks/useAuth'
import '../../styles/tokens.css'

type TournamentStatus = 'active' | 'upcoming' | 'completed'

interface GroupedTournaments {
  active: Tournament[]
  upcoming: Tournament[]
  completed: Tournament[]
}

export const MyTournaments: React.FC = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const [tournaments, setTournaments] = useState<GroupedTournaments>({
    active: [],
    upcoming: [],
    completed: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }

    const loadTournaments = async () => {
      setLoading(true)
      setError(null)
      try {
        // TODO: Replace with actual API call to fetch user's tournaments
        // const response = await fetchUserTournaments(user?.id)
        // const grouped = groupTournamentsByStatus(response.tournaments)
        // setTournaments(grouped)

        // Placeholder: mock data for now
        setTournaments({
          active: [],
          upcoming: [],
          completed: [],
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load tournaments'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    loadTournaments()
  }, [isAuthenticated, user?.id])

  const handleTournamentClick = (tournamentId: string) => {
    navigate(`/tournament/${tournamentId}`)
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
        <p className="text-lg text-[--ink-600]">Sign in to view your tournaments</p>
        <p className="text-sm text-[--ink-500] mt-[--s-2]">
          Log in to see tournaments you're registered for
        </p>
      </div>
    )
  }

  const allTournaments = [
    ...tournaments.active,
    ...tournaments.upcoming,
    ...tournaments.completed,
  ]

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


  const TournamentSection = ({
    title,
    items,
  }: {
    title: string
    items: Tournament[]
  }) => {
    if (items.length === 0) return null

    return (
      <div className="space-y-[--s-3]">
        <h2 className="text-xl font-bold text-[--ink-900]">{title}</h2>
        <div
          className={`
            grid
            grid-cols-1
            md:grid-cols-2
            lg:grid-cols-3
            gap-[--s-4]
          `}
        >
          {items.map((tournament) => (
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
      </div>
    )
  }

  return (
    <div className="space-y-[--s-6]">
      <div className="space-y-[--s-2]">
        <h1 className="text-3xl font-bold text-[--ink-900]">My Tournaments</h1>
        <p className="text-[--ink-600]">
          Tournaments you're registered for or organizing
        </p>
      </div>

      {allTournaments.length === 0 ? (
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
            Browse available tournaments to register
          </p>
        </div>
      ) : (
        <div className="space-y-[--s-8]">
          <TournamentSection title="Active Tournaments" items={tournaments.active} />
          <TournamentSection title="Upcoming Tournaments" items={tournaments.upcoming} />
          <TournamentSection title="Completed Tournaments" items={tournaments.completed} />
        </div>
      )}
    </div>
  )
}
