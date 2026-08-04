/**
 * ISSUE-56 (backend) — server-side per-group read state.
 *
 * GET /player/groups returns unreadCount per group (messages after the
 * caller's last_read_at, excluding system messages and the caller's own
 * messages). PATCH /:groupId/read stamps last_read_at = now() for the
 * caller. A fresh member's last_read_at defaults to their join time, so
 * pre-existing history never reads as unread.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { GroupMessageRepository } from '../../repositories/group-message-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string }> {
  const repo = new PlayerRepository(pool)
  const email = `unread-${uid()}@test.local`
  const player = await repo.findOrCreatePlayerByEmail(
    email,
    `Player ${uid()}`,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, email: player.email }
}

async function playerToken(
  player: { id: string; email: string },
  tokenStore: InMemoryTokenStore
): Promise<string> {
  const session = await generatePlayerSession(
    { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
    3600,
    tokenStore
  )
  return session.token
}

describe('ISSUE-56 (backend) — group unread + PATCH /:groupId/read', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function createGroup(ownerToken: string): Promise<{ id: string }> {
    const res = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Unread Group ${uid()}` })
    expect(res.status).toBe(201)
    return { id: res.body.id }
  }

  async function addMember(groupId: string, playerId: string): Promise<void> {
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [groupId, playerId]
    )
  }

  /**
   * The whole suite runs inside one outer transaction (getTestPool's harness),
   * and Postgres now() is frozen to that transaction's start — so a member
   * inserted with DEFAULT now() and a message inserted moments "later" in
   * wall-clock time actually get the IDENTICAL timestamp. Tests that need to
   * simulate "a message arrived after I last read" must backdate last_read_at
   * explicitly, relative to that same frozen now(), rather than relying on
   * insert order.
   */
  async function backdateLastRead(groupId: string, playerId: string): Promise<void> {
    await pool.query(
      `UPDATE public.player_group_members SET last_read_at = now() - interval '1 hour'
       WHERE group_id = $1 AND player_id = $2`,
      [groupId, playerId]
    )
  }

  async function sendMessage(token: string, groupId: string, body: string): Promise<void> {
    const res = await request(app)
      .post(`/player/groups/${groupId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body })
    expect(res.status).toBe(201)
  }

  async function getGroupsFor(token: string): Promise<any[]> {
    const res = await request(app).get('/player/groups').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    return res.body.groups
  }

  it('unreadCount reflects messages from another member since last_read_at, excluding own messages', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const memberTok = await playerToken(member, tokenStore)
    const group = await createGroup(ownerTok)
    await addMember(group.id, member.id)
    await backdateLastRead(group.id, member.id)

    await sendMessage(ownerTok, group.id, 'Hello from owner')
    await sendMessage(memberTok, group.id, 'Hello from member')

    const groups = await getGroupsFor(memberTok)
    const row = groups.find((g: any) => g.id === group.id)
    // Only the owner's message counts — the member's own message is excluded.
    expect(row.unreadCount).toBe(1)
  })

  it('excludes system messages from unreadCount', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const memberTok = await playerToken(member, tokenStore)
    const group = await createGroup(ownerTok)
    await addMember(group.id, member.id)

    const groupMsgRepo = new GroupMessageRepository(pool)
    await groupMsgRepo.postSystemEvent(group.id, 'Someone joined')

    const groups = await getGroupsFor(memberTok)
    const row = groups.find((g: any) => g.id === group.id)
    expect(row.unreadCount).toBe(0)
  })

  it('a fresh member has nothing unread even though the group already has history', async () => {
    const owner = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const group = await createGroup(ownerTok)

    await sendMessage(ownerTok, group.id, 'Message before the new member joins')

    const newMember = await createPlayer(pool)
    const newMemberTok = await playerToken(newMember, tokenStore)
    await addMember(group.id, newMember.id)

    const groups = await getGroupsFor(newMemberTok)
    const row = groups.find((g: any) => g.id === group.id)
    expect(row.unreadCount).toBe(0)
  })

  it('PATCH /:groupId/read stamps last_read_at, clearing unreadCount', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const memberTok = await playerToken(member, tokenStore)
    const group = await createGroup(ownerTok)
    await addMember(group.id, member.id)
    await backdateLastRead(group.id, member.id)

    await sendMessage(ownerTok, group.id, 'Unread until PATCH')

    const before = await getGroupsFor(memberTok)
    expect(before.find((g: any) => g.id === group.id).unreadCount).toBe(1)

    const patchRes = await request(app)
      .patch(`/player/groups/${group.id}/read`)
      .set('Authorization', `Bearer ${memberTok}`)
    expect(patchRes.status).toBe(200)

    const after = await getGroupsFor(memberTok)
    expect(after.find((g: any) => g.id === group.id).unreadCount).toBe(0)
  })

  it('PATCH /:groupId/read is idempotent', async () => {
    const owner = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const group = await createGroup(ownerTok)

    const first = await request(app)
      .patch(`/player/groups/${group.id}/read`)
      .set('Authorization', `Bearer ${ownerTok}`)
    expect(first.status).toBe(200)

    const second = await request(app)
      .patch(`/player/groups/${group.id}/read`)
      .set('Authorization', `Bearer ${ownerTok}`)
    expect(second.status).toBe(200)
  })

  it('PATCH /:groupId/read is 403 for a non-member', async () => {
    const owner = await createPlayer(pool)
    const outsider = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const outsiderTok = await playerToken(outsider, tokenStore)
    const group = await createGroup(ownerTok)

    const res = await request(app)
      .patch(`/player/groups/${group.id}/read`)
      .set('Authorization', `Bearer ${outsiderTok}`)
    expect(res.status).toBe(403)
  })
})
