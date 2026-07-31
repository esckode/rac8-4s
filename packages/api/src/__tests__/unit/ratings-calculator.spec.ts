/**
 * Phase 2 — Rating maths (pure functions), RATINGS_IMPLEMENTATION.md "Phase 2 — Rating maths".
 *
 * Property-based tests only (per the Phase 2 "Red" guidance and §0a trap 2): the constants in
 * ratings-constants.ts are unsigned-for-tuning values, so tests assert *properties* of the
 * composition (R9 expected score, R13 provisional decay ramp, R19 directional tail compression,
 * R18 clamp, R10 doubles) rather than exact numbers. Constants are imported, never retyped.
 */

import { computeDelta, applyDelta, computeTeamDelta } from '../../services/ratings-calculator'
import {
  K_SETTLED,
  PROVISIONAL_MATCHES,
  RATING_MIN,
  RATING_MAX,
  TAIL_LOW,
  TAIL_HIGH,
} from '../../services/ratings-constants'

// A neutral rating clear of both tails, derived from the constants (never retyped).
const MID = Math.round((RATING_MIN + RATING_MAX) / 2)
// Small enough that MID ± GAP stays clear of the tail zones on either side.
const GAP = Math.floor((TAIL_HIGH - MID) / 4)
// Well past the provisional ramp, so K is at its settled floor.
const SETTLED_MATCHES = PROVISIONAL_MATCHES * 2

// Zero rating gap always gives an expected score of exactly 0.5, regardless of
// LOGISTIC_DIVISOR (10 ** 0 === 1, so 1 / (1 + 1) === 0.5) — a mathematical invariant,
// not a restated tunable constant.
const E_EQUAL = 0.5

describe('computeDelta — R9 expected score', () => {
  it('gains strictly more for beating a stronger opponent than a weaker one', () => {
    const vsStronger = computeDelta(MID, MID + GAP, true, SETTLED_MATCHES)
    const vsWeaker = computeDelta(MID, MID - GAP, true, SETTLED_MATCHES)
    expect(vsStronger).toBeGreaterThan(vsWeaker)
  })
})

describe('computeDelta — R13 provisional decay ramp', () => {
  it('a provisional player moves strictly more than a settled one, same inputs', () => {
    const provisional = computeDelta(MID, MID, true, 0)
    const settled = computeDelta(MID, MID, true, SETTLED_MATCHES)
    expect(provisional).toBeGreaterThan(settled)
  })

  it('K decreases monotonically as matchesPlayed increases', () => {
    const deltas: number[] = []
    for (let n = 0; n <= SETTLED_MATCHES; n++) {
      deltas.push(computeDelta(MID, MID, true, n))
    }
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1])
    }
  })

  it('K never falls below K_SETTLED, however many matches are played', () => {
    const floor = K_SETTLED * (1 - E_EQUAL)
    for (const n of [PROVISIONAL_MATCHES, PROVISIONAL_MATCHES + 1, SETTLED_MATCHES, SETTLED_MATCHES * 5]) {
      expect(computeDelta(MID, MID, true, n)).toBeCloseTo(floor, 5)
    }
  })

  it('is continuous at PROVISIONAL_MATCHES — no jump from a hard switch', () => {
    const step = (n: number) => computeDelta(MID, MID, true, n)
    const earlyStep = step(0) - step(1)
    const stepIntoBoundary = step(PROVISIONAL_MATCHES - 1) - step(PROVISIONAL_MATCHES)
    const stepPastBoundary = step(PROVISIONAL_MATCHES) - step(PROVISIONAL_MATCHES + 1)

    // A hard switch would be flat right up to the cutover (earlyStep ~ 0) and then jump by
    // (K_PROVISIONAL - K_SETTLED) * (1 - E) in one step. The linear ramp instead declines by
    // the same amount every match, including the match right before the cutover.
    expect(stepIntoBoundary).toBeCloseTo(earlyStep, 5)
    // Once matchesPlayed exceeds PROVISIONAL_MATCHES, K is flat at K_SETTLED.
    expect(stepPastBoundary).toBeCloseTo(0, 5)
  })
})

describe('computeDelta — R19 directional tail compression', () => {
  it('at TAIL_HIGH a win gains at most half of the same win mid-range, and a loss there is not halved', () => {
    const midWin = computeDelta(MID, MID, true, SETTLED_MATCHES)
    const tailWin = computeDelta(TAIL_HIGH, TAIL_HIGH, true, SETTLED_MATCHES)
    expect(tailWin).toBeLessThanOrEqual(midWin / 2)

    const midLoss = computeDelta(MID, MID, false, SETTLED_MATCHES)
    const tailLoss = computeDelta(TAIL_HIGH, TAIL_HIGH, false, SETTLED_MATCHES)
    expect(tailLoss).toBeCloseTo(midLoss, 5)
  })

  it('at TAIL_LOW a loss drops at most half of the same loss mid-range, and a win there is not halved', () => {
    const midLoss = computeDelta(MID, MID, false, SETTLED_MATCHES)
    const tailLoss = computeDelta(TAIL_LOW, TAIL_LOW, false, SETTLED_MATCHES)
    expect(Math.abs(tailLoss)).toBeLessThanOrEqual(Math.abs(midLoss) / 2)

    const midWin = computeDelta(MID, MID, true, SETTLED_MATCHES)
    const tailWin = computeDelta(TAIL_LOW, TAIL_LOW, true, SETTLED_MATCHES)
    expect(tailWin).toBeCloseTo(midWin, 5)
  })
})

describe('applyDelta — R18 clamp', () => {
  it('never returns outside [RATING_MIN, RATING_MAX] across a spread of ratings and deltas', () => {
    const span = RATING_MAX - RATING_MIN
    const ratings = [RATING_MIN - span, RATING_MIN, MID, RATING_MAX, RATING_MAX + span]
    const deltas = [-span * 2, -1, 0, 1, span * 2]
    for (const rating of ratings) {
      for (const delta of deltas) {
        const result = applyDelta(rating, delta)
        expect(result).toBeGreaterThanOrEqual(RATING_MIN)
        expect(result).toBeLessThanOrEqual(RATING_MAX)
      }
    }
  })

  it('clamps at the floor and ceiling', () => {
    expect(applyDelta(RATING_MIN, -1)).toBe(RATING_MIN)
    expect(applyDelta(RATING_MAX, 1)).toBe(RATING_MAX)
  })
})

describe('computeDelta — win/loss direction', () => {
  it('a win never decreases a rating', () => {
    const ratings = [RATING_MIN, TAIL_LOW, MID, TAIL_HIGH, RATING_MAX]
    for (const player of ratings) {
      for (const opponent of ratings) {
        for (const n of [0, PROVISIONAL_MATCHES, SETTLED_MATCHES]) {
          expect(computeDelta(player, opponent, true, n)).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('a loss never increases a rating', () => {
    const ratings = [RATING_MIN, TAIL_LOW, MID, TAIL_HIGH, RATING_MAX]
    for (const player of ratings) {
      for (const opponent of ratings) {
        for (const n of [0, PROVISIONAL_MATCHES, SETTLED_MATCHES]) {
          expect(computeDelta(player, opponent, false, n)).toBeLessThanOrEqual(0)
        }
      }
    }
  })
})

describe('computeTeamDelta — R10 doubles', () => {
  it('both partners move by the same delta, regardless of their individual rating', () => {
    const delta = computeTeamDelta([MID - GAP, MID + GAP], [MID, MID], true, SETTLED_MATCHES)
    const partner1After = applyDelta(MID - GAP, delta)
    const partner2After = applyDelta(MID + GAP, delta)
    expect(partner1After - (MID - GAP)).toBeCloseTo(delta, 5)
    expect(partner2After - (MID + GAP)).toBeCloseTo(delta, 5)
  })

  it('team delta depends only on the mean, not on how spread apart the partners are', () => {
    const spread = computeTeamDelta([MID - GAP, MID + GAP], [MID, MID], true, SETTLED_MATCHES)
    const even = computeTeamDelta([MID, MID], [MID, MID], true, SETTLED_MATCHES)
    expect(spread).toBeCloseTo(even, 5)
  })

  it('an even matchup (equal team means) produces ~zero net movement across win/loss', () => {
    const win = computeTeamDelta([MID - GAP, MID + GAP], [MID, MID], true, SETTLED_MATCHES)
    const loss = computeTeamDelta([MID - GAP, MID + GAP], [MID, MID], false, SETTLED_MATCHES)
    expect(win).toBeCloseTo(-loss, 5)
  })
})
