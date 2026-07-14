/**
 * S3.5 — formatLocal (P4): absolute time in the viewer's browser tz as the
 * primary line, relative phrasing demoted to secondary. Applied to
 * deadlines, poll target times, and match schedules.
 */

import { formatLocal } from '../formatLocal'

describe('formatLocal', () => {
  const now = new Date('2026-07-13T12:00:00Z')

  it('formats the absolute time in the given date', () => {
    const { absolute } = formatLocal('2026-07-15T18:00:00Z', now)
    expect(absolute).toContain('2026')
  })

  it('shows a future relative phrase in days for a multi-day gap', () => {
    const { relative } = formatLocal('2026-07-15T12:00:00Z', now)
    expect(relative).toBe('in 2 days')
  })

  it('shows a past relative phrase for an earlier time', () => {
    const { relative } = formatLocal('2026-07-11T12:00:00Z', now)
    expect(relative).toBe('2 days ago')
  })

  it('uses singular "day"/"hour" for a magnitude of 1', () => {
    expect(formatLocal('2026-07-14T12:00:00Z', now).relative).toBe('in 1 day')
    expect(formatLocal('2026-07-13T13:00:00Z', now).relative).toBe('in 1 hour')
  })

  it('falls back to minutes for a sub-hour gap', () => {
    expect(formatLocal('2026-07-13T12:30:00Z', now).relative).toBe('in 30 minutes')
  })

  it('shows "just now" for a sub-minute gap', () => {
    expect(formatLocal('2026-07-13T12:00:30Z', now).relative).toBe('just now')
  })
})
