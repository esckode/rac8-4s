/**
 * ISSUE-15 — Doubles partner: three competing mechanisms consolidated into one
 * email-based entry point on POST /:tournamentId/register (`partnerEmail`).
 *
 * The backend resolves the partner email to one of three outcomes:
 *   (A) belongs to a registered account       → in-app notification, no email
 *   (B) belongs to an existing player (guest)  → magic link (existing playerId)
 *   (C) never seen before                      → partner-invite email; the
 *       player row + pairing are created at accept time (POST
 *       /:tournamentId/partner-invites/accept), so the 18+ attestation gate
 *       is satisfied by the partner themselves, not the requester.
 *
 * Either way the requester's own registration goes to pending_partner_confirm
 * until the partner accepts (PATCH /tournaments/registrations/:id/confirm for
 * A/B, or the accept endpoint for C).
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
import { issueOrganizerToken } from '../../auth/tokens'
import { PlayerRepository, AccountRepository } from '../../db'
import { TournamentFactory, OrganizerFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import { clearRateLimitStore } from '../../middleware/rate-limit'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-15 — doubles partner invite by email', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let emailAdapter: InMemoryEmailAdapter
  let jwtConfig: JwtConfig
  let playerRepo: PlayerRepository
  let accountRepo: AccountRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    emailAdapter = deps.emailAdapter
    jwtConfig = deps.jwtConfig
    playerRepo = new PlayerRepository(pool)
    accountRepo = new AccountRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  beforeEach(() => {
    clearRateLimitStore()
    emailAdapter.clear()
  })

  async function openDoubles(overrides: Record<string, unknown> = {}) {
    const organizerId = OrganizerFactory.id()
    return TournamentFactory.open(pool, organizerId, { matchFormat: 'doubles', ...overrides })
  }

  // Plain string search rather than a RegExp built from an argument — the
  // token is a fixed-width hex string, so there is nothing to match loosely.
  function extractToken(body: string, pathFragment: string): string {
    const marker = `${pathFragment}?token=`
    const start = body.indexOf(marker)
    if (start === -1) throw new Error(`token not found in email for ${pathFragment}: ${body}`)
    return body.slice(start + marker.length, start + marker.length + 64)
  }

  async function registerRequester(tournamentId: string, opts: { partnerEmail?: string; email?: string } = {}) {
    return request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({
        email: opts.email ?? `req-${uid()}@test.local`,
        name: 'Requester',
        dob_attestation: defaultAdultAttestation(),
        ...(opts.partnerEmail ? { partnerEmail: opts.partnerEmail } : {}),
      })
  }

  async function createAccountWithPlayer(name = 'Account Partner') {
    const email = `acct-partner-${uid()}@test.local`
    const player = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    const account = await accountRepo.create(email, 'player')
    await accountRepo.linkPlayer(account.id, player.id)
    return { email, player, account }
  }

  async function createGuestPlayer(name = 'Guest Partner') {
    const email = `guest-partner-${uid()}@test.local`
    const player = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    return { email, player }
  }

  async function playerSession(playerId: string, tournamentId: string, email: string) {
    const s = await generatePlayerSession({ playerId, tournamentId, email, createdAt: Date.now() }, 3600, tokenStore)
    return s.token
  }

  describe('branch A — partner email belongs to a registered account', () => {
    it('sets pending state, notifies in-app, and sends no email to the partner', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer } = await createAccountWithPlayer()
      const requesterEmail = `req-${uid()}@test.local`

      const res = await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })
      expect(res.status).toBe(202)
      expect(res.body.partner?.status).toBe('pending_partner_confirm')

      expect(emailAdapter.getSentTo(partnerEmail)).toHaveLength(0)

      const targetReg = await playerRepo.findRegistration(partnerPlayer.id, tournament!.id)
      expect(targetReg?.status).toBe('pending_partner_confirm')

      const notif = await pool.query(
        `SELECT gm.body, gm.metadata FROM messaging.group_messages gm
         JOIN messaging.conversations c ON c.id = gm.conversation_id
         WHERE c.type = 'personal' AND c.player_id = $1`,
        [partnerPlayer.id]
      )
      expect(notif.rows.length).toBeGreaterThan(0)

      // The deep link is the whole point of branch A: NotificationCard turns
      // metadata.registrationId into a link to the confirm page, so a
      // notification without it is a dead end for the invited partner.
      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)
      const metadata = notif.rows[0].metadata
      expect(metadata).toMatchObject({
        tournamentId: tournament!.id,
        registrationId: requesterReg!.id,
      })
    })

    it('the partner confirms via PATCH .../confirm, linking both sides', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer } = await createAccountWithPlayer()
      const requesterEmail = `req-${uid()}@test.local`

      await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })

      // Confirm operates on the REQUESTER's registration (partner_id points
      // at the confirming player) — mirrors partner-requests.spec.ts.
      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)
      const token = await playerSession(partnerPlayer.id, tournament!.id, partnerEmail)

      const confirmRes = await request(app)
        .patch(`/tournaments/registrations/${requesterReg!.id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
      expect(confirmRes.status).toBe(200)

      const finalRequester = await playerRepo.findRegistrationById(requesterReg!.id)
      expect(finalRequester?.status).toBe('registered')

      const finalTarget = await playerRepo.findRegistration(partnerPlayer.id, tournament!.id)
      expect(finalTarget?.status).toBe('registered')
      expect(finalTarget?.partner_confirmed).toBe(true)
    })

    it('rejects an invite to an already-partnered player (409)', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer } = await createAccountWithPlayer()

      // partnerPlayer is already confirmed-paired with someone else
      const other = await playerRepo.findOrCreatePlayerByEmail(
        `other-${uid()}@test.local`, 'Other', undefined, undefined, defaultAdultAttestation()
      )
      await playerRepo.createRegistration(partnerPlayer.id, tournament!.id)
      await playerRepo.createRegistration(other.id, tournament!.id)
      const partnerReg = await playerRepo.findRegistration(partnerPlayer.id, tournament!.id)
      await playerRepo.updateRegistrationWithPartner(partnerReg!.id, other.id)
      await playerRepo.confirmPartner(partnerReg!.id)

      const res = await registerRequester(tournament!.id, { partnerEmail })
      expect(res.status).toBe(409)
    })
  })

  describe('branch B — no account, but the partner already has a player row', () => {
    it('sets pending state and sends a magic link to the partner (not a notification-only path)', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer } = await createGuestPlayer()

      const res = await registerRequester(tournament!.id, { partnerEmail })
      expect(res.status).toBe(202)
      expect(res.body.partner?.status).toBe('pending_partner_confirm')

      const sent = emailAdapter.getSentTo(partnerEmail)
      expect(sent).toHaveLength(1)

      const targetReg = await playerRepo.findRegistration(partnerPlayer.id, tournament!.id)
      expect(targetReg?.status).toBe('pending_partner_confirm')
    })
  })

  describe('branch C — brand-new partner email (no player row at all)', () => {
    it('holds pending state on the requester and sends a partner-invite email', async () => {
      const tournament = await openDoubles()
      const partnerEmail = `brand-new-${uid()}@test.local`

      const res = await registerRequester(tournament!.id, { partnerEmail })
      expect(res.status).toBe(202)
      expect(res.body.partner?.status).toBe('pending_partner_confirm')

      const sent = emailAdapter.getSentTo(partnerEmail)
      expect(sent).toHaveLength(1)

      const playerRow = await pool.query(`SELECT id FROM public.players WHERE LOWER(email) = LOWER($1)`, [partnerEmail])
      expect(playerRow.rows).toHaveLength(0) // no player row created yet
    })

    it('accept creates the player with attestation, links both sides, and returns a session', async () => {
      const tournament = await openDoubles()
      const partnerEmail = `brand-new-accept-${uid()}@test.local`
      const requesterEmail = `req-${uid()}@test.local`

      await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })
      const sent = emailAdapter.getSentTo(partnerEmail)
      const token = extractToken(sent[0].body, `/tournament/${tournament!.id}/partner-invite`)

      const acceptRes = await request(app)
        .post(`/tournaments/${tournament!.id}/partner-invites/accept`)
        .send({ token, email: partnerEmail, name: 'New Partner', dob_attestation: defaultAdultAttestation() })

      expect(acceptRes.status).toBe(200)
      expect(typeof acceptRes.body.token).toBe('string')

      const partnerPlayer = await playerRepo.findByEmail(partnerEmail)
      expect(partnerPlayer).toBeDefined()

      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)
      const partnerReg = await playerRepo.findRegistration(partnerPlayer!.id, tournament!.id)

      expect(requesterReg?.status).toBe('registered')
      expect(requesterReg?.partner_id).toBe(partnerPlayer!.id)
      expect(partnerReg?.status).toBe('registered')
      expect(partnerReg?.partner_id).toBe(requesterPlayer!.id)
    })

    it('accept requires attestation for a genuinely new partner (400 AGE_ATTESTATION_REQUIRED)', async () => {
      const tournament = await openDoubles()
      const partnerEmail = `brand-new-noattest-${uid()}@test.local`

      await registerRequester(tournament!.id, { partnerEmail })
      const sent = emailAdapter.getSentTo(partnerEmail)
      const token = extractToken(sent[0].body, `/tournament/${tournament!.id}/partner-invite`)

      const res = await request(app)
        .post(`/tournaments/${tournament!.id}/partner-invites/accept`)
        .send({ token, email: partnerEmail, name: 'New Partner' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('AGE_ATTESTATION_REQUIRED')
    })

    it('accept token is email-bound — a different email is rejected (400)', async () => {
      const tournament = await openDoubles()
      const partnerEmail = `brand-new-bound-${uid()}@test.local`

      await registerRequester(tournament!.id, { partnerEmail })
      const sent = emailAdapter.getSentTo(partnerEmail)
      const token = extractToken(sent[0].body, `/tournament/${tournament!.id}/partner-invite`)

      const res = await request(app)
        .post(`/tournaments/${tournament!.id}/partner-invites/accept`)
        .send({ token, email: `attacker-${uid()}@test.local`, name: 'Attacker', dob_attestation: defaultAdultAttestation() })

      expect(res.status).toBe(400)
    })
  })

  describe('capacity hold (sub-decision 1)', () => {
    it('a pending brand-new invite blocks an unrelated solo registrant once max_players is reached', async () => {
      const tournament = await openDoubles({ maxPlayers: 2 })
      const partnerEmail = `capacity-hold-${uid()}@test.local`

      const first = await registerRequester(tournament!.id, { partnerEmail })
      expect(first.status).toBe(202)

      const blocked = await registerRequester(tournament!.id)
      expect(blocked.status).toBe(409)
      expect(blocked.body.code).toBe('TOURNAMENT_FULL')
    })
  })

  describe('rate limiting the partner address (sub-decision 2)', () => {
    it('trips after repeated invites to the same partner email across different tournaments', async () => {
      const partnerEmail = `rl-partner-${uid()}@test.local`

      for (let i = 0; i < 2; i++) {
        const tournament = await openDoubles()
        const res = await registerRequester(tournament!.id, { partnerEmail })
        expect(res.status).toBe(202)
      }

      const tournament = await openDoubles()
      const res = await registerRequester(tournament!.id, { partnerEmail })
      expect(res.status).toBe(429)
      expect(res.body.code).toBe('RATE_LIMITED')
    })
  })

  describe('accept after deadline (sub-decision 3)', () => {
    it('confirm succeeds past the registration deadline when the invite predates it', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer } = await createAccountWithPlayer()
      const requesterEmail = `req-${uid()}@test.local`

      await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })
      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)

      // Simulate organizer-closed registration with a deadline that came
      // just after the invite was sent — the invite still predates it.
      const deadlineAfterInvite = new Date(new Date(requesterReg!.registered_at).getTime() + 1)
      await pool.query(
        `UPDATE public.tournaments SET status = 'registration_closed', registration_deadline = $1 WHERE id = $2`,
        [deadlineAfterInvite, tournament!.id]
      )

      const token = await playerSession(partnerPlayer.id, tournament!.id, partnerEmail)
      const confirmRes = await request(app)
        .patch(`/tournaments/registrations/${requesterReg!.id}/confirm`)
        .set('Authorization', `Bearer ${token}`)

      expect(confirmRes.status).toBe(200)
    })
  })

  // Helper: age a tournament's registrations so the invite hold looks stale.
  async function ageRegistrations(tournamentId: string, days: number) {
    await pool.query(
      `UPDATE public.player_registrations
       SET registered_at = NOW() - ($2 * INTERVAL '1 day')
       WHERE tournament_id = $1`,
      [tournamentId, days]
    )
  }

  describe('confirm accepts a registered account JWT, not just a magic-link session', () => {
    // Branch A notifies an account holder and deep-links them to the confirm
    // page, which sends their ACCOUNT JWT — the token type they actually hold.
    // Confirm previously took requirePlayerSessionAuth only, so the branch the
    // ticket led with 401'd end to end.
    it('lets the invited account holder confirm with their account JWT', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer, account } = await createAccountWithPlayer()
      const requesterEmail = `req-${uid()}@test.local`

      await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })
      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)

      const accountToken = issueOrganizerToken(
        { sub: account.id, email: partnerEmail, playerId: partnerPlayer.id },
        jwtConfig
      ).accessToken

      const res = await request(app)
        .patch(`/tournaments/registrations/${requesterReg!.id}/confirm`)
        .set('Authorization', `Bearer ${accountToken}`)

      expect(res.status).toBe(200)
      expect(res.body.partnerConfirmed).toBe(true)
    })

    it('still rejects an account JWT belonging to someone else', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail } = await createAccountWithPlayer()
      const requesterEmail = `req-${uid()}@test.local`

      await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })
      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)

      const outsider = await createAccountWithPlayer('Outsider')
      await playerRepo.createRegistration(outsider.player.id, tournament!.id)
      const outsiderToken = issueOrganizerToken(
        { sub: outsider.account.id, email: outsider.email, playerId: outsider.player.id },
        jwtConfig
      ).accessToken

      const res = await request(app)
        .patch(`/tournaments/registrations/${requesterReg!.id}/confirm`)
        .set('Authorization', `Bearer ${outsiderToken}`)

      expect(res.status).toBe(403)
    })
  })

  describe('confirm window closes once the tournament starts (sub-decision 3 bound)', () => {
    // The deadline exception is for "the requester acted in time", not a
    // blanket bypass: once play starts, teams are already in groups, so a
    // late confirm would inject an unplaced pair.
    it('refuses a confirm after the group stage has started', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer } = await createGuestPlayer()
      const requesterEmail = `req-${uid()}@test.local`

      await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })
      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)

      await pool.query(`UPDATE public.tournaments SET status = 'group_stage_active' WHERE id = $1`, [tournament!.id])

      const token = await playerSession(partnerPlayer.id, tournament!.id, partnerEmail)
      const res = await request(app)
        .patch(`/tournaments/registrations/${requesterReg!.id}/confirm`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(409)
    })

    it('refuses a brand-new-partner accept after the group stage has started', async () => {
      const tournament = await openDoubles()
      const partnerEmail = `late-accept-${uid()}@test.local`

      await registerRequester(tournament!.id, { partnerEmail })
      const token = extractToken(emailAdapter.getSentTo(partnerEmail)[0].body, `/tournament/${tournament!.id}/partner-invite`)

      await pool.query(`UPDATE public.tournaments SET status = 'group_stage_active' WHERE id = $1`, [tournament!.id])

      const res = await request(app)
        .post(`/tournaments/${tournament!.id}/partner-invites/accept`)
        .send({ token, email: partnerEmail, name: 'Late Partner', dob_attestation: defaultAdultAttestation() })

      expect(res.status).toBe(409)
    })
  })

  describe('the capacity hold expires with its token (sub-decision 1)', () => {
    // The hold must not outlive the invite token it reserves a slot for —
    // otherwise an invite to a dead address squats a spot forever.
    it('stops blocking new registrations once the invite token has expired', async () => {
      const tournament = await openDoubles({ maxPlayers: 2 })
      await registerRequester(tournament!.id, { partnerEmail: `dead-address-${uid()}@test.local` })

      await ageRegistrations(tournament!.id, 30)

      const res = await registerRequester(tournament!.id)
      expect(res.status).toBe(202)
    })

    it('lets the requester re-invite once their own invite has expired', async () => {
      const tournament = await openDoubles()
      const requesterEmail = `req-${uid()}@test.local`
      await registerRequester(tournament!.id, { partnerEmail: `typo-${uid()}@test.local`, email: requesterEmail })

      await ageRegistrations(tournament!.id, 30)

      const res = await registerRequester(tournament!.id, {
        partnerEmail: `corrected-${uid()}@test.local`,
        email: requesterEmail,
      })
      expect(res.status).toBe(202)
      expect(res.body.partner?.status).toBe('pending_partner_confirm')
    })

    it('still blocks a re-invite while the invite is live', async () => {
      const tournament = await openDoubles()
      const requesterEmail = `req-${uid()}@test.local`
      await registerRequester(tournament!.id, { partnerEmail: `first-${uid()}@test.local`, email: requesterEmail })

      const res = await registerRequester(tournament!.id, {
        partnerEmail: `second-${uid()}@test.local`,
        email: requesterEmail,
      })
      expect(res.status).toBe(409)
    })
  })

  describe('cancelling a pending partner invite', () => {
    it('reports the pending invite, then reports none after cancelling', async () => {
      const tournament = await openDoubles()
      const requesterEmail = `req-${uid()}@test.local`
      await registerRequester(tournament!.id, { partnerEmail: `pending-${uid()}@test.local`, email: requesterEmail })

      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)
      const token = await playerSession(requesterPlayer!.id, tournament!.id, requesterEmail)

      const before = await request(app)
        .get(`/tournaments/${tournament!.id}/my-partner-invite`)
        .set('Authorization', `Bearer ${token}`)
      expect(before.status).toBe(200)
      expect(before.body.pending).toBe(true)
      expect(before.body.registrationId).toBe(requesterReg!.id)

      const cancel = await request(app)
        .delete(`/tournaments/registrations/${requesterReg!.id}/partner-invite`)
        .set('Authorization', `Bearer ${token}`)
      expect(cancel.status).toBe(200)

      const after = await request(app)
        .get(`/tournaments/${tournament!.id}/my-partner-invite`)
        .set('Authorization', `Bearer ${token}`)
      expect(after.body.pending).toBe(false)

      const reg = await playerRepo.findRegistrationById(requesterReg!.id)
      expect(reg?.status).toBe('registered')
      expect(reg?.partner_id).toBeNull()
    })

    it('frees the held capacity slot', async () => {
      const tournament = await openDoubles({ maxPlayers: 2 })
      const requesterEmail = `req-${uid()}@test.local`
      await registerRequester(tournament!.id, { partnerEmail: `held-${uid()}@test.local`, email: requesterEmail })

      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)
      const token = await playerSession(requesterPlayer!.id, tournament!.id, requesterEmail)

      expect((await registerRequester(tournament!.id)).status).toBe(409)

      await request(app)
        .delete(`/tournaments/registrations/${requesterReg!.id}/partner-invite`)
        .set('Authorization', `Bearer ${token}`)

      expect((await registerRequester(tournament!.id)).status).toBe(202)
    })

    it('releases an invited existing player back to solo', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer } = await createGuestPlayer()
      const requesterEmail = `req-${uid()}@test.local`
      await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })

      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)
      const token = await playerSession(requesterPlayer!.id, tournament!.id, requesterEmail)

      const cancel = await request(app)
        .delete(`/tournaments/registrations/${requesterReg!.id}/partner-invite`)
        .set('Authorization', `Bearer ${token}`)
      expect(cancel.status).toBe(200)

      const partnerReg = await playerRepo.findRegistration(partnerPlayer.id, tournament!.id)
      expect(partnerReg?.status).toBe('registered')
      expect(partnerReg?.partner_id).toBeNull()
    })

    it('only the requester can cancel their invite', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer } = await createGuestPlayer()
      const requesterEmail = `req-${uid()}@test.local`
      await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })

      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)
      const partnerToken = await playerSession(partnerPlayer.id, tournament!.id, partnerEmail)

      const res = await request(app)
        .delete(`/tournaments/registrations/${requesterReg!.id}/partner-invite`)
        .set('Authorization', `Bearer ${partnerToken}`)

      expect(res.status).toBe(403)
    })

    it('refuses to cancel a partnership that is already confirmed', async () => {
      const tournament = await openDoubles()
      const { email: partnerEmail, player: partnerPlayer } = await createGuestPlayer()
      const requesterEmail = `req-${uid()}@test.local`
      await registerRequester(tournament!.id, { partnerEmail, email: requesterEmail })

      const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
      const requesterReg = await playerRepo.findRegistration(requesterPlayer!.id, tournament!.id)
      await playerRepo.confirmPartner(requesterReg!.id)

      const token = await playerSession(requesterPlayer!.id, tournament!.id, requesterEmail)
      const res = await request(app)
        .delete(`/tournaments/registrations/${requesterReg!.id}/partner-invite`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(409)
      expect(partnerPlayer.id).toBeDefined()
    })
  })

  describe('cleanup — old select/invite mechanisms removed', () => {
    it('ignores the legacy partnerSelection body field (registers as solo, no partner set)', async () => {
      const tournament = await openDoubles()
      const email = `legacy-${uid()}@test.local`

      const res = await request(app)
        .post(`/tournaments/${tournament!.id}/register`)
        .send({
          email,
          name: 'Legacy Caller',
          dob_attestation: defaultAdultAttestation(),
          partnerSelection: { type: 'invite', value: `partner-${uid()}@test.local` },
        })

      expect(res.status).toBe(202)
      expect(res.body.partner).toBeUndefined()

      const player = await playerRepo.findByEmail(email)
      const reg = await playerRepo.findRegistration(player!.id, tournament!.id)
      expect(reg?.partner_id).toBeNull()
      expect(reg?.status).toBe('registered')
    })
  })
})
