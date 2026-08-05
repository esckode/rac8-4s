/**
 * ISSUE-56 (frontend) — useGroupMessages PATCHes /:groupId/read once when
 * the panel becomes active and once on unmount/active flipping false — NOT
 * once per arriving message. The local optimistic clear (clearGroupUnread)
 * still fires on every message change; only the network call is narrowed.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGroupMessages, clearGroupMessageStores } from '../useGroupMessages'
import { groupUnreadStore } from '../../state/group-unread-state'

const GROUP_ID = 'grp-markread-test'

let mockMessageCreatedHandler: ((e: Event) => void) | null = null

jest.mock('reconnecting-eventsource', () => ({
  __esModule: true,
  default: class {
    addEventListener(event: string, handler: unknown) {
      if (event === 'message.created') mockMessageCreatedHandler = handler as (e: Event) => void
    }
    close() {}
  },
}))

function patchCalls() {
  return (global.fetch as jest.Mock).mock.calls.filter(c => c[1]?.method === 'PATCH')
}

describe('useGroupMessages mark-read PATCH (ISSUE-56)', () => {
  beforeEach(() => {
    clearGroupMessageStores()
    mockMessageCreatedHandler = null
    localStorage.setItem('auth_token', 'test-token')
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) })
  })

  afterEach(() => {
    // Not `delete (global as any).fetch` here: RTL's auto-cleanup unmounts
    // any still-rendered hook AFTER this afterEach runs (inner-scope hooks
    // fire before the outer auto-cleanup one), and unmounting fires this
    // hook's own cleanup, which calls fetch() for the mark-read PATCH — a
    // deleted global.fetch turns that into a ReferenceError. Each test's
    // beforeEach reassigns a fresh mock, so leaving it in place is safe.
    localStorage.clear()
  })

  it('PATCHes /player/groups/:groupId/read when the panel becomes active', async () => {
    const { rerender } = renderHook(({ active }) => useGroupMessages(GROUP_ID, active), {
      initialProps: { active: false },
    })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(patchCalls()).toHaveLength(0)

    rerender({ active: true })

    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    expect(patchCalls()[0][0]).toBe(`/player/groups/${GROUP_ID}/read`)
    expect(patchCalls()[0][1]).toEqual(
      expect.objectContaining({ method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) })
    )
  })

  it('PATCHes again when the panel goes inactive (unmount)', async () => {
    const { unmount } = renderHook(() => useGroupMessages(GROUP_ID, true))
    await waitFor(() => expect(patchCalls()).toHaveLength(1))

    unmount()

    await waitFor(() => expect(patchCalls()).toHaveLength(2))
  })

  it('does NOT send an extra PATCH for every message that arrives while active', async () => {
    const { result } = renderHook(() => useGroupMessages(GROUP_ID, true))
    await waitFor(() => expect(patchCalls()).toHaveLength(1))

    act(() => {
      mockMessageCreatedHandler?.(
        new MessageEvent('message.created', {
          data: JSON.stringify({
            id: 'm-2', conversationId: 'c-1', playerId: 'p-2', senderName: 'Bob',
            body: 'hi', type: 'text', createdAt: new Date().toISOString(), removedAt: null,
          }),
        })
      )
    })
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    // The message arrived and the local store updated, but the PATCH count
    // must still be exactly 1 — this is the trap: a naive effect keyed on
    // `messages` sends one request per message.
    expect(patchCalls()).toHaveLength(1)
  })

  // ─── ISSUE-73 R3 ────────────────────────────────────────────────────────

  it('does NOT write a message-total into groupUnreadStore on message.created', async () => {
    groupUnreadStore.reset()
    renderHook(() => useGroupMessages(GROUP_ID))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    act(() => {
      mockMessageCreatedHandler?.(
        new MessageEvent('message.created', {
          data: JSON.stringify({
            id: 'm-3', conversationId: 'c-1', playerId: 'p-2', senderName: 'Bob',
            body: 'hi', type: 'text', createdAt: new Date().toISOString(), removedAt: null,
          }),
        })
      )
    })

    await waitFor(() => expect(groupUnreadStore.total()).toBe(0))
  })
})
