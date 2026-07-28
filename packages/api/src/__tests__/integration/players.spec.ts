import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { PlayerFactory, TournamentFactory, OrganizerFactory } from '../factories'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { GroupRepository, TournamentRepository } from '../../db'

describe('Players API', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    jwtConfig = deps.jwtConfig
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // Helper: create a player, register them for a tournament, and get a session token
  async function createPlayerWithToken(tournamentId: string) {
    const player = await PlayerFactory.create(pool)
    await PlayerFactory.createAndRegister(pool, tournamentId, {
      email: player.email,
      name: player.name,
    })
    const session = await generatePlayerSession(
      {
        playerId: player.id,
        tournamentId,
        email: player.email,
        createdAt: Date.now(),
      },
      3600,
      tokenStore
    )
    return { player, sessionToken: session.token }
  }

  describe('GET /player/session', () => {
    it('returns the player identity for a valid session token', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const { player, sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .get('/player/session')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        playerId: player.id,
        tournamentId: tournament.id,
      })
    })

    it('returns 401 when the Authorization header is missing', async () => {
      const res = await request(app).get('/player/session')
      expect(res.status).toBe(401)
    })

    it('returns 401 for an invalid session token', async () => {
      const res = await request(app)
        .get('/player/session')
        .set('Authorization', 'Bearer not-a-real-token')
      expect(res.status).toBe(401)
    })
  })

  describe('GET /player/tournaments', () => {
    it('lists player tournaments', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const { sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .get('/player/tournaments')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.tournaments)).toBe(true)
      expect(res.body.pagination).toBeDefined()
      const ids = res.body.tournaments.map((t: any) => t.id)
      expect(ids).toContain(tournament.id)
    })

    it('requires authentication', async () => {
      const res = await request(app).get('/player/tournaments')

      expect(res.status).toBe(401)
    })

    it('returns empty list when player has no tournaments', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const player = await PlayerFactory.create(pool)
      const session = await generatePlayerSession(
        {
          playerId: player.id,
          tournamentId: tournament.id,
          email: player.email,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const res = await request(app)
        .get('/player/tournaments')
        .set('Authorization', `Bearer ${session.token}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.tournaments)).toBe(true)
      expect(res.body.tournaments.length).toBe(0)
    })

    it('respects pagination limits', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)

      const tournament1 = await TournamentFactory.create(pool, organizerId)
      const tournament2 = await TournamentFactory.create(pool, organizerId)

      const player = await PlayerFactory.create(pool)
      await PlayerFactory.createAndRegister(pool, tournament1.id, {
        email: player.email,
        name: player.name,
      })
      await PlayerFactory.createAndRegister(pool, tournament2.id, {
        email: player.email,
        name: player.name,
      })

      const session = await generatePlayerSession(
        {
          playerId: player.id,
          tournamentId: tournament1.id,
          email: player.email,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const res = await request(app)
        .get('/player/tournaments')
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${session.token}`)

      expect(res.status).toBe(200)
      expect(res.body.tournaments.length).toBe(1)
      expect(res.body.pagination.limit).toBe(1)
      expect(res.body.pagination.hasMore).toBe(true)
    })
  })

  // ISSUE-28: the Play hub needs the same next-match/standings/last-results
  // data the coach's snapshot already gathers, split out behind a real
  // endpoint rather than a second query path (buildPlayerSnapshot now
  // returns PlayerSnapshotData; see player-snapshot.ts).
  describe('GET /player/snapshot', () => {
    it('returns the next pending match for a player with a scheduled match', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const tournamentRepo = new TournamentRepository(pool)
      const groupRepo = new GroupRepository(pool)

      const { player: asker, sessionToken } = await createPlayerWithToken(tournament.id)
      const opponent = await PlayerFactory.create(pool)
      await PlayerFactory.createAndRegister(pool, tournament.id, {
        email: opponent.email,
        name: opponent.name,
      })

      await tournamentRepo.updateStatus(tournament.id, 'group_stage_active')
      await groupRepo.createGroups(tournament.id, 1, 1, [asker.id, opponent.id])

      const res = await request(app)
        .get('/player/snapshot')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body.nextMatch).toMatchObject({
        opponentName: opponent.name,
        tournamentName: tournament.name,
      })
      expect(Array.isArray(res.body.standingsRows)).toBe(true)
      expect(Array.isArray(res.body.lastResults)).toBe(true)
    })

    it('returns empty-state data for a player with no matches', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const { sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .get('/player/snapshot')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body.nextMatch).toBeNull()
      expect(res.body.standingsRows).toEqual([])
      expect(res.body.lastResults).toEqual([])
    })

    it('requires authentication', async () => {
      const res = await request(app).get('/player/snapshot')
      expect(res.status).toBe(401)
    })
  })

  describe('GET /player/contact-preferences', () => {
    it('retrieves contact sharing preference', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const { sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .get('/player/contact-preferences')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(typeof res.body.shareContact).toBe('boolean')
    })

    it('requires authentication', async () => {
      const res = await request(app).get('/player/contact-preferences')

      expect(res.status).toBe(401)
    })

    it('returns default value for new player', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const { sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .get('/player/contact-preferences')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body.shareContact).toBe(false)
    })
  })

  describe('PATCH /player/contact-preferences', () => {
    it('updates contact sharing preference', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const { sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ shareContact: true })

      expect(res.status).toBe(200)
      expect(res.body.shareContact).toBe(true)
    })

    it('rejects invalid input (non-boolean)', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const { sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ shareContact: 'yes' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('requires authentication', async () => {
      const res = await request(app)
        .patch('/player/contact-preferences')
        .send({ shareContact: true })

      expect(res.status).toBe(401)
    })

    it('persists preference change', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const { sessionToken } = await createPlayerWithToken(tournament.id)

      await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ shareContact: true })

      const res = await request(app)
        .get('/player/contact-preferences')
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body.shareContact).toBe(true)
    })
  })
})
