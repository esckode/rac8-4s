/**
 * ISSUE-56 — GroupUnreadStore is now backed by server-side unread counts
 * (GET /player/groups' unreadCount), not a localStorage last-seen diff.
 * getLastSeenCount/markGroupSeen are gone; groupsWithUnread() is new (the
 * Groups nav badge counts *groups with unread*, not total messages); the
 * Subscriber signature drops its `total` argument since different
 * consumers now want different derived values.
 */
import { groupUnreadStore } from '../group-unread-state'

describe('GroupUnreadStore (ISSUE-56)', () => {
  beforeEach(() => {
    groupUnreadStore.reset()
  })

  it('groupsWithUnread() counts groups with unread, not total messages', () => {
    groupUnreadStore.setGroupUnread('g1', 40)
    groupUnreadStore.setGroupUnread('g2', 40)
    groupUnreadStore.setGroupUnread('g3', 40)

    expect(groupUnreadStore.groupsWithUnread()).toBe(3)
    expect(groupUnreadStore.total()).toBe(120)
  })

  it('a group with 0 unread does not count toward groupsWithUnread()', () => {
    groupUnreadStore.setGroupUnread('g1', 5)
    groupUnreadStore.setGroupUnread('g2', 0)

    expect(groupUnreadStore.groupsWithUnread()).toBe(1)
  })

  it('clearGroupUnread(groupId) removes that group from groupsWithUnread()', () => {
    groupUnreadStore.setGroupUnread('g1', 5)
    groupUnreadStore.setGroupUnread('g2', 3)
    expect(groupUnreadStore.groupsWithUnread()).toBe(2)

    groupUnreadStore.clearGroupUnread('g1')

    expect(groupUnreadStore.groupsWithUnread()).toBe(1)
  })

  it('subscribers are notified with no arguments on change', () => {
    const cb = jest.fn()
    const unsub = groupUnreadStore.subscribe(cb)

    groupUnreadStore.setGroupUnread('g1', 1)

    expect(cb).toHaveBeenCalledWith()
    expect(cb.mock.calls[0]).toHaveLength(0)
    unsub()
  })

  it('reset() clears all groups', () => {
    groupUnreadStore.setGroupUnread('g1', 5)
    groupUnreadStore.reset()

    expect(groupUnreadStore.groupsWithUnread()).toBe(0)
    expect(groupUnreadStore.total()).toBe(0)
  })
})
