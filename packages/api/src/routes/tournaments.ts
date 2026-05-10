import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { TournamentRepository } from '../db'
import { requireOrganizerAuth, assertOrganizerOwnsTournament } from '../auth'
import { ForbiddenError } from '../auth/errors'

function validateTournamentInput(data: any): string | null {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    return 'name must be a non-empty string'
  }
  if (!data.sport || typeof data.sport !== 'string' || !data.sport.trim()) {
    return 'sport must be a non-empty string'
  }
  if (!data.matchFormat || !['singles', 'doubles'].includes(data.matchFormat)) {
    return "matchFormat must be 'singles' or 'doubles'"
  }
  if (!Number.isInteger(data.maxPlayers) || data.maxPlayers < 4 || data.maxPlayers > 200) {
    return 'maxPlayers must be an integer between 4 and 200'
  }
  if (!data.registrationDeadline || typeof data.registrationDeadline !== 'string') {
    return 'registrationDeadline must be a valid ISO 8601 date string'
  }
  if (!data.groupStageDeadline || typeof data.groupStageDeadline !== 'string') {
    return 'groupStageDeadline must be a valid ISO 8601 date string'
  }
  if (!data.knockoutStageDeadline || typeof data.knockoutStageDeadline !== 'string') {
    return 'knockoutStageDeadline must be a valid ISO 8601 date string'
  }

  const regDate = new Date(data.registrationDeadline)
  const groupDate = new Date(data.groupStageDeadline)
  const knockoutDate = new Date(data.knockoutStageDeadline)

  if (regDate >= groupDate || groupDate >= knockoutDate) {
    return 'deadline ordering violated: registrationDeadline < groupStageDeadline < knockoutStageDeadline'
  }

  return null
}

export default function tournamentsRouter(deps: AppDependencies) {
  const router = Router()
  const repo = new TournamentRepository(deps.db)

  // POST /tournaments - create tournament
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)

      const validationError = validateTournamentInput(req.body)
      if (validationError) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: validationError })
      }

      const existing = repo.findByName(req.body.name)
      if (existing) {
        return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'Tournament name already exists' })
      }

      const tournament = repo.create({
        name: req.body.name,
        sport: req.body.sport,
        matchFormat: req.body.matchFormat,
        maxPlayers: req.body.maxPlayers,
        description: req.body.description,
        registrationDeadline: req.body.registrationDeadline,
        groupStageDeadline: req.body.groupStageDeadline,
        knockoutStageDeadline: req.body.knockoutStageDeadline,
        creatorId: payload.sub,
      })

      res.status(201).json({
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        createdBy: tournament.creator_id,
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /organizer/tournaments - list organizer's tournaments
  router.get('/organizer', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)

      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10
      const status = req.query.status as string | undefined

      const result = repo.listByOrganizer(payload.sub, { offset, limit, status })

      res.json({
        tournaments: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          sport: row.sport,
          status: row.status,
          createdAt: row.created_at,
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

  // GET /public - list public tournaments
  router.get('/public', (req: Request, res: Response) => {
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10
    const sport = req.query.sport as string | undefined

    const result = repo.listPublic({ offset, limit, sport })

    res.json({
      tournaments: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        sport: row.sport,
        matchFormat: row.match_format,
        maxPlayers: row.max_players,
        registrationDeadline: row.registration_deadline,
        status: row.status,
      })),
      pagination: {
        offset,
        limit,
        total: result.total,
        hasMore: offset + limit < result.total,
      },
    })
  })

  // PATCH /tournaments/:id - update tournament
  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const id = req.params.id as string

      const tournament = repo.findById(id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const validationFields: any = {}
      if (req.body.name !== undefined) {
        if (!req.body.name || typeof req.body.name !== 'string') {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'name must be a non-empty string' })
        }
        const existing = repo.findByName(req.body.name)
        if (existing && existing.id !== id) {
          return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'Tournament name already exists' })
        }
        validationFields.name = req.body.name
      }

      if (req.body.maxPlayers !== undefined) {
        if (!Number.isInteger(req.body.maxPlayers) || req.body.maxPlayers < 4 || req.body.maxPlayers > 200) {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'maxPlayers must be an integer between 4 and 200' })
        }
        validationFields.maxPlayers = req.body.maxPlayers
      }

      if (req.body.description !== undefined) {
        validationFields.description = req.body.description
      }

      const updated = repo.update(id, validationFields)

      res.json({
        id: updated.id,
        name: updated.name,
        sport: updated.sport,
        matchFormat: updated.match_format,
        maxPlayers: updated.max_players,
        description: updated.description,
        status: updated.status,
        updatedAt: updated.updated_at,
      })
    } catch (err) {
      next(err)
    }
  })

  // DELETE /tournaments/:id - soft delete tournament
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const id = req.params.id as string

      const tournament = repo.findById(id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      repo.softDelete(id)

      res.status(204).send()
    } catch (err) {
      next(err)
    }
  })

  return router
}
