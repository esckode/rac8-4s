/**
 * Notifications page (P2.4)
 *
 * Renders the player's personal notification thread as a read-only stream.
 * Mark-read fires on mount; badge clears via the unread count endpoint.
 */
import React, { useEffect, useState } from 'react'
import { LoadingState, EmptyState, ErrorState } from '../components/shared'
import { NotificationCard, type NotificationMessage } from '../components/NotificationCard'

export const Notifications: React.FC = () => {
  const [messages, setMessages] = useState<NotificationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

    // Fetch history
    fetch('/player/notifications/messages', { headers })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load notifications')
        return r.json()
      })
      .then((data: { messages: NotificationMessage[] }) => {
        setMessages(data.messages)
        setLoading(false)
        // Mark all as read (fire-and-forget)
        fetch('/player/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
        }).catch(() => {})
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  return (
    <div data-testid="notifications-page" style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 16 }}>
        Notifications
      </h2>

      {loading && <LoadingState message="Loading notifications…" />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && messages.length === 0 && (
        <EmptyState title="No notifications yet" />
      )}
      {!loading && !error && messages.length > 0 && (
        <div
          role="log"
          aria-live="polite"
          aria-label="Notifications"
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {messages.map(m => (
            <NotificationCard key={m.id} message={m} />
          ))}
        </div>
      )}
    </div>
  )
}
