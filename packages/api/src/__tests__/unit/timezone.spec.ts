/**
 * S2.3 — Timezone hierarchy pure helpers (P1)
 */

import { majorityTimezone, effectiveGroupTimezone } from '../../timezone'

describe('majorityTimezone', () => {
  it('returns the majority timezone', () => {
    expect(majorityTimezone(['America/New_York', 'America/New_York', 'Europe/London'])).toBe('America/New_York')
  })

  it('breaks ties to the lexically-earlier zone', () => {
    expect(majorityTimezone(['Europe/London', 'America/New_York'])).toBe('America/New_York')
    expect(majorityTimezone(['America/New_York', 'Europe/London'])).toBe('America/New_York')
  })

  it('ignores null/undefined/empty entries', () => {
    expect(majorityTimezone([null, undefined, '', 'America/New_York'])).toBe('America/New_York')
  })

  it('returns null for an empty or all-empty list', () => {
    expect(majorityTimezone([])).toBeNull()
    expect(majorityTimezone([null, undefined])).toBeNull()
  })
})

describe('effectiveGroupTimezone', () => {
  it('prefers the owner pin over the majority', () => {
    expect(effectiveGroupTimezone('Asia/Tokyo', ['America/New_York', 'America/New_York'])).toBe('Asia/Tokyo')
  })

  it('falls back to the majority when no pin', () => {
    expect(effectiveGroupTimezone(null, ['America/New_York', 'America/New_York', 'Europe/London'])).toBe(
      'America/New_York'
    )
  })

  it('returns null when neither a pin nor any member timezone exists', () => {
    expect(effectiveGroupTimezone(null, [])).toBeNull()
  })
})
