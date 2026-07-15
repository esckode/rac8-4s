/**
 * S3.1 — 1:1 Coach: player-level tool context (the Q5-variant scoping) (RED first)
 *
 * Covers (COACH_1TO1_IMPLEMENTATION.md §S3.1):
 *  - buildCoachToolContext(db, playerId) unions tournaments across ALL of the
 *    player's groups PLUS standalone registrations; an unrelated tournament
 *    never resolves (adversarial-args: not-found).
 *  - Q5 relaxation: get_standings on the asker's non-group tournament returns
 *    FULL standings through the coach context (private audience) — the
 *    group-context "minimal detail" behavior is a regression assertion
 *    against the SAME tournament via the existing group ctx.
 *  - Zero-group player with one registration: context works.
 *  - get_group_availability scopes to an explicitly-named group (tool arg);
 *    aggregates-only remains true; a non-member group id is not-found.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository, GroupRepository, TournamentRepository } from '../../db'
import { TournamentFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import { AvailabilityRepository } from '../../repositories/availability-repository'
import {
  buildAssistantToolContext,
  buildCoachToolContext,
  getMyMatches,
  getStandings,
  getTournament,
  getGroupAvailability,
} from '../../assistant/tools'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('S3.1 — coach tool context (player-level scoping)', () => {
  let pool: Pool
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let tournamentRepo: TournamentRepository
  let availabilityRepo: AvailabilityRepository

  async function createPlayer(prefix: string): Promise<{ id: string; name: string; email: string }> {
    const email = `${prefix}-${uid()}@test.local`
    const name = `${prefix}-${uid()}`
    const p = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    return { id: p.id, name: p.name ?? name, email: p.email }
  }

  async function createGroup(ownerId: string): Promise<string> {
    const res = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Coach Tools Group ${uid()}`, ownerId]
    )
    return res.rows[0].id as string
  }

  async function addMember(groupId: string, playerId: string): Promise<void> {
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT (group_id, player_id) DO NOTHING`,
      [groupId, playerId]
    )
  }

  async function createTournamentWithRoster(
    roster: string[],
    opts: { linkToGroup?: string } = {}
  ): Promise<string> {
    const t = await TournamentFactory.create(pool, `organizer_${uid()}`)
    await tournamentRepo.updateStatus(t.id, 'group_stage_active')
    if (opts.linkToGroup) {
      await pool.query(`UPDATE public.tournaments SET group_id = $1 WHERE id = $2`, [opts.linkToGroup, t.id])
    }
    for (const playerId of roster) {
      await playerRepo.createRegistration(playerId, t.id)
    }
    await groupRepo.createGroups(t.id, 1, 2, roster)
    return t.id
  }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
    groupRepo = new GroupRepository(pool)
    tournamentRepo = new TournamentRepository(pool)
    availabilityRepo = new AvailabilityRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('union scope across all of the player\'s groups + standalone registrations', () => {
    it('resolves tournaments from two different groups plus one standalone registration; not a fourth unrelated one', async () => {
      const asker = await createPlayer('asker')
      const bob = await createPlayer('bob')

      const group1 = await createGroup(asker.id)
      const group2 = await createGroup(asker.id)
      await addMember(group1, asker.id)
      await addMember(group2, asker.id)

      const tournInGroup1 = await createTournamentWithRoster([asker.id, bob.id], { linkToGroup: group1 })
      const tournInGroup2 = await createTournamentWithRoster([asker.id, bob.id], { linkToGroup: group2 })
      const tournStandalone = await createTournamentWithRoster([asker.id, bob.id])
      const tournUnrelated = await createTournamentWithRoster([bob.id])

      const ctx = await buildCoachToolContext(pool, asker.id)

      const g1 = await getTournament(ctx, { tournamentId: tournInGroup1 })
      const g2 = await getTournament(ctx, { tournamentId: tournInGroup2 })
      const standalone = await getTournament(ctx, { tournamentId: tournStandalone })
      const unrelated = await getTournament(ctx, { tournamentId: tournUnrelated })

      expect('error' in g1).toBe(false)
      expect('error' in g2).toBe(false)
      expect('error' in standalone).toBe(false)
      expect(unrelated).toEqual({ error: 'not_found', message: expect.any(String) })
    })

    it('zero-group player with one registration: context works, own tournament reachable', async () => {
      const asker = await createPlayer('solo')
      const bob = await createPlayer('bob')
      const tourn = await createTournamentWithRoster([asker.id, bob.id])

      const ctx = await buildCoachToolContext(pool, asker.id)
      const result = await getMyMatches(ctx, { tournamentId: tourn })
      expect('error' in result).toBe(false)
    })
  })

  describe('Q5 relaxation: full standings on a non-group tournament through the coach context', () => {
    it('coach context returns FULL standings (both players) for a registered-only tournament', async () => {
      const asker = await createPlayer('asker')
      const bob = await createPlayer('bob')
      const tourn = await createTournamentWithRoster([asker.id, bob.id])

      const coachCtx = await buildCoachToolContext(pool, asker.id)
      const result = await getStandings(coachCtx, { tournamentId: tourn })

      expect('error' in result).toBe(false)
      const rows = (result as any).groups.flatMap((g: any) => g.standings) as any[]
      expect(rows).toHaveLength(2)
      expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining([asker.name, bob.name]))
    })

    it('regression: the SAME tournament via the group context still returns minimal (own-row-only) detail', async () => {
      const asker = await createPlayer('asker')
      const bob = await createPlayer('bob')
      const group = await createGroup(asker.id)
      await addMember(group, asker.id)
      const tourn = await createTournamentWithRoster([asker.id, bob.id])

      const groupCtx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: group })
      const result = await getStandings(groupCtx, { tournamentId: tourn })

      expect('error' in result).toBe(false)
      const rows = (result as any).groups.flatMap((g: any) => g.standings) as any[]
      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe(asker.name)
      expect(JSON.stringify(result)).not.toContain(bob.name)
    })
  })

  describe('get_group_availability — explicit group arg (coach has no single default group)', () => {
    it('scopes to the named group and stays aggregates-only', async () => {
      const asker = await createPlayer('asker')
      const bob = await createPlayer('bob')
      const group = await createGroup(asker.id)
      await addMember(group, asker.id)
      await addMember(group, bob.id)
      await availabilityRepo.replaceSlots(asker.id, [{ weekday: 3, dayPart: 'evening' }])
      await availabilityRepo.replaceSlots(bob.id, [{ weekday: 3, dayPart: 'evening' }])

      const ctx = await buildCoachToolContext(pool, asker.id)
      const result = await getGroupAvailability(ctx, { groupId: group })

      expect('error' in result!).toBe(false)
      expect((result as any).totalMembers).toBe(2)
      expect((result as any).slots).toEqual([{ weekday: 3, dayPart: 'evening', freeCount: 2 }])
      expect(JSON.stringify(result)).not.toContain(asker.id)
      expect(JSON.stringify(result)).not.toContain(bob.id)
    })

    it('a group the asker does not belong to → not-found', async () => {
      const asker = await createPlayer('asker')
      const stranger = await createPlayer('stranger')
      const otherGroup = await createGroup(stranger.id)
      await addMember(otherGroup, stranger.id)

      const ctx = await buildCoachToolContext(pool, asker.id)
      const result = await getGroupAvailability(ctx, { groupId: otherGroup })

      expect(result).toEqual({ error: 'not_found', message: expect.any(String) })
    })
  })
})
