/**
 * S2 — 1:1 Coach routes: messages, history, clear, SSE.
 *
 * Mounted at /player/coach. Auth: account holders only (requireOrganizerAuth with a
 * linked playerId) — unlike player.ts's resolvePlayerId, there is NO player-session
 * (magic-link guest) fallback here. COACH_1TO1_DESIGN.md §7 #9: the 1:1 surface exists
 * for every authenticated account-holder; magic-link guests are excluded.
 *
 * The POST route always enqueues a coach.turn job — no trigger keyword (design §7 #1).
 * Rate limiting happens in the processor (S5), not here, so the player's own message
 * always lands in the thread even when Coach itself is capped.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { requireOrganizerAuth } from '../auth'
import { ForbiddenError } from '../auth/errors'
import { ConversationRepository } from '../repositories/conversation-repository'
import { GroupMessageRepository } from '../repositories/group-message-repository'
import { AssistantCardRepository } from '../repositories/assistant-card-repository'
import { PlayerMemoryRepository } from '../repositories/player-memory-repository'
import { confirmRemember } from '../services/memory-service'
import { getLogger } from '../logger'

const log = getLogger('coach')

const MAX_BODY_LENGTH = 4000
const MAX_TIMEZONE_LENGTH = 64
const DEFAULT_HISTORY_LIMIT = 50
const MAX_HISTORY_LIMIT = 200

const INTRO_BODY =
  "Hi, I'm Coach 👋 — this is our private space. Ask me about your matches, your game, or how to beat your Tuesday nemesis."

function validateCoachMessageBody(body: unknown): string | null {
  if (typeof body !== 'string' || !body.trim()) {
    return 'body must be a non-empty string'
  }
  if (body.length > MAX_BODY_LENGTH) {
    return `body must not exceed ${MAX_BODY_LENGTH} characters`
  }
  return null
}

function validateCoachMessageTimezone(timezone: unknown): string | null {
  if (timezone === undefined) return null
  if (typeof timezone !== 'string' || timezone.length > MAX_TIMEZONE_LENGTH) {
    return `timezone must be a string of at most ${MAX_TIMEZONE_LENGTH} characters`
  }
  return null
}

export default function coachRouter(deps: AppDependencies): Router {
  const router = Router()
  const conversationRepo = new ConversationRepository(deps.db as any)
  const groupMsgRepo = new GroupMessageRepository(deps.db as any)
  const cardRepo = new AssistantCardRepository(deps.db as any)
  const memoryRepo = new PlayerMemoryRepository(deps.db as any)

  async function resolveAccountPlayerId(authHeader: string | undefined): Promise<string> {
    const account = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore)
    if (!account.playerId) {
      throw new ForbiddenError('coach')
    }
    return account.playerId
  }

  // GET /player/coach/messages — lazily creates the conversation + posts the
  // one-time intro on first-ever open.
  router.get('/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolveAccountPlayerId(req.headers.authorization)
      const conversationId = await conversationRepo.resolveCoachConversation(playerId)

      const introCheck = await (deps.db as any).query(
        `SELECT 1 FROM messaging.group_messages
         WHERE conversation_id = $1 AND metadata->>'intro' = 'true'
         LIMIT 1`,
        [conversationId]
      )
      if (introCheck.rows.length === 0) {
        await (deps.db as any).query(
          `INSERT INTO messaging.group_messages
             (conversation_id, player_id, sender_name_snapshot, body, type, metadata)
           VALUES ($1, NULL, 'Coach', $2, 'assistant', '{"intro": true}'::jsonb)`,
          [conversationId, INTRO_BODY]
        )
      }

      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : DEFAULT_HISTORY_LIMIT
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_HISTORY_LIMIT) : DEFAULT_HISTORY_LIMIT

      // LEFT JOIN assistant_cards so remember-cards render as ActionCard on the
      // client (mirrors GroupMessageRepository.getGroupHistory's exact join —
      // a coach-scope card is looked up by message_id just like a group card).
      const result = await (deps.db as any).query(
        `SELECT gm.id, gm.conversation_id, gm.player_id, gm.sender_name_snapshot, gm.body,
                gm.type, gm.created_at, gm.metadata,
                ac.id AS card_id, ac.action AS card_action, ac.args AS card_args,
                ac.status AS card_status, ac.expires_at AS card_expires_at,
                ac.schema_version AS card_schema_version, ac.result AS card_result,
                ac.proposer_player_id AS card_proposer_player_id
         FROM messaging.group_messages gm
         LEFT JOIN messaging.assistant_cards ac ON ac.message_id = gm.id
         WHERE gm.conversation_id = $1
         ORDER BY gm.created_at ASC, gm.id ASC
         LIMIT $2`,
        [conversationId, limit]
      )

      res.status(200).json({
        conversationId,
        messages: result.rows.map((r: any) => ({
          id: r.id,
          conversationId: r.conversation_id,
          playerId: r.player_id,
          senderName: r.sender_name_snapshot,
          body: r.body,
          type: r.type,
          createdAt: r.created_at,
          metadata: r.metadata ?? null,
          ...(r.type === 'assistant' && r.card_id != null && {
            cardId: r.card_id,
            cardAction: r.card_action,
            cardArgs: r.card_args,
            cardStatus: r.card_status,
            cardExpiresAt: r.card_expires_at,
            cardSchemaVersion: r.card_schema_version,
            cardResult: r.card_result ?? null,
            cardProposerPlayerId: r.card_proposer_player_id,
          }),
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /player/coach/messages — every message is a turn (no trigger keyword).
  router.post('/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolveAccountPlayerId(req.headers.authorization)

      const bodyErr = validateCoachMessageBody(req.body.body)
      if (bodyErr) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: bodyErr })
      }
      const timezoneErr = validateCoachMessageTimezone(req.body.timezone)
      if (timezoneErr) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: timezoneErr })
      }

      const conversationId = await conversationRepo.resolveCoachConversation(playerId)

      const nameRes = await (deps.db as any).query(`SELECT name FROM public.players WHERE id = $1`, [playerId])
      const senderName: string = nameRes.rows[0]?.name ?? 'Unknown'

      const msgRes = await (deps.db as any).query(
        `INSERT INTO messaging.group_messages
           (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, $2, $3, $4, 'text')
         RETURNING id, conversation_id, player_id, sender_name_snapshot, body, type, created_at`,
        [conversationId, playerId, senderName, req.body.body]
      )
      const message = msgRes.rows[0]

      if (deps.broadcastBus) {
        deps.broadcastBus.emit(conversationId, 'message.created', {
          id: message.id,
          conversationId,
          playerId: message.player_id,
          senderName: message.sender_name_snapshot,
          body: message.body,
          type: message.type,
          createdAt: message.created_at,
        })
      }

      if (deps.jobQueue) {
        const payload = {
          messageId: message.id,
          conversationId,
          playerId,
          body: message.body,
          ...(typeof req.body.timezone === 'string' && { timezone: req.body.timezone }),
        }
        // Hyphen, not colon (Phase A live-run lesson) — BullMQ rejects ':' in custom job ids.
        await deps.jobQueue.add('coach.turn', payload, { jobId: `coach-${message.id}` })
        // In-memory queue has no consumer — process inline, off the request path
        // (fire-and-forget; undefined in BullMQ mode, mirrors the assistant.reply pattern).
        if (deps.processCoachJob) {
          const processJob = deps.processCoachJob
          setImmediate(() => {
            processJob(payload).catch((e: Error) => {
              log.error('coach.inline.failed', { playerId, error: e.message })
            })
          })
        }
      }

      log.info('coach.message.posted', { playerId, messageId: message.id })

      res.status(201).json({
        id: message.id,
        conversationId,
        playerId: message.player_id,
        senderName: message.sender_name_snapshot,
        body: message.body,
        type: message.type,
        createdAt: message.created_at,
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /player/coach/clear — hard-deletes the thread; memories are untouched.
  router.post('/clear', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolveAccountPlayerId(req.headers.authorization)
      const conversationId = await conversationRepo.resolveCoachConversation(playerId)

      const cleared = await groupMsgRepo.clearConversation(conversationId)

      log.info('coach.cleared', { playerId, cleared })

      res.status(200).json({ cleared })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/coach/events — SSE stream for the coach conversation.
  router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!deps.broadcastBus) {
        return res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'SSE not available' })
      }

      // Support both Authorization header and query param token (EventSource compat).
      let authHeader = req.headers.authorization
      if (!authHeader && req.query.token) {
        const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token
        authHeader = `Bearer ${token}`
      }

      const playerId = await resolveAccountPlayerId(authHeader)
      const conversationId = await conversationRepo.resolveCoachConversation(playerId)

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      const unsubscribe = deps.broadcastBus.subscribe(conversationId, (event, data) => {
        if (!res.writableEnded) {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        }
      })

      req.on('close', () => {
        unsubscribe()
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /player/coach/cards/:cardId/confirm — mutate-first (memory service
  // inserts player_memories), then an atomic pending->confirmed flip.
  router.post('/cards/:cardId/confirm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolveAccountPlayerId(req.headers.authorization)
      const cardId = req.params.cardId as string

      const card = await cardRepo.getCard(cardId)
      if (!card || card.action !== 'remember') {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Card not found' })
      }
      if (card.proposerPlayerId !== playerId) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the proposer can confirm this card' })
      }
      if (card.status !== 'pending') {
        return res.status(409).json({ code: 'ALREADY_RESOLVED', message: `This card is already ${card.status}` })
      }
      if (Date.now() > card.expiresAt.getTime()) {
        return res.status(409).json({ code: 'EXPIRED', message: 'This card has expired' })
      }

      const args = card.args as { text: string }
      const result = await confirmRemember({ cardRepo, memoryRepo }, { cardId, playerId, text: args.text })
      if (!result.ok) {
        const reread = await cardRepo.getCard(cardId)
        return res.status(409).json({ code: 'ALREADY_RESOLVED', message: `This card is already ${reread?.status}` })
      }

      const cardResult = result.status === 'confirmed' ? { memoryId: result.memoryId } : { reason: result.reason }

      if (deps.broadcastBus) {
        const conversationId = await conversationRepo.resolveCoachConversation(playerId)
        deps.broadcastBus.emit(conversationId, 'card.updated', {
          messageId: card.messageId,
          cardId,
          status: result.status,
          result: cardResult,
        })
      }

      return res.status(200).json({ card: { id: cardId, status: result.status, result: cardResult } })
    } catch (err) {
      next(err)
    }
  })

  // POST /player/coach/cards/:cardId/cancel — proposer dismisses a pending card.
  router.post('/cards/:cardId/cancel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolveAccountPlayerId(req.headers.authorization)
      const cardId = req.params.cardId as string

      const card = await cardRepo.getCard(cardId)
      if (!card || card.action !== 'remember') {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Card not found' })
      }
      if (card.proposerPlayerId !== playerId) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the proposer can cancel this card' })
      }
      if (card.status !== 'pending') {
        return res.status(409).json({ code: 'ALREADY_RESOLVED', message: `This card is already ${card.status}` })
      }

      const claimed = await cardRepo.claimCard(cardId, 'cancelled')
      if (!claimed) {
        const reread = await cardRepo.getCard(cardId)
        return res.status(409).json({ code: 'ALREADY_RESOLVED', message: `This card is already ${reread?.status}` })
      }

      if (deps.broadcastBus) {
        const conversationId = await conversationRepo.resolveCoachConversation(playerId)
        deps.broadcastBus.emit(conversationId, 'card.updated', {
          messageId: card.messageId,
          cardId,
          status: 'cancelled',
          result: null,
        })
      }

      return res.status(200).json({ card: { id: cardId, status: 'cancelled' } })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/coach/memories — owner's memories, newest-first.
  router.get('/memories', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolveAccountPlayerId(req.headers.authorization)
      const memories = await memoryRepo.listMemories(playerId)
      res.status(200).json({
        memories: memories.map(m => ({ id: m.id, body: m.body, source: m.source, createdAt: m.createdAt })),
      })
    } catch (err) {
      next(err)
    }
  })

  // DELETE /player/coach/memories/:id — owner-scoped; no card for forget (low-stakes direction).
  router.delete('/memories/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolveAccountPlayerId(req.headers.authorization)
      const memoryId = req.params.id as string

      const deleted = await memoryRepo.deleteMemory(playerId, memoryId)
      if (deleted === 0) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Memory not found' })
      }

      log.info('coach.memory.deleted', { playerId, memoryId })
      res.status(204).send()
    } catch (err) {
      next(err)
    }
  })

  return router
}
