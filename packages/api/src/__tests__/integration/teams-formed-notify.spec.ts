/**
 * ISSUE-19 — No notification fires when a doubles team is formed, by any path.
 *
 * Two delivery shapes:
 *  - confirmPartner / partner-invites/accept are NOT in a transaction with
 *    anything else, so they notify inline, best-effort, from the route.
 *  - Group creation (createGroupsForDoubles) notifies via the `teams.formed`
 *    job queue, enqueued AFTER the transaction commits — never from inside
 *    it (a rollback must enqueue nothing).
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { OrganizerFactory, TournamentFactory, PlayerFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import { PlayerRepository, TournamentRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'
import { InMemoryEmailAdapter } from '../../email-adapter'
import { generatePlayerSession } from '../../auth/magic-link'
import { clearRateLimitStore } from '../../middleware/rate-limit'
import { InMemoryJobQueue } from '@worker/job-queue'
import { processTeamsFormed } from '../../workers/teams-formed-processor'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-19 — team formation notifications', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore
  let emailAdapter: InMemoryEmailAdapter
  let playerRepo: PlayerRepository
  let jobQueue: InMemoryJobQueue

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  beforeEach(() => {
    clearRateLimitStore()
    jobQueue = new InMemoryJobQueue()
    const deps = createTestApp(pool, { jobQueue, config: { publicDiscoveryEnabled: true } })
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
    emailAdapter = deps.emailAdapter
  })

  async function session(playerId: string, tournamentId: string) {
    const s = await generatePlayerSession(
      { playerId, tournamentId, email: `${playerId}@test.local`, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return s.token
  }

  async function setup(playerCount: number) {
    const { sub: orgId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, orgId, { matchFormat: 'doubles' })
    const players = []
    for (let i = 0; i < playerCount; i++) {
      const p = await PlayerFactory.create(pool)
      await playerRepo.createRegistration(p.id, tournament!.id)
      players.push(p)
    }
    return { tournamentId: tournament!.id, players, orgToken, orgId }
  }

  async function personalNotifications(playerId: string) {
    const result = await pool.query(
      `SELECT gm.body, gm.metadata FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.type = 'personal' AND c.player_id = $1
       ORDER BY gm.created_at`,
      [playerId]
    )
    return result.rows as { body: string; metadata: any }[]
  }

  function extractToken(body: string, pathFragment: string): string {
    const marker = `${pathFragment}?token=`
    const start = body.indexOf(marker)
    if (start === -1) throw new Error(`token not found in email for ${pathFragment}: ${body}`)
    return body.slice(start + marker.length, start + marker.length + 64)
  }

  // (a)
  it('confirming a partner request posts a notification to both players naming the other', async () => {
    const { tournamentId, players } = await setup(2)
    const [a, x] = players

    await request(app)
      .post(`/tournaments/${tournamentId}/partner-requests`)
      .set('Authorization', `Bearer ${await session(a.id, tournamentId)}`)
      .send({ targetPlayerId: x.id })

    const aReg = (await playerRepo.findRegistration(a.id, tournamentId))!
    const confirm = await request(app)
      .patch(`/tournaments/registrations/${aReg.id}/confirm`)
      .set('Authorization', `Bearer ${await session(x.id, tournamentId)}`)
    expect(confirm.status).toBe(200)

    const aName = (await playerRepo.findById(a.id))!.name
    const xName = (await playerRepo.findById(x.id))!.name

    const aNotifs = await personalNotifications(a.id)
    const xNotifs = await personalNotifications(x.id)

    expect(aNotifs.some(n => n.body.includes(xName))).toBe(true)
    expect(xNotifs.some(n => n.body.includes(aName))).toBe(true)
  })

  // (b)
  it('accepting an emailed invite posts a notification to both players', async () => {
    const organizerId = OrganizerFactory.id()
    const tournament = await TournamentFactory.open(pool, organizerId, { matchFormat: 'doubles' })
    const requesterEmail = `req-${uid()}@test.local`
    const partnerEmail = `brand-new-${uid()}@test.local`

    await request(app)
      .post(`/tournaments/${tournament!.id}/register`)
      .send({ email: requesterEmail, name: 'Requester', dob_attestation: defaultAdultAttestation(), partnerEmail })

    const sent = emailAdapter.getSentTo(partnerEmail)
    const token = extractToken(sent[0].body, `/tournament/${tournament!.id}/partner-invite`)

    const accept = await request(app)
      .post(`/tournaments/${tournament!.id}/partner-invites/accept`)
      .send({ token, email: partnerEmail, name: 'New Partner', dob_attestation: defaultAdultAttestation() })
    expect(accept.status).toBe(200)

    const requesterPlayer = await playerRepo.findByEmail(requesterEmail)
    const partnerPlayer = await playerRepo.findByEmail(partnerEmail)

    const requesterNotifs = await personalNotifications(requesterPlayer!.id)
    const partnerNotifs = await personalNotifications(partnerPlayer!.id)

    expect(requesterNotifs.some(n => n.body.includes('New Partner'))).toBe(true)
    expect(partnerNotifs.some(n => n.body.includes('Requester'))).toBe(true)
  })

  // (c) + (e)
  it('the teams.formed processor notifies chosen and auto-paired teams differently, given committed state', async () => {
    const { tournamentId, players, orgToken } = await setup(4)
    const [a, b, c, d] = players

    // A<->B is a chosen, confirmed pair. C and D are solo leftovers who will
    // be auto-paired at group creation.
    const aReg = (await playerRepo.findRegistration(a.id, tournamentId))!
    await playerRepo.updateRegistrationWithPartner(aReg.id, b.id)
    await playerRepo.confirmPartner(aReg.id)

    await new TournamentRepository(pool).updateStatus(tournamentId, 'registration_closed')
    const groupsRes = await request(app)
      .post(`/tournaments/${tournamentId}/groups`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ numGroups: 1, advancingPerGroup: 1 })
    expect(groupsRes.status).toBe(201)

    await processTeamsFormed({ tournamentId }, { pool })

    const aName = (await playerRepo.findById(a.id))!.name
    const bName = (await playerRepo.findById(b.id))!.name
    const cName = (await playerRepo.findById(c.id))!.name
    const dName = (await playerRepo.findById(d.id))!.name

    const aNotifs = await personalNotifications(a.id)
    const cNotifs = await personalNotifications(c.id)

    const chosenNotif = aNotifs.find(n => n.body.includes(bName))
    const autoNotif = cNotifs.find(n => n.body.includes(dName) || n.body.includes(cName))

    expect(chosenNotif).toBeDefined()
    expect(autoNotif).toBeDefined()
    // The wording must differ so a player can tell "you picked this partner"
    // from "we picked one for you".
    expect(chosenNotif!.body).not.toBe(autoNotif!.body.replace(dName, bName))
    void aName
  })

  // (d)
  it('a leftover marked unpaired is notified', async () => {
    // A<->B confirmed; C, D, E solo (odd leftover count) so the auto-pair
    // shuffle leaves exactly one of them unpaired. 5 players clears the
    // doubles group-creation minimum (numGroups * 4 = 4).
    const { tournamentId, players, orgToken } = await setup(5)
    const [a, b] = players

    const aReg = (await playerRepo.findRegistration(a.id, tournamentId))!
    await playerRepo.updateRegistrationWithPartner(aReg.id, b.id)
    await playerRepo.confirmPartner(aReg.id)

    await new TournamentRepository(pool).updateStatus(tournamentId, 'registration_closed')
    const groupsRes = await request(app)
      .post(`/tournaments/${tournamentId}/groups`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ numGroups: 1, advancingPerGroup: 1 })
    expect(groupsRes.status).toBe(201)

    const leftovers = players.slice(2)
    const leftoverRegs = await Promise.all(leftovers.map(p => playerRepo.findRegistration(p.id, tournamentId)))
    const unpaired = leftovers[leftoverRegs.findIndex(r => r?.status === 'unpaired')]
    expect(unpaired).toBeDefined()

    await processTeamsFormed({ tournamentId }, { pool })

    const notifs = await personalNotifications(unpaired.id)
    expect(notifs.length).toBeGreaterThan(0)
  })

  // (f)
  it('group creation that throws deep inside the transaction enqueues no teams.formed job', async () => {
    const { tournamentId, orgToken } = await setup(4)
    // All 4 solo, pairUnpaired=false — no teams can be formed at all, so
    // createGroupsForDoubles's own `teamIds.length < numGroups` guard fires
    // and rolls back deep inside the repo, before the route ever reaches
    // the post-commit enqueue.
    await new TournamentRepository(pool).updateStatus(tournamentId, 'registration_closed')
    const groupsRes = await request(app)
      .post(`/tournaments/${tournamentId}/groups`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ numGroups: 1, advancingPerGroup: 1, pairUnpaired: false })
    expect(groupsRes.status).toBeGreaterThanOrEqual(400)

    expect(jobQueue.getByName('teams.formed')).toHaveLength(0)
  })

  it('group creation that succeeds enqueues exactly one teams.formed job', async () => {
    const { tournamentId, orgToken } = await setup(4)
    await new TournamentRepository(pool).updateStatus(tournamentId, 'registration_closed')
    const groupsRes = await request(app)
      .post(`/tournaments/${tournamentId}/groups`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ numGroups: 1, advancingPerGroup: 1 })
    expect(groupsRes.status).toBe(201)

    const jobs = jobQueue.getByName('teams.formed')
    expect(jobs).toHaveLength(1)
    expect(jobs[0].data).toEqual({ tournamentId })
  })
})
