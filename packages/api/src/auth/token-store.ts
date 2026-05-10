export interface TokenStore {
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  get(key: string): Promise<string | null>
  del(key: string): Promise<void>
}

export class InMemoryTokenStore implements TokenStore {
  private store = new Map<string, { value: string; expiresAt: number }>()

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }

  _setExpiredForTest(key: string): void {
    const entry = this.store.get(key)
    if (entry) {
      this.store.set(key, { value: entry.value, expiresAt: Date.now() - 1 })
    }
  }
}
