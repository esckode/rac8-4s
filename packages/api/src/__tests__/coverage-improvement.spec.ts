import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../app'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'
import { initializeTestDb, resetTestDb, closeTestDb } from './db-test-setup'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Coverage improvement tests - Group and Match Operations', () => {
  let db: Pool
  let app: any
  let tokenStore: InMemoryTokenStore
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository

  let tournamentId: string
  let organizerToken: string
  let players: any[] = []

  beforeAll(async () => {
    db = await initializeTestDb()
  })

  beforeEach(async () => {
    await resetTestDb(db)
    tokenStore = new InMemoryTokenStore()
    app = createApp({ config: DEFAULT_APP_CONFIG, db, tokenStore, jwtConfig: STANDARD_CONFIG })

    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)

    const organizerId = 'organizer_coverage_test'
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'coverage@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    const now = new Date()
    const pastDeadline = new Date(now.getTime() - 1000 * 60 * 60).toISOString()
    const futureDeadline = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString()

    const tournament = await tournamentRepo.create({
      name: `Coverage Test ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 100,
      registrationDeadline: pastDeadline,
      groupStageDeadline: futureDeadline,
      knockoutStageDeadline: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      creatorId: organizerId,
    })

    tournamentId = tournament.id

    // Create 6 players for group testing
    players = []
    for (let i = 1; i <= 6; i++) {
      const player = await playerRepo.findOrCreatePlayerByEmail(`coverage_player${i}@test.com`, `Coverage Player ${i}`)
      players.push(player)
      await playerRepo.createRegistration(player.id, tournamentId)
    }

    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
  })

  afterAll(async () => {
    await closeTestDb()
  })

  describe('POST /:id/groups - Group creation validation', () => {
    it('should reject groups creation without auth', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .send({
          numGroups: 2,
          advancingPerGroup: 2,
        })

      expect(res.status).toBe(401)
    })

    it('should reject numGroups with non-integer value', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 2.5,
          advancingPerGroup: 2,
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject numGroups less than 1', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 0,
          advancingPerGroup: 2,
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject advancingPerGroup with non-integer value', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 2,
          advancingPerGroup: 1.5,
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject advancingPerGroup less than 1', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 2,
          advancingPerGroup: 0,
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject groups creation if not enough players', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 10,
          advancingPerGroup: 2,
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject groups creation from different organizer', async () => {
      const otherOrganizerToken = issueOrganizerToken(
        { sub: 'other_organizer', email: 'other@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({
          numGroups: 2,
          advancingPerGroup: 2,
        })

      expect(res.status).toBe(403)
    })

    it('should reject groups creation for non-existent tournament', async () => {
      const res = await request(app)
        .post(`/tournaments/nonexistent/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 2,
          advancingPerGroup: 2,
        })

      expect(res.status).toBe(404)
    })

    it('should reject groups creation when tournament not in registration_closed', async () => {
      // Create a tournament in different state
      const tournament2 = await tournamentRepo.create({
        name: `State Test ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 10,
        registrationDeadline: new Date().toISOString(),
        groupStageDeadline: new Date(Date.now() + 86400000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 2 * 86400000).toISOString(),
        creatorId: 'organizer_coverage_test',
      })

      const res = await request(app)
        .post(`/tournaments/${tournament2.id}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 2,
          advancingPerGroup: 2,
        })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })
  })

  describe('GET /:id/groups - List groups', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 2,
          advancingPerGroup: 2,
        })
    })

    it('should reject list without auth', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/groups`)

      expect(res.status).toBe(401)
    })

    it('should reject list from different organizer', async () => {
      const otherOrganizerToken = issueOrganizerToken(
        { sub: 'other_organizer', email: 'other@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const res = await request(app)
        .get(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)

      expect(res.status).toBe(403)
    })

    it('should reject list for non-existent tournament', async () => {
      const res = await request(app)
        .get(`/tournaments/nonexistent/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(404)
    })

    it('should list groups successfully', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.groups)).toBe(true)
      expect(res.body.groups.length).toBe(2)
    })
  })

  describe('POST /:id/advance - State transitions', () => {
    it('should reject advance without auth', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/advance`)
        .send({
          action: 'start_group_stage',
        })

      expect(res.status).toBe(401)
    })

    it('should reject advance from different organizer', async () => {
      const otherOrganizerToken = issueOrganizerToken(
        { sub: 'other_organizer', email: 'other@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/advance`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({
          action: 'start_group_stage',
        })

      expect(res.status).toBe(403)
    })

    it('should reject advance for non-existent tournament', async () => {
      const res = await request(app)
        .post(`/tournaments/nonexistent/advance`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          action: 'start_group_stage',
        })

      expect(res.status).toBe(404)
    })

    it('should reject advance without action field', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/advance`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject advance with non-string action', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/advance`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          action: 123,
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })
  })
})
