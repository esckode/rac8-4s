/**
 * C3.1 — Nudge message template (pure function, RED first)
 *
 * buildNudgeBody names the pending matches, uses relative time phrasing only
 * (never an absolute clock time), and stays within the Q16-addendum budget
 * (nudge ≤40 words + match list).
 */

import { buildNudgeBody } from '../../workers/nudge-processor'

describe('buildNudgeBody', () => {
  it('names a single pending match with relative time phrasing', () => {
    const body = buildNudgeBody([{ name1: 'Bob', name2: 'Carol', playerIds: ['p1', 'p2'] }], '2 days left')
    expect(body).toContain('Bob')
    expect(body).toContain('Carol')
    expect(body).toContain('2 days left')
  })

  it('never includes an absolute clock time', () => {
    const body = buildNudgeBody([{ name1: 'Bob', name2: 'Carol', playerIds: ['p1', 'p2'] }], '1 day left')
    expect(body).not.toMatch(/\d{1,2}:\d{2}/)
    expect(body).not.toMatch(/\bUTC\b/)
    expect(body).not.toMatch(/\bAM\b|\bPM\b/i)
  })

  it('stays within budget (≤40 words) for multiple matches', () => {
    const body = buildNudgeBody(
      [
        { name1: 'Bob', name2: 'Carol', playerIds: ['p1', 'p2'] },
        { name1: 'Dave', name2: 'Erin', playerIds: ['p3', 'p4'] },
        { name1: 'Frank', name2: 'Grace', playerIds: ['p5', 'p6'] },
      ],
      '2 days left'
    )
    const wordCount = body.trim().split(/\s+/).length
    expect(wordCount).toBeLessThanOrEqual(40)
    expect(body).toContain('Bob')
    expect(body).toContain('Dave')
    expect(body).toContain('Frank')
  })
})
