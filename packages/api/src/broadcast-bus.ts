import { EventEmitter } from 'node:events'

export class BroadcastBus {
  private emitter = new EventEmitter()

  constructor() {
    // Intentionally support many concurrent SSE subscribers; suppress Node's default warning
    this.emitter.setMaxListeners(0)
  }

  emit(tournamentId: string, event: string, data: unknown): void {
    this.emitter.emit(tournamentId, event, data)
  }

  subscribe(tournamentId: string, listener: (event: string, data: unknown) => void): () => void {
    this.emitter.on(tournamentId, listener)
    return () => this.emitter.off(tournamentId, listener)
  }

  listenerCount(tournamentId: string): number {
    return this.emitter.listenerCount(tournamentId)
  }
}
