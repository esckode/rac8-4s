/**
 * ISSUE-38 — GET /tournaments/:id/events writes nothing to the response body
 * until the first real broadcast event, relying solely on res.flushHeaders()
 * to reach the client. Verified live: Vite's dev proxy (and, per SSE best
 * practice, plenty of real-world intermediaries) withholds the response —
 * headers included — from the client until the upstream writes actual body
 * bytes, so a client can sit in EventSource readyState CONNECTING
 * indefinitely if no broadcast happens to fire. An immediate SSE comment
 * line right after flushHeaders() forces a flush with zero effect on
 * EventSource's message parsing (lines starting with ':' are ignored by the
 * SSE spec).
 */
import http from 'http'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, OrganizerFactory } from '../factories'

describe('ISSUE-38 — GET /tournaments/:id/events flushes immediately on connect', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let server: http.Server
  let port: number
  // No subscribe callback ever fires here — the test would hang forever
  // waiting on a broadcast if the route relied on one to produce the first
  // byte, exactly the bug being verified against.
  const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool, { broadcastBus: broadcastBus as any })
    app = deps.app
    jwtConfig = deps.jwtConfig
    server = app.listen(0)
    port = (server.address() as any).port
  })

  afterAll(async () => {
    server.close()
    await rollbackTransaction()
  })

  it('sends a body byte within 500ms of connecting, with no broadcast ever firing', async () => {
    const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, organizerId)

    const firstChunk = await new Promise<string>((resolve, reject) => {
      const req = http.get(
        {
          host: 'localhost',
          port,
          path: `/tournaments/${tournament!.id}/events`,
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        (res) => {
          res.on('data', (chunk) => {
            clearTimeout(timer)
            resolve(chunk.toString())
            req.destroy()
          })
        }
      )
      const timer = setTimeout(() => {
        req.destroy()
        reject(new Error('no body byte received within 500ms'))
      }, 500)
      req.on('error', () => {
        // destroying the socket after resolving/timing out raises ECONNRESET; ignore it
      })
    })

    // A comment line — never surfaces as a named/message event to EventSource.
    expect(firstChunk.startsWith(':')).toBe(true)
  })
})
