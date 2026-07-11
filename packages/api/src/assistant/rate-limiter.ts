/**
 * AssistantRateLimiter — Q10 cost controls over the shared
 * RateLimitCounterStore (Redis-backed in prod so limits hold across
 * instances, Q12; in-memory in dev/tests).
 *
 * Limits: per-player/hour, per-group/hour, and a global daily USD budget
 * kill-switch. Spend is recorded post-turn from real usage; the pre-turn
 * check compares accumulated spend + a conservative turn estimate against
 * the budget. Budget is stored in integer micro-USD (counter stores are
 * integer-only).
 */
import type { RateLimitCounterStore } from '../middleware/rate-limit-store'

const HOUR_SECONDS = 3600
const BUDGET_TTL_SECONDS = 48 * 3600 // key is date-scoped; TTL is just cleanup
const MICRO = 1e6

/** Haiku 4.5 pricing: $1/M input, $5/M output. */
export function estimateTurnUsd(usage: { inputTokens: number; outputTokens: number }): number {
  return (usage.inputTokens * 1 + usage.outputTokens * 5) / 1e6
}

/** Conservative pre-turn estimate (system prompt + context + capped output). */
export const DEFAULT_TURN_ESTIMATE_USD = 0.005

export interface AssistantLimitCheck {
  allowed: boolean
  reason?: 'player' | 'group' | 'budget'
  /** True exactly once per limited window — gates the polite cap message. */
  shouldNotify: boolean
}

export interface AssistantRateLimiterOptions {
  playerPerHour: number
  groupPerHour: number
  dailyBudgetUsd: number
}

export class AssistantRateLimiter {
  constructor(
    private store: RateLimitCounterStore,
    private opts: AssistantRateLimiterOptions
  ) {}

  private budgetKey(): string {
    return `assistant:budget:${new Date().toISOString().slice(0, 10)}`
  }

  async check(
    playerId: string,
    groupId: string,
    estimatedTurnUsd: number = DEFAULT_TURN_ESTIMATE_USD
  ): Promise<AssistantLimitCheck> {
    // Global daily budget first (kill-switch)
    const spentMicro = await this.store.incrementBy(this.budgetKey(), 0, BUDGET_TTL_SECONDS)
    if (spentMicro / MICRO + estimatedTurnUsd > this.opts.dailyBudgetUsd) {
      const notifies = await this.store.increment(
        `assistant:budget-notified:${new Date().toISOString().slice(0, 10)}`,
        BUDGET_TTL_SECONDS
      )
      return { allowed: false, reason: 'budget', shouldNotify: notifies === 1 }
    }

    const playerCount = await this.store.increment(`assistant:player:${playerId}`, HOUR_SECONDS)
    if (playerCount > this.opts.playerPerHour) {
      return {
        allowed: false,
        reason: 'player',
        shouldNotify: playerCount === this.opts.playerPerHour + 1,
      }
    }

    const groupCount = await this.store.increment(`assistant:group:${groupId}`, HOUR_SECONDS)
    if (groupCount > this.opts.groupPerHour) {
      return {
        allowed: false,
        reason: 'group',
        shouldNotify: groupCount === this.opts.groupPerHour + 1,
      }
    }

    return { allowed: true, shouldNotify: false }
  }

  /** Record real post-turn spend against today's budget. */
  async recordSpend(usd: number): Promise<void> {
    await this.store.incrementBy(this.budgetKey(), Math.round(usd * MICRO), BUDGET_TTL_SECONDS)
  }
}
