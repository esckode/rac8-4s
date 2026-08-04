/**
 * NotificationCard — P2.4
 *
 * Renders a single personal notification message (system event). When the
 * message carries { metadata: { groupId } } (deep-link payload — P3.5's
 * group_messages.metadata column, same convention as nudge messages), the
 * card links to that group's chat. ISSUE-15: a doubles partner invite
 * carries { registrationId } instead, linking to the existing partner
 * confirm page. ISSUE-55: a group invite additionally carries
 * { groupInviteToken, inviteEmail } and renders an inline Accept button
 * instead of a deep-link, so the invite can be accepted without leaving
 * the app.
 */
import React, { useState } from 'react'
import { Link } from 'react-router-dom'

export interface NotificationMessage {
  id: string
  body: string
  type: string
  createdAt: string
  metadata?: {
    groupId?: string
    registrationId?: string
    groupName?: string
    groupInviteToken?: string
    inviteEmail?: string
  } | null
}

export const NotificationCard: React.FC<{ message: NotificationMessage; onAccepted?: () => void }> = ({
  message,
  onAccepted,
}) => {
  const groupId = message.metadata?.groupId
  const registrationId = message.metadata?.registrationId
  const groupInviteToken = message.metadata?.groupInviteToken
  const inviteEmail = message.metadata?.inviteEmail
  const className = 'block rounded-lg p-3 text-sm bg-(--ink-50) border border-(--border)'

  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const content = (
    <>
      <p className="text-(--ink-900)">{message.body}</p>
      <p className="text-xs text-(--ink-500) mt-1">
        {new Date(message.createdAt).toLocaleString()}
      </p>
    </>
  )

  async function handleAccept() {
    setAccepting(true)
    setError(null)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/player/groups/${groupId}/invites/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // ISSUE-55 gap 5: the accept response mints a fresh player session
        // token — an already-logged-in account holder must not store it,
        // or they are silently downgraded to a guest player session.
        body: JSON.stringify({ token: groupInviteToken, email: inviteEmail }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { code?: string }
        setError(
          data.code === 'TOKEN_INVALID' ? 'This invite is no longer valid' : 'Could not accept invite'
        )
        return
      }
      onAccepted?.()
    } finally {
      setAccepting(false)
    }
  }

  if (groupInviteToken && groupId) {
    return (
      <div data-testid="notification-card" className={className}>
        {content}
        <button
          data-testid="notification-invite-accept"
          onClick={handleAccept}
          disabled={accepting}
          className="mt-2 text-sm font-medium text-white bg-(--court-600) hover:bg-(--court-800) px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {accepting ? 'Accepting…' : 'Accept'}
        </button>
        {error && <p className="text-xs text-(--rose-700) mt-1">{error}</p>}
      </div>
    )
  }

  const linkTo = groupId ? `/groups/${groupId}` : registrationId ? `/registrations/${registrationId}/confirm` : null

  if (linkTo) {
    return (
      <Link to={linkTo} data-testid="notification-card" className={`${className} hover:shadow-md transition-shadow`}>
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
