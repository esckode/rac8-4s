/**
 * S5.1 — 1:1 Coach rate limiter extension (RED first)
 *
 * checkCoach(playerId): 20/hr + 60/day (COACH_1TO1_DESIGN.md §7 #2), the
 * shared assistant:budget:<date> kill-switch also limits it (one kill-switch
 * for both surfaces). deriveCoachHeadsUpFooter: a pure function deriving the
 * "⚠ N messages left this hour/today" footer from the tighter window.
 */

import { InMemoryCounterStore } from '../../middleware/rate-limit-store'
import { AssistantRateLimiter } from '../../assistant/rate-limiter'
import { COACH_CAP_MESSAGE } from '../../assistant/coach-constants'
import { deriveCoachHeadsUpFooter } from '../../assistant/rate-limiter'

const OPTS = { playerPerHour: 10, groupPerHour: 30, dailyBudgetUsd: 5 }

describe('AssistantRateLimiter.checkCoach', () => {
  let store: InMemoryCounterStore

  beforeEach(() => {
    store = new InMemoryCounterStore()
  })

  it('allows up to 20 calls per player per hour; the 21st is limited', async () => {
    const rl = new AssistantRateLimiter(store, OPTS)
    for (let i = 0; i < 20; i++) {
      const res = await rl.checkCoach('p1')
      expect(res.limited).toBe(false)
    }
    const twentyFirst = await rl.checkCoach('p1')
    expect(twentyFirst).toMatchObject({ limited: true, capMessage: COACH_CAP_MESSAGE })
  })

  it('allows up to 60 calls per player per day; the 61st is limited (hourly window reset between)', async () => {
    const rl = new AssistantRateLimiter(store, OPTS)
    let count = 0
    for (let batch = 0; batch < 3; batch++) {
      for (let i = 0; i < 20; i++) {
        const res = await rl.checkCoach('p1')
        count++
        if (count <= 60) {
          expect(res.limited).toBe(false)
        } else {
          expect(res.limited).toBe(true)
        }
      }
      // Reset only the hourly counter between batches — the daily one keeps accumulating.
      store._expireForTest('coach:player:p1')
    }
  })

  it('reports remainingHour/remainingDay counting down', async () => {
    const rl = new AssistantRateLimiter(store, OPTS)
    const first = await rl.checkCoach('p1')
    expect(first.remainingHour).toBe(19)
    expect(first.remainingDay).toBe(59)
    const second = await rl.checkCoach('p1')
    expect(second.remainingHour).toBe(18)
    expect(second.remainingDay).toBe(58)
  })

  it('the shared daily budget kill-switch also limits the coach surface', async () => {
    const rl = new AssistantRateLimiter(store, OPTS)
    await rl.recordSpend(4.999)
    const res = await rl.checkCoach('p1', 0.01)
    expect(res).toMatchObject({ limited: true, capMessage: COACH_CAP_MESSAGE, remainingHour: 0, remainingDay: 0 })
  })
})

describe('deriveCoachHeadsUpFooter', () => {
  it('returns undefined when comfortably below both limits', () => {
    expect(deriveCoachHeadsUpFooter(10, 50)).toBeUndefined()
  })

  it('returns undefined when a window is already at 0 (that is a cap, not a heads-up)', () => {
    expect(deriveCoachHeadsUpFooter(0, 50)).toBeUndefined()
  })

  it('fires when the hour window is the tighter one and <= 3', () => {
    expect(deriveCoachHeadsUpFooter(3, 50)).toBe('⚠ 3 messages left this hour')
  })

  it('fires when the day window is the tighter one and <= 3', () => {
    expect(deriveCoachHeadsUpFooter(10, 2)).toBe('⚠ 2 messages left today')
  })
})
