/**
 * useAnalytics - Event buffering and batching for analytics tracking
 *
 * Buffers events and flushes them in batches (max 10) to POST /api/analytics/events.
 * Auto-flushes on page unload using navigator.sendBeacon() for reliable delivery.
 * Silent fail on errors to never block the app.
 */

import { useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'

export interface AnalyticsEvent {
  timestamp: number
  userId: string
  eventType: string
  screen?: string
  duration?: number
  data?: Record<string, any>
}

export interface TrackData {
  screen?: string
  duration?: number
  [key: string]: any
}

const MAX_BUFFER_SIZE = 10
let eventBuffer: AnalyticsEvent[] = []

function flushEvents(): void {
  if (eventBuffer.length === 0) {
    return
  }

  const apiBase = process.env.REACT_APP_API_BASE || 'http://localhost:3000'
  const endpoint = `${apiBase}/api/analytics/events`
  const payload = JSON.stringify({ events: eventBuffer })

  try {
    // Try navigator.sendBeacon for unload scenarios (reliable delivery)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, payload)
    } else {
      // Fallback to fetch with keepalive for modern browsers
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Silent fail - don't log or crash
      })
    }
  } catch (error) {
    // Silent fail - debug log only in dev
    if (process.env.NODE_ENV === 'development') {
      console.debug('Analytics flush failed', error)
    }
  }

  // Clear buffer after flush attempt (even if it fails)
  eventBuffer = []
}

export function useAnalytics() {
  const { user } = useAuth()

  const track = useCallback(
    (eventType: string, data?: TrackData): void => {
      if (!user?.id) {
        return
      }

      const event: AnalyticsEvent = {
        timestamp: Date.now(),
        userId: user.id,
        eventType,
        ...data,
      }

      eventBuffer.push(event)

      // Auto-flush when buffer reaches max size
      if (eventBuffer.length >= MAX_BUFFER_SIZE) {
        flushEvents()
      }
    },
    [user?.id]
  )

  // Auto-flush on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushEvents()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  return { track }
}
