/**
 * ISSUE-62 — usePersonalEventsStream: the app-wide persistent connection to
 * GET /player/notifications/events that makes the Alerts and Groups nav
 * badges update live. Routes 'message.created' to notificationUnreadStore
 * (Alerts badge) and 'group.unread.changed' to a groupUnreadStore resync
 * (Groups badge) — both hooks' own docblocks previously described avoiding
 * exactly this kind of persistent connection because it broke Playwright's
 * `networkidle` wait; this hook is what supersedes that (see the e2e
 * networkidle rewrite in the same change).
 */
import { renderHook } from '@testing-library/react'
import { usePersonalEventsStream } from '../usePersonalEventsStream'
import { notificationUnreadStore } from '../../state/notification-unread-state'
import { groupUnreadStore } from '../../state/group-unread-state'

let mockHandlers: Record<string, (e: unknown) => void> = {}

jest.mock('reconnecting-eventsource', () => ({
  __esModule: true,
  default: class {
    addEventListener(event: string, handler: (e: unknown) => void) {
      mockHandlers[event] = handler
    }
    close() {}
  },
}))

describe('usePersonalEventsStream (ISSUE-62)', () => {
  beforeEach(() => {
    mockHandlers = {}
    notificationUnreadStore.clear()
    groupUnreadStore.reset()
    localStorage.setItem('auth_token', 'test-token')
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [{ id: 'g1', unreadCount: 3 }] }),
    })
  })

  afterEach(() => {
    delete (global as any).fetch
    localStorage.clear()
  })

  it('increments notificationUnreadStore on a message.created event', () => {
    renderHook(() => usePersonalEventsStream())

    expect(notificationUnreadStore.get()).toBe(0)
    mockHandlers['message.created']?.(new MessageEvent('message.created'))
    expect(notificationUnreadStore.get()).toBe(1)
  })

  it('resyncs groupUnreadStore from GET /player/groups on a group.unread.changed event', async () => {
    renderHook(() => usePersonalEventsStream())

    mockHandlers['group.unread.changed']?.(new MessageEvent('group.unread.changed'))

    await new Promise((r) => setTimeout(r, 0))
    expect(global.fetch).toHaveBeenCalledWith('/player/groups', expect.anything())
    expect(groupUnreadStore.total()).toBe(3)
  })

  it('does not connect without an auth token', () => {
    localStorage.clear()
    renderHook(() => usePersonalEventsStream())

    expect(mockHandlers['message.created']).toBeUndefined()
  })
})
