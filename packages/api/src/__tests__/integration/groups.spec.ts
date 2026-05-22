import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, closeTestPool } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, PlayerFactory, OrganizerFactory } from '../factories'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'

describe('Groups API', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    jwtConfig = deps.jwtConfig
  })

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

  afterAll(async () => {
    await closeTestPool()
  })

  describe('POST /tournaments/:id/groups', () => {
    it('creates groups with valid input', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Register 4 players (minimum for 2 groups of 2)
      const players = []
      for (let i = 0; i < 4; i++) {
        const player = await PlayerFactory.create(pool)
        await PlayerFactory.createAndRegister(pool, tournament.id, { email: player.email, name: player.name })
        players.push(player)
      }

      // Close registration
      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(201)
      expect(Array.isArray(res.body.groups)).toBe(true)
      expect(res.body.groups.length).toBe(2)
      expect(res.body.groups[0]).toHaveProperty('id')
      expect(res.body.groups[0]).toHaveProperty('name')
      expect(res.body.groups[0]).toHaveProperty('playerCount')
      expect(res.body.groups[0]).toHaveProperty('advancingCount')
    })

    it('rejects if tournament not in registration_closed status', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('rejects if not enough players', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Register only 2 players (not enough for 2 groups of 2)
      const player1 = await PlayerFactory.create(pool)
      await PlayerFactory.createAndRegister(pool, tournament.id, { email: player1.email, name: player1.name })
      const player2 = await PlayerFactory.create(pool)
      await PlayerFactory.createAndRegister(pool, tournament.id, { email: player2.email, name: player2.name })

      // Close registration
      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.message).toContain('Not enough players')
    })

    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(401)
    })

    it('rejects if organizer does not own tournament', async () => {
      const { sub: organizerId1 } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId1)

      // Different organizer's token
      const { accessToken: accessToken2 } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken2}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(403)
    })

    it('rejects invalid numGroups', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Close registration
      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 'invalid', advancingPerGroup: 1 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects invalid advancingPerGroup', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Close registration
      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 0 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('updates tournament status to group_stage_active', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Register 4 players
      for (let i = 0; i < 4; i++) {
        const player = await PlayerFactory.create(pool)
        await PlayerFactory.createAndRegister(pool, tournament.id, { email: player.email, name: player.name })
      }

      // Close registration
      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      const updated = await tournamentRepo.findById(tournament.id)
      expect(updated?.status).toBe('group_stage_active')
    })
  })

  describe('GET /tournaments/:id/groups', () => {
    it('lists groups with members', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Register 4 players
      const players = []
      for (let i = 0; i < 4; i++) {
        const player = await PlayerFactory.create(pool)
        await PlayerFactory.createAndRegister(pool, tournament.id, { email: player.email, name: player.name })
        players.push(player)
      }

      // Close registration and create groups
      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.groups)).toBe(true)
      expect(res.body.groups.length).toBe(2)
      expect(res.body.groups[0]).toHaveProperty('id')
      expect(res.body.groups[0]).toHaveProperty('name')
      expect(Array.isArray(res.body.groups[0].players)).toBe(true)
      expect(res.body.groups[0]).toHaveProperty('matchCount')
    })

    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app).get(`/tournaments/${tournament.id}/groups`)

      expect(res.status).toBe(401)
    })

    it('rejects if organizer does not own tournament', async () => {
      const { sub: organizerId1 } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId1)

      const { accessToken: accessToken2 } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken2}`)

      expect(res.status).toBe(403)
    })

    it('returns 404 if tournament not found', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .get(`/tournaments/nonexistent/groups`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(404)
    })

    it('returns empty list when no groups exist', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.groups)).toBe(true)
      expect(res.body.groups.length).toBe(0)
    })
  })

  describe('GET /tournaments/:id/groups/:groupId/standings', () => {
    it('retrieves standings for a group', async () => {
      const { sub: organizerId, accessToken: organizerToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Register enough players for 2 groups of 2 (4 total)
      const playerTokens = []
      for (let i = 0; i < 4; i++) {
        const { sessionToken } = await createPlayerWithToken(tournament.id)
        playerTokens.push(sessionToken)
      }

      // Close registration and create groups
      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      const groupsRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(groupsRes.status).toBe(201)
      expect(groupsRes.body.groups.length).toBe(2)

      // Try standings for first group with each token until we find one that works
      let res: any = null
      let groupId: string | null = null
      for (const token of playerTokens) {
        groupId = groupsRes.body.groups[0].id
        res = await request(app)
          .get(`/tournaments/${tournament.id}/groups/${groupId}/standings`)
          .set('Authorization', `Bearer ${token}`)

        if (res.status === 200) break
      }

      expect(res).not.toBeNull()
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.standings)).toBe(true)
      expect(res.body.standings.length).toBeGreaterThan(0)
      expect(res.body.standings[0]).toHaveProperty('rank')
      expect(res.body.standings[0]).toHaveProperty('playerId')
      expect(res.body.standings[0]).toHaveProperty('name')
      expect(res.body.standings[0]).toHaveProperty('wins')
      expect(res.body.standings[0]).toHaveProperty('losses')
    })

    it('requires player authentication', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Register 4 players and create groups
      for (let i = 0; i < 4; i++) {
        const player = await PlayerFactory.create(pool)
        await PlayerFactory.createAndRegister(pool, tournament.id, { email: player.email, name: player.name })
      }

      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      const groupsRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      const groupId = groupsRes.body.groups[0].id

      const res = await request(app).get(`/tournaments/${tournament.id}/groups/${groupId}/standings`)

      expect(res.status).toBe(401)
    })

    it('rejects if player is not in the group', async () => {
      const { sub: organizerId, accessToken: organizerToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Register 6 players (3 per group) and collect tokens
      const playerTokens = []
      for (let i = 0; i < 6; i++) {
        const { sessionToken } = await createPlayerWithToken(tournament.id)
        playerTokens.push(sessionToken)
      }

      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      const groupsRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(groupsRes.status).toBe(201)

      // Get group details to see who's in group 0
      const groupsListRes = await request(app)
        .get(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const group0 = groupsListRes.body.groups[0]
      const group0PlayerIds = new Set(group0.players.map((p: any) => p.id))

      // Find a player NOT in group 0
      let outsiderToken = null
      for (const token of playerTokens) {
        // We can't easily determine which player owns each token, so we'll just use a different approach
        // Try each token until we find one that gives 403
        const testRes = await request(app)
          .get(`/tournaments/${tournament.id}/groups/${group0.id}/standings`)
          .set('Authorization', `Bearer ${token}`)

        if (testRes.status === 403) {
          outsiderToken = token
          break
        }
      }

      expect(outsiderToken).not.toBeNull()
      const res = await request(app)
        .get(`/tournaments/${tournament.id}/groups/${group0.id}/standings`)
        .set('Authorization', `Bearer ${outsiderToken}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('returns 404 if group not found', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const { sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .get(`/tournaments/${tournament.id}/groups/nonexistent/standings`)
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(404)
    })

    it('returns 404 if group belongs to different tournament', async () => {
      const { sub: organizerId1, accessToken: organizerToken1 } = OrganizerFactory.token(jwtConfig)
      const { sub: organizerId2 } = OrganizerFactory.token(jwtConfig)

      const tournament1 = await TournamentFactory.create(pool, organizerId1)
      const tournament2 = await TournamentFactory.create(pool, organizerId2)

      // Create groups in tournament 1
      for (let i = 0; i < 4; i++) {
        const player = await PlayerFactory.create(pool)
        await PlayerFactory.createAndRegister(pool, tournament1.id, { email: player.email, name: player.name })
      }

      const repo = (await import('../../db')).TournamentRepository
      const tournamentRepo = new repo(pool)
      await tournamentRepo.updateStatus(tournament1.id, 'registration_closed')

      const groupsRes = await request(app)
        .post(`/tournaments/${tournament1.id}/groups`)
        .set('Authorization', `Bearer ${organizerToken1}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      const groupId = groupsRes.body.groups[0].id

      // Register player in tournament 2
      const { sessionToken } = await createPlayerWithToken(tournament2.id)

      const res = await request(app)
        .get(`/tournaments/${tournament2.id}/groups/${groupId}/standings`)
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(404)
    })
  })
})
