/**
 * ReconnectingIndicator - Floating banner for WebSocket reconnect state
 *
 * Shown when the realtime connection drops and the client is retrying.
 * Hidden (not rendered) when visible is false.
 */

import React from 'react'
import '../../styles/globals.css'

export interface ReconnectingIndicatorProps {
  visible?: boolean
  className?: string
}

export const ReconnectingIndicator: React.FC<ReconnectingIndicatorProps> = ({
  visible = true,
  className,
}) => {
  if (!visible) return null

  return (
    <div
      data-testid="reconnecting-indicator"
      role="status"
      className={`flex items-center gap-[--s-2] px-[--s-3] py-[--s-2] bg-[--gold-200] border border-[--gold-400] rounded-[--r-md] text-sm text-[--ink-900] ${className ?? ''}`}
    >
      <svg
        className="w-4 h-4 text-[--gold-600] animate-spin flex-shrink-0"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span>Reconnecting…</span>
    </div>
  )
}

ReconnectingIndicator.displayName = 'ReconnectingIndicator'
