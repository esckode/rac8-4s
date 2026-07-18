/**
 * D4 — offline banner + per-view "Updated HH:MM" driver.
 *
 * Mirrors the notify503 module-listener pattern (ServiceUnavailableContext):
 * apiFetch and useTournament's fetchTournamentBundle are plain functions, not
 * React, so they reach the provider through a module-level callback rather
 * than a hook.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

type SnapshotEvent =
  | { type: 'fallback'; path: string; cachedAt: string }
  | { type: 'fresh'; path: string }

let _listener: ((event: SnapshotEvent) => void) | null = null

/** Call when a venue-read response carries `sw-cache: fallback`. */
export function notifyOfflineSnapshot(path: string, cachedAt: string): void {
  _listener?.({ type: 'fallback', path, cachedAt })
}

/** Call when a venue-read response is a normal (non-fallback) success. */
export function clearOfflineSnapshot(path: string): void {
  _listener?.({ type: 'fresh', path })
}

interface OfflineSnapshotContextValue {
  isOffline: boolean
  updatedAtFor: (path: string) => string | undefined
}

const defaultValue: OfflineSnapshotContextValue = {
  isOffline: false,
  updatedAtFor: () => undefined,
}

const OfflineSnapshotContext = createContext<OfflineSnapshotContextValue>(defaultValue)

export function OfflineSnapshotProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine)
  const [timestamps, setTimestamps] = useState<Record<string, string>>({})

  useEffect(() => {
    _listener = (event) => {
      if (event.type === 'fallback') {
        setIsOffline(true)
        setTimestamps((prev) => ({ ...prev, [event.path]: event.cachedAt }))
      } else {
        setIsOffline(false)
        setTimestamps((prev) => {
          if (!(event.path in prev)) return prev
          const next = { ...prev }
          delete next[event.path]
          return next
        })
      }
    }
    return () => {
      _listener = null
    }
  }, [])

  useEffect(() => {
    const goOnline = () => setIsOffline(false)
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const updatedAtFor = useCallback((path: string) => timestamps[path], [timestamps])

  return (
    <OfflineSnapshotContext.Provider value={{ isOffline, updatedAtFor }}>
      {children}
    </OfflineSnapshotContext.Provider>
  )
}

export function useOfflineSnapshot(): OfflineSnapshotContextValue {
  return useContext(OfflineSnapshotContext)
}
