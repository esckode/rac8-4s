import { Standing } from '@core/index'

export interface StandingsCache {
  get(groupId: string): Standing[] | null
  set(groupId: string, standings: Standing[]): void
  clear(groupId: string): void
}

export class InMemoryStandingsCache implements StandingsCache {
  private store = new Map<string, Standing[]>()

  get(groupId: string): Standing[] | null {
    return this.store.get(groupId) ?? null
  }

  set(groupId: string, standings: Standing[]): void {
    this.store.set(groupId, standings)
  }

  clear(groupId: string): void {
    this.store.delete(groupId)
  }
}
