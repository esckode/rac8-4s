/**
 * useGroupMessages — G2.5
 *
 * Fetches group message history once, then applies SSE message.created deltas.
 * SSE connects to GET /player/groups/:groupId/events.
 *
 * Strategy mirrors useMessages:
 *   1. Mount: fetch GET /player/groups/:groupId/messages for history.
 *   2. SSE message.created → append to local store (no re-fetch).
 *   3. Expose send, messages[], and unreadCount.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import ReconnectingEventSource from 'reconnecting-eventsource'
import { GroupMessageStore } from '../state/group-message-state'
import type { GroupMessageRecord, PollTally } from '../state/group-message-state'
import { groupUnreadStore, markGroupSeen } from '../state/group-unread-state'

export type { GroupMessageRecord, PollTally }

// Per-groupId singleton stores: avoids re-fetching when the component remounts
// during navigation but the same group is still in scope.
const stores = new Map<string, GroupMessageStore>()

function getStore(groupId: string): GroupMessageStore {
  if (!stores.has(groupId)) {
    stores.set(groupId, new GroupMessageStore())
  }
  return stores.get(groupId)!
}

/** Clears all stores — for tests. */
export function clearGroupMessageStores(): void {
  stores.clear()
}

export interface UseGroupMessagesResult {
  messages: GroupMessageRecord[]
  unreadCount: number
  reconnecting: boolean
  send: (body: string) => Promise<void>
}

export function useGroupMessages(groupId: string, active = false): UseGroupMessagesResult {
  const store = getStore(groupId)
  const [messages, setMessages] = useState<GroupMessageRecord[]>(() => store.all())
  const [reconnecting, setReconnecting] = useState(false)
  const fetchedRef = useRef(false)
  const connectedRef = useRef(false)
  const eventSourceRef = useRef<ReconnectingEventSource | null>(null)

  // Subscribe to store changes
  useEffect(() => {
    const unsub = store.subscribe(setMessages)
    return unsub
  }, [store])

  // Fetch history once
  useEffect(() => {
    if (!groupId || fetchedRef.current || store.isLoaded()) return
    fetchedRef.current = true

    const token = localStorage.getItem('auth_token')
    fetch(`/player/groups/${groupId}/messages`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(res => {
        if (!res.ok) return
        return res.json()
      })
      .then((data: { messages: GroupMessageRecord[] } | undefined) => {
        if (data?.messages) {
          store.setHistory(data.messages)
          connectedRef.current = true
        }
      })
      .catch(() => {
        // Silent fail — SSE will keep messages in sync
      })
  }, [groupId, store])

  // SSE subscription
  useEffect(() => {
    if (!groupId) return

    const token = localStorage.getItem('auth_token')
    const url = `/player/groups/${groupId}/events${token ? `?token=${encodeURIComponent(token)}` : ''}`

    try {
      const es = new ReconnectingEventSource(url, { maxReconnectionDelay: 8000 } as any)
      eventSourceRef.current = es

      es.addEventListener('open', () => {
        if (connectedRef.current) {
          // Reconnect: refetch history to fill gap
          const tok = localStorage.getItem('auth_token')
          fetch(`/player/groups/${groupId}/messages`, {
            headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
          })
            .then(r => r.ok ? r.json() : undefined)
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
            // Increment global unread for nav badge (SSE = new unseen message)
            if (payload.type !== 'system') {
              groupUnreadStore.setGroupUnread(groupId, store.all().filter(m => m.type !== 'system').length)
            }
          } catch {
            // malformed — ignore
          }
        }
      })

      es.addEventListener('poll.tally.updated', (event: Event) => {
        if (event instanceof MessageEvent) {
          try {
            const { pollId, tally } = JSON.parse(event.data) as { pollId: string; tally: PollTally }
            store.updatePollTally(pollId, tally)
          } catch {
            // malformed — ignore
          }
        }
      })

      es.addEventListener('poll.closed', (event: Event) => {
        if (event instanceof MessageEvent) {
          try {
            const { messageId, tally, closedAt } = JSON.parse(event.data) as {
              messageId: string
              pollId: string
              tally: PollTally
              closedAt: string
            }
            store.updatePollClosed(messageId, tally, typeof closedAt === 'string' ? closedAt : new Date(closedAt).toISOString())
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
        eventSourceRef.current = null
      }
    } catch {
      // SSE not available (e.g. in tests) — ignore
    }
  }, [groupId, store])

  // Clear global unread for this group while the panel is active (user is
  // viewing), and record the current count as "seen" so the next
  // useGroupUnread poll doesn't immediately re-flag it. Depends on `messages`
  // (not just `active`) so a late-arriving history fetch or a message
  // received while actively viewing both re-mark the latest count as seen.
  useEffect(() => {
    if (active) {
      groupUnreadStore.clearGroupUnread(groupId)
      markGroupSeen(groupId, messages.filter(m => m.type !== 'system').length)
    }
  }, [active, groupId, messages])

  // V1: count of text/announcement messages (no per-message read tracking for groups)
  const unreadCount = messages.filter(m => m.type !== 'system').length

  const send = useCallback(
    async (body: string): Promise<void> => {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/player/groups/${groupId}/messages`, {
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
      // Normalise field name: API returns senderNameSnapshot, store uses senderName
      const normalised: GroupMessageRecord = {
        ...msg,
        senderName: (msg as any).senderNameSnapshot ?? msg.senderName ?? null,
      }
      store.append(normalised)
    },
    [groupId, store]
  )

  return { messages, unreadCount, reconnecting, send }
}
