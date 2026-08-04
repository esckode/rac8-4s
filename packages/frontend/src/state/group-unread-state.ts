/**
 * GroupUnreadStore — G2.5 / ISSUE-56
 *
 * Tracks per-group unread message counts, sourced from the server (ISSUE-56:
 * GET /player/groups' unreadCount, computed against player_group_members.
 * last_read_at). Written by two sources:
 *   1. useGroupMessages, while that group's chat SSE happens to be connected
 *      (only true while its panel is mounted — group-chat SSE is
 *      per-conversation, not app-wide; see useGroupMessages.ts).
 *   2. useGroupsWithUnread, which polls GET /player/groups on mount +
 *      window refocus and copies each group's unreadCount straight in — no
 *      client-side diffing anymore (that was the pre-ISSUE-56 mechanism,
 *      which was per-device and reset to "everything unread" on a fresh
 *      device/cache, since it had no server-side read state to compare
 *      against).
 *   3. usePersonalEventsStream (ISSUE-62), the app-wide persistent SSE
 *      connection to GET /player/notifications/events — on a
 *      'group.unread.changed' push it calls the same refetch as (2), so the
 *      badge updates without waiting for refocus. The mount/focus poll in
 *      (2) remains as the fallback for any gap around a reconnect.
 * Read by the My Groups nav tab badge (groupsWithUnread — count of groups
 * with unread, not total messages) and the per-row badges in the group list
 * (which read unreadCount directly off each row, not from this store).
 *
 * A message is "unread" if the group chat page is not currently open, or if
 * it was posted after the caller's last visit (server last_read_at). When
 * the player opens a group, useGroupMessages signals clearGroupUnread() for
 * the instant local response and PATCHes /:groupId/read to update
 * last_read_at server-side.
 */

type Subscriber = () => void

class GroupUnreadStore {
  /** Per-groupId unread counts. */
  private counts = new Map<string, number>()
  private subscribers: Set<Subscriber> = new Set()

  total(): number {
    let sum = 0
    this.counts.forEach(v => { sum += v })
    return sum
  }

  /** Count of groups with at least one unread message (the nav badge's unit). */
  groupsWithUnread(): number {
    let n = 0
    this.counts.forEach(v => { if (v > 0) n++ })
    return n
  }

  setGroupUnread(groupId: string, count: number): void {
    this.counts.set(groupId, count)
    this.notify()
  }

  clearGroupUnread(groupId: string): void {
    this.counts.set(groupId, 0)
    this.notify()
  }

  reset(): void {
    this.counts.clear()
    this.notify()
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb)
    return () => { this.subscribers.delete(cb) }
  }

  private notify(): void {
    this.subscribers.forEach(cb => cb())
  }
}

export const groupUnreadStore = new GroupUnreadStore()
