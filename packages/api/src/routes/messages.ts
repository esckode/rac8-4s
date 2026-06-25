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
import { ConversationRepository } from '../repositories/conversation-repository'

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
  const conversationRepo = new ConversationRepository(deps.db as any)

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

      const { message, recipientCount, recipientIds } = await messageRepo.sendBroadcast({
        tournamentId,
        senderPlayerId: payload.sub,
        body: req.body.body,
      })

      const conversationId = await conversationRepo.resolveConversation(tournamentId)

      if (deps.broadcastBus) {
        const senderName = await messageRepo.getPlayerName(message.senderPlayerId)
        deps.broadcastBus.emit(conversationId, 'message.created', {
          id: message.id,
          tournamentId: message.tournamentId,
          senderPlayerId: message.senderPlayerId,
          senderName,
          recipientPlayerId: null,
          matchId: message.matchId,
          body: message.body,
          legalHold: message.legalHold,
          createdAt: message.createdAt,
          read_at: null,
        })
      }

      // Enqueue one messaging.notify job per recipient (deduped by jobId so a
      // burst of broadcasts collapses to one job per recipient — debounce).
      if (deps.jobQueue) {
        for (const recipientId of recipientIds) {
          await deps.jobQueue.add(
            'messaging.notify',
            { conversationId, tournamentId },
            { jobId: `notify:${conversationId}:${recipientId}` }
          )
        }
      }

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

  // GET /tournaments/:id/messages/:msgId/ack-count — organizer-only broadcast ack count
  // Registered before /:id/messages/:msgId/legal-hold and /:id/messages/:msgId/read
  // (more-specific literal path; §10 route ordering: static before parameterized).
  router.get('/:id/messages/:msgId/ack-count', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string
      const msgId = req.params.msgId as string

      // Players are denied this endpoint (403). Organizers only.
      let isPlayerSession = false
      try {
        await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        isPlayerSession = true
      } catch {
        // not a player session
      }
      if (isPlayerSession) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the tournament organizer may view ack counts' })
      }

      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)

      const tournament = await tournamentRepo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      // Verify the message belongs to this tournament
      const msgCheck = await deps.db.query(
        `SELECT id FROM messaging.messages WHERE id = $1 AND tournament_id = $2`,
        [msgId, tournamentId]
      )
      if (msgCheck.rows.length === 0) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Message not found' })
      }

      const count = await messageRepo.getBroadcastAckCount(msgId)

      res.status(200).json(count)
    } catch (err) {
      next(err)
    }
  })

  // PATCH /tournaments/:id/messages/:msgId/legal-hold — organizer sets legal_hold
  // Registered before POST /:id/messages/:msgId/read and POST /:id/messages to
  // respect §10 route ordering (more-specific literal paths before parameterized).
  router.patch('/:id/messages/:msgId/legal-hold', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string
      const msgId = req.params.msgId as string

      // A player session is not authorized for this action (organizer-only).
      let isPlayerSession = false
      try {
        await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        isPlayerSession = true
      } catch {
        // not a player session — try organizer below
      }
      if (isPlayerSession) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the tournament organizer may set legal_hold' })
      }

      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)

      const tournament = await tournamentRepo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const { legalHold } = req.body
      if (typeof legalHold !== 'boolean') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'legalHold must be a boolean' })
      }

      const updated = await messageRepo.setLegalHold(tournamentId, msgId, legalHold)
      if (!updated) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Message not found' })
      }

      res.status(200).json(updated)
    } catch (err) {
      next(err)
    }
  })

  // POST /tournaments/:id/messages/:msgId/read — mark read (player session)
  // Registered before POST /:id/messages (same prefix; more specific path first)
  //
  // Phase 5: enqueues a messaging.read_receipt.flush job rather than doing a
  // synchronous UPDATE. Read receipts are low-stakes bookkeeping — a crash
  // losing the in-flight job is acceptable (design §11). Returns 204 immediately.
  router.post('/:id/messages/:msgId/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const msgId = req.params.msgId as string

      const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      await deps.jobQueue?.add('messaging.read_receipt.flush', {
        reads: [{ messageId: msgId, playerId: session.playerId }],
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

      // Opponent-only DM authorization (V5.1):
      // When a recipientPlayerId is provided, the sender must be a matched opponent of
      // the recipient in this tournament, OR the recipient must be the tournament organizer
      // (for dispute threads). Players may not DM arbitrary participants.
      if (recipientPlayerId) {
        const tournament = await tournamentRepo.findById(tournamentId)
        if (!tournament) {
          return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
        }
        const allowed = await messageRepo.areOpponents(
          tournamentId,
          session.playerId,
          recipientPlayerId,
          tournament.creator_id
        )
        if (!allowed) {
          return res.status(403).json({
            code: 'FORBIDDEN',
            message: 'You may only send direct messages to your matched opponents or the organizer',
          })
        }
      }

      // If no recipientPlayerId, fall back to sender (self-addressed coordination note)
      const effectiveRecipient = recipientPlayerId ?? session.playerId

      const message = await messageRepo.sendDirectMessage({
        tournamentId,
        senderPlayerId: session.playerId,
        recipientPlayerId: effectiveRecipient,
        body: req.body.body,
        matchId: matchId ?? undefined,
      })

      const conversationId = await conversationRepo.resolveConversation(tournamentId)

      if (deps.broadcastBus) {
        const senderName = await messageRepo.getPlayerName(message.senderPlayerId)
        deps.broadcastBus.emit(conversationId, 'message.created', {
          id: message.id,
          tournamentId: message.tournamentId,
          senderPlayerId: message.senderPlayerId,
          senderName,
          recipientPlayerId: message.recipientPlayerId,
          matchId: message.matchId,
          body: message.body,
          legalHold: message.legalHold,
          createdAt: message.createdAt,
          read_at: null,
        })
      }

      // Enqueue messaging.notify for the recipient (deduped by jobId — debounce).
      if (deps.jobQueue) {
        await deps.jobQueue.add(
          'messaging.notify',
          { conversationId, tournamentId },
          { jobId: `notify:${conversationId}:${effectiveRecipient}` }
        )
      }

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

      // Accept either a player session or an organizer JWT.
      // Capture the player's ID when present so we can join message_recipients
      // and return per-player read_at in the history response.
      let authed = false
      let viewerPlayerId: string | undefined

      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        authed = true
        viewerPlayerId = session.playerId
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

      // Optional thread filter: 'announcements' | 'dm:{playerId}' | 'match:{matchId}'
      // For 'dm:{playerId}' the viewerPlayerId scopes results to only their conversation.
      const thread = req.query.thread as string | undefined

      // Security: 'dm:{playerId}' without a viewer (organizer auth) leaks nothing
      // because the query returns messages where the named player is a party.
      // Organizers see the full history regardless (they have no viewerPlayerId).

      const conversationId = await conversationRepo.resolveConversation(tournamentId)
      const messages = await messageRepo.getHistoryByConversation({ conversationId, limit, before, viewerPlayerId, thread })

      // V6.1: For DM messages where the viewer is the sender, attach recipientReadAt
      // if and only if the recipient has opted in (share_read_receipts = true).
      // Only the sender sees this field — organizers (no viewerPlayerId) never get it.
      let outMessages: Array<typeof messages[0] & { recipientReadAt?: Date | null }>
      if (viewerPlayerId) {
        outMessages = await Promise.all(
          messages.map(async m => {
            // Only for DMs where the viewer is the sender
            if (m.recipientPlayerId && m.senderPlayerId === viewerPlayerId) {
              const recipientReadAt = await messageRepo.getDmRecipientReadAt(m.id, m.recipientPlayerId)
              if (recipientReadAt !== null) {
                return { ...m, recipientReadAt }
              }
            }
            return m
          })
        )
      } else {
        outMessages = messages
      }

      res.status(200).json({ messages: outMessages })
    } catch (err) {
      next(err)
    }
  })

  return router
}
