import type { IBroadcastBus } from './broadcast-bus'
import type { GroupRepository } from './repositories/group-repository'

/**
 * ISSUE-62 — nudge every other group member's live badge stream (channel
 * `player:<id>`, event `group.unread.changed`) so their Groups-tab unread
 * count updates without waiting for refocus/repoll. The sender is excluded.
 *
 * Independent of notify_level/quiet-hours — those gate push notifications
 * (group-notify-selector.ts), not the in-app unread badge. ISSUE-56's
 * server-computed unreadCount is itself unconditional on notify_level, so
 * this fan-out must be too, or a muted member's badge would silently stop
 * reflecting reality.
 */
export async function broadcastGroupUnreadChanged(
  groupRepo: Pick<GroupRepository, 'getGroupMembersForNotify'>,
  broadcastBus: IBroadcastBus | undefined,
  groupId: string,
  excludePlayerId: string
): Promise<void> {
  if (!broadcastBus) return
  const members = await groupRepo.getGroupMembersForNotify(groupId)
  for (const member of members) {
    if (member.playerId === excludePlayerId) continue
    broadcastBus.emit(`player:${member.playerId}`, 'group.unread.changed', { groupId })
  }
}
