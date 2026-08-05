/**
 * useGroupList — G2.5 / ISSUE-73
 *
 * Fetches the player's groups from GET /player/groups, then keeps each row's
 * unreadCount live from groupUnreadStore instead of the one-time fetch
 * response — group.unread.changed pushes (via usePersonalEventsStream ->
 * refetchGroupUnread) update the store, and this hook re-renders from it.
 *
 * Precedence: the store wins whenever it already holds a nonzero entry for
 * a group — this fetch's own unreadCount is only used to seed a group the
 * store has 0 (or has never seen) for. A group already showing unread
 * elsewhere (an SSE push, an open chat panel) is never clobbered by this
 * fetch's own response, which could be racing a fresher write — see
 * group-unread-state.ts for the full writer list.
 */

import { useEffect, useState } from 'react'
import { groupUnreadStore } from '../state/group-unread-state'

export interface GroupSummary {
  id: string
  name: string
  role: 'owner' | 'member'
  memberCount: number
  assistantEnabled: boolean
  digestEnabled: boolean
  unreadCount: number
}

export interface UseGroupListResult {
  groups: GroupSummary[]
  loading: boolean
  error: string | null
  unauthorized: boolean
  playerNotLinked: boolean
  refetch: () => void
}

const UNAUTHORIZED_MARKER = 'unauthorized'
const PLAYER_NOT_LINKED_MARKER = 'player-not-linked'

export function useGroupList(): UseGroupListResult {
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)
  const [playerNotLinked, setPlayerNotLinked] = useState(false)
  const [tick, setTick] = useState(0)
  // Bumped by the store subscription below to force a re-render when a
  // group's live count changes without a new fetch.
  const [, setStoreVersion] = useState(0)

  // Re-render on any groupUnreadStore change — this is what makes a
  // group.unread.changed push (already written to the store elsewhere)
  // reach the row badge without a refetch.
  useEffect(() => {
    const unsub = groupUnreadStore.subscribe(() => setStoreVersion(v => v + 1))
    return unsub
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setUnauthorized(false)
    setPlayerNotLinked(false)

    const token = localStorage.getItem('auth_token')
    fetch('/player/groups', {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(async res => {
        if (res.status === 401) {
          if (!cancelled) setUnauthorized(true)
          throw new Error(UNAUTHORIZED_MARKER)
        }
        // ISSUE-24: a valid token with no linked player is 403 PLAYER_NOT_LINKED,
        // not 401 — re-authenticating cannot fix it, so it needs its own state.
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}))
          if (body.code === 'PLAYER_NOT_LINKED') {
            if (!cancelled) setPlayerNotLinked(true)
            throw new Error(PLAYER_NOT_LINKED_MARKER)
          }
        }
        if (!res.ok) throw new Error('Failed to load groups')
        return res.json()
      })
      .then((data: { groups: GroupSummary[] }) => {
        if (!cancelled) {
          setGroups(data.groups)
          // Seed only where the store has nothing (0) for this group yet —
          // see the precedence rule in the module doc comment above.
          for (const g of data.groups) {
            if (groupUnreadStore.getGroupUnread(g.id) === 0) {
              groupUnreadStore.setGroupUnread(g.id, g.unreadCount)
            }
          }
        }
      })
      .catch((err: Error) => {
        if (cancelled || err.message === UNAUTHORIZED_MARKER || err.message === PLAYER_NOT_LINKED_MARKER) return
        setError('Failed to load groups')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tick])

  // Always read the live count from the store — this is the read side of
  // the precedence rule (the seed above only ever fills in a 0).
  const liveGroups = groups.map(g => ({ ...g, unreadCount: groupUnreadStore.getGroupUnread(g.id) }))

  return {
    groups: liveGroups,
    loading,
    error,
    unauthorized,
    playerNotLinked,
    // R4: this is a *list* refetch — it re-fetches names/roles/membership,
    // not unread counts. Do NOT wire this to group.unread.changed; that
    // event already has its own path (refetchGroupUnread -> the store ->
    // the subscription above), and calling refetch() there too would
    // double the request per push and re-render the whole list to change
    // one number.
    refetch: () => setTick(t => t + 1),
  }
}
