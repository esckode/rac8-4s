/**
 * score-service — group-stage score submission (extracted from
 * routes/tournaments.ts POST /:id/matches/:matchId/score, B2.0).
 *
 * Behavior-preserving extraction: this is the exact logic the route used to
 * run inline, now shared between the route and the Phase B confirm-card
 * path (design §11 B-Q3: the confirm route mutates through this same
 * service — the score-submission authority stays exactly one code path).
 *
 * Knockout scoring keeps its own inline handler — propose_score v1 targets
 * group-stage/casual matches only (where the B7 e2e flows live).
 */
import type { Pool, PoolClient } from 'pg'
import { TournamentRepository, GroupRepository } from '../db'
import { LeaderboardRepository, type ParticipantSlot } from '../repositories/leaderboard-repository'
import { ConversationRepository } from '../repositories/conversation-repository'
import { TeamRepository } from '../repositories/team-repository'
import { parseScore, type SportFormat } from '@core/score-parser'
import { getMatchParticipantIds, validateMatchFormatConsistency } from '../utils/match-format'
import { processStandingsRecalculate } from '../workers/standings-processor'
import type { JobQueue } from '@worker/job-queue'
import type { IBroadcastBus } from '../broadcast-bus'
import type { AppConfig } from '../config'
import { getLogger } from '../logger'

const log = getLogger('score-service')

export interface SubmitScoreInput {
  tournamentId: string
  matchId: string
  playerId: string
  score: unknown
}

export interface SubmitScoreMatch {
  id: string
  score: string
  winnerId: string | null
  status: string
}

export type SubmitScoreErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'DEADLINE_PASSED'
  | 'ALREADY_SCORED'
  | 'VALIDATION_ERROR'
  | 'SCORE_INVALID'

export type SubmitScoreResult =
  | { ok: true; match: SubmitScoreMatch }
  | { ok: false; code: SubmitScoreErrorCode; message: string }

/** The route's HTTP mapping for each error discriminant (unchanged from the pre-extraction route). */
export const SCORE_ERROR_HTTP_STATUS: Record<SubmitScoreErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  DEADLINE_PASSED: 409,
  ALREADY_SCORED: 409,
  VALIDATION_ERROR: 400,
  SCORE_INVALID: 400,
}

export interface ScoreServiceDeps {
  db: Pool | PoolClient
  repo: TournamentRepository
  groupRepo: GroupRepository
  conversationRepo: ConversationRepository
  leaderboardRepo: LeaderboardRepository
  jobQueue?: JobQueue
  broadcastBus?: IBroadcastBus
  config: AppConfig
}

export async function submitScore(
  deps: ScoreServiceDeps,
  input: SubmitScoreInput
): Promise<SubmitScoreResult> {
  const { db, repo, groupRepo, conversationRepo, leaderboardRepo, jobQueue, broadcastBus, config } = deps
  const { tournamentId, matchId, playerId, score } = input

  const tournament = await repo.findById(tournamentId)
  if (!tournament) {
    return { ok: false, code: 'NOT_FOUND', message: 'Tournament not found' }
  }

  const isCasual = tournament.mode === 'casual'

  const match = await groupRepo.findMatchById(matchId)
  if (!match || match.tournament_id !== tournamentId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Match not found' }
  }

  validateMatchFormatConsistency(match)
  const [participant1, participant2] = getMatchParticipantIds(match)

  if (isCasual) {
    // Casual mode: any tournament participant may score any match — no
    // match-level check needed (the caller is already confirmed registered).
  } else {
    // Scheduled mode: only a participant of THIS match may submit a score.
    let isParticipant = false
    if (match.format === 'doubles') {
      const teamRepo = new TeamRepository(db as Pool)
      const team1 = await teamRepo.findTeamById(participant1)
      const team2 = await teamRepo.findTeamById(participant2)
      isParticipant = Boolean(
        (team1 && (team1.player1Id === playerId || team1.player2Id === playerId)) ||
        (team2 && (team2.player1Id === playerId || team2.player2Id === playerId))
      )
    } else {
      isParticipant = participant1 === playerId || participant2 === playerId
    }

    if (!isParticipant) {
      return { ok: false, code: 'FORBIDDEN', message: 'You are not a participant in this match' }
    }
  }

  // Deadline enforcement: only for scheduled tournaments with a set deadline.
  if (!isCasual && tournament.group_stage_deadline != null && new Date() > new Date(tournament.group_stage_deadline)) {
    return { ok: false, code: 'DEADLINE_PASSED', message: 'Group stage scoring deadline has passed' }
  }

  if (match.status === 'completed') {
    return { ok: false, code: 'ALREADY_SCORED', message: 'This match has already been scored. Use PATCH to edit.' }
  }

  if (typeof score !== 'string') {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'score must be a non-empty string' }
  }

  let parsed
  try {
    parsed = parseScore(score, tournament.sport as SportFormat)
  } catch (err) {
    return { ok: false, code: 'SCORE_INVALID', message: `Invalid score format: ${(err as Error).message}` }
  }

  // Determine winner ID based on format
  const winnerId = match.format === 'doubles'
    ? (parsed.winner === 'player1' ? match.team1_id! : match.team2_id!)
    : (parsed.winner === 'player1' ? match.player1_id! : match.player2_id!)
  const updated = await groupRepo.updateMatch(matchId, winnerId as string, score)

  // Resolve conversation_id once — used in both the enqueue payload
  // (so a BullMQ worker consumer emits on conversation_id, not tournamentId)
  // and the inline broadcast (in-memory mode, where no consumer exists).
  const cid = await conversationRepo.resolveConversation(tournamentId)

  // Enqueue standings recalculation job if job queue is available
  if (jobQueue) {
    const jobId = `standings.recalculate.${match.group_id}`
    await jobQueue.add('standings.recalculate', { tournamentId, groupId: match.group_id, conversationId: cid }, {
      jobId,
      attempts: config.jobs.maxAttempts,
      backoff: { type: 'exponential', delay: config.jobs.backoffBase },
    })
  }

  // Recalculate + broadcast standings now so connected clients refresh live
  // (the in-memory job queue has no consumer; standings are otherwise only
  // recomputed at read time in the bundle endpoint).
  if (broadcastBus && match.group_id) {
    await processStandingsRecalculate(
      { tournamentId, groupId: match.group_id, conversationId: cid },
      { groupRepo, broadcastBus }
    )
  }

  // Write durable match log for casual group-linked tournaments
  if (isCasual && tournament.group_id) {
    const winningSide: 'team1' | 'team2' =
      match.format === 'doubles'
        ? (updated.winner_id === match.team1_id ? 'team1' : 'team2')
        : (updated.winner_id === match.player1_id ? 'team1' : 'team2')

    // Resolve player names for name_snapshot
    const participantIdList =
      match.format === 'doubles'
        ? [match.team1_id, match.team2_id].filter(Boolean)
        : [match.player1_id, match.player2_id].filter(Boolean)

    // For singles we need player names; look them up from the players table
    let nameMap: Record<string, string> = {}
    if (match.format !== 'doubles' && participantIdList.length > 0) {
      const playerRows = await db.query(
        `SELECT id, name FROM public.players WHERE id = ANY($1)`,
        [participantIdList]
      )
      for (const row of playerRows.rows) {
        nameMap[row.id] = row.name
      }
    }

    const participants: ParticipantSlot[] = []
    if (match.format === 'doubles') {
      // For doubles, teams are the participant IDs — use team_id as fallback name
      if (match.team1_id) {
        participants.push({
          playerId: match.team1_id,
          nameSnapshot: match.team1_id,
          side: 'team1',
        })
      }
      if (match.team2_id) {
        participants.push({
          playerId: match.team2_id,
          nameSnapshot: match.team2_id,
          side: 'team2',
        })
      }
    } else {
      if (match.player1_id) {
        participants.push({
          playerId: match.player1_id,
          nameSnapshot: nameMap[match.player1_id] ?? match.player1_id,
          side: 'team1',
        })
      }
      if (match.player2_id) {
        participants.push({
          playerId: match.player2_id,
          nameSnapshot: nameMap[match.player2_id] ?? match.player2_id,
          side: 'team2',
        })
      }
    }

    await leaderboardRepo.logMatch(
      tournamentId,
      tournament.group_id,
      matchId,
      winningSide,
      participants
    )
  }

  log.info('score.submitted', { tournamentId, matchId, score, winnerId, playerId })

  // Casual mode: auto-advance when all group matches in the tournament are scored.
  if (isCasual) {
    const pendingCount = await groupRepo.countPendingMatchesByTournament(tournamentId)
    if (pendingCount === 0 && tournament.status === 'group_stage_active') {
      await repo.updateStatus(tournamentId, 'group_stage_complete')
    }
  }

  return {
    ok: true,
    match: {
      id: updated.id,
      score: updated.score as string,
      winnerId: updated.winner_id ?? null,
      status: updated.status,
    },
  }
}
