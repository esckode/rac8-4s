/**
 * Weekly digest sweep (Phase C / T3.2 — design §11 C-Q11).
 *
 * Unlike nudges/recap (per-tournament), the digest is per-GROUP: it
 * aggregates across every tournament linked to that chat group. Gating
 * (C-Q1): assistant_enabled AND digest_enabled (opt-in, default false).
 * Weekly dedupe via an iso-week metadata marker
 * (`{nudge: 'digest:<groupId>:<isoWeek>'}`) — not subject to the nudge cap
 * (recap/digest are frequency-bounded by construction).
 *
 * "Results this week": no scored_at column exists — status IN
 * ('completed','walkover') AND updated_at >= now() - 7 days is the accepted
 * proxy (an edited score re-surfaces in the next digest).
 */
import { Pool } from 'pg'
import type { IBroadcastBus } from '../broadcast-bus'
import { GroupRepository as StageGroupRepository, GroupMatchRow } from '../db'
import { GroupMessageRepository } from '../repositories/group-message-repository'
import { proactiveMarkerExists } from '../assistant/proactive-marker'
import { buildDigest, type DigestResult, type DigestUpcomingDeadline } from '../assistant/digest'
import { getLogger } from '../logger'

const log = getLogger('digest-processor')

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

async function composeGroupDigestData(
  pool: Pool,
  stageGroupRepo: StageGroupRepository,
  groupId: string,
  weekStart: Date,
  now: Date
): Promise<{ resultsThisWeek: DigestResult[]; pendingCount: number; upcomingDeadline: DigestUpcomingDeadline | null }> {
  const tournaments = await pool.query(
    `SELECT id, name, match_format, status, group_stage_deadline
     FROM public.tournaments WHERE group_id = $1 AND deleted_at IS NULL`,
    [groupId]
  )

  const resultsThisWeek: DigestResult[] = []
  let pendingCount = 0
  let upcomingDeadline: DigestUpcomingDeadline | null = null

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
  }

  return { resultsThisWeek, pendingCount, upcomingDeadline }
}

export async function processDigestSweep(deps: DigestSweepDeps): Promise<void> {
  const { pool, broadcastBus, now = new Date() } = deps
  const stageGroupRepo = new StageGroupRepository(pool as any)
  const groupMessageRepo = new GroupMessageRepository(pool as any)

  const week = isoWeekString(now)
  const weekStart = new Date(now.getTime() - 7 * 24 * 3_600_000)

  const due = await pool.query(
    `SELECT id, name FROM public.player_groups WHERE assistant_enabled = true AND digest_enabled = true`
  )

  for (const g of due.rows as DueGroupRow[]) {
    const groupId = g.id
    const marker = `digest:${groupId}:${week}`
    if (await proactiveMarkerExists(pool, groupId, marker)) continue

    const { resultsThisWeek, pendingCount, upcomingDeadline } = await composeGroupDigestData(
      pool,
      stageGroupRepo,
      groupId,
      weekStart,
      now
    )

    const body = buildDigest(g.name, resultsThisWeek, pendingCount, upcomingDeadline)
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
      resultsCount: resultsThisWeek.length,
      pendingCount,
      hasDeadline: upcomingDeadline !== null,
    })
  }
}
