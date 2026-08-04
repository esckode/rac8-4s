/**
 * ISSUE-61 — GET /player/groups/:groupId/events ignores sseMaxConnectionsPerUser.
 *
 * Mirrors the established pattern for this class of test (tournament-events-auth.spec.ts,
 * tournament-events-flush.spec.ts): a raw http.get against a real app.listen(0) server,
 * resolving as soon as headers arrive and destroying the socket immediately after —
 * the route never calls res.end() on success (it's an open SSE stream), so a normal
 * supertest request/response round trip would hang forever.
 */
import http from 'http'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { DEFAULT_APP_CONFIG } from '../../config'
import { generatePlayerSession } from '../../auth/magic-link'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-61 — GET /player/groups/:groupId/events connection cap', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: any
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
    tokenStore = deps.tokenStore
    server = app.listen(0)
    port = (server.address() as any).port
  })

  afterAll(async () => {
    server.close()
    await rollbackTransaction()
  })

  async function createPlayerAndGroup() {
    const email = `sse-cap-${uid()}@test.local`
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 25)
    const { PlayerRepository } = await import('../../db')
    const playerRepo = new PlayerRepository(pool)
    const player = await playerRepo.findOrCreatePlayerByEmail(
      email, `SSE Cap ${uid()}`, undefined, undefined,
      { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' }
    )
    const session = await generatePlayerSession(
      { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
      3600,
      tokenStore
    )
    const { GroupRepository } = await import('../../repositories/group-repository')
    const groupRepo = new GroupRepository(pool)
    const group = await groupRepo.createGroup({ name: `SSE Cap Group ${uid()}`, createdBy: player.id })
    return { token: session.token, groupId: group.id }
  }

  /** Opens a real SSE connection and resolves once headers arrive, WITHOUT destroying the socket. */
  function openStream(groupId: string, token: string): Promise<{ status: number; req: http.ClientRequest; body?: any }> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: 'localhost',
          port,
          path: `/player/groups/${groupId}/events`,
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
    const { token, groupId } = await createPlayerAndGroup()

    const opened: http.ClientRequest[] = []
    for (let i = 0; i < MAX; i++) {
      const { status, req } = await openStream(groupId, token)
      expect(status).toBe(200)
      opened.push(req)
    }

    const overLimit = await openStream(groupId, token)
    expect(overLimit.status).toBe(429)
    expect(overLimit.body.code).toBe('TOO_MANY_REQUESTS')
    overLimit.req.destroy()

    // Free a slot by closing one of the held-open connections.
    opened[0].destroy()
    await new Promise((r) => setTimeout(r, 100))

    const afterFree = await openStream(groupId, token)
    expect(afterFree.status).toBe(200)
    afterFree.req.destroy()

    for (const req of opened.slice(1)) req.destroy()
    await new Promise((r) => setTimeout(r, 100))
  })
})
