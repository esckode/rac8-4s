/**
 * C4.1 — Recap template (pure function)
 *
 * buildRecap names the winner, the top-3 standings, and one stat
 * (completed match count), deterministically, within the Q16-addendum
 * budget (recap ≤80 words).
 */

import { buildRecap, type RecapStanding } from '../../assistant/recap'

describe('buildRecap', () => {
  const standings: RecapStanding[] = [
    { rank: 1, name: 'Alice', wins: 3, losses: 0 },
    { rank: 2, name: 'Bob', wins: 2, losses: 1 },
    { rank: 3, name: 'Carol', wins: 1, losses: 2 },
    { rank: 4, name: 'Dave', wins: 0, losses: 3 },
  ]

  it('names the winner (rank 1)', () => {
    const body = buildRecap('Summer Slam', standings, 6)
    expect(body).toContain('Alice')
  })

  it('lists exactly the top-3 standings, not the 4th', () => {
    const body = buildRecap('Summer Slam', standings, 6)
    expect(body).toContain('Alice')
    expect(body).toContain('Bob')
    expect(body).toContain('Carol')
    expect(body).not.toContain('Dave')
  })

  it('includes one stat — the completed match count', () => {
    const body = buildRecap('Summer Slam', standings, 6)
    expect(body).toContain('6')
  })

  it('is deterministic (same inputs, same output)', () => {
    expect(buildRecap('Summer Slam', standings, 6)).toBe(buildRecap('Summer Slam', standings, 6))
  })

  it('stays within budget (≤80 words)', () => {
    const body = buildRecap('Summer Slam', standings, 6)
    const wordCount = body.trim().split(/\s+/).length
    expect(wordCount).toBeLessThanOrEqual(80)
  })

  it('handles an unranked (empty) standings list without throwing', () => {
    expect(() => buildRecap('Empty Cup', [], 0)).not.toThrow()
  })
})
