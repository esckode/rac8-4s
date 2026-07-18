import React from 'react'
import { formatUpdatedAt } from './formatUpdatedAt'

/** "Updated HH:MM" shown on a venue view when its data came from the SW's
 * offline fallback (D4). Renders nothing once the view has fresh data. */
export function SnapshotUpdatedAt({ updatedAt }: { updatedAt?: string }): React.ReactElement | null {
  if (!updatedAt) return null

  return (
    <span data-testid="snapshot-updated-at" className="text-xs text-[--ink-500]">
      {formatUpdatedAt(updatedAt)}
    </span>
  )
}
