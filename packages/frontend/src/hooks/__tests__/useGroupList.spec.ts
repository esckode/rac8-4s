/**
 * ISSUE-73 — useGroupList becomes store-backed. It used to fetch once on
 * mount and never look at groupUnreadStore again, so a live
 * group.unread.changed push (which the store already reflects correctly)
 * never reached the per-row badge until a manual refresh re-ran the fetch.
 *
 * Covers: seeding the store from the fetch response, subscribing for live
 * updates (no second fetch), unsubscribing on unmount, and the precedence
 * rule — the store wins whenever it already holds an entry for a group.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGroupList, type GroupSummary } from '../useGroupList'
import { groupUnreadStore } from '../../state/group-unread-state'

function mockGroupsResponse(rows: Array<{ id: string; unreadCount: number }>) {
  const groups: GroupSummary[] = rows.map(r => ({
    id: r.id,
    name: `Group ${r.id}`,
    role: 'member',
    memberCount: 2,
    assistantEnabled: true,
    digestEnabled: false,
    unreadCount: r.unreadCount,
  }))
  return { ok: true, json: async () => ({ groups }) }
}

describe('useGroupList (ISSUE-73)', () => {
  beforeEach(() => {
    groupUnreadStore.reset()
    localStorage.setItem('auth_token', 'test-token')
  })

  afterEach(() => {
    delete (global as any).fetch
    localStorage.clear()
  })

  it("seeds groupUnreadStore with each row's unreadCount after the fetch resolves", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockGroupsResponse([{ id: 'g1', unreadCount: 3 }]))

    renderHook(() => useGroupList())

    await waitFor(() => expect(groupUnreadStore.getGroupUnread('g1')).toBe(3))
  })

  it('re-renders with the store\'s live count on a store change, with no second fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockGroupsResponse([{ id: 'g1', unreadCount: 0 }]))

    const { result } = renderHook(() => useGroupList())
    await waitFor(() => expect(result.current.groups).toHaveLength(1))
    expect(result.current.groups[0].unreadCount).toBe(0)

    // Simulates the SSE-driven path: usePersonalEventsStream -> refetchGroupUnread
    // -> groupUnreadStore.setGroupUnread, entirely independent of this hook.
    act(() => {
      groupUnreadStore.setGroupUnread('g1', 4)
    })

    await waitFor(() => expect(result.current.groups[0].unreadCount).toBe(4))
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
  })

  it('unsubscribes from the store on unmount', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockGroupsResponse([{ id: 'g1', unreadCount: 0 }]))

    const realSubscribe = groupUnreadStore.subscribe.bind(groupUnreadStore)
    const unsubSpy = jest.fn()
    const subscribeSpy = jest.spyOn(groupUnreadStore, 'subscribe').mockImplementation(cb => {
      const realUnsub = realSubscribe(cb)
      return () => {
        unsubSpy()
        realUnsub()
      }
    })

    const { unmount } = renderHook(() => useGroupList())
    await waitFor(() => expect(subscribeSpy).toHaveBeenCalledTimes(1))

    unmount()

    expect(unsubSpy).toHaveBeenCalledTimes(1)
    subscribeSpy.mockRestore()
  })

  it('precedence: a pre-existing store entry wins over a stale fetch response for the same group', async () => {
    // A group.unread.changed push already landed and set the true count...
    groupUnreadStore.setGroupUnread('g1', 7)
    // ...but this hook's own /player/groups request was in flight before that
    // and resolves with an older snapshot.
    global.fetch = jest.fn().mockResolvedValue(mockGroupsResponse([{ id: 'g1', unreadCount: 0 }]))

    const { result } = renderHook(() => useGroupList())

    await waitFor(() => expect(result.current.groups).toHaveLength(1))
    expect(result.current.groups[0].unreadCount).toBe(7)
  })
})
