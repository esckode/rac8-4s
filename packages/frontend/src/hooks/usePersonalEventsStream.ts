/**
 * usePersonalEventsStream — ISSUE-62
 *
 * Opens the app-wide per-player SSE stream (GET /player/notifications/events)
 * and routes its events to the badge stores: 'message.created' (a personal
 * notification was posted) increments notificationUnreadStore directly;
 * 'group.unread.changed' (a new message landed in a group whose panel isn't
 * open) calls refetchGroupUnread() to resync groupUnreadStore with the
 * server's authoritative per-group unreadCount (ISSUE-56) — not a local
 * increment, since ISSUE-56 deliberately keeps unread state server-computed
 * rather than client-diffed.
 *
 * Mounted once, app-wide (ResponsiveLayout), alongside useNotificationUnread
 * and useGroupsWithUnread — this is the piece that makes their counts move
 * without a focus/refetch. Their own mount+focus polling remains the
 * fallback that corrects any gap around a reconnect; this hook doesn't
 * replace it.
 */
import { useEffect } from 'react'
import ReconnectingEventSource from 'reconnecting-eventsource'
import { notificationUnreadStore } from '../state/notification-unread-state'
import { refetchGroupUnread } from './useGroupUnread'

export function usePersonalEventsStream(): void {
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    try {
      const es = new ReconnectingEventSource(
        `/player/notifications/events?token=${encodeURIComponent(token)}`,
        { maxReconnectionDelay: 8000 } as any
      )

      es.addEventListener('message.created', () => {
        notificationUnreadStore.increment()
      })

      es.addEventListener('group.unread.changed', () => {
        refetchGroupUnread()
      })

      return () => es.close()
    } catch {
      // SSE not available (e.g. in tests) — ignore
    }
  }, [])
}
