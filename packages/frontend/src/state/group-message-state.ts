/**
 * GroupMessageStore — per-group message store (G2.5).
 *
 * Same pattern as MessageStore but scoped to a group conversation.
 * Messages track senderName (from the backend's senderNameSnapshot field),
 * type (text | system | poll | announcement), and removedAt.
 */

export interface PollTally {
  in: number
  out: number
  maybe: number
}

export interface GroupMessageRecord {
  id: string
  conversationId: string
  playerId: string | null
  senderName: string | null
  body: string
  type: 'text' | 'system' | 'poll' | 'announcement'
  createdAt: string
  removedAt: string | null
  // Present only when type === 'poll'
  pollId?: string | null
  targetTime?: string | null
  closedAt?: string | null
  tally?: PollTally | null
}

type Subscriber = (messages: GroupMessageRecord[]) => void

export class GroupMessageStore {
  private messages: GroupMessageRecord[] = []
  private subscribers: Set<Subscriber> = new Set()
  private loaded = false

  all(): GroupMessageRecord[] {
    return [...this.messages]
  }

  isLoaded(): boolean {
    return this.loaded
  }

  setHistory(messages: GroupMessageRecord[]): void {
    this.messages = [...messages]
    this.loaded = true
    this.notifySubscribers()
  }

  append(message: GroupMessageRecord): void {
    if (this.messages.some(m => m.id === message.id)) return
    this.messages = [...this.messages, message]
    this.notifySubscribers()
  }

  /** Merge re-fetched history without duplicating existing messages. */
  mergeHistory(messages: GroupMessageRecord[]): void {
    const existingIds = new Set(this.messages.map(m => m.id))
    const newOnes = messages.filter(m => !existingIds.has(m.id))
    if (newOnes.length === 0) return
    this.messages = [...this.messages, ...newOnes].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt)
    )
    this.notifySubscribers()
  }

  /** Update the tally for a poll message (SSE poll.tally.updated). */
  updatePollTally(pollId: string, tally: PollTally): void {
    const idx = this.messages.findIndex(m => m.pollId === pollId)
    if (idx === -1) return
    const msg = this.messages[idx]
    this.messages = [
      ...this.messages.slice(0, idx),
      { ...msg, tally },
      ...this.messages.slice(idx + 1),
    ]
    this.notifySubscribers()
  }

  /** Mark a poll message as closed (SSE poll.closed). */
  updatePollClosed(messageId: string, tally: PollTally, closedAt: string): void {
    const idx = this.messages.findIndex(m => m.id === messageId)
    if (idx === -1) return
    const msg = this.messages[idx]
    this.messages = [
      ...this.messages.slice(0, idx),
      { ...msg, tally, closedAt },
      ...this.messages.slice(idx + 1),
    ]
    this.notifySubscribers()
  }

  clear(): void {
    this.messages = []
    this.loaded = false
    this.notifySubscribers()
  }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notifySubscribers(): void {
    const snapshot = [...this.messages]
    this.subscribers.forEach(cb => cb(snapshot))
  }
}
