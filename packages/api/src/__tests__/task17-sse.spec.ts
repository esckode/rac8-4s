import http from 'node:http'
import { AddressInfo } from 'node:net'
import request from 'supertest'
import { createApp } from '../app'
import { openDatabase, TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { InMemoryJobQueue } from '@worker/job-queue'
import { BroadcastBus } from '../broadcast-bus'
import { issueOrganizerToken } from '../auth/tokens'
import { processStandingsRecalculate } from '../workers/standings-processor'
import { processBracketGenerate } from '../workers/bracket-processor'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

async function connectSSE(
  server: http.Server,
  path: string,
  headers: Record<string, string>
): Promise<{ chunks: string[]; res: http.IncomingMessage; req: http.ClientRequest }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as AddressInfo).port
    const chunks: string[] = []
    const req = http.get({ port, path, headers }, (res) => {
      res.on('data', (chunk: Buffer) => chunks.push(chunk.toString()))
      resolve({ chunks, res, req })
    })
    req.on('error', reject)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('Task #17: SSE endpoint and BroadcastBus', () => {
  describe('BroadcastBus unit tests', () => {
    let bus: BroadcastBus

    beforeEach(() => {
      bus = new BroadcastBus()
    })

    it('should deliver event to subscribed listener', () => {
      const received: Array<{ event: string; data: unknown }> = []
      bus.subscribe('t1', (event, data) => received.push({ event, data }))

      bus.emit('t1', 'standings.updated', { groupId: 'g1', standings: [] })

      expect(received).toHaveLength(1)
      expect(received[0].event).toBe('standings.updated')
      expect(received[0].data).toEqual({ groupId: 'g1', standings: [] })
    })

    it('should deliver to all listeners for the same tournament', () => {
      const calls1: string[] = []
      const calls2: string[] = []
      bus.subscribe('t1', (event) => calls1.push(event))
      bus.subscribe('t1', (event) => calls2.push(event))

      bus.emit('t1', 'standings.updated', {})

      expect(calls1).toHaveLength(1)
      expect(calls2).toHaveLength(1)
    })

    it('should not call listener after unsubscribe', () => {
      const calls: string[] = []
      const unsubscribe = bus.subscribe('t1', (event) => calls.push(event))

      bus.emit('t1', 'standings.updated', {})
      unsubscribe()
      bus.emit('t1', 'standings.updated', {})

      expect(calls).toHaveLength(1)
    })

    it('should scope events to tournament: events for A do not reach B', () => {
      const receivedA: string[] = []
      const receivedB: string[] = []
      bus.subscribe('tournament_A', (event) => receivedA.push(event))
      bus.subscribe('tournament_B', (event) => receivedB.push(event))

      bus.emit('tournament_A', 'standings.updated', {})

      expect(receivedA).toHaveLength(1)
      expect(receivedB).toHaveLength(0)
    })

    it('listenerCount should reflect active subscriptions', () => {
      expect(bus.listenerCount('t1')).toBe(0)

      const unsub1 = bus.subscribe('t1', () => {})
      expect(bus.listenerCount('t1')).toBe(1)

      const unsub2 = bus.subscribe('t1', () => {})
      expect(bus.listenerCount('t1')).toBe(2)

      unsub1()
      expect(bus.listenerCount('t1')).toBe(1)

      unsub2()
      expect(bus.listenerCount('t1')).toBe(0)
    })
  })

  describe('GET /tournaments/:id/events', () => {
    let db: any
    let app: any
    let server: http.Server
    let broadcastBus: BroadcastBus
    let tokenStore: InMemoryTokenStore
    let jobQueue: InMemoryJobQueue
    let groupRepo: GroupRepository
    let knockoutRepo: KnockoutRepository
    let tournamentId: string
    let groupId: string
    let organizerToken: string
    let player1Token: string

    beforeEach(async () => {
      db = openDatabase(':memory:')
      tokenStore = new InMemoryTokenStore()
      jobQueue = new InMemoryJobQueue()
      broadcastBus = new BroadcastBus()

      app = createApp({ db, jwtConfig: STANDARD_CONFIG, tokenStore, jobQueue, broadcastBus })
      await new Promise<void>(resolve => { server = app.listen(0, resolve) })

      const tournamentRepo = new TournamentRepository(db)
      const playerRepo = new PlayerRepository(db)
      groupRepo = new GroupRepository(db)
      knockoutRepo = new KnockoutRepository(db)

      const organizerId = 'org_sse_test'
      organizerToken = issueOrganizerToken(
        { sub: organizerId, email: 'org@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const now = new Date()
      const past = new Date(now.getTime() - 86400000).toISOString()
      const future = new Date(now.getTime() + 259200000).toISOString()

      const tournament = tournamentRepo.create({
        name: `SSE Test ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 4,
        registrationDeadline: past,
        groupStageDeadline: future,
        knockoutStageDeadline: future,
        creatorId: organizerId,
      })
      tournamentId = tournament.id

      tournamentRepo.updateStatus(tournamentId, 'registration_open')

      const ts = Date.now()
      const emails = [`sse1_${ts}@test.com`, `sse2_${ts}@test.com`]
      for (const email of emails) {
        playerRepo.findOrCreatePlayerByEmail(email, email.split('@')[0])
      }

      const p1 = playerRepo.findByEmail(emails[0])!
      const p2 = playerRepo.findByEmail(emails[1])!

      tournamentRepo.updateStatus(tournamentId, 'registration_closed')
      tournamentRepo.updateStatus(tournamentId, 'group_stage_active')

      const groups = groupRepo.createGroups(tournamentId, 1, 1, [p1.id, p2.id])
      groupId = groups[0].id

      // Register player via API to get a valid player token
      const appForReg = createApp({ db, jwtConfig: STANDARD_CONFIG, tokenStore, jobQueue, broadcastBus })
      const tournamentRepo2 = new TournamentRepository(db)
      tournamentRepo2.updateStatus(tournamentId, 'registration_open')

      const registerRes = await (await import('supertest')).default(appForReg)
        .post(`/tournaments/${tournamentId}/register`)
        .send({ email: `sse_player_token_${ts}@test.com`, name: 'SSE Player' })

      const verifyRes = await (await import('supertest')).default(appForReg)
        .get(`/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`)

      player1Token = verifyRes.body.playerToken

      tournamentRepo2.updateStatus(tournamentId, 'registration_closed')
      tournamentRepo2.updateStatus(tournamentId, 'group_stage_active')
    })

    afterEach(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await jobQueue.close()
      db.close()
    })

    describe('Auth enforcement', () => {
      it('should return 401 for unauthenticated request', async () => {
        const res = await request(app)
          .get(`/tournaments/${tournamentId}/events`)
        expect(res.status).toBe(401)
      })

      it('should return 401 for invalid token', async () => {
        const res = await request(app)
          .get(`/tournaments/${tournamentId}/events`)
          .set('Authorization', 'Bearer invalid.token.here')
        expect(res.status).toBe(401)
      })

      it('should return 404 for unknown tournament', async () => {
        const res = await request(app)
          .get('/tournaments/nonexistent-id/events')
          .set('Authorization', `Bearer ${organizerToken}`)
        expect(res.status).toBe(404)
      })

      it('should return 403 when organizer does not own the tournament', async () => {
        const tournamentRepo = new TournamentRepository(db)
        const now = new Date()
        const otherTournament = tournamentRepo.create({
          name: `Other Organizer Tournament ${Date.now()}`,
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 4,
          registrationDeadline: new Date(now.getTime() - 86400000).toISOString(),
          groupStageDeadline: new Date(now.getTime() + 259200000).toISOString(),
          knockoutStageDeadline: new Date(now.getTime() + 518400000).toISOString(),
          creatorId: 'different_organizer',
        })

        const res = await request(app)
          .get(`/tournaments/${otherTournament.id}/events`)
          .set('Authorization', `Bearer ${organizerToken}`)
        expect(res.status).toBe(403)
      })

      it('should accept organizer token', async () => {
        const { res, req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )
        expect(res.statusCode).toBe(200)
        req.destroy()
      })

      it('should accept player token', async () => {
        const { res, req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${player1Token}` }
        )
        expect(res.statusCode).toBe(200)
        req.destroy()
      })
    })

    describe('Rate limiting', () => {
      it('should return 429 when a user exceeds 5 concurrent connections', async () => {
        const connections: http.ClientRequest[] = []

        for (let i = 0; i < 5; i++) {
          const { req } = await connectSSE(
            server,
            `/tournaments/${tournamentId}/events`,
            { Authorization: `Bearer ${organizerToken}` }
          )
          connections.push(req)
        }

        const res = await request(app)
          .get(`/tournaments/${tournamentId}/events`)
          .set('Authorization', `Bearer ${organizerToken}`)
        expect(res.status).toBe(429)

        connections.forEach(req => req.destroy())
        await delay(20)
      })

      it('should allow a new connection after a previous one is closed', async () => {
        const connections: http.ClientRequest[] = []

        for (let i = 0; i < 5; i++) {
          const { req } = await connectSSE(
            server,
            `/tournaments/${tournamentId}/events`,
            { Authorization: `Bearer ${organizerToken}` }
          )
          connections.push(req)
        }

        // Close one connection
        connections[0].destroy()
        await delay(20)

        // Now a 6th connection should succeed
        const { res, req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )
        expect(res.statusCode).toBe(200)
        req.destroy()

        connections.slice(1).forEach(r => r.destroy())
        await delay(20)
      })
    })

    describe('SSE connection', () => {
      it('should respond with text/event-stream content type', async () => {
        const { res, req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )
        expect(res.headers['content-type']).toMatch(/text\/event-stream/)
        req.destroy()
      })

      it('should set cache-control and connection headers', async () => {
        const { res, req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )
        expect(res.headers['cache-control']).toBe('no-cache')
        expect(res.headers['connection']).toBe('keep-alive')
        req.destroy()
      })
    })

    describe('Event delivery', () => {
      it('should push event to connected client when BroadcastBus emits', async () => {
        const { chunks, req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )

        broadcastBus.emit(tournamentId, 'standings.updated', { groupId, standings: [] })
        await delay(20)

        req.destroy()
        const body = chunks.join('')
        expect(body).toContain('event: standings.updated')
        expect(body).toContain('"groupId"')
      })

      it('should format events as SSE data lines', async () => {
        const { chunks, req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )

        const payload = { groupId, standings: [{ playerId: 'p1', rank: 1 }] }
        broadcastBus.emit(tournamentId, 'standings.updated', payload)
        await delay(20)

        req.destroy()
        const body = chunks.join('')
        expect(body).toContain(`event: standings.updated\ndata: ${JSON.stringify(payload)}\n\n`)
      })

      it('should deliver standings.updated with correct shape from processor', async () => {
        const { chunks, req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )

        await processStandingsRecalculate(
          { tournamentId, groupId },
          { groupRepo, broadcastBus }
        )
        await delay(20)

        req.destroy()
        const body = chunks.join('')
        expect(body).toContain('event: standings.updated')
        expect(body).toContain(`"groupId":"${groupId}"`)
        expect(body).toContain('"standings"')
      })

      it('should deliver bracket.published with correct shape from processor', async () => {
        const matches = groupRepo.findMatchesByGroup(groupId)
        const players = groupRepo.findMembersByGroup(groupId)
        groupRepo.updateMatch(matches[0].id, players[0].id, '6-4, 6-3')

        const { chunks, req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )

        await processBracketGenerate(
          { tournamentId },
          { groupRepo, knockoutRepo, broadcastBus }
        )
        await delay(20)

        req.destroy()
        const body = chunks.join('')
        expect(body).toContain('event: bracket.published')
        expect(body).toContain('"matchCount"')
        expect(body).toContain('"byeCount"')
      })
    })

    describe('Tournament scoping', () => {
      it('should not deliver events for tournament A to a client subscribed to B', async () => {
        const tournamentRepo = new TournamentRepository(db)
        const now = new Date()
        const tournamentB = tournamentRepo.create({
          name: `SSE Scoping Test B ${Date.now()}`,
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 4,
          registrationDeadline: new Date(now.getTime() - 86400000).toISOString(),
          groupStageDeadline: new Date(now.getTime() + 259200000).toISOString(),
          knockoutStageDeadline: new Date(now.getTime() + 518400000).toISOString(),
          creatorId: 'org_sse_test',
        })

        const { chunks, req } = await connectSSE(
          server,
          `/tournaments/${tournamentB.id}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )

        // Emit to tournament A — client is subscribed to B
        broadcastBus.emit(tournamentId, 'standings.updated', { groupId, standings: [] })
        await delay(20)

        req.destroy()
        expect(chunks.join('')).toBe('')
      })
    })

    describe('Disconnect cleanup', () => {
      it('should remove BroadcastBus listener when client disconnects', async () => {
        expect(broadcastBus.listenerCount(tournamentId)).toBe(0)

        const { req } = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )

        expect(broadcastBus.listenerCount(tournamentId)).toBe(1)

        req.destroy()
        await delay(20)

        expect(broadcastBus.listenerCount(tournamentId)).toBe(0)
      })

      it('should handle multiple clients disconnecting independently', async () => {
        const conn1 = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )
        const conn2 = await connectSSE(
          server,
          `/tournaments/${tournamentId}/events`,
          { Authorization: `Bearer ${organizerToken}` }
        )

        expect(broadcastBus.listenerCount(tournamentId)).toBe(2)

        conn1.req.destroy()
        await delay(20)
        expect(broadcastBus.listenerCount(tournamentId)).toBe(1)

        conn2.req.destroy()
        await delay(20)
        expect(broadcastBus.listenerCount(tournamentId)).toBe(0)
      })
    })
  })
})
