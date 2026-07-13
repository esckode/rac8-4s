/**
 * Recap sweep (Phase C / T3.3 — design §11 C-Q9/C-Q10).
 *
 * Hourly sweep for group-linked tournaments in a terminal status
 * (completed/tournament_complete) with no existing recap marker. No PATCH
 * hook exists for this — status transitions happen only via the organizer's
 * generic PATCH /:id route, which emits no event — so the sweep self-heals
 * and touches zero route code.
 *
 * Template-first: winner, top-3 standings, one stat, composed directly from
 * the tournament-stage GroupRepository + calculateStandings (the C0
 * data-access pin — never the asker-scoped assistant/tools.ts functions,
 * which require a live asker for Q5 scoping that a sweep doesn't have). LLM
 * polish is attempted only when the adapter is real (not mock) AND daily
 * budget remains; ANY failure (throw, empty text) falls back to the
 * template — exactly one row posts either way, never silent, never double.
 */
import { Pool } from 'pg'
import { calculateStandings } from '@core/index'
import type { IBroadcastBus } from '../broadcast-bus'
import { GroupRepository as StageGroupRepository, GroupMatchRow } from '../db'
import { GroupMessageRepository } from '../repositories/group-message-repository'
import { proactiveMarkerExists } from '../assistant/proactive-marker'
import { buildAssistantToolContext } from '../assistant/tools'
import { buildRecap, type RecapStanding } from '../assistant/recap'
import { MockAssistantClient, type AssistantClient } from '../assistant/assistant-client'
import { AssistantRateLimiter, estimateTurnUsd } from '../assistant/rate-limiter'
import { getLogger } from '../logger'

const log = getLogger('recap-processor')

const RECAP_TERMINAL_STATUSES = ['completed', 'tournament_complete']

const RECAP_POLISH_SYSTEM_PROMPT = `You are Coach, a tennis/pickleball tournament assistant. You will be given
a tournament recap already written in full — winner, standings, and a stat.
Rewrite it to sound warm and natural in under 80 words. Do not add, remove,
or change any name, rank, or number. Do not call any tools. Reply with the
rewritten recap text only, nothing else.`

export interface RecapSweepDeps {
  pool: Pool
  client: AssistantClient
  rateLimiter: AssistantRateLimiter
  broadcastBus?: IBroadcastBus
}

interface DueTournamentRow {
  id: string
  group_id: string
  name: string
  match_format: 'singles' | 'doubles'
}

async function composeRecapData(
  stageGroupRepo: StageGroupRepository,
  tournamentId: string,
  matchFormat: 'singles' | 'doubles'
): Promise<{ standings: RecapStanding[]; completedMatchCount: number }> {
  const stageGroups = await stageGroupRepo.findGroupsByTournament(tournamentId)
  const standings: RecapStanding[] = []
  let completedMatchCount = 0

  for (const stageGroup of stageGroups) {
    const matches = await stageGroupRepo.findMatchesByGroup(stageGroup.id)
    completedMatchCount += matches.filter((m: GroupMatchRow) => m.status === 'completed' || m.status === 'walkover').length

    let participants: Array<{ id: string; name: string }>
    if (matchFormat === 'doubles') {
      const teams = await stageGroupRepo.findTeamsByGroup(stageGroup.id)
      participants = teams.map((t: any) => ({ id: t.id, name: `${t.player1_name} & ${t.player2_name}` }))
    } else {
      const members = await stageGroupRepo.findMembersByGroup(stageGroup.id)
      participants = members.map(m => ({ id: m.id, name: m.name }))
    }

    const matchData = matches.map(m => ({
      participant1Id: (m.player1_id ?? m.team1_id)!,
      participant2Id: (m.player2_id ?? m.team2_id)!,
      winnerId: m.winner_id ?? null,
      score: m.score ?? null,
    }))
    const calculated = calculateStandings(participants, matchData)
    const nameById = new Map(participants.map(p => [p.id, p.name]))
    standings.push(
      ...calculated.map(s => ({
        rank: s.rank,
        name: nameById.get(s.participantId) ?? 'Unknown',
        wins: s.wins,
        losses: s.losses,
      }))
    )
  }

  return { standings, completedMatchCount }
}

export async function processRecapSweep(deps: RecapSweepDeps): Promise<void> {
  const { pool, client, rateLimiter, broadcastBus } = deps
  const stageGroupRepo = new StageGroupRepository(pool as any)
  const groupMessageRepo = new GroupMessageRepository(pool as any)

  const due = await pool.query(
    `SELECT id, group_id, name, match_format
     FROM public.tournaments
     WHERE group_id IS NOT NULL
       AND status IN (${RECAP_TERMINAL_STATUSES.map((_, i) => `$${i + 1}`).join(', ')})
       AND deleted_at IS NULL`,
    RECAP_TERMINAL_STATUSES
  )

  for (const row of due.rows as DueTournamentRow[]) {
    const tournamentId = row.id
    const groupId = row.group_id
    const marker = `recap:${tournamentId}`

    const toggle = await pool.query(`SELECT assistant_enabled FROM public.player_groups WHERE id = $1`, [groupId])
    if (toggle.rows[0]?.assistant_enabled !== true) continue

    if (await proactiveMarkerExists(pool, groupId, marker)) continue

    const { standings, completedMatchCount } = await composeRecapData(stageGroupRepo, tournamentId, row.match_format)
    if (standings.length === 0) continue

    const templateBody = buildRecap(row.name, standings, completedMatchCount)

    let body = templateBody
    let polished = false

    if (!(client instanceof MockAssistantClient)) {
      const hasBudget = await rateLimiter.hasBudgetRemaining()
      if (hasBudget) {
        try {
          const toolContext = await buildAssistantToolContext(pool, { playerId: 'system', groupId })
          const result = await client.runTurn({
            systemPrompt: RECAP_POLISH_SYSTEM_PROMPT,
            contextBlock: templateBody,
            question: templateBody,
            toolContext,
          })
          if (result.text && result.text.trim().length > 0) {
            body = result.text.trim()
            polished = true
            await rateLimiter.recordSpend(estimateTurnUsd(result.usage))
          }
        } catch (err) {
          log.warn('assistant.recap.polish.failed', {
            groupId,
            tournamentId,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

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

    log.info('assistant.recapped', { groupId, tournamentId, marker, polished })
  }
}
