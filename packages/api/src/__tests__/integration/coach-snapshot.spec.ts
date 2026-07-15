/**
 * S3.3/S3.4 — 1:1 Coach: buildPlayerSnapshot(ctx) orchestrator (RED first)
 *
 * The async DB-fetching half of the snapshot (formatPlayerSnapshot, the pure
 * text composer, is unit-tested separately in player-snapshot.spec.ts):
 * gathers next-pending-match / per-tournament standings+rank_reason / last-5
 * results through the coach tool context's repos, then formats them.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository, GroupRepository, TournamentRepository } from '../../db'
import { TournamentFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import { buildCoachToolContext } from '../../assistant/tools'
import { buildPlayerSnapshot } from '../../assistant/player-snapshot'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('S3.4 — buildPlayerSnapshot(ctx)', () => {
  let pool: Pool
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let tournamentRepo: TournamentRepository

  async function createPlayer(prefix: string): Promise<{ id: string; name: string }> {
    const email = `${prefix}-${uid()}@test.local`
    const name = `${prefix}-${uid()}`
    const p = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    return { id: p.id, name: p.name ?? name }
  }

  async function createTournamentWithRoster(roster: string[]): Promise<string> {
    const t = await TournamentFactory.create(pool, `organizer_${uid()}`)
    await tournamentRepo.updateStatus(t.id, 'group_stage_active')
    for (const playerId of roster) {
      await playerRepo.createRegistration(playerId, t.id)
    }
    await groupRepo.createGroups(t.id, 1, 2, roster)
    return t.id
  }

  async function scoreFirstMatch(tournamentId: string, winnerId: string, score: string): Promise<void> {
    const groups = await groupRepo.findGroupsByTournament(tournamentId)
    const matches = await groupRepo.findMatchesByGroup(groups[0].id)
    await groupRepo.updateMatch(matches[0].id, winnerId, score)
  }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
    groupRepo = new GroupRepository(pool)
    tournamentRepo = new TournamentRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('includes the next pending match, standings, and last completed result', async () => {
    const asker = await createPlayer('asker')
    const bob = await createPlayer('bob')
    const carol = await createPlayer('carol')

    const completedVsBob = await createTournamentWithRoster([asker.id, bob.id])
    await scoreFirstMatch(completedVsBob, asker.id, '6-4, 6-3')

    const pendingVsCarol = await createTournamentWithRoster([asker.id, carol.id])

    const ctx = await buildCoachToolContext(pool, asker.id)
    const snapshot = await buildPlayerSnapshot(ctx)

    expect(typeof snapshot).toBe('string')
    expect(snapshot).toContain(carol.name) // next pending match
    expect(snapshot).toContain(bob.name) // last result / standings
    expect(snapshot.length).toBeLessThan(1500)
  })

  it('is deterministic: two calls against the same data are byte-identical', async () => {
    const asker = await createPlayer('asker')
    const bob = await createPlayer('bob')
    const tourn = await createTournamentWithRoster([asker.id, bob.id])
    await scoreFirstMatch(tourn, asker.id, '6-4, 6-3')

    const ctx = await buildCoachToolContext(pool, asker.id)
    const first = await buildPlayerSnapshot(ctx)
    const second = await buildPlayerSnapshot(ctx)

    expect(first).toBe(second)
  })

  it('renders short empty-state lines for a brand-new player, never throws', async () => {
    const freshPlayer = await createPlayer('fresh')
    const ctx = await buildCoachToolContext(pool, freshPlayer.id)

    const snapshot = await buildPlayerSnapshot(ctx)
    expect(snapshot).toMatch(/no upcoming match/i)
    expect(snapshot).toMatch(/no results yet/i)
  })
})
