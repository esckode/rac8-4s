/**
 * A5.1 — AssistantRateLimiter (RED first)
 *
 * Q10 limits over the shared RateLimitCounterStore (Redis in prod — instance
 * safe per Q12; in-memory here): 10/player/hr, 30/group/hr, global daily USD
 * budget kill-switch. shouldNotify fires exactly once per limited window so
 * the cap message isn't spammed.
 */

import { InMemoryCounterStore } from '../../middleware/rate-limit-store'
import { AssistantRateLimiter, estimateTurnUsd } from '../../assistant/rate-limiter'

const OPTS = { playerPerHour: 10, groupPerHour: 30, dailyBudgetUsd: 5 }

function limiter(store: InMemoryCounterStore): AssistantRateLimiter {
  return new AssistantRateLimiter(store, OPTS)
}

describe('AssistantRateLimiter', () => {
  let store: InMemoryCounterStore

  beforeEach(() => {
    store = new InMemoryCounterStore()
  })

  it('allows up to 10 calls per player per hour; the 11th is limited with a single notify', async () => {
    const rl = limiter(store)
    for (let i = 0; i < 10; i++) {
      const res = await rl.check('p1', `g${i}`) // different groups so only the player cap applies
      expect(res.allowed).toBe(true)
    }
    const eleventh = await rl.check('p1', 'g-x')
    expect(eleventh).toMatchObject({ allowed: false, reason: 'player', shouldNotify: true })

    const twelfth = await rl.check('p1', 'g-x')
    expect(twelfth).toMatchObject({ allowed: false, reason: 'player', shouldNotify: false })
  })

  it('allows up to 30 calls per group per hour; the 31st is limited', async () => {
    const rl = limiter(store)
    for (let i = 0; i < 30; i++) {
      const res = await rl.check(`p${i}`, 'g1') // different players so only the group cap applies
      expect(res.allowed).toBe(true)
    }
    const thirtyFirst = await rl.check('p-new', 'g1')
    expect(thirtyFirst).toMatchObject({ allowed: false, reason: 'group', shouldNotify: true })
    const thirtySecond = await rl.check('p-new2', 'g1')
    expect(thirtySecond).toMatchObject({ allowed: false, reason: 'group', shouldNotify: false })
  })

  it('window reset re-allows a limited player', async () => {
    const rl = limiter(store)
    for (let i = 0; i < 11; i++) await rl.check('p1', `g${i}`)
    expect((await rl.check('p1', 'g-x')).allowed).toBe(false)

    store._expireForTest('assistant:player:p1')
    expect((await rl.check('p1', 'g-y')).allowed).toBe(true)
  })

  it('daily budget: accumulated spend + estimated turn above budget → limited', async () => {
    const rl = limiter(store)
    // spend up to just under the budget
    await rl.recordSpend(4.999)
    // a turn estimated at 0.01 USD would exceed the remaining budget
    const res = await rl.check('p1', 'g1', 0.01)
    expect(res).toMatchObject({ allowed: false, reason: 'budget' })
  })

  it('daily budget: spend below budget still allows', async () => {
    const rl = limiter(store)
    await rl.recordSpend(1.5)
    await rl.recordSpend(2.0)
    const res = await rl.check('p1', 'g1', 0.01)
    expect(res.allowed).toBe(true)
  })

  it('budget keys are per-UTC-day (window reset)', async () => {
    const rl = limiter(store)
    await rl.recordSpend(10) // blow the budget
    expect((await rl.check('p1', 'g1')).allowed).toBe(false)

    const today = new Date().toISOString().slice(0, 10)
    store._expireForTest(`assistant:budget:${today}`)
    expect((await rl.check('p1', 'g2')).allowed).toBe(true)
  })
})

describe('estimateTurnUsd', () => {
  it('uses Haiku 4.5 pricing: (input*1 + output*5)/1e6 USD', () => {
    expect(estimateTurnUsd({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(1)
    expect(estimateTurnUsd({ inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(5)
    expect(estimateTurnUsd({ inputTokens: 2000, outputTokens: 150 })).toBeCloseTo(0.00275)
  })
})
