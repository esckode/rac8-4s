import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { getLogger } from '../logger'
import {
  requirePlayerSessionAuth,
  requireOrganizerAuth,
  assertOrganizerOwnsTournament,
} from '../auth'
import { TournamentRepository } from '../db'
import { MessageRepository } from '../repositories/message-repository'

const log = getLogger('messages')

const MAX_BODY_LENGTH = 4000

function validateBody(body: unknown): string | null {
  if (typeof body !== 'string' || !body.trim()) {
    return 'body must be a non-empty string'
  }
  if (body.length > MAX_BODY_LENGTH) {
    return `body must not exceed ${MAX_BODY_LENGTH} characters`
  }
  return null
}

export default function messagesRouter(deps: AppDependencies) {
  const router = Router()
  const tournamentRepo = new TournamentRepository(deps.db)
  const messageRepo = new MessageRepository(deps.db as any)

  // POST /tournaments/:id/announcements — organizer-only broadcast
  // Registered before /:id/messages/:msgId to respect §10 (static before parameterized)
  router.post('/:id/announcements', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string

      // A player session token is a valid credential but is not authorized for this
      // action (broadcast is organizer-only). Return 403 rather than 401 so that the
      // client knows the identity was recognized but the action is forbidden.
      let isPlayerSession = false
      try {
        await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        isPlayerSession = true
      } catch {
        // not a player session — try organizer below
      }
      if (isPlayerSession) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the tournament organizer may send announcements' })
      }

      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)

      const tournament = await tournamentRepo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const bodyErr = validateBody(req.body.body)
      if (bodyErr) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: bodyErr })
      }

      const { message, recipientCount } = await messageRepo.sendBroadcast({
        tournamentId,
        senderPlayerId: payload.sub,
        body: req.body.body,
      })

      deps.broadcastBus?.emit(tournamentId, 'message.created', {
        id: message.id,
        tournamentId: message.tournamentId,
        senderPlayerId: message.senderPlayerId,
        recipientPlayerId: null,
        createdAt: message.createdAt,
      })

      log.info('announcement.sent', {
        tournamentId,
        messageId: message.id,
        organizerId: payload.sub,
      })

      res.status(201).json({ message, recipientCount })
    } catch (err) {
      next(err)
    }
  })

  // POST /tournaments/:id/messages/:msgId/read — mark read (player session)
  // Registered before POST /:id/messages (same prefix; more specific path first)
  router.post('/:id/messages/:msgId/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const msgId = req.params.msgId as string

      const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      // markRead omits message_created_at from WHERE intentionally (see repository comment
      // on microsecond precision mismatch with partitioned FK). Pass a placeholder.
      await messageRepo.markRead({
        messageId: msgId,
        messageCreatedAt: new Date(),
        playerId: session.playerId,
      })

      res.status(204).send()
    } catch (err) {
      next(err)
    }
  })

  // POST /tournaments/:id/messages — player DM
  router.post('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string

      const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      const bodyErr = validateBody(req.body.body)
      if (bodyErr) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: bodyErr })
      }

      const { recipientPlayerId, matchId } = req.body

      // If no recipientPlayerId, fall back to sender (self-addressed coordination note)
      const effectiveRecipient = recipientPlayerId ?? session.playerId

      const message = await messageRepo.sendDirectMessage({
        tournamentId,
        senderPlayerId: session.playerId,
        recipientPlayerId: effectiveRecipient,
        body: req.body.body,
        matchId: matchId ?? undefined,
      })

      deps.broadcastBus?.emit(tournamentId, 'message.created', {
        id: message.id,
        tournamentId: message.tournamentId,
        senderPlayerId: message.senderPlayerId,
        recipientPlayerId: message.recipientPlayerId,
        createdAt: message.createdAt,
      })

      log.info('message.sent', {
        tournamentId,
        messageId: message.id,
        senderPlayerId: session.playerId,
      })

      res.status(201).json(message)
    } catch (err) {
      next(err)
    }
  })

  // GET /tournaments/:id/messages — history (player or organizer)
  router.get('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string

      // Accept either a player session or an organizer JWT
      let authed = false
      try {
        await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        authed = true
      } catch {
        // fall through to organizer check
      }

      if (!authed) {
        try {
          await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
          authed = true
        } catch {
          // neither worked
        }
      }

      if (!authed) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Unauthorized' })
      }

      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50

      let before: { createdAt: Date; id: string } | undefined
      if (req.query.before) {
        const parts = (req.query.before as string).split(',')
        if (parts.length === 2 && parts[0] && parts[1]) {
          const createdAt = new Date(parts[0])
          if (!isNaN(createdAt.getTime())) {
            before = { createdAt, id: parts[1] }
          }
        }
      }

      const messages = await messageRepo.getHistory({ tournamentId, limit, before })

      res.status(200).json({ messages })
    } catch (err) {
      next(err)
    }
  })

  return router
}
