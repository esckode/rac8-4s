/**
 * Ratings Constants — Phase 0 stable values, signed off 2026-07-30
 *
 * All rating system parameters in one place for tuning without code changes.
 * See RATINGS_IMPLEMENTATION.md §0a: these numbers are the ONLY place they appear.
 * No constant may be re-stated in migrations, tests, or calculation code.
 */

/** Rating gap → win probability via logistic function. 100 pts (one NTRP level) ≈ 87% expected win for higher-rated player */
export const LOGISTIC_DIVISOR = 120

/** Max points one match can move a new rating (provisional player) */
export const K_PROVISIONAL = 24

/** Max points once the rating has settled */
export const K_SETTLED = 10

/** Matches before K finishes decaying to K_SETTLED; load-bearing for R20 pairing gate */
export const PROVISIONAL_MATCHES = 10

/** Starting rating when a player does not self-assess */
export const SEED_DEFAULT = 270

/** Scale floor (NTRP 1.0) */
export const RATING_MIN = 100

/** Scale ceiling (NTRP 5.0) */
export const RATING_MAX = 500

/** Below this, movement toward the floor is halved */
export const TAIL_LOW = 150

/** Above this, movement toward the ceiling is halved */
export const TAIL_HIGH = 450

/** The halving factor for tail adjustments */
export const TAIL_FACTOR = 0.5
