/**
 * GroupMessageStore — per-group message store (G2.5).
 *
 * Same pattern as MessageStore but scoped to a group conversation.
 * Messages track senderName (from the backend's senderNameSnapshot field),
 * type (text | system | poll | announcement), and removedAt.
 */

export interface GroupMessageRecord {
  id: string
  conversationId: string
  playerId: string | null
  senderName: string | null
  body: string
  type: 'text' | 'system' | 'poll' | 'announcement'
  createdAt: string
  removedAt: string | null
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
