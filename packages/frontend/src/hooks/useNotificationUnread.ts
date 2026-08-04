/**
 * useNotificationUnread — P2.3
 *
 * Returns the unread count for the player's personal notification thread.
 * Fetches on mount + window refocus (matching usePendingActions) — this
 * poll is the fallback that corrects any gap around a reconnect.
 * usePersonalEventsStream (ISSUE-62) supplements it app-wide: on a
 * 'message.created' push from GET /player/notifications/events it calls
 * notificationUnreadStore.increment() directly, so the badge updates
 * without waiting for refocus. Cleared by Notifications.tsx once the
 * player marks read.
 */
import { useCallback, useEffect, useState } from 'react'
import { notificationUnreadStore } from '../state/notification-unread-state'

export function useNotificationUnread(): number {
  const [unread, setUnread] = useState(() => notificationUnreadStore.get())

  useEffect(() => {
    const unsub = notificationUnreadStore.subscribe(setUnread)
    return unsub
  }, [])

  const refetch = useCallback(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    fetch('/player/notifications/unread', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : { unread: 0 }))
      .then((data: { unread: number }) => notificationUnreadStore.set(data.unread))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refetch()
    window.addEventListener('focus', refetch)
    return () => window.removeEventListener('focus', refetch)
  }, [refetch])

  return unread
}
