/**
 * ISSUE-63 — Opening Alerts (POST /player/notifications/read) must not mark
 * an un-actioned group-invite notification as read. "Actionable" = its
 * metadata carries an unresolved action (groupInviteToken today). The
 * badge should mean "you still owe someone a response" — mark-all-read
 * excludes those rows; a new POST /player/notifications/:messageId/read
 * clears one specific row once its action completes (on invite accept).
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

async function createPlayer(pool: Pool): Promise<{ id: string; email: string }> {
  const repo = new PlayerRepository(pool)
  const email = `nr-${uid()}@test.local`
  const player = await repo.findOrCreatePlayerByEmail(
    email, `Player ${uid()}`, undefined, undefined, defaultAdultAttestation()
  )
  return { id: player.id, email: player.email }
}

async function playerToken(player: { id: string; email: string }, tokenStore: InMemoryTokenStore): Promise<string> {
  const session = await generatePlayerSession(
    { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
    3600,
    tokenStore
  )
  return session.token
}

describe('ISSUE-63 — actionable notifications survive mark-all-read', () => {
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

  async function createGroup(token: string): Promise<string> {
    const res = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `NotifRead Group ${uid()}` })
    return res.body.id as string
  }

  async function personalMessages(playerId: string) {
    const convId = await convRepo.resolvePersonalConversation(playerId)
    const res = await pool.query(
      `SELECT gm.id, gm.metadata, gmr.read_at
       FROM messaging.group_messages gm
       JOIN messaging.group_message_recipients gmr ON gmr.message_id = gm.id
       WHERE gm.conversation_id = $1 AND gmr.player_id = $2
       ORDER BY gm.created_at`,
      [convId, playerId]
    )
    return res.rows
  }

  it('mark-all-read clears an ordinary notification but leaves a pending-invite one unread', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const memberTok = await playerToken(member, tokenStore)

    // Ordinary notification: promote fires notifyPlayer(...) with no action metadata.
    const groupId = await createGroup(ownerTok)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [groupId, member.id]
    )
    await request(app)
      .post(`/player/groups/${groupId}/members/${member.id}/promote`)
      .set('Authorization', `Bearer ${ownerTok}`)

    // Actionable notification: an invite to member's email carries groupInviteToken.
    const invitedEmail = `nr-invited-${uid()}@test.local`
    const { id: invitedPlayerId } = await new PlayerRepository(pool).findOrCreatePlayerByEmail(
      invitedEmail, 'Invited Player', undefined, undefined, defaultAdultAttestation()
    )
    const invitedTok = await playerToken({ id: invitedPlayerId, email: invitedEmail }, tokenStore)
    const inviteGroupId = await createGroup(ownerTok)
    await request(app)
      .post(`/player/groups/${inviteGroupId}/invites`)
      .set('Authorization', `Bearer ${ownerTok}`)
      .send({ email: invitedEmail })

    await new Promise(r => setTimeout(r, 100)) // fire-and-forget notification settle

    await request(app)
      .post('/player/notifications/read')
      .set('Authorization', `Bearer ${memberTok}`)
    await request(app)
      .post('/player/notifications/read')
      .set('Authorization', `Bearer ${invitedTok}`)

    const memberMsgs = await personalMessages(member.id)
    expect(memberMsgs.every(m => m.read_at !== null)).toBe(true)

    const invitedMsgs = await personalMessages(invitedPlayerId)
    const inviteMsg = invitedMsgs.find(m => m.metadata?.groupInviteToken)
    expect(inviteMsg).toBeDefined()
    expect(inviteMsg.read_at).toBeNull()
  })

  it('GET /notifications/unread still counts the pending invite after mark-all-read', async () => {
    const owner = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const groupId = await createGroup(ownerTok)

    const invitedEmail = `nr-unread-${uid()}@test.local`
    await new PlayerRepository(pool).findOrCreatePlayerByEmail(
      invitedEmail, 'Invited Player', undefined, undefined, defaultAdultAttestation()
    )
    const invited = await new PlayerRepository(pool).findByEmail(invitedEmail)
    const invitedTok = await playerToken({ id: invited!.id, email: invitedEmail }, tokenStore)

    await request(app)
      .post(`/player/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${ownerTok}`)
      .send({ email: invitedEmail })
    await new Promise(r => setTimeout(r, 100))

    await request(app)
      .post('/player/notifications/read')
      .set('Authorization', `Bearer ${invitedTok}`)

    const res = await request(app)
      .get('/player/notifications/unread')
      .set('Authorization', `Bearer ${invitedTok}`)
    expect(res.body.unread).toBeGreaterThanOrEqual(1)
  })

  it('POST /notifications/:messageId/read clears one specific row', async () => {
    const owner = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const groupId = await createGroup(ownerTok)

    const invitedEmail = `nr-single-${uid()}@test.local`
    await new PlayerRepository(pool).findOrCreatePlayerByEmail(
      invitedEmail, 'Invited Player', undefined, undefined, defaultAdultAttestation()
    )
    const invited = await new PlayerRepository(pool).findByEmail(invitedEmail)
    const invitedTok = await playerToken({ id: invited!.id, email: invitedEmail }, tokenStore)

    await request(app)
      .post(`/player/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${ownerTok}`)
      .send({ email: invitedEmail })
    await new Promise(r => setTimeout(r, 100))

    const before = await personalMessages(invited!.id)
    const inviteMsg = before.find(m => m.metadata?.groupInviteToken)
    expect(inviteMsg).toBeDefined()
    expect(inviteMsg.read_at).toBeNull()

    const res = await request(app)
      .post(`/player/notifications/${inviteMsg.id}/read`)
      .set('Authorization', `Bearer ${invitedTok}`)
    expect(res.status).toBe(200)

    const after = await personalMessages(invited!.id)
    const updated = after.find(m => m.id === inviteMsg.id)
    expect(updated!.read_at).not.toBeNull()
  })
})
