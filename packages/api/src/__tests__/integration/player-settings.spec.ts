/**
 * S1.1 — Player Personalization P0: `player_settings` store (RED first)
 *
 * Table exists with typed columns; GET /api/auth/me returns a `settings`
 * block (defaults when no row); PATCH /api/auth/me/settings lazily upserts
 * and round-trips; DSR export includes the settings row; DSR erasure
 * removes it; a hard-delete of the player row cascades the FK.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { AccountRepository, PlayerRepository } from '../../db'
import { DataSubjectRequestService } from '../../dsr-service'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

let pool: Pool
let app: Express
let accountRepo: AccountRepository
let playerRepo: PlayerRepository

async function loginAndGetToken(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password })
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function createLinkedAccountToken(): Promise<{ token: string; playerId: string; email: string }> {
  const email = `settings-${uid()}@test.local`
  const password = 'testpassword123'

  const player = await playerRepo.findOrCreatePlayerByEmail(
    email,
    `Player ${uid()}`,
    undefined,
    undefined,
    defaultAdultAttestation()
  )

  const account = await accountRepo.create(email, 'player')
  const passwordHash = await bcryptjs.hash(password, 10)
  await accountRepo.updatePasswordHash(account.id, passwordHash)
  await accountRepo.linkPlayer(account.id, player.id)

  const token = await loginAndGetToken(email, password)
  return { token, playerId: player.id, email }
}

describe('S1.1 — player_settings store', () => {
  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    accountRepo = new AccountRepository(pool)
    playerRepo = new PlayerRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('table exists with typed columns and defaults', async () => {
    const res = await pool.query(
      `SELECT column_name, data_type, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'player_settings'`
    )
    const byName = new Map(res.rows.map((r: any) => [r.column_name, r]))
    expect(byName.has('player_id')).toBe(true)
    expect(byName.has('timezone')).toBe(true)
    expect(byName.has('timezone_manual')).toBe(true)
    expect(byName.has('table_density')).toBe(true)
  })

  it('GET /api/auth/me returns a settings block with defaults when no row exists', async () => {
    const { token } = await createLinkedAccountToken()

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.settings).toMatchObject({
      timezone: null,
      timezoneManual: false,
      tableDensity: 'comfortable',
    })
  })

  it('PATCH /api/auth/me/settings lazily upserts and round-trips', async () => {
    const { token } = await createLinkedAccountToken()

    const patchRes = await request(app)
      .patch('/api/auth/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableDensity: 'compact', timezone: 'America/New_York', timezoneManual: true })

    expect(patchRes.status).toBe(200)
    expect(patchRes.body.settings).toMatchObject({
      timezone: 'America/New_York',
      timezoneManual: true,
      tableDensity: 'compact',
    })

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(meRes.body.settings).toMatchObject({
      timezone: 'America/New_York',
      timezoneManual: true,
      tableDensity: 'compact',
    })
  })

  it('PATCH rejects an invalid tableDensity', async () => {
    const { token } = await createLinkedAccountToken()

    const res = await request(app)
      .patch('/api/auth/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableDensity: 'huge' })

    expect(res.status).toBe(400)
  })

  it('requires authentication', async () => {
    const res = await request(app).patch('/api/auth/me/settings').send({ tableDensity: 'compact' })
    expect(res.status).toBe(401)
  })

  it('DSR export includes the settings row', async () => {
    const { token, email } = await createLinkedAccountToken()
    await request(app)
      .patch('/api/auth/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableDensity: 'compact' })

    const dsr = new DataSubjectRequestService(pool)
    const result = await dsr.export(email)

    expect(result.status).toBe('exported')
    if (result.status === 'exported') {
      expect(result.data.settings).toMatchObject({ tableDensity: 'compact' })
    }
  })

  it('DSR erasure removes the settings row', async () => {
    const { token, email, playerId } = await createLinkedAccountToken()
    await request(app)
      .patch('/api/auth/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableDensity: 'compact' })

    const dsr = new DataSubjectRequestService(pool)
    const eraseResult = await dsr.erase(email)
    expect(eraseResult.status).toBe('erased')

    const row = await pool.query(`SELECT 1 FROM public.player_settings WHERE player_id = $1`, [playerId])
    expect(row.rows).toHaveLength(0)
  })

  it('deleting a player row cascades the settings row (FK enforcement)', async () => {
    const email = `cascade-${uid()}@test.local`
    const player = await playerRepo.findOrCreatePlayerByEmail(
      email,
      `Player ${uid()}`,
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    await pool.query(
      `INSERT INTO public.player_settings (player_id, table_density) VALUES ($1, 'compact')`,
      [player.id]
    )

    await pool.query(`DELETE FROM public.players WHERE id = $1`, [player.id])

    const row = await pool.query(`SELECT 1 FROM public.player_settings WHERE player_id = $1`, [player.id])
    expect(row.rows).toHaveLength(0)
  })
})
