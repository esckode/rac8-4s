import type { Player } from '@shared/types'

export class PlayerCache {
  private cache: Map<string, Player> = new Map()

  get(playerId: string): Player | undefined {
    return this.cache.get(playerId)
  }

  set(player: Player): void {
    this.cache.set(player.id, player)
  }

  setMany(players: Player[]): void {
    players.forEach(player => {
      this.cache.set(player.id, player)
    })
  }

  invalidate(playerId: string): void {
    this.cache.delete(playerId)
  }

  clear(): void {
    this.cache.clear()
  }
}
