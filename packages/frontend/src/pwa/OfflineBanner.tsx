import React from 'react'
import { useOfflineSnapshot } from './OfflineSnapshotContext'

/** Global "Offline — showing saved data" banner (D4). Distinct color family
 * from ReconnectingIndicator (gold/reconnecting) — this is ink/neutral. */
export function OfflineBanner(): React.ReactElement | null {
  const { isOffline } = useOfflineSnapshot()
  if (!isOffline) return null

  return (
    <div
      data-testid="offline-banner"
      role="status"
      className="bg-[--ink-100] border-b border-[--ink-300] text-[--ink-800] text-sm text-center py-[--s-2]"
    >
      Offline — showing saved data
    </div>
  )
}
