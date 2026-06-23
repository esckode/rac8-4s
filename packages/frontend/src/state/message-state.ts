export interface MessageRecord {
  id: string
  tournamentId: string
  senderPlayerId: string
  recipientPlayerId: string | null
  matchId: string | null
  body: string
  createdAt: string
  legalHold: boolean
  read_at: string | null
}

type Subscriber = (messages: MessageRecord[]) => void

export class MessageStore {
  private messages: MessageRecord[] = []
  private subscribers: Set<Subscriber> = new Set()

  all(): MessageRecord[] {
    return [...this.messages]
  }

  setHistory(messages: MessageRecord[]): void {
    this.messages = [...messages]
    this.notifySubscribers()
  }

  append(message: MessageRecord): void {
    // Avoid duplicates (e.g. own send + SSE echo)
    if (this.messages.some(m => m.id === message.id)) {
      return
    }
    this.messages = [...this.messages, message]
    this.notifySubscribers()
  }

  markRead(messageId: string): void {
    this.messages = this.messages.map(m =>
      m.id === messageId ? { ...m, read_at: new Date().toISOString() } : m
    )
    this.notifySubscribers()
  }

  clear(): void {
    this.messages = []
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
