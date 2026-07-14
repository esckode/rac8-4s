/**
 * C3.1 — Nudge message template (pure function)
 * S2.7 — Personalization P1b/P4 supersedes the earlier relative-only rule
 * (assistant design C-Q8): the nudge now leads with an absolute deadline in
 * the group's effective timezone, relative phrasing demoted to secondary.
 *
 * buildNudgeBody names the pending matches and stays within the
 * Q16-addendum budget (nudge ≤40 words + match list).
 */

import { buildNudgeBody, formatAbsoluteGroupTime } from '../../workers/nudge-processor'

const DEADLINE = new Date('2026-07-12T18:00:00Z') // a Sunday

describe('formatAbsoluteGroupTime', () => {
  it('formats in the given IANA timezone', () => {
    expect(formatAbsoluteGroupTime(DEADLINE, 'America/Los_Angeles')).toBe('Sun 11:00am')
  })

  it('falls back to UTC when no effective tz is given', () => {
    expect(formatAbsoluteGroupTime(DEADLINE, null)).toBe('Sun 6:00pm')
  })
})

describe('buildNudgeBody', () => {
  it('names a single pending match and leads with an absolute group-local time', () => {
    const body = buildNudgeBody([{ name1: 'Bob', name2: 'Carol', playerIds: ['p1', 'p2'] }], DEADLINE, null, '2 days left')
    expect(body).toContain('Bob')
    expect(body).toContain('Carol')
    expect(body).toContain('Sun 6:00pm')
  })

  it('demotes relative phrasing to a secondary detail', () => {
    const body = buildNudgeBody([{ name1: 'Bob', name2: 'Carol', playerIds: ['p1', 'p2'] }], DEADLINE, null, '1 day left')
    expect(body).toContain('1 day left')
    // Relative phrasing appears after the absolute time, not before it.
    expect(body.indexOf('Sun 6:00pm')).toBeLessThan(body.indexOf('1 day left'))
  })

  it('uses the group effective timezone when provided, not UTC', () => {
    const body = buildNudgeBody(
      [{ name1: 'Bob', name2: 'Carol', playerIds: ['p1', 'p2'] }],
      DEADLINE,
      'America/Los_Angeles',
      '2 days left'
    )
    expect(body).toContain('Sun 11:00am')
    expect(body).not.toContain('6:00pm')
  })

  it('stays within budget (≤40 words) for multiple matches', () => {
    const body = buildNudgeBody(
      [
        { name1: 'Bob', name2: 'Carol', playerIds: ['p1', 'p2'] },
        { name1: 'Dave', name2: 'Erin', playerIds: ['p3', 'p4'] },
        { name1: 'Frank', name2: 'Grace', playerIds: ['p5', 'p6'] },
      ],
      DEADLINE,
      null,
      '2 days left'
    )
    const wordCount = body.trim().split(/\s+/).length
    expect(wordCount).toBeLessThanOrEqual(40)
    expect(body).toContain('Bob')
    expect(body).toContain('Dave')
    expect(body).toContain('Frank')
  })
})
