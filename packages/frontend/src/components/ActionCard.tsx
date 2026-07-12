/**
 * ActionCard — B3.2
 *
 * Inline confirm-card widget rendered in the group chat stream for @coach
 * write-action proposals (design §11 B-Q1-B-Q9). A pure, controlled
 * component: the parent (GroupChatPanel) owns the confirm/dismiss API calls
 * and card.updated SSE patching — this component only renders the given
 * state and reports clicks.
 *
 * "Expired" is never a stored status (B-Q1) — it's computed here client-side
 * by comparing expiresAt against a ticking clock, same as a pending card
 * silently becoming inert once its window passes with no server round-trip.
 */

import React, { useEffect, useState } from 'react'

export type ActionCardStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled'

export interface ActionCardProps {
  body: string
  status: ActionCardStatus
  expiresAt: string
  result: Record<string, unknown> | null
  isProposer: boolean
  onConfirm: () => void
  onDismiss: () => void
}

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export const ActionCard: React.FC<ActionCardProps> = ({
  body,
  status,
  expiresAt,
  result,
  isProposer,
  onConfirm,
  onDismiss,
}) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (status !== 'pending') return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [status])

  const expiresAtMs = new Date(expiresAt).getTime()
  const isExpired = status === 'pending' && now > expiresAtMs
  const isActionable = status === 'pending' && !isExpired && isProposer

  let statusLabel: string | null = null
  if (status === 'confirmed') statusLabel = 'Confirmed'
  else if (status === 'cancelled') statusLabel = 'Dismissed'
  else if (status === 'failed') {
    const reason = typeof result?.reason === 'string' ? result.reason : 'This action could not be completed.'
    statusLabel = `Failed — ${reason}`
  } else if (isExpired) {
    statusLabel = 'Expired'
  }

  return (
    <div
      data-testid="action-card"
      className="rounded-lg border border-[--court-200] p-3 bg-[--court-50] space-y-2"
    >
      <p data-testid="action-card-body" className="text-sm text-[--ink-900]">
        {body}
      </p>

      {status === 'pending' && !isExpired && (
        <p data-testid="action-card-countdown" className="text-xs text-[--ink-500]">
          Expires in {formatCountdown(expiresAtMs - now)}
        </p>
      )}

      {statusLabel && (
        <p data-testid="action-card-status" className="text-xs font-medium text-[--ink-600]">
          {statusLabel}
        </p>
      )}

      {isActionable && (
        <div className="flex gap-2">
          <button
            data-testid="action-card-confirm-button"
            onClick={onConfirm}
            className="flex-1 py-1.5 text-xs rounded bg-[--court-500] text-white font-medium hover:bg-[--court-600]"
          >
            Confirm
          </button>
          <button
            data-testid="action-card-dismiss-button"
            onClick={onDismiss}
            className="flex-1 py-1.5 text-xs rounded border border-[--border] text-[--ink-700] hover:border-[--court-400]"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
