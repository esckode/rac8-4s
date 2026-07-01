/**
 * P2.2 — Post four events into the personal thread
 *
 * RED: these tests verify that kick / promote / demote / auto-transfer each
 * post a system message into the affected player's personal conversation thread.
 * They will FAIL until postPersonalNotification is implemented and wired.
 *
 * Kick — posts to personal thread ONLY (no group chat message).
 * Promote / Demote — post to personal thread; group system event still fires.
 * Auto-transfer — posts to the new owner's personal thread when leaveGroup
 *   auto-promotes on last-owner leave.
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
import { ConversationRepository } from '../../repositories/conversation-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `pn-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
  return { id: player.id, email: player.email, name: player.name }
}

async function playerToken(player: { id: string; email: string }, tokenStore: InMemoryTokenStore): Promise<string> {
  const session = await generatePlayerSession(
    { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
    3600,
    tokenStore
  )
  return session.token
}

async function createGroup(app: Express, token: string): Promise<string> {
  const res = await request(app)
    .post('/player/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `TestGroup-${uid()}` })
  return res.body.id as string
}

async function addMember(pool: Pool, groupId: string, playerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role)
     VALUES ($1, $2, 'member')`,
    [groupId, playerId]
  )
}

async function getPersonalMessages(pool: Pool, convRepo: ConversationRepository, playerId: string) {
  const convId = await convRepo.resolvePersonalConversation(playerId)
  const res = await pool.query(
    `SELECT * FROM messaging.group_messages WHERE conversation_id = $1 ORDER BY created_at`,
    [convId]
  )
  return res.rows
}

async function getGroupMessages(pool: Pool, convRepo: ConversationRepository, groupId: string) {
  const groupConvRes = await pool.query(
    `SELECT id FROM messaging.conversations WHERE group_id = $1`,
    [groupId]
  )
  if (groupConvRes.rows.length === 0) return []
  const convId = groupConvRes.rows[0].id as string
  const res = await pool.query(
    `SELECT * FROM messaging.group_messages WHERE conversation_id = $1 ORDER BY created_at`,
    [convId]
  )
  return res.rows
}

describe('P2.2 — personal notifications for group events', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let convRepo: ConversationRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    convRepo = new ConversationRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('kick → personal message, no group system event', () => {
    it('posts a system message to the kicked player personal thread', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const groupId = await createGroup(app, ownerTok)
      await addMember(pool, groupId, member.id)

      // Small delay to allow async fire-and-forget after any prior ops
      await new Promise(r => setTimeout(r, 50))

      const beforePersonal = await getPersonalMessages(pool, convRepo, member.id)

      await request(app)
        .delete(`/player/groups/${groupId}/members/${member.id}`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .expect(200)

      // Allow fire-and-forget postPersonalNotification to settle
      await new Promise(r => setTimeout(r, 100))

      const afterPersonal = await getPersonalMessages(pool, convRepo, member.id)
      expect(afterPersonal.length).toBeGreaterThan(beforePersonal.length)
      const msg = afterPersonal[afterPersonal.length - 1]
      expect(msg.type).toBe('system')
    })

    it('does NOT post a system event to the group chat on kick', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const groupId = await createGroup(app, ownerTok)
      await addMember(pool, groupId, member.id)

      // Capture group message count before kick
      const beforeGroup = await getGroupMessages(pool, convRepo, groupId)

      await request(app)
        .delete(`/player/groups/${groupId}/members/${member.id}`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .expect(200)

      await new Promise(r => setTimeout(r, 100))

      const afterGroup = await getGroupMessages(pool, convRepo, groupId)
      expect(afterGroup.length).toBe(beforeGroup.length)
    })
  })

  describe('promote → personal message + group system event', () => {
    it('posts a personal message to the promoted player', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const groupId = await createGroup(app, ownerTok)
      await addMember(pool, groupId, member.id)

      const beforePersonal = await getPersonalMessages(pool, convRepo, member.id)

      await request(app)
        .post(`/player/groups/${groupId}/members/${member.id}/promote`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .expect(200)

      await new Promise(r => setTimeout(r, 100))

      const afterPersonal = await getPersonalMessages(pool, convRepo, member.id)
      expect(afterPersonal.length).toBeGreaterThan(beforePersonal.length)
    })

    it('group system event still fires on promote', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const groupId = await createGroup(app, ownerTok)
      await addMember(pool, groupId, member.id)

      const beforeGroup = await getGroupMessages(pool, convRepo, groupId)

      await request(app)
        .post(`/player/groups/${groupId}/members/${member.id}/promote`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .expect(200)

      await new Promise(r => setTimeout(r, 100))

      const afterGroup = await getGroupMessages(pool, convRepo, groupId)
      expect(afterGroup.length).toBeGreaterThan(beforeGroup.length)
    })
  })

  describe('demote → personal message + group system event', () => {
    it('posts a personal message to the demoted player', async () => {
      const owner = await createPlayer(pool)
      const owner2 = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const groupId = await createGroup(app, ownerTok)
      // Add owner2 as owner (via promote)
      await addMember(pool, groupId, owner2.id)
      await request(app)
        .post(`/player/groups/${groupId}/members/${owner2.id}/promote`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .expect(200)

      // Allow settle
      await new Promise(r => setTimeout(r, 50))

      const beforePersonal = await getPersonalMessages(pool, convRepo, owner2.id)

      await request(app)
        .post(`/player/groups/${groupId}/members/${owner2.id}/demote`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .expect(200)

      await new Promise(r => setTimeout(r, 100))

      const afterPersonal = await getPersonalMessages(pool, convRepo, owner2.id)
      expect(afterPersonal.length).toBeGreaterThan(beforePersonal.length)
    })

    it('group system event still fires on demote', async () => {
      const owner = await createPlayer(pool)
      const owner2 = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const groupId = await createGroup(app, ownerTok)
      await addMember(pool, groupId, owner2.id)
      await request(app)
        .post(`/player/groups/${groupId}/members/${owner2.id}/promote`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .expect(200)

      await new Promise(r => setTimeout(r, 50))

      const beforeGroup = await getGroupMessages(pool, convRepo, groupId)

      await request(app)
        .post(`/player/groups/${groupId}/members/${owner2.id}/demote`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .expect(200)

      await new Promise(r => setTimeout(r, 100))

      const afterGroup = await getGroupMessages(pool, convRepo, groupId)
      expect(afterGroup.length).toBeGreaterThan(beforeGroup.length)
    })
  })

  describe('auto-transfer → personal message to new owner', () => {
    it('posts a personal message to the auto-promoted player when last owner leaves', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const memberTok = await playerToken(member, tokenStore)
      const groupId = await createGroup(app, ownerTok)
      await addMember(pool, groupId, member.id)

      const beforePersonal = await getPersonalMessages(pool, convRepo, member.id)

      // Owner leaves — auto-transfers to member
      await request(app)
        .delete(`/player/groups/${groupId}/members/${owner.id}`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .expect(200)

      await new Promise(r => setTimeout(r, 100))

      const afterPersonal = await getPersonalMessages(pool, convRepo, member.id)
      expect(afterPersonal.length).toBeGreaterThan(beforePersonal.length)

      // Suppress unused variable warning
      void memberTok
    })
  })
})
