/**
 * useNotificationUnread — P2.3
 *
 * Returns the unread count for the player's personal notification thread.
 * Fetches once on mount; re-exported for badge display.
 */
import { useEffect, useState } from 'react'

export function useNotificationUnread(): number {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    fetch('/player/notifications/unread', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { unread: 0 })
      .then((data: { unread: number }) => setUnread(data.unread))
      .catch(() => {})
  }, [])

  return unread
}
