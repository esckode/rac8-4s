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
import { COACH_HOURLY_LIMIT, COACH_DAILY_LIMIT, COACH_HEADS_UP_THRESHOLD, COACH_CAP_MESSAGE } from './coach-constants'

const HOUR_SECONDS = 3600
const DAY_SECONDS = 86400
const BUDGET_TTL_SECONDS = 48 * 3600 // key is date-scoped; TTL is just cleanup
const MICRO = 1e6

/** Haiku 4.5 pricing: $1/M input, $5/M output. */
export function estimateTurnUsd(usage: { inputTokens: number; outputTokens: number }): number {
  return (usage.inputTokens * 1 + usage.outputTokens * 5) / 1e6
}

/** Conservative pre-turn estimate (system prompt + context + capped output). */
export const DEFAULT_TURN_ESTIMATE_USD = 0.005

/** Q10 fixed limits: 10/player/hr, 30/group/hr. */
export const ASSISTANT_HOURLY_LIMITS = { playerPerHour: 10, groupPerHour: 30 }

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

  /**
   * Budget-only check for proactive sweeps (recap polish, T3.3): no asker, so
   * the per-player/group hourly counters this.check() bumps don't apply —
   * just the global daily kill-switch.
   */
  async hasBudgetRemaining(estimatedTurnUsd: number = DEFAULT_TURN_ESTIMATE_USD): Promise<boolean> {
    const spentMicro = await this.store.incrementBy(this.budgetKey(), 0, BUDGET_TTL_SECONDS)
    return spentMicro / MICRO + estimatedTurnUsd <= this.opts.dailyBudgetUsd
  }

  /**
   * 1:1 Coach limits (design §7 #2): 20/player/hour + 60/player/day, plus the
   * SAME shared daily budget kill-switch used by check() — one kill-switch
   * for both surfaces. Unlike check()'s player→group early-return chain, both
   * coach windows describe the same event (one turn happened) so both always
   * increment together, regardless of whether either is already over.
   */
  async checkCoach(
    playerId: string,
    estimatedTurnUsd: number = DEFAULT_TURN_ESTIMATE_USD
  ): Promise<CoachLimitCheck> {
    const spentMicro = await this.store.incrementBy(this.budgetKey(), 0, BUDGET_TTL_SECONDS)
    if (spentMicro / MICRO + estimatedTurnUsd > this.opts.dailyBudgetUsd) {
      return { limited: true, capMessage: COACH_CAP_MESSAGE, remainingHour: 0, remainingDay: 0 }
    }

    const hourCount = await this.store.increment(`coach:player:${playerId}`, HOUR_SECONDS)
    const dayCount = await this.store.increment(`coach:player-day:${playerId}`, DAY_SECONDS)
    const remainingHour = Math.max(0, COACH_HOURLY_LIMIT - hourCount)
    const remainingDay = Math.max(0, COACH_DAILY_LIMIT - dayCount)

    if (hourCount > COACH_HOURLY_LIMIT || dayCount > COACH_DAILY_LIMIT) {
      return { limited: true, capMessage: COACH_CAP_MESSAGE, remainingHour, remainingDay }
    }

    return { limited: false, remainingHour, remainingDay }
  }
}

export interface CoachLimitCheck {
  limited: boolean
  capMessage?: string
  remainingHour: number
  remainingDay: number
}

/**
 * Pure derivation of the near-limit heads-up footer (design §7 #2): fires
 * when the tighter of the two windows has ≤ COACH_HEADS_UP_THRESHOLD
 * messages left (but > 0 — a window already at 0 is a cap, not a heads-up).
 */
export function deriveCoachHeadsUpFooter(remainingHour: number, remainingDay: number): string | undefined {
  const tightest = Math.min(remainingHour, remainingDay)
  if (tightest <= 0 || tightest > COACH_HEADS_UP_THRESHOLD) return undefined
  const window = remainingHour <= remainingDay ? 'this hour' : 'today'
  return `⚠ ${tightest} messages left ${window}`
}
