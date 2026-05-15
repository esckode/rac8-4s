import request from 'supertest'
import Database from 'better-sqlite3'
import { createApp } from '../app'
import { openDatabase, TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'
import type { Express } from 'express'

const TEST_JWT_SECRET = 'test-secret-at-least-32-chars-long-for-testing!'

describe('GET /tournaments/:id/bundle', () => {
  let db: Database.Database
  let app: Express
  let tokenStore: InMemoryTokenStore
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let knockoutRepo: KnockoutRepository

  beforeEach(() => {
    tokenStore = new InMemoryTokenStore()
    db = openDatabase(':memory:')
    app = createApp({
      config: DEFAULT_APP_CONFIG,
      db,
      jwtConfig: { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 },
      tokenStore,
    })

    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)
    knockoutRepo = new KnockoutRepository(db)
  })

  afterEach(() => {
    if (db) db.close()
  })

  describe('Full bundle — organizer', () => {
    it('returns all fields (tournament, standings, matches, bracket)', async () => {
      const organizerId = 'org_123'
      const token = issueOrganizerToken(
        { sub: organizerId, email: 'org@test.com' },
        { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 }
      ).accessToken

      const tournament = tournamentRepo.create({
        name: 'Test Tournament',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 16,
        creatorId: organizerId,
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      const response = await request(app)
        .get(`/tournaments/${tournament.id}/bundle`)
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body.tournament).toBeDefined()
      expect(response.body.tournament.id).toBe(tournament.id)
      expect(response.body.tournament.name).toBe('Test Tournament')
      expect(response.body.standings).toBeDefined()
      expect(Array.isArray(response.body.standings)).toBe(true)
      expect(response.body.matches).toBeDefined()
      expect(response.body.matches.group).toBeDefined()
      expect(response.body.matches.knockout).toBeDefined()
      expect(response.body.bracket).toBeDefined()
    })
  })

  describe('Full bundle — player', () => {
    it('returns all fields for registered player', async () => {
      const organizerId = 'org_456'
      const playerEmail = `player_${Date.now()}@test.com`
      const playerName = 'Test Player'

      // Create tournament
      const tournament = tournamentRepo.create({
        name: 'Player Test Tournament',
        sport: 'badminton',
        matchFormat: 'singles',
        maxPlayers: 8,
        creatorId: organizerId,
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      // Register player via magic link flow
      tournamentRepo.updateStatus(tournament.id, 'registration_open')
      const registerRes = await request(app)
        .post(`/tournaments/${tournament.id}/register`)
        .send({ email: playerEmail, name: playerName })

      expect([200, 201, 202]).toContain(registerRes.status)
      const magicLinkToken = registerRes.body.magicLinkToken

      // Exchange magic link for session token
      const verifyRes = await request(app)
        .get(`/tournaments/${tournament.id}/auth/verify?token=${magicLinkToken}`)

      expect(verifyRes.status).toBe(200)
      const playerToken = verifyRes.body.playerToken

      // Get bundle as player
      const response = await request(app)
        .get(`/tournaments/${tournament.id}/bundle`)
        .set('Authorization', `Bearer ${playerToken}`)

      expect(response.status).toBe(200)
      expect(response.body.tournament).toBeDefined()
      expect(response.body.standings).toBeDefined()
      expect(response.body.matches).toBeDefined()
      expect(response.body.bracket).toBeDefined()
    })
  })

  describe('Selective fields via include parameter', () => {
    it('returns only tournament field when ?include=tournament', async () => {
      const organizerId = 'org_selective'
      const token = issueOrganizerToken(
        { sub: organizerId, email: 'org@test.com' },
        { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 }
      ).accessToken

      const tournament = tournamentRepo.create({
        name: 'Selective Test',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 8,
        creatorId: organizerId,
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      const response = await request(app)
        .get(`/tournaments/${tournament.id}/bundle?include=tournament`)
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body.tournament).toBeDefined()
      expect(response.body.standings).toBeUndefined()
      expect(response.body.matches).toBeUndefined()
      expect(response.body.bracket).toBeUndefined()
    })

    it('returns only standings and matches when ?include=standings,matches', async () => {
      const organizerId = 'org_partial'
      const token = issueOrganizerToken(
        { sub: organizerId, email: 'org@test.com' },
        { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 }
      ).accessToken

      const tournament = tournamentRepo.create({
        name: 'Partial Test',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 8,
        creatorId: organizerId,
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      const response = await request(app)
        .get(`/tournaments/${tournament.id}/bundle?include=standings,matches`)
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body.tournament).toBeUndefined()
      expect(response.body.standings).toBeDefined()
      expect(response.body.matches).toBeDefined()
      expect(response.body.bracket).toBeUndefined()
    })
  })

  describe('Authorization errors', () => {
    it('returns 401 when no auth header', async () => {
      const organizerId = 'org_noauth'
      const tournament = tournamentRepo.create({
        name: 'No Auth Test',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 8,
        creatorId: organizerId,
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      const response = await request(app)
        .get(`/tournaments/${tournament.id}/bundle`)

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('UNAUTHORIZED')
    })

    it('returns 401 when invalid token', async () => {
      const organizerId = 'org_invalid'
      const tournament = tournamentRepo.create({
        name: 'Invalid Token Test',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 8,
        creatorId: organizerId,
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      const response = await request(app)
        .get(`/tournaments/${tournament.id}/bundle`)
        .set('Authorization', 'Bearer invalid_token_xyz')

      expect(response.status).toBe(401)
    })

    it('returns 403 when organizer does not own tournament', async () => {
      const ownerOrgId = 'owner_org'
      const otherOrgId = 'other_org'
      const otherToken = issueOrganizerToken(
        { sub: otherOrgId, email: 'other@test.com' },
        { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 }
      ).accessToken

      const tournament = tournamentRepo.create({
        name: 'Ownership Test',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 8,
        creatorId: ownerOrgId,
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      // Tournament created by ownerOrgId, but we're trying to access as otherOrgId
      const response = await request(app)
        .get(`/tournaments/${tournament.id}/bundle`)
        .set('Authorization', `Bearer ${otherToken}`)

      expect(response.status).toBe(403)
      expect(response.body.code).toBe('FORBIDDEN')
    })

    it('returns 403 when player not registered in tournament', async () => {
      const organizerId = 'org_isolation'

      // Tournament 1: Create and register a player
      const tournament1 = tournamentRepo.create({
        name: 'Isolation Test 1',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 8,
        creatorId: organizerId,
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      tournamentRepo.updateStatus(tournament1.id, 'registration_open')
      const registerRes1 = await request(app)
        .post(`/tournaments/${tournament1.id}/register`)
        .send({ email: `player1_${Date.now()}@test.com`, name: 'Player 1' })

      const magicLinkToken1 = registerRes1.body.magicLinkToken
      const verifyRes1 = await request(app)
        .get(`/tournaments/${tournament1.id}/auth/verify?token=${magicLinkToken1}`)
      const playerToken1 = verifyRes1.body.playerToken

      // Tournament 2: Create but don't register the same player
      const tournament2 = tournamentRepo.create({
        name: 'Isolation Test 2',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 8,
        creatorId: organizerId,
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      // Try to access tournament2 with token from tournament1
      const response = await request(app)
        .get(`/tournaments/${tournament2.id}/bundle`)
        .set('Authorization', `Bearer ${playerToken1}`)

      expect(response.status).toBe(403)
    })
  })

  describe('Not found error', () => {
    it('returns 404 for non-existent tournament', async () => {
      const organizerId = 'org_notfound'
      const token = issueOrganizerToken(
        { sub: organizerId, email: 'org@test.com' },
        { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 }
      ).accessToken

      const response = await request(app)
        .get('/tournaments/nonexistent_tournament_id/bundle')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(404)
      expect(response.body.code).toBe('NOT_FOUND')
    })
  })

  describe('Data structure validation', () => {
    it('returns correctly shaped tournament object', async () => {
      const organizerId = 'org_shape'
      const token = issueOrganizerToken(
        { sub: organizerId, email: 'org@test.com' },
        { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 }
      ).accessToken

      const tournament = tournamentRepo.create({
        name: 'Shape Test',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 16,
        creatorId: organizerId,
        description: 'Test Description',
        registrationDeadline: new Date(Date.now() + 1000000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 2000000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 3000000).toISOString(),
      })

      const response = await request(app)
        .get(`/tournaments/${tournament.id}/bundle`)
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body.tournament).toHaveProperty('id')
      expect(response.body.tournament).toHaveProperty('name')
      expect(response.body.tournament).toHaveProperty('sport')
      expect(response.body.tournament).toHaveProperty('matchFormat')
      expect(response.body.tournament).toHaveProperty('status')
      expect(response.body.tournament).toHaveProperty('maxPlayers')
      expect(response.body.tournament).toHaveProperty('registrationDeadline')
      expect(response.body.tournament.description).toBe('Test Description')
    })
  })
})
