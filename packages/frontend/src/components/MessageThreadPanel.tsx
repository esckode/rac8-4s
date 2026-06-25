/**
 * MessageThreadPanel — V5.2 thread-aware messaging UI
 *
 * Wraps ChannelSwitcher + a per-thread message view.
 *
 * Channel behaviour:
 *   • Announcements — read-only for players; organizers see the announce compose form.
 *   • DM thread     — sends with recipientPlayerId; no matchId.
 *   • Match thread  — sends with recipientPlayerId (opponent) + matchId.
 *
 * There is deliberately NO "arbitrary DM" entry point in this panel.
 * DM threads are created externally (via "Message opponent" on a MatchCard).
 */

import React, { useEffect, useRef, useState } from 'react'
import { ChannelSwitcher, type DmThread, type MatchThread, type ThreadKey } from './ChannelSwitcher'
import { useThreadMessages } from '../hooks/useThreadMessages'
import { usePermissions } from '../hooks/usePermissions'
import type { MessageRecord } from '../state/message-state'

interface Props {
  tournamentId: string
  /** Start on a specific thread (e.g. when opened via "Message opponent") */
  initialThread?: ThreadKey
  /** Pre-known DM threads for the sidebar */
  dmThreads?: DmThread[]
  /** Pre-known match threads for the sidebar */
  matchThreads?: MatchThread[]
  /** When true, mark all currently-unread messages as read */
  active?: boolean
}

export const MessageThreadPanel: React.FC<Props> = ({
  tournamentId,
  initialThread = 'announcements',
  dmThreads = [],
  matchThreads = [],
  active = false,
}) => {
  const [activeThread, setActiveThread] = useState<ThreadKey>(initialThread)
  const { messages, send, markRead } = useThreadMessages(tournamentId, activeThread)
  const permissions = usePermissions(tournamentId)

  const [dmBody, setDmBody] = useState('')
  const [announceBody, setAnnounceBody] = useState('')
  const [sending, setSending] = useState(false)
  const [announcing, setAnnouncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Mark all unread as read when active
  useEffect(() => {
    if (!active) return
    messages.forEach(m => {
      if (m.read_at === null) {
        markRead(m.id).catch(() => {})
      }
    })
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    if (active) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, active])

  // Reset compose body when switching channels
  useEffect(() => {
    setDmBody('')
    setError(null)
  }, [activeThread])

  // ── Determine compose context for the active thread ────────────────────────
  const isAnnouncementsChannel = activeThread === 'announcements'
  const isDmChannel = activeThread.startsWith('dm:')
  const isMatchChannel = activeThread.startsWith('match:')

  // For a match thread we need the opponent's playerId
  const activeMatchThread = isMatchChannel
    ? matchThreads.find(t => `match:${t.matchId}` === activeThread)
    : undefined

  // For a DM thread
  const activeDmThread = isDmChannel
    ? dmThreads.find(t => `dm:${t.playerId}` === activeThread)
    : undefined

  // Whether the current user can compose in this channel
  // Announcements: only organizers; DM/match: players and organizers
  const canCompose = isAnnouncementsChannel
    ? permissions.organizerRole
    : (isDmChannel || isMatchChannel)

  // ── Send handlers ──────────────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const body = dmBody.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      const input: { body: string; recipientPlayerId?: string; matchId?: string } = { body }
      if (isMatchChannel && activeMatchThread) {
        if (activeMatchThread.opponentPlayerId) {
          input.recipientPlayerId = activeMatchThread.opponentPlayerId
        }
        input.matchId = activeMatchThread.matchId
      } else if (isDmChannel && activeDmThread) {
        input.recipientPlayerId = activeDmThread.playerId
      }
      await send(input)
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div data-testid="message-thread-panel" className="flex h-full min-h-[300px] max-h-[600px]">
      {/* Sidebar: channel list */}
      <ChannelSwitcher
        activeThread={activeThread}
        dmThreads={dmThreads}
        matchThreads={matchThreads}
        onSelect={setActiveThread}
      />

      {/* Main: message view + compose */}
      <div className="flex flex-col flex-1 overflow-hidden">
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
                {m.senderName != null ? (
                  <span>{m.senderName} · {new Date(m.createdAt).toLocaleTimeString()}</span>
                ) : (
                  new Date(m.createdAt).toLocaleTimeString()
                )}
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

        {/* Compose area */}
        {isAnnouncementsChannel && permissions.organizerRole && (
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

        {isAnnouncementsChannel && !permissions.organizerRole && (
          <div
            data-testid="announcements-readonly-notice"
            className="border-t border-[--border] px-4 py-3 text-sm text-[--ink-500] text-center"
          >
            Announcements are posted by the organizer
          </div>
        )}

        {canCompose && !isAnnouncementsChannel && (
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
        )}
      </div>
    </div>
  )
}
