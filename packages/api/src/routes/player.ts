import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { PlayerRepository } from '../db'
import { requirePlayerSessionAuth } from '../auth'
import { getLogger } from '../logger'

const log = getLogger('player')

export default function playerRouter(deps: AppDependencies) {
  const router = Router()
  const playerRepo = new PlayerRepository(deps.db)

  // GET /player/tournaments - list player's tournaments
  router.get('/tournaments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10

      const result = playerRepo.listTournamentsByPlayer(payload.playerId, { offset, limit })

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

      const player = playerRepo.findById(payload.playerId)
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

      const updated = playerRepo.updateShareContact(payload.playerId, req.body.shareContact)

      log.info('contact.preferences.updated', { playerId: payload.playerId, shareContact: req.body.shareContact })

      res.json({ shareContact: updated.share_contact })
    } catch (err) {
      next(err)
    }
  })

  return router
}
