/**
 * ISSUE-1 — dual-auth gap: player-groups routes only accepted a guest
 * magic-link player session, rejecting a registered account's JWT even
 * when that JWT carries a linked playerId (dual-role, same shim as
 * routes/player.ts's resolvePlayerId).
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { issueOrganizerToken } from '../../auth/tokens'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-1 — player-groups dual-auth', () => {
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
    tokenStore = deps.tokenStore as InMemoryTokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('lets a registered-account JWT with a linked playerId list groups', async () => {
    const repo = new PlayerRepository(pool)
    const email = `groups-dual-${uid()}@test.local`
    const player = await repo.findOrCreatePlayerByEmail(
      email,
      `Player ${uid()}`,
      undefined,
      undefined,
      defaultAdultAttestation()
    )

    const accountToken = issueOrganizerToken(
      { sub: crypto.randomUUID(), email, playerId: player.id },
      jwtConfig
    ).accessToken

    const res = await request(app)
      .get('/player/groups')
      .set('Authorization', `Bearer ${accountToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.groups)).toBe(true)
  })

  it('still rejects an account JWT with no linked playerId', async () => {
    const accountToken = issueOrganizerToken(
      { sub: crypto.randomUUID(), email: `no-player-${uid()}@test.local` },
      jwtConfig
    ).accessToken

    const res = await request(app)
      .get('/player/groups')
      .set('Authorization', `Bearer ${accountToken}`)

    expect(res.status).toBe(401)
  })

  it('still rejects requests with no token at all', async () => {
    const res = await request(app).get('/player/groups')
    expect(res.status).toBe(401)
  })
})
