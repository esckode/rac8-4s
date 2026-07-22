/**
 * ISSUE-9 — friendly status badge copy for the Browse discovery board.
 * Never render the raw DB enum. registration_open is split by deadline:
 * still open (badge "Reg Open") vs. past its deadline (badge "Closed",
 * even though the DB status hasn't transitioned — no lifecycle sweep
 * exists yet to flip it to registration_closed).
 */
export function statusBadge(status: string, registrationDeadline: string | null | undefined): string {
  if (status === 'registration_open') {
    const deadlinePassed = !!registrationDeadline && new Date(registrationDeadline).getTime() < Date.now()
    return deadlinePassed ? 'Closed' : 'Reg Open'
  }
  switch (status) {
    case 'registration_closed':
      return 'Registration Closed'
    case 'group_stage_active':
    case 'group_stage_complete':
    case 'knockout_active':
      return 'In Progress'
    case 'knockout_complete':
      return 'Complete'
    default:
      return status
  }
}
