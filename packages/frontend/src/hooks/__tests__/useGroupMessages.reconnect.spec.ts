/**
 * Tests for refetch-on-reconnect in useGroupMessages (P1.11).
 *
 * Verifies that when the SSE connection is lost and re-established:
 *   1. The history endpoint is re-fetched
 *   2. Existing messages are not duplicated
 *   3. The reconnecting state is exposed so the UI can show an indicator
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGroupMessages, clearGroupMessageStores } from '../useGroupMessages'

const GROUP_ID = 'grp-reconnect-test'

const initialMessages = [
  { id: 'msg-1', conversationId: 'c-1', playerId: 'p-1', senderName: 'Alice', body: 'Hello', type: 'text' as const, createdAt: '2026-01-01T00:00:00Z', removedAt: null },
]

const newMessages = [
  ...initialMessages,
  { id: 'msg-2', conversationId: 'c-1', playerId: 'p-2', senderName: 'Bob', body: 'Hi', type: 'text' as const, createdAt: '2026-01-01T00:01:00Z', removedAt: null },
]

let mockOpenHandler: (() => void) | null = null
let mockErrorHandler: ((e: Event) => void) | null = null

jest.mock('reconnecting-eventsource', () => ({
  __esModule: true,
  default: class {
    addEventListener(event: string, handler: unknown) {
      if (event === 'open') mockOpenHandler = handler as () => void
      if (event === 'error') mockErrorHandler = handler as (e: Event) => void
    }
    close() {}
  },
}))

describe('useGroupMessages reconnect (P1.11)', () => {
  beforeEach(() => {
    clearGroupMessageStores()
    mockOpenHandler = null
    mockErrorHandler = null
    let fetchCount = 0
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCount++
      const msgs = fetchCount === 1 ? initialMessages : newMessages
      return Promise.resolve({
        ok: true,
        json: async () => ({ messages: msgs }),
      } as Response)
    })
  })

  afterEach(() => { delete (global as any).fetch })

  it('starts with reconnecting: false', async () => {
    const { result } = renderHook(() => useGroupMessages(GROUP_ID))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    expect(result.current.reconnecting).toBe(false)
  })

  it('sets reconnecting: true on SSE error', async () => {
    const { result } = renderHook(() => useGroupMessages(GROUP_ID))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    act(() => mockErrorHandler?.(new Event('error')))
    expect(result.current.reconnecting).toBe(true)
  })

  it('refetches history on SSE reconnect and merges without duplicates', async () => {
    const { result } = renderHook(() => useGroupMessages(GROUP_ID))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    act(() => mockErrorHandler?.(new Event('error')))
    await act(async () => { mockOpenHandler?.() })

    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    // No duplicates
    const ids = result.current.messages.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('clears reconnecting after catching up', async () => {
    const { result } = renderHook(() => useGroupMessages(GROUP_ID))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    act(() => mockErrorHandler?.(new Event('error')))
    await act(async () => { mockOpenHandler?.() })

    await waitFor(() => expect(result.current.reconnecting).toBe(false))
  })
})
