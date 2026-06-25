/**
 * V5.1 — Backend: thread-grouped history + targeting
 *
 * Tests for:
 * 1. Opponent-only DM authorization (positive + NEGATIVE cases)
 * 2. Thread-grouped/filterable history (announcements, dm, match threads)
 * 3. DM viewer isolation (viewer cannot read another pair's DM thread)
 * 4. Dispute threads with legal_hold support
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

describe('V5.1 — Messaging threads & targeting', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jwtConfig: JwtConfig
  let broadcastBus: BroadcastBus
  let jobQueue: InMemoryJobQueue

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)

    broadcastBus = new BroadcastBus()
    jobQueue = new InMemoryJobQueue()
    const testApp = createTestApp(pool, { broadcastBus, jobQueue })
    app = testApp.app
    tokenStore = testApp.tokenStore
    jwtConfig = testApp.jwtConfig
  })

  afterAll(async () => {
    await rollbackTransaction()
    await closeTestPool()
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

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

  /**
   * Insert a singles group match pairing two players.
   * This is the minimal SQL to make two players "opponents" for authz.
   * groups.id is TEXT (not UUID); groups has no updated_at column.
   */
  async function createGroupMatch(
    tournamentId: string,
    player1Id: string,
    player2Id: string
  ): Promise<string> {
    // Need a group_id — create a group first (TEXT PK, no updated_at)
    const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await pool.query(
      `INSERT INTO public.groups (id, tournament_id, name, created_at)
       VALUES ($1, $2, 'Test Group', now())`,
      [groupId, tournamentId]
    )

    const matchId = `gm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await pool.query(
      `INSERT INTO public.group_matches
         (id, group_id, tournament_id, format, player1_id, player2_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'singles', $4, $5, 'pending', now(), now())`,
      [matchId, groupId, tournamentId, player1Id, player2Id]
    )
    return matchId
  }

  async function createKnockoutMatch(
    tournamentId: string,
    player1Id: string,
    player2Id: string
  ): Promise<string> {
    const matchId = `km_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await pool.query(
      `INSERT INTO public.knockout_matches
         (id, tournament_id, round, position, format, player1_id, player2_id, status, created_at, updated_at)
       VALUES ($1, $2, 1, 1, 'singles', $3, $4, 'pending', now(), now())`,
      [matchId, tournamentId, player1Id, player2Id]
    )
    return matchId
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Opponent-only DM authorization
  // ──────────────────────────────────────────────────────────────────────────

  describe('Opponent-only DM authorization', () => {
    it('NEGATIVE: player cannot DM another player who is NOT an opponent (returns 403)', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: sender, sessionToken } = await createPlayerWithSession(tournament.id)
      const { player: nonOpponent } = await createPlayerWithSession(tournament.id)
      // No match created between sender and nonOpponent

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ recipientPlayerId: nonOpponent.id, body: 'Hello stranger' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('POSITIVE: player CAN DM an opponent they share a group match with', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: sender, sessionToken } = await createPlayerWithSession(tournament.id)
      const { player: opponent } = await createPlayerWithSession(tournament.id)

      await createGroupMatch(tournament.id, sender.id, opponent.id)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ recipientPlayerId: opponent.id, body: 'See you on court 2 at 3pm' })

      expect(res.status).toBe(201)
      expect(res.body.recipientPlayerId).toBe(opponent.id)
    })

    it('POSITIVE: player CAN DM an opponent from a knockout match', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: sender, sessionToken } = await createPlayerWithSession(tournament.id)
      const { player: opponent } = await createPlayerWithSession(tournament.id)

      await createKnockoutMatch(tournament.id, sender.id, opponent.id)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ recipientPlayerId: opponent.id, body: 'Good luck in the semis!' })

      expect(res.status).toBe(201)
    })

    it('POSITIVE: opponent check is symmetric (player2 can also DM player1)', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: player1 } = await createPlayerWithSession(tournament.id)
      const { player: player2, sessionToken: session2 } = await createPlayerWithSession(tournament.id)

      await createGroupMatch(tournament.id, player1.id, player2.id)

      // player2 DMs player1 (they are player2 in the match)
      const res = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${session2}`)
        .send({ recipientPlayerId: player1.id, body: 'Ready when you are' })

      expect(res.status).toBe(201)
    })

    it('NEGATIVE: match in a DIFFERENT tournament does not grant DM permission', async () => {
      const { tournament: t1 } = await createOrganizerWithTournament()
      const { tournament: t2 } = await createOrganizerWithTournament()

      // Players registered in both tournaments, but match is in t2
      const { player: sender, sessionToken } = await createPlayerWithSession(t1.id)
      const { player: opponent } = await createPlayerWithSession(t1.id)
      // Register both players in t2 as well
      const playerRepo2 = new (await import('../../db')).PlayerRepository(pool)
      await playerRepo2.createRegistration(sender.id, t2.id).catch(() => { /* ignore duplicate */ })
      await playerRepo2.createRegistration(opponent.id, t2.id).catch(() => { /* ignore duplicate */ })
      await createGroupMatch(t2.id, sender.id, opponent.id)

      // Sending DM in t1 — match is in t2, so NOT an opponent in t1
      const res = await request(app)
        .post(`/tournaments/${t1.id}/messages`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ recipientPlayerId: opponent.id, body: 'Cross-tournament DM attempt' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('sends without recipientPlayerId still works (no authz check needed)', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { sessionToken } = await createPlayerWithSession(tournament.id)

      // Sending without recipient is now rejected (requires recipientPlayerId for DMs)
      // OR still allowed — per design: "If no recipientPlayerId, fall back to sender"
      // The old behavior allowed this; with V5.1 we require opponent check only when
      // recipientPlayerId IS provided. No recipient → still allowed.
      const res = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ body: 'Coordination note without explicit recipient' })

      // Should succeed (no recipient → no authz check) or fail with VALIDATION_ERROR
      // but NOT with FORBIDDEN
      expect(res.status).not.toBe(403)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Thread-filtered history
  // ──────────────────────────────────────────────────────────────────────────

  describe('Thread-filtered history', () => {
    it('thread=announcements returns only broadcasts (recipient_player_id IS NULL)', async () => {
      const { orgToken, tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: t1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)
      await createGroupMatch(tournament.id, p1.id, p2.id)

      // Seed an announcement
      await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'Round 1 begins now' })
        .expect(201)

      // Seed a DM
      await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: p2.id, body: 'See you there' })
        .expect(201)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages?thread=announcements`)
        .set('Authorization', `Bearer ${t1}`)

      expect(res.status).toBe(200)
      const msgs: any[] = res.body.messages
      // All returned messages are broadcasts (no recipientPlayerId)
      expect(msgs.length).toBeGreaterThan(0)
      for (const m of msgs) {
        expect(m.recipientPlayerId).toBeNull()
      }
    })

    it('thread=dm:{playerId} returns only messages in that DM thread (viewer is party)', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: t1 } = await createPlayerWithSession(tournament.id)
      const { player: p2, sessionToken: t2 } = await createPlayerWithSession(tournament.id)
      const { player: p3 } = await createPlayerWithSession(tournament.id)
      await createGroupMatch(tournament.id, p1.id, p2.id)
      await createGroupMatch(tournament.id, p1.id, p3.id)

      // DM from p1 to p2
      await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: p2.id, body: 'Message to p2' })
        .expect(201)

      // DM from p2 to p1
      await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t2}`)
        .send({ recipientPlayerId: p1.id, body: 'Reply from p2' })
        .expect(201)

      // DM from p1 to p3 (different thread)
      await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: p3.id, body: 'Message to p3' })
        .expect(201)

      // p1 fetches DM thread with p2
      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages?thread=dm:${p2.id}`)
        .set('Authorization', `Bearer ${t1}`)

      expect(res.status).toBe(200)
      const msgs: any[] = res.body.messages
      // Only messages between p1 and p2
      expect(msgs.length).toBeGreaterThanOrEqual(2)
      for (const m of msgs) {
        const parties = [m.senderPlayerId, m.recipientPlayerId]
        expect(parties).toContain(p1.id)
        expect(parties).toContain(p2.id)
        // p3 should not appear
        expect(parties).not.toContain(p3.id)
      }
    })

    it('NEGATIVE: viewer cannot read DM thread between two OTHER players', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: t1 } = await createPlayerWithSession(tournament.id)
      const { player: p2, sessionToken: t2 } = await createPlayerWithSession(tournament.id)
      const { player: p3, sessionToken: t3 } = await createPlayerWithSession(tournament.id)
      await createGroupMatch(tournament.id, p1.id, p2.id)

      // DM between p1 and p2
      await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: p2.id, body: 'Private between p1 and p2' })
        .expect(201)

      // p3 tries to read the p1↔p2 thread
      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages?thread=dm:${p2.id}`)
        .set('Authorization', `Bearer ${t3}`)

      // Should either 403 or return empty (no messages p3 is party to in that thread)
      if (res.status === 200) {
        // If 200, messages array must be empty (p3 has no messages with p2 in this context)
        const msgs: any[] = res.body.messages
        // None of these messages should involve p1 as sender (the p1→p2 message must NOT appear)
        for (const m of msgs) {
          expect(m.senderPlayerId).not.toBe(p1.id)
          // Also verify p3 is a party
          const parties = [m.senderPlayerId, m.recipientPlayerId]
          expect(parties).toContain(p3.id)
        }
      } else {
        expect(res.status).toBe(403)
      }
    })

    it('thread=match:{matchId} returns only messages scoped to that match', async () => {
      const { tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: t1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)
      const matchId = await createGroupMatch(tournament.id, p1.id, p2.id)

      // Send a match-scoped DM
      const sendRes = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: p2.id, matchId, body: 'Match coordination' })
        .expect(201)

      expect(sendRes.body.matchId).toBe(matchId)

      // Fetch with thread=match:{matchId}
      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages?thread=match:${matchId}`)
        .set('Authorization', `Bearer ${t1}`)

      expect(res.status).toBe(200)
      const msgs: any[] = res.body.messages
      expect(msgs.length).toBeGreaterThan(0)
      for (const m of msgs) {
        expect(m.matchId).toBe(matchId)
      }
    })

    it('default (no thread param) returns all messages visible to the viewer', async () => {
      const { orgToken, tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: t1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)
      await createGroupMatch(tournament.id, p1.id, p2.id)

      // Seed an announcement and a DM
      await request(app)
        .post(`/tournaments/${tournament.id}/announcements`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ body: 'All-players announcement' })
        .expect(201)

      await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: p2.id, body: 'DM to p2' })
        .expect(201)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)

      expect(res.status).toBe(200)
      // Must contain at least the announcement and the DM
      expect(res.body.messages.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Dispute thread + legal_hold
  // ──────────────────────────────────────────────────────────────────────────

  describe('Dispute thread + legal_hold', () => {
    it('a player can send a dispute DM to the organizer (matchId scoped)', async () => {
      const { organizerId, orgToken, tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: t1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)
      const matchId = await createGroupMatch(tournament.id, p1.id, p2.id)

      // Organizer is a valid recipient for dispute (exempt from opponent check)
      const res = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: organizerId, matchId, body: 'Requesting dispute review for match' })

      // Should succeed: organizer is exempt from opponent-only check
      expect(res.status).toBe(201)
      expect(res.body.matchId).toBe(matchId)
    })

    it('organizer can set legal_hold on a message via PATCH /messages/:msgId/legal-hold', async () => {
      const { organizerId, orgToken, tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: t1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)
      const matchId = await createGroupMatch(tournament.id, p1.id, p2.id)

      // Send a dispute message
      const sendRes = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: organizerId, matchId, body: 'I dispute this result' })
        .expect(201)

      const msgId = sendRes.body.id

      // Organizer sets legal_hold
      const holdRes = await request(app)
        .patch(`/tournaments/${tournament.id}/messages/${msgId}/legal-hold`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ legalHold: true })

      expect(holdRes.status).toBe(200)
      expect(holdRes.body.legalHold).toBe(true)
    })

    it('non-organizer cannot set legal_hold (returns 403)', async () => {
      const { organizerId, tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: t1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)
      const matchId = await createGroupMatch(tournament.id, p1.id, p2.id)

      // Send a dispute message
      const sendRes = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: organizerId, matchId, body: 'Dispute' })
        .expect(201)

      const msgId = sendRes.body.id

      // Player tries to set legal_hold
      const holdRes = await request(app)
        .patch(`/tournaments/${tournament.id}/messages/${msgId}/legal-hold`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ legalHold: true })

      expect(holdRes.status).toBe(403)
    })

    it('legal_hold messages are visible in match thread even when hold is true', async () => {
      const { organizerId, orgToken, tournament } = await createOrganizerWithTournament()
      const { player: p1, sessionToken: t1 } = await createPlayerWithSession(tournament.id)
      const { player: p2 } = await createPlayerWithSession(tournament.id)
      const matchId = await createGroupMatch(tournament.id, p1.id, p2.id)

      // Send and hold
      const sendRes = await request(app)
        .post(`/tournaments/${tournament.id}/messages`)
        .set('Authorization', `Bearer ${t1}`)
        .send({ recipientPlayerId: organizerId, matchId, body: 'Held message' })
        .expect(201)

      const msgId = sendRes.body.id

      await request(app)
        .patch(`/tournaments/${tournament.id}/messages/${msgId}/legal-hold`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ legalHold: true })
        .expect(200)

      // Message still visible in match thread
      const res = await request(app)
        .get(`/tournaments/${tournament.id}/messages?thread=match:${matchId}`)
        .set('Authorization', `Bearer ${t1}`)

      expect(res.status).toBe(200)
      const msgs: any[] = res.body.messages
      const held = msgs.find((m: any) => m.id === msgId)
      expect(held).toBeDefined()
      expect(held.legalHold).toBe(true)
    })
  })
})
