/**
 * B3.2 [RED→GREEN] — useGroupMessages card.updated SSE handling.
 *
 * Mirrors useGroupMessages.reconnect.spec.ts's reconnecting-eventsource mock
 * pattern (the only existing precedent for driving SSE handlers in tests).
 * card.updated patches the matching message's card fields in place — no
 * re-fetch, same as poll.tally.updated/poll.closed.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGroupMessages, clearGroupMessageStores } from '../useGroupMessages'

const GROUP_ID = 'grp-card-test'

const initialMessages = [
  {
    id: 'msg-card-1',
    conversationId: 'c-1',
    playerId: null,
    senderName: 'Coach',
    body: 'Coach drafted a score.',
    type: 'assistant' as const,
    createdAt: '2026-07-12T00:00:00Z',
    removedAt: null,
    cardId: 'card-1',
    cardAction: 'propose_score',
    cardArgs: { tournamentId: 't1', matchId: 'm1' },
    cardStatus: 'pending' as const,
    cardExpiresAt: '2026-07-12T00:15:00Z',
    cardSchemaVersion: 1,
    cardResult: null,
    cardProposerPlayerId: 'p-1',
  },
]

let mockCardUpdatedHandler: ((e: Event) => void) | null = null

jest.mock('reconnecting-eventsource', () => ({
  __esModule: true,
  default: class {
    addEventListener(event: string, handler: unknown) {
      if (event === 'card.updated') mockCardUpdatedHandler = handler as (e: Event) => void
    }
    close() {}
  },
}))

describe('useGroupMessages card.updated (B3.2)', () => {
  beforeEach(() => {
    clearGroupMessageStores()
    mockCardUpdatedHandler = null
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: initialMessages }),
    } as Response)
  })

  afterEach(() => { delete (global as any).fetch })

  it('patches the card status in place on card.updated', async () => {
    const { result } = renderHook(() => useGroupMessages(GROUP_ID))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    expect(result.current.messages[0].cardStatus).toBe('pending')

    act(() => {
      mockCardUpdatedHandler?.(
        new MessageEvent('card.updated', {
          data: JSON.stringify({ messageId: 'msg-card-1', cardId: 'card-1', status: 'confirmed', result: { ok: true } }),
        })
      )
    })

    await waitFor(() => expect(result.current.messages[0].cardStatus).toBe('confirmed'))
    expect(result.current.messages[0].cardResult).toEqual({ ok: true })
  })

  it('ignores card.updated for an unknown cardId', async () => {
    const { result } = renderHook(() => useGroupMessages(GROUP_ID))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    act(() => {
      mockCardUpdatedHandler?.(
        new MessageEvent('card.updated', {
          data: JSON.stringify({ messageId: 'msg-other', cardId: 'card-other', status: 'confirmed' }),
        })
      )
    })

    expect(result.current.messages[0].cardStatus).toBe('pending')
  })
})
