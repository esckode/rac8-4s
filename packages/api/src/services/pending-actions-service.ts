/**
 * Player Personalization P5 — pending-actions aggregation.
 *
 * All four facts already exist in the DB; this is read-only aggregation
 * across existing repos, never new state. Caller-scoped only: every query
 * below is keyed off the caller's own playerId (registrations, group
 * memberships, own vote absence, own card proposals) — there is no
 * groupId/tournamentId input, so there is no cross-player leakage surface.
 */
import { Pool } from 'pg'
import { PlayerRepository, GroupRepository as StageGroupRepository, TournamentRow } from '../db'
import { GroupRepository as PlayerGroupRepository } from '../repositories/group-repository'
import { PollRepository } from '../repositories/poll-repository'
import { AssistantCardRepository } from '../repositories/assistant-card-repository'

const TERMINAL_STATUSES = ['completed', 'tournament_complete', 'abandoned']

export interface PendingMatch {
  tournamentId: string
  tournamentName: string
  matchId: string
  opponentName: string
}

export interface PendingPoll {
  groupId: string
  groupName: string
  pollId: string
  question: string
}

export interface PendingCard {
  groupId: string
  groupName: string
  cardId: string
  action: string
}

export interface NearestDeadline {
  tournamentId: string
  tournamentName: string
  deadline: string
}

export interface PendingActions {
  unscoredMatches: PendingMatch[]
  openPolls: PendingPoll[]
  pendingCards: PendingCard[]
  nearestDeadline: NearestDeadline | null
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

function nearestFutureDeadline(tournament: TournamentRow, now: Date): string | null {
  const candidates = [
    tournament.registration_deadline,
    tournament.group_stage_deadline,
    tournament.knockout_stage_deadline,
  ].filter((d): d is string => d !== null && new Date(d).getTime() > now.getTime())
  if (candidates.length === 0) return null
  return candidates.reduce((soonest, d) => (new Date(d) < new Date(soonest) ? d : soonest))
}

export async function getPendingActions(pool: Pool, playerId: string): Promise<PendingActions> {
  const playerRepo = new PlayerRepository(pool)
  const stageGroupRepo = new StageGroupRepository(pool)
  const playerGroupRepo = new PlayerGroupRepository(pool)
  const pollRepo = new PollRepository(pool)
  const cardRepo = new AssistantCardRepository(pool)

  const now = new Date()

  const { rows: tournaments } = await playerRepo.listTournamentsByPlayer(playerId, { limit: 100 })

  const unscoredMatches: PendingMatch[] = []
  let nearestDeadline: NearestDeadline | null = null

  for (const tournament of tournaments) {
    const rows =
      tournament.match_format === 'doubles'
        ? await stageGroupRepo.findMatchesByPlayerForDoubles(tournament.id, playerId)
        : await stageGroupRepo.findMatchesByPlayer(tournament.id, playerId)
    for (const row of rows as any[]) {
      if (row.status !== 'pending') continue
      unscoredMatches.push({
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        matchId: row.id,
        opponentName: opponentNameFor(row, playerId, tournament.match_format),
      })
    }

    if (TERMINAL_STATUSES.includes(tournament.status)) continue
    const deadline = nearestFutureDeadline(tournament, now)
    if (deadline && (nearestDeadline === null || new Date(deadline) < new Date(nearestDeadline.deadline))) {
      nearestDeadline = { tournamentId: tournament.id, tournamentName: tournament.name, deadline }
    }
  }

  const groups = await playerGroupRepo.getGroupsForPlayer(playerId)
  const groupNameById = new Map(groups.map(g => [g.id, g.name]))
  const groupIds = groups.map(g => g.id)

  const pollRows = await pollRepo.findOpenPollsNotVotedByPlayer(groupIds, playerId)
  const openPolls: PendingPoll[] = pollRows.map(p => ({
    groupId: p.groupId,
    groupName: groupNameById.get(p.groupId) ?? 'Unknown',
    pollId: p.pollId,
    question: p.question,
  }))

  const cardRows = await cardRepo.findPendingForProposer(playerId)
  const pendingCards: PendingCard[] = cardRows.map(c => ({
    groupId: c.groupId,
    groupName: groupNameById.get(c.groupId) ?? 'Unknown',
    cardId: c.id,
    action: c.action,
  }))

  return { unscoredMatches, openPolls, pendingCards, nearestDeadline }
}
