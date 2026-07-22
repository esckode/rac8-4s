/**
 * useGroupList — G2.5
 *
 * Fetches the player's groups from GET /player/groups.
 */

import { useEffect, useState } from 'react'

export interface GroupSummary {
  id: string
  name: string
  role: 'owner' | 'member'
  memberCount: number
  assistantEnabled: boolean
  digestEnabled: boolean
}

export interface UseGroupListResult {
  groups: GroupSummary[]
  loading: boolean
  error: string | null
  unauthorized: boolean
  refetch: () => void
}

const UNAUTHORIZED_MARKER = 'unauthorized'

export function useGroupList(): UseGroupListResult {
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setUnauthorized(false)

    const token = localStorage.getItem('auth_token')
    fetch('/player/groups', {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(res => {
        if (res.status === 401) {
          if (!cancelled) setUnauthorized(true)
          throw new Error(UNAUTHORIZED_MARKER)
        }
        if (!res.ok) throw new Error('Failed to load groups')
        return res.json()
      })
      .then((data: { groups: GroupSummary[] }) => {
        if (!cancelled) {
          setGroups(data.groups)
        }
      })
      .catch((err: Error) => {
        if (cancelled || err.message === UNAUTHORIZED_MARKER) return
        setError('Failed to load groups')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tick])

  return {
    groups,
    loading,
    error,
    unauthorized,
    refetch: () => setTick(t => t + 1),
  }
}
