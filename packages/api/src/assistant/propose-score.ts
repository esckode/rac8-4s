/**
 * propose_score — Phase B write-action tool (design §11 B0/B-Q5/B-Q7/B-Q10).
 *
 * Still a REGISTRY-WALL tool: it never mutates a match. It drafts a card via
 * AssistantCardRepository — the model emits the score asker-relative, this
 * tool normalizes it to the player1-relative form the score route expects
 * (score-service.ts) at draft time, so args are route-ready and confirm can
 * replay them verbatim. Args are ids-only (opponent name resolved here and
 * discarded — nothing to DSR-scrub later).
 *
 * Reuses getMyMatches (the read tool) for scope + candidate discovery, so
 * the Q5 auth wall is inherited rather than re-implemented.
 */
import { GroupRepository, TournamentRepository } from '../db'
import { TeamRepository } from '../repositories/team-repository'
import { AssistantCardRepository } from '../repositories/assistant-card-repository'
import { parseScore, type SportFormat } from '@core/score-parser'
import type { AssistantToolContext } from './tools'
import { getMyMatches } from './tools'
import { emitCardCreated } from './emit-card'

export interface ProposeScoreInput {
  opponentName: string
  /** Asker-relative "X-Y[, X-Y...]" — the asker's number first in every set. */
  score: string
  /** Optional disambiguator when the asker has matches of the same opponent name in multiple tournaments. */
  tournamentId?: string
}

export type ProposeScoreResult =
  | { status: 'card_posted'; cardId: string; messageId: string }
  | { status: 'ambiguous'; candidates: Array<{ matchId: string; tournamentName: string; opponentName: string }> }
  | { status: 'not_found'; message: string }
  | { status: 'declined'; message: string }

/** Swaps each set's two numbers ("6-4, 3-6" → "4-6, 6-3") — orientation flip only, no score semantics. */
function flipScoreOrientation(score: string): string {
  return score
    .split(', ')
    .map(set => set.split('-').reverse().join('-'))
    .join(', ')
}

export async function proposeScore(
  ctx: AssistantToolContext,
  input: ProposeScoreInput
): Promise<ProposeScoreResult> {
  const myMatches = await getMyMatches(ctx, input.tournamentId ? { tournamentId: input.tournamentId } : {})
  if ('error' in myMatches) {
    return { status: 'not_found', message: "I couldn't find that tournament." }
  }

  const query = input.opponentName.trim().toLowerCase()
  const candidates = myMatches.matches.filter(
    m => m.status === 'pending' && m.opponentName.toLowerCase().includes(query)
  )

  if (candidates.length === 0) {
    return { status: 'not_found', message: `I couldn't find a pending match against "${input.opponentName}".` }
  }
  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      candidates: candidates.map(c => ({
        matchId: c.matchId,
        tournamentName: c.tournamentName,
        opponentName: c.opponentName,
      })),
    }
  }

  const chosen = candidates[0]
  const groupRepo = new GroupRepository(ctx.db)
  const tournamentRepo = new TournamentRepository(ctx.db)

  const [match, tournament, asker] = await Promise.all([
    groupRepo.findMatchById(chosen.matchId),
    tournamentRepo.findById(chosen.tournamentId),
    ctx.db.query(`SELECT name FROM public.players WHERE id = $1`, [ctx.playerId]),
  ])
  if (!match || !tournament) {
    return { status: 'not_found', message: "I couldn't find that match." }
  }
  const askerName: string = asker.rows[0]?.name ?? 'A member'

  // Deadline check (mirrors score-service.ts; casual tournaments have no deadline)
  if (
    tournament.mode !== 'casual' &&
    tournament.group_stage_deadline != null &&
    new Date() > new Date(tournament.group_stage_deadline)
  ) {
    return { status: 'declined', message: 'The scoring deadline for this group stage has already passed.' }
  }

  // Score format validation (draft-time; confirm-time revalidates via parseScore again)
  try {
    parseScore(input.score, tournament.sport as SportFormat)
  } catch (err) {
    return { status: 'declined', message: `I couldn't parse that score: ${(err as Error).message}` }
  }

  // Determine which side the asker is on, to normalize to player1-relative.
  let askerIsPlayer1: boolean
  if (match.format === 'doubles') {
    const teamRepo = new TeamRepository(ctx.db as any)
    const team1 = match.team1_id ? await teamRepo.findTeamById(match.team1_id) : null
    askerIsPlayer1 = Boolean(team1 && (team1.player1Id === ctx.playerId || team1.player2Id === ctx.playerId))
  } else {
    askerIsPlayer1 = match.player1_id === ctx.playerId
  }
  const routeReadyScore = askerIsPlayer1 ? input.score : flipScoreOrientation(input.score)

  const cardRepo = new AssistantCardRepository(ctx.db as any)
  const body = `Coach drafted a score — ${askerName} ${input.score} ${chosen.opponentName} (${chosen.tournamentName}). Only ${askerName} can confirm, within 15 minutes.`
  const { card, conversationId } = await cardRepo.createCard({
    groupId: ctx.groupId,
    proposerPlayerId: ctx.playerId,
    action: 'propose_score',
    args: { tournamentId: chosen.tournamentId, matchId: chosen.matchId, score: routeReadyScore },
    body,
  })
  emitCardCreated(ctx.broadcastBus, conversationId, ctx.groupId, card, body)

  return { status: 'card_posted', cardId: card.id, messageId: card.messageId }
}
