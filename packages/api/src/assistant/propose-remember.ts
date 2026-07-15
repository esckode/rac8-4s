/**
 * propose_remember — 1:1 Coach memory consent tool (COACH_1TO1_DESIGN.md §5.2).
 *
 * Never mutates player_memories directly — validates as the asker and drafts
 * a coach-scope card (createCoachCard); the real insert happens only on
 * confirm, through memory-service.ts's mutate-first pattern (S6.2). Args
 * carry the actual text (the deliberate ids-only-rule exception, §5.2
 * deviation 2) — the DSR erasure cascade must cover this (S8).
 */
import { AssistantCardRepository } from '../repositories/assistant-card-repository'
import { PlayerMemoryRepository } from '../repositories/player-memory-repository'
import { ConversationRepository } from '../repositories/conversation-repository'
import { COACH_MEMORY_CAP, COACH_MEMORY_MAX_LENGTH } from './coach-constants'
import { emitCardCreated } from './emit-card'
import type { AssistantToolContext } from './tools'

export type ProposeRememberResult =
  | { status: 'card_posted'; cardId: string; messageId: string }
  | { status: 'declined'; message: string }

export async function proposeRemember(
  ctx: AssistantToolContext,
  input: { text: string }
): Promise<ProposeRememberResult> {
  const text = input.text.trim()
  if (!text) {
    return { status: 'declined', message: "I need something specific to remember — try again with a detail." }
  }
  if (text.length > COACH_MEMORY_MAX_LENGTH) {
    return { status: 'declined', message: `That's too long to remember (max ${COACH_MEMORY_MAX_LENGTH} characters).` }
  }

  const settingsRes = await ctx.db.query(
    `SELECT coach_memory_enabled FROM public.player_settings WHERE player_id = $1`,
    [ctx.playerId]
  )
  const memoryEnabled = settingsRes.rows[0]?.coach_memory_enabled ?? true
  if (!memoryEnabled) {
    return { status: 'declined', message: "Memory is turned off in your profile, so I can't remember that." }
  }

  const memoryRepo = new PlayerMemoryRepository(ctx.db)
  const existing = await memoryRepo.listMemories(ctx.playerId)
  if (existing.length >= COACH_MEMORY_CAP) {
    return {
      status: 'declined',
      message: "I've got as much remembered as I can hold — delete one in your profile first.",
    }
  }
  const normalized = text.toLowerCase()
  if (existing.some(m => m.body.toLowerCase() === normalized)) {
    return { status: 'declined', message: 'I already remember that.' }
  }

  const conversationRepo = new ConversationRepository(ctx.db)
  const conversationId = await conversationRepo.resolveCoachConversation(ctx.playerId)

  const cardRepo = new AssistantCardRepository(ctx.db)
  const body = `Coach wants to remember: "${text}". Only you can confirm.`
  const { card } = await cardRepo.createCoachCard({
    conversationId,
    proposerPlayerId: ctx.playerId,
    action: 'remember',
    args: { text },
    body,
    expiresInSeconds: 900,
  })
  emitCardCreated(ctx.broadcastBus, conversationId, null, card, body)

  return { status: 'card_posted', cardId: card.id, messageId: card.messageId }
}
