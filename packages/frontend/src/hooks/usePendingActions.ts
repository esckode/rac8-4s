/**
 * usePendingActions — Player Personalization P5
 *
 * Feeds the nav tab badges (P5), the up-next strip (P6), and the composer
 * chip (P7) from one caller-scoped read. Fetches on mount + window refocus
 * (the primary mechanism) — SSE only ever supplements this, never replaces
 * it, since group-chat SSE connections are per-conversation and don't exist
 * outside an open chat.
 */
import { useCallback, useEffect, useState } from 'react'

export interface PendingMatch {
  tournamentId: string
  tournamentName: string
  matchId: string
  opponentName: string
}

export interface PendingPoll {
  groupId: string
  groupName: string
  pollId: string
  question: string
}

export interface PendingCard {
  groupId: string
  groupName: string
  cardId: string
  action: string
}

export interface NearestDeadline {
  tournamentId: string
  tournamentName: string
  deadline: string
}

export interface PendingActions {
  unscoredMatches: PendingMatch[]
  openPolls: PendingPoll[]
  pendingCards: PendingCard[]
  nearestDeadline: NearestDeadline | null
}

const EMPTY: PendingActions = { unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null }

export function usePendingActions(): PendingActions {
  const [actions, setActions] = useState<PendingActions>(EMPTY)

  const refetch = useCallback(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    fetch('/api/auth/me/pending-actions', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then((data: PendingActions | null) => {
        if (!data || !Array.isArray(data.unscoredMatches)) return
        setActions(data)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refetch()
    window.addEventListener('focus', refetch)
    return () => window.removeEventListener('focus', refetch)
  }, [refetch])

  return actions
}
