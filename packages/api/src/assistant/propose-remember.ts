/**
 * propose_remember — 1:1 Coach memory consent tool (COACH_1TO1_DESIGN.md §5.2).
 *
 * PLACEHOLDER (S4): registered in the coach tool registry now so the registry
 * wall holds its final shape from S4 onward. The real validation (opt-in
 * check, ~20-entry cap, 280-char limit, near-duplicate check) and card
 * creation (via AssistantCardRepository.createCoachCard) are built in S6 —
 * this stub never creates a card.
 */
import type { AssistantToolContext } from './tools'

export interface ProposeRememberResult {
  status: 'declined'
  message: string
}

export async function proposeRemember(
  _ctx: AssistantToolContext,
  _input: { text: string }
): Promise<ProposeRememberResult> {
  return { status: 'declined', message: "Memory isn't available yet." }
}
