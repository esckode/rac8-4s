/**
 * Weekly digest sweep (Phase C / T3.2 — design §11 C-Q11; Personalization
 * P1b reworks the schedule — design §3.1 ⚖).
 *
 * Unlike nudges/recap (per-tournament), the digest is per-GROUP: it
 * aggregates across every tournament linked to that chat group. Gating
 * (C-Q1): assistant_enabled AND digest_enabled (opt-in, default false).
 * Weekly dedupe via an iso-week metadata marker
 * (`{nudge: 'digest:<groupId>:<isoWeek>'}`) — not subject to the nudge cap
 * (recap/digest are frequency-bounded by construction).
 *
 * Runs on the SAME hourly tick as the nudge/recap sweeps (not weekly) — each
 * tick checks whether it is currently Sunday ~09:00 in the group's effective
 * timezone (P1b: owner pin > member majority), falling back to Sunday 18:00
 * UTC when the group has no derivable timezone at all. The iso-week marker
 * means only the first tick that satisfies the window posts.
 *
 * "Results this week": no scored_at column exists — status IN
 * ('completed','walkover') AND updated_at >= now() - 7 days is the accepted
 * proxy (an edited score re-surfaces in the next digest).
 */
import { Pool } from 'pg'
import { calculateStandings } from '@core/index'
import type { IBroadcastBus } from '../broadcast-bus'
import { GroupRepository as StageGroupRepository, GroupMatchRow } from '../db'
import { GroupMessageRepository } from '../repositories/group-message-repository'
import { StandingsSnapshotRepository } from '../repositories/standings-snapshot-repository'
import { proactiveMarkerExists } from '../assistant/proactive-marker'
import { buildDigest, type DigestResult, type DigestUpcomingDeadline } from '../assistant/digest'
import { resolveEffectiveGroupTimezone } from '../group-timezone'
import { getLogger } from '../logger'

const log = getLogger('digest-processor')

/** True when `now` falls in the group's weekly digest window (~Sunday 09:00 local). */
export function isDigestWindow(now: Date, effectiveTz: string | null): boolean {
  if (effectiveTz === null) {
    return now.getUTCDay() === 0 && now.getUTCHours() === 18
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: effectiveTz,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const weekday = parts.find(p => p.type === 'weekday')?.value
  const hourStr = parts.find(p => p.type === 'hour')?.value
  const hour = hourStr !== undefined ? parseInt(hourStr, 10) % 24 : -1
  return weekday === 'Sun' && hour === 9
}

const TERMINAL_STATUSES = ['completed', 'tournament_complete', 'abandoned']

export interface DigestSweepDeps {
  pool: Pool
  broadcastBus?: IBroadcastBus
  now?: Date
}

/** ISO-8601 week string, e.g. "2026-W28" — fixed-UTC (C-Q11). */
export function isoWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11-13 -> "11th"/"12th"/"13th", else "Nth". */
function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

interface DueGroupRow {
  id: string
  name: string
}

interface GroupTournamentRow {
  id: string
  name: string
  match_format: 'singles' | 'doubles'
  status: string
  group_stage_deadline: string | null
}

/**
 * P11 — writes this week's standings snapshot for a SINGLES tournament
 * (compose from repo data + calculateStandings — the C0 pin applies, never
 * the asker-scoped tools) and returns a movement line per player whose rank
 * differs from last week's snapshot. Doubles is out of scope (migration
 * 055's FK is to players directly — a team id has no players row).
 */
async function writeSnapshotAndComputeMovements(
  stageGroupRepo: StageGroupRepository,
  snapshotRepo: StandingsSnapshotRepository,
  tournament: { id: string; match_format: 'singles' | 'doubles' },
  week: string,
  previousWeek: string
): Promise<string[]> {
  if (tournament.match_format === 'doubles') return []

  const stageGroups = await stageGroupRepo.findGroupsByTournament(tournament.id)
  const participants: Array<{ id: string; name: string }> = []
  const matches: Array<{ participant1Id: string; participant2Id: string; winnerId: string | null; score: string | null }> = []

  for (const stageGroup of stageGroups) {
    const members = await stageGroupRepo.findMembersByGroup(stageGroup.id)
    for (const m of members) participants.push({ id: m.id, name: m.name })

    const groupMatches = await stageGroupRepo.findMatchesByGroup(stageGroup.id)
    for (const gm of groupMatches as GroupMatchRow[]) {
      if (!gm.player1_id || !gm.player2_id) continue
      matches.push({
        participant1Id: gm.player1_id,
        participant2Id: gm.player2_id,
        winnerId: gm.winner_id ?? null,
        score: gm.score ?? null,
      })
    }
  }

  if (participants.length === 0) return []

  const standings = calculateStandings(participants, matches)
  const nameById = new Map(participants.map(p => [p.id, p.name]))

  const movements: string[] = []
  for (const s of standings) {
    const previous = await snapshotRepo.getSnapshot(tournament.id, s.participantId, previousWeek)
    await snapshotRepo.writeSnapshot(s.participantId, {
      tournamentId: tournament.id,
      isoWeek: week,
      rank: s.rank,
      wins: s.wins,
      setsWon: s.setsWon,
    })

    if (previous && previous.rank !== s.rank) {
      const diff = previous.rank - s.rank
      const arrow = diff > 0 ? '↑' : '↓'
      const name = nameById.get(s.participantId) ?? 'Unknown'
      movements.push(`${name} ${arrow}${Math.abs(diff)} to ${ordinal(s.rank)}`)
    }
  }

  return movements
}

async function composeGroupDigestData(
  pool: Pool,
  stageGroupRepo: StageGroupRepository,
  snapshotRepo: StandingsSnapshotRepository,
  groupId: string,
  week: string,
  previousWeek: string,
  weekStart: Date,
  now: Date
): Promise<{
  resultsThisWeek: DigestResult[]
  pendingCount: number
  upcomingDeadline: DigestUpcomingDeadline | null
  rankMovements: string[]
}> {
  const tournaments = await pool.query(
    `SELECT id, name, match_format, status, group_stage_deadline
     FROM public.tournaments WHERE group_id = $1 AND deleted_at IS NULL`,
    [groupId]
  )

  const resultsThisWeek: DigestResult[] = []
  let pendingCount = 0
  let upcomingDeadline: DigestUpcomingDeadline | null = null
  const rankMovements: string[] = []

  for (const t of tournaments.rows as GroupTournamentRow[]) {
    const stageGroups = await stageGroupRepo.findGroupsByTournament(t.id)
    for (const stageGroup of stageGroups) {
      const matches = await stageGroupRepo.findMatchesByGroup(stageGroup.id)
      pendingCount += matches.filter((m: GroupMatchRow) => m.status === 'pending').length

      const completedThisWeek = matches.filter(
        (m: GroupMatchRow) =>
          (m.status === 'completed' || m.status === 'walkover') && new Date(m.updated_at) >= weekStart
      )
      if (completedThisWeek.length === 0) continue

      const members = t.match_format === 'doubles' ? [] : await stageGroupRepo.findMembersByGroup(stageGroup.id)
      const teams = t.match_format === 'doubles' ? await stageGroupRepo.findTeamsByGroup(stageGroup.id) : []
      const nameById = new Map<string, string>()
      for (const m of members) nameById.set(m.id, m.name)
      for (const team of teams as any[]) nameById.set(team.id, `${team.player1_name} & ${team.player2_name}`)

      for (const m of completedThisWeek) {
        const p1 = (m.player1_id ?? m.team1_id)!
        const p2 = (m.player2_id ?? m.team2_id)!
        resultsThisWeek.push({
          player1Name: nameById.get(p1) ?? 'Unknown',
          player2Name: nameById.get(p2) ?? 'Unknown',
          score: m.score ?? '',
        })
      }
    }

    if (t.group_stage_deadline && !TERMINAL_STATUSES.includes(t.status)) {
      const hoursRemaining = (new Date(t.group_stage_deadline).getTime() - now.getTime()) / 3_600_000
      if (hoursRemaining > 0 && (upcomingDeadline === null || hoursRemaining < upcomingDeadline.hoursRemaining)) {
        upcomingDeadline = { tournamentName: t.name, hoursRemaining }
      }
    }

    if (!TERMINAL_STATUSES.includes(t.status)) {
      rankMovements.push(...await writeSnapshotAndComputeMovements(stageGroupRepo, snapshotRepo, t, week, previousWeek))
    }
  }

  return { resultsThisWeek, pendingCount, upcomingDeadline, rankMovements }
}

export async function processDigestSweep(deps: DigestSweepDeps): Promise<void> {
  const { pool, broadcastBus, now = new Date() } = deps
  const stageGroupRepo = new StageGroupRepository(pool as any)
  const groupMessageRepo = new GroupMessageRepository(pool as any)
  const snapshotRepo = new StandingsSnapshotRepository(pool as any)

  const weekStart = new Date(now.getTime() - 7 * 24 * 3_600_000)
  const week = isoWeekString(now)
  const previousWeek = isoWeekString(weekStart)

  const due = await pool.query(
    `SELECT id, name FROM public.player_groups WHERE assistant_enabled = true AND digest_enabled = true`
  )

  for (const g of due.rows as DueGroupRow[]) {
    const groupId = g.id

    const effectiveTz = await resolveEffectiveGroupTimezone(pool, groupId)
    if (!isDigestWindow(now, effectiveTz)) continue

    const marker = `digest:${groupId}:${week}`
    if (await proactiveMarkerExists(pool, groupId, marker)) continue

    const { resultsThisWeek, pendingCount, upcomingDeadline, rankMovements } = await composeGroupDigestData(
      pool,
      stageGroupRepo,
      snapshotRepo,
      groupId,
      week,
      previousWeek,
      weekStart,
      now
    )

    const body = buildDigest(g.name, resultsThisWeek, pendingCount, upcomingDeadline, rankMovements)
    if (body === null) continue

    const { message, conversationId } = await groupMessageRepo.sendAssistantMessage({
      groupId,
      body,
      metadata: { nudge: marker },
    })

    if (broadcastBus) {
      broadcastBus.emit(conversationId, 'message.created', {
        id: message.id,
        conversationId,
        groupId,
        playerId: null,
        senderName: message.senderName,
        body: message.body,
        type: message.type,
        createdAt: message.createdAt,
      })
    }

    log.info('assistant.digested', {
      groupId,
      marker,
      effectiveTz,
      resultsCount: resultsThisWeek.length,
      pendingCount,
      hasDeadline: upcomingDeadline !== null,
      movementCount: rankMovements.length,
    })
  }
}
