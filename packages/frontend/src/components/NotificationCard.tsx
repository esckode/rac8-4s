/**
 * NotificationCard — P2.4
 *
 * Renders a single personal notification message (system event).
 */
import React from 'react'

export interface NotificationMessage {
  id: string
  body: string
  type: string
  createdAt: string
}

export const NotificationCard: React.FC<{ message: NotificationMessage }> = ({ message }) => {
  return (
    <div
      data-testid="notification-card"
      className="rounded-lg p-3 text-sm bg-[--ink-50] border border-[--border]"
    >
      <p className="text-[--ink-900]">{message.body}</p>
      <p className="text-xs text-[--ink-500] mt-1">
        {new Date(message.createdAt).toLocaleString()}
      </p>
    </div>
  )
}
