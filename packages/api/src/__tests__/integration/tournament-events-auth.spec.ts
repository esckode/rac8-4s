/**
 * ISSUE-32 — GET /tournaments/:id/events hand-rolls its own dual-auth and,
 * for any account JWT, unconditionally runs the *ownership* check
 * (assertOrganizerOwnsTournament) rather than falling back to a participant
 * check. A registered account holder who is a genuine participant therefore
 * gets 403 FORBIDDEN — the events stream is dead for them.
 *
 * Uses a raw http.get (not supertest) for the two ALLOW rows: the route never
 * calls res.end() on success (it's an open SSE stream), so a normal
 * request/response round-trip would hang forever. Grabbing the response as
 * soon as headers arrive and then destroying the socket lets us assert on
 * the status without waiting for a body that will never complete.
 */
import http from 'http'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, PlayerFactory, OrganizerFactory } from '../factories'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-32 — GET /tournaments/:id/events auth', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: any
  let server: http.Server
  let port: number
  const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool, { broadcastBus: broadcastBus as any })
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

  function getEvents(tournamentId: string, token: string): Promise<{ status: number; body?: any }> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: 'localhost',
          port,
          path: `/tournaments/${tournamentId}/events`,
          headers: { Authorization: `Bearer ${token}` },
        },
        (res) => {
          if ((res.statusCode ?? 0) >= 400) {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => {
              resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : undefined })
            })
          } else {
            resolve({ status: res.statusCode ?? 0 })
            req.destroy()
          }
        }
      )
      req.on('error', () => {
        // destroying an already-resolved success response can raise ECONNRESET; ignore it
      })
    })
  }

  it('guest magic-link session, registered participant → 200 (must keep working)', async () => {
    const tournament = await TournamentFactory.open(pool, OrganizerFactory.id())
    const player = await PlayerFactory.create(pool)
    await PlayerFactory.createAndRegister(pool, tournament!.id, { email: player.email, name: player.name })
    const session = await generatePlayerSession(
      { playerId: player.id, tournamentId: tournament!.id, email: player.email, createdAt: Date.now() },
      3600,
      tokenStore
    )

    const { status } = await getEvents(tournament!.id, session.token)
    expect(status).toBe(200)
  })

  it('registered account, registered participant → 200 (ISSUE-32 fix; 403 today)', async () => {
    const tournament = await TournamentFactory.open(pool, OrganizerFactory.id())
    const playerRepo = new PlayerRepository(pool)
    const email = `issue32-participant-${uid()}@test.local`
    const player = await playerRepo.findOrCreatePlayerByEmail(
      email, 'Issue32 Participant', undefined, undefined, defaultAdultAttestation()
    )
    await playerRepo.createRegistration(player.id, tournament!.id)
    const { accessToken } = OrganizerFactory.playerRoleToken(jwtConfig, { email, playerId: player.id })

    const { status } = await getEvents(tournament!.id, accessToken)
    expect(status).toBe(200)
  })

  it('organizer who owns the tournament, not registered → 200 (must keep working)', async () => {
    const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, organizerId)

    const { status } = await getEvents(tournament!.id, accessToken)
    expect(status).toBe(200)
  })

  it('registered account, not a participant and not the owner → stays denied', async () => {
    const tournament = await TournamentFactory.open(pool, OrganizerFactory.id())
    const playerRepo = new PlayerRepository(pool)
    const email = `issue32-outsider-${uid()}@test.local`
    // A real, linked player who simply never registered for THIS tournament —
    // distinct from an unlinked account, which is PLAYER_NOT_LINKED (ISSUE-24),
    // not this route's FORBIDDEN case.
    const player = await playerRepo.findOrCreatePlayerByEmail(
      email, 'Issue32 Outsider', undefined, undefined, defaultAdultAttestation()
    )
    const { accessToken } = OrganizerFactory.playerRoleToken(jwtConfig, { email, playerId: player.id })

    const { status, body } = await getEvents(tournament!.id, accessToken)
    expect(status).toBe(403)
    expect(body.code).toBe('FORBIDDEN')
  })

  it('rejects an unauthenticated request with 401, unaffected by this fix', async () => {
    const tournament = await TournamentFactory.open(pool, OrganizerFactory.id())

    const { status } = await getEvents(tournament!.id, 'not-a-real-token')
    expect(status).toBe(401)
  })
})
