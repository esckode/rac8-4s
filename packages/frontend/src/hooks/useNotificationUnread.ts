/**
 * useNotificationUnread — P2.3
 *
 * Returns the unread count for the player's personal notification thread.
 * Fetches once on mount to seed the count, then keeps it live via an SSE
 * connection to /player/notifications/events (mirrors useCoachMessages'
 * connection pattern) so the nav badge updates while the player is on any
 * other page — cleared by Notifications.tsx once the player marks read.
 */
import { useEffect, useState } from 'react'
import ReconnectingEventSource from 'reconnecting-eventsource'
import { notificationUnreadStore } from '../state/notification-unread-state'

export function useNotificationUnread(): number {
  const [unread, setUnread] = useState(() => notificationUnreadStore.get())

  useEffect(() => {
    const unsub = notificationUnreadStore.subscribe(setUnread)
    return unsub
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return undefined

    fetch('/player/notifications/unread', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { unread: 0 })
      .then((data: { unread: number }) => notificationUnreadStore.set(data.unread))
      .catch(() => {})

    const url = `/player/notifications/events?token=${encodeURIComponent(token)}`
    const es = new ReconnectingEventSource(url, { maxReconnectionDelay: 8000 } as any)
    es.addEventListener('message.created', () => {
      notificationUnreadStore.increment()
    })

    return () => {
      es.close()
    }
  }, [])

  return unread
}
