import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository, RegistrationRow } from '../db'
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
import { calculateStandings, generateBracket } from '@core/index'
import { parseScore, type SportFormat } from '@core/score-parser'
import { getLogger } from '../logger'

const log = getLogger('tournaments')

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
  const knockoutRepo = new KnockoutRepository(deps.db)
  const sseConnectionCount = new Map<string, number>()
  const MAX_SSE_CONNECTIONS_PER_USER = 5

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

      log.info('tournament.created', { tournamentId: tournament.id, name: tournament.name, organizerId: payload.sub })

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

      const previousStatus = STATE_TO_STATUS[transitionResult.previousState!]
      log.info('tournament.advanced', { tournamentId: id, from: previousStatus, to: newStatus, organizerId: payload.sub })

      res.status(200).json({
        status: newStatus,
        previousStatus,
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

      const registrations = playerRepo.listTournamentsByPlayer(payload.sub, { offset: 0, limit: deps.config.limits.playerQueryLimit })
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

      log.info('groups.created', { tournamentId: id, numGroups: groups.length, playerCount: playerIds.length, organizerId: payload.sub })

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

      // Enqueue standings recalculation job if job queue is available
      if (deps.jobQueue) {
        const jobId = `standings.recalculate:${match.group_id}`
        await deps.jobQueue.add('standings.recalculate', { tournamentId, groupId: match.group_id }, {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        })
      }

      log.info('score.submitted', { tournamentId, matchId, score: req.body.score, winnerId, playerId: payload.playerId })

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

      log.info('score.overridden', { tournamentId, matchId, score: req.body.score, winnerId, organizerId: payload.sub })

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

  // GET /:id/bracket - get bracket (no auth required)
  router.get('/:id/bracket', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const seeds = knockoutRepo.getSeeds(tournamentId)
      if (seeds.length === 0) {
        return res.status(404).json({ code: 'BRACKET_NOT_GENERATED', message: 'Bracket not generated yet' })
      }

      const seedMap = new Map(seeds.map((s) => [s.seedPosition, s.playerId]))
      const bracket = generateBracket(seeds.length)

      const knockoutMatches = knockoutRepo.findKnockoutMatchesByTournament(tournamentId)
      const matchById = new Map(knockoutMatches.map((m) => [`${m.round}-${m.position}`, m]))

      const rounds = bracket.rounds.map((r) => ({
        round: r.round,
        matches: r.matches.map((m) => {
          const dbMatch = matchById.get(`${m.round}-${m.position}`)
          if (dbMatch) {
            return {
              id: dbMatch.id,
              round: dbMatch.round,
              position: dbMatch.position,
              player1Id: dbMatch.player1_id,
              player2Id: dbMatch.player2_id,
              winnerId: dbMatch.winner_id,
              score: dbMatch.score,
              status: dbMatch.status,
            }
          }
          const player1Id = m.player1 ? seedMap.get(parseInt(m.player1.replace('seed_', ''))) ?? null : null
          const player2Id = m.player2 ? seedMap.get(parseInt(m.player2.replace('seed_', ''))) ?? null : null
          return {
            id: m.id,
            round: m.round,
            position: m.position,
            player1Id,
            player2Id,
            winnerId: null,
            score: null,
            status: 'pending',
          }
        }),
      }))

      res.json({
        bracket: {
          rounds,
          totalPlayers: seeds.length,
          byeCount: bracket.byeCount,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /:id/bracket/generate - organizer generates bracket from standings
  router.post('/:id/bracket/generate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const tournamentId = req.params.id as string

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      if (tournament.status !== 'group_stage_complete') {
        return res.status(409).json({
          code: 'INVALID_STATE',
          message: `Cannot generate bracket in ${tournament.status} status; tournament must be in group_stage_complete status`,
        })
      }

      const groups = groupRepo.findGroupsByTournament(tournamentId)
      if (groups.length === 0) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'No groups exist for this tournament' })
      }

      // Calculate standings for each group and collect advancing players
      const advancingByGroup: string[][] = []
      for (const group of groups) {
        const members = groupRepo.findMembersByGroup(group.id)
        const matches = groupRepo.findMatchesByGroup(group.id)

        const standings = calculateStandings(
          members.map((m) => ({ id: m.id, name: m.name })),
          matches.map((m) => ({
            player1Id: m.player1_id,
            player2Id: m.player2_id,
            winnerId: m.winner_id ?? null,
            score: m.score ?? null,
          }))
        )

        const advancing = standings.slice(0, group.advancing_count).map((s) => s.playerId)
        advancingByGroup.push(advancing)
      }

      // Interleave seeds by rank across groups
      const seeds: Array<{ playerId: string; seedPosition: number }> = []
      const maxRank = Math.max(...advancingByGroup.map((g) => g.length))
      for (let rank = 0; rank < maxRank; rank++) {
        for (let groupIdx = 0; groupIdx < advancingByGroup.length; groupIdx++) {
          if (rank < advancingByGroup[groupIdx].length) {
            seeds.push({
              playerId: advancingByGroup[groupIdx][rank],
              seedPosition: seeds.length + 1,
            })
          }
        }
      }

      knockoutRepo.setSeeds(tournamentId, seeds)

      log.info('bracket.generated', { tournamentId, seedCount: seeds.length, organizerId: payload.sub })

      // Generate and return bracket
      const seedMap = new Map(seeds.map((s) => [s.seedPosition, s.playerId]))
      const bracket = generateBracket(seeds.length)

      const rounds = bracket.rounds.map((r) => ({
        round: r.round,
        matches: r.matches.map((m) => {
          const player1Id = m.player1 ? seedMap.get(parseInt(m.player1.replace('seed_', ''))) ?? null : null
          const player2Id = m.player2 ? seedMap.get(parseInt(m.player2.replace('seed_', ''))) ?? null : null
          return {
            id: m.id,
            round: m.round,
            position: m.position,
            player1Id,
            player2Id,
            winnerId: null,
            score: null,
            status: 'pending',
          }
        }),
      }))

      res.json({
        bracket: {
          rounds,
          totalPlayers: seeds.length,
          byeCount: bracket.byeCount,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /:id/bracket - organizer overrides seeding
  router.patch('/:id/bracket', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const tournamentId = req.params.id as string

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      if (tournament.status !== 'group_stage_complete') {
        return res.status(409).json({
          code: 'INVALID_STATE',
          message: `Cannot update bracket in ${tournament.status} status; tournament must be in group_stage_complete status`,
        })
      }

      const existingSeeds = knockoutRepo.getSeeds(tournamentId)
      if (existingSeeds.length === 0) {
        return res.status(404).json({ code: 'BRACKET_NOT_GENERATED', message: 'Bracket not generated yet' })
      }

      if (!Array.isArray(req.body.seeds)) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'seeds must be an array' })
      }

      for (const seed of req.body.seeds) {
        if (typeof seed.playerId !== 'string' || typeof seed.seedPosition !== 'number') {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'each seed must have playerId (string) and seedPosition (number)' })
        }
      }

      knockoutRepo.setSeeds(tournamentId, req.body.seeds)

      log.info('bracket.reseeded', { tournamentId, seedCount: req.body.seeds.length, organizerId: payload.sub })

      // Return updated bracket
      const seedMap = new Map(req.body.seeds.map((s: any) => [s.seedPosition, s.playerId]))
      const bracket = generateBracket(req.body.seeds.length)

      const rounds = bracket.rounds.map((r) => ({
        round: r.round,
        matches: r.matches.map((m) => {
          const player1Id = m.player1 ? seedMap.get(parseInt(m.player1.replace('seed_', ''))) ?? null : null
          const player2Id = m.player2 ? seedMap.get(parseInt(m.player2.replace('seed_', ''))) ?? null : null
          return {
            id: m.id,
            round: m.round,
            position: m.position,
            player1Id,
            player2Id,
            winnerId: null,
            score: null,
            status: 'pending',
          }
        }),
      }))

      res.json({
        bracket: {
          rounds,
          totalPlayers: req.body.seeds.length,
          byeCount: bracket.byeCount,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /:id/bracket/publish - organizer publishes bracket and transitions to knockout_active
  router.post('/:id/bracket/publish', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const tournamentId = req.params.id as string

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      if (tournament.status !== 'group_stage_complete') {
        return res.status(409).json({
          code: 'INVALID_STATE',
          message: `Cannot publish bracket in ${tournament.status} status; tournament must be in group_stage_complete status`,
        })
      }

      const seeds = knockoutRepo.getSeeds(tournamentId)
      if (seeds.length === 0) {
        return res.status(409).json({ code: 'BRACKET_NOT_GENERATED', message: 'Bracket not generated yet' })
      }

      const seedMap = new Map(seeds.map((s) => [s.seedPosition, s.playerId]))
      const bracket = generateBracket(seeds.length)
      const knockoutMatches = knockoutRepo.createKnockoutMatches(tournamentId, bracket, seedMap)

      repo.updateStatus(tournamentId, 'knockout_active')

      log.info('bracket.published', { tournamentId, matchCount: knockoutMatches.length, organizerId: payload.sub })

      res.json({
        matches: knockoutMatches.map((m) => ({
          id: m.id,
          round: m.round,
          position: m.position,
          player1Id: m.player1_id,
          player2Id: m.player2_id,
          winnerId: m.winner_id,
          score: m.score,
          status: m.status,
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /:id/knockout/:matchId/score - player submits knockout match score
  router.post('/:id/knockout/:matchId/score', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const tournamentId = req.params.id as string
      const matchId = req.params.matchId as string

      assertPlayerInTournament(payload, tournamentId)

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      if (tournament.status !== 'knockout_active') {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'Tournament is not in knockout phase' })
      }

      const match = knockoutRepo.findKnockoutMatchById(matchId)
      if (!match || match.tournament_id !== tournamentId) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      if (match.player1_id !== payload.playerId && match.player2_id !== payload.playerId) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a participant in this match' })
      }

      if (!match.player1_id || !match.player2_id) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'This match is not ready for scoring' })
      }

      if (new Date() > new Date(tournament.knockout_stage_deadline)) {
        return res.status(409).json({ code: 'DEADLINE_PASSED', message: 'Knockout stage scoring deadline has passed' })
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
      if (!winnerId) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'Cannot determine winner' })
      }
      const updated = knockoutRepo.updateKnockoutMatch(matchId, winnerId, req.body.score)

      log.info('score.submitted', { tournamentId, matchId, round: updated.round, score: req.body.score, winnerId, playerId: payload.playerId })

      res.json({
        match: {
          id: updated.id,
          round: updated.round,
          position: updated.position,
          score: updated.score,
          winnerId: updated.winner_id,
          status: updated.status,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /:id/knockout/:matchId/score - organizer overrides knockout match score
  router.patch('/:id/knockout/:matchId/score', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const tournamentId = req.params.id as string
      const matchId = req.params.matchId as string

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const match = knockoutRepo.findKnockoutMatchById(matchId)
      if (!match || match.tournament_id !== tournamentId) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      if (!match.player1_id || !match.player2_id) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'This match is not ready for scoring' })
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
      if (!winnerId) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'Cannot determine winner' })
      }
      const updated = knockoutRepo.updateKnockoutMatch(matchId, winnerId, req.body.score)

      log.info('score.overridden', { tournamentId, matchId, round: updated.round, score: req.body.score, winnerId, organizerId: payload.sub })

      res.json({
        match: {
          id: updated.id,
          round: updated.round,
          position: updated.position,
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
        deps.config.auth.magicLinkTtlSeconds,
        deps.tokenStore
      )

      log.info('player.registered', { tournamentId, playerId: player.id })

      res.status(202).json({
        message: `Registration email sent to ${player.email}`,
        magicLinkExpires: deps.config.auth.magicLinkTtlSeconds,
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

      const sessionToken = await generatePlayerSession(magicPayload, deps.config.auth.sessionTtlSeconds, deps.tokenStore)

      log.info('session.issued', { tournamentId, playerId: magicPayload.playerId })

      res.status(200).json({
        playerToken: sessionToken.token,
        expiresIn: deps.config.auth.sessionTtlSeconds,
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
            deps.config.auth.magicLinkTtlSeconds,
            deps.tokenStore
          )
        }
      }

      log.info('magic-link.reissued', { tournamentId })

      res.status(202).json({
        message: `If an account with this email is registered, a magic link has been sent.`,
        magicLinkExpires: deps.config.auth.magicLinkTtlSeconds,
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

      log.info('tournament.updated', { tournamentId: id, fields: Object.keys(validationFields), organizerId: payload.sub })

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

      log.info('tournament.deleted', { tournamentId: id, organizerId: payload.sub })

      res.status(204).send()
    } catch (err) {
      next(err)
    }
  })

  // GET /tournaments/available - list available tournaments for registration
  router.get('/available', (req: Request, res: Response) => {
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20
    const sport = req.query.sport as string | undefined

    const result = repo.listAvailable({ offset, limit, sport })

    const tournaments = result.rows.map(t => {
      const registered = playerRepo.countRegistrationsForTournament(t.id)
      return {
        id: t.id,
        name: t.name,
        sport: t.sport,
        format: t.match_format === 'doubles' ? 'doubles' : 'singles',
        status: 'open',
        registrationDeadline: t.registration_deadline,
        startDate: t.group_stage_deadline,
        minParticipants: 2,
        maxParticipants: t.max_players,
        currentParticipants: registered,
        doubles: t.match_format === 'doubles',
        entryFee: null,
      }
    })

    res.json({
      tournaments,
      total: result.total,
      page: Math.floor(offset / limit) + 1,
      limit,
    })
  })

  // GET /:tournamentId/players - list players registered for tournament
  router.get('/:tournamentId/players', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.tournamentId as string
      const authHeader = req.headers.authorization

      let isOrganizer = false
      let currentPlayerId: string | undefined

      try {
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.slice(7)
          try {
            const payload = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore)
            isOrganizer = true
          } catch {
            try {
              const payload = await requirePlayerSessionAuth(authHeader, deps.tokenStore)
              currentPlayerId = payload.playerId
            } catch {
              // No valid auth
            }
          }
        }
      } catch {
        // No valid auth
      }

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50

      const result = playerRepo.findRegistrationsByTournament(tournamentId, { offset, limit })

      const players = result.rows.map(reg => {
        const player = playerRepo.findById(reg.player_id)!
        let partnerName: string | null = null
        let partnerEmail: string | null = null

        if (reg.partner_id) {
          const partner = playerRepo.findById(reg.partner_id)
          if (partner) {
            partnerName = partner.name
            partnerEmail = isOrganizer || currentPlayerId === reg.partner_id ? partner.email : null
          }
        }

        return {
          registrationId: reg.id,
          playerId: reg.player_id,
          playerName: player.name,
          playerEmail: isOrganizer || currentPlayerId === reg.player_id ? player.email : null,
          playerPhone: isOrganizer ? player.phone || null : null,
          doubles: !!reg.partner_id,
          partnerId: reg.partner_id || null,
          partnerName,
          partnerEmail,
          partnerConfirmed: reg.partner_confirmed,
          status: reg.status,
          registeredAt: reg.registered_at,
        }
      })

      res.json({
        players,
        total: result.total,
      })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /registrations/:registrationId/confirm - partner confirms doubles registration
  router.patch('/registrations/:registrationId/confirm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const registrationId = req.params.registrationId as string

      const registration = playerRepo.findRegistrationById(registrationId)
      if (!registration) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Registration not found' })
      }

      if (!registration.partner_id) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'This registration does not have a pending partner confirmation' })
      }

      if (registration.partner_id !== payload.playerId) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the partner can confirm this registration' })
      }

      if (registration.status !== 'pending_partner_confirm') {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'This registration is not pending partner confirmation' })
      }

      const tournament = repo.findById(registration.tournament_id)
      if (!tournament || tournament.status !== 'registration_open') {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'Tournament is no longer in registration phase' })
      }

      const updated = playerRepo.confirmPartner(registrationId)

      log.info('registration.partner_confirmed', { tournamentId: registration.tournament_id, registrationId, partnerId: payload.playerId })

      res.json({
        registrationId: updated.id,
        playerId: updated.player_id,
        partnerId: updated.partner_id,
        partnerConfirmed: updated.partner_confirmed,
        status: updated.status,
        confirmedAt: updated.confirmed_at,
      })
    } catch (err) {
      next(err)
    }
  })

  // DELETE /registrations/:registrationId - withdraw from tournament
  router.delete('/registrations/:registrationId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const registrationId = req.params.registrationId as string

      const registration = playerRepo.findRegistrationById(registrationId)
      if (!registration) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Registration not found' })
      }

      if (registration.player_id !== payload.playerId) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'You can only withdraw your own registration' })
      }

      if (registration.status === 'withdrawn' || registration.status === 'withdrawal_pending') {
        return res.status(409).json({ code: 'ALREADY_WITHDRAWN', message: 'This registration has already been withdrawn' })
      }

      const tournament = repo.findById(registration.tournament_id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const isBeforeDeadline = new Date() < new Date(tournament.registration_deadline)
      const updated = playerRepo.withdrawRegistration(registrationId, isBeforeDeadline)

      const eventName = isBeforeDeadline ? 'registration.withdrawn' : 'registration.withdrawal_requested'
      log.info(eventName, { tournamentId: registration.tournament_id, registrationId, playerId: payload.playerId, beforeDeadline: isBeforeDeadline })

      res.json({
        registrationId: updated.id,
        status: updated.status,
        withdrawnAt: updated.withdrawal_requested_at,
      })
    } catch (err) {
      next(err)
    }
  })

  // Helper: find match in group or knockout tables
  const findMatchInBothTables = (matchId: string, tournamentId: string) => {
    const groupMatch = groupRepo.findMatchByIdWithPlayers(matchId)
    if (groupMatch && groupMatch.tournament_id === tournamentId) {
      return { match: groupMatch, type: 'group' as const }
    }
    const knockoutMatch = knockoutRepo.findKnockoutMatchByIdWithPlayers(matchId)
    if (knockoutMatch && knockoutMatch.tournament_id === tournamentId) {
      return { match: knockoutMatch, type: 'knockout' as const }
    }
    return null
  }

  // Helper: filter match opponent contact info based on visibility rules
  const filterMatchWithContact = (match: any, viewingPlayerId: string | null, isOrganizer: boolean) => {
    const opponent1IsPlayer = match.player1_id === viewingPlayerId
    const opponent2IsPlayer = match.player2_id === viewingPlayerId

    const result = {
      ...match,
      player1Confirmed: match.player1_confirmed,
      player2Confirmed: match.player2_confirmed,
      opponent: opponent1IsPlayer
        ? {
            playerId: match.player2_id,
            name: match.player2_name,
            email: isOrganizer || match.player2_share_contact ? match.player2_email : null,
            confirmed: match.player2_confirmed,
          }
        : {
            playerId: match.player1_id,
            name: match.player1_name,
            email: isOrganizer || match.player1_share_contact ? match.player1_email : null,
            confirmed: match.player1_confirmed,
          },
    }
    return result
  }

  // GET /:id/matches - list player's matches in tournament
  router.get('/:id/matches', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const tournamentId = req.params.id as string

      assertPlayerInTournament(payload, tournamentId)

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const groupMatches = groupRepo.findMatchesByPlayer(tournamentId, payload.playerId)
      const knockoutMatches = knockoutRepo.findKnockoutMatchesByPlayer(tournamentId, payload.playerId)

      const matches = [
        ...groupMatches.map(m => ({ ...m, type: 'group' as const })),
        ...knockoutMatches.map(m => ({ ...m, type: 'knockout' as const })),
      ]

      const filtered = matches.map(match => filterMatchWithContact(match, payload.playerId, false))

      res.json({ matches: filtered })
    } catch (err) {
      next(err)
    }
  })

  // GET /:id/matches/:matchId - match details
  router.get('/:id/matches/:matchId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string
      const matchId = req.params.matchId as string

      let isOrganizer = false
      let currentPlayerId: string | null = null

      // Dual auth: try organizer first, fall back to player
      const authHeader = req.headers.authorization
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const orgPayload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
          isOrganizer = true
          const tournament = repo.findById(tournamentId)
          if (!tournament || tournament.creator_id !== orgPayload.sub) {
            return res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this tournament' })
          }
        } catch {
          try {
            const playerPayload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
            assertPlayerInTournament(playerPayload, tournamentId)
            currentPlayerId = playerPayload.playerId
          } catch {
            return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or missing authentication' })
          }
        }
      } else {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing authentication' })
      }

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const foundMatch = findMatchInBothTables(matchId, tournamentId)
      if (!foundMatch) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      const { match } = foundMatch

      // Check player access
      if (!isOrganizer) {
        const isInMatch = match.player1_id === currentPlayerId || match.player2_id === currentPlayerId
        if (!isInMatch) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a participant in this match' })
        }
      }

      const filtered = filterMatchWithContact(match, isOrganizer ? null : currentPlayerId, isOrganizer)

      res.json({ match: filtered })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /:id/matches/:matchId/confirm - confirm match attendance
  router.patch('/:id/matches/:matchId/confirm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const tournamentId = req.params.id as string
      const matchId = req.params.matchId as string

      assertPlayerInTournament(payload, tournamentId)

      const tournament = repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const foundMatch = findMatchInBothTables(matchId, tournamentId)
      if (!foundMatch) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      const { match, type } = foundMatch

      // Verify player is in match
      const position =
        match.player1_id === payload.playerId ? ('player1' as const) : match.player2_id === payload.playerId ? ('player2' as const) : null

      if (!position) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a participant in this match' })
      }

      const updated = type === 'group' ? groupRepo.confirmMatch(matchId, position) : knockoutRepo.confirmKnockoutMatch(matchId, position)

      log.info('match.confirmed', { tournamentId, matchId, playerId: payload.playerId, position })

      res.json({
        match: {
          id: updated.id,
          player1Confirmed: updated.player1_confirmed,
          player2Confirmed: updated.player2_confirmed,
          status: updated.status,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  router.get('/:id/events', async (req: Request, res: Response) => {
    const tournamentId = req.params.id as string

    // Check tournament exists before doing any auth work
    const tournament = repo.findById(tournamentId)
    if (!tournament) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
    }

    if (!deps.broadcastBus) {
      return res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'SSE not available' })
    }

    // Phase 1: identify caller
    let playerPayload: any = null
    let organizerPayload: any = null

    try {
      playerPayload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
    } catch {}

    if (!playerPayload) {
      try {
        organizerPayload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      } catch {}
    }

    if (!playerPayload && !organizerPayload) {
      log.warn('sse.auth.failed', { tournamentId })
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' })
    }

    // Phase 2: verify tournament membership
    try {
      if (playerPayload) {
        assertPlayerInTournament(playerPayload, tournamentId)
      } else {
        assertOrganizerOwnsTournament(organizerPayload, tournament.creator_id)
      }
    } catch {
      log.warn('sse.forbidden', { tournamentId })
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Access denied' })
    }

    // Rate limit: cap concurrent SSE connections per user
    const userId: string = playerPayload?.playerId ?? organizerPayload.sub
    const current = sseConnectionCount.get(userId) ?? 0
    if (current >= MAX_SSE_CONNECTIONS_PER_USER) {
      log.warn('sse.rate.limited', { tournamentId, userId })
      return res.status(429).json({ code: 'TOO_MANY_REQUESTS', message: 'Too many active SSE connections' })
    }
    sseConnectionCount.set(userId, current + 1)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const unsubscribe = deps.broadcastBus.subscribe(tournamentId, (event, data) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
    })

    req.on('close', () => {
      unsubscribe()
      const count = sseConnectionCount.get(userId) ?? 1
      sseConnectionCount.set(userId, Math.max(0, count - 1))
    })
  })

  return router
}
