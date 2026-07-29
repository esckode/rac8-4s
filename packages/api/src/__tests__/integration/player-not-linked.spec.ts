/**
 * ISSUE-24 — an account JWT with no linked playerId gets `TOKEN_INVALID` +
 * "sign in again" from every dual-auth resolver, an unbreakable loop since
 * re-authenticating cannot fix "this account has no player identity". Fixes
 * a distinct `403 PLAYER_NOT_LINKED` into all four resolvers that share the
 * session-fails → account-JWT-fallback → check playerId shape:
 * routes/player.ts's resolvePlayerId, routes/tournaments.ts's
 * resolveTournamentPlayer and resolveConfirmingPlayer. (The fourth,
 * routes/player-groups.ts's resolvePlayerSession, is covered by
 * player-groups-auth.spec.ts, updated in the same change.)
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { issueOrganizerToken } from '../../auth/tokens'
import { PlayerRepository } from '../../db'
import { TournamentFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-24 — PLAYER_NOT_LINKED distinct error code', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let playerRepo: PlayerRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    jwtConfig = deps.jwtConfig
    playerRepo = new PlayerRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  function unlinkedAccountToken(): string {
    return issueOrganizerToken(
      { sub: crypto.randomUUID(), email: `no-player-${uid()}@test.local` },
      jwtConfig
    ).accessToken
  }

  it('GET /player/tournaments returns 403 PLAYER_NOT_LINKED, not 401 TOKEN_INVALID', async () => {
    const res = await request(app)
      .get('/player/tournaments')
      .set('Authorization', `Bearer ${unlinkedAccountToken()}`)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PLAYER_NOT_LINKED')
  })

  it('GET /tournaments/:id/available-partners returns 403 PLAYER_NOT_LINKED', async () => {
    const tournament = await TournamentFactory.open(pool, crypto.randomUUID())

    const res = await request(app)
      .get(`/tournaments/${tournament!.id}/available-partners`)
      .set('Authorization', `Bearer ${unlinkedAccountToken()}`)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PLAYER_NOT_LINKED')
  })

  it('PATCH /tournaments/registrations/:id/confirm returns 403 PLAYER_NOT_LINKED', async () => {
    const tournament = await TournamentFactory.open(pool, crypto.randomUUID())
    const player = await playerRepo.findOrCreatePlayerByEmail(
      `confirmee-${uid()}@test.local`,
      'Confirmee',
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    const registration = await playerRepo.createRegistration(player.id, tournament!.id)

    const res = await request(app)
      .patch(`/tournaments/registrations/${registration.id}/confirm`)
      .set('Authorization', `Bearer ${unlinkedAccountToken()}`)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PLAYER_NOT_LINKED')
  })

  it('leaves a genuinely invalid token as 401 TOKEN_INVALID, unaffected by this fix', async () => {
    const res = await request(app)
      .get('/player/tournaments')
      .set('Authorization', 'Bearer not-a-real-token')

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('TOKEN_INVALID')
  })
})
