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

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGroupMessages, GroupMessageRecord } from '../hooks/useGroupMessages'
import { useAuth } from '../hooks/useAuth'
import { PollCard, type PollChoice } from './PollCard'
import { ActionCard } from './ActionCard'
import { LaunchConfirmSheet } from './LaunchConfirmSheet'
import { MentionAutocomplete } from './MentionAutocomplete'
import { parseMentions } from '../utils/parseMentions'
import { ReconnectingIndicator } from './shared'
import { Avatar } from './shared/Avatar'

interface VoterSummary {
  voterName: string
  playerId: string
}

// ─── GroupChatPanel ───────────────────────────────────────────────────────────

interface GroupChatPanelProps {
  groupId: string
  /** When true, clears the unread count (the user is viewing the chat). */
  active?: boolean
  /** When true, the current user is an owner of this group. */
  isOwner?: boolean
  /** Whether the group's @coach assistant is enabled (from useGroupList). */
  assistantEnabled?: boolean
}

// Mirrors packages/api/src/assistant/trigger.ts ASSISTANT_DISPLAY_NAME
const ASSISTANT_DISPLAY_NAME = 'Coach'

export const GroupChatPanel: React.FC<GroupChatPanelProps> = ({
  groupId,
  active = false,
  isOwner = false,
  assistantEnabled = true,
}) => {
  const { messages, send, reconnecting } = useGroupMessages(groupId, active)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  // Track the current user's vote per poll (keyed by pollId)
  const [pollVotes, setPollVotes] = useState<Record<string, PollChoice>>({})
  // Track in-progress poll actions to avoid double submissions
  const pollActingRef = useRef<Set<string>>(new Set())
  // Track in-progress card confirm/cancel actions to avoid double submissions
  const cardActingRef = useRef<Set<string>>(new Set())
  // @mention autocomplete state
  const [members, setMembers] = useState<MemberSummary[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  // Launch confirmation sheet state
  const [launchSheet, setLaunchSheet] = useState<{ messageId: string; voters: VoterSummary[] } | null>(null)
  // propose_casual_launch card sheet state (B5.1 — separate from the poll-card
  // launch flow above: args already carry inVoterNames, no votes fetch needed)
  const [cardLaunchSheet, setCardLaunchSheet] = useState<{
    cardId: string
    messageId: string
    inVoterNames: string[]
    defaultFormat: 'singles' | 'doubles'
  } | null>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Fetch group members for mention autocomplete
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    fetch(`/player/groups/${groupId}/members`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : { members: [] })
      .then((data: { members: MemberSummary[] }) => setMembers(data.members ?? []))
      .catch(() => {})
  }, [groupId])

  const handleVote = useCallback(async (pollId: string, choice: PollChoice) => {
    if (pollActingRef.current.has(pollId)) return
    pollActingRef.current.add(pollId)
    // Optimistic update
    setPollVotes(prev => ({ ...prev, [pollId]: choice }))
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/player/groups/${groupId}/polls/${pollId}/votes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ choice }),
      })
    } catch {
      // Revert on failure — the SSE tally will correct itself on next update
    } finally {
      pollActingRef.current.delete(pollId)
    }
  }, [groupId])

  const handleClosePoll = useCallback(async (messageId: string, pollId: string) => {
    if (pollActingRef.current.has(`close:${messageId}`)) return
    pollActingRef.current.add(`close:${messageId}`)
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/player/groups/${groupId}/polls/${messageId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })
      // The SSE poll.closed event will update the store — no local state update needed
    } catch {
      // Silent fail — SSE will sync
    } finally {
      pollActingRef.current.delete(`close:${messageId}`)
    }
  }, [groupId])

  const handleLaunch = useCallback(async (messageId: string) => {
    const token = localStorage.getItem('auth_token')
    const res = await fetch(`/player/groups/${groupId}/polls/${messageId}/votes`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const data = res.ok ? await res.json() : { votes: [] }
    const inVoters: VoterSummary[] = (data.votes ?? [])
      .filter((v: any) => v.choice === 'in')
      .map((v: any) => ({ playerId: v.playerId, voterName: v.voterName ?? v.playerId }))
    setLaunchSheet({ messageId, voters: inVoters })
  }, [groupId])

  const handleConfirmCard = useCallback(async (cardId: string) => {
    if (cardActingRef.current.has(cardId)) return
    cardActingRef.current.add(cardId)
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/player/groups/${groupId}/assistant-cards/${cardId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })
      // The SSE card.updated event will update the store — no local state update needed
    } catch {
      // Silent fail — SSE will sync
    } finally {
      cardActingRef.current.delete(cardId)
    }
  }, [groupId])

  const handleDismissCard = useCallback(async (cardId: string) => {
    if (cardActingRef.current.has(cardId)) return
    cardActingRef.current.add(cardId)
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/player/groups/${groupId}/assistant-cards/${cardId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })
    } catch {
      // Silent fail — SSE will sync
    } finally {
      cardActingRef.current.delete(cardId)
    }
  }, [groupId])

  const handleConfirmLaunch = useCallback(async (opts: { matchFormat: string }) => {
    if (!launchSheet) return
    const token = localStorage.getItem('auth_token')
    const res = await fetch(`/player/groups/${groupId}/polls/${launchSheet.messageId}/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ matchFormat: opts.matchFormat }),
    })
    if (res.ok) {
      const data = await res.json()
      setLaunchSheet(null)
      navigate(`/tournament/${data.tournamentId}`)
    }
  }, [groupId, launchSheet, navigate])

  const handleConfirmCardLaunch = useCallback(async (opts: { matchFormat: string }) => {
    if (!cardLaunchSheet) return
    const token = localStorage.getItem('auth_token')
    const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(`/player/groups/${groupId}/polls/${cardLaunchSheet.messageId}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ matchFormat: opts.matchFormat }),
    })
    if (!res.ok) return
    const data = await res.json()
    // Flip the card to confirmed now that the tournament exists (B5.1) — the
    // card was a shortcut into this flow, never its own authority.
    await fetch(`/player/groups/${groupId}/assistant-cards/${cardLaunchSheet.cardId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ tournamentId: data.tournamentId }),
    })
    setCardLaunchSheet(null)
    navigate(`/tournament/${data.tournamentId}`)
  }, [groupId, cardLaunchSheet, navigate])

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
        {messages.map((m: GroupMessageRecord) => {
          if (m.type === 'system') {
            const tournamentId = (m.metadata as any)?.tournament_id as string | undefined
            return (
              <div
                key={m.id}
                data-testid="group-system-event"
                className="text-center text-xs text-[--ink-500] italic py-1"
              >
                {tournamentId ? (
                  <a
                    data-testid="tournament-deep-link"
                    href={`/tournament/${tournamentId}`}
                    className="underline hover:text-[--court-600]"
                  >
                    {m.body}
                  </a>
                ) : (
                  m.body
                )}
              </div>
            )
          }

          if (m.type === 'assistant') {
            const hasCard = m.cardId && m.cardStatus && m.cardExpiresAt
            return (
              <div
                key={m.id}
                data-testid="assistant-message"
                className="rounded-lg p-3 text-sm bg-[--court-50] border border-[--court-200] space-y-2"
              >
                {hasCard ? (
                  <ActionCard
                    body={m.body}
                    status={m.cardStatus!}
                    expiresAt={m.cardExpiresAt!}
                    result={m.cardResult ?? null}
                    isProposer={m.cardProposerPlayerId === user?.playerId}
                    onConfirm={() => handleConfirmCard(m.cardId!)}
                    onDismiss={() => handleDismissCard(m.cardId!)}
                    action={m.cardAction ?? undefined}
                    args={m.cardArgs ?? undefined}
                    onLaunch={() => {
                      const args = m.cardArgs as { messageId: string; inVoterNames: string[]; defaultFormat?: 'singles' | 'doubles' }
                      setCardLaunchSheet({
                        cardId: m.cardId!,
                        messageId: args.messageId,
                        inVoterNames: args.inVoterNames ?? [],
                        defaultFormat: args.defaultFormat ?? 'singles',
                      })
                    }}
                  />
                ) : (
                  <p className="text-[--ink-900]">{m.body}</p>
                )}
                <p className="text-xs text-[--court-700] font-medium">
                  Coach · {new Date(m.createdAt).toLocaleTimeString()}
                </p>
              </div>
            )
          }

          if (m.type === 'poll' && m.pollId) {
            const isCreator = m.playerId != null && m.playerId === user?.playerId
            return (
              <div key={m.id} data-testid="group-message-item">
                <PollCard
                  groupId={groupId}
                  messageId={m.id}
                  pollId={m.pollId}
                  question={m.body}
                  targetTime={m.targetTime ?? null}
                  closedAt={m.closedAt ?? null}
                  autoCloseAt={m.autoCloseAt ?? null}
                  autoLaunch={m.autoLaunch ?? false}
                  tally={m.tally ?? { in: 0, out: 0, maybe: 0 }}
                  currentUserVote={m.pollId ? (pollVotes[m.pollId] ?? null) : null}
                  isOwner={isOwner}
                  isCreator={isCreator}
                  onVote={choice => handleVote(m.pollId!, choice)}
                  onClose={() => handleClosePoll(m.id, m.pollId!)}
                  onLaunch={() => handleLaunch(m.id)}
                />
                <p className="text-xs text-[--ink-500] mt-1 px-1 flex items-center gap-1.5">
                  {m.senderName != null ? (
                    <>
                      {m.playerId && <Avatar playerId={m.playerId} name={m.senderName} />}
                      <span>{m.senderName} · {new Date(m.createdAt).toLocaleTimeString()}</span>
                    </>
                  ) : (
                    new Date(m.createdAt).toLocaleTimeString()
                  )}
                </p>
              </div>
            )
          }

          return (
            <div
              key={m.id}
              data-testid="group-message-item"
              className="rounded-lg p-3 text-sm bg-[--ink-50]"
            >
              <p className="text-[--ink-900]">
                {parseMentions(m.body).map((seg, i) => {
                  if (seg.type === 'text') return <span key={i}>{seg.text}</span>
                  const isSelf = seg.name === user?.name
                  return (
                    <span
                      key={i}
                      data-testid={isSelf ? 'mention-chip-self' : 'mention-chip'}
                      className={isSelf ? 'bg-[--gold-200] text-[--gold-900] rounded px-1 font-medium' : 'bg-[--court-100] text-[--court-800] rounded px-1 font-medium'}
                    >
                      {seg.name}
                    </span>
                  )
                })}
              </p>
              <p className="text-xs text-[--ink-500] mt-1 flex items-center gap-1.5">
                {m.senderName != null ? (
                  <>
                    {m.playerId && <Avatar playerId={m.playerId} name={m.senderName} />}
                    <span>{m.senderName} · {new Date(m.createdAt).toLocaleTimeString()}</span>
                  </>
                ) : (
                  new Date(m.createdAt).toLocaleTimeString()
                )}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Launch confirmation sheet */}
      {launchSheet && (
        <LaunchConfirmSheet
          inVoterNames={launchSheet.voters.map(v => v.voterName)}
          onConfirm={handleConfirmLaunch}
          onCancel={() => setLaunchSheet(null)}
        />
      )}

      {/* Launch confirmation sheet opened from a propose_casual_launch card (B5.1) */}
      {cardLaunchSheet && (
        <LaunchConfirmSheet
          inVoterNames={cardLaunchSheet.inVoterNames}
          defaultFormat={cardLaunchSheet.defaultFormat}
          onConfirm={handleConfirmCardLaunch}
          onCancel={() => setCardLaunchSheet(null)}
        />
      )}

      {/* Reconnecting indicator */}
      <ReconnectingIndicator visible={reconnecting} />

      {/* Error */}
      {error && (
        <p className="px-4 py-2 text-sm text-[--rose-700] bg-[--rose-50]">{error}</p>
      )}

      {/* Send form */}
      <form onSubmit={handleSend} className="border-t border-[--border] p-3 flex gap-2 relative">
        {mentionQuery !== null && (
          <MentionAutocomplete
            members={members}
            query={mentionQuery}
            assistantEnabled={assistantEnabled}
            onSelect={name => {
              const before = body.slice(0, mentionStart ?? body.length)
              const after = body.slice((mentionStart ?? 0) + 1 + mentionQuery.length)
              // Coach must be inserted as the unquoted trigger literal
              // (@coach) — the quoted @"Name" form used for members would
              // not match the backend's trigger regex.
              const mention =
                name === ASSISTANT_DISPLAY_NAME ? '@coach' : `@"${name}"`
              setBody(`${before}${mention} ${after}`)
              setMentionQuery(null)
              setMentionStart(null)
            }}
            onClose={() => { setMentionQuery(null); setMentionStart(null) }}
          />
        )}
        <input
          data-testid="group-message-input"
          type="text"
          value={body}
          onChange={e => {
            const val = e.target.value
            setBody(val)
            const pos = e.target.selectionStart ?? val.length
            const before = val.slice(0, pos)
            const atMatch = before.match(/@([^"@\s]*)$/)
            if (atMatch) {
              setMentionQuery(atMatch[1])
              setMentionStart(pos - atMatch[0].length)
            } else {
              setMentionQuery(null)
              setMentionStart(null)
            }
          }}
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
