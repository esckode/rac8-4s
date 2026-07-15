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

      const result = await (deps.db as any).query(
        `SELECT id, conversation_id, player_id, sender_name_snapshot, body, type, created_at, metadata
         FROM messaging.group_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC, id ASC
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

  return router
}
