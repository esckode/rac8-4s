/**
 * MatchMessageCompose — V5.2
 *
 * Inline compose panel that opens when a player taps "Message opponent" on a
 * match card.  Sends a DM with both `recipientPlayerId` (the opponent) and
 * `matchId` so the backend threads it under the match conversation.
 *
 * This is NOT an arbitrary-DM panel — the recipient is always the opponent
 * resolved by the MatchCard, and is fixed for the lifetime of the panel.
 */

import React, { useState } from 'react'
import { playerCache } from '../state'

interface Props {
  tournamentId: string
  matchId: string
  opponentPlayerId: string
  onClose: () => void
}

export const MatchMessageCompose: React.FC<Props> = ({
  tournamentId,
  matchId,
  opponentPlayerId,
  onClose,
}) => {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const opponent = playerCache.get(opponentPlayerId)
  const opponentName = opponent?.name ?? opponentPlayerId

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/tournaments/${tournamentId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          body: trimmed,
          recipientPlayerId: opponentPlayerId,
          matchId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Send failed' }))
        throw new Error(err.message ?? 'Send failed')
      }
      setBody('')
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      data-testid="match-message-compose"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-[--s-4]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-[--r-lg] shadow-lg p-[--s-4]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-[--s-3]">
          <div data-testid="match-compose-context">
            <p className="text-sm font-semibold text-[--ink-900]">
              Message opponent
            </p>
            <p className="text-xs text-[--ink-500]">To: {opponentName}</p>
          </div>
          <button
            data-testid="match-compose-close"
            onClick={onClose}
            className="text-[--ink-500] hover:text-[--ink-900] transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {sent ? (
          <div className="py-[--s-4] text-center">
            <p className="text-sm text-[--ink-700]">Message sent!</p>
            <button
              onClick={onClose}
              className="mt-[--s-3] text-sm text-[--court-600] hover:underline"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex flex-col gap-[--s-3]">
            {error && (
              <p className="text-sm text-[--rose-700] bg-[--rose-50] px-3 py-2 rounded">
                {error}
              </p>
            )}
            <textarea
              data-testid="match-compose-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a message to your opponent…"
              disabled={sending}
              rows={3}
              className="w-full border border-[--border] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--court-400] resize-none"
            />
            <div className="flex gap-[--s-2] justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-[--ink-700] hover:text-[--ink-900]"
              >
                Cancel
              </button>
              <button
                data-testid="match-compose-send"
                type="submit"
                disabled={!body.trim() || sending}
                className="px-4 py-2 bg-[--court-500] text-white text-sm rounded disabled:opacity-50 hover:bg-[--court-600]"
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
