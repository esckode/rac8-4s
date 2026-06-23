/**
 * useMessages - Fetch history once, then apply SSE message.created deltas.
 *
 * Strategy (per MESSAGING_DESIGN §10):
 *   1. On mount, fetch GET /tournaments/:id/messages once to populate the store.
 *   2. SSE message.created events (emitted by useSSE) call messageStore.append()
 *      which notifies subscribers — no re-fetch needed.
 *   3. Exposes send (DM), markRead, messages[], and unreadCount.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { messageStore } from '../state'
import type { MessageRecord } from '../state/message-state'
import { useAuth } from './useAuth'

export interface SendInput {
  body: string
  recipientPlayerId?: string
  matchId?: string
}

export interface UseMessagesResult {
  messages: MessageRecord[]
  unreadCount: number
  send: (input: SendInput) => Promise<void>
  markRead: (messageId: string) => Promise<void>
}

export function useMessages(tournamentId: string): UseMessagesResult {
  const { user } = useAuth()
  const [messages, setMessages] = useState<MessageRecord[]>(() => messageStore.all())
  const fetchedRef = useRef(false)

  // Subscribe to store changes (SSE deltas arrive via messageStore.append)
  useEffect(() => {
    const unsub = messageStore.subscribe(setMessages)
    return unsub
  }, [])

  // Fetch history once on mount — skip if the store already has history loaded
  // (another hook instance in the same render tree already fetched it).
  useEffect(() => {
    if (!tournamentId || fetchedRef.current || messageStore.isLoaded()) return
    fetchedRef.current = true

    const token = localStorage.getItem('auth_token')
    fetch(`/tournaments/${tournamentId}/messages`, {
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
          messageStore.setHistory(data.messages)
        }
      })
      .catch(() => {
        // Silent fail — SSE stream will keep messages in sync
      })
  }, [tournamentId])

  // Count unread: messages directed at the current player (DMs) or broadcasts
  // (recipientPlayerId === null), when the player has not read them yet.
  // Broadcasts create a message_recipients row for every participant; the history
  // response includes read_at per-viewer so both types are covered by this check.
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
    },
    [tournamentId]
  )

  return { messages, unreadCount, send, markRead }
}
