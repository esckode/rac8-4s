/**
 * NotificationCard — P2.4
 *
 * Renders a single personal notification message (system event). When the
 * message carries { metadata: { groupId } } (deep-link payload — P3.5's
 * group_messages.metadata column, same convention as nudge messages), the
 * card links to that group's chat.
 */
import React from 'react'
import { Link } from 'react-router-dom'

export interface NotificationMessage {
  id: string
  body: string
  type: string
  createdAt: string
  metadata?: { groupId?: string } | null
}

export const NotificationCard: React.FC<{ message: NotificationMessage }> = ({ message }) => {
  const groupId = message.metadata?.groupId
  const className = 'block rounded-lg p-3 text-sm bg-[--ink-50] border border-[--border]'

  const content = (
    <>
      <p className="text-[--ink-900]">{message.body}</p>
      <p className="text-xs text-[--ink-500] mt-1">
        {new Date(message.createdAt).toLocaleString()}
      </p>
    </>
  )

  if (groupId) {
    return (
      <Link to={`/groups/${groupId}`} data-testid="notification-card" className={`${className} hover:shadow-md transition-shadow`}>
        {content}
      </Link>
    )
  }

  return (
    <div data-testid="notification-card" className={className}>
      {content}
    </div>
  )
}
