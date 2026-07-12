/**
 * propose_poll_vote — Phase B write-action tool (design §11 B0/B-Q7/B-Q10).
 *
 * Still a REGISTRY-WALL tool: it never casts a vote, only drafts a card via
 * AssistantCardRepository. The poll is resolved from a natural-language
 * question fragment against open polls in the group — same
 * candidate-matching / ambiguity-declines-to-clarify pattern propose_score
 * uses for opponents (B-Q7). Args are ids-only: pollId + choice, the exact
 * shape castVote (poll-service.ts) expects.
 */
import { PollRepository, type PollChoice } from '../repositories/poll-repository'
import { AssistantCardRepository } from '../repositories/assistant-card-repository'
import type { AssistantToolContext } from './tools'

export interface ProposePollVoteInput {
  pollQuestion: string
  choice: PollChoice
}

export type ProposePollVoteResult =
  | { status: 'card_posted'; cardId: string; messageId: string }
  | { status: 'ambiguous'; candidates: Array<{ pollId: string; question: string }> }
  | { status: 'not_found'; message: string }
  | { status: 'declined'; message: string }

const VALID_CHOICES: PollChoice[] = ['in', 'out', 'maybe']

export async function proposePollVote(
  ctx: AssistantToolContext,
  input: ProposePollVoteInput
): Promise<ProposePollVoteResult> {
  if (!VALID_CHOICES.includes(input.choice)) {
    return { status: 'declined', message: `choice must be one of: ${VALID_CHOICES.join(', ')}` }
  }

  const pollRepo = new PollRepository(ctx.db)
  const openPolls = await pollRepo.findOpenPollsByGroup(ctx.groupId)

  const query = input.pollQuestion.trim().toLowerCase()
  const candidates = openPolls.filter(p => p.question.toLowerCase().includes(query))

  if (candidates.length === 0) {
    return { status: 'not_found', message: `I couldn't find an open poll matching "${input.pollQuestion}".` }
  }
  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      candidates: candidates.map(c => ({ pollId: c.pollId, question: c.question })),
    }
  }

  const chosen = candidates[0]
  const askerRes = await ctx.db.query(`SELECT name FROM public.players WHERE id = $1`, [ctx.playerId])
  const askerName: string = askerRes.rows[0]?.name ?? 'A member'

  const cardRepo = new AssistantCardRepository(ctx.db as any)
  const { card } = await cardRepo.createCard({
    groupId: ctx.groupId,
    proposerPlayerId: ctx.playerId,
    action: 'propose_poll_vote',
    args: { pollId: chosen.pollId, choice: input.choice },
    body: `Coach drafted a vote — ${askerName}: ${input.choice} on "${chosen.question}". Only ${askerName} can confirm, within 15 minutes.`,
  })

  return { status: 'card_posted', cardId: card.id, messageId: card.messageId }
}
