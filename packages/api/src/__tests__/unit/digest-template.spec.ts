/**
 * C5.1 — Digest template (pure function)
 *
 * buildDigest composes three sections (results this week, matches pending,
 * nearest upcoming deadline) from seeded week data; all-empty → null (skip).
 */

import { buildDigest } from '../../assistant/digest'

describe('buildDigest', () => {
  it('returns null when all three sections are empty (skip a dead week)', () => {
    expect(buildDigest('Weekend Warriors', [], 0, null)).toBeNull()
  })

  it('includes results this week when present', () => {
    const body = buildDigest('Weekend Warriors', [{ player1Name: 'Alice', player2Name: 'Bob', score: '6-3 6-4' }], 0, null)
    expect(body).toContain('Alice')
    expect(body).toContain('Bob')
    expect(body).toContain('6-3 6-4')
  })

  it('includes matches pending when present', () => {
    const body = buildDigest('Weekend Warriors', [], 3, null)
    expect(body).toContain('3')
    expect(body).toMatch(/pending/i)
  })

  it('includes the nearest upcoming deadline when present', () => {
    const body = buildDigest('Weekend Warriors', [], 0, { tournamentName: 'Summer Slam', hoursRemaining: 40 })
    expect(body).toContain('Summer Slam')
  })

  it('never includes an absolute clock time for the deadline', () => {
    const body = buildDigest('Weekend Warriors', [], 0, { tournamentName: 'Summer Slam', hoursRemaining: 40 })
    expect(body).not.toMatch(/\d{1,2}:\d{2}/)
    expect(body).not.toMatch(/\bUTC\b/)
  })

  it('composes all three sections together when all present', () => {
    const body = buildDigest(
      'Weekend Warriors',
      [{ player1Name: 'Alice', player2Name: 'Bob', score: '6-3 6-4' }],
      2,
      { tournamentName: 'Summer Slam', hoursRemaining: 40 }
    )
    expect(body).toContain('Alice')
    expect(body).toContain('2')
    expect(body).toContain('Summer Slam')
  })

  it('P11: includes a rank-movement line when movements are passed', () => {
    const body = buildDigest('Weekend Warriors', [], 0, null, ['Alice ↑2 to 1st'])
    expect(body).toContain('Alice')
    expect(body).toContain('1st')
  })

  it('P11: omits the movement section when no movements are passed', () => {
    const body = buildDigest('Weekend Warriors', [{ player1Name: 'Alice', player2Name: 'Bob', score: '6-3 6-4' }], 0, null, [])
    expect(body).not.toMatch(/rank/i)
  })

  it('P11: a movement-only week (no results/pending/deadline) still posts, not skipped', () => {
    const body = buildDigest('Weekend Warriors', [], 0, null, ['Alice ↑2 to 1st'])
    expect(body).not.toBeNull()
  })

  it('stays within budget (≤120 words)', () => {
    const body = buildDigest(
      'Weekend Warriors',
      [
        { player1Name: 'Alice', player2Name: 'Bob', score: '6-3 6-4' },
        { player1Name: 'Carol', player2Name: 'Dave', score: '6-2 6-1' },
      ],
      5,
      { tournamentName: 'Summer Slam', hoursRemaining: 40 }
    )
    const wordCount = (body ?? '').trim().split(/\s+/).length
    expect(wordCount).toBeLessThanOrEqual(120)
  })
})
