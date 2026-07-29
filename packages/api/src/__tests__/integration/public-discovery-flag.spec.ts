/**
 * UAT ISSUE-29 — public tournament discovery + self-serve registration is
 * blocked while publicDiscoveryEnabled is off (default). A single
 * server-authoritative switch: GET /api/config surfaces it to the frontend,
 * and POST /:tournamentId/register 404s rather than being deleted — the
 * invite paths (magic-link join, partner-invite accept, group invite) are
 * unaffected since none of them call this route.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, OrganizerFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'

describe('GET /api/config (ISSUE-29)', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('reflects publicDiscoveryEnabled=false by default', async () => {
    const { app } = createTestApp(pool)
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ publicDiscoveryEnabled: false })
  })

  it('reflects publicDiscoveryEnabled=true when configured on', async () => {
    const { app } = createTestApp(pool, { config: { publicDiscoveryEnabled: true } })
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ publicDiscoveryEnabled: true })
  })
})

describe('POST /:tournamentId/register — gated behind publicDiscoveryEnabled (ISSUE-29)', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('returns 404 when publicDiscoveryEnabled is false (default)', async () => {
    const deps = createTestApp(pool)
    app = deps.app
    jwtConfig = deps.jwtConfig
    const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, organizerId)

    const res = await request(app)
      .post(`/tournaments/${tournament!.id}/register`)
      .send({ email: 'blocked@test.local', name: 'Blocked Player' })

    expect(res.status).toBe(404)
  })

  it('registers normally when publicDiscoveryEnabled is true — the machinery still works', async () => {
    const deps = createTestApp(pool, { config: { publicDiscoveryEnabled: true } })
    app = deps.app
    jwtConfig = deps.jwtConfig
    const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, organizerId)

    const res = await request(app)
      .post(`/tournaments/${tournament!.id}/register`)
      .send({ email: 'allowed@test.local', name: 'Allowed Player', dob_attestation: defaultAdultAttestation() })

    expect(res.status).toBe(202)
  })
})
