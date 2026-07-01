/**
 * Notifications page (P2.3 shell — P2.4 fills the stream)
 *
 * Renders the player's personal notification thread as a read-only stream.
 * Stream + mark-read implemented in P2.4.
 */
import React from 'react'
import { LoadingState } from '../components/shared'

export const Notifications: React.FC = () => {
  return (
    <div data-testid="notifications-page" style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 16 }}>
        Notifications
      </h2>
      <LoadingState message="Loading notifications…" />
    </div>
  )
}
