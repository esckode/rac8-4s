/**
 * Named constants for the 1:1 Coach surface (COACH_1TO1_DESIGN.md §7).
 * These are grilled product decisions, not deployment knobs — unlike env-configured
 * values (COACH_MODEL, ASSISTANT_ADAPTER, ASSISTANT_DAILY_BUDGET_USD), they live in code.
 */

/** Per-player rate limits (§7 #2). */
export const COACH_HOURLY_LIMIT = 20
export const COACH_DAILY_LIMIT = 60

/** Heads-up footer fires when remaining messages in either window drops to this or below. */
export const COACH_HEADS_UP_THRESHOLD = 3

/** Replay window: last N thread messages fed into each turn (§7 #4). */
export const COACH_HISTORY_WINDOW = 50

/** Reply length ceiling, enforced via prompt + max_tokens (§7 #4). */
export const COACH_MAX_TOKENS = 500

/** Memory store caps (§7 #7a-c). */
export const COACH_MEMORY_CAP = 20
export const COACH_MEMORY_MAX_LENGTH = 280

/** Polite cap message at the rate/budget limit (§7 #2). */
export const COACH_CAP_MESSAGE =
  "I've hit my limit for now — back in a bit. Your matches are still in the Matches tab."
