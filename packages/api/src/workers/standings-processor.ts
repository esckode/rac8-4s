import { calculateStandings } from '@core/index'
import { GroupRepository } from '../db'
import type { JobQueue } from '@worker/job-queue'
import type { StandingsCache } from '../standings-cache'
import { STANDINGS_INVALIDATION_KEY } from '../standings-cache'
import type { IBroadcastBus } from '../broadcast-bus'
import { getLogger } from '../logger'

const log = getLogger('standings-processor')

interface StandsProcessorDeps {
  groupRepo: GroupRepository
  jobQueue?: JobQueue
  standingsCache?: StandingsCache
  broadcastBus?: IBroadcastBus
}

export async function processStandingsRecalculate(
  payload: { tournamentId: string; groupId: string; conversationId?: string },
  deps: StandsProcessorDeps
) {
  const { tournamentId, groupId, conversationId } = payload

  try {
    // Publish standings.invalidate on the bus before clearing locally so that
    // all instances (including this one, via the bus subscribe callback) drop
    // the affected group from their InMemoryStandingsCache.  The local clear
    // is kept for the no-bus code path (tests / single-instance without bus).
    deps.broadcastBus?.emit(STANDINGS_INVALIDATION_KEY, 'standings.invalidate', { groupId })
    deps.standingsCache?.clear(groupId)

    const members = await deps.groupRepo.findMembersByGroup(groupId)
    const matches = await deps.groupRepo.findMatchesByGroup(groupId)

    const participants = members.map(m => ({ id: m.id, name: m.name }))
    const matchData = matches.map(m => ({
      participant1Id: m.player1_id!,
      participant2Id: m.player2_id!,
      winnerId: m.winner_id ?? null,
      score: m.score ?? null,
    }))

    const standings = calculateStandings(participants, matchData)

    deps.standingsCache?.set(groupId, standings)

    // Emit on conversation_id when available (V1.0 forward); fall back to
    // tournamentId only for callers that have not yet resolved the conversation
    // (internal direct calls without a DB-resolved conversationId).
    const busKey = conversationId ?? tournamentId
    deps.broadcastBus?.emit(busKey, 'standings.updated', { groupId, standings })

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
