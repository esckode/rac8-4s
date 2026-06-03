import { calculateStandings } from '@core/index'
import { GroupRepository } from '../db'
import type { JobQueue } from '@worker/job-queue'
import type { StandingsCache } from '../standings-cache'
import type { BroadcastBus } from '../broadcast-bus'
import { getLogger } from '../logger'

const log = getLogger('standings-processor')

interface StandsProcessorDeps {
  groupRepo: GroupRepository
  jobQueue?: JobQueue
  standingsCache?: StandingsCache
  broadcastBus?: BroadcastBus
}

export async function processStandingsRecalculate(
  payload: { tournamentId: string; groupId: string },
  deps: StandsProcessorDeps
) {
  const { tournamentId, groupId } = payload

  try {
    deps.standingsCache?.clear(groupId)

    const members = await deps.groupRepo.findMembersByGroup(groupId)
    const matches = await deps.groupRepo.findMatchesByGroup(groupId)

    const participants = members.map(m => ({ id: m.id, name: m.name }))
    const matchData = matches.map(m => ({
      participant1Id: m.player1_id,
      participant2Id: m.player2_id,
      winnerId: m.winner_id ?? null,
      score: m.score ?? null,
    }))

    const standings = calculateStandings(participants, matchData)

    deps.standingsCache?.set(groupId, standings)

    deps.broadcastBus?.emit(tournamentId, 'standings.updated', { groupId, standings })

    log.info('standings.recalculated', { tournamentId, groupId })

    return standings
  } catch (error) {
    log.error('standings.recalculate.failed', {
      tournamentId,
      groupId,
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
