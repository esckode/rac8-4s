import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository, AccountRepository, RegistrationRow, PlayerRow, GroupMatchRow } from '../db'
import {
  requireOrganizerAuth,
  assertOrganizerOwnsTournament,
  generateMagicLinkToken,
  validateMagicLinkToken,
  validateMagicLinkTokenReadOnly,
  generatePlayerSession,
  requirePlayerSessionAuth,
  assertPlayerInTournament,
  TokenInvalidError,
} from '../auth'
import { ForbiddenError } from '../auth/errors'
import { TournamentStateMachine, type TournamentState, type TransitionAction } from '@core/state-machine'
import { calculateStandings, generateBracket } from '@core/index'
import { parseScore, type SportFormat } from '@core/score-parser'
import { isSinglesMatch, isDoublesMatch, getMatchParticipantIds, validateMatchFormatConsistency } from '../utils/match-format'
import { processStandingsRecalculate } from '../workers/standings-processor'
import { ConversationRepository } from '../repositories/conversation-repository'
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
  draft: 'DRAFT',
  registration_open: 'REGISTRATION_OPEN',
  registration_closed: 'REGISTRATION_CLOSED',
  group_stage_active: 'GROUP_STAGE_ACTIVE',
  group_stage_complete: 'GROUP_STAGE_COMPLETE',
  knockout_active: 'KNOCKOUT_ACTIVE',
  tournament_complete: 'TOURNAMENT_COMPLETE',
}

const STATE_TO_STATUS: Record<TournamentState, string> = {
  DRAFT: 'draft',
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
  const accountRepo = new AccountRepository(deps.db)
  const conversationRepo = new ConversationRepository(deps.db as any)
  const sseConnectionCount = new Map<string, number>()

  // Resolve the acting player for a tournament from either a magic-link player
  // session (tournament-scoped) or a registered player's account JWT (verified
  // by DB registration, since account JWTs are not tournament-scoped). Throws
  // ForbiddenError if authenticated but not a participant, or rethrows the auth
  // error (→ 401) if neither path authenticates.
  async function resolveTournamentPlayer(
    authHeader: string | undefined,
    tournamentId: string
  ): Promise<{ playerId: string }> {
    try {
      const session = await requirePlayerSessionAuth(authHeader, deps.tokenStore)
      assertPlayerInTournament(session, tournamentId)
      return { playerId: session.playerId }
    } catch (sessionErr) {
      let account
      try {
        account = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore)
      } catch {
        throw sessionErr
      }
      // Participation is a capability of having a linked playerId (+ registration),
      // independent of authority role — an organizer who also plays qualifies.
      if (!account.playerId) {
        throw sessionErr
      }
      const reg = await playerRepo.findRegistration(account.playerId, tournamentId)
      if (!reg) {
        throw new ForbiddenError('tournament')
      }
      return { playerId: account.playerId }
    }
  }

  // POST /tournaments - create tournament
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)

      const validationError = validateTournamentInput(req.body)
      if (validationError) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: validationError })
      }

      const existing = await repo.findByName(req.body.name)
      if (existing) {
        return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'Tournament name already exists' })
      }

      const tournament = await repo.create({
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

      log.info('tournament.created', { tournamentId: tournament.id, name: tournament.name, organizerId: payload.sub, status: tournament.status })

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

      const tournament = await repo.findById(id)
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
      const playerCount = await playerRepo.countRegistrationsForTournament(id)
      const pendingMatches = await groupRepo.countPendingMatchesByTournament(id)

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
      await repo.updateStatus(id, newStatus)

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

      const tournament = await repo.findById(id)
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

      const playerIds: string[] = []

      // Fetch all registered players for this tournament
      log.debug('groups.fetching.players', { tournamentId: id, status: tournament.status })
      const result = await deps.db.query(
        'SELECT DISTINCT pr.player_id FROM public.player_registrations pr WHERE pr.tournament_id = $1',
        [id]
      )
      const allPlayers = result.rows as { player_id: string }[]

      log.debug('groups.query.result', {
        tournamentId: id,
        rowCount: result.rowCount,
        rows: allPlayers.length,
        rawRows: JSON.stringify(allPlayers.slice(0, 5))
      })

      for (const p of allPlayers) {
        playerIds.push(p.player_id)
      }

      log.info('groups.fetched.players', { tournamentId: id, playerCount: playerIds.length, format: tournament.match_format })

      if (playerIds.length < numGroups * 2) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: `Not enough players: need at least ${numGroups * 2} for ${numGroups} groups (min 2 per group)`,
        })
      }

      // Create groups based on tournament format
      let groups
      if (tournament.match_format === 'doubles') {
        // For doubles, need at least 4 players per team = 8 players minimum
        if (playerIds.length < numGroups * 4) {
          return res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: `Not enough players for doubles: need at least ${numGroups * 4} for ${numGroups} groups (2 teams × 2 players per group)`,
          })
        }
        // Organizer may opt out of auto-pairing leftover solo registrants
        // (default: pair them). Confirmed partnerships are always honored first.
        const pairUnpaired = req.body.pairUnpaired !== false
        groups = await groupRepo.createGroupsForDoubles(id, numGroups, advancingPerGroup, playerIds, pairUnpaired)
      } else {
        groups = await groupRepo.createGroups(id, numGroups, advancingPerGroup, playerIds)
      }
      await repo.updateStatus(id, 'group_stage_active')

      log.info('groups.created', { tournamentId: id, numGroups: groups.length, playerCount: playerIds.length, organizerId: payload.sub })

      // Fetch player counts for each group (resolves teams to players for doubles)
      const groupsWithCounts = await Promise.all(
        groups.map(async (g) => {
          const members = await groupRepo.findMembersByGroup(g.id)
          return {
            id: g.id,
            name: g.name,
            playerCount: members.length,
            advancingCount: g.advancing_count,
          }
        })
      )

      res.status(201).json({
        groups: groupsWithCounts,
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

      const tournament = await repo.findById(id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const groups = await groupRepo.findGroupsByTournament(id)

      const groupDetails = await Promise.all(
        groups.map(async (g) => {
          const members = await groupRepo.findMembersByGroup(g.id)
          const matches = await groupRepo.findMatchesByGroup(g.id)
          return {
            id: g.id,
            name: g.name,
            players: members.map(p => ({ id: p.id, name: p.name })),
            matchCount: matches.length,
          }
        })
      )

      res.json({
        groups: groupDetails,
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

      const group = await groupRepo.findGroupById(groupId)
      if (!group || group.tournament_id !== tournamentId) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Group not found' })
      }

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const matches = await groupRepo.findMatchesByGroup(groupId)

      // Handle singles vs doubles
      if (tournament.match_format === 'doubles') {
        const teams = await groupRepo.findTeamsByGroup(groupId)

        // Verify player is on a team in this group
        const playerTeam = teams.find(t => t.player1_id === payload.playerId || t.player2_id === payload.playerId)
        if (!playerTeam) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a member of this group' })
        }

        const standings = calculateStandings(
          teams.map(t => ({ id: t.id, name: `${t.player1_name} & ${t.player2_name}` })),
          matches.map(m => {
            validateMatchFormatConsistency(m)
            const [participant1, participant2] = getMatchParticipantIds(m)
            return {
              participant1Id: participant1,
              participant2Id: participant2,
              winnerId: m.winner_id || null,
              score: m.score || null,
            }
          })
        )

        res.json({
          standings: standings.map((s: any) => {
            const team = teams.find(t => t.id === s.participantId)
            return {
              rank: s.rank,
              teamId: s.participantId,
              name: team?.name || 'Unknown Team',
              wins: s.wins,
              losses: s.losses,
              setsWon: s.setsWon,
              setsLost: s.setsLost,
            }
          }),
        })
      } else {
        // Singles
        const members = await groupRepo.findMembersByGroup(groupId)

        // Verify player is actually in this group
        const playerInGroup = members.find(m => m.id === payload.playerId)
        if (!playerInGroup) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a member of this group' })
        }

        const standings = calculateStandings(
          members.map(m => ({ id: m.id, name: m.name })),
          matches.map(m => {
            validateMatchFormatConsistency(m)
            const [participant1, participant2] = getMatchParticipantIds(m)
            return {
              participant1Id: participant1,
              participant2Id: participant2,
              winnerId: m.winner_id || null,
              score: m.score || null,
            }
          })
        )

        res.json({
          standings: standings.map((s: any) => {
            const player = members.find(m => m.id === s.participantId)
            return {
              rank: s.rank,
              playerId: s.participantId,
              name: player?.name || 'Unknown',
              wins: s.wins,
              losses: s.losses,
              setsWon: s.setsWon,
              setsLost: s.setsLost,
            }
          }),
        })
      }
    } catch (err) {
      next(err)
    }
  })

  // POST /:id/matches/:matchId/score - player submits match score
  router.post('/:id/matches/:matchId/score', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string
      const matchId = req.params.matchId as string

      const { playerId } = await resolveTournamentPlayer(req.headers.authorization, tournamentId)

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const match = await groupRepo.findMatchById(matchId)
      if (!match || match.tournament_id !== tournamentId) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      validateMatchFormatConsistency(match)
      const [participant1, participant2] = getMatchParticipantIds(match)

      // For doubles, participant IDs are team IDs; verify player is on the team
      // For singles, participant IDs are player IDs; verify player is one of them
      let isParticipant = false
      if (match.format === 'doubles') {
        const { TeamRepository } = require('../repositories/team-repository')
        const teamRepo = new TeamRepository(deps.db)
        const team1 = await teamRepo.findTeamById(participant1)
        const team2 = await teamRepo.findTeamById(participant2)
        isParticipant = (team1 && (team1.player1Id === playerId || team1.player2Id === playerId)) ||
                       (team2 && (team2.player1Id === playerId || team2.player2Id === playerId))
      } else {
        isParticipant = participant1 === playerId || participant2 === playerId
      }

      if (!isParticipant) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a participant in this match' })
      }

      if (new Date() > new Date(tournament.group_stage_deadline)) {
        return res.status(409).json({ code: 'DEADLINE_PASSED', message: 'Group stage scoring deadline has passed' })
      }

      if (match.status === 'completed') {
        return res.status(409).json({ code: 'ALREADY_SCORED', message: 'This match has already been scored. Use PATCH to edit.' })
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

      // Determine winner ID based on format
      const winnerId = match.format === 'doubles'
        ? (parsed.winner === 'player1' ? match.team1_id! : match.team2_id!)
        : (parsed.winner === 'player1' ? match.player1_id! : match.player2_id!)
      const updated = await groupRepo.updateMatch(matchId, winnerId as string, req.body.score)

      // Resolve conversation_id once — used in both the enqueue payload
      // (so a BullMQ worker consumer emits on conversation_id, not tournamentId)
      // and the inline broadcast (in-memory mode, where no consumer exists).
      const cid = await conversationRepo.resolveConversation(tournamentId)

      // Enqueue standings recalculation job if job queue is available
      if (deps.jobQueue) {
        const jobId = `standings.recalculate.${match.group_id}`
        await deps.jobQueue.add('standings.recalculate', { tournamentId, groupId: match.group_id, conversationId: cid }, {
          jobId,
          attempts: deps.config.jobs.maxAttempts,
          backoff: { type: 'exponential', delay: deps.config.jobs.backoffBase },
        })
      }

      // Recalculate + broadcast standings now so connected clients refresh live
      // (the in-memory job queue has no consumer; standings are otherwise only
      // recomputed at read time in the bundle endpoint).
      if (deps.broadcastBus && match.group_id) {
        await processStandingsRecalculate(
          { tournamentId, groupId: match.group_id, conversationId: cid },
          { groupRepo, broadcastBus: deps.broadcastBus }
        )
      }

      log.info('score.submitted', { tournamentId, matchId, score: req.body.score, winnerId, playerId })

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

  // PATCH /:id/matches/:matchId/score - player edits score or organizer overrides
  router.patch('/:id/matches/:matchId/score', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string
      const matchId = req.params.matchId as string

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      // Authenticate before loading the match: an unauthenticated request must get 401,
      // and a valid organizer who does not own this tournament must get 403 (rather than
      // falling through to a generic 401). Player participation is checked after the match loads.
      let isOrganizer = false
      let actingPlayerId: string | null = null

      // Only an organizer-role account token is treated as an organizer (must own
      // the tournament). A player-role account JWT or a magic-link session is
      // resolved as a participant.
      let orgPayload = null
      try {
        orgPayload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      } catch {
        orgPayload = null
      }

      if (orgPayload && orgPayload.role === 'organizer') {
        try {
          assertOrganizerOwnsTournament(orgPayload, tournament.creator_id)
          isOrganizer = true
        } catch {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this tournament' })
        }
      } else {
        try {
          const resolved = await resolveTournamentPlayer(req.headers.authorization, tournamentId)
          actingPlayerId = resolved.playerId
        } catch (err2) {
          if (err2 instanceof ForbiddenError) {
            return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not registered in this tournament' })
          }
          return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Unauthorized' })
        }
      }

      const match = await groupRepo.findMatchById(matchId)
      if (!match || match.tournament_id !== tournamentId) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      // Player can only edit their own scores
      if (!isOrganizer) {
        validateMatchFormatConsistency(match)
        const [participant1, participant2] = getMatchParticipantIds(match)

        // For doubles, participant IDs are team IDs — verify team membership.
        // For singles, participant IDs are player IDs.
        let isParticipant = false
        if (match.format === 'doubles') {
          const { TeamRepository } = require('../repositories/team-repository')
          const teamRepo = new TeamRepository(deps.db)
          const team1 = await teamRepo.findTeamById(participant1)
          const team2 = await teamRepo.findTeamById(participant2)
          isParticipant = (team1 && (team1.player1Id === actingPlayerId || team1.player2Id === actingPlayerId)) ||
                         (team2 && (team2.player1Id === actingPlayerId || team2.player2Id === actingPlayerId))
        } else {
          isParticipant = participant1 === actingPlayerId || participant2 === actingPlayerId
        }

        if (!isParticipant) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a participant in this match' })
        }
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

      const winnerId = match.format === 'doubles'
        ? (parsed.winner === 'player1' ? match.team1_id! : match.team2_id!)
        : (parsed.winner === 'player1' ? match.player1_id! : match.player2_id!)
      const updated = await groupRepo.updateMatch(matchId, winnerId as string, req.body.score)

      // Broadcast the recalculated standings so connected clients refresh live.
      if (deps.broadcastBus && match.group_id) {
        const cid = await conversationRepo.resolveConversation(tournamentId)
        await processStandingsRecalculate(
          { tournamentId, groupId: match.group_id, conversationId: cid },
          { groupRepo, broadcastBus: deps.broadcastBus }
        )
      }

      if (isOrganizer) {
        log.info('score.overridden', { tournamentId, matchId, score: req.body.score, winnerId })
      } else {
        log.info('score.edited', { tournamentId, matchId, score: req.body.score, winnerId })
      }

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

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const seeds = await knockoutRepo.getSeeds(tournamentId)
      if (seeds.length === 0) {
        return res.status(404).json({ code: 'BRACKET_NOT_GENERATED', message: 'Bracket not generated yet' })
      }

      const seedMap = new Map(seeds.map((s) => [s.seedPosition, s.playerId]))
      const bracket = generateBracket(seeds.length)

      const knockoutMatches = await knockoutRepo.findKnockoutMatchesByTournament(tournamentId)
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

      const tournament = await repo.findById(tournamentId)
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

      const groups = await groupRepo.findGroupsByTournament(tournamentId)
      if (groups.length === 0) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'No groups exist for this tournament' })
      }

      // Calculate standings for each group and collect advancing participants.
      // Doubles advances TEAMS (seeds are team ids); singles advances players.
      const isDoubles = tournament.match_format === 'doubles'
      const advancingByGroup: string[][] = []
      for (const group of groups) {
        const matches = await groupRepo.findMatchesByGroup(group.id)

        let standings
        if (isDoubles) {
          const teams = await groupRepo.findTeamsByGroup(group.id)
          standings = calculateStandings(
            teams.map((t) => ({ id: t.id, name: `${t.player1_name} & ${t.player2_name}` })),
            matches.map((m) => {
              validateMatchFormatConsistency(m)
              const [participant1, participant2] = getMatchParticipantIds(m)
              return {
                participant1Id: participant1,
                participant2Id: participant2,
                winnerId: m.winner_id ?? null,
                score: m.score ?? null,
              }
            })
          )
        } else {
          const members = await groupRepo.findMembersByGroup(group.id)
          standings = calculateStandings(
            members.map((m) => ({ id: m.id, name: m.name })),
            matches.map((m) => ({
              participant1Id: m.player1_id!,
              participant2Id: m.player2_id!,
              winnerId: m.winner_id ?? null,
              score: m.score ?? null,
            }))
          )
        }

        const advancing = standings.slice(0, group.advancing_count).map((s) => s.participantId)
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

      await knockoutRepo.setSeeds(tournamentId, seeds)

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

      const tournament = await repo.findById(tournamentId)
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

      const existingSeeds = await knockoutRepo.getSeeds(tournamentId)
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

      await knockoutRepo.setSeeds(tournamentId, req.body.seeds)

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

      const tournament = await repo.findById(tournamentId)
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

      const seeds = await knockoutRepo.getSeeds(tournamentId)
      if (seeds.length === 0) {
        return res.status(409).json({ code: 'BRACKET_NOT_GENERATED', message: 'Bracket not generated yet' })
      }

      const seedMap = new Map(seeds.map((s) => [s.seedPosition, s.playerId]))
      const bracket = generateBracket(seeds.length)
      const knockoutMatches = await knockoutRepo.createKnockoutMatches(
        tournamentId,
        bracket,
        seedMap,
        tournament.match_format
      )

      await repo.updateStatus(tournamentId, 'knockout_active')

      log.info('bracket.published', { tournamentId, matchCount: knockoutMatches.length, organizerId: payload.sub })

      res.json({
        matches: knockoutMatches.map((m) => ({
          id: m.id,
          round: m.round,
          position: m.position,
          player1Id: m.player1_id ?? m.team1_id,
          player2Id: m.player2_id ?? m.team2_id,
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

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      if (tournament.status !== 'knockout_active') {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'Tournament is not in knockout phase' })
      }

      const match = await knockoutRepo.findKnockoutMatchById(matchId)
      if (!match || match.tournament_id !== tournamentId) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      validateMatchFormatConsistency(match)
      const [participant1, participant2] = getMatchParticipantIds(match)

      // For doubles, participants are team ids: verify the player is on one of the
      // teams (mirrors the group score endpoint). For singles, compare player ids.
      let isParticipant: boolean
      if (isDoublesMatch(match)) {
        const { TeamRepository } = require('../repositories/team-repository')
        const teamRepo = new TeamRepository(deps.db)
        const team1 = await teamRepo.findTeamById(participant1)
        const team2 = await teamRepo.findTeamById(participant2)
        isParticipant =
          !!(team1 && (team1.player1Id === payload.playerId || team1.player2Id === payload.playerId)) ||
          !!(team2 && (team2.player1Id === payload.playerId || team2.player2Id === payload.playerId))
      } else {
        isParticipant = participant1 === payload.playerId || participant2 === payload.playerId
      }
      if (!isParticipant) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a participant in this match' })
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

      const winnerId = isDoublesMatch(match)
        ? (parsed.winner === 'player1' ? match.team1_id : match.team2_id)
        : (parsed.winner === 'player1' ? match.player1_id : match.player2_id)
      if (!winnerId) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'Cannot determine winner' })
      }
      const updated = await knockoutRepo.updateKnockoutMatch(matchId, winnerId, req.body.score)

      // Broadcast so connected clients advance the bracket live (mirrors the
      // bracket.published broadcast from the generation job).
      if (deps.broadcastBus) {
        const cid = await conversationRepo.resolveConversation(tournamentId)
        deps.broadcastBus.emit(cid, 'bracket.updated', { matchId, round: updated.round, winnerId })
      }

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

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const match = await knockoutRepo.findKnockoutMatchById(matchId)
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
      const updated = await knockoutRepo.updateKnockoutMatch(matchId, winnerId, req.body.score)

      if (deps.broadcastBus) {
        const cid = await conversationRepo.resolveConversation(tournamentId)
        deps.broadcastBus.emit(cid, 'bracket.updated', { matchId, round: updated.round, winnerId })
      }

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
      const limit = req.query.limit ? parseInt(req.query.limit as string) : deps.config.limits.paginationDefaults.tournaments
      const status = req.query.status as string | undefined

      const result = await repo.listByOrganizer(payload.sub, { offset, limit, status })

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
  router.get('/public', async (req: Request, res: Response) => {
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10
    const sport = req.query.sport as string | undefined

    const result = await repo.listPublic({ offset, limit, sport })

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

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      if (tournament.status !== 'registration_open') {
        return res.status(409).json({ code: 'REGISTRATION_CLOSED', message: 'Registration is not open for this tournament' })
      }

      const registrationCount = await playerRepo.countRegistrationsForTournament(tournamentId)
      if (registrationCount >= tournament.max_players) {
        return res.status(409).json({ code: 'TOURNAMENT_FULL', message: 'Tournament has reached maximum capacity' })
      }

      // Handle partner selection for doubles tournaments (optional - teams auto-created during group creation)
      if (tournament.match_format === 'doubles' && req.body.partnerSelection) {

        const { type, value } = req.body.partnerSelection
        if (!['select', 'invite'].includes(type)) {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid partner selection type' })
        }

        if (type === 'select' && !value) {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Partner ID required for select option' })
        }

        if (type === 'invite') {
          if (!value || !value.includes('@')) {
            return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid email format for invite option' })
          }
          if (value === req.body.email.trim()) {
            return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Cannot partner with yourself' })
          }
        }
      }

      const player = await playerRepo.findOrCreatePlayerByEmail(
        req.body.email.trim(),
        req.body.name.trim(),
        req.body.phone,
        req.body.preferredContact
      )

      // Dual-role: if the request is authenticated as the account whose own email
      // is being registered, link that account to this player so it can act as a
      // participant (e.g. an organizer registering themselves). Best-effort.
      try {
        const acct = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
        const account = await accountRepo.findById(acct.sub)
        if (
          account &&
          !account.player_id &&
          account.email.toLowerCase() === req.body.email.trim().toLowerCase()
        ) {
          await accountRepo.linkPlayer(account.id, player.id)
          log.info('account.player_linked', { accountId: account.id, playerId: player.id, tournamentId })
        }
      } catch {
        // Unauthenticated (guest) registration — no account to link.
      }

      const existingReg = await playerRepo.findRegistration(player.id, tournamentId)

      // Handle doubles partnership
      if (tournament.match_format === 'doubles' && req.body.partnerSelection) {
        const { type, value } = req.body.partnerSelection

        if (type === 'select') {
          // Partner already registered - create paired registrations
          const partnerPlayer = await playerRepo.findById(value)
          if (!partnerPlayer) {
            return res.status(404).json({ code: 'NOT_FOUND', message: 'Partner player not found' })
          }

          // Create registration for this player with partner reference
          if (!existingReg) {
            await playerRepo.createRegistration(player.id, tournamentId)
          }

          // Update with partner information
          const reg1 = await playerRepo.findRegistration(player.id, tournamentId)
          if (reg1) {
            await playerRepo.updateRegistrationWithPartner(reg1.id, value)
          }

          // Check or create registration for partner
          const partnerReg = await playerRepo.findRegistration(value, tournamentId)
          if (!partnerReg) {
            await playerRepo.createRegistration(value, tournamentId)
          } else {
            // Update partner's registration with this player's ID
            await playerRepo.updateRegistrationWithPartner(partnerReg.id, player.id)
          }

          log.info('team.created', {
            tournamentId,
            player1Id: player.id,
            player2Id: value,
            registrationType: 'select',
          })
        } else if (type === 'invite') {
          // Partner not yet registered - create registration with invite pending
          if (!existingReg) {
            await playerRepo.createRegistration(player.id, tournamentId)
          }

          // Store invitation info (will be linked when partner signs up)
          // For now, we just create the registration
          log.info('team.created', {
            tournamentId,
            playerId: player.id,
            partnerEmail: value,
            registrationType: 'invite',
          })
        }
      } else if (!existingReg) {
        // Single registration (not doubles, or doubles without partner selection)
        log.debug('registration.creating', { tournamentId, playerId: player.id, format: tournament.match_format })
        const reg = await playerRepo.createRegistration(player.id, tournamentId)
        log.debug('registration.created.db', { tournamentId, playerId: player.id, registrationId: reg.id })
        log.info('registration.created', { tournamentId, playerId: player.id, format: tournament.match_format })
      }

      const magicLink = await generateMagicLinkToken(
        { playerId: player.id, tournamentId, email: player.email, createdAt: Date.now() },
        deps.config.auth.magicLinkTtlSeconds,
        deps.tokenStore
      )

      log.info('player.registered', { tournamentId, playerId: player.id, format: tournament.match_format })

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

  // GET /auth/magic-link - validate magic link token and return payload (for frontend pre-fill)
  router.get('/auth/magic-link', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.query.token as string | undefined

      if (!token) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'token query parameter is required' })
      }

      let magicPayload
      try {
        magicPayload = await validateMagicLinkTokenReadOnly(token, deps.tokenStore)
      } catch (err) {
        if (err instanceof TokenInvalidError) {
          return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token is invalid or has expired' })
        }
        throw err
      }

      log.debug('magic_link.validated', { tournamentId: magicPayload.tournamentId, email: magicPayload.email })

      res.status(200).json({
        email: magicPayload.email,
        tournamentId: magicPayload.tournamentId,
        playerId: magicPayload.playerId,
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

      const player = await playerRepo.findByEmail(req.body.email.trim())
      if (player) {
        const reg = await playerRepo.findRegistration(player.id, tournamentId)
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

      const tournament = await repo.findById(id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      const validationFields: any = {}
      if (req.body.name !== undefined) {
        if (!req.body.name || typeof req.body.name !== 'string') {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'name must be a non-empty string' })
        }
        const existing = await repo.findByName(req.body.name)
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

      const updated = await repo.update(id, validationFields)

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

      const tournament = await repo.findById(id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      assertOrganizerOwnsTournament(payload, tournament.creator_id)

      await repo.softDelete(id)

      log.info('tournament.deleted', { tournamentId: id, organizerId: payload.sub })

      res.status(204).send()
    } catch (err) {
      next(err)
    }
  })

  // GET /tournaments/available - list available tournaments for registration
  router.get('/available', async (req: Request, res: Response) => {
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
    const limit = req.query.limit ? parseInt(req.query.limit as string) : deps.config.limits.paginationDefaults.tournaments
    const sport = req.query.sport as string | undefined

    const result = await repo.listAvailable({ offset, limit, sport })

    const tournaments = await Promise.all(
      result.rows.map(async (t) => {
        const registered = await playerRepo.countRegistrationsForTournament(t.id)
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
    )

    res.json({
      tournaments,
      total: result.total,
      page: Math.floor(offset / limit) + 1,
      limit,
    })
  })

  // GET /:id - public tournament details (for discovery / guest registration page).
  // Registered after all literal GET routes (/public, /organizer, /available) so the
  // ':id' param does not shadow them.
  router.get('/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string
    const tournament = await repo.findById(id)
    if (!tournament || tournament.deleted_at) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
    }
    res.json({
      id: tournament.id,
      name: tournament.name,
      sport: tournament.sport,
      matchFormat: tournament.match_format,
      maxPlayers: tournament.max_players,
      registrationDeadline: tournament.registration_deadline,
      status: tournament.status,
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

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
      const limit = req.query.limit ? parseInt(req.query.limit as string) : deps.config.limits.paginationDefaults.players

      const result = await playerRepo.findRegistrationsByTournament(tournamentId, { offset, limit })

      const players = await Promise.all(
        result.rows.map(async (reg) => {
          const player = (await playerRepo.findById(reg.player_id))!
          let partnerName: string | null = null
          let partnerEmail: string | null = null

          if (reg.partner_id) {
            const partner = await playerRepo.findById(reg.partner_id)
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
      )

      res.json({
        players,
        total: result.total,
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /:id/available-partners - solo doubles registrants available to partner with
  router.get('/:id/available-partners', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string
      const { playerId } = await resolveTournamentPlayer(req.headers.authorization, tournamentId)
      const players = await playerRepo.findAvailablePartners(tournamentId, playerId)
      res.json({ players })
    } catch (err) {
      next(err)
    }
  })

  // GET /:id/partner-requests - incoming partner requests for the caller
  router.get('/:id/partner-requests', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string
      const { playerId } = await resolveTournamentPlayer(req.headers.authorization, tournamentId)
      const requests = await playerRepo.findIncomingPartnerRequests(tournamentId, playerId)
      res.json({ requests })
    } catch (err) {
      next(err)
    }
  })

  // POST /:id/partner-requests - request a solo registrant as your doubles partner
  router.post('/:id/partner-requests', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string
      const { playerId } = await resolveTournamentPlayer(req.headers.authorization, tournamentId)
      const targetPlayerId = req.body.targetPlayerId

      if (typeof targetPlayerId !== 'string' || !targetPlayerId.trim()) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'targetPlayerId is required' })
      }
      if (targetPlayerId === playerId) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Cannot partner with yourself' })
      }

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }
      if (tournament.match_format !== 'doubles') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Partner requests are only for doubles tournaments' })
      }
      if (tournament.status !== 'registration_open') {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'Registration is not open for this tournament' })
      }

      const target = await playerRepo.findById(targetPlayerId)
      if (!target) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Partner player not found' })
      }

      const requesterReg = await playerRepo.findRegistration(playerId, tournamentId)
      const targetReg = await playerRepo.findRegistration(targetPlayerId, tournamentId)
      if (!requesterReg) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'You are not registered in this tournament' })
      }
      if (!targetReg) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'That player is not registered in this tournament' })
      }
      if (requesterReg.partner_id) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'You already have a partner' })
      }
      if (targetReg.partner_id) {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'That player already has a partner' })
      }

      await playerRepo.updateRegistrationWithPartner(requesterReg.id, targetPlayerId)

      log.info('partner.requested', { tournamentId, playerId, targetPlayerId })

      res.status(201).json({ registrationId: requesterReg.id, targetPlayerId, status: 'pending_partner_confirm' })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /registrations/:registrationId/confirm - partner confirms doubles registration
  router.patch('/registrations/:registrationId/confirm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const registrationId = req.params.registrationId as string

      const registration = await playerRepo.findRegistrationById(registrationId)
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

      const tournament = await repo.findById(registration.tournament_id)
      if (!tournament || tournament.status !== 'registration_open') {
        return res.status(409).json({ code: 'INVALID_STATE', message: 'Tournament is no longer in registration phase' })
      }

      const updated = await playerRepo.confirmPartner(registrationId)

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

      const registration = await playerRepo.findRegistrationById(registrationId)
      if (!registration) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Registration not found' })
      }

      if (registration.player_id !== payload.playerId) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'You can only withdraw your own registration' })
      }

      if (registration.status === 'withdrawn' || registration.status === 'withdrawal_pending') {
        return res.status(409).json({ code: 'ALREADY_WITHDRAWN', message: 'This registration has already been withdrawn' })
      }

      const tournament = await repo.findById(registration.tournament_id)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const isBeforeDeadline = new Date() < new Date(tournament.registration_deadline)
      const updated = await playerRepo.withdrawRegistration(registrationId, isBeforeDeadline)

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
  const findMatchInBothTables = async (matchId: string, tournamentId: string) => {
    const groupMatch = await groupRepo.findMatchByIdWithPlayers(matchId)
    if (groupMatch && groupMatch.tournament_id === tournamentId) {
      return { match: groupMatch, type: 'group' as const }
    }
    const knockoutMatch = await knockoutRepo.findKnockoutMatchByIdWithPlayers(matchId)
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

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const groupMatches = tournament.match_format === 'doubles'
        ? await groupRepo.findMatchesByPlayerForDoubles(tournamentId, payload.playerId)
        : await groupRepo.findMatchesByPlayer(tournamentId, payload.playerId)
      const knockoutMatches = await knockoutRepo.findKnockoutMatchesByPlayer(tournamentId, payload.playerId)

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
          const tournament = await repo.findById(tournamentId)
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

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const foundMatch = await findMatchInBothTables(matchId, tournamentId)
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

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      const foundMatch = await findMatchInBothTables(matchId, tournamentId)
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

      const updated = type === 'group' ? await groupRepo.confirmMatch(matchId, position) : await knockoutRepo.confirmKnockoutMatch(matchId, position)

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
    const tournament = await repo.findById(tournamentId)
    if (!tournament) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
    }

    if (!deps.broadcastBus) {
      return res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'SSE not available' })
    }

    // Support both Authorization header and query param token (for EventSource compatibility)
    let authHeader = req.headers.authorization
    if (!authHeader && req.query.token) {
      const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token
      authHeader = `Bearer ${token}`
    }

    // Phase 1: identify caller
    let playerPayload: any = null
    let organizerPayload: any = null

    try {
      playerPayload = await requirePlayerSessionAuth(authHeader, deps.tokenStore)
    } catch {}

    if (!playerPayload) {
      try {
        organizerPayload = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore)
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
    if (current >= deps.config.limits.sseMaxConnectionsPerUser) {
      log.warn('sse.rate.limited', { tournamentId, userId })
      return res.status(429).json({ code: 'TOO_MANY_REQUESTS', message: 'Too many active SSE connections' })
    }
    sseConnectionCount.set(userId, current + 1)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // Resolve the tournament's conversation_id — the bus is keyed on conversation_id
    // so all subscribers and emitters use a stable, non-tournament-ID key.
    const conversationId = await conversationRepo.resolveConversation(tournamentId)

    const unsubscribe = deps.broadcastBus.subscribe(conversationId, (event, data) => {
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

  // GET /:id/bundle - consolidation endpoint for tournament + standings + matches + bracket
  router.get('/:id/bundle', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentId = req.params.id as string

      // Dual auth: organizer or player
      let userId: string
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing authentication' })
      }

      let isOrganizer = false
      // An organizer-role account token must own the tournament. Everything else
      // (a player-role account JWT or a magic-link player session) is resolved as
      // a participant.
      let orgPayload = null
      try {
        orgPayload = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore)
      } catch {
        orgPayload = null
      }

      if (orgPayload && orgPayload.role === 'organizer') {
        const tournament = await repo.findById(tournamentId)
        if (!tournament) {
          return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
        }
        if (tournament.creator_id !== orgPayload.sub) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this tournament' })
        }
        isOrganizer = true
        userId = orgPayload.sub
      } else {
        try {
          const { playerId } = await resolveTournamentPlayer(authHeader, tournamentId)
          userId = playerId
        } catch (playerErr) {
          if (playerErr instanceof ForbiddenError) {
            return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not registered in this tournament' })
          }
          return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or missing authentication' })
        }
      }

      const tournament = await repo.findById(tournamentId)
      if (!tournament) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' })
      }

      // Parse include parameter (default: all fields)
      const fields = new Set(
        (req.query.include as string | undefined)?.split(',').map(f => f.trim()) ??
        ['tournament', 'standings', 'matches', 'bracket']
      )

      // Phase 1: Parallel base fetches
      const [groups, seeds, knockoutMatches] = await Promise.all([
        (fields.has('standings') || fields.has('matches'))
          ? groupRepo.findGroupsByTournament(tournamentId)
          : Promise.resolve([]),
        fields.has('bracket')
          ? knockoutRepo.getSeeds(tournamentId)
          : Promise.resolve([]),
        (fields.has('matches') || fields.has('bracket'))
          ? knockoutRepo.findKnockoutMatchesByTournament(tournamentId)
          : Promise.resolve([]),
      ])

      // Phase 2: Per-group data (if needed)
      const groupDetails: Array<[PlayerRow[], GroupMatchRow[]]> = (fields.has('standings') || fields.has('matches'))
        ? await Promise.all(groups.map(async (g) => {
            const members = await groupRepo.findMembersByGroup(g.id)
            const matches = await groupRepo.findMatchesByGroup(g.id)
            return [members, matches]
          }))
        : []

      // Build response object
      const response: any = {}

      if (fields.has('tournament')) {
        response.tournament = {
          id: tournament.id,
          name: tournament.name,
          sport: tournament.sport,
          matchFormat: tournament.match_format,
          status: tournament.status,
          creatorId: tournament.creator_id,
          maxPlayers: tournament.max_players,
          description: tournament.description,
          registrationDeadline: tournament.registration_deadline,
          groupStageDeadline: tournament.group_stage_deadline,
          knockoutStageDeadline: tournament.knockout_stage_deadline,
        }
      }

      if (fields.has('standings')) {
        response.standings = groups.map((group, idx) => {
          const [members, matches] = groupDetails[idx] || [[], []]
          const standings = calculateStandings(
            members.map(m => ({ id: m.id, name: m.name })),
            matches.map(m => ({
              participant1Id: m.player1_id!,
              participant2Id: m.player2_id!,
              winnerId: m.winner_id || null,
              score: m.score || null,
            }))
          )
          return {
            groupId: group.id,
            groupName: group.name,
            standings: standings.map((s: any) => {
              const player = members.find(m => m.id === s.participantId)
              return {
                rank: s.rank,
                playerId: s.participantId,
                name: player?.name || 'Unknown',
                wins: s.wins,
                losses: s.losses,
                setsWon: s.setsWon,
                setsLost: s.setsLost,
              }
            }),
          }
        })
      }

      if (fields.has('matches')) {
        const groupMatches = groupDetails.flatMap(([_, matches]) => matches || [])
        response.matches = {
          group: groupMatches.map(m => ({
            id: m.id,
            groupId: m.group_id,
            player1Id: m.player1_id,
            player2Id: m.player2_id,
            winnerId: m.winner_id || null,
            score: m.score || null,
            status: m.status,
          })),
          knockout: knockoutMatches.map(m => ({
            id: m.id,
            round: m.round,
            position: m.position,
            player1Id: m.player1_id ?? m.team1_id,
            player2Id: m.player2_id ?? m.team2_id,
            winnerId: m.winner_id || null,
            score: m.score || null,
            status: m.status,
          })),
        }
      }

      if (fields.has('bracket')) {
        if (seeds.length > 0) {
          const seedMap = new Map(seeds.map(s => [s.seedPosition, s.playerId]))
          const bracket = generateBracket(seeds.length)
          const matchById = new Map(knockoutMatches.map(m => [`${m.round}-${m.position}`, m]))

          const rounds = bracket.rounds.map((r) => ({
            round: r.round,
            matches: r.matches.map((m) => {
              const dbMatch = matchById.get(`${m.round}-${m.position}`)
              if (dbMatch) {
                return {
                  id: dbMatch.id,
                  round: dbMatch.round,
                  position: dbMatch.position,
                  player1Id: dbMatch.player1_id ?? dbMatch.team1_id,
                  player2Id: dbMatch.player2_id ?? dbMatch.team2_id,
                  winnerId: dbMatch.winner_id || null,
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

          response.bracket = {
            rounds,
            totalPlayers: seeds.length,
            byeCount: bracket.byeCount,
          }
        } else {
          response.bracket = null
        }
      }

      // Doubles knockout matches carry team ids; surface a teamId → display-name
      // map so clients can resolve names (group standings are keyed per-player).
      if (tournament.match_format === 'doubles' && (fields.has('bracket') || fields.has('matches'))) {
        const teamMap = new Map<string, string>()
        for (const g of groups) {
          const groupTeams = await groupRepo.findTeamsByGroup(g.id)
          for (const t of groupTeams) {
            teamMap.set(t.id, `${t.player1_name} & ${t.player2_name}`)
          }
        }
        response.teams = Array.from(teamMap, ([id, name]) => ({ id, name }))
      }

      log.info('tournament.bundle.fetched', { tournamentId, userId })

      res.json(response)
    } catch (err) {
      next(err)
    }
  })

  return router
}
