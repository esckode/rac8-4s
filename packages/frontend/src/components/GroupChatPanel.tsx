/**
 * GroupChatPanel — G2.5
 *
 * Group chat stream (Chat tab). Renders messages as "Name · time" cards
 * (same pattern as MessagePanel). System events rendered distinctly.
 * New messages arrive live via SSE through useGroupMessages.
 *
 * Also exports:
 *   MembersPanel  — Members list + invite-by-email form
 *   MyGroupsUnreadBadge — Unread badge for the My Groups nav tab
 */

import React, { useEffect, useRef, useState } from 'react'
import { useGroupMessages, GroupMessageRecord } from '../hooks/useGroupMessages'

// ─── GroupChatPanel ───────────────────────────────────────────────────────────

interface GroupChatPanelProps {
  groupId: string
  /** When true, clears the unread count (the user is viewing the chat). */
  active?: boolean
}

export const GroupChatPanel: React.FC<GroupChatPanelProps> = ({ groupId, active = false }) => {
  const { messages, send } = useGroupMessages(groupId, active)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      await send(trimmed)
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div data-testid="group-chat-panel" className="flex flex-col h-full min-h-[300px] max-h-[600px]">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-2 p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-[--ink-500] py-8">No messages yet</p>
        )}
        {messages.map((m: GroupMessageRecord) => (
          m.type === 'system' ? (
            <div
              key={m.id}
              data-testid="group-system-event"
              className="text-center text-xs text-[--ink-500] italic py-1"
            >
              {m.body}
            </div>
          ) : (
            <div
              key={m.id}
              data-testid="group-message-item"
              className="rounded-lg p-3 text-sm bg-[--ink-50]"
            >
              <p className="text-[--ink-900]">{m.body}</p>
              <p className="text-xs text-[--ink-500] mt-1">
                {m.senderName != null ? (
                  <span>{m.senderName} · {new Date(m.createdAt).toLocaleTimeString()}</span>
                ) : (
                  new Date(m.createdAt).toLocaleTimeString()
                )}
              </p>
            </div>
          )
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <p className="px-4 py-2 text-sm text-[--rose-700] bg-[--rose-50]">{error}</p>
      )}

      {/* Send form */}
      <form onSubmit={handleSend} className="border-t border-[--border] p-3 flex gap-2">
        <input
          data-testid="group-message-input"
          type="text"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Send a message…"
          disabled={sending}
          className="flex-1 border border-[--border] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--court-400]"
        />
        <button
          data-testid="group-message-send-button"
          type="submit"
          disabled={!body.trim() || sending}
          className="px-4 py-2 bg-[--court-500] text-white text-sm rounded disabled:opacity-50 hover:bg-[--court-600]"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}

// ─── MembersPanel ─────────────────────────────────────────────────────────────

export interface MemberSummary {
  playerId: string
  name: string
  role: 'owner' | 'member'
  joinedAt: string
}

interface MembersPanelProps {
  groupId: string
}

export const MembersPanel: React.FC<MembersPanelProps> = ({ groupId }) => {
  const [members, setMembers] = useState<MemberSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const token = localStorage.getItem('auth_token')
    fetch(`/player/groups/${groupId}/members`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(res => {
        if (!res.ok) return
        return res.json()
      })
      .then((data: { members: MemberSummary[] } | undefined) => {
        if (!cancelled && data?.members) setMembers(data.members)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [groupId])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email || inviting) return
    setInviting(true)
    setInviteError(null)
    setInviteSuccess(false)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/player/groups/${groupId}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Invite failed' }))
        throw new Error(err.message ?? 'Invite failed')
      }
      setInviteEmail('')
      setInviteSuccess(true)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invite failed')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div data-testid="members-panel" className="p-4 space-y-4">
      {/* Member list */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[--ink-700] uppercase tracking-wide">Members</h3>
        {loading && <p className="text-sm text-[--ink-500]">Loading…</p>}
        {members.map(m => (
          <div
            key={m.playerId}
            data-testid="member-item"
            className="flex items-center justify-between py-2 border-b border-[--border] last:border-0"
          >
            <span className="text-sm text-[--ink-900]">{m.name}</span>
            {m.role === 'owner' && (
              <span className="text-xs font-medium text-[--court-600]">Owner</span>
            )}
          </div>
        ))}
      </div>

      {/* Invite form */}
      <div>
        <h3 className="text-sm font-semibold text-[--ink-700] uppercase tracking-wide mb-2">Invite</h3>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            data-testid="invite-email-input"
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="player@example.com"
            disabled={inviting}
            className="flex-1 border border-[--border] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--court-400]"
          />
          <button
            data-testid="invite-send-button"
            type="submit"
            disabled={!inviteEmail.trim() || inviting}
            className="px-4 py-2 bg-[--court-500] text-white text-sm rounded disabled:opacity-50 hover:bg-[--court-600]"
          >
            {inviting ? '…' : 'Invite'}
          </button>
        </form>
        {inviteSuccess && (
          <p data-testid="invite-success" className="text-sm text-[--court-700] mt-2">Invite sent!</p>
        )}
        {inviteError && (
          <p data-testid="invite-error" className="text-sm text-[--rose-700] mt-2">{inviteError}</p>
        )}
      </div>
    </div>
  )
}

// ─── MyGroupsUnreadBadge ──────────────────────────────────────────────────────

export const MyGroupsUnreadBadge: React.FC<{ count: number }> = ({ count }) => {
  if (count === 0) return null
  return (
    <span
      data-testid="groups-unread-badge"
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold bg-[--rose-500] text-white rounded-full"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
