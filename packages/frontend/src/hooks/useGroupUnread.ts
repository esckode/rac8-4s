/**
 * useGroupUnread — G2.5 / P0.4
 *
 * Returns the total unread count across all groups (for the nav badge).
 *
 * Fetches GET /player/groups on mount + window refocus (matching
 * useNotificationUnread/usePendingActions), diffing each group's
 * messageCount against the last-seen count recorded in group-unread-state —
 * this is what catches messages sent while the player isn't on that group's
 * page. group-chat SSE (useGroupMessages) only supplements this while a
 * group's panel happens to be mounted; it never replaces the poll, since a
 * persistent app-wide SSE connection breaks Playwright's `networkidle` wait.
 */

import { useCallback, useEffect, useState } from 'react'
import { groupUnreadStore, getLastSeenCount } from '../state/group-unread-state'

interface GroupSummary {
  id: string
  messageCount: number
}

// Module-level (not per-mount) so an in-flight request from a prior mount
// can't win a race against a newer one: mount + an immediate refocus can
// both be in flight together, and network responses aren't guaranteed to
// resolve in call order.
let latestRequestId = 0

export function useGroupUnread(): number {
  const [total, setTotal] = useState(() => groupUnreadStore.total())

  useEffect(() => {
    const unsub = groupUnreadStore.subscribe(setTotal)
    return unsub
  }, [])

  const refetch = useCallback(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    const requestId = ++latestRequestId

    fetch('/player/groups', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : { groups: [] }))
      .then((data: { groups: GroupSummary[] } | undefined) => {
        if (requestId !== latestRequestId) return // superseded by a newer request
        for (const group of data?.groups ?? []) {
          const unread = Math.max(0, group.messageCount - getLastSeenCount(group.id))
          groupUnreadStore.setGroupUnread(group.id, unread)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refetch()
    window.addEventListener('focus', refetch)
    return () => window.removeEventListener('focus', refetch)
  }, [refetch])

  return total
}
