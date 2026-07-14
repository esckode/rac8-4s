/**
 * S5.1 — Player Personalization P9: quiet-hours pure function (RED first)
 *
 * Evaluated in the player's own tz (P1a). Wrap-around windows (22 -> 7)
 * must be covered, not just start < end.
 */
import { isWithinQuietHours } from '../../quiet-hours'

describe('isWithinQuietHours', () => {
  it('returns false when no window is set (either bound null)', () => {
    expect(isWithinQuietHours(23, null, null)).toBe(false)
    expect(isWithinQuietHours(23, 22, null)).toBe(false)
    expect(isWithinQuietHours(23, null, 7)).toBe(false)
  })

  it('normal (non-wrapping) window: start < end', () => {
    expect(isWithinQuietHours(10, 9, 17)).toBe(true)
    expect(isWithinQuietHours(9, 9, 17)).toBe(true)
    expect(isWithinQuietHours(17, 9, 17)).toBe(false) // end exclusive
    expect(isWithinQuietHours(8, 9, 17)).toBe(false)
  })

  it('wrap-around window: start > end (22 -> 7)', () => {
    expect(isWithinQuietHours(23, 22, 7)).toBe(true)
    expect(isWithinQuietHours(22, 22, 7)).toBe(true)
    expect(isWithinQuietHours(3, 22, 7)).toBe(true)
    expect(isWithinQuietHours(6, 22, 7)).toBe(true)
    expect(isWithinQuietHours(7, 22, 7)).toBe(false) // end exclusive
    expect(isWithinQuietHours(12, 22, 7)).toBe(false)
  })

  it('start === end is treated as no window (not 24h quiet)', () => {
    expect(isWithinQuietHours(0, 5, 5)).toBe(false)
    expect(isWithinQuietHours(12, 5, 5)).toBe(false)
  })
})
