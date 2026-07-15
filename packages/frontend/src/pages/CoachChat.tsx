/**
 * CoachChat — /coach (S7)
 *
 * The 1:1 Coach conversation. Reuses ActionCard for remember-cards (same
 * shell/states as group write-action cards) and the ReconnectingIndicator;
 * every message here is a turn, so no @mention composer affordance.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCoachMessages, type GroupMessageRecord } from '../hooks/useCoachMessages'
import { ActionCard } from '../components/ActionCard'
import { ReconnectingIndicator } from '../components/shared'

export const CoachChat: React.FC = () => {
  const { messages, send, reconnecting } = useCoachMessages()
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const cardActingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleConfirmCard = useCallback(async (cardId: string) => {
    if (cardActingRef.current.has(cardId)) return
    cardActingRef.current.add(cardId)
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/player/coach/cards/${cardId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      })
      // card.updated SSE will patch the store — no local state update needed
    } catch {
      // Silent fail — SSE will sync
    } finally {
      cardActingRef.current.delete(cardId)
    }
  }, [])

  const handleDismissCard = useCallback(async (cardId: string) => {
    if (cardActingRef.current.has(cardId)) return
    cardActingRef.current.add(cardId)
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/player/coach/cards/${cardId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      })
    } catch {
      // Silent fail — SSE will sync
    } finally {
      cardActingRef.current.delete(cardId)
    }
  }, [])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      await send(trimmed)
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div data-testid="coach-chat-page" className="flex flex-col h-full min-h-[300px]">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-[--border] bg-[--surface]">
        <h2 className="text-xl font-bold text-[--ink-900]">Coach</h2>
        <span className="text-xs text-[--ink-500]">Your private space</span>
      </header>

      <div className="flex-1 overflow-y-auto space-y-2 p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-[--ink-500] py-8">No messages yet</p>
        )}
        {messages.map((m: GroupMessageRecord) => {
          if (m.type === 'assistant') {
            const hasCard = m.cardId && m.cardStatus && m.cardExpiresAt
            return (
              <div
                key={m.id}
                data-testid="coach-assistant-bubble"
                className="mr-auto max-w-[85%] rounded-lg p-3 text-sm bg-[--court-50] border border-[--court-200] space-y-2"
              >
                {hasCard ? (
                  <ActionCard
                    body={m.body}
                    status={m.cardStatus!}
                    expiresAt={m.cardExpiresAt!}
                    result={m.cardResult ?? null}
                    isProposer={m.cardProposerPlayerId === user?.playerId}
                    onConfirm={() => handleConfirmCard(m.cardId!)}
                    onDismiss={() => handleDismissCard(m.cardId!)}
                    action={m.cardAction ?? undefined}
                    args={m.cardArgs ?? undefined}
                  />
                ) : (
                  <p className="text-[--ink-900]">{m.body}</p>
                )}
                <p className="text-xs text-[--court-700] font-medium">
                  Coach · {new Date(m.createdAt).toLocaleTimeString()}
                </p>
              </div>
            )
          }

          return (
            <div
              key={m.id}
              data-testid="coach-player-bubble"
              className="ml-auto max-w-[85%] rounded-lg p-3 text-sm bg-[--ink-50]"
            >
              <p className="text-[--ink-900]">{m.body}</p>
              <p className="text-xs text-[--ink-500] mt-1 text-right">
                {new Date(m.createdAt).toLocaleTimeString()}
              </p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <ReconnectingIndicator visible={reconnecting} />

      {error && (
        <p className="px-4 py-2 text-sm text-[--rose-700] bg-[--rose-50]">{error}</p>
      )}

      <form onSubmit={handleSend} className="p-3 flex gap-2 border-t border-[--border]">
        <input
          data-testid="coach-message-input"
          type="text"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Ask Coach anything…"
          disabled={sending}
          className="flex-1 border border-[--border] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--court-400]"
        />
        <button
          data-testid="coach-message-send-button"
          type="submit"
          disabled={!body.trim() || sending}
          className="px-4 py-2 bg-[--court-500] text-white text-sm rounded disabled:opacity-50 hover:bg-[--court-600]"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
