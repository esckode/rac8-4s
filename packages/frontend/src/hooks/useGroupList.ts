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
}

export interface UseGroupListResult {
  groups: GroupSummary[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useGroupList(): UseGroupListResult {
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const token = localStorage.getItem('auth_token')
    fetch('/player/groups', {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load groups')
        return res.json()
      })
      .then((data: { groups: GroupSummary[] }) => {
        if (!cancelled) {
          setGroups(data.groups)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load groups')
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
    refetch: () => setTick(t => t + 1),
  }
}
