import React, { useEffect, useState } from 'react'
import { getUpdateAvailable, applyUpdate, subscribe } from './register'

/** D9 — a new SW waits; this prompts the player to refresh rather than
 * seizing live tabs with skipWaiting()/clients.claim(). */
export function UpdateToast(): React.ReactElement | null {
  const [updateAvailable, setUpdateAvailable] = useState(getUpdateAvailable())

  useEffect(() => subscribe(() => setUpdateAvailable(getUpdateAvailable())), [])

  if (!updateAvailable) return null

  return (
    <div
      data-testid="update-toast"
      role="status"
      className="fixed bottom-[--s-4] left-1/2 -translate-x-1/2 flex items-center gap-[--s-3] bg-[--ink-900] text-white rounded-[--r-lg] px-[--s-4] py-[--s-3] shadow-lg z-50"
    >
      <span className="text-sm">Update available</span>
      <button
        type="button"
        onClick={() => applyUpdate()}
        className="text-sm font-medium text-[--court-300] underline"
      >
        Refresh
      </button>
    </div>
  )
}
