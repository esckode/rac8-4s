import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { fetchPlayerTournaments, type PlayerTournamentSummary } from '../api/client'
import '../styles/globals.css'

type HubTab = 'standings' | 'matches'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  registration_open: 'Upcoming',
  registration_closed: 'Upcoming',
  group_stage_active: 'Live',
  group_stage_complete: 'Live',
  knockout_active: 'Live',
  tournament_complete: 'Completed',
}

const COPY: Record<HubTab, { title: string; subtitle: string }> = {
  standings: { title: 'My Standings', subtitle: 'Pick a tournament to see its standings' },
  matches: { title: 'My Matches', subtitle: 'Pick a tournament to see its matches' },
}

/**
 * Cross-tournament hub for the /standings and /matches tabs, with a 0/1/2+ rule:
 * - 0 tournaments → empty state
 * - 1 tournament  → go straight to that tournament's {tab} (no picker click)
 * - 2+            → list the tournaments, each linking to its {tab}
 *
 * Real data via GET /player/tournaments (magic-link or registered players).
 */
export const MyTournamentsHub: React.FC<{ tab: HubTab }> = ({ tab }) => {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [tournaments, setTournaments] = useState<PlayerTournamentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPlayerTournaments(token)
      .then(list => {
        if (cancelled) return
        // 1 tournament: skip the picker and go straight to its view.
        if (list.length === 1) {
          navigate(`/tournament/${list[0].id}/${tab}`, { replace: true })
          return
        }
        setTournaments(list)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load your tournaments')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, tab, navigate])

  if (!isAuthenticated) {
    return (
      <div className="text-center py-[--s-12] rounded-[--r-lg] border border-dashed border-[--border] bg-[--ink-50]">
        <p className="text-lg text-[--ink-600]">Sign in to view your tournaments</p>
      </div>
    )
  }

  const copy = COPY[tab]

  return (
    <div className="space-y-[--s-6]" data-testid="my-tournaments">
      <div className="space-y-[--s-1]">
        <h1 className="text-3xl font-bold text-[--ink-900]">{copy.title}</h1>
        <p className="text-[--ink-600]">{copy.subtitle}</p>
      </div>

      {loading && <p className="text-[--ink-600]">Loading your tournaments...</p>}

      {error && (
        <div className="bg-[--rose-50] border border-[--rose-200] rounded-[--r-lg] p-[--s-4] text-[--rose-800]">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && tournaments.length === 0 && (
        <div className="text-center py-[--s-12] rounded-[--r-lg] border border-dashed border-[--border] bg-[--ink-50]">
          <p className="text-lg text-[--ink-600]">No tournaments yet</p>
          <p className="text-sm text-[--ink-500] mt-[--s-2]">Browse available tournaments to register</p>
        </div>
      )}

      {!loading && !error && tournaments.length > 0 && (
        <div className="flex flex-col gap-[--s-3]">
          {tournaments.map(t => (
            <Link
              key={t.id}
              to={`/tournament/${t.id}/${tab}`}
              data-testid="tournament-row"
              className="flex items-center justify-between p-[--s-4] bg-white border border-[--border] rounded-[--r-xl] hover:shadow-md transition-shadow"
            >
              <span className="font-semibold text-[--ink-900]">{t.name}</span>
              <span className="text-xs font-semibold text-[--ink-500] uppercase">
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
