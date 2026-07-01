/**
 * P3.9 RED — Leaderboard endpoint returns name_snapshot
 *
 * The /player/groups/:groupId/leaderboard/individual and /pairs endpoints
 * must return name snapshots, not just player IDs.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { LeaderboardRepository } from '../../repositories/leaderboard-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(
  pool: Pool,
  name?: string
): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `lb-${uid()}@test.local`
  const pname = name ?? `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    email,
    pname,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, email: player.email, name: player.name ?? pname }
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

async function createGroupViaApi(app: Express, ownerToken: string): Promise<{ id: string }> {
  const res = await request(app)
    .post('/player/groups')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `LB Test Group ${uid()}` })
  expect(res.status).toBe(201)
  return { id: res.body.id }
}

describe('P3.9 — leaderboard/individual returns nameSnapshot', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('each individual leaderboard row has a nameSnapshot field', async () => {
    const owner = await createPlayer(pool, 'Alice')
    const other = await createPlayer(pool, 'Bob')
    const ownerToken = await playerToken(owner, tokenStore)

    const group = await createGroupViaApi(app, ownerToken)

    const lbRepo = new LeaderboardRepository(pool)
    await lbRepo.logMatch('tour_test', group.id, `match_${uid()}`, 'team1', [
      { playerId: owner.id, nameSnapshot: owner.name, side: 'team1' },
      { playerId: other.id, nameSnapshot: other.name, side: 'team2' },
    ])

    const res = await request(app)
      .get(`/player/groups/${group.id}/leaderboard/individual`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.leaderboard).toBeInstanceOf(Array)
    expect(res.body.leaderboard.length).toBeGreaterThan(0)
    const row = res.body.leaderboard.find((r: { playerId: string }) => r.playerId === owner.id)
    expect(row).toBeDefined()
    expect(row).toHaveProperty('nameSnapshot')
    expect(typeof row.nameSnapshot).toBe('string')
    expect(row.nameSnapshot).toBe('Alice')
  })
})

describe('P3.9 — leaderboard/pairs returns nameA and nameB', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('each pair leaderboard row has nameA and nameB fields', async () => {
    const owner = await createPlayer(pool, 'Carol')
    const other = await createPlayer(pool, 'Dan')
    const ownerToken = await playerToken(owner, tokenStore)

    const group = await createGroupViaApi(app, ownerToken)

    const lbRepo = new LeaderboardRepository(pool)
    // Doubles match: team1 = Carol+Dan vs team2 opponent pair
    const opp1 = await createPlayer(pool, 'Eve')
    const opp2 = await createPlayer(pool, 'Frank')
    await lbRepo.logMatch('tour_test', group.id, `match_${uid()}`, 'team1', [
      { playerId: owner.id, nameSnapshot: 'Carol', side: 'team1' },
      { playerId: other.id, nameSnapshot: 'Dan', side: 'team1' },
      { playerId: opp1.id, nameSnapshot: 'Eve', side: 'team2' },
      { playerId: opp2.id, nameSnapshot: 'Frank', side: 'team2' },
    ])

    const res = await request(app)
      .get(`/player/groups/${group.id}/leaderboard/pairs`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.leaderboard).toBeInstanceOf(Array)
    expect(res.body.leaderboard.length).toBeGreaterThan(0)
    const row = res.body.leaderboard[0]
    expect(row).toHaveProperty('nameA')
    expect(row).toHaveProperty('nameB')
    expect(typeof row.nameA).toBe('string')
    expect(typeof row.nameB).toBe('string')
  })
})
