/**
 * Player snapshot — 1:1 Coach cost lever 2 (COACH_1TO1_DESIGN.md §7 #3, §0.5b).
 *
 * A deterministic ~300-token plain-text block injected into every coach turn
 * so most coaching questions ("when do I play next?", "how am I doing?")
 * need zero tool rounds: next pending match, per-tournament standings +
 * rank_reason, last-5 completed results. Derive, don't remember — same
 * philosophy as rank_reason itself (T1.2).
 *
 * Split like buildNudgeBody/buildDigest: formatPlayerSnapshot is the pure,
 * unit-tested text composer; buildPlayerSnapshot is the async orchestrator
 * that fetches through the coach tool context's repos and calls it.
 */
import { calculateStandings } from '@core/index'
import { PlayerRepository, GroupRepository, TournamentRepository, TournamentRow } from '../db'
import { buildRankReason, type RankReasonRow } from './rank-reason'
import { opponentNameFor, type AssistantToolContext } from './tools'

const MAX_LAST_RESULTS = 5
const TERMINAL_STATUSES = ['completed', 'tournament_complete', 'abandoned']

export interface PlayerSnapshotData {
  nextMatch: { opponentName: string; tournamentName: string; deadline: string | null } | null
  standingsRows: Array<{ tournamentName: string; rank: number; wins: number; losses: number; rankReason: string }>
  lastResults: Array<{ opponentName: string; score: string; won: boolean }>
}

/** Pure text composer — deterministic given the same data, no DB/LLM involved. */
export function formatPlayerSnapshot(data: PlayerSnapshotData): string {
  const lines: string[] = []

  if (data.nextMatch) {
    const deadlinePart = data.nextMatch.deadline ? `, deadline ${data.nextMatch.deadline}` : ''
    lines.push(`Next match: vs ${data.nextMatch.opponentName} (${data.nextMatch.tournamentName})${deadlinePart}`)
  } else {
    lines.push('Next match: no upcoming match scheduled')
  }

  if (data.standingsRows.length > 0) {
    lines.push('Standings:')
    for (const row of data.standingsRows) {
      lines.push(`- ${row.tournamentName}: rank ${row.rank} (${row.wins}-${row.losses}) — ${row.rankReason}`)
    }
  }

  lines.push('Last results:')
  if (data.lastResults.length > 0) {
    for (const r of data.lastResults) {
      lines.push(`- ${r.won ? 'W' : 'L'} vs ${r.opponentName} ${r.score}`)
    }
  } else {
    lines.push('no results yet')
  }

  return lines.join('\n')
}

/**
 * Async orchestrator: gathers next-match / standings / last-5-results data
 * through the coach tool context's repos (mirrors tools.ts's own internal
 * composition — repo methods + calculateStandings + buildRankReason — but
 * scoped uniformly through ctx per S3), then formats it.
 */
export async function buildPlayerSnapshot(ctx: AssistantToolContext): Promise<string> {
  const playerRepo = new PlayerRepository(ctx.db)
  const groupRepo = new GroupRepository(ctx.db)
  const tournamentRepo = new TournamentRepository(ctx.db)

  // Union of tournaments — same shape as getMyMatches's internal union.
  const registered = await playerRepo.listTournamentsByPlayer(ctx.playerId, { limit: 100 })
  const byId = new Map<string, TournamentRow>()
  for (const t of registered.rows) byId.set(t.id, t)
  for (const id of ctx.groupLinkedTournamentIds) {
    if (!byId.has(id)) {
      const t = await tournamentRepo.findById(id)
      if (t && !t.deleted_at) byId.set(id, t)
    }
  }
  const tournaments = Array.from(byId.values())

  let nextMatch: PlayerSnapshotData['nextMatch'] = null
  const standingsRows: PlayerSnapshotData['standingsRows'] = []
  const completedResults: Array<{ opponentName: string; score: string; won: boolean; completedAt: Date }> = []

  for (const tournament of tournaments) {
    const rows =
      tournament.match_format === 'doubles'
        ? await groupRepo.findMatchesByPlayerForDoubles(tournament.id, ctx.playerId)
        : await groupRepo.findMatchesByPlayer(tournament.id, ctx.playerId)

    for (const row of rows as any[]) {
      const opponentName = opponentNameFor(row, ctx.playerId, tournament.match_format)
      if (row.status === 'completed' && row.score) {
        completedResults.push({
          opponentName,
          score: row.score,
          won: row.winner_id === ctx.playerId,
          completedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at ?? row.created_at),
        })
      } else if (!nextMatch) {
        nextMatch = {
          opponentName,
          tournamentName: tournament.name,
          deadline: tournament.group_stage_deadline ? new Date(tournament.group_stage_deadline).toISOString() : null,
        }
      }
    }

    if (!TERMINAL_STATUSES.includes(tournament.status)) {
      const reasonRow = await buildStandingsRow(ctx, groupRepo, tournament)
      if (reasonRow) standingsRows.push(reasonRow)
    }
  }

  completedResults.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
  const lastResults = completedResults
    .slice(0, MAX_LAST_RESULTS)
    .map(({ opponentName, score, won }) => ({ opponentName, score, won }))

  return formatPlayerSnapshot({ nextMatch, standingsRows, lastResults })
}

async function buildStandingsRow(
  ctx: AssistantToolContext,
  groupRepo: GroupRepository,
  tournament: TournamentRow
): Promise<PlayerSnapshotData['standingsRows'][number] | null> {
  const stageGroups = await groupRepo.findGroupsByTournament(tournament.id)

  for (const stageGroup of stageGroups) {
    const matches = await groupRepo.findMatchesByGroup(stageGroup.id)

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

    if (askerParticipantIds.length === 0) continue // asker not in this stage group

    const matchData = matches.map(m => ({
      participant1Id: (m.player1_id ?? m.team1_id)!,
      participant2Id: (m.player2_id ?? m.team2_id)!,
      winnerId: m.winner_id ?? null,
      score: m.score ?? null,
    }))
    const standings = calculateStandings(participants, matchData)

    const nameById = new Map(participants.map(p => [p.id, p.name]))
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

    const askerIndex = standings.findIndex(s => askerParticipantIds.includes(s.participantId))
    if (askerIndex === -1) continue
    const askerStanding = standings[askerIndex]

    return {
      tournamentName: tournament.name,
      rank: askerStanding.rank,
      wins: askerStanding.wins,
      losses: askerStanding.losses,
      rankReason: reasons[askerIndex],
    }
  }

  return null
}
