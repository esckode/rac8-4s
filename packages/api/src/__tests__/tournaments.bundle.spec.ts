import request from 'supertest'
import Database from 'better-sqlite3'
import { createApp } from '../app'
import {
  openDatabase,
  TournamentRepository,
  PlayerRepository,
  GroupRepository,
  KnockoutRepository,
} from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('GET /tournaments/:id/bundle - Consolidation Endpoint', () => {
  let db: Database.Database
  let app: any
  let tournamentsRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let knockoutRepo: KnockoutRepository
  let tokenStore: InMemoryTokenStore
  let organizerToken: string
  let organizerId: string
  let tournamentId: string
  let playerToken: string
  let playerId: string

  beforeEach(async () => {
    tokenStore = new InMemoryTokenStore()
    db = openDatabase(':memory:')
    app = createApp({
      config: DEFAULT_APP_CONFIG,
      db,
      jwtConfig: STANDARD_CONFIG,
      tokenStore,
    })

    tournamentsRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)
    knockoutRepo = new KnockoutRepository(db)

    // Create organizer and token
    organizerId = 'organizer_test_123'
    const tokenPair = issueOrganizerToken(
      { sub: organizerId, email: 'org@test.com' },
      STANDARD_CONFIG
    )
    organizerToken = tokenPair.accessToken

    // Create tournament
    const tournament = tournamentsRepo.create({
      name: 'Test Tournament',
      sport: 'Pickleball',
      matchFormat: 'doubles',
      maxPlayers: 16,
      registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
      groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
      knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
      creatorId: organizerId,
    })
    tournamentId = tournament.id
    tournamentsRepo.updateStatus(tournamentId, 'registration_open')

    // Register a player via magic link
    const registerRes = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({ email: 'player1@test.com', name: 'Player One' })

    const verifyRes = await request(app).get(
      `/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`
    )

    playerToken = verifyRes.body.playerToken
    const player = playerRepo.findByEmail('player1@test.com')!
    playerId = player.id

    // Set tournament to group_stage_active
    tournamentsRepo.updateStatus(tournamentId, 'group_stage_active')
  })

  afterEach(() => {
    db.close()
  })

  describe('Authorization', () => {
    it('should return 401 when no auth header provided', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/bundle`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })

    it('should return 401 when auth header is invalid', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', 'Bearer invalid_token_12345')

      expect(res.status).toBe(401)
    })

    it('should return 401 when Bearer prefix is missing', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', organizerToken)

      expect(res.status).toBe(401)
    })

    it('should return 403 when organizer does not own tournament', async () => {
      const otherOrgId = 'other_organizer_456'
      const otherTokenPair = issueOrganizerToken(
        { sub: otherOrgId, email: 'other@test.com' },
        STANDARD_CONFIG
      )

      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', `Bearer ${otherTokenPair.accessToken}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('should return 404 when tournament does not exist', async () => {
      const res = await request(app)
        .get('/tournaments/nonexistent_id/bundle')
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })
  })

  describe('Full Response - All Fields', () => {
    it('should return all 4 fields for organizer (default include)', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('tournament')
      expect(res.body).toHaveProperty('standings')
      expect(res.body).toHaveProperty('matches')
      expect(res.body).toHaveProperty('bracket')
    })

    it('should return all 4 fields for registered player (default include)', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', `Bearer ${playerToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('tournament')
      expect(res.body).toHaveProperty('standings')
      expect(res.body).toHaveProperty('matches')
      expect(res.body).toHaveProperty('bracket')
    })
  })

  describe('Include Parameter - Selective Fields', () => {
    it('should return only tournament when ?include=tournament', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle?include=tournament`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('tournament')
      expect(res.body).not.toHaveProperty('standings')
      expect(res.body).not.toHaveProperty('matches')
      expect(res.body).not.toHaveProperty('bracket')
    })

    it('should return standings,matches,bracket when ?include=standings,matches,bracket', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle?include=standings,matches,bracket`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body).not.toHaveProperty('tournament')
      expect(res.body).toHaveProperty('standings')
      expect(res.body).toHaveProperty('matches')
      expect(res.body).toHaveProperty('bracket')
    })

    it('should handle whitespace in include parameter', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle?include=tournament , standings`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('tournament')
      expect(res.body).toHaveProperty('standings')
    })
  })

  describe('Response Fields', () => {
    it('should include tournament details in response', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.tournament).toHaveProperty('id')
      expect(res.body.tournament).toHaveProperty('name')
      expect(res.body.tournament).toHaveProperty('sport')
      expect(res.body.tournament).toHaveProperty('status')
    })

    it('should include matches with group and knockout structure', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle?include=matches`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.matches).toHaveProperty('group')
      expect(res.body.matches).toHaveProperty('knockout')
      expect(Array.isArray(res.body.matches.group)).toBe(true)
      expect(Array.isArray(res.body.matches.knockout)).toBe(true)
    })

    it('should include standings by group', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle?include=standings`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.standings)).toBe(true)
    })

    it('should include bracket information', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle?include=bracket`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.bracket).toBeDefined()
    })
  })

  describe('Role-Based Access', () => {
    it('organizer can access bundle for owned tournament', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('tournament')
    })

    it('player can access bundle for registered tournament', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', `Bearer ${playerToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('tournament')
    })

    it('data is consistent across roles', async () => {
      const orgRes = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const playerRes = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', `Bearer ${playerToken}`)

      expect(orgRes.status).toBe(200)
      expect(playerRes.status).toBe(200)
      expect(orgRes.body.tournament.id).toBe(playerRes.body.tournament.id)
    })
  })
})
