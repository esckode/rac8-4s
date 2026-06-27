/**
 * G1.3 — Integration tests: group-invite flow
 *
 * Routes under test (mounted at /player/groups):
 *   POST   /player/groups/:groupId/invites            — owner sends an email-bound invite
 *   POST   /player/groups/:groupId/invites/accept      — invitee accepts (age-gated, single-use)
 *
 * Negative / security cases:
 *  - Non-owner (member) cannot create an invite (403)
 *  - Unauthenticated invite creation (401)
 *  - Invalid / reused token on accept (400 / 401)
 *  - New invitee must supply age attestation (400)
 *  - Under-18 invitee hard-rejected (400)
 *  - NO group-wide shareable link path (assert route does not accept omitted email)
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { InMemoryEmailAdapter } from '../../email-adapter'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string }> {
  const repo = new PlayerRepository(pool)
  const email = `gi-${uid()}@test.local`
  const player = await repo.findOrCreatePlayerByEmail(
    email,
    `Inviter ${uid()}`,
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
    {
      playerId: player.id,
      tournamentId: crypto.randomUUID(),
      email: player.email,
      createdAt: Date.now(),
    },
    3600,
    tokenStore
  )
  return session.token
}

describe('G1.3 — Group invite flow', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let emailAdapter: InMemoryEmailAdapter
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    emailAdapter = deps.emailAdapter
    jwtConfig = deps.jwtConfig
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // Helper: create a group (owner created via direct SQL shortcut — reuses G1.2 create route)
  async function createGroup(ownerToken: string): Promise<{ id: string }> {
    const res = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Invite Test Group ${uid()}` })
    expect(res.status).toBe(201)
    return { id: res.body.id }
  }

  // Helper: add member directly to group
  async function addMember(groupId: string, playerId: string, role = 'member'): Promise<void> {
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role)
       VALUES ($1, $2, $3)`,
      [groupId, playerId, role]
    )
  }

  // Helper: extract invite token from sent email
  function extractTokenFromEmail(body: string): string {
    // Token is embedded in the accept URL: /player/groups/:id/invites/accept?token=<hex>
    const match = body.match(/token=([0-9a-f]{64})/)
    if (!match) throw new Error(`Could not find invite token in email body: ${body}`)
    return match[1]
  }

  // ─── Invite creation: owner-only ─────────────────────────────────────────────

  describe('POST /player/groups/:groupId/invites — owner-only invite creation', () => {
    it('owner can create an invite → 201 + email sent', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)
      const inviteeEmail = `invitee-${uid()}@test.local`

      emailAdapter.clear()
      const res = await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({ email: inviteeEmail })

      expect(res.status).toBe(201)

      // Email was dispatched
      const sent = emailAdapter.getSentTo(inviteeEmail)
      expect(sent).toHaveLength(1)
      expect(sent[0].subject).toMatch(/invite/i)
    })

    it('NEGATIVE: non-owner member cannot create an invite (403)', async () => {
      const owner = await createPlayer(pool)
      const member = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const memberTok = await playerToken(member, tokenStore)
      const group = await createGroup(ownerTok)

      await addMember(group.id, member.id)

      const res = await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${memberTok}`)
        .send({ email: `invitee-${uid()}@test.local` })

      expect(res.status).toBe(403)
    })

    it('NEGATIVE: unauthenticated invite creation → 401', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)

      const res = await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .send({ email: `invitee-${uid()}@test.local` })

      expect(res.status).toBe(401)
    })

    it('NEGATIVE: non-member/outsider cannot create an invite (403)', async () => {
      const owner = await createPlayer(pool)
      const outsider = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const outsiderTok = await playerToken(outsider, tokenStore)
      const group = await createGroup(ownerTok)

      const res = await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${outsiderTok}`)
        .send({ email: `invitee-${uid()}@test.local` })

      expect(res.status).toBe(403)
    })

    it('NEGATIVE: missing email field → 400', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)

      const res = await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({})

      expect(res.status).toBe(400)
    })

    it('NEGATIVE: no group-wide shareable link route (no POST without email accepted)', async () => {
      // The invite creation route MUST require an email — no body-less "get a shareable link" path
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)

      // An empty body (no email) is explicitly rejected
      const res = await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({ email: '' })

      expect(res.status).toBe(400)
    })
  })

  // ─── Invite accept: age-gated, single-use ────────────────────────────────────

  describe('POST /player/groups/:groupId/invites/accept', () => {
    it('new invitee with attestation accepts and becomes a member', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)
      const inviteeEmail = `new-invitee-${uid()}@test.local`

      emailAdapter.clear()
      await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({ email: inviteeEmail })

      const sent = emailAdapter.getSentTo(inviteeEmail)
      expect(sent).toHaveLength(1)
      const token = extractTokenFromEmail(sent[0].body)

      // Accept with attestation (new player)
      const dob = new Date()
      dob.setFullYear(dob.getFullYear() - 25)
      const res = await request(app)
        .post(`/player/groups/${group.id}/invites/accept`)
        .send({
          token,
          email: inviteeEmail,
          name: `New Invitee ${uid()}`,
          ageAttestation: { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' },
        })

      expect(res.status).toBe(200)

      // Invitee is now a member of the group
      const members = await pool.query(
        `SELECT player_id, role FROM public.player_group_members WHERE group_id = $1`,
        [group.id]
      )
      const emails = await pool.query(
        `SELECT email FROM public.players WHERE id = ANY($1::text[])`,
        [members.rows.map((r: any) => r.player_id)]
      )
      const memberEmails = emails.rows.map((r: any) => r.email)
      expect(memberEmails).toContain(inviteeEmail.toLowerCase())
    })

    it('existing player (bypasses age gate) accepts and becomes a member', async () => {
      const owner = await createPlayer(pool)
      const existingInvitee = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)

      emailAdapter.clear()
      await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({ email: existingInvitee.email })

      const sent = emailAdapter.getSentTo(existingInvitee.email)
      expect(sent).toHaveLength(1)
      const token = extractTokenFromEmail(sent[0].body)

      // Existing player does NOT need to supply attestation (player already exists)
      const res = await request(app)
        .post(`/player/groups/${group.id}/invites/accept`)
        .send({
          token,
          email: existingInvitee.email,
          name: existingInvitee.email, // name is ignored for existing players
        })

      expect(res.status).toBe(200)

      const members = await pool.query(
        `SELECT player_id FROM public.player_group_members WHERE group_id = $1 AND player_id = $2`,
        [group.id, existingInvitee.id]
      )
      expect(members.rows).toHaveLength(1)
    })

    it('NEGATIVE: invalid token is rejected (400)', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)

      const res = await request(app)
        .post(`/player/groups/${group.id}/invites/accept`)
        .send({
          token: 'a'.repeat(64),
          email: `any-${uid()}@test.local`,
          name: 'Someone',
        })

      expect(res.status).toBe(400)
    })

    it('NEGATIVE: reused token is rejected (400)', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)
      const inviteeEmail = `reuse-${uid()}@test.local`

      emailAdapter.clear()
      await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({ email: inviteeEmail })

      const sent = emailAdapter.getSentTo(inviteeEmail)
      const token = extractTokenFromEmail(sent[0].body)

      const dob = new Date()
      dob.setFullYear(dob.getFullYear() - 20)
      const body = {
        token,
        email: inviteeEmail,
        name: `Reuse Test ${uid()}`,
        ageAttestation: { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' },
      }

      // First accept succeeds
      const first = await request(app)
        .post(`/player/groups/${group.id}/invites/accept`)
        .send(body)
      expect(first.status).toBe(200)

      // Second accept with same token → rejected (token consumed)
      const second = await request(app)
        .post(`/player/groups/${group.id}/invites/accept`)
        .send(body)
      expect(second.status).toBe(400)
    })

    it('NEGATIVE: wrong email cannot accept the token (400)', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)
      const inviteeEmail = `target-${uid()}@test.local`

      emailAdapter.clear()
      await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({ email: inviteeEmail })

      const sent = emailAdapter.getSentTo(inviteeEmail)
      const token = extractTokenFromEmail(sent[0].body)

      // Attacker with different email tries to accept
      const dob = new Date()
      dob.setFullYear(dob.getFullYear() - 22)
      const res = await request(app)
        .post(`/player/groups/${group.id}/invites/accept`)
        .send({
          token,
          email: `attacker-${uid()}@test.local`,
          name: 'Attacker',
          ageAttestation: { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' },
        })

      expect(res.status).toBe(400)
    })

    it('NEGATIVE: new invitee without attestation is rejected (400)', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)
      const inviteeEmail = `no-attest-${uid()}@test.local`

      emailAdapter.clear()
      await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({ email: inviteeEmail })

      const sent = emailAdapter.getSentTo(inviteeEmail)
      const token = extractTokenFromEmail(sent[0].body)

      // No ageAttestation supplied for a brand-new player
      const res = await request(app)
        .post(`/player/groups/${group.id}/invites/accept`)
        .send({
          token,
          email: inviteeEmail,
          name: `No Attest ${uid()}`,
          // no ageAttestation
        })

      expect(res.status).toBe(400)
    })

    it('NEGATIVE: under-18 invitee is hard-rejected (400)', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)
      const inviteeEmail = `underage-${uid()}@test.local`

      emailAdapter.clear()
      await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({ email: inviteeEmail })

      const sent = emailAdapter.getSentTo(inviteeEmail)
      const token = extractTokenFromEmail(sent[0].body)

      // Under-18 DOB
      const dob = new Date()
      dob.setFullYear(dob.getFullYear() - 16)
      const res = await request(app)
        .post(`/player/groups/${group.id}/invites/accept`)
        .send({
          token,
          email: inviteeEmail,
          name: `Underage ${uid()}`,
          ageAttestation: { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' },
        })

      expect(res.status).toBe(400)

      // No player row created
      const playerRow = await pool.query(
        `SELECT id FROM public.players WHERE LOWER(email) = LOWER($1)`,
        [inviteeEmail]
      )
      expect(playerRow.rows).toHaveLength(0)
    })

    it('accept is idempotent for already-a-member (no duplicate member row)', async () => {
      // If the player is already a member, re-accepting should not create a duplicate
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)

      // Use the owner themselves as the invitee (they are already a member)
      emailAdapter.clear()
      await request(app)
        .post(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)
        .send({ email: owner.email })

      const sent = emailAdapter.getSentTo(owner.email)
      const token = extractTokenFromEmail(sent[0].body)

      const res = await request(app)
        .post(`/player/groups/${group.id}/invites/accept`)
        .send({
          token,
          email: owner.email,
          name: 'Already Member',
        })

      // Should succeed (or return 200/already-member) without creating a duplicate
      expect([200, 409]).toContain(res.status)

      const rows = await pool.query(
        `SELECT player_id FROM public.player_group_members WHERE group_id = $1 AND player_id = $2`,
        [group.id, owner.id]
      )
      expect(rows.rows).toHaveLength(1) // exactly one row
    })
  })

  // ─── Assert NO shareable / group-wide link path ───────────────────────────────

  describe('No shareable / group-wide link path exists', () => {
    it('GET /player/groups/:groupId/invites does not exist (404)', async () => {
      const owner = await createPlayer(pool)
      const ownerTok = await playerToken(owner, tokenStore)
      const group = await createGroup(ownerTok)

      const res = await request(app)
        .get(`/player/groups/${group.id}/invites`)
        .set('Authorization', `Bearer ${ownerTok}`)

      // No GET invite-list / shareable-link route
      expect(res.status).toBe(404)
    })
  })
})
