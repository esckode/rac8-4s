/**
 * Assistant read-only tool layer — the registry wall (design §7, Q5).
 *
 * Every tool executes as the asking player through EXISTING repository methods;
 * the LLM never gets SQL or raw repository access and never constructs its own
 * authorization. Scope = tournaments linked to the group (tournaments.group_id)
 * PLUS tournaments the asker is registered in — exactly what the asker can
 * already see in the UI. Non-group tournaments expose minimal detail (the
 * asker's own rows only) because replies are visible to the whole group.
 *
 * Out-of-scope ids return a not-found error OBJECT (fed back to the model as
 * tool output), never data and never a throw.
 *
 * Tool outputs are small JSON objects: ids, names, ISO dates — no emails, ever.
 */
import { Pool } from 'pg'
import { calculateStandings } from '@core/index'
import {
  PlayerRepository,
  GroupRepository,
  TournamentRepository,
  KnockoutRepository,
  TournamentRow,
} from '../db'
import { buildRankReason, type RankReasonRow } from './rank-reason'
import type { IBroadcastBus } from '../broadcast-bus'

export interface AssistantToolContext {
  db: Pool
  playerId: string
  groupId: string
  groupLinkedTournamentIds: string[]
  /**
   * Present when the tool runs from a live turn (handleAssistantJob) so
   * propose_* tools can emit message.created for the card they draft — a
   * card's INSERT has no other route/service to do this for it (B7 fix:
   * without this, cards only ever appeared on the next full history fetch).
   */
  broadcastBus?: IBroadcastBus
}

/** Phase A registry: read-only, no write tools (structural guarantee). */
export const ASSISTANT_TOOL_NAMES = [
  'get_my_matches',
  'get_standings',
  'get_bracket',
  'get_tournament',
] as const

export interface ToolNotFound {
  error: 'not_found'
  message: string
}

function notFound(): ToolNotFound {
  return { error: 'not_found', message: 'Tournament not found' }
}

export async function buildAssistantToolContext(
  db: Pool,
  input: { playerId: string; groupId: string; broadcastBus?: IBroadcastBus }
): Promise<AssistantToolContext> {
  const res = await db.query(
    `SELECT id FROM public.tournaments WHERE group_id = $1 AND deleted_at IS NULL`,
    [input.groupId]
  )
  return {
    db,
    playerId: input.playerId,
    groupId: input.groupId,
    groupLinkedTournamentIds: res.rows.map((r: { id: string }) => r.id),
    broadcastBus: input.broadcastBus,
  }
}

type Scope = 'group' | 'own'

/**
 * The authorization wall: a tournament is reachable only when group-linked
 * ('group' — full detail) or the asker is registered ('own' — minimal detail).
 */
async function resolveScope(
  ctx: AssistantToolContext,
  tournamentId: string
): Promise<{ scope: Scope; tournament: TournamentRow } | null> {
  const tournament = await new TournamentRepository(ctx.db).findById(tournamentId)
  if (!tournament || tournament.deleted_at) return null

  if (ctx.groupLinkedTournamentIds.includes(tournamentId)) {
    return { scope: 'group', tournament }
  }
  const registration = await new PlayerRepository(ctx.db).findRegistration(ctx.playerId, tournamentId)
  return registration ? { scope: 'own', tournament } : null
}

// ── get_my_matches ───────────────────────────────────────────────────────────

export interface MyMatch {
  tournamentId: string
  tournamentName: string
  matchId: string
  opponentName: string
  status: string
  score: string | null
}

export async function getMyMatches(
  ctx: AssistantToolContext,
  input: { tournamentId?: string }
): Promise<{ matches: MyMatch[] } | ToolNotFound> {
  const playerRepo = new PlayerRepository(ctx.db)
  const groupRepo = new GroupRepository(ctx.db)
  const tournamentRepo = new TournamentRepository(ctx.db)

  // Scope union: group-linked + everything the asker is registered in
  const registered = await playerRepo.listTournamentsByPlayer(ctx.playerId, { limit: 100 })
  const byId = new Map<string, TournamentRow>()
  for (const t of registered.rows) byId.set(t.id, t)
  for (const id of ctx.groupLinkedTournamentIds) {
    if (!byId.has(id)) {
      const t = await tournamentRepo.findById(id)
      if (t && !t.deleted_at) byId.set(id, t)
    }
  }

  let tournaments = Array.from(byId.values())
  if (input.tournamentId !== undefined) {
    if (!byId.has(input.tournamentId)) return notFound()
    tournaments = [byId.get(input.tournamentId)!]
  }

  const matches: MyMatch[] = []
  for (const tournament of tournaments) {
    const rows =
      tournament.match_format === 'doubles'
        ? await groupRepo.findMatchesByPlayerForDoubles(tournament.id, ctx.playerId)
        : await groupRepo.findMatchesByPlayer(tournament.id, ctx.playerId)
    for (const row of rows as any[]) {
      matches.push({
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        matchId: row.id,
        opponentName: opponentNameFor(row, ctx.playerId, tournament.match_format),
        status: row.status,
        score: row.score ?? null,
      })
    }
  }
  return { matches }
}

function opponentNameFor(row: any, playerId: string, matchFormat: string): string {
  if (matchFormat === 'doubles') {
    const askerInTeam1 = row.t1_player1_id === playerId || row.t1_player2_id === playerId
    return askerInTeam1
      ? `${row.player3_name} & ${row.player4_name}`
      : `${row.player1_name} & ${row.player2_name}`
  }
  return row.player1_id === playerId ? row.player2_name : row.player1_name
}

// ── get_standings ────────────────────────────────────────────────────────────

export interface StandingEntry {
  rank: number
  name: string
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  rankReason?: string
}

export async function getStandings(
  ctx: AssistantToolContext,
  input: { tournamentId: string }
): Promise<{ tournamentId: string; groups: Array<{ groupName: string; standings: StandingEntry[] }> } | ToolNotFound> {
  const resolved = await resolveScope(ctx, input.tournamentId)
  if (!resolved) return notFound()
  const { scope, tournament } = resolved

  const groupRepo = new GroupRepository(ctx.db)
  const stageGroups = await groupRepo.findGroupsByTournament(tournament.id)
  const groups: Array<{ groupName: string; standings: StandingEntry[] }> = []

  for (const stageGroup of stageGroups) {
    const matches = await groupRepo.findMatchesByGroup(stageGroup.id)

    // Participants: players (singles) or teams (doubles) — same as the standings route
    let participants: Array<{ id: string; name: string }>
    let askerParticipantIds: string[]
    if (tournament.match_format === 'doubles') {
      const teams = await groupRepo.findTeamsByGroup(stageGroup.id)
      participants = teams.map((t: any) => ({ id: t.id, name: `${t.player1_name} & ${t.player2_name}` }))
      askerParticipantIds = teams
        .filter((t: any) => t.player1_id === ctx.playerId || t.player2_id === ctx.playerId)
        .map((t: any) => t.id)
    } else {
      const members = await groupRepo.findMembersByGroup(stageGroup.id)
      participants = members.map(m => ({ id: m.id, name: m.name }))
      askerParticipantIds = members.filter(m => m.id === ctx.playerId).map(m => m.id)
    }

    const matchData = matches.map(m => ({
      participant1Id: (m.player1_id ?? m.team1_id)!,
      participant2Id: (m.player2_id ?? m.team2_id)!,
      winnerId: m.winner_id ?? null,
      score: m.score ?? null,
    }))
    const standings = calculateStandings(participants, matchData)

    const nameById = new Map(participants.map(p => [p.id, p.name]))
    const entries: StandingEntry[] = standings.map(s => ({
      rank: s.rank,
      name: nameById.get(s.participantId) ?? 'Unknown',
      wins: s.wins,
      losses: s.losses,
      setsWon: s.setsWon,
      setsLost: s.setsLost,
    }))

    if (scope === 'group') {
      // Full standings with the precomputed rank explanation (T1.2)
      const headToHead = new Map<string, number>()
      for (const m of matchData) {
        if (!m.winnerId) continue
        const loser = m.winnerId === m.participant1Id ? m.participant2Id : m.participant1Id
        const key = `${m.winnerId}|${loser}`
        headToHead.set(key, (headToHead.get(key) ?? 0) + 1)
      }
      const reasonRows: RankReasonRow[] = standings.map(s => ({
        participantId: s.participantId,
        name: nameById.get(s.participantId) ?? 'Unknown',
        rank: s.rank,
        wins: s.wins,
        setsWon: s.setsWon,
      }))
      const reasons = buildRankReason(reasonRows, headToHead)
      reasons.forEach((reason, i) => {
        entries[i].rankReason = reason
      })
      groups.push({ groupName: stageGroup.name, standings: entries })
    } else {
      // 'own': minimal detail — the asker's own row(s) only, no other names
      const askerRows = standings
        .map((s, i) => ({ s, entry: entries[i] }))
        .filter(({ s }) => askerParticipantIds.includes(s.participantId))
        .map(({ entry }) => entry)
      if (askerRows.length > 0) {
        groups.push({ groupName: stageGroup.name, standings: askerRows })
      }
    }
  }

  return { tournamentId: tournament.id, groups }
}

// ── get_bracket ──────────────────────────────────────────────────────────────

export async function getBracket(
  ctx: AssistantToolContext,
  input: { tournamentId: string }
): Promise<
  | {
      tournamentId: string
      matches: Array<{
        round: number
        position: number
        player1Name: string | null
        player2Name: string | null
        winnerName: string | null
        score: string | null
        status: string
      }>
    }
  | ToolNotFound
> {
  const resolved = await resolveScope(ctx, input.tournamentId)
  if (!resolved) return notFound()

  const knockoutRepo = new KnockoutRepository(ctx.db)
  const rows = await knockoutRepo.findKnockoutMatchesByTournament(input.tournamentId)

  // Resolve player display names in one query (team brackets keep ids unnamed)
  const playerIds = Array.from(
    new Set(rows.flatMap(r => [r.player1_id, r.player2_id, r.winner_id]).filter((id): id is string => !!id))
  )
  const nameById = new Map<string, string>()
  if (playerIds.length > 0) {
    const res = await ctx.db.query(`SELECT id, name FROM public.players WHERE id = ANY($1)`, [playerIds])
    for (const row of res.rows as Array<{ id: string; name: string }>) nameById.set(row.id, row.name)
  }

  return {
    tournamentId: input.tournamentId,
    matches: rows.map(r => ({
      round: r.round,
      position: r.position,
      player1Name: r.player1_id ? (nameById.get(r.player1_id) ?? null) : null,
      player2Name: r.player2_id ? (nameById.get(r.player2_id) ?? null) : null,
      winnerName: r.winner_id ? (nameById.get(r.winner_id) ?? null) : null,
      score: r.score ?? null,
      status: r.status,
    })),
  }
}

// ── get_tournament ───────────────────────────────────────────────────────────

export async function getTournament(
  ctx: AssistantToolContext,
  input: { tournamentId: string }
): Promise<
  | {
      id: string
      name: string
      sport: string
      status: string
      mode: string
      matchFormat: string
      registrationDeadline: string | null
      groupStageDeadline: string | null
      knockoutStageDeadline: string | null
    }
  | ToolNotFound
> {
  const resolved = await resolveScope(ctx, input.tournamentId)
  if (!resolved) return notFound()
  const t = resolved.tournament

  return {
    id: t.id,
    name: t.name,
    sport: t.sport,
    status: t.status,
    mode: t.mode,
    matchFormat: t.match_format,
    registrationDeadline: toIso(t.registration_deadline),
    groupStageDeadline: toIso(t.group_stage_deadline),
    knockoutStageDeadline: toIso(t.knockout_stage_deadline),
  }
}

function toIso(value: string | null): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}
