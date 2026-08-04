/**
 * ISSUE-58 — PATCH /player/name: the Profile Account section's editable
 * display name. Updates public.players.name for the caller; validation
 * mirrors the reserved-name guard used elsewhere (isReservedDisplayName).
 * GET /api/auth/me also gains a `name` field so the frontend can render
 * the current value in the editable control.
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

async function createLinkedAccountToken(name = `Player ${uid()}`): Promise<{ token: string; playerId: string; email: string }> {
  const email = `name-${uid()}@test.local`
  const password = 'testpassword123'

  const player = await playerRepo.findOrCreatePlayerByEmail(
    email, name, undefined, undefined, defaultAdultAttestation()
  )
  const account = await accountRepo.create(email, 'player')
  const passwordHash = await bcryptjs.hash(password, 10)
  await accountRepo.updatePasswordHash(account.id, passwordHash)
  await accountRepo.linkPlayer(account.id, player.id)

  const token = await loginAndGetToken(email, password)
  return { token, playerId: player.id, email }
}

describe('ISSUE-58 — PATCH /player/name', () => {
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

  it('renames the caller and the new name is reflected in GET /api/auth/me', async () => {
    const { token } = await createLinkedAccountToken('Old Name')

    const res = await request(app)
      .patch('/player/name')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' })
    expect(res.status).toBe(200)

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(meRes.status).toBe(200)
    expect(meRes.body.name).toBe('New Name')
  })

  it('a rename is reflected in GET /player/groups/:groupId/members', async () => {
    const { token, playerId } = await createLinkedAccountToken('Before Rename')
    const groupRes = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Rename Test Group ${uid()}` })
    expect(groupRes.status).toBe(201)
    const groupId = groupRes.body.id

    await request(app)
      .patch('/player/name')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'After Rename' })

    const membersRes = await request(app)
      .get(`/player/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${token}`)
    expect(membersRes.status).toBe(200)
    const self = membersRes.body.members.find((m: any) => m.playerId === playerId)
    expect(self.name).toBe('After Rename')
  })

  it('rejects a reserved display name', async () => {
    const { token } = await createLinkedAccountToken()

    const res = await request(app)
      .patch('/player/name')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ref' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects an empty/whitespace-only name', async () => {
    const { token } = await createLinkedAccountToken()

    const res = await request(app)
      .patch('/player/name')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a name over 50 characters', async () => {
    const { token } = await createLinkedAccountToken()

    const res = await request(app)
      .patch('/player/name')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x'.repeat(51) })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('requires authentication', async () => {
    const res = await request(app).patch('/player/name').send({ name: 'No Auth' })
    expect(res.status).toBe(401)
  })
})
