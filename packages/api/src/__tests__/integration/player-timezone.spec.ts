/**
 * S2.1/S2.3 — Player Personalization P1: timezone hierarchy (RED first)
 *
 * P1a: a group-message POST carrying a browser timezone auto-follows into
 * player_settings.timezone UNLESS the player has manually set one (sticky);
 * resetting to auto (timezoneManual: false) makes the next POST re-follow.
 * P1b: PATCH /player/groups/:groupId {groupTimezone} is owner-only and
 * derives the effective group timezone (pin > member majority > null).
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
import { PlayerSettingsRepository } from '../../repositories/player-settings-repository'
import { resolveEffectiveGroupTimezone } from '../../group-timezone'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string }> {
  const repo = new PlayerRepository(pool)
  const email = `tz-${uid()}@test.local`
  const player = await repo.findOrCreatePlayerByEmail(
    email,
    `Player ${uid()}`,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, email: player.email }
}

async function playerToken(player: { id: string; email: string }, tokenStore: InMemoryTokenStore): Promise<string> {
  const session = await generatePlayerSession(
    { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
    3600,
    tokenStore
  )
  return session.token
}

describe('S2.1 — player tz auto-follow', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let settingsRepo: PlayerSettingsRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    settingsRepo = new PlayerSettingsRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function createGroup(ownerToken: string): Promise<string> {
    const res = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Tz Group ${uid()}` })
    expect(res.status).toBe(201)
    return res.body.id
  }

  it('auto-follows the browser tz on message POST when not manually set', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const groupId = await createGroup(token)

    const res = await request(app)
      .post(`/player/groups/${groupId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'hello', timezone: 'America/New_York' })
    expect(res.status).toBe(201)

    const settings = await settingsRepo.getOrDefaults(owner.id)
    expect(settings.timezone).toBe('America/New_York')
    expect(settings.timezoneManual).toBe(false)
  })

  it('does not overwrite a manually-set timezone', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const groupId = await createGroup(token)

    // Manual set goes through PATCH /api/auth/me/settings in production (an
    // account-JWT route, exercised in player-settings.spec.ts); this test's
    // session is a player magic-link session, so set it directly via the
    // repository to isolate the auto-follow behavior under test.
    await settingsRepo.upsert(owner.id, { timezone: 'Asia/Tokyo', timezoneManual: true })

    await request(app)
      .post(`/player/groups/${groupId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'hello', timezone: 'America/New_York' })

    const settings = await settingsRepo.getOrDefaults(owner.id)
    expect(settings.timezone).toBe('Asia/Tokyo')
    expect(settings.timezoneManual).toBe(true)
  })

  it('reset-to-auto (timezoneManual: false) makes the next POST re-follow', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const groupId = await createGroup(token)

    await settingsRepo.upsert(owner.id, { timezone: 'Asia/Tokyo', timezoneManual: true })
    await settingsRepo.upsert(owner.id, { timezoneManual: false })

    await request(app)
      .post(`/player/groups/${groupId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'hello', timezone: 'America/New_York' })

    const settings = await settingsRepo.getOrDefaults(owner.id)
    expect(settings.timezone).toBe('America/New_York')
  })
})

describe('S2.3 — group timezone (owner pin + majority derivation)', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let settingsRepo: PlayerSettingsRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    settingsRepo = new PlayerSettingsRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function createGroup(ownerToken: string): Promise<string> {
    const res = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Tz Group ${uid()}` })
    expect(res.status).toBe(201)
    return res.body.id
  }

  it('PATCH groupTimezone is owner-only (member → 403)', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const memberTok = await playerToken(member, tokenStore)
    const groupId = await createGroup(ownerTok)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [groupId, member.id]
    )

    const res = await request(app)
      .patch(`/player/groups/${groupId}`)
      .set('Authorization', `Bearer ${memberTok}`)
      .send({ groupTimezone: 'Asia/Tokyo' })

    expect(res.status).toBe(403)
  })

  it('owner can pin and later clear the group timezone', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const groupId = await createGroup(token)

    const pinRes = await request(app)
      .patch(`/player/groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ groupTimezone: 'Asia/Tokyo' })
    expect(pinRes.status).toBe(200)
    expect(pinRes.body.groupTimezone).toBe('Asia/Tokyo')

    const clearRes = await request(app)
      .patch(`/player/groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ groupTimezone: null })
    expect(clearRes.status).toBe(200)
    expect(clearRes.body.groupTimezone).toBeNull()
  })

  it('effective tz = pin when set, else the member majority, else null', async () => {
    const owner = await createPlayer(pool)
    const member1 = await createPlayer(pool)
    const member2 = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const groupId = await createGroup(token)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member'), ($1, $3, 'member')`,
      [groupId, member1.id, member2.id]
    )

    // No pin, no member timezones yet → null
    expect(await resolveEffectiveGroupTimezone(pool, groupId)).toBeNull()

    // Majority derivation
    await settingsRepo.upsert(owner.id, { timezone: 'America/New_York' })
    await settingsRepo.upsert(member1.id, { timezone: 'America/New_York' })
    await settingsRepo.upsert(member2.id, { timezone: 'Europe/London' })
    expect(await resolveEffectiveGroupTimezone(pool, groupId)).toBe('America/New_York')

    // Owner pin wins over majority
    await request(app)
      .patch(`/player/groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ groupTimezone: 'Asia/Tokyo' })
    expect(await resolveEffectiveGroupTimezone(pool, groupId)).toBe('Asia/Tokyo')
  })
})
