/**
 * emitCardCreated — B7 fix.
 *
 * AssistantCardRepository.createCard() has no broadcastBus (repositories
 * return data; routes/services emit — the established pattern), so without
 * this, a freshly drafted card was invisible until the client's next full
 * history re-fetch (e.g. on SSE reconnect). Every propose_* tool calls this
 * right after createCard() succeeds, mirroring the message.created shape
 * getGroupHistory already returns for a card row (B3.0) so the client's
 * message.created handler (a straight store.append(payload), no re-fetch)
 * renders it identically either way.
 */
import type { IBroadcastBus } from '../broadcast-bus'
import type { AssistantCardRow } from '../repositories/assistant-card-repository'

export function emitCardCreated(
  broadcastBus: IBroadcastBus | undefined,
  conversationId: string,
  groupId: string,
  card: AssistantCardRow,
  body: string
): void {
  if (!broadcastBus) return
  broadcastBus.emit(conversationId, 'message.created', {
    id: card.messageId,
    conversationId,
    groupId,
    playerId: null,
    senderName: 'Coach',
    body,
    type: 'assistant',
    createdAt: card.createdAt,
    cardId: card.id,
    cardAction: card.action,
    cardArgs: card.args,
    cardStatus: card.status,
    cardExpiresAt: card.expiresAt,
    cardSchemaVersion: card.schemaVersion,
    cardResult: card.result,
    cardProposerPlayerId: card.proposerPlayerId,
  })
}
