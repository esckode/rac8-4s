import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { PlayerRepository } from '../db'
import { requirePlayerSessionAuth } from '../auth'

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

  return router
}
