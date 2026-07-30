import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useGroupList } from '../hooks/useGroupList'
import { fetchPlayerTournaments, fetchPlayerSnapshot, type PlayerTournamentSummary, type PlayerSnapshot } from '../api/client'
import { useOfflineSnapshot } from '../pwa/OfflineSnapshotContext'
import { SnapshotUpdatedAt } from '../pwa/SnapshotUpdatedAt'
import { CreateGroupCta } from './MyGroups'
import '../styles/globals.css'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  registration_open: 'Upcoming',
  registration_closed: 'Upcoming',
  group_stage_active: 'Live',
  group_stage_complete: 'Live',
  knockout_active: 'Live',
  tournament_complete: 'Completed',
}

/**
 * Play hub — ISSUE-28. Replaces MyTournamentsHub as the nav destination
 * (which stood in for both /standings and /matches, discarding the
 * distinction one tap later). Answers "when and where do I play next" up
 * front: next match, your tournaments (0/1/2+ list, no auto-redirect —
 * with a next-match card there is now something worth showing even for a
 * single tournament), then recent results.
 */
export const PlayHub: React.FC = () => {
  const { isAuthenticated, isGuest } = useAuth()
  const { updatedAtFor } = useOfflineSnapshot()
  const { groups, loading: groupsLoading } = useGroupList()
  const [tournaments, setTournaments] = useState<PlayerTournamentSummary[]>([])
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null)
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
    Promise.all([fetchPlayerTournaments(token), fetchPlayerSnapshot(token)])
      .then(([tournamentList, snapshotData]) => {
        if (cancelled) return
        setTournaments(tournamentList)
        setSnapshot(snapshotData)
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
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="text-center py-(--s-12) rounded-(--r-lg) border border-dashed border-(--border) bg-(--ink-50)">
        <p className="text-lg text-(--ink-600)">Sign in to view your tournaments</p>
      </div>
    )
  }

  const hasGroups = groups.length > 0

  return (
    <div className="space-y-(--s-6)" data-testid="my-tournaments">
      <div className="space-y-(--s-1)">
        <h1 className="text-3xl font-bold text-(--ink-900)">Play</h1>
        <SnapshotUpdatedAt updatedAt={updatedAtFor('/player/tournaments')} />
      </div>

      {isGuest && (
        <div
          data-testid="guest-upgrade-cta"
          className="p-(--s-4) bg-(--ink-50) border border-(--border) rounded-(--r-lg)"
        >
          <Link to="/signup" className="text-sm font-medium text-(--court-600) underline">
            Create a password to save your account
          </Link>
        </div>
      )}

      {loading && <p className="text-(--ink-600)">Loading your tournaments...</p>}

      {error && (
        <div className="bg-(--rose-50) border border-(--rose-200) rounded-(--r-lg) p-(--s-4) text-(--rose-800)">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && snapshot?.nextMatch && (
        <div
          data-testid="next-match-card"
          className="p-(--s-4) bg-white border border-(--border) rounded-(--r-xl) shadow-sm"
        >
          <p className="text-xs font-semibold text-(--ink-500) uppercase tracking-wide">Next match</p>
          <p className="text-lg font-semibold text-(--ink-900) mt-1">vs {snapshot.nextMatch.opponentName}</p>
          <p className="text-sm text-(--ink-600)">{snapshot.nextMatch.tournamentName}</p>
        </div>
      )}

      {!loading && !error && tournaments.length === 0 && !groupsLoading && !hasGroups && (
        <div
          data-testid="empty-state"
          className="text-center py-(--s-12) rounded-(--r-lg) border border-dashed border-(--border) bg-(--ink-50)"
        >
          <p className="text-lg text-(--ink-600)">Create a group to start playing</p>
          <div className="mt-(--s-3) max-w-xs mx-auto">
            <CreateGroupCta onCreated={() => window.location.reload()} />
          </div>
        </div>
      )}

      {!loading && !error && tournaments.length === 0 && !groupsLoading && hasGroups && (
        <div
          data-testid="empty-state"
          className="text-center py-(--s-12) rounded-(--r-lg) border border-dashed border-(--border) bg-(--ink-50)"
        >
          <Link
            to={`/groups/${groups[0].id}`}
            className="text-lg font-medium text-(--court-600) underline"
          >
            No games yet — start a poll in your group
          </Link>
        </div>
      )}

      {!loading && !error && tournaments.length > 0 && (
        <div className="space-y-(--s-2)">
          <p className="text-xs font-semibold text-(--ink-500) uppercase tracking-wide">Your tournaments</p>
          <div className="flex flex-col gap-(--s-3)">
            {tournaments.map(t => (
              <Link
                key={t.id}
                to={`/tournament/${t.id}/standings`}
                data-testid="tournament-row"
                className="flex items-center justify-between p-(--s-4) bg-white border border-(--border) rounded-(--r-xl) hover:shadow-md transition-shadow"
              >
                <span className="font-semibold text-(--ink-900)">{t.name}</span>
                <span className="text-xs font-semibold text-(--ink-500) uppercase">
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && snapshot && snapshot.lastResults.length > 0 && (
        <div className="space-y-(--s-2)">
          <p className="text-xs font-semibold text-(--ink-500) uppercase tracking-wide">Recent results</p>
          <div className="flex flex-col gap-(--s-2)">
            {snapshot.lastResults.map((r, i) => (
              <div
                key={i}
                data-testid="recent-result-row"
                className="flex items-center justify-between p-(--s-3) bg-white border border-(--border) rounded-(--r-lg)"
              >
                <span className="text-sm text-(--ink-900)">
                  {r.won ? 'W' : 'L'} vs {r.opponentName}
                </span>
                <span className="text-xs text-(--ink-500)">{r.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
