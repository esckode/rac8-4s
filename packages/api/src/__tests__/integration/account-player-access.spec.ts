import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { OrganizerFactory, TournamentFactory } from '../factories'
import { InMemoryTokenStore } from '../../auth/token-store'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

/**
 * P1 reachability: a registered player (account JWT carrying playerId) must be
 * able to use the tournament-scoped player endpoints — not just magic-link guests.
 * Participation is verified by DB registration, since an account JWT is not
 * tournament-scoped.
 */
describe('Registered player (account JWT) access to player endpoints (P1)', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // Sign up an account (links + carries playerId) and return its JWT + email.
  async function signupAccount(): Promise<{ token: string; email: string }> {
    const email = `acct-${uid()}@test.local`
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email, name: 'Acct Player', password: 'password123' })
    expect(res.status).toBe(201)
    return { token: res.body.token, email }
  }

  // Create a singles tournament in group stage; register `emails` as players.
  async function tournamentInGroupStage(orgToken: string, orgId: string, emails: string[]) {
    const tournament = await TournamentFactory.open(pool, orgId)
    for (const email of emails) {
      const r = await request(app)
        .post(`/tournaments/${tournament!.id}/register`)
        .send({ email, name: 'Player' })
      expect(r.status).toBe(202)
    }
    await request(app)
      .post(`/tournaments/${tournament!.id}/advance`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ action: 'CLOSE_REGISTRATION' })
    const groupsRes = await request(app)
      .post(`/tournaments/${tournament!.id}/groups`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ numGroups: 1, advancingPerGroup: 1 })
    expect(groupsRes.status).toBe(201)
    return tournament!.id
  }

  it('loads the bundle with the account JWT when the player is registered', async () => {
    const { sub: orgId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const player = await signupAccount()
    const tournamentId = await tournamentInGroupStage(orgToken, orgId, [player.email, `other-${uid()}@test.local`])

    const res = await request(app)
      .get(`/tournaments/${tournamentId}/bundle`)
      .set('Authorization', `Bearer ${player.token}`)

    expect(res.status).toBe(200)
    expect(res.body.matches.group.length).toBeGreaterThan(0)
  })

  it('submits a score with the account JWT when the player is a match participant', async () => {
    const { sub: orgId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const player = await signupAccount()
    const tournamentId = await tournamentInGroupStage(orgToken, orgId, [player.email, `other-${uid()}@test.local`])

    const bundle = await request(app)
      .get(`/tournaments/${tournamentId}/bundle`)
      .set('Authorization', `Bearer ${player.token}`)
    const matchId = bundle.body.matches.group[0].id

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
      .set('Authorization', `Bearer ${player.token}`)
      .send({ score: '6-4, 6-3' })

    expect(res.status).toBe(200)
    expect(res.body.match.status).toBe('completed')
  })

  it('lists the player tournaments with the account JWT', async () => {
    const { sub: orgId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const player = await signupAccount()
    const tournamentId = await tournamentInGroupStage(orgToken, orgId, [player.email, `other-${uid()}@test.local`])

    const res = await request(app)
      .get('/player/tournaments')
      .set('Authorization', `Bearer ${player.token}`)

    expect(res.status).toBe(200)
    expect(res.body.tournaments.map((t: any) => t.id)).toContain(tournamentId)
  })

  it('forbids the bundle for an account whose player is not registered in the tournament', async () => {
    const { sub: orgId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const outsider = await signupAccount()
    // Tournament with two OTHER players; the outsider is not registered.
    const tournamentId = await tournamentInGroupStage(orgToken, orgId, [
      `a-${uid()}@test.local`,
      `b-${uid()}@test.local`,
    ])

    const res = await request(app)
      .get(`/tournaments/${tournamentId}/bundle`)
      .set('Authorization', `Bearer ${outsider.token}`)

    expect(res.status).toBe(403)
  })
})
