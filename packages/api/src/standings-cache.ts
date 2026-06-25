import { Standing } from '@core/index'
import type { IBroadcastBus } from './broadcast-bus'

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

/**
 * Fixed bus key used for all standings invalidation events.
 *
 * The broadcast bus is conversation-keyed; this constant acts as a dedicated
 * "system" channel for cross-instance cache invalidation.  Every API instance
 * subscribes to this key at startup (via subscribeToStandingsInvalidations) so
 * that a standings.invalidate event published by any instance reaches every
 * instance's InMemoryStandingsCache.
 */
export const STANDINGS_INVALIDATION_KEY = '__standings_invalidation__'

/**
 * Subscribe this cache to standings.invalidate events on the bus.
 *
 * Call once per API instance at startup.  When any instance emits a
 * standings.invalidate event (on STANDINGS_INVALIDATION_KEY), every subscriber
 * drops the named group from its InMemoryStandingsCache so the next read
 * re-fetches from the database.
 *
 * Returns the unsubscribe function (call on graceful shutdown).
 */
export function subscribeToStandingsInvalidations(
  bus: IBroadcastBus,
  cache: StandingsCache
): () => void {
  return bus.subscribe(STANDINGS_INVALIDATION_KEY, (event, data) => {
    if (event === 'standings.invalidate') {
      const { groupId } = data as { groupId: string }
      if (groupId) cache.clear(groupId)
    }
  })
}
