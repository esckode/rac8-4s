import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory } from '../factories'
import { AccountRepository } from '../../db'
import { issueOrganizerToken } from '../../auth/tokens'
import { InMemoryTokenStore } from '../../auth/token-store'
import { defaultAdultAttestation } from '../factories/player.factory'

const ADULT_ATTESTATION = defaultAdultAttestation()

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function decodeJwtPayload(token: string): any {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))
}

/**
 * Dual-role (organizer-as-participant): capabilities derive from role (authority)
 * + player_id (participation), with no new role and no schema change.
 *  - login/`/me` carry the linked playerId.
 *  - an organizer who registers as a player gets account.player_id linked.
 *  - an organizer JWT carrying a playerId + a registration may use participant endpoints.
 */
describe('Dual-role: organizer-as-participant', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let accountRepo: AccountRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    jwtConfig = deps.jwtConfig
    void (deps.tokenStore as InMemoryTokenStore)
    accountRepo = new AccountRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('login and /me carry the linked playerId', async () => {
    const email = `dual-${uid()}@test.local`
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ email, name: 'Dual', password: 'password123', dob_attestation: ADULT_ATTESTATION })
    expect(signup.status).toBe(201)
    const linkedPlayerId = decodeJwtPayload(signup.body.token).playerId
    expect(linkedPlayerId).toBeTruthy()

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
    expect(login.status).toBe(200)
    expect(decodeJwtPayload(login.body.token).playerId).toBe(linkedPlayerId)

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(me.status).toBe(200)
    expect(me.body.playerId).toBe(linkedPlayerId)
  })

  it('links account.player_id when an authenticated organizer registers with their own email', async () => {
    const email = `org-${uid()}@test.local`
    const account = await accountRepo.create(email, 'organizer')
    expect(account.player_id).toBeNull()

    const orgToken = issueOrganizerToken({ sub: account.id, email }, jwtConfig).accessToken
    const tournament = await TournamentFactory.open(pool, account.id)

    const reg = await request(app)
      .post(`/tournaments/${tournament!.id}/register`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ email, name: 'Org Player', dob_attestation: ADULT_ATTESTATION })
    expect(reg.status).toBe(202)

    const refreshed = await accountRepo.findById(account.id)
    expect(refreshed!.player_id).toBeTruthy()
  })

  it('lets an organizer JWT carrying a playerId use participant endpoints when registered', async () => {
    const email = `orgp-${uid()}@test.local`
    const account = await accountRepo.create(email, 'organizer')
    const orgToken = issueOrganizerToken({ sub: account.id, email }, jwtConfig).accessToken
    const tournament = await TournamentFactory.open(pool, account.id)
    await request(app)
      .post(`/tournaments/${tournament!.id}/register`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ email, name: 'Org Player', dob_attestation: ADULT_ATTESTATION })

    const linked = await accountRepo.findById(account.id)
    // A fresh token now carries the linked playerId (as login would issue).
    const tokenWithPlayer = issueOrganizerToken(
      { sub: account.id, email, playerId: linked!.player_id! },
      jwtConfig
    ).accessToken

    const res = await request(app)
      .get('/player/tournaments')
      .set('Authorization', `Bearer ${tokenWithPlayer}`)
    expect(res.status).toBe(200)
    expect(res.body.tournaments.map((t: any) => t.id)).toContain(tournament!.id)
  })
})
