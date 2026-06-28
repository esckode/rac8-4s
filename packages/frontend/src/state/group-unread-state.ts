/**
 * GroupUnreadStore — G2.5
 *
 * Tracks total unread message counts across all of the player's groups.
 * Written by useGroupMessages when new non-system messages arrive via SSE.
 * Read by the My Groups nav tab badge.
 *
 * V1: A message is "unread" if the group chat page is not currently open.
 * When the player opens a group, useGroupMessages signals clearGroupUnread()
 * so the badge goes to 0 for that group.
 */

type Subscriber = (total: number) => void

class GroupUnreadStore {
  /** Per-groupId unread counts. */
  private counts = new Map<string, number>()
  private subscribers: Set<Subscriber> = new Set()

  total(): number {
    let sum = 0
    this.counts.forEach(v => { sum += v })
    return sum
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
    const t = this.total()
    this.subscribers.forEach(cb => cb(t))
  }
}

export const groupUnreadStore = new GroupUnreadStore()
