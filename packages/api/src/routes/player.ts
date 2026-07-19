import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { PlayerRepository } from '../db'
import { requirePlayerSessionAuth, requireOrganizerAuth } from '../auth'
import { getLogger } from '../logger'

const log = getLogger('player')

export default function playerRouter(deps: AppDependencies) {
  const router = Router()
  const playerRepo = new PlayerRepository(deps.db)

  // Resolve the acting player's id from either a magic-link player session or a
  // registered player's account JWT (role 'player', carries playerId). Used by
  // the cross-tournament player views, which aren't tournament-scoped.
  async function resolvePlayerId(authHeader: string | undefined): Promise<string> {
    try {
      const session = await requirePlayerSessionAuth(authHeader, deps.tokenStore)
      return session.playerId
    } catch (sessionErr) {
      let account
      try {
        account = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore)
      } catch {
        throw sessionErr
      }
      // Participation depends on a linked playerId, not the authority role —
      // an organizer who also plays qualifies (dual-role).
      if (account.playerId) {
        return account.playerId
      }
      throw sessionErr
    }
  }

  // GET /player/session - validate a player-session token and return identity
  // Used by the frontend to restore a magic-link player session (no account JWT).
  router.get('/session', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      res.json({
        playerId: payload.playerId,
        tournamentId: payload.tournamentId,
        role: 'player',
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/tournaments - list player's tournaments
  router.get('/tournaments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
      const limit = req.query.limit ? parseInt(req.query.limit as string) : deps.config.limits.paginationDefaults.tournaments

      const result = await playerRepo.listTournamentsByPlayer(playerId, { offset, limit })

      res.json({
        tournaments: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          sport: row.sport,
          status: row.status,
          registeredAt: row.created_at,
        })),
        pagination: {
          offset,
          limit,
          total: result.total,
          hasMore: offset + limit < result.total,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/contact-preferences - get player's contact sharing preference
  router.get('/contact-preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      const player = await playerRepo.findById(payload.playerId)
      if (!player) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Player not found' })
      }

      res.json({ shareContact: player.share_contact })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /player/contact-preferences - update contact sharing preference
  router.patch('/contact-preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      if (typeof req.body.shareContact !== 'boolean') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'shareContact must be a boolean' })
      }

      const updated = await playerRepo.updateShareContact(payload.playerId, req.body.shareContact)

      log.info('contact.preferences.updated', { playerId: payload.playerId, shareContact: req.body.shareContact })

      res.json({ shareContact: updated.share_contact })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/read-receipt-preferences - get player's read-receipt sharing preference (V6.1)
  // Registered before PATCH to respect §10 route ordering.
  router.get('/read-receipt-preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      const player = await playerRepo.findById(payload.playerId)
      if (!player) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Player not found' })
      }

      res.json({ shareReadReceipts: player.share_read_receipts })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /player/read-receipt-preferences - update read-receipt sharing preference (V6.1)
  router.patch('/read-receipt-preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      if (typeof req.body.shareReadReceipts !== 'boolean') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'shareReadReceipts must be a boolean' })
      }

      const updated = await playerRepo.updateShareReadReceipts(payload.playerId, req.body.shareReadReceipts)

      log.info('read_receipt.preferences.updated', { playerId: payload.playerId, shareReadReceipts: req.body.shareReadReceipts })

      res.json({ shareReadReceipts: updated.share_read_receipts })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/notifications/messages - personal notification history
  router.get('/notifications/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 100) : 50

      const result = await deps.db.query(
        `SELECT gm.id, gm.body, gm.type, gm.created_at, gm.metadata
         FROM messaging.group_messages gm
         JOIN messaging.conversations c ON c.id = gm.conversation_id
         WHERE c.type = 'personal' AND c.player_id = $1
         ORDER BY gm.created_at DESC
         LIMIT $2`,
        [playerId, limit]
      )

      res.json({
        messages: result.rows.map((r: any) => ({
          id: r.id,
          body: r.body,
          type: r.type,
          createdAt: r.created_at,
          metadata: r.metadata,
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /player/notifications/read - mark all personal notifications as read
  router.post('/notifications/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      await deps.db.query(
        `UPDATE messaging.group_message_recipients gmr
         SET read_at = now()
         FROM messaging.group_messages gm
         JOIN messaging.conversations c ON c.id = gm.conversation_id
         WHERE gmr.message_id = gm.id
           AND c.type = 'personal'
           AND c.player_id = $1
           AND gmr.player_id = $1
           AND gmr.read_at IS NULL`,
        [playerId]
      )

      log.info('notifications.read', { playerId })

      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/notifications/unread - count of unread personal notifications
  router.get('/notifications/unread', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      const result = await deps.db.query(
        `SELECT COUNT(*) AS n
         FROM messaging.group_message_recipients gmr
         JOIN messaging.group_messages gm ON gm.id = gmr.message_id
         JOIN messaging.conversations c ON c.id = gm.conversation_id
         WHERE c.type = 'personal'
           AND c.player_id = $1
           AND gmr.player_id = $1
           AND gmr.read_at IS NULL`,
        [playerId]
      )

      res.json({ unread: Number(result.rows[0].n) })
    } catch (err) {
      next(err)
    }
  })

  return router
}
