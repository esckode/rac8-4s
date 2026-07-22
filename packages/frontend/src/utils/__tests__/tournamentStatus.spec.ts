import { statusBadge } from '../tournamentStatus'

const FUTURE = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

describe('statusBadge (ISSUE-9)', () => {
  it('badges registration_open with a future deadline as "Reg Open"', () => {
    expect(statusBadge('registration_open', FUTURE)).toBe('Reg Open')
  })

  it('badges registration_open with a past deadline as "Closed"', () => {
    expect(statusBadge('registration_open', PAST)).toBe('Closed')
  })

  it('badges registration_open with no deadline as "Reg Open"', () => {
    expect(statusBadge('registration_open', null)).toBe('Reg Open')
    expect(statusBadge('registration_open', undefined)).toBe('Reg Open')
  })

  it('badges registration_closed as "Registration Closed"', () => {
    expect(statusBadge('registration_closed', FUTURE)).toBe('Registration Closed')
  })

  it('badges group_stage_active, group_stage_complete, and knockout_active as "In Progress"', () => {
    expect(statusBadge('group_stage_active', FUTURE)).toBe('In Progress')
    expect(statusBadge('group_stage_complete', FUTURE)).toBe('In Progress')
    expect(statusBadge('knockout_active', FUTURE)).toBe('In Progress')
  })

  it('badges knockout_complete as "Complete"', () => {
    expect(statusBadge('knockout_complete', FUTURE)).toBe('Complete')
  })

  it('falls back to the raw status for an unrecognized value', () => {
    expect(statusBadge('some_future_status', FUTURE)).toBe('some_future_status')
  })
})
