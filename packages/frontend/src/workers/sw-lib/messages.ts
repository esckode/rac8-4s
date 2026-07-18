export type AppMessage = { type: 'WIPE_PLAYER_DATA' } | { type: 'REPLAY_QUEUE' }

export type ReplayOutcome = 'success' | 'needs-auth' | 'rejected' | 'expired'

export type SwMessage =
  | { type: 'WIPE_DONE' }
  | {
      type: 'REPLAY_RESULT'
      outcome: ReplayOutcome
      tournamentId: string
      matchId: string
      detail?: string
    }

const REPLAY_OUTCOMES: ReplayOutcome[] = ['success', 'needs-auth', 'rejected', 'expired']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** App → SW message guard. `SKIP_WAITING` is handled by vite-plugin-pwa's own
 * flow (register.ts's updateServiceWorker()), so it is not part of this protocol. */
export function isAppMessage(value: unknown): value is AppMessage {
  if (!isRecord(value)) return false
  return value.type === 'WIPE_PLAYER_DATA' || value.type === 'REPLAY_QUEUE'
}

/** SW → app message guard. */
export function isSwMessage(value: unknown): value is SwMessage {
  if (!isRecord(value)) return false

  if (value.type === 'WIPE_DONE') return true

  if (value.type === 'REPLAY_RESULT') {
    if (typeof value.tournamentId !== 'string' || typeof value.matchId !== 'string') return false
    if (typeof value.outcome !== 'string' || !REPLAY_OUTCOMES.includes(value.outcome as ReplayOutcome)) {
      return false
    }
    if ('detail' in value && typeof value.detail !== 'string') return false
    return true
  }

  return false
}
