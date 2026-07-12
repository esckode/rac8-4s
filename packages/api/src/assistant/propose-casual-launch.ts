/**
 * propose_casual_launch — Phase B write-action tool (design §11 B0/B-Q7/B-Q8/B-Q9/B-Q10).
 *
 * Still a REGISTRY-WALL tool: it never launches a tournament, only drafts a
 * card. Draft-time authority mirrors the shipped launch route exactly
 * (player-groups.ts POST /:groupId/polls/:messageId/launch): only the
 * poll's CREATOR may launch — corrected 2026-07-12 from the original
 * "group owner" assumption in the design (B-Q8). The real route has no
 * "poll must be closed" gate, so this tool searches ALL polls, not just
 * open ones (mirrors propose_poll_vote's candidate-matching for B-Q7
 * ambiguity, but scoped to "and the asker is its creator").
 *
 * Card args are NOT route-ready like propose_score/propose_poll: launch
 * doesn't go through a generic confirm dispatch. The FE opens the existing
 * LaunchConfirmSheet from these args, calls the real launch route directly,
 * then calls the card's own /complete route on success (B5.1).
 */
import { PollRepository } from '../repositories/poll-repository'
import { AssistantCardRepository } from '../repositories/assistant-card-repository'
import type { AssistantToolContext } from './tools'
import { emitCardCreated } from './emit-card'

export interface ProposeCasualLaunchInput {
  pollQuestion: string
  defaultFormat?: 'singles' | 'doubles'
}

export type ProposeCasualLaunchResult =
  | { status: 'card_posted'; cardId: string; messageId: string }
  | { status: 'ambiguous'; candidates: Array<{ pollId: string; question: string }> }
  | { status: 'not_found'; message: string }
  | { status: 'declined'; message: string }

export async function proposeCasualLaunch(
  ctx: AssistantToolContext,
  input: ProposeCasualLaunchInput
): Promise<ProposeCasualLaunchResult> {
  const pollRepo = new PollRepository(ctx.db)
  const allPolls = await pollRepo.findPollsByGroup(ctx.groupId)

  const query = input.pollQuestion.trim().toLowerCase()
  const matches = allPolls.filter(p => p.question.toLowerCase().includes(query))

  if (matches.length === 0) {
    return { status: 'not_found', message: `I couldn't find a poll matching "${input.pollQuestion}".` }
  }

  const authorized = matches.filter(p => p.creatorPlayerId === ctx.playerId)
  if (authorized.length === 0) {
    return { status: 'declined', message: 'Only the poll creator can launch a tournament from it.' }
  }
  if (authorized.length > 1) {
    return {
      status: 'ambiguous',
      candidates: authorized.map(c => ({ pollId: c.pollId, question: c.question })),
    }
  }

  const chosen = authorized[0]
  const votes = await pollRepo.getVotes(chosen.pollId)
  const inVoterNames = votes.votes.filter(v => v.choice === 'in').map(v => v.voterName ?? v.playerId)

  const askerRes = await ctx.db.query(`SELECT name FROM public.players WHERE id = $1`, [ctx.playerId])
  const askerName: string = askerRes.rows[0]?.name ?? 'A member'

  const cardRepo = new AssistantCardRepository(ctx.db as any)
  const body = `Coach drafted a tournament launch from "${chosen.question}" — ${inVoterNames.length} player${inVoterNames.length === 1 ? '' : 's'} in. Only ${askerName} can confirm, within 15 minutes.`
  const { card, conversationId } = await cardRepo.createCard({
    groupId: ctx.groupId,
    proposerPlayerId: ctx.playerId,
    action: 'propose_casual_launch',
    args: {
      pollId: chosen.pollId,
      messageId: chosen.messageId,
      inVoterNames,
      defaultFormat: input.defaultFormat ?? 'singles',
    },
    body,
  })
  emitCardCreated(ctx.broadcastBus, conversationId, ctx.groupId, card, body)

  return { status: 'card_posted', cardId: card.id, messageId: card.messageId }
}
