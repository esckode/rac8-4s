import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../db'
import {
  requireOrganizerAuth,
  assertOrganizerOwnsTournament,
  generateMagicLinkToken,
  validateMagicLinkToken,
  generatePlayerSession,
  requirePlayerSessionAuth,
  assertPlayerInTournament,
  TokenInvalidError,
} from '../auth'
import { ForbiddenError } from '../auth/errors'
import { TournamentStateMachine, type TournamentState, type TransitionAction } from '@core/state-machine'
import { calculateStandings } from '@core/standings'
import { parseScore, type SportFormat } from '@core/score-parser'

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

const STATUS_TO_STATE: Record<string, TournamentState> = {
  registration_open: 'REGISTRATION_OPEN',
  registration_closed: 'REGISTRATION_CLOSED',
  group_stage_active: 'GROUP_STAGE_ACTIVE',
  group_stage_complete: 'GROUP_STAGE_COMPLETE',
  knockout_active: 'KNOCKOUT_ACTIVE',
  tournament_complete: 'TOURNAMENT_COMPLETE',
}

const STATE_TO_STATUS: Record<TournamentState, string> = {
  REGISTRATION_OPEN: 'registration_open',
  REGISTRATION_CLOSED: 'registration_closed',
  GROUP_STAGE_ACTIVE: 'group_stage_active',
  GROUP_STAGE_COMPLETE: 'group_stage_complete',
  KNOCKOUT_ACTIVE: 'knockout_active',
  TOURNAMENT_COMPLETE: 'tournament_complete',
}

export default function tournamentsRouter(deps: AppDependencies) {
  const router = Router()
  const repo = new TournamentRepository(deps.db)
  const playerRepo = new PlayerRepository(deps.db)
  const groupRepo = new GroupRepository(deps.db)

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

  // POST /:id/advance - advance tournament state (organizer)
  router.post('/:id/advance', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const id = req.params.id as string

      const tournament = repo.findById(id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const action = req.body.action as TransitionAction
      if (!action || typeof action !== 'string') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'action must be a valid string' })
      }

      const currentState = STATUS_TO_STATE[tournament.status]
      if (!currentState) {
        return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Invalid tournament status in database' })
      }

      const machine = new TournamentStateMachine(currentState)
      const playerCount = playerRepo.countRegistrationsForTournament(id)
      const pendingMatches = groupRepo.countPendingMatchesByTournament(id)

      const transitionResult = machine.transition(action, {
        playersRegistered: playerCount > 0,
        allScoresSubmitted: pendingMatches === 0,
        forceAdvance: req.body.forceAdvance === true,
      })

      if (!transitionResult.success) {
        return res.status(409).json({
          code: transitionResult.error,
          message: transitionResult.message,
        })
      }

      const newStatus = STATE_TO_STATUS[transitionResult.state!]
      repo.updateStatus(id, newStatus)

      res.status(200).json({
        status: newStatus,
        previousStatus: STATE_TO_STATUS[transitionResult.previousState!],
        message: `Tournament transitioned from ${transitionResult.previousState} to ${transitionResult.state}`,
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /:id/groups - create and distribute groups (organizer)
  router.post('/:id/groups', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const id = req.params.id as string

      const tournament = repo.findById(id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      if (tournament.status !== 'registration_closed') {
        return res.status(409).json({
          code: 'INVALID_STATE',
          message: 'Groups can only be created when tournament is in registration_closed status',
        })
      }

      const numGroups = req.body.numGroups
      const advancingPerGroup = req.body.advancingPerGroup

      if (!Number.isInteger(numGroups) || numGroups < 1) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'numGroups must be an integer >= 1' })
      }

      if (!Number.isInteger(advancingPerGroup) || advancingPerGroup < 1) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'advancingPerGroup must be an integer >= 1' })
      }

      const registrations = playerRepo.listTournamentsByPlayer(payload.sub, { offset: 0, limit: 10000 })
      const playerIds: string[] = []

      // Fetch all registered players for this tournament
      const allPlayers = deps.db
        .prepare('SELECT DISTINCT pr.player_id FROM player_registrations pr WHERE pr.tournament_id = ?')
        .all(id) as { player_id: string }[]

      for (const p of allPlayers) {
        playerIds.push(p.player_id)
      }

      if (playerIds.length < numGroups * 2) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: `Not enough players: need at least ${numGroups * 2} for ${numGroups} groups (min 2 per group)`,
        })
      }

      const groups = groupRepo.createGroups(id, numGroups, advancingPerGroup, playerIds)
      repo.updateStatus(id, 'group_stage_active')

      res.status(201).json({
        groups: groups.map(g => ({
          id: g.id,
          name: g.name,
          playerCount: deps.db
            .prepare('SELECT COUNT(*) as count FROM group_memberships WHERE group_id = ?')
            .get(g.id) as { count: number },
          advancingCount: g.advancing_count,
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /:id/groups - list groups with members (organizer)
  router.get('/:id/groups', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const id = req.params.id as string

      const tournament = repo.findById(id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const groups = groupRepo.findGroupsByTournament(id)

      res.json({
        groups: groups.map(g => {
          const members = groupRepo.findMembersByGroup(g.id)
          const matches = groupRepo.findMatchesByGroup(g.id)
          return {
            id: g.id,
            name: g.name,
            players: members.map(p => ({ id: p.id, name: p.name })),
            matchCount: matches.length,
          }
        }),
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /:id/groups/:groupId/standings - get group standings (player auth, group members only)
  router.get('/:id/groups/:groupId/standings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const tournamentId = req.params.id as string
      const groupId = req.params.groupId as string

      assertPlayerInTournament(payload, tournamentId)

      const group = groupRepo.findGroupById(groupId)
      if (!group || group.tournament_id !== tournamentId) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Group not found' })
      }

      const members = groupRepo.findMembersByGroup(groupId)

      // Verify player is actually in this group
      const playerInGroup = members.find(m => m.id === payload.playerId)
      if (!playerInGroup) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a member of this group' })
      }
      const matches = groupRepo.findMatchesByGroup(groupId)

      const standings = calculateStandings(
        members.map(m => ({ id: m.id, name: m.name })),
        matches.map(m => ({
          player1Id: m.player1_id,
          player2Id: m.player2_id,
          winnerId: m.winner_id || null,
          score: m.score || null,
        }))
      )

      res.json({
        standings: standings.map((s: any) => {
          const player = members.find(m => m.id === s.playerId)
          return {
            rank: s.rank,
            playerId: s.playerId,
            name: player?.name || 'Unknown',
            wins: s.wins,
            losses: s.losses,
            setsWon: s.setsWon,
            setsLost: s.setsLost,
          }
        }),
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /:id/matches/:matchId/score - player submits match score
  router.post('/:id/matches/:matchId/score', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const tournamentId = req.params.id as string
      const matchId = req.params.matchId as string

      assertPlayerInTournament(payload, tournamentId)

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const match = groupRepo.findMatchById(matchId)
      if (!match || match.tournament_id !== tournamentId) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      if (match.player1_id !== payload.playerId && match.player2_id !== payload.playerId) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a participant in this match' })
      }

      if (new Date() > new Date(tournament.group_stage_deadline)) {
        return res.status(409).json({ code: 'DEADLINE_PASSED', message: 'Group stage scoring deadline has passed' })
      }

      if (typeof req.body.score !== 'string') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'score must be a non-empty string' })
      }

      let parsed
      try {
        parsed = parseScore(req.body.score, tournament.sport as SportFormat)
      } catch (err) {
        return res.status(400).json({ code: 'SCORE_INVALID', message: `Invalid score format: ${(err as Error).message}` })
      }

      const winnerId = parsed.winner === 'player1' ? match.player1_id : match.player2_id
      const updated = groupRepo.updateMatch(matchId, winnerId, req.body.score)

      res.json({
        match: {
          id: updated.id,
          score: updated.score,
          winnerId: updated.winner_id,
          status: updated.status,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /:id/matches/:matchId/score - organizer overrides match score
  router.patch('/:id/matches/:matchId/score', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const tournamentId = req.params.id as string
      const matchId = req.params.matchId as string

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const match = groupRepo.findMatchById(matchId)
      if (!match || match.tournament_id !== tournamentId) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      if (typeof req.body.score !== 'string') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'score must be a non-empty string' })
      }

      let parsed
      try {
        parsed = parseScore(req.body.score, tournament.sport as SportFormat)
      } catch (err) {
        return res.status(400).json({ code: 'SCORE_INVALID', message: `Invalid score format: ${(err as Error).message}` })
      }

      const winnerId = parsed.winner === 'player1' ? match.player1_id : match.player2_id
      const updated = groupRepo.updateMatch(matchId, winnerId, req.body.score)

      res.json({
        match: {
          id: updated.id,
          score: updated.score,
          winnerId: updated.winner_id,
          status: updated.status,
        },
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

  // POST /:tournamentId/register - player registration
  router.post('/:tournamentId/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.tournamentId as string

      if (!req.body.email || typeof req.body.email !== 'string' || !req.body.email.trim()) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'email must be a non-empty string' })
      }
      if (!req.body.name || typeof req.body.name !== 'string' || !req.body.name.trim()) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'name must be a non-empty string' })
      }

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      if (tournament.status !== 'registration_open') {
        return res.status(409).json({ code: 'REGISTRATION_CLOSED', message: 'Registration is not open for this tournament' })
      }

      const registrationCount = playerRepo.countRegistrationsForTournament(tournamentId)
      if (registrationCount >= tournament.max_players) {
        return res.status(409).json({ code: 'TOURNAMENT_FULL', message: 'Tournament has reached maximum capacity' })
      }

      const player = playerRepo.findOrCreatePlayerByEmail(
        req.body.email.trim(),
        req.body.name.trim(),
        req.body.phone,
        req.body.preferredContact
      )

      const existingReg = playerRepo.findRegistration(player.id, tournamentId)
      if (!existingReg) {
        playerRepo.createRegistration(player.id, tournamentId)
      }

      const magicLink = await generateMagicLinkToken(
        { playerId: player.id, tournamentId, email: player.email, createdAt: Date.now() },
        86400,
        deps.tokenStore
      )

      res.status(202).json({
        message: `Registration email sent to ${player.email}`,
        magicLinkExpires: 86400,
        magicLinkToken: magicLink.token,
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /:tournamentId/auth/verify - verify magic link and issue session token
  router.get('/:tournamentId/auth/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.tournamentId as string
      const token = req.query.token as string | undefined

      if (!token) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'token query parameter is required' })
      }

      let magicPayload
      try {
        magicPayload = await validateMagicLinkToken(token, deps.tokenStore)
      } catch (err) {
        if (err instanceof TokenInvalidError) {
          return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token is invalid or has expired' })
        }
        throw err
      }

      assertPlayerInTournament(magicPayload, tournamentId)

      const sessionToken = await generatePlayerSession(magicPayload, 86400, deps.tokenStore)

      res.status(200).json({
        playerToken: sessionToken.token,
        expiresIn: 86400,
        playerId: magicPayload.playerId,
        tournamentId: magicPayload.tournamentId,
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /:tournamentId/auth/magic-link - re-issue magic link for existing players
  router.post('/:tournamentId/auth/magic-link', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.tournamentId as string

      if (!req.body.email || typeof req.body.email !== 'string' || !req.body.email.trim()) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'email must be a non-empty string' })
      }

      const player = playerRepo.findByEmail(req.body.email.trim())
      if (player) {
        const reg = playerRepo.findRegistration(player.id, tournamentId)
        if (reg) {
          await generateMagicLinkToken(
            { playerId: player.id, tournamentId, email: player.email, createdAt: Date.now() },
            86400,
            deps.tokenStore
          )
        }
      }

      res.status(202).json({
        message: `If an account with this email is registered, a magic link has been sent.`,
        magicLinkExpires: 86400,
      })
    } catch (err) {
      next(err)
    }
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
