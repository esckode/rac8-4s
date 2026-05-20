import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../app'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'
import { initializeTestDb, resetTestDb } from './db-test-setup'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Match Scoring Coverage Tests', () => {
  let db: Pool
  let app: any
  let tokenStore: InMemoryTokenStore
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository

  let tournamentId: string
  let organizerToken: string
  let players: any[] = []
  let matchId: string

  beforeAll(async () => {
    db = await initializeTestDb()
  }, 30000)

  beforeEach(async () => {
    await resetTestDb(db)
    tokenStore = new InMemoryTokenStore()
    app = createApp({ config: DEFAULT_APP_CONFIG, db, tokenStore, jwtConfig: STANDARD_CONFIG })

    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)

    const organizerId = 'org_match_scoring'
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'match@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    const now = new Date()
    const pastDeadline = new Date(now.getTime() - 1000 * 60 * 60).toISOString()
    const futureDeadline = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString()

    const tournament = await tournamentRepo.create({
      name: `Match Scoring Test ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 100,
      registrationDeadline: pastDeadline,
      groupStageDeadline: futureDeadline,
      knockoutStageDeadline: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      creatorId: organizerId,
    })

    tournamentId = tournament.id

    // Create 4 players for group testing
    players = []
    for (let i = 1; i <= 4; i++) {
      const player = await playerRepo.findOrCreatePlayerByEmail(`match_player${i}@test.com`, `Match Player ${i}`)
      players.push(player)
      await playerRepo.createRegistration(player.id, tournamentId)
    }

    // Transition to group_stage_active and create groups
    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    await tournamentRepo.updateStatus(tournamentId, 'group_stage_active')
    
    const groups = await groupRepo.createGroups(tournamentId, 2, 1, players.map(p => p.id))
    const matches = await groupRepo.findMatchesByGroup(groups[0].id)
    if (matches.length > 0) {
      matchId = matches[0].id
    }
  }, 30000)

  describe('PATCH /:id/matches/:matchId/score - Organizer override', () => {
    it('should allow organizer to override match score', async () => {
      if (!matchId) {
        pending('No match ID available')
      }

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(200)
      expect(res.body.match).toBeDefined()
      expect(res.body.match.winnerId).toBeDefined()
    })

    it('should reject override without auth', async () => {
      if (!matchId) {
        pending('No match ID available')
      }

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(401)
    })

    it('should reject override from different organizer', async () => {
      if (!matchId) {
        pending('No match ID available')
      }

      const otherOrganizerToken = issueOrganizerToken(
        { sub: 'other_org', email: 'other@test.com' },
        STANDARD_CONFIG
      ).accessToken

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(403)
    })

    it('should reject override for non-existent match', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/nonexistent/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(404)
    })

    it('should reject override for non-existent tournament', async () => {
      if (!matchId) {
        pending('No match ID available')
      }

      const res = await request(app)
        .patch(`/tournaments/nonexistent/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-4, 6-3' })

      expect(res.status).toBe(404)
    })

    it('should reject override with invalid score format', async () => {
      if (!matchId) {
        pending('No match ID available')
      }

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: 'invalid score' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('SCORE_INVALID')
    })

    it('should reject override with non-string score', async () => {
      if (!matchId) {
        pending('No match ID available')
      }

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: 123 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('POST /organizer endpoint', () => {
    it('should list organizer tournaments', async () => {
      const res = await request(app)
        .get('/tournaments/organizer')
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.tournaments)).toBe(true)
    })

    it('should support offset and limit parameters', async () => {
      const res = await request(app)
        .get('/tournaments/organizer?offset=0&limit=5')
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
    })

    it('should support status filter', async () => {
      const res = await request(app)
        .get('/tournaments/organizer?status=group_stage_active')
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
    })

    it('should reject without auth', async () => {
      const res = await request(app).get('/tournaments/organizer')

      expect(res.status).toBe(401)
    })
  })
})
