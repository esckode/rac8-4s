/**
 * ISSUE-56 — useGroupUnread renamed to useGroupsWithUnread: it now reads
 * the server-computed unreadCount per group straight from GET /player/groups
 * (no more localStorage last-seen diffing) and returns the count of groups
 * with unread, not a total message count.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { useGroupsWithUnread } from '../useGroupUnread'
import { groupUnreadStore } from '../../state/group-unread-state'

describe('useGroupsWithUnread (ISSUE-56)', () => {
  beforeEach(() => {
    groupUnreadStore.reset()
    localStorage.setItem('auth_token', 'test-token')
  })

  afterEach(() => {
    delete (global as any).fetch
    localStorage.clear()
  })

  it('returns the count of groups with unread, not total messages', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        groups: [
          { id: 'g1', unreadCount: 40 },
          { id: 'g2', unreadCount: 40 },
          { id: 'g3', unreadCount: 0 },
        ],
      }),
    })

    const { result } = renderHook(() => useGroupsWithUnread())

    await waitFor(() => expect(result.current).toBe(2))
  })

  it('reads unreadCount directly from the API response — no diffing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [{ id: 'g1', unreadCount: 7 }] }),
    })

    renderHook(() => useGroupsWithUnread())

    await waitFor(() => expect(groupUnreadStore.total()).toBe(7))
  })
})
