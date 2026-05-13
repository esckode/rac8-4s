import type { Standing } from '@shared/types'
import type { StandingsUpdatedPayload } from '../types'

type Subscriber = (groupId: string, standings: Standing[]) => void

export class StandingsStore {
  private standingsMap: Map<string, Standing[]> = new Map()
  private subscribers: Set<Subscriber> = new Set()

  getByGroup(groupId: string): Standing[] {
    return this.standingsMap.get(groupId) || []
  }

  update(payload: StandingsUpdatedPayload): void {
    this.standingsMap.set(payload.groupId, payload.standings)
    this.notifySubscribers(payload.groupId, payload.standings)
  }

  clear(): void {
    this.standingsMap.clear()
  }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notifySubscribers(groupId: string, standings: Standing[]): void {
    this.subscribers.forEach(callback => callback(groupId, standings))
  }
}
