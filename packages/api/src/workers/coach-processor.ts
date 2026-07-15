/**
 * coach.turn processor — worker-tier consumer for 1:1 Coach turns
 * (COACH_1TO1_IMPLEMENTATION.md §S5). Mirrors assistant-service.ts +
 * assistant-processor.ts's combined shape, folded into one file per the
 * plan: gates the turn behind checkCoach, builds the coach-specific volatile
 * context (player snapshot + age-annotated memories), calls the CoachClient,
 * inserts the reply via the conversation-first send, and ALWAYS resolves.
 */
import { Pool } from 'pg'
import type { GroupMessageRepository } from '../repositories/group-message-repository'
import type { PlayerMemoryRepository } from '../repositories/player-memory-repository'
import type { IBroadcastBus } from '../broadcast-bus'
import type { CoachClient } from '../assistant/coach-client'
import { AssistantRateLimiter, estimateTurnUsd } from '../assistant/rate-limiter'
import { deriveCoachHeadsUpFooter } from '../assistant/rate-limiter'
import { buildCoachToolContext } from '../assistant/tools'
import { buildCoachSystemPrompt } from '../assistant/coach-prompt'
import { loadHelpCorpus } from '../assistant/prompt'
import { buildPlayerSnapshot } from '../assistant/player-snapshot'
import { COACH_HISTORY_WINDOW } from '../assistant/coach-constants'
import { getLogger } from '../logger'

const log = getLogger('coach-processor')

export const COACH_FALLBACK_REPLY = "I couldn't answer that right now — try again in a bit."

export interface CoachJobPayload {
  messageId: string
  conversationId: string
  playerId: string
  body: string
  /** Browser IANA timezone, optional and never trusted for auth. */
  timezone?: string
}

export interface CoachProcessorDeps {
  pool: Pool
  groupMessageRepo: GroupMessageRepository
  memoryRepo: PlayerMemoryRepository
  client: CoachClient
  rateLimiter: AssistantRateLimiter
  broadcastBus?: IBroadcastBus
}

// Byte-stable system prompt, built once (prompt caching).
let cachedSystemPrompt: string | null = null
function systemPrompt(): string {
  if (cachedSystemPrompt === null) {
    cachedSystemPrompt = buildCoachSystemPrompt(loadHelpCorpus())
  }
  return cachedSystemPrompt
}

/**
 * Age-annotates a memory's created_at for turn injection (design §7 #7c —
 * no TTL/sweeper, just a hedge the model can read: "[noted 3 months ago]").
 * Tiers: days for <14 days, weeks for <9 weeks, months beyond that.
 */
export function formatMemoryAge(createdAt: Date, now: Date): string {
  const days = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 3600 * 1000))
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 9) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

export async function processCoachTurn(payload: CoachJobPayload, deps: CoachProcessorDeps): Promise<void> {
  const { messageId, conversationId, playerId, body, timezone } = payload
  const { pool, groupMessageRepo, memoryRepo, client, rateLimiter, broadcastBus } = deps
  const askerTimezone = timezone ?? 'UTC'
  const startedAt = Date.now()

  try {
    // Idempotency: a redelivered job must not double-reply.
    const already = await pool.query(
      `SELECT 1 FROM messaging.group_messages
       WHERE type = 'assistant' AND metadata->>'replyTo' = $1
       LIMIT 1`,
      [messageId]
    )
    if (already.rows.length > 0) {
      log.info('coach.skipped', { playerId, messageId, reason: 'duplicate_delivery' })
      return
    }

    const check = await rateLimiter.checkCoach(playerId)
    if (check.limited) {
      log.info('coach.rate_limited', { playerId, messageId })
      if (check.capMessage) {
        const { message } = await groupMessageRepo.sendAssistantMessageToConversation(
          conversationId,
          check.capMessage,
          { replyTo: messageId, rateLimited: true }
        )
        broadcastBus?.emit(conversationId, 'message.created', {
          id: message.id,
          conversationId,
          playerId: null,
          senderName: message.senderName,
          body: message.body,
          type: message.type,
          createdAt: message.createdAt,
        })
      }
      return
    }

    let replyBody: string
    let usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number } | null = null
    let toolRounds = 0
    try {
      const settingsRes = await pool.query(
        `SELECT coach_memory_enabled FROM public.player_settings WHERE player_id = $1`,
        [playerId]
      )
      const memoryEnabled = settingsRes.rows[0]?.coach_memory_enabled ?? true

      const toolContext = await buildCoachToolContext(pool, playerId, { broadcastBus })
      const snapshot = await buildPlayerSnapshot(toolContext)

      const now = new Date()
      let memoriesBlock = ''
      if (memoryEnabled) {
        const memories = await memoryRepo.listMemories(playerId)
        if (memories.length > 0) {
          memoriesBlock = `\n\nWhat you remember about this player:\n${memories
            .map(m => `- [noted ${formatMemoryAge(m.createdAt, now)}] ${m.body}`)
            .join('\n')}`
        }
      }

      const recent = await groupMessageRepo.getRecentMessages({ conversationId, limit: COACH_HISTORY_WINDOW })
      const history = recent
        .filter(m => m.type === 'text' || m.type === 'assistant')
        .map(m => ({ role: (m.type === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.body }))

      const currentDateTime = now.toISOString()
      const volatileBlock = `${snapshot}${memoriesBlock}\n\nCurrent time: ${currentDateTime}. Asker timezone: ${askerTimezone}.`

      const result = await client.runCoachTurn({
        systemPrompt: systemPrompt(),
        history,
        volatileBlock,
        newMessage: body,
        toolContext,
        memoryEnabled,
      })

      const headsUp = deriveCoachHeadsUpFooter(check.remainingHour, check.remainingDay)
      replyBody = (result.text || COACH_FALLBACK_REPLY) + (headsUp ? `\n\n${headsUp}` : '')
      usage = result.usage
      toolRounds = result.toolRounds
      await rateLimiter.recordSpend(estimateTurnUsd(result.usage))
    } catch (err) {
      log.error('coach.turn.failed', {
        playerId,
        messageId,
        error: err instanceof Error ? err.message : String(err),
      })
      replyBody = COACH_FALLBACK_REPLY
    }

    const { message } = await groupMessageRepo.sendAssistantMessageToConversation(conversationId, replyBody, {
      replyTo: messageId,
    })

    if (broadcastBus) {
      broadcastBus.emit(conversationId, 'message.created', {
        id: message.id,
        conversationId,
        playerId: null,
        senderName: message.senderName,
        body: message.body,
        type: message.type,
        createdAt: message.createdAt,
      })
    }

    log.info('coach.replied', {
      playerId,
      messageId,
      replyId: message.id,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cacheReadInputTokens: usage?.cacheReadInputTokens ?? 0,
      toolRounds,
      latencyMs: Date.now() - startedAt,
      fallback: usage === null,
    })
  } catch (err) {
    // Resolve, never rethrow — retrying an LLM turn risks duplicate spend.
    log.error('coach.processor.failed', {
      playerId,
      messageId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
