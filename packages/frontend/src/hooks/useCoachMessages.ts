/**
 * useCoachMessages — S7 (1:1 Coach chat page).
 *
 * Mirrors useGroupMessages exactly, but there is only ever one coach thread
 * per player (no groupId dimension) — reuses the same GroupMessageStore
 * shape since the wire format is identical (S2's coach routes return the
 * same fields as the group message routes).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import ReconnectingEventSource from 'reconnecting-eventsource'
import { GroupMessageStore } from '../state/group-message-state'
import type { GroupMessageRecord } from '../state/group-message-state'

export type { GroupMessageRecord }

const store = new GroupMessageStore()

/** Clears the singleton store — for tests. */
export function clearCoachMessageStore(): void {
  store.clear()
}

export interface UseCoachMessagesResult {
  messages: GroupMessageRecord[]
  reconnecting: boolean
  send: (body: string) => Promise<void>
}

export function useCoachMessages(): UseCoachMessagesResult {
  const [messages, setMessages] = useState<GroupMessageRecord[]>(() => store.all())
  const [reconnecting, setReconnecting] = useState(false)
  const fetchedRef = useRef(false)
  const connectedRef = useRef(false)

  useEffect(() => {
    const unsub = store.subscribe(setMessages)
    return unsub
  }, [])

  useEffect(() => {
    if (fetchedRef.current || store.isLoaded()) return
    fetchedRef.current = true

    const token = localStorage.getItem('auth_token')
    fetch('/player/coach/messages', {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(res => (res.ok ? res.json() : undefined))
      .then((data: { messages: GroupMessageRecord[] } | undefined) => {
        if (data?.messages) {
          store.setHistory(data.messages)
          connectedRef.current = true
        }
      })
      .catch(() => {
        // Silent fail — SSE will keep messages in sync
      })
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    const url = `/player/coach/events${token ? `?token=${encodeURIComponent(token)}` : ''}`

    try {
      const es = new ReconnectingEventSource(url, { maxReconnectionDelay: 8000 } as any)

      es.addEventListener('open', () => {
        if (connectedRef.current) {
          const tok = localStorage.getItem('auth_token')
          fetch('/player/coach/messages', {
            headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
          })
            .then(r => (r.ok ? r.json() : undefined))
            .then((data: { messages: GroupMessageRecord[] } | undefined) => {
              if (data?.messages) store.mergeHistory(data.messages)
            })
            .catch(() => {})
            .finally(() => setReconnecting(false))
        }
        connectedRef.current = true
      })

      es.addEventListener('error', () => {
        if (connectedRef.current) setReconnecting(true)
      })

      es.addEventListener('message.created', (event: Event) => {
        if (event instanceof MessageEvent) {
          try {
            const payload: GroupMessageRecord = JSON.parse(event.data)
            store.append(payload)
          } catch {
            // malformed — ignore
          }
        }
      })

      es.addEventListener('card.updated', (event: Event) => {
        if (event instanceof MessageEvent) {
          try {
            const { cardId, status, result } = JSON.parse(event.data) as {
              cardId: string
              status: 'pending' | 'confirmed' | 'failed' | 'cancelled'
              result?: Record<string, unknown> | null
            }
            store.updateCard(cardId, { status, result })
          } catch {
            // malformed — ignore
          }
        }
      })

      return () => {
        es.close()
      }
    } catch {
      // SSE not available (e.g. in tests) — ignore
    }
  }, [])

  const send = useCallback(async (body: string): Promise<void> => {
    const token = localStorage.getItem('auth_token')
    const res = await fetch('/player/coach/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ body, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Send failed' }))
      throw new Error(err.message ?? 'Send failed')
    }
    const msg: GroupMessageRecord = await res.json()
    const normalised: GroupMessageRecord = {
      ...msg,
      senderName: (msg as any).senderNameSnapshot ?? msg.senderName ?? null,
    }
    store.append(normalised)
  }, [])

  return { messages, reconnecting, send }
}
