/**
 * MessagePanel - In-tournament messaging UI
 *
 * Lists messages for the current tournament. Shows an unread badge on the
 * Messages tab. Players can send coordination DMs; organizers additionally
 * see a broadcast (announce) button.
 *
 * Fetch strategy: history is loaded once by useMessages; subsequent messages
 * arrive via SSE (message.created) through the message store — no re-fetch.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useMessages } from '../hooks/useMessages'
import { usePermissions } from '../hooks/usePermissions'
import type { MessageRecord } from '../state/message-state'

interface Props {
  tournamentId: string
  /** When true, mark all currently-unread messages as read */
  active?: boolean
}

export const MessagePanel: React.FC<Props> = ({ tournamentId, active = false }) => {
  const { messages, unreadCount, send, markRead } = useMessages(tournamentId)
  const permissions = usePermissions(tournamentId)

  const [dmBody, setDmBody] = useState('')
  const [announceBody, setAnnounceBody] = useState('')
  const [sending, setSending] = useState(false)
  const [announcing, setAnnouncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Mark all unread as read when the panel becomes active
  useEffect(() => {
    if (!active) return
    messages.forEach(m => {
      if (m.read_at === null) {
        markRead(m.id).catch(() => {})
      }
    })
  }, [active]) // intentionally not re-running when messages changes to avoid loops

  // Scroll to bottom on new messages
  useEffect(() => {
    if (active) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, active])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const body = dmBody.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      await send({ body })
      setDmBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  async function handleAnnounce(e: React.FormEvent) {
    e.preventDefault()
    const body = announceBody.trim()
    if (!body || announcing) return
    setAnnouncing(true)
    setError(null)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/tournaments/${tournamentId}/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Announce failed' }))
        throw new Error(err.message ?? 'Announce failed')
      }
      setAnnounceBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send announcement')
    } finally {
      setAnnouncing(false)
    }
  }

  return (
    <div data-testid="message-panel" className="flex flex-col h-full min-h-[300px] max-h-[600px]">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-2 p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-[--ink-500] py-8">No messages yet</p>
        )}
        {messages.map((m: MessageRecord) => (
          <div
            key={m.id}
            data-testid="message-item"
            className={`
              rounded-lg p-3 text-sm
              ${m.read_at === null ? 'bg-[--court-50] border border-[--court-200]' : 'bg-[--ink-50]'}
            `}
          >
            <p className="text-[--ink-900]">{m.body}</p>
            <p className="text-xs text-[--ink-500] mt-1">
              {new Date(m.createdAt).toLocaleTimeString()}
              {m.recipientPlayerId === null && (
                <span className="ml-2 font-medium text-[--court-600]">📢 Announcement</span>
              )}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <p className="px-4 py-2 text-sm text-[--rose-700] bg-[--rose-50]">{error}</p>
      )}

      {/* Organizer: broadcast input */}
      {permissions.organizerRole && (
        <form onSubmit={handleAnnounce} className="border-t border-[--border] p-3 flex gap-2">
          <input
            data-testid="announce-input"
            type="text"
            value={announceBody}
            onChange={e => setAnnounceBody(e.target.value)}
            placeholder="Broadcast announcement…"
            disabled={announcing}
            className="flex-1 border border-[--border] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--court-400]"
          />
          <button
            data-testid="announce-button"
            type="submit"
            disabled={!announceBody.trim() || announcing}
            className="px-4 py-2 bg-[--court-600] text-white text-sm rounded disabled:opacity-50 hover:bg-[--court-700]"
          >
            {announcing ? '…' : 'Announce'}
          </button>
        </form>
      )}

      {/* Player: DM input */}
      <form onSubmit={handleSend} className="border-t border-[--border] p-3 flex gap-2">
        <input
          data-testid="message-input"
          type="text"
          value={dmBody}
          onChange={e => setDmBody(e.target.value)}
          placeholder="Send a message…"
          disabled={sending}
          className="flex-1 border border-[--border] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--court-400]"
        />
        <button
          data-testid="message-send-button"
          type="submit"
          disabled={!dmBody.trim() || sending}
          className="px-4 py-2 bg-[--court-500] text-white text-sm rounded disabled:opacity-50 hover:bg-[--court-600]"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>

      {/* Unused but exported for the unread badge — rendered by the parent tab */}
      <span data-unread-count={unreadCount} style={{ display: 'none' }} />
    </div>
  )
}

/**
 * UnreadBadge — renders a pill with the unread count for display on a tab.
 * Renders nothing when count is 0.
 */
export const UnreadBadge: React.FC<{ count: number }> = ({ count }) => {
  if (count === 0) return null
  return (
    <span
      data-testid="messages-unread-badge"
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold bg-[--rose-500] text-white rounded-full"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
