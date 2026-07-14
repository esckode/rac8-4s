/**
 * S2.5 — isDigestWindow: ~Sunday 09:00 in a group's effective timezone,
 * falling back to Sunday 18:00 UTC when no effective tz is derivable.
 */

import { isDigestWindow } from '../../workers/digest-processor'

describe('isDigestWindow', () => {
  it('UTC fallback: true at Sunday 18:00 UTC when there is no effective tz', () => {
    expect(isDigestWindow(new Date('2026-07-12T18:00:00Z'), null)).toBe(true)
  })

  it('UTC fallback: false at other hours or other days', () => {
    expect(isDigestWindow(new Date('2026-07-12T17:00:00Z'), null)).toBe(false)
    expect(isDigestWindow(new Date('2026-07-13T18:00:00Z'), null)).toBe(false)
  })

  it('group tz: true at ~09:00 local Sunday (America/Los_Angeles, UTC-7 in July)', () => {
    expect(isDigestWindow(new Date('2026-07-12T16:00:00Z'), 'America/Los_Angeles')).toBe(true)
  })

  it('group tz: false outside the local Sunday 09:00 hour', () => {
    expect(isDigestWindow(new Date('2026-07-12T10:00:00Z'), 'America/Los_Angeles')).toBe(false)
    expect(isDigestWindow(new Date('2026-07-13T16:00:00Z'), 'America/Los_Angeles')).toBe(false)
  })

  it('a group tz does NOT also match the UTC-fallback hour', () => {
    // 18:00 UTC in America/Los_Angeles (July, UTC-7) is 11:00 local, not 09:00.
    expect(isDigestWindow(new Date('2026-07-12T18:00:00Z'), 'America/Los_Angeles')).toBe(false)
  })
})
