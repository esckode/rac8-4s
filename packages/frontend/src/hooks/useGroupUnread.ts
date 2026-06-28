/**
 * useGroupUnread — G2.5
 *
 * Returns the total unread count across all groups (for the nav badge).
 */

import { useEffect, useState } from 'react'
import { groupUnreadStore } from '../state/group-unread-state'

export function useGroupUnread(): number {
  const [total, setTotal] = useState(() => groupUnreadStore.total())

  useEffect(() => {
    const unsub = groupUnreadStore.subscribe(setTotal)
    return unsub
  }, [])

  return total
}
