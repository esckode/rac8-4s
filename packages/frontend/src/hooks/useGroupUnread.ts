/**
 * useGroupsWithUnread — G2.5 / P0.4 / ISSUE-56
 *
 * Returns the count of groups with unread messages (for the nav badge) —
 * not a total message count. Renamed from useGroupUnread when its return
 * value's meaning changed (ISSUE-56): it used to be a total unread-message
 * count derived from a client-side last-seen diff; it's now the number of
 * groups with unread, read straight off the server's per-group unreadCount.
 *
 * Fetches GET /player/groups on mount + window refocus (matching
 * useNotificationUnread/usePendingActions) and copies each group's
 * server-computed unreadCount into the store — no more diffing against a
 * localStorage last-seen count, which was per-device and reset to
 * "everything unread" on a fresh device/cache (the bug ISSUE-56 fixed).
 * group-chat SSE (useGroupMessages) supplements this while a group's panel
 * happens to be mounted; usePersonalEventsStream (ISSUE-62) supplements it
 * app-wide by calling refetchGroupUnread() (exported below) on every
 * group.unread.changed push — this poll remains the fallback that corrects
 * any gap around a reconnect.
 */

import { useCallback, useEffect, useState } from 'react'
import { groupUnreadStore } from '../state/group-unread-state'

interface GroupSummary {
  id: string
  unreadCount: number
}

// Module-level (not per-mount) so an in-flight request from a prior mount
// can't win a race against a newer one: mount + an immediate refocus can
// both be in flight together, and network responses aren't guaranteed to
// resolve in call order.
let latestRequestId = 0

/**
 * Fetch GET /player/groups and copy each group's server-computed
 * unreadCount into the store. Standalone (not tied to a hook's lifecycle)
 * so usePersonalEventsStream (ISSUE-62) can call it directly on a
 * group.unread.changed push event, the same resync this hook's own
 * mount/focus effect uses.
 */
export function refetchGroupUnread(): void {
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
        groupUnreadStore.setGroupUnread(group.id, group.unreadCount)
      }
    })
    .catch(() => {})
}

export function useGroupsWithUnread(): number {
  const [count, setCount] = useState(() => groupUnreadStore.groupsWithUnread())

  useEffect(() => {
    const unsub = groupUnreadStore.subscribe(() => setCount(groupUnreadStore.groupsWithUnread()))
    return unsub
  }, [])

  const refetch = useCallback(() => {
    refetchGroupUnread()
  }, [])

  useEffect(() => {
    refetch()
    window.addEventListener('focus', refetch)
    return () => window.removeEventListener('focus', refetch)
  }, [refetch])

  return count
}
