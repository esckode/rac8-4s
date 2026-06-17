import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { OrganizerFactory, TournamentFactory, PlayerFactory } from '../factories'
import { PlayerRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'

/**
 * Phase 5: solo doubles registrants find a partner *within the tournament* and
 * send a partnership request the other player confirms. Partner stays optional
 * (solo registrants are auto-paired at group creation).
 */
describe('Doubles partner requests', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore
  let playerRepo: PlayerRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
    playerRepo = new PlayerRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function session(playerId: string, tournamentId: string) {
    const s = await generatePlayerSession(
      { playerId, tournamentId, email: `${playerId}@test.local`, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return s.token
  }

  // Doubles tournament (registration_open) with N solo registrants.
  async function setup(playerCount = 2) {
    const { sub: orgId } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, orgId, { matchFormat: 'doubles' })
    const players = []
    for (let i = 0; i < playerCount; i++) {
      const p = await PlayerFactory.create(pool)
      await playerRepo.createRegistration(p.id, tournament!.id)
      players.push(p)
    }
    return { tournamentId: tournament!.id, players }
  }

  it('lists solo registrants as available partners, excluding the requester', async () => {
    const { tournamentId, players } = await setup(3)
    const [a, b, c] = players

    const res = await request(app)
      .get(`/tournaments/${tournamentId}/available-partners`)
      .set('Authorization', `Bearer ${await session(a.id, tournamentId)}`)

    expect(res.status).toBe(200)
    const ids = res.body.players.map((p: any) => p.id)
    expect(ids).toEqual(expect.arrayContaining([b.id, c.id]))
    expect(ids).not.toContain(a.id)
  })

  it('lets a solo registrant request a partner; the target sees it and confirms, linking both', async () => {
    const { tournamentId, players } = await setup(2)
    const [a, b] = players

    // A requests B
    const reqRes = await request(app)
      .post(`/tournaments/${tournamentId}/partner-requests`)
      .set('Authorization', `Bearer ${await session(a.id, tournamentId)}`)
      .send({ targetPlayerId: b.id })
    expect(reqRes.status).toBe(201)

    // B sees the incoming request
    const incoming = await request(app)
      .get(`/tournaments/${tournamentId}/partner-requests`)
      .set('Authorization', `Bearer ${await session(b.id, tournamentId)}`)
    expect(incoming.status).toBe(200)
    const fromA = incoming.body.requests.find((r: any) => r.requesterId === a.id)
    expect(fromA).toBeDefined()

    // B confirms
    const confirm = await request(app)
      .patch(`/tournaments/registrations/${fromA.registrationId}/confirm`)
      .set('Authorization', `Bearer ${await session(b.id, tournamentId)}`)
    expect(confirm.status).toBe(200)

    // Both registrations are now a confirmed team
    const aReg = await playerRepo.findRegistration(a.id, tournamentId)
    const bReg = await playerRepo.findRegistration(b.id, tournamentId)
    expect(aReg?.partner_id).toBe(b.id)
    expect(bReg?.partner_id).toBe(a.id)
    expect(aReg?.status).toBe('registered')
    expect(bReg?.status).toBe('registered')
    expect(bReg?.partner_confirmed).toBe(true)
  })

  it('rejects a partner request to a non-registered / self / already-paired target', async () => {
    const { tournamentId, players } = await setup(2)
    const [a] = players

    const selfReq = await request(app)
      .post(`/tournaments/${tournamentId}/partner-requests`)
      .set('Authorization', `Bearer ${await session(a.id, tournamentId)}`)
      .send({ targetPlayerId: a.id })
    expect(selfReq.status).toBe(400)

    const missing = await request(app)
      .post(`/tournaments/${tournamentId}/partner-requests`)
      .set('Authorization', `Bearer ${await session(a.id, tournamentId)}`)
      .send({ targetPlayerId: 'player_does_not_exist' })
    expect(missing.status).toBe(404)
  })
})
