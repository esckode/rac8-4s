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
      if (account.role === 'player' && account.playerId) {
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

  return router
}
