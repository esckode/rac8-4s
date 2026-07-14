/**
 * S7.2 — Player Personalization P12: get_group_availability read tool (RED first)
 *
 * "Aggregates wall" (design P12): returns per-slot COUNTS for the ctx
 * group's members — a negative test asserts no player ids/names appear
 * anywhere in the tool's output, enforced at the tool layer like A3.3.
 */
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { AvailabilityRepository } from '../../repositories/availability-repository'
import { buildAssistantToolContext, getGroupAvailability, ASSISTANT_TOOL_NAMES } from '../../assistant/tools'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('S7.2 — get_group_availability (P12 aggregates wall)', () => {
  let pool: Pool
  let playerRepo: PlayerRepository
  let availabilityRepo: AvailabilityRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
    availabilityRepo = new AvailabilityRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('is registered in the read-tool registry', () => {
    expect(ASSISTANT_TOOL_NAMES).toContain('get_group_availability')
  })

  it('aggregates per-slot counts across the group\'s members, never exposing ids or names', async () => {
    const alice = await playerRepo.findOrCreatePlayerByEmail(`gavail-alice-${uid()}@test.local`, `Alice-${uid()}`, undefined, undefined, defaultAdultAttestation())
    const bob = await playerRepo.findOrCreatePlayerByEmail(`gavail-bob-${uid()}@test.local`, `Bob-${uid()}`, undefined, undefined, defaultAdultAttestation())
    const carol = await playerRepo.findOrCreatePlayerByEmail(`gavail-carol-${uid()}@test.local`, `Carol-${uid()}`, undefined, undefined, defaultAdultAttestation())

    const g = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Availability Tool Group ${uid()}`, alice.id]
    )
    const groupId = g.rows[0].id as string
    for (const p of [alice, bob, carol]) {
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')
         ON CONFLICT (group_id, player_id) DO NOTHING`,
        [groupId, p.id]
      )
    }

    await availabilityRepo.replaceSlots(alice.id, [{ weekday: 6, dayPart: 'morning' }])
    await availabilityRepo.replaceSlots(bob.id, [{ weekday: 6, dayPart: 'morning' }])
    // carol has no availability set

    const ctx = await buildAssistantToolContext(pool, { playerId: alice.id, groupId })
    const result = await getGroupAvailability(ctx)

    expect(result.totalMembers).toBe(3)
    expect(result.slots).toEqual([{ weekday: 6, dayPart: 'morning', freeCount: 2 }])

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(alice.id)
    expect(serialized).not.toContain(bob.id)
    expect(serialized).not.toContain(carol.id)
    expect(serialized).not.toContain('Alice')
    expect(serialized).not.toContain('Bob')
    expect(serialized).not.toContain('Carol')
  })

  it('returns an empty slot list when no member has set availability', async () => {
    const owner = await playerRepo.findOrCreatePlayerByEmail(`gavail-empty-${uid()}@test.local`, `Player ${uid()}`, undefined, undefined, defaultAdultAttestation())
    const g = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Empty Availability Group ${uid()}`, owner.id]
    )
    const groupId = g.rows[0].id as string
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
      [groupId, owner.id]
    )

    const ctx = await buildAssistantToolContext(pool, { playerId: owner.id, groupId })
    const result = await getGroupAvailability(ctx)

    expect(result.totalMembers).toBe(1)
    expect(result.slots).toEqual([])
  })
})
