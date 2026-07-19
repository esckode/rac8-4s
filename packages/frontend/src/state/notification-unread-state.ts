/**
 * NotificationUnreadStore — P2.4
 *
 * Tracks the unread count for the player's personal notification thread.
 * Written by useNotificationUnread when a message.created SSE event arrives
 * on /player/notifications/events, and cleared when the Notifications page
 * marks everything read. Mirrors group-unread-state.ts's pattern, simplified
 * to a single total (there is only ever one personal conversation).
 */

type Subscriber = (count: number) => void

class NotificationUnreadStore {
  private count = 0
  private subscribers: Set<Subscriber> = new Set()

  get(): number {
    return this.count
  }

  set(count: number): void {
    this.count = count
    this.notify()
  }

  increment(): void {
    this.count += 1
    this.notify()
  }

  clear(): void {
    this.count = 0
    this.notify()
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb)
    return () => { this.subscribers.delete(cb) }
  }

  private notify(): void {
    this.subscribers.forEach(cb => cb(this.count))
  }
}

export const notificationUnreadStore = new NotificationUnreadStore()
