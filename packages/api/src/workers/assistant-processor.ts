/**
 * assistant.reply processor — worker-tier consumer for @coach turns.
 *
 * Gates the service behind the Q10 rate limiter, posts the polite cap
 * message at most once per limited window, records real spend post-turn,
 * and ALWAYS resolves (a failed turn already posted the fallback row inside
 * the service; a rejection here is logged, never retried into a storm).
 */
import { Pool } from 'pg'
import type { GroupMessageRepository } from '../repositories/group-message-repository'
import type { IBroadcastBus } from '../broadcast-bus'
import type { AssistantClient } from '../assistant/assistant-client'
import { AssistantRateLimiter, estimateTurnUsd } from '../assistant/rate-limiter'
import { handleAssistantJob, type AssistantJobPayload } from '../assistant/assistant-service'
import { getLogger } from '../logger'

const log = getLogger('assistant-processor')

export const ASSISTANT_CAP_REPLY = "I've hit my limit for now — try again later."

export interface AssistantProcessorDeps {
  pool: Pool
  groupMessageRepo: GroupMessageRepository
  client: AssistantClient
  rateLimiter: AssistantRateLimiter
  broadcastBus?: IBroadcastBus
}

export async function processAssistantReply(
  payload: AssistantJobPayload,
  deps: AssistantProcessorDeps
): Promise<void> {
  const { groupId, playerId, conversationId, messageId } = payload
  try {
    const check = await deps.rateLimiter.check(playerId, groupId)
    if (!check.allowed) {
      log.info('assistant.rate_limited', { groupId, playerId, messageId, reason: check.reason })
      if (check.shouldNotify) {
        const { message, conversationId: convId } = await deps.groupMessageRepo.sendAssistantMessage({
          groupId,
          body: ASSISTANT_CAP_REPLY,
          metadata: { replyTo: messageId, rateLimited: true },
        })
        deps.broadcastBus?.emit(convId ?? conversationId, 'message.created', {
          id: message.id,
          conversationId: convId,
          groupId,
          playerId: null,
          senderName: message.senderName,
          body: message.body,
          type: message.type,
          createdAt: message.createdAt,
        })
      }
      return
    }

    await handleAssistantJob(payload, {
      pool: deps.pool,
      groupMessageRepo: deps.groupMessageRepo,
      client: deps.client,
      broadcastBus: deps.broadcastBus,
      onUsage: async usage => {
        await deps.rateLimiter.recordSpend(estimateTurnUsd(usage))
      },
    })
  } catch (err) {
    // Resolve, never rethrow — the fallback row (if reachable) was already
    // posted by the service; retrying an LLM turn risks duplicate spend.
    log.error('assistant.processor.failed', {
      groupId,
      playerId,
      messageId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
