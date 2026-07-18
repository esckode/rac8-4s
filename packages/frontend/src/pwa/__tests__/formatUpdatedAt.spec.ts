import { formatUpdatedAt } from '../formatUpdatedAt'

describe('formatUpdatedAt', () => {
  it('formats hours and minutes zero-padded', () => {
    const iso = new Date(2026, 6, 18, 9, 5).toISOString()
    expect(formatUpdatedAt(iso)).toBe('Updated 09:05')
  })

  it('does not zero-pad past two digits', () => {
    const iso = new Date(2026, 6, 18, 23, 45).toISOString()
    expect(formatUpdatedAt(iso)).toBe('Updated 23:45')
  })
})
