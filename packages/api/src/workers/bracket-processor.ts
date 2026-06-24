import { calculateStandings, generateBracket } from '@core/index'
import { GroupRepository, KnockoutRepository } from '../db'
import type { JobQueue } from '@worker/job-queue'
import type { BroadcastBus } from '../broadcast-bus'
import { getLogger } from '../logger'

const log = getLogger('bracket-processor')

interface BracketProcessorDeps {
  groupRepo: GroupRepository
  knockoutRepo: KnockoutRepository
  jobQueue?: JobQueue
  broadcastBus?: BroadcastBus
}

export async function processBracketGenerate(
  payload: { tournamentId: string; conversationId?: string },
  deps: BracketProcessorDeps
) {
  const { tournamentId, conversationId } = payload

  try {
    const pendingCount = await deps.groupRepo.countPendingMatchesByTournament(tournamentId)
    if (pendingCount > 0) {
      throw new Error(`group stage not complete: ${pendingCount} matches pending`)
    }

    const existing = await deps.knockoutRepo.findKnockoutMatchesByTournament(tournamentId)
    if (existing.length > 0) {
      log.info('bracket.already.exists', { tournamentId, matchCount: existing.length })
      return existing
    }

    const groups = await deps.groupRepo.findGroupsByTournament(tournamentId)
    if (groups.length === 0) {
      throw new Error('no groups found for tournament')
    }

    const seeds: Array<{ playerId: string; seedPosition: number }> = []
    let seedPos = 1
    const maxAdvancing = Math.max(...groups.map(g => g.advancing_count))

    if (maxAdvancing === 0) {
      throw new Error('no players advancing from groups')
    }

    for (let rank = 0; rank < maxAdvancing; rank++) {
      for (const group of groups) {
        if (rank >= group.advancing_count) continue
        const members = await deps.groupRepo.findMembersByGroup(group.id)
        const matches = await deps.groupRepo.findMatchesByGroup(group.id)
        const participants = members.map(m => ({ id: m.id, name: m.name }))
        const matchData = matches.map(m => ({
          participant1Id: m.player1_id!,
          participant2Id: m.player2_id!,
          winnerId: m.winner_id ?? null,
          score: m.score ?? null,
        }))
        const standings = calculateStandings(participants, matchData)
        if (standings[rank]) {
          seeds.push({ playerId: standings[rank].participantId, seedPosition: seedPos++ })
        }
      }
    }

    const bracket = generateBracket(seeds.length)

    await deps.knockoutRepo.setSeeds(tournamentId, seeds)

    const seedMap = new Map(seeds.map(s => [s.seedPosition, s.playerId]))
    const matches = await deps.knockoutRepo.createKnockoutMatches(tournamentId, bracket, seedMap)

    const busKey = conversationId ?? tournamentId
    deps.broadcastBus?.emit(busKey, 'bracket.published', { matchCount: matches.length, byeCount: bracket.byeCount })

    log.info('bracket.generated', { tournamentId, matchCount: matches.length, byeCount: bracket.byeCount })

    return matches
  } catch (error) {
    log.error('bracket.generate.failed', {
      tournamentId,
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
