/**
 * GroupUnreadStore — G2.5
 *
 * Tracks total unread message counts across all of the player's groups.
 * Written by two sources:
 *   1. useGroupMessages, while that group's chat SSE happens to be connected
 *      (only true while its panel is mounted — group-chat SSE is
 *      per-conversation, not app-wide; see useGroupMessages.ts).
 *   2. useGroupUnread (P0.4), which polls GET /player/groups on mount +
 *      window refocus and diffs each group's messageCount against the
 *      last-seen count recorded here — the mechanism that actually catches
 *      messages sent while the player is elsewhere. Deliberately NOT a
 *      persistent app-wide SSE connection: that broke Playwright's
 *      `networkidle` wait on every authenticated route (see
 *      useNotificationUnread.ts, usePendingActions.ts — same constraint).
 * Read by the My Groups nav tab badge.
 *
 * V1: A message is "unread" if the group chat page is not currently open.
 * When the player opens a group, useGroupMessages signals clearGroupUnread()
 * so the badge goes to 0 for that group, and records the group's current
 * messageCount as "seen" so the next poll doesn't immediately re-flag it.
 */

const LAST_SEEN_KEY_PREFIX = 'group-last-seen:'

/** The message count last acknowledged (seen) for a group. 0 if never recorded. */
export function getLastSeenCount(groupId: string): number {
  const raw = localStorage.getItem(`${LAST_SEEN_KEY_PREFIX}${groupId}`)
  const n = raw ? parseInt(raw, 10) : 0
  return Number.isFinite(n) ? n : 0
}

/** Record that the player has seen up to `count` messages in this group. */
export function markGroupSeen(groupId: string, count: number): void {
  localStorage.setItem(`${LAST_SEEN_KEY_PREFIX}${groupId}`, String(count))
}

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
