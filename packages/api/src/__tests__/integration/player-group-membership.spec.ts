/**
 * G1.2 — Membership lifecycle: create / promote / demote / kick / leave / auto-transfer
 *
 * Integration tests via the transactional harness (getTestPool).
 * Tests the 6 behaviors + critical negatives:
 *  1. create group → creator becomes role=owner; created_by set
 *  2. multi-owner: promote member → two owner rows; any owner can act on any owner/member
 *  3. ≥1-owner invariant: demoting/kicking last owner blocked
 *  4. last-owner leave → auto-transfer to longest-tenured remaining member
 *  5. self-leave always allowed (non-last-owner / member)
 *  6. kick is owner-only; a member cannot kick
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

// Create a player directly via the repository
async function createPlayer(pool: Pool): Promise<{ id: string; email: string }> {
  const repo = new PlayerRepository(pool)
  const email = `pgm-${uid()}@test.local`
  const player = await repo.findOrCreatePlayerByEmail(
    email,
    `Player ${uid()}`,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, email: player.email }
}

// Issue a player session token (tournamentId is a sentinel — group routes don't use it)
async function playerToken(
  player: { id: string; email: string },
  tokenStore: InMemoryTokenStore
): Promise<string> {
  const session = await generatePlayerSession(
    {
      playerId: player.id,
      tournamentId: crypto.randomUUID(), // sentinel; group routes don't check this
      email: player.email,
      createdAt: Date.now(),
    },
    3600,
    tokenStore
  )
  return session.token
}

describe('G1.2 — Player group membership lifecycle', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    jwtConfig = deps.jwtConfig
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // Helper: create a group via POST /player/groups
  async function createGroup(
    ownerToken: string,
    name?: string,
    defaultMatchFormat?: string
  ): Promise<{ id: string }> {
    const body: Record<string, string> = { name: name ?? `Group ${uid()}` }
    if (defaultMatchFormat) body.defaultMatchFormat = defaultMatchFormat

    const res = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(body)

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    return { id: res.body.id }
  }

  // Helper: read membership rows directly
  async function getMembers(
    groupId: string
  ): Promise<Array<{ player_id: string; role: string; joined_at: Date }>> {
    const result = await pool.query(
      `SELECT player_id, role, joined_at
       FROM public.player_group_members
       WHERE group_id = $1
       ORDER BY joined_at ASC`,
      [groupId]
    )
    return result.rows
  }

  // ─── Behavior 1: create group → creator becomes owner; created_by set ─────

  describe('Behavior 1 — create group', () => {
    it('creator becomes role=owner after POST /player/groups', async () => {
      const creator = await createPlayer(pool)
      const token = await playerToken(creator, tokenStore)

      const res = await request(app)
        .post('/player/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Group ${uid()}` })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('id')

      const members = await getMembers(res.body.id)
      expect(members).toHaveLength(1)
      expect(members[0].player_id).toBe(creator.id)
      expect(members[0].role).toBe('owner')
    })

    it('created_by is set to the creator player_id', async () => {
      const creator = await createPlayer(pool)
      const token = await playerToken(creator, tokenStore)

      const res = await request(app)
        .post('/player/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Group ${uid()}` })

      expect(res.status).toBe(201)

      const groupRow = await pool.query(
        `SELECT created_by FROM public.player_groups WHERE id = $1`,
        [res.body.id]
      )
      expect(groupRow.rows[0].created_by).toBe(creator.id)
    })

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/player/groups')
        .send({ name: `Group ${uid()}` })

      expect(res.status).toBe(401)
    })

    it('requires a name', async () => {
      const creator = await createPlayer(pool)
      const token = await playerToken(creator, tokenStore)

      const res = await request(app)
        .post('/player/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
    })
  })

  // ─── Behavior 2: multi-owner; any owner may act on any owner/member ────────

  describe('Behavior 2 — multi-owner and cross-owner operations', () => {
    it('owner can promote a member → two owner rows exist', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)
      const memberToken = await playerToken(member, tokenStore)

      const group = await createGroup(ownerToken)

      // Add member by direct SQL (invite flow is G1.3; here we test membership lifecycle)
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member')`,
        [group.id, member.id]
      )

      const res = await request(app)
        .post(`/player/groups/${group.id}/members/${member.id}/promote`)
        .set('Authorization', `Bearer ${ownerToken}`)

      expect(res.status).toBe(200)

      const members = await getMembers(group.id)
      const roles = Object.fromEntries(members.map(m => [m.player_id, m.role]))
      expect(roles[owner.id]).toBe('owner')
      expect(roles[member.id]).toBe('owner')
    })

    it('second owner can demote the first owner (any owner acts on any owner)', async () => {
      const owner1 = await createPlayer(pool)
      const owner2 = await createPlayer(pool)
      const owner1Token = await playerToken(owner1, tokenStore)
      const owner2Token = await playerToken(owner2, tokenStore)

      const group = await createGroup(owner1Token)

      // Make owner2 an owner
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'owner')`,
        [group.id, owner2.id]
      )

      // owner2 demotes owner1
      const res = await request(app)
        .post(`/player/groups/${group.id}/members/${owner1.id}/demote`)
        .set('Authorization', `Bearer ${owner2Token}`)

      expect(res.status).toBe(200)

      const members = await getMembers(group.id)
      const roles = Object.fromEntries(members.map(m => [m.player_id, m.role]))
      expect(roles[owner1.id]).toBe('member')
      expect(roles[owner2.id]).toBe('owner')
    })
  })

  // ─── Behavior 3: ≥1-owner invariant ───────────────────────────────────────

  describe('Behavior 3 — ≥1-owner invariant', () => {
    it('cannot demote the last owner (blocked with 409)', async () => {
      const owner = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)

      const group = await createGroup(ownerToken)

      const res = await request(app)
        .post(`/player/groups/${group.id}/members/${owner.id}/demote`)
        .set('Authorization', `Bearer ${ownerToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('LAST_OWNER')
    })

    it('cannot kick the last owner (blocked with 409)', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)

      const group = await createGroup(ownerToken)

      // Add a second owner then demote owner1 to test kicking last owner scenario
      // Simplify: owner tries to kick themselves (last owner)
      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${owner.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)

      // kick of last owner should be blocked
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('LAST_OWNER')
    })

    it('group still has ≥1 owner after attempted last-owner demote', async () => {
      const owner = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)

      const group = await createGroup(ownerToken)

      // Attempt will be blocked
      await request(app)
        .post(`/player/groups/${group.id}/members/${owner.id}/demote`)
        .set('Authorization', `Bearer ${ownerToken}`)

      // Verify invariant held
      const result = await pool.query(
        `SELECT COUNT(*) FROM public.player_group_members
         WHERE group_id = $1 AND role = 'owner'`,
        [group.id]
      )
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(1)
    })
  })

  // ─── Behavior 4: last-owner leave → auto-transfer to longest-tenured member ─

  describe('Behavior 4 — last-owner leave auto-transfers to longest-tenured member', () => {
    it('transfers ownership to the longest-tenured member on last-owner leave', async () => {
      const owner = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)

      const group = await createGroup(ownerToken)

      // Insert two members with explicit joined_at to control ordering
      const olderMember = await createPlayer(pool)
      const newerMember = await createPlayer(pool)

      // Insert older member first (earlier joined_at)
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role, joined_at)
         VALUES ($1, $2, 'member', NOW() - INTERVAL '2 hours')`,
        [group.id, olderMember.id]
      )
      // Insert newer member
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role, joined_at)
         VALUES ($1, $2, 'member', NOW() - INTERVAL '1 hour')`,
        [group.id, newerMember.id]
      )

      // Last owner leaves
      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${owner.id}/leave`)
        .set('Authorization', `Bearer ${ownerToken}`)

      expect(res.status).toBe(200)

      // olderMember should now be the owner (longest-tenured = earliest joined_at)
      const members = await getMembers(group.id)
      const roles = Object.fromEntries(members.map(m => [m.player_id, m.role]))

      expect(roles[owner.id]).toBeUndefined() // owner's row removed
      expect(roles[olderMember.id]).toBe('owner')
      expect(roles[newerMember.id]).toBe('member')
    })

    it('auto-transfer preserves group and all other history', async () => {
      const owner = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)

      const group = await createGroup(ownerToken)

      const remaining = await createPlayer(pool)
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member')`,
        [group.id, remaining.id]
      )

      await request(app)
        .delete(`/player/groups/${group.id}/members/${owner.id}/leave`)
        .set('Authorization', `Bearer ${ownerToken}`)

      // Group still exists
      const groupRow = await pool.query(
        `SELECT id, name, created_by FROM public.player_groups WHERE id = $1`,
        [group.id]
      )
      expect(groupRow.rows).toHaveLength(1)
      expect(groupRow.rows[0].created_by).toBe(owner.id) // created_by is immutable audit
    })

    it('blocked: last-owner leave with NO remaining members returns 409', async () => {
      const owner = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)

      const group = await createGroup(ownerToken)

      // Attempt to leave with no other members
      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${owner.id}/leave`)
        .set('Authorization', `Bearer ${ownerToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('LAST_OWNER')
    })
  })

  // ─── Behavior 5: self-leave always allowed ─────────────────────────────────

  describe('Behavior 5 — self-leave', () => {
    it('a member can leave a group (row removed)', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)
      const memberToken = await playerToken(member, tokenStore)

      const group = await createGroup(ownerToken)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member')`,
        [group.id, member.id]
      )

      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${member.id}/leave`)
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)

      const members = await getMembers(group.id)
      const ids = members.map(m => m.player_id)
      expect(ids).not.toContain(member.id)
    })

    it('a non-last-owner can leave (leaving the other owner in place)', async () => {
      const owner1 = await createPlayer(pool)
      const owner2 = await createPlayer(pool)
      const owner1Token = await playerToken(owner1, tokenStore)
      const owner2Token = await playerToken(owner2, tokenStore)

      const group = await createGroup(owner1Token)

      // Make owner2 an owner as well
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'owner')`,
        [group.id, owner2.id]
      )

      // owner1 leaves (not last owner)
      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${owner1.id}/leave`)
        .set('Authorization', `Bearer ${owner1Token}`)

      expect(res.status).toBe(200)

      const members = await getMembers(group.id)
      const roles = Object.fromEntries(members.map(m => [m.player_id, m.role]))
      expect(roles[owner1.id]).toBeUndefined()
      expect(roles[owner2.id]).toBe('owner')
    })

    it('cannot leave on behalf of someone else (only self)', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const otherPlayer = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)
      const otherToken = await playerToken(otherPlayer, tokenStore)

      const group = await createGroup(ownerToken)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member'), ($3, $4, 'member')`,
        [group.id, member.id, group.id, otherPlayer.id]
      )

      // otherPlayer tries to trigger member's leave — should fail
      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${member.id}/leave`)
        .set('Authorization', `Bearer ${otherToken}`)

      expect(res.status).toBe(403)
    })
  })

  // ─── Behavior 6: kick is owner-only ───────────────────────────────────────

  describe('Behavior 6 — kick is owner-only (NEGATIVE: member cannot kick)', () => {
    it('owner can kick a member', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)

      const group = await createGroup(ownerToken)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member')`,
        [group.id, member.id]
      )

      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${member.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)

      expect(res.status).toBe(200)

      const members = await getMembers(group.id)
      const ids = members.map(m => m.player_id)
      expect(ids).not.toContain(member.id)
    })

    it('NEGATIVE: member cannot kick another member (403)', async () => {
      const owner = await createPlayer(pool)
      const member1 = await createPlayer(pool)
      const member2 = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)
      const member1Token = await playerToken(member1, tokenStore)

      const group = await createGroup(ownerToken)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member'), ($3, $4, 'member')`,
        [group.id, member1.id, group.id, member2.id]
      )

      // member1 tries to kick member2
      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${member2.id}`)
        .set('Authorization', `Bearer ${member1Token}`)

      expect(res.status).toBe(403)

      // member2 should still be in the group
      const members = await getMembers(group.id)
      const ids = members.map(m => m.player_id)
      expect(ids).toContain(member2.id)
    })

    it('NEGATIVE: unauthenticated kick is rejected (401)', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)

      const group = await createGroup(ownerToken)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member')`,
        [group.id, member.id]
      )

      const res = await request(app).delete(`/player/groups/${group.id}/members/${member.id}`)

      expect(res.status).toBe(401)
    })

    it('NEGATIVE: non-member cannot kick (403)', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const outsider = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)
      const outsiderToken = await playerToken(outsider, tokenStore)

      const group = await createGroup(ownerToken)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member')`,
        [group.id, member.id]
      )

      // outsider (not in group at all) tries to kick
      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${member.id}`)
        .set('Authorization', `Bearer ${outsiderToken}`)

      expect(res.status).toBe(403)
    })
  })

  // ─── Authz: promote/demote requires owner role ────────────────────────────

  describe('Authz — promote/demote require owner', () => {
    it('NEGATIVE: member cannot promote another member (403)', async () => {
      const owner = await createPlayer(pool)
      const member1 = await createPlayer(pool)
      const member2 = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)
      const member1Token = await playerToken(member1, tokenStore)

      const group = await createGroup(ownerToken)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member'), ($3, $4, 'member')`,
        [group.id, member1.id, group.id, member2.id]
      )

      const res = await request(app)
        .post(`/player/groups/${group.id}/members/${member2.id}/promote`)
        .set('Authorization', `Bearer ${member1Token}`)

      expect(res.status).toBe(403)
    })

    it('NEGATIVE: member cannot demote an owner (403)', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)
      const memberToken = await playerToken(member, tokenStore)

      const group = await createGroup(ownerToken)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member')`,
        [group.id, member.id]
      )

      const res = await request(app)
        .post(`/player/groups/${group.id}/members/${owner.id}/demote`)
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(403)
    })
  })

  // ─── 404 and not-member edge cases ────────────────────────────────────────

  describe('Edge cases — 404 for unknown group or member', () => {
    it('returns 404 for kick on non-existent group', async () => {
      const player = await createPlayer(pool)
      const token = await playerToken(player, tokenStore)

      const res = await request(app)
        .delete(`/player/groups/${crypto.randomUUID()}/members/${player.id}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(404)
    })

    it('returns 404 for kick of non-member', async () => {
      const owner = await createPlayer(pool)
      const outsider = await createPlayer(pool)
      const ownerToken = await playerToken(owner, tokenStore)

      const group = await createGroup(ownerToken)

      const res = await request(app)
        .delete(`/player/groups/${group.id}/members/${outsider.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)

      expect(res.status).toBe(404)
    })
  })
})
