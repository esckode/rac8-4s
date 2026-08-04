/**
 * ISSUE-62 — broadcastGroupUnreadChanged: nudge every OTHER group member's
 * live badge stream (channel `player:<id>`, event `group.unread.changed`)
 * whenever a new message lands in a group. Excludes the sender (their own
 * badge doesn't need a nudge for a message they just sent) and is a no-op
 * without a broadcastBus (SSE not configured).
 */
import { broadcastGroupUnreadChanged } from '../../group-unread-broadcast'

function fakeGroupRepo(members: Array<{ playerId: string; notifyLevel: string; name: string }>) {
  return {
    getGroupMembersForNotify: jest.fn().mockResolvedValue(members),
  } as any
}

describe('broadcastGroupUnreadChanged (ISSUE-62)', () => {
  it('emits group.unread.changed to every member except the sender', async () => {
    const groupRepo = fakeGroupRepo([
      { playerId: 'p1', notifyLevel: 'all', name: 'Alice' },
      { playerId: 'p2', notifyLevel: 'all', name: 'Bob' },
      { playerId: 'p3', notifyLevel: 'muted', name: 'Carol' },
    ])
    const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }

    await broadcastGroupUnreadChanged(groupRepo, broadcastBus as any, 'grp-1', 'p1')

    expect(broadcastBus.emit).toHaveBeenCalledTimes(2)
    expect(broadcastBus.emit).toHaveBeenCalledWith('player:p2', 'group.unread.changed', { groupId: 'grp-1' })
    expect(broadcastBus.emit).toHaveBeenCalledWith('player:p3', 'group.unread.changed', { groupId: 'grp-1' })
    expect(broadcastBus.emit).not.toHaveBeenCalledWith('player:p1', expect.anything(), expect.anything())
  })

  it('is unaffected by notify_level — muted members still get the badge nudge (unread is unconditional, per ISSUE-56)', async () => {
    const groupRepo = fakeGroupRepo([
      { playerId: 'p1', notifyLevel: 'all', name: 'Alice' },
      { playerId: 'p2', notifyLevel: 'muted', name: 'Bob' },
    ])
    const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }

    await broadcastGroupUnreadChanged(groupRepo, broadcastBus as any, 'grp-1', 'p1')

    expect(broadcastBus.emit).toHaveBeenCalledWith('player:p2', 'group.unread.changed', { groupId: 'grp-1' })
  })

  it('is a no-op when no broadcastBus is configured', async () => {
    const groupRepo = fakeGroupRepo([{ playerId: 'p2', notifyLevel: 'all', name: 'Bob' }])

    await broadcastGroupUnreadChanged(groupRepo, undefined, 'grp-1', 'p1')

    expect(groupRepo.getGroupMembersForNotify).not.toHaveBeenCalled()
  })

  it('emits nothing when the sender is the only member', async () => {
    const groupRepo = fakeGroupRepo([{ playerId: 'p1', notifyLevel: 'all', name: 'Alice' }])
    const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }

    await broadcastGroupUnreadChanged(groupRepo, broadcastBus as any, 'grp-1', 'p1')

    expect(broadcastBus.emit).not.toHaveBeenCalled()
  })
})
