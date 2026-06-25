/**
 * useThreadMessages — V5.2 thread-filtered message history
 *
 * Extends the base message-fetching behavior to accept an optional thread
 * key and re-fetch history when the thread changes.  Unlike useMessages
 * (which caches in the shared store and fetches once), this hook maintains
 * its own local state so that switching channels triggers a fresh fetch.
 *
 * Thread keys mirror the backend ?thread= parameter:
 *   'announcements' | 'dm:{playerId}' | 'match:{matchId}'
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { MessageRecord } from '../state/message-state'
import { messageStore } from '../state'
import { useAuth } from './useAuth'

export interface SendInput {
  body: string
  recipientPlayerId?: string
  matchId?: string
}

export interface UseThreadMessagesResult {
  messages: MessageRecord[]
  unreadCount: number
  send: (input: SendInput) => Promise<void>
  markRead: (messageId: string) => Promise<void>
}

export function useThreadMessages(
  tournamentId: string,
  thread: string | null
): UseThreadMessagesResult {
  const { user } = useAuth()
  const [messages, setMessages] = useState<MessageRecord[]>([])
  // Track which (tournamentId, thread) pair we've fetched for
  const fetchKeyRef = useRef<string | null>(null)

  // Subscribe to store for SSE deltas that arrive after the history fetch
  useEffect(() => {
    const unsub = messageStore.subscribe((all) => {
      // Filter SSE-pushed messages to match the current thread
      if (!thread) {
        setMessages(all)
        return
      }
      setMessages(filterByThread(all, thread, user?.playerId))
    })
    return unsub
  }, [thread, user?.playerId])

  // Re-fetch whenever tournamentId or thread changes
  useEffect(() => {
    if (!tournamentId) return

    const fetchKey = `${tournamentId}::${thread ?? ''}`
    if (fetchKeyRef.current === fetchKey) return
    fetchKeyRef.current = fetchKey

    const token = localStorage.getItem('auth_token')
    const url = thread
      ? `/tournaments/${tournamentId}/messages?thread=${encodeURIComponent(thread)}`
      : `/tournaments/${tournamentId}/messages`

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(res => {
        if (!res.ok) return
        return res.json()
      })
      .then((data: { messages: MessageRecord[] } | undefined) => {
        if (data?.messages) {
          setMessages(data.messages)
        }
      })
      .catch(() => {
        // Silent fail
      })
  }, [tournamentId, thread])

  const unreadCount = messages.filter(
    m =>
      (m.recipientPlayerId === user?.playerId || m.recipientPlayerId === null) &&
      m.read_at === null
  ).length

  const send = useCallback(
    async (input: SendInput): Promise<void> => {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/tournaments/${tournamentId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Send failed' }))
        throw new Error(err.message ?? 'Send failed')
      }
      const msg: MessageRecord = await res.json()
      messageStore.append(msg)
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    },
    [tournamentId]
  )

  const markRead = useCallback(
    async (messageId: string): Promise<void> => {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/tournaments/${tournamentId}/messages/${messageId}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) return
      messageStore.markRead(messageId)
      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, read_at: new Date().toISOString() } : m)
      )
    },
    [tournamentId]
  )

  return { messages, unreadCount, send, markRead }
}

function filterByThread(
  messages: MessageRecord[],
  thread: string,
  viewerPlayerId: string | null | undefined
): MessageRecord[] {
  if (thread === 'announcements') {
    return messages.filter(m => m.recipientPlayerId === null)
  }
  if (thread.startsWith('dm:')) {
    const otherPlayerId = thread.slice(3)
    return messages.filter(
      m =>
        m.recipientPlayerId !== null &&
        m.matchId === null &&
        ((m.senderPlayerId === viewerPlayerId && m.recipientPlayerId === otherPlayerId) ||
          (m.senderPlayerId === otherPlayerId && m.recipientPlayerId === viewerPlayerId))
    )
  }
  if (thread.startsWith('match:')) {
    const matchId = thread.slice(6)
    return messages.filter(m => m.matchId === matchId)
  }
  return messages
}
