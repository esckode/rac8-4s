/**
 * Nudge sweep (Phase C / T3.1 — design §11 C-Q6–C-Q8).
 *
 * Scheduled, group-linked tournaments with a group_stage_deadline get a 48h
 * and (independently) a 24h reminder naming their unscored matches. Casual
 * sessions (no deadline) and non-group-linked tournaments are exempt.
 *
 * Dedupe reuses the A4 replyTo-guard pattern: a metadata marker on the
 * assistant message row (`{nudge: 'deadline48:<tournamentId>'}` /
 * `'deadline24:<tournamentId>'`) — no new state table. The ≤2
 * proactive-posts/group/day cap suppresses further nudges (recap/digest are
 * frequency-bounded by construction and don't compete for this cap).
 *
 * Standings/match composition follows the C0 data-access pin: compose
 * directly from the tournament-stage GroupRepository (public.groups /
 * group_matches) — never the asker-scoped assistant/tools.ts functions,
 * which require a live asker to apply Q5 scoping that a sweep doesn't have.
 */
import { Pool } from 'pg'
import type { JobQueue } from '@worker/job-queue'
import type { IBroadcastBus } from '../broadcast-bus'
import { GroupRepository as StageGroupRepository, GroupMatchRow } from '../db'
import { GroupRepository as PlayerGroupRepository } from '../repositories/group-repository'
import { GroupMessageRepository } from '../repositories/group-message-repository'
import { MAX_PROACTIVE_POSTS_PER_DAY, proactiveMarkerExists, proactivePostsToday } from '../assistant/proactive-marker'
import { getLogger } from '../logger'

const log = getLogger('nudge-processor')

const TERMINAL_STATUSES = ['completed', 'tournament_complete', 'abandoned']

interface Milestone {
  hours: number
  markerPrefix: 'deadline48' | 'deadline24'
  relativeLabel: string
}

const MILESTONES: Milestone[] = [
  { hours: 48, markerPrefix: 'deadline48', relativeLabel: '2 days left' },
  { hours: 24, markerPrefix: 'deadline24', relativeLabel: '1 day left' },
]

export interface NudgeSweepDeps {
  pool: Pool
  jobQueue?: JobQueue
  broadcastBus?: IBroadcastBus
  now?: Date
}

export interface PendingMatchName {
  name1: string
  name2: string
  playerIds: string[]
}

/** Pure template — nudge ≤40 words + match list (Q16 addendum), relative time only. */
export function buildNudgeBody(matches: PendingMatchName[], relativeLabel: string): string {
  const list = matches.map(m => `${m.name1} vs ${m.name2}`).join(', ')
  return `Reminder: ${list} — unscored, ${relativeLabel}.`
}

interface DueTournamentRow {
  id: string
  group_id: string
  match_format: 'singles' | 'doubles'
  group_stage_deadline: string
}

async function findUnscoredMatchNames(
  stageGroupRepo: StageGroupRepository,
  tournamentId: string,
  matchFormat: 'singles' | 'doubles'
): Promise<PendingMatchName[]> {
  const stageGroups = await stageGroupRepo.findGroupsByTournament(tournamentId)
  const results: PendingMatchName[] = []

  for (const stageGroup of stageGroups) {
    const matches = await stageGroupRepo.findMatchesByGroup(stageGroup.id)
    const pending = matches.filter((m: GroupMatchRow) => m.status === 'pending')
    if (pending.length === 0) continue

    if (matchFormat === 'doubles') {
      const teams = await stageGroupRepo.findTeamsByGroup(stageGroup.id)
      const teamById = new Map(teams.map((t: any) => [t.id, t]))
      for (const m of pending) {
        const t1 = teamById.get(m.team1_id as unknown as string)
        const t2 = teamById.get(m.team2_id as unknown as string)
        if (!t1 || !t2) continue
        results.push({
          name1: `${t1.player1_name} & ${t1.player2_name}`,
          name2: `${t2.player1_name} & ${t2.player2_name}`,
          playerIds: [t1.player1_id, t1.player2_id, t2.player1_id, t2.player2_id],
        })
      }
    } else {
      const members = await stageGroupRepo.findMembersByGroup(stageGroup.id)
      const nameById = new Map(members.map(m => [m.id, m.name]))
      for (const m of pending) {
        const p1 = m.player1_id!
        const p2 = m.player2_id!
        results.push({
          name1: nameById.get(p1) ?? 'Unknown',
          name2: nameById.get(p2) ?? 'Unknown',
          playerIds: [p1, p2],
        })
      }
    }
  }

  return results
}

export async function processNudgeSweep(deps: NudgeSweepDeps): Promise<void> {
  const { pool, jobQueue, broadcastBus, now = new Date() } = deps
  const stageGroupRepo = new StageGroupRepository(pool as any)
  const playerGroupRepo = new PlayerGroupRepository(pool as any)
  const groupMessageRepo = new GroupMessageRepository(pool as any)

  const todayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const due = await pool.query(
    `SELECT id, group_id, match_format, group_stage_deadline
     FROM public.tournaments
     WHERE group_id IS NOT NULL
       AND group_stage_deadline IS NOT NULL
       AND group_stage_deadline > $1
       AND group_stage_deadline <= $1::timestamptz + interval '48 hours'
       AND status NOT IN (${TERMINAL_STATUSES.map((_, i) => `$${i + 2}`).join(', ')})
       AND deleted_at IS NULL`,
    [now, ...TERMINAL_STATUSES]
  )

  for (const row of due.rows as DueTournamentRow[]) {
    const tournamentId = row.id
    const groupId = row.group_id
    const deadline = new Date(row.group_stage_deadline)
    const hoursRemaining = (deadline.getTime() - now.getTime()) / 3_600_000

    const toggle = await pool.query(`SELECT assistant_enabled FROM public.player_groups WHERE id = $1`, [groupId])
    if (toggle.rows[0]?.assistant_enabled !== true) continue

    for (const milestone of MILESTONES) {
      if (hoursRemaining > milestone.hours) continue

      const marker = `${milestone.markerPrefix}:${tournamentId}`
      if (await proactiveMarkerExists(pool, groupId, marker)) continue

      const pendingMatches = await findUnscoredMatchNames(stageGroupRepo, tournamentId, row.match_format)
      if (pendingMatches.length === 0) continue

      const postsToday = await proactivePostsToday(pool, groupId, todayStartUtc)
      if (postsToday >= MAX_PROACTIVE_POSTS_PER_DAY) {
        log.warn('assistant.nudge.suppressed', { groupId, tournamentId, marker, postsToday })
        continue
      }

      const body = buildNudgeBody(pendingMatches, milestone.relativeLabel)
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

      if (jobQueue) {
        const affectedPlayerIds = Array.from(new Set(pendingMatches.flatMap(m => m.playerIds)))
        const membersForNotify = await playerGroupRepo.getGroupMembersForNotify(groupId)
        const notifyLevelById = new Map(membersForNotify.map(m => [m.playerId, m.notifyLevel]))
        for (const playerId of affectedPlayerIds) {
          if (notifyLevelById.get(playerId) === 'muted') continue
          await jobQueue.add(
            'messaging.notify',
            { conversationId, groupId },
            { jobId: `notify:${marker}:${playerId}` }
          )
        }
      }

      log.info('assistant.nudged', { groupId, tournamentId, marker, matchCount: pendingMatches.length })
    }
  }
}
