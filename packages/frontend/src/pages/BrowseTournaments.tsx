import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Tournament } from '@shared/types'
import { TournamentCard } from '../components/shared'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { usePrefetch } from '../hooks/usePrefetch'
import { fetchPublicTournaments } from '../api/client'
import '../../styles/globals.css'

// Wrapper component that prefetches tournament data on hover
interface TournamentCardWrapperProps {
  tournament: Tournament
  onClick: () => void
}

const TournamentCardWrapper: React.FC<TournamentCardWrapperProps> = ({ tournament, onClick }) => {
  const { handleMouseEnter, handleFocus } = usePrefetch(tournament.id)

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick()
        }
      }}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
    >
      <TournamentCard tournament={tournament} onClick={onClick} />
    </div>
  )
}

export const BrowseTournaments: React.FC = () => {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const { items: tournaments, hasMore, loadMore, isLoading } = useInfiniteScroll(
    async (offset, limit) => {
      setError(null)
      try {
        const response = await fetchPublicTournaments({ offset, limit })
        return response.tournaments.map(
          (t) =>
            ({
              ...t,
              creatorId: '',
              groupStageDeadline: t.registrationDeadline,
              knockoutStageDeadline: t.registrationDeadline,
              createdAt: new Date(),
              updatedAt: new Date(),
              description: '',
            }) as unknown as Tournament
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load tournaments'
        setError(message)
        throw err
      }
    },
    20
  )

  useEffect(() => {
    loadMore()
  }, [])

  const handleTournamentClick = (tournamentId: string) => {
    navigate(`/tournament/${tournamentId}`)
  }

  return (
    <div className="space-y-[--s-6]">
      <div className="space-y-[--s-2]">
        <h1 className="text-3xl font-bold text-[--ink-900]">Browse Tournaments</h1>
        <p className="text-[--ink-600]">
          Discover and join pickleball tournaments in your area
        </p>
      </div>

      {error && (
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
      )}

      {tournaments.length === 0 && !isLoading && !error && (
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
          <p className="text-lg text-[--ink-600]">No tournaments found</p>
          <p className="text-sm text-[--ink-500] mt-[--s-2]">
            Check back soon for new tournaments
          </p>
        </div>
      )}

      {tournaments.length > 0 && (
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
            <TournamentCardWrapper
              key={tournament.id}
              tournament={tournament}
              onClick={() => handleTournamentClick(tournament.id)}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-[--s-6]">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className={`
              px-[--s-6]
              py-[--s-3]
              bg-[--court-500]
              text-white
              rounded-[--r-lg]
              font-medium
              transition-all
              duration-[--duration-normal]
              ${
                isLoading
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-[--court-600] active:scale-95'
              }
              focus:outline-none
              focus:ring-2
              focus:ring-[--court-400]
              focus:ring-offset-2
            `}
          >
            {isLoading ? 'Loading...' : 'Load More Tournaments'}
          </button>
        </div>
      )}

      {tournaments.length > 0 && !hasMore && (
        <div className="text-center py-[--s-6]">
          <p className="text-[--ink-600]">
            You've reached the end of the tournament list
          </p>
        </div>
      )}
    </div>
  )
}
