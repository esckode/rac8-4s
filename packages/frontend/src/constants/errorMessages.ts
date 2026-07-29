/**
 * Shared copy for API error codes that need identical wording wherever they
 * appear, so the message doesn't drift into five near-duplicate variants.
 */

// ISSUE-24: an account JWT with no linked player is a distinct, non-recoverable-
// by-reauth state — never pair this with a "sign in again" action.
export const PLAYER_NOT_LINKED_MESSAGE = "This account isn't set up to play yet."
