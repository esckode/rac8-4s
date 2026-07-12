/**
 * propose_poll — Phase B write-action tool (design §11 B0/B-Q6/B-Q7/B-Q9/B-Q10).
 *
 * Still a REGISTRY-WALL tool: it never creates a poll, only drafts a card
 * via AssistantCardRepository. The model resolves any natural-language time
 * into an ISO-UTC instant itself using the askerTimezone/currentDateTime
 * context (B-Q6) — this tool only validates the result is well-formed and
 * in the future. Args are route-ready: they're createPoll's exact input
 * shape (poll-service.ts), so confirm can replay them verbatim.
 */
import { AssistantCardRepository } from '../repositories/assistant-card-repository'
import type { AssistantToolContext } from './tools'
import { emitCardCreated } from './emit-card'

export interface ProposePollInput {
  question: string
  /** ISO-UTC, already resolved by the model. Omit for an open-ended poll. */
  targetTime?: string
  autoCloseAt?: string
  autoLaunch?: boolean
  minPlayers?: number
  launchMatchFormat?: string
}

export type ProposePollResult =
  | { status: 'card_posted'; cardId: string; messageId: string }
  | { status: 'declined'; message: string }

function isFutureIsoInstant(value: string): boolean {
  const t = new Date(value)
  return !isNaN(t.getTime()) && t.getTime() > Date.now()
}

export async function proposePoll(
  ctx: AssistantToolContext,
  input: ProposePollInput
): Promise<ProposePollResult> {
  const question = input.question?.trim()
  if (!question) {
    return { status: 'declined', message: 'A poll needs a question.' }
  }
  if (input.targetTime !== undefined && !isFutureIsoInstant(input.targetTime)) {
    return { status: 'declined', message: 'The poll time must be a valid time in the future.' }
  }
  if (input.autoCloseAt !== undefined && !isFutureIsoInstant(input.autoCloseAt)) {
    return { status: 'declined', message: 'The poll close time must be a valid time in the future.' }
  }

  const askerRes = await ctx.db.query(`SELECT name FROM public.players WHERE id = $1`, [ctx.playerId])
  const askerName: string = askerRes.rows[0]?.name ?? 'A member'

  const cardRepo = new AssistantCardRepository(ctx.db as any)
  const body = `Coach drafted a poll — "${question}" (by ${askerName}). Only ${askerName} can confirm, within 15 minutes.`
  const { card, conversationId } = await cardRepo.createCard({
    groupId: ctx.groupId,
    proposerPlayerId: ctx.playerId,
    action: 'propose_poll',
    args: {
      question,
      targetTime: input.targetTime ?? null,
      autoCloseAt: input.autoCloseAt ?? null,
      autoLaunch: input.autoLaunch ?? false,
      minPlayers: input.minPlayers ?? null,
      launchMatchFormat: input.launchMatchFormat ?? null,
    },
    body,
  })
  emitCardCreated(ctx.broadcastBus, conversationId, ctx.groupId, card, body)

  return { status: 'card_posted', cardId: card.id, messageId: card.messageId }
}
