/**
 * S7.1 — Player Personalization P12: availability (RED first)
 *
 * migration 056 `player_availability` (player_id FK cascade, weekday 0-6,
 * day_part morning/afternoon/evening, PK triple — a row's existence IS "I'm
 * free"). GET/PUT /api/auth/me/availability is full-grid-replace,
 * owner-only by construction (caller-scoped, no target playerId param) —
 * dual-auth like pending-actions, since a group-chat visitor is a
 * player-session identity. DSR export includes it; erasure cascades.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { AccountRepository, PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { AvailabilityRepository } from '../../repositories/availability-repository'
import { DataSubjectRequestService } from '../../dsr-service'
import { generatePlayerSession } from '../../auth/magic-link'
import type { InMemoryTokenStore } from '../../auth/token-store'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

let pool: Pool
let app: Express
let tokenStore: InMemoryTokenStore
let accountRepo: AccountRepository
let playerRepo: PlayerRepository
let availabilityRepo: AvailabilityRepository

async function loginAndGetToken(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password })
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function createLinkedAccountToken(): Promise<{ token: string; playerId: string; email: string }> {
  const email = `avail-${uid()}@test.local`
  const password = 'testpassword123'
  const player = await playerRepo.findOrCreatePlayerByEmail(email, `Player ${uid()}`, undefined, undefined, defaultAdultAttestation())
  const account = await accountRepo.create(email, 'player')
  const passwordHash = await bcryptjs.hash(password, 10)
  await accountRepo.updatePasswordHash(account.id, passwordHash)
  await accountRepo.linkPlayer(account.id, player.id)
  const token = await loginAndGetToken(email, password)
  return { token, playerId: player.id, email }
}

describe('S7.1 — GET/PUT /api/auth/me/availability', () => {
  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    accountRepo = new AccountRepository(pool)
    playerRepo = new PlayerRepository(pool)
    availabilityRepo = new AvailabilityRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('table exists with the documented columns and PK', async () => {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'player_availability'`
    )
    const names = new Set(res.rows.map((r: any) => r.column_name))
    expect(names.has('player_id')).toBe(true)
    expect(names.has('weekday')).toBe(true)
    expect(names.has('day_part')).toBe(true)
    expect(names.has('updated_at')).toBe(true)
  })

  it('requires authentication for both GET and PUT', async () => {
    expect((await request(app).get('/api/auth/me/availability')).status).toBe(401)
    expect((await request(app).put('/api/auth/me/availability').send({ slots: [] })).status).toBe(401)
  })

  it('GET returns an empty grid and null updatedAt when nothing is set', async () => {
    const { token } = await createLinkedAccountToken()
    const res = await request(app).get('/api/auth/me/availability').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ slots: [], updatedAt: null })
  })

  it('PUT replaces the full grid and round-trips via GET, stamping updatedAt', async () => {
    const { token } = await createLinkedAccountToken()
    const slots = [{ weekday: 1, dayPart: 'evening' }, { weekday: 6, dayPart: 'morning' }]

    const putRes = await request(app).put('/api/auth/me/availability').set('Authorization', `Bearer ${token}`).send({ slots })
    expect(putRes.status).toBe(200)

    const getRes = await request(app).get('/api/auth/me/availability').set('Authorization', `Bearer ${token}`)
    expect(getRes.body.slots).toHaveLength(2)
    expect(getRes.body.slots).toEqual(expect.arrayContaining(slots))
    expect(getRes.body.updatedAt).not.toBeNull()
  })

  it('a second PUT fully replaces the grid (old slots not selected again are gone)', async () => {
    const { token } = await createLinkedAccountToken()
    await request(app).put('/api/auth/me/availability').set('Authorization', `Bearer ${token}`)
      .send({ slots: [{ weekday: 1, dayPart: 'evening' }] })
    await request(app).put('/api/auth/me/availability').set('Authorization', `Bearer ${token}`)
      .send({ slots: [{ weekday: 2, dayPart: 'morning' }] })

    const res = await request(app).get('/api/auth/me/availability').set('Authorization', `Bearer ${token}`)
    expect(res.body.slots).toEqual([{ weekday: 2, dayPart: 'morning' }])
  })

  it('PUT rejects an invalid day_part', async () => {
    const { token } = await createLinkedAccountToken()
    const res = await request(app).put('/api/auth/me/availability').set('Authorization', `Bearer ${token}`)
      .send({ slots: [{ weekday: 1, dayPart: 'midnight' }] })
    expect(res.status).toBe(400)
  })

  it('PUT rejects an out-of-range weekday', async () => {
    const { token } = await createLinkedAccountToken()
    const res = await request(app).put('/api/auth/me/availability').set('Authorization', `Bearer ${token}`)
      .send({ slots: [{ weekday: 7, dayPart: 'morning' }] })
    expect(res.status).toBe(400)
  })

  it('also authenticates via a magic-link player-session token (dual-auth, same pattern as pending-actions)', async () => {
    const player = await playerRepo.findOrCreatePlayerByEmail(`avail-session-${uid()}@test.local`, `Player ${uid()}`, undefined, undefined, defaultAdultAttestation())
    const session = await generatePlayerSession(
      { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
      3600,
      tokenStore
    )

    const putRes = await request(app).put('/api/auth/me/availability').set('Authorization', `Bearer ${session.token}`)
      .send({ slots: [{ weekday: 3, dayPart: 'afternoon' }] })
    expect(putRes.status).toBe(200)

    const getRes = await request(app).get('/api/auth/me/availability').set('Authorization', `Bearer ${session.token}`)
    expect(getRes.body.slots).toEqual([{ weekday: 3, dayPart: 'afternoon' }])
  })

  it('DSR export includes availability slots', async () => {
    const { token, email } = await createLinkedAccountToken()
    await request(app).put('/api/auth/me/availability').set('Authorization', `Bearer ${token}`)
      .send({ slots: [{ weekday: 4, dayPart: 'evening' }] })

    const dsr = new DataSubjectRequestService(pool)
    const result = await dsr.export(email)
    expect(result.status).toBe('exported')
    if (result.status === 'exported') {
      expect(result.data.availability).toEqual([{ weekday: 4, dayPart: 'evening' }])
    }
  })

  it('DSR erasure removes availability rows', async () => {
    const { token, email, playerId } = await createLinkedAccountToken()
    await request(app).put('/api/auth/me/availability').set('Authorization', `Bearer ${token}`)
      .send({ slots: [{ weekday: 4, dayPart: 'evening' }] })

    const dsr = new DataSubjectRequestService(pool)
    const result = await dsr.erase(email)
    expect(result.status).toBe('erased')

    const slots = await availabilityRepo.getSlots(playerId)
    expect(slots).toHaveLength(0)
  })

  it('deleting the player row cascades the availability rows (FK enforcement)', async () => {
    const player = await playerRepo.findOrCreatePlayerByEmail(`avail-cascade-${uid()}@test.local`, `Player ${uid()}`, undefined, undefined, defaultAdultAttestation())
    await availabilityRepo.replaceSlots(player.id, [{ weekday: 0, dayPart: 'morning' }])

    await pool.query(`DELETE FROM public.players WHERE id = $1`, [player.id])

    const res = await pool.query(`SELECT 1 FROM public.player_availability WHERE player_id = $1`, [player.id])
    expect(res.rows).toHaveLength(0)
  })
})

describe('S7.1 — countFreeByGroup aggregates counts only (P12 privacy wall)', () => {
  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
    availabilityRepo = new AvailabilityRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('returns per-slot counts, never player ids or names', async () => {
    const a = await playerRepo.findOrCreatePlayerByEmail(`avail-a-${uid()}@test.local`, `Alice-${uid()}`, undefined, undefined, defaultAdultAttestation())
    const b = await playerRepo.findOrCreatePlayerByEmail(`avail-b-${uid()}@test.local`, `Bob-${uid()}`, undefined, undefined, defaultAdultAttestation())
    await availabilityRepo.replaceSlots(a.id, [{ weekday: 5, dayPart: 'evening' }])
    await availabilityRepo.replaceSlots(b.id, [{ weekday: 5, dayPart: 'evening' }])

    const counts = await availabilityRepo.countFreeByGroup([a.id, b.id])
    expect(counts).toEqual([{ weekday: 5, dayPart: 'evening', freeCount: 2 }])

    const serialized = JSON.stringify(counts)
    expect(serialized).not.toContain(a.id)
    expect(serialized).not.toContain(b.id)
    expect(serialized).not.toContain('Alice')
    expect(serialized).not.toContain('Bob')
  })
})
