/**
 * useSSE - Server-Sent Events hook for real-time tournament updates
 *
 * Manages SSE connection with auto-reconnect and data consistency.
 * On reconnect after disconnect, refetches full bundle to ensure fresh data.
 */

import { useEffect, useRef, useState } from 'react'
import ReconnectingEventSource from 'reconnecting-eventsource'
import { standingsStore, matchStore } from '../state'
import { useTournament } from './useTournament'
import { useAnalytics } from './useAnalytics'
import type { StandingsUpdatedPayload, BracketPublishedPayload } from '../types'

export interface SSEState {
  connected: boolean
  reconnecting: boolean
  error: string | null
}

export function useSSE(tournamentId: string): SSEState {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventSourceRef = useRef<ReconnectingEventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wasConnectedRef = useRef(false)
  const eventTimestampRef = useRef<number>(0)

  const { refetch: refetchTournament } = useTournament(tournamentId)
  const { track } = useAnalytics()

  useEffect(() => {
    // Only open connection if tournamentId is provided
    if (!tournamentId) {
      return
    }

    const apiBase = ''  // Use relative paths with Vite proxy (/api)
    const eventSourceUrl = `${apiBase}/tournaments/${tournamentId}/events`

    try {
      const eventSource = new ReconnectingEventSource(eventSourceUrl, {
        maxReconnectionDelay: 8000,
      } as any)

      eventSourceRef.current = eventSource

      // Handle connection open
      eventSource.addEventListener('open', () => {
        setConnected(true)
        setReconnecting(false)
        setError(null)

        // If we were connected before (reconnect after disconnect), refetch bundle
        if (wasConnectedRef.current) {
          refetchTournament()
        }
        wasConnectedRef.current = true
      })

      // Handle standings.updated event
      eventSource.addEventListener('standings.updated', (event: Event) => {
        try {
          if (event instanceof MessageEvent) {
            const receivedAt = Date.now()
            const payload: StandingsUpdatedPayload = JSON.parse(event.data)
            standingsStore.update(payload)

            // Refetch the authoritative bundle so the rendered standings reflect
            // the update (the store is per-group; the view reads the bundle).
            refetchTournament()

            // Track SSE update latency
            const latency = eventTimestampRef.current ? receivedAt - eventTimestampRef.current : 0
            track('sse_update', {
              eventType: 'standings.updated',
              latency,
              recordCount: payload.standings?.length ?? 0,
            })
          }
        } catch (err) {
          console.error('Failed to parse standings.updated event', err)
          // Don't crash on malformed data
        }
      })

      // Handle bracket.published event
      eventSource.addEventListener('bracket.published', (event: Event) => {
        try {
          if (event instanceof MessageEvent) {
            const receivedAt = Date.now()
            const payload: BracketPublishedPayload = JSON.parse(event.data)

            // Refetch so the bracket appears as soon as it is published.
            refetchTournament()

            // Track SSE update
            const latency = eventTimestampRef.current ? receivedAt - eventTimestampRef.current : 0
            track('sse_update', {
              eventType: 'bracket.published',
              latency,
            })
          }
        } catch (err) {
          console.error('Failed to parse bracket.published event', err)
          // Don't crash on malformed data
        }
      })

      // Handle bracket.updated event (a knockout score was submitted)
      eventSource.addEventListener('bracket.updated', (event: Event) => {
        try {
          if (event instanceof MessageEvent) {
            const receivedAt = Date.now()
            JSON.parse(event.data)

            // Refetch so the bracket advances live with the new result.
            refetchTournament()

            const latency = eventTimestampRef.current ? receivedAt - eventTimestampRef.current : 0
            track('sse_update', {
              eventType: 'bracket.updated',
              latency,
            })
          }
        } catch (err) {
          console.error('Failed to parse bracket.updated event', err)
          // Don't crash on malformed data
        }
      })

      // Handle error
      eventSource.addEventListener('error', () => {
        setConnected(false)
        setReconnecting(true)

        // Clear any pending refetch timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
      })

      return () => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      setConnected(false)
    }
  }, [tournamentId, refetchTournament, track])

  return {
    connected,
    reconnecting,
    error,
  }
}
