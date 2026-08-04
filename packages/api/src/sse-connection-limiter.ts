/**
 * Per-user concurrent SSE connection cap, shared by any route that opens an
 * open-ended stream. Mirrors the counting logic already used by the
 * tournament events route (tournaments.ts) — extracted here so the
 * group-chat (ISSUE-61) and coach (ISSUE-52) routes enforce the same
 * sseMaxConnectionsPerUser limit instead of being unbounded.
 *
 * Per-process, not global: this is an in-memory Map, so the cap is
 * per-instance and a user spread across instances gets N× the limit. That
 * matches the existing tournament-route implementation's behavior; a
 * distributed counter belongs with the multi-instance work
 * (PRODUCTION_READINESS.md PR-3), not here.
 */
export interface SseConnectionLimiter {
  tryAcquire(userId: string, max: number): boolean
  release(userId: string): void
}

export function createSseConnectionLimiter(): SseConnectionLimiter {
  const counts = new Map<string, number>()

  return {
    tryAcquire(userId: string, max: number): boolean {
      const current = counts.get(userId) ?? 0
      if (current >= max) return false
      counts.set(userId, current + 1)
      return true
    },
    release(userId: string): void {
      const current = counts.get(userId) ?? 1
      counts.set(userId, Math.max(0, current - 1))
    },
  }
}
