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

export interface PendingActionsSummary {
  unscoredMatches: number
  openPolls: number
  pendingCards: number
}

interface PendingActionsPayload {
  unscoredMatches: unknown[]
  openPolls: unknown[]
  pendingCards: unknown[]
}

const EMPTY: PendingActionsSummary = { unscoredMatches: 0, openPolls: 0, pendingCards: 0 }

export function usePendingActions(): PendingActionsSummary {
  const [summary, setSummary] = useState<PendingActionsSummary>(EMPTY)

  const refetch = useCallback(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    fetch('/api/auth/me/pending-actions', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then((data: PendingActionsPayload | null) => {
        if (!data) return
        setSummary({
          unscoredMatches: data.unscoredMatches.length,
          openPolls: data.openPolls.length,
          pendingCards: data.pendingCards.length,
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refetch()
    window.addEventListener('focus', refetch)
    return () => window.removeEventListener('focus', refetch)
  }, [refetch])

  return summary
}
