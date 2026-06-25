/**
 * V3.1 — Integration tests for messaging.notify job enqueue + pipeline.
 *
 * TDD commit: these tests are written BEFORE the implementation.
 *
 * Assertions:
 * 1. A broadcast via POST /tournaments/:id/announcements enqueues messaging.notify
 *    jobs for all recipients in the conversation.
 * 2. A DM via POST /tournaments/:id/messages enqueues a messaging.notify job
 *    for the recipient.
 * 3. An offline recipient (read_at IS NULL after grace) receives exactly ONE digest
 *    email from the notify pipeline (e2e through InMemoryEmailAdapter).
 * 4. A recipient who read the message receives no email.
 *
 * Uses the transactional test harness (getTestPool) for DB isolation.
 * Does NOT require Redis — processor invoked directly.
 */

import request from 'supertest'
import { Pool } from 'pg'
import { Express } from 'express'
import { getTestPool, closeTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { PlayerFactory, TournamentFactory, OrganizerFactory } from '../factories'
import { InMemoryTokenStore } from '../../auth/token-store'
import { InMemoryEmailAdapter } from '../../email-adapter'
import { BroadcastBus } from '../../broadcast-bus'
import { InMemoryJobQueue } from '@worker/job-queue'
import { generatePlayerSession } from '../../auth/magic-link'
import { MessageRepository } from '../../repositories/message-repository'
import { processMessagingNotify } from '../../workers/notify-processor'
import type { JwtConfig } from '../helpers/app'

describe('messaging.notify — integration', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let emailAdapter: InMemoryEmailAdapter
  let jwtConfig: JwtConfig
  let jobQueue: InMemoryJobQueue

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)

    jobQueue = new InMemoryJobQueue()
    const testApp = createTestApp(pool, { broadcastBus: new BroadcastBus(), jobQueue })
    app = testApp.app
    tokenStore = testApp.tokenStore
    emailAdapter = testApp.emailAdapter
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

  // ── Job enqueue on broadcast ───────────────────────────────────────────────

  describe('broadcast enqueues messaging.notify', () => {
    it('enqueues at least one messaging.notify job after a broadcast', async () => {
      jobQueue.clear()
      const { orgToken, tournament } = await createOrganizerWithTournament()
      await createPlayerWithSession(tournament.id)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Hello everyone!' })

      expect(res.status).toBe(201)

      const notifyJobs = jobQueue.getByName('messaging.notify')
      expect(notifyJobs.length).toBeGreaterThan(0)
    })

    it('enqueues one notify job per registered player (deduped)', async () => {
      jobQueue.clear()
      const { orgToken, tournament } = await createOrganizerWithTournament()
      // Register 3 players
      await createPlayerWithSession(tournament.id)
      await createPlayerWithSession(tournament.id)
      await createPlayerWithSession(tournament.id)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Round 1 starts now' })

      expect(res.status).toBe(201)

      const notifyJobs = jobQueue.getByName('messaging.notify')
      // 3 players → 3 notify jobs (each deduped by recipient)
      expect(notifyJobs.length).toBe(3)
    })
  })

  // ── Job enqueue on DM ─────────────────────────────────────────────────────

  describe('DM enqueues messaging.notify', () => {
    it('enqueues a messaging.notify job after a DM', async () => {
      jobQueue.clear()
      const { tournament } = await createOrganizerWithTournament()
      const { player: sender, sessionToken } = await createPlayerWithSession(tournament.id)
      const { player: recipient } = await createPlayerWithSession(tournament.id)

      // V5.1: sender and recipient must be matched opponents to send a DM.
      // Insert a group match to establish the opponent relationship.
      const groupId = `grp_notify_${Date.now()}`
      await pool.query(
        `INSERT INTO public.groups (id, tournament_id, name, created_at)
         VALUES ($1, $2, 'Notify Test Group', now())`,
        [groupId, tournament.id]
      )
      const matchId = `gm_notify_${Date.now()}`
      await pool.query(
        `INSERT INTO public.group_matches
           (id, group_id, tournament_id, format, player1_id, player2_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'singles', $4, $5, 'pending', now(), now())`,
        [matchId, groupId, tournament.id, sender.id, recipient.id]
      )

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ body: 'Yo, good game!', recipientPlayerId: recipient.id })

      expect(res.status).toBe(201)

      const notifyJobs = jobQueue.getByName('messaging.notify')
      expect(notifyJobs.length).toBeGreaterThan(0)
    })
  })

  // ── Debounce: burst of broadcasts collapses to one job per recipient ───────

  describe('debounce (burst → one job per recipient)', () => {
    it('collapses a burst of broadcasts into one notify job per recipient', async () => {
      jobQueue.clear()
      const { orgToken, tournament } = await createOrganizerWithTournament()
      await createPlayerWithSession(tournament.id)

      // Send 3 announcements in quick succession
      await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Announcement 1' })
      await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Announcement 2' })
      await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Announcement 3' })

      const notifyJobs = jobQueue.getByName('messaging.notify')
      // 1 player, 3 messages → still only 1 job per recipient (deduped by jobId)
      expect(notifyJobs.length).toBe(1)
    })
  })

  // ── E2E pipeline: offline → email; already-read → no email ────────────────

  describe('e2e pipeline (notify processor)', () => {
    it('offline participant receives exactly one digest email', async () => {
      emailAdapter.clear()
      const { orgToken, tournament } = await createOrganizerWithTournament()
      const { player: offlinePlayer } = await createPlayerWithSession(tournament.id)

      // Send a broadcast — offlinePlayer never reads it
      const announceRes = await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Court assignment update' })
      expect(announceRes.status).toBe(201)

      // Directly invoke the notify processor (no Redis needed — bypasses grace delay)
      // The processor queries message_recipients for unread, unnotified rows.
      const messageRepo = new MessageRepository(pool)
      const conversationRepo = new (await import('../../repositories/conversation-repository')).ConversationRepository(pool)
      const conversationId = await conversationRepo.resolveConversation(tournament.id)

      await processMessagingNotify(
        { conversationId, tournamentId: tournament.id },
        { pool, emailAdapter }
      )

      // offlinePlayer has unread message → receives exactly one digest email
      const sent = emailAdapter.getSentTo(offlinePlayer.email)
      expect(sent).toHaveLength(1)
      expect(sent[0].subject).toContain('unread')
    })

    it('participant who read the message receives no email', async () => {
      emailAdapter.clear()
      const { orgToken, tournament } = await createOrganizerWithTournament()
      const { player: readerPlayer, sessionToken } = await createPlayerWithSession(tournament.id)

      // Send a broadcast
      const announceRes = await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Schedule change' })
      expect(announceRes.status).toBe(201)

      const messageId = announceRes.body.message.id

      // Player reads the message
      const readRes = await request(app)
        .post(`/tournaments/${tournament.id}/messages/${messageId}/read`)
        .set('Authorization', `Bearer ${sessionToken}`)
      expect(readRes.status).toBe(204)

      // Flush the read receipt (directly invoke processor)
      const { processReadReceiptFlush } = await import('../../workers/read-receipt-processor')
      const jobQueue2 = jobQueue.getByName('messaging.read_receipt.flush')
      for (const job of jobQueue2) {
        await processReadReceiptFlush(job.data as any, { pool })
      }

      const conversationRepo = new (await import('../../repositories/conversation-repository')).ConversationRepository(pool)
      const conversationId = await conversationRepo.resolveConversation(tournament.id)

      await processMessagingNotify(
        { conversationId, tournamentId: tournament.id },
        { pool, emailAdapter }
      )

      // readerPlayer has read the message → NO digest email
      const sent = emailAdapter.getSentTo(readerPlayer.email)
      expect(sent).toHaveLength(0)
    })

    it('running the notify processor twice sends only one email (idempotency)', async () => {
      emailAdapter.clear()
      const { orgToken, tournament } = await createOrganizerWithTournament()
      const { player: offlinePlayer } = await createPlayerWithSession(tournament.id)

      await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Reminder: matches start at 9am' })

      const conversationRepo = new (await import('../../repositories/conversation-repository')).ConversationRepository(pool)
      const conversationId = await conversationRepo.resolveConversation(tournament.id)

      // Run the processor twice
      await processMessagingNotify({ conversationId, tournamentId: tournament.id }, { pool, emailAdapter })
      await processMessagingNotify({ conversationId, tournamentId: tournament.id }, { pool, emailAdapter })

      // Must send only ONE email total (not two)
      const sent = emailAdapter.getSentTo(offlinePlayer.email)
      expect(sent).toHaveLength(1)
    })
  })
})
