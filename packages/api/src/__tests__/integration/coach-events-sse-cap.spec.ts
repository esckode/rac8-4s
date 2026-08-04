/**
 * ISSUE-52 — GET /player/coach/events ignores sseMaxConnectionsPerUser.
 *
 * Mirrors the established pattern for this class of test (tournament-events-auth.spec.ts,
 * tournament-events-flush.spec.ts): a raw http.get against a real app.listen(0) server,
 * resolving as soon as headers arrive and destroying the socket immediately after —
 * the route never calls res.end() on success (it's an open SSE stream), so a normal
 * supertest request/response round trip would hang forever.
 */
import http from 'http'
import bcryptjs from 'bcryptjs'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { DEFAULT_APP_CONFIG } from '../../config'
import { AccountRepository, PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import request from 'supertest'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-52 — GET /player/coach/events connection cap', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let server: http.Server
  let port: number
  const MAX = 2
  const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool, {
      broadcastBus: broadcastBus as any,
      config: { limits: { ...DEFAULT_APP_CONFIG.limits, sseMaxConnectionsPerUser: MAX } },
    })
    app = deps.app
    jwtConfig = deps.jwtConfig
    server = app.listen(0)
    port = (server.address() as any).port
  })

  afterAll(async () => {
    server.close()
    await rollbackTransaction()
  })

  async function createAccountHolder(): Promise<string> {
    const email = `coach-sse-cap-${uid()}@test.local`
    const password = 'testpassword123'
    const playerRepo = new PlayerRepository(pool)
    const player = await playerRepo.findOrCreatePlayerByEmail(
      email, `Coach Cap ${uid()}`, undefined, undefined, defaultAdultAttestation()
    )
    const accountRepo = new AccountRepository(pool)
    const account = await accountRepo.create(email, 'player')
    const passwordHash = await bcryptjs.hash(password, 10)
    await accountRepo.updatePasswordHash(account.id, passwordHash)
    await accountRepo.linkPlayer(account.id, player.id)

    const res = await request(app).post('/api/auth/login').send({ email, password })
    if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`)
    return res.body.token as string
  }

  /** Opens a real SSE connection and resolves once headers arrive, WITHOUT destroying the socket. */
  function openStream(token: string): Promise<{ status: number; req: http.ClientRequest; body?: any }> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: 'localhost',
          port,
          path: `/player/coach/events`,
          headers: { Authorization: `Bearer ${token}` },
        },
        (res) => {
          if ((res.statusCode ?? 0) >= 400) {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => {
              resolve({ status: res.statusCode ?? 0, req, body: data ? JSON.parse(data) : undefined })
            })
          } else {
            resolve({ status: res.statusCode ?? 0, req })
          }
        }
      )
      req.on('error', () => {
        // destroying an open stream's socket raises ECONNRESET; ignore it
      })
    })
  }

  it(`rejects the ${MAX + 1}th concurrent stream with 429, and closing one frees a slot`, async () => {
    const token = await createAccountHolder()

    const opened: http.ClientRequest[] = []
    for (let i = 0; i < MAX; i++) {
      const { status, req } = await openStream(token)
      expect(status).toBe(200)
      opened.push(req)
    }

    const overLimit = await openStream(token)
    expect(overLimit.status).toBe(429)
    expect(overLimit.body.code).toBe('TOO_MANY_REQUESTS')
    overLimit.req.destroy()

    // Free a slot by closing one of the held-open connections.
    opened[0].destroy()
    await new Promise((r) => setTimeout(r, 100))

    const afterFree = await openStream(token)
    expect(afterFree.status).toBe(200)
    afterFree.req.destroy()

    for (const req of opened.slice(1)) req.destroy()
    await new Promise((r) => setTimeout(r, 100))
  })
})
