// ISSUE-20: two named predicates for "counts toward capacity" vs "plays in
// the bracket" so the intentional difference between them is reviewable in
// one place instead of implied by two independent omissions.
//
// Capacity excludes only `withdrawn` — a `withdrawal_pending` request has
// not been granted, and it can only happen after the registration deadline,
// when the seat cannot be resold anyway.
//
// The bracket excludes both: someone who has asked to leave should not be
// auto-paired with a stranger and scheduled into matches.
export const COUNTS_FOR_CAPACITY = `status <> 'withdrawn'`
export const PLAYS_IN_BRACKET = `status NOT IN ('withdrawn', 'withdrawal_pending')`
