/**
 * V6.1 — Read-receipt visibility integration tests (TDD RED first)
 *
 * Covers:
 * 1. Broadcast ack count: GET /tournaments/:id/messages/:msgId/ack-count
 *    - Organizer sees "X of N read" correctly
 *    - Player is DENIED the tally (403)
 *    - Count updates as recipients mark read
 * 2. Player read-receipt preference: PATCH/GET /player/read-receipt-preferences
 *    - Default is off (share_read_receipts = false)
 *    - Can toggle on/off
 * 3. DM "seen" in GET /tournaments/:id/messages
 *    - Opted-in: sender sees recipientReadAt in message list
 *    - Default (opted out): sender does NOT see recipientReadAt
 *    - Toggling pref flips visibility
 */

import request from 'supertest'
import { Pool } from 'pg'
import { Express } from 'express'
import { getTestPool, closeTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { PlayerFactory, TournamentFactory, OrganizerFactory } from '../factories'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { BroadcastBus } from '../../broadcast-bus'
import { InMemoryJobQueue } from '@worker/job-queue'

describe('V6.1 — Read-receipt visibility', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const broadcastBus = new BroadcastBus()
    const jobQueue = new InMemoryJobQueue()
    const testApp = createTestApp(pool, { broadcastBus, jobQueue })
    app = testApp.app
    tokenStore = testApp.tokenStore
    jwtConfig = testApp.jwtConfig
  })

  afterAll(async () => {
    await rollbackTransaction()
    await closeTestPool()
  })

  async function createPlayerWithSession(tournamentId: string) {
    const player = await PlayerFactory.create(pool)
    const playerRepo = new (await import('../../db')).PlayerRepository(pool)
    await playerRepo.createRegistration(player.id, tournamentId)
    const session = await generatePlayerSession(
      { playerId: player.id, tournamentId, email: player.email, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return { player, sessionToken: session.token }
  }

  async function createOrganizerWithTournament() {
    const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.create(pool, organizerId)
    return { organizerId, orgToken, tournament }
  }

  // ── Broadcast ack count ────────────────────────────────────────────────────

  describe('GET /tournaments/:id/messages/:msgId/ack-count (broadcast ack count)', () => {
    it('returns 401 when unauthenticated', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages/no-such-msg/ack-count`)
      expect(res.status).toBe(401)
    })

    it('returns 403 when a player (not organizer) requests the ack count', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { sessionToken } = await createPlayerWithSession(tournament.id)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages/some-msg-id/ack-count`)
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('returns 404 for a non-existent message', async () => {
      const { orgToken, tournament } = await createOrganizerWithTournament()

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages/00000000-0000-0000-0000-000000000000/ack-count`)
        .set('Authorization', `Bearer ${orgToken}`)

      expect(res.status).toBe(404)
    })

    it('returns X=0 of N when no recipients have read yet', async () => {
      const { orgToken, tournament, organizerId } = await createOrganizerWithTournament()
      const { player: p1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)

      // Send broadcast as organizer
      const sendRes = await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Schedule change: 2pm start' })

      expect(sendRes.status).toBe(201)
      const msgId = sendRes.body.message.id

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages/${msgId}/ack-count`)
        .set('Authorization', `Bearer ${orgToken}`)

      expect(res.status).toBe(200)
      expect(res.body.read).toBe(0)
      expect(res.body.total).toBe(2)

      // Suppress unused variable warnings for test clarity
      void p1; void p2; void organizerId
    })

    it('increments X as recipients mark messages read', async () => {
      const { orgToken, tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: tok1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)

      const sendRes = await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Court assignments posted' })

      const msgId = sendRes.body.message.id

      // p1 marks read
      await request(app)
        .post(`/tournaments/${tournament.id}/messages/${msgId}/read`)
        .set('Authorization', `Bearer ${tok1}`)
      // Flush read receipt directly so we can observe in test
      const { MessageRepository } = await import('../../repositories/message-repository')
      const repo = new MessageRepository(pool as any)
      await repo.markRead({ messageId: msgId, messageCreatedAt: new Date(), playerId: p1.id })

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages/${msgId}/ack-count`)
        .set('Authorization', `Bearer ${orgToken}`)

      expect(res.status).toBe(200)
      expect(res.body.read).toBe(1)
      expect(res.body.total).toBe(2)

      void p2
    })

    it('returns 403 for a player from a DIFFERENT tournament (also a player)', async () => {
      const { orgToken, tournament } = await createOrganizerWithTournament()
      const { tournament: otherTournament } = await createOrganizerWithTournament()
      const { sessionToken: foreignToken } = await createPlayerWithSession(otherTournament.id)

      const sendRes = await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Hello' })
      const msgId = sendRes.body.message.id

      // foreign player from a different tournament tries to get ack count
      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages/${msgId}/ack-count`)
        .set('Authorization', `Bearer ${foreignToken}`)

      expect(res.status).toBe(403)
    })
  })

  // ── Player read-receipt preference ────────────────────────────────────────

  describe('Player read-receipt preference', () => {
    describe('GET /player/read-receipt-preferences', () => {
      it('returns 401 without auth', async () => {
        const res = await request(app).get('/player/read-receipt-preferences')
        expect(res.status).toBe(401)
      })

      it('returns shareReadReceipts: false by default (opt-out default)', async () => {
        const { tournament } = await createOrganizerWithTournament()
        const { sessionToken } = await createPlayerWithSession(tournament.id)

        const res = await request(app)
          .get('/player/read-receipt-preferences')
          .set('Authorization', `Bearer ${sessionToken}`)

        expect(res.status).toBe(200)
        expect(res.body.shareReadReceipts).toBe(false)
      })
    })

    describe('PATCH /player/read-receipt-preferences', () => {
      it('returns 401 without auth', async () => {
        const res = await request(app)
          .patch('/player/read-receipt-preferences')
          .send({ shareReadReceipts: true })
        expect(res.status).toBe(401)
      })

      it('returns 400 for non-boolean', async () => {
        const { tournament } = await createOrganizerWithTournament()
        const { sessionToken } = await createPlayerWithSession(tournament.id)

        const res = await request(app)
          .patch('/player/read-receipt-preferences')
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({ shareReadReceipts: 'yes' })

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('VALIDATION_ERROR')
      })

      it('can enable share_read_receipts', async () => {
        const { tournament } = await createOrganizerWithTournament()
        const { sessionToken } = await createPlayerWithSession(tournament.id)

        const res = await request(app)
          .patch('/player/read-receipt-preferences')
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({ shareReadReceipts: true })

        expect(res.status).toBe(200)
        expect(res.body.shareReadReceipts).toBe(true)
      })

      it('toggling off again returns false', async () => {
        const { tournament } = await createOrganizerWithTournament()
        const { sessionToken } = await createPlayerWithSession(tournament.id)

        await request(app)
          .patch('/player/read-receipt-preferences')
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({ shareReadReceipts: true })

        const res = await request(app)
          .patch('/player/read-receipt-preferences')
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({ shareReadReceipts: false })

        expect(res.status).toBe(200)
        expect(res.body.shareReadReceipts).toBe(false)
      })
    })
  })

  // ── DM "seen" in history ──────────────────────────────────────────────────

  describe('DM "seen" visibility in GET /tournaments/:id/messages', () => {
    async function makeOpponents(tournamentId: string, player1Id: string, player2Id: string) {
      const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      await pool.query(
        `INSERT INTO public.groups (id, tournament_id, name, created_at) VALUES ($1, $2, 'Test Group', now())`,
        [groupId, tournamentId]
      )
      await pool.query(
        `INSERT INTO public.group_matches (id, group_id, tournament_id, format, player1_id, player2_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'singles', $4, $5, 'pending', now(), now())`,
        [`gm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, groupId, tournamentId, player1Id, player2Id]
      )
    }

    it('sender does NOT see recipientReadAt by default (opt-out default)', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: sender, sessionToken: senderTok } = await createPlayerWithSession(tournament.id)
      const { player: recipient, sessionToken: recipientTok } = await createPlayerWithSession(tournament.id)
      await makeOpponents(tournament.id, sender.id, recipient.id)

      // Send DM
      const dmRes = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${senderTok}`)
        .send({ recipientPlayerId: recipient.id, body: 'Test DM for seen' })
      expect(dmRes.status).toBe(201)
      const msgId = dmRes.body.id

      // Recipient marks as read
      const { MessageRepository } = await import('../../repositories/message-repository')
      const repo = new MessageRepository(pool as any)
      await repo.markRead({ messageId: msgId, messageCreatedAt: new Date(), playerId: recipient.id })

      // Sender fetches history — should NOT see recipientReadAt (recipient hasn't opted in)
      const histRes = await request(app)
        .get(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${senderTok}`)
      expect(histRes.status).toBe(200)

      const msg = histRes.body.messages.find((m: any) => m.id === msgId)
      expect(msg).toBeDefined()
      expect(msg.recipientReadAt).toBeUndefined()

      void recipientTok
    })

    it('sender sees recipientReadAt when recipient has opted in', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: sender, sessionToken: senderTok } = await createPlayerWithSession(tournament.id)
      const { player: recipient, sessionToken: recipientTok } = await createPlayerWithSession(tournament.id)
      await makeOpponents(tournament.id, sender.id, recipient.id)

      // Recipient opts in
      await request(app)
        .patch('/player/read-receipt-preferences')
        .set('Authorization', `Bearer ${recipientTok}`)
        .send({ shareReadReceipts: true })

      // Send DM
      const dmRes = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${senderTok}`)
        .send({ recipientPlayerId: recipient.id, body: 'Test DM opted in' })
      expect(dmRes.status).toBe(201)
      const msgId = dmRes.body.id

      // Recipient reads it
      const { MessageRepository } = await import('../../repositories/message-repository')
      const repo = new MessageRepository(pool as any)
      await repo.markRead({ messageId: msgId, messageCreatedAt: new Date(), playerId: recipient.id })

      // Sender fetches history — should see recipientReadAt
      const histRes = await request(app)
        .get(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${senderTok}`)
      expect(histRes.status).toBe(200)

      const msg = histRes.body.messages.find((m: any) => m.id === msgId)
      expect(msg).toBeDefined()
      expect(msg.recipientReadAt).toBeTruthy()
    })

    it('toggling pref off hides recipientReadAt again', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: sender, sessionToken: senderTok } = await createPlayerWithSession(tournament.id)
      const { player: recipient, sessionToken: recipientTok } = await createPlayerWithSession(tournament.id)
      await makeOpponents(tournament.id, sender.id, recipient.id)

      // Recipient opts in, then opts out
      await request(app)
        .patch('/player/read-receipt-preferences')
        .set('Authorization', `Bearer ${recipientTok}`)
        .send({ shareReadReceipts: true })
      await request(app)
        .patch('/player/read-receipt-preferences')
        .set('Authorization', `Bearer ${recipientTok}`)
        .send({ shareReadReceipts: false })

      // Send DM and recipient reads it
      const dmRes = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${senderTok}`)
        .send({ recipientPlayerId: recipient.id, body: 'Test DM toggled off' })
      expect(dmRes.status).toBe(201)
      const msgId = dmRes.body.id

      const { MessageRepository } = await import('../../repositories/message-repository')
      const repo = new MessageRepository(pool as any)
      await repo.markRead({ messageId: msgId, messageCreatedAt: new Date(), playerId: recipient.id })

      // Sender fetches history — should NOT see recipientReadAt
      const histRes = await request(app)
        .get(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${senderTok}`)
      expect(histRes.status).toBe(200)

      const msg = histRes.body.messages.find((m: any) => m.id === msgId)
      expect(msg).toBeDefined()
      expect(msg.recipientReadAt).toBeUndefined()
    })

    it('organizer (viewer without playerId) never leaks recipientReadAt to arbitrary callers', async () => {
      // The organizer viewing history should not see the DM "seen" field for a third party
      const { orgToken, tournament } = await createOrganizerWithTournament()
      const { player: sender, sessionToken: senderTok } = await createPlayerWithSession(tournament.id)
      const { player: recipient, sessionToken: recipientTok } = await createPlayerWithSession(tournament.id)
      await makeOpponents(tournament.id, sender.id, recipient.id)

      // Recipient opts in
      await request(app)
        .patch('/player/read-receipt-preferences')
        .set('Authorization', `Bearer ${recipientTok}`)
        .send({ shareReadReceipts: true })

      // Send DM
      const dmRes = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${senderTok}`)
        .send({ recipientPlayerId: recipient.id, body: 'DM organizer should not see seen' })
      expect(dmRes.status).toBe(201)
      const msgId = dmRes.body.id

      const { MessageRepository } = await import('../../repositories/message-repository')
      const repo = new MessageRepository(pool as any)
      await repo.markRead({ messageId: msgId, messageCreatedAt: new Date(), playerId: recipient.id })

      // Organizer fetches history — should NOT see recipientReadAt (not the sender)
      const histRes = await request(app)
        .get(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${orgToken}`)
      expect(histRes.status).toBe(200)

      const msg = histRes.body.messages.find((m: any) => m.id === msgId)
      if (msg) {
        expect(msg.recipientReadAt).toBeUndefined()
      }
    })
  })

  // ── getBroadcastAckCount repository method ────────────────────────────────

  describe('MessageRepository.getBroadcastAckCount', () => {
    it('returns { read: 0, total: N } when no recipients have read', async () => {
      const { orgToken, tournament, organizerId } = await createOrganizerWithTournament()
      const { player: p1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)

      const sendRes = await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Repo test broadcast' })
      expect(sendRes.status).toBe(201)
      const msgId = sendRes.body.message.id

      const { MessageRepository } = await import('../../repositories/message-repository')
      const repo = new MessageRepository(pool as any)
      const count = await repo.getBroadcastAckCount(msgId)

      expect(count.read).toBe(0)
      expect(count.total).toBe(2)

      void orgToken; void p1; void p2; void organizerId
    })

    it('returns { read: 1, total: 2 } after one read', async () => {
      const { orgToken, tournament } = await createOrganizerWithTournament()
      const { player: p1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)

      const sendRes = await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Repo test broadcast 2' })
      const msgId = sendRes.body.message.id

      const { MessageRepository } = await import('../../repositories/message-repository')
      const repo = new MessageRepository(pool as any)

      await repo.markRead({ messageId: msgId, messageCreatedAt: new Date(), playerId: p1.id })

      const count = await repo.getBroadcastAckCount(msgId)
      expect(count.read).toBe(1)
      expect(count.total).toBe(2)

      void p2
    })
  })
})
