/**
 * Assistant service — one @coach turn, worker-tier (never the request path).
 *
 * Stateless per turn (Q13): fresh context = asker name + the last ~20 group
 * messages (Coach's own prior replies are ordinary rows, so the chat IS the
 * memory). Idempotent on the triggering message id (Q12) via the reply row's
 * metadata.replyTo. On any client failure the fallback row is posted — a
 * mentioned bot that says nothing looks broken — and the job RESOLVES (no
 * retry storm).
 */
import { Pool } from 'pg'
import type { GroupMessageRepository } from '../repositories/group-message-repository'
import type { IBroadcastBus } from '../broadcast-bus'
import type { AssistantClient } from './assistant-client'
import { buildAssistantToolContext } from './tools'
import { buildSystemPrompt, loadHelpCorpus } from './prompt'
import { getLogger } from '../logger'

const log = getLogger('assistant-service')

export interface AssistantJobPayload {
  messageId: string
  conversationId: string
  groupId: string
  playerId: string
  body: string
  /** Browser IANA timezone (B-Q6), optional and never trusted for auth. */
  timezone?: string
}

export interface AssistantServiceDeps {
  pool: Pool
  groupMessageRepo: GroupMessageRepository
  client: AssistantClient
  broadcastBus?: IBroadcastBus
  /** Called with real usage after a successful turn (spend recording). */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => Promise<void>
}

export const ASSISTANT_FALLBACK_REPLY = "I couldn't answer that right now — try again in a bit."

// Byte-stable system prompt, built once (prompt caching)
let cachedSystemPrompt: string | null = null
function systemPrompt(): string {
  if (cachedSystemPrompt === null) {
    cachedSystemPrompt = buildSystemPrompt(loadHelpCorpus())
  }
  return cachedSystemPrompt
}

export async function handleAssistantJob(
  payload: AssistantJobPayload,
  deps: AssistantServiceDeps
): Promise<void> {
  const { messageId, conversationId, groupId, playerId, body, timezone } = payload
  const askerTimezone = timezone ?? 'UTC'
  const { pool, groupMessageRepo, client, broadcastBus, onUsage } = deps
  const startedAt = Date.now()

  // Idempotency (Q12): a redelivered job must not double-reply
  const already = await pool.query(
    `SELECT 1 FROM messaging.group_messages
     WHERE type = 'assistant' AND metadata->>'replyTo' = $1
     LIMIT 1`,
    [messageId]
  )
  if (already.rows.length > 0) {
    log.info('assistant.skipped', { groupId, messageId, reason: 'duplicate_delivery' })
    return
  }

  // Toggle may have flipped between enqueue and processing
  const toggle = await pool.query(
    `SELECT assistant_enabled FROM public.player_groups WHERE id = $1`,
    [groupId]
  )
  if (toggle.rows[0]?.assistant_enabled !== true) {
    log.info('assistant.skipped', { groupId, messageId, reason: 'assistant_disabled' })
    return
  }

  let replyBody: string
  let usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number } | null = null
  let toolRounds = 0
  try {
    const askerName = (await groupMessageRepo.getPlayerName(playerId)) ?? 'A member'
    const recent = await groupMessageRepo.getRecentMessages({ conversationId, limit: 20 })
    const toolContext = await buildAssistantToolContext(pool, { playerId, groupId, broadcastBus })

    const historyLines = recent
      .map(m => `${m.senderName ?? 'Someone'}: ${m.body}`)
      .join('\n')
    const currentDateTime = new Date().toISOString()
    const contextBlock = `Recent group chat (oldest first):
${historyLines}

The asking player is ${askerName} (timezone: ${askerTimezone}). Current time: ${currentDateTime}. Their message: ${body}`

    const result = await client.runTurn({
      systemPrompt: systemPrompt(),
      contextBlock,
      question: body,
      toolContext,
      askerTimezone,
      currentDateTime,
    })
    replyBody = result.text || ASSISTANT_FALLBACK_REPLY
    usage = result.usage
    toolRounds = result.toolRounds
    if (onUsage) await onUsage(result.usage)
  } catch (err) {
    log.error('assistant.turn.failed', {
      groupId,
      messageId,
      error: err instanceof Error ? err.message : String(err),
    })
    replyBody = ASSISTANT_FALLBACK_REPLY
  }

  const { message, conversationId: convId } = await groupMessageRepo.sendAssistantMessage({
    groupId,
    body: replyBody,
    metadata: { replyTo: messageId },
  })

  if (broadcastBus) {
    broadcastBus.emit(convId, 'message.created', {
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

  log.info('assistant.replied', {
    groupId,
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
}
