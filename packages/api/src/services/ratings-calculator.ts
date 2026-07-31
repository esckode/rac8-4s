/**
 * Ratings Calculator — Phase 2 pure rating maths (P13)
 *
 * No DB, no I/O. All parameters live in ratings-constants.ts (§0a: this file
 * restates none of them — the only numeric literals here are 0 and 1).
 */

import {
  LOGISTIC_DIVISOR,
  K_PROVISIONAL,
  K_SETTLED,
  PROVISIONAL_MATCHES,
  RATING_MIN,
  RATING_MAX,
  TAIL_LOW,
  TAIL_HIGH,
  TAIL_FACTOR,
} from './ratings-constants'

/** R9 — expected score of the player from the rating gap via LOGISTIC_DIVISOR. */
function expectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / LOGISTIC_DIVISOR))
}

/**
 * R13 — step size as a linear ramp from K_PROVISIONAL down to K_SETTLED over
 * PROVISIONAL_MATCHES matches, then flat at K_SETTLED. No hard switch: the ramp
 * reaches K_SETTLED exactly at matchesPlayed === PROVISIONAL_MATCHES and stays
 * there, so there is no jump at the boundary.
 */
function stepSize(matchesPlayed: number): number {
  return K_SETTLED + (K_PROVISIONAL - K_SETTLED) * Math.max(0, 1 - matchesPlayed / PROVISIONAL_MATCHES)
}

/**
 * R9 → R13 → R19 in order. Does not clamp — see applyDelta for R18.
 */
export function computeDelta(
  playerRating: number,
  opponentRating: number,
  won: boolean,
  matchesPlayed: number
): number {
  const expected = expectedScore(playerRating, opponentRating)
  const k = stepSize(matchesPlayed)
  let raw = k * ((won ? 1 : 0) - expected)

  // R19 — directional tail compression: only movement toward the nearer bound is halved.
  if (raw > 0 && playerRating >= TAIL_HIGH) {
    raw *= TAIL_FACTOR
  } else if (raw < 0 && playerRating <= TAIL_LOW) {
    raw *= TAIL_FACTOR
  }

  return raw
}

/** R18 — clamp the resulting rating to [RATING_MIN, RATING_MAX]. Clamping happens last. */
export function applyDelta(rating: number, delta: number): number {
  return Math.min(RATING_MAX, Math.max(RATING_MIN, rating + delta))
}

/**
 * R10 — doubles. Team rating is the mean of the two partners; the delta is computed for
 * the team (mean vs opposing team's mean) and both partners move by that same delta.
 */
export function computeTeamDelta(
  team: [number, number],
  opponentTeam: [number, number],
  won: boolean,
  matchesPlayed: number
): number {
  const teamRating = (team[0] + team[1]) / 2
  const opponentRating = (opponentTeam[0] + opponentTeam[1]) / 2
  return computeDelta(teamRating, opponentRating, won, matchesPlayed)
}
