import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchOrganizerTournaments } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import '../styles/globals.css'

/**
 * OrganizerDashboard — an organizer's home (/organizer). Lists the organizer's own
 * tournaments (GET /tournaments/organizer) and links each into the management
 * screen (/tournament/:id/manage). Reached via the organizer-only "Organizer
 * Dashboard" nav entry. Tournament *creation* has no UI yet, so no create control
 * is shown (no dead links).
 */

interface OrganizerTournamentRow {
  id: string
  name: string
  sport: string
  status: string
  createdAt: string
}

export const OrganizerDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const permissions = usePermissions('') // tournament-agnostic role check
  const [tournaments, setTournaments] = useState<OrganizerTournamentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !permissions.organizerRole) {
      setLoading(false)
      return
    }

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = localStorage.getItem('auth_token') || ''
        const res = await fetchOrganizerTournaments(token, { offset: 0, limit: 50 })
        if (!cancelled) setTournaments(res.tournaments)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tournaments')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, permissions.organizerRole])

  const openManage = (tournamentId: string) => {
    navigate(`/tournament/${tournamentId}/manage`)
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-[--s-12] rounded-[--r-lg] border border-dashed border-[--border] bg-[--ink-50]">
        <p className="text-lg text-[--ink-600]">Sign in to manage tournaments</p>
        <p className="text-sm text-[--ink-500] mt-[--s-2]">
          Log in to your account to create and organize tournaments
        </p>
      </div>
    )
  }

  if (!permissions.organizerRole) {
    return (
      <div className="text-center py-[--s-12] rounded-[--r-lg] border border-dashed border-[--border] bg-[--ink-50]">
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
      <div className="bg-[--rose-50] border border-[--rose-200] rounded-[--r-lg] p-[--s-4] text-[--rose-800]">
        <p className="font-medium">Error loading tournaments</p>
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-[--s-6]">
      <div className="space-y-[--s-2]">
        <h1 className="text-3xl font-bold text-[--ink-900]">Organizer Dashboard</h1>
        <p className="text-[--ink-600]">Manage your tournaments</p>
      </div>

      {tournaments.length === 0 ? (
        <div
          data-testid="organizer-empty"
          className="text-center py-[--s-12] rounded-[--r-lg] border border-dashed border-[--border] bg-[--ink-50]"
        >
          <p className="text-lg text-[--ink-600]">No tournaments yet</p>
          <p className="text-sm text-[--ink-500] mt-[--s-2]">
            Tournaments you organize will appear here
          </p>
        </div>
      ) : (
        <ul data-testid="organizer-tournament-list" className="space-y-[--s-3]">
          {tournaments.map((t) => (
            <li
              key={t.id}
              data-testid="organizer-tournament-row"
              role="button"
              tabIndex={0}
              onClick={() => openManage(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openManage(t.id)
              }}
              className="flex items-center justify-between gap-[--s-4] bg-white border border-[--border] rounded-[--r-lg] p-[--s-4] cursor-pointer hover:bg-[--ink-50] focus:outline-none focus:ring-2 focus:ring-[--court-400]"
            >
              <div>
                <p className="font-medium text-[--ink-900]">{t.name}</p>
                <p className="text-sm text-[--ink-500]">{t.sport}</p>
              </div>
              <span className="text-sm text-[--ink-600]">{t.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
