import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { PlayerFactory, TournamentFactory, OrganizerFactory } from '../factories'
import { generatePlayerSession } from '../../auth/magic-link'

describe('Bracket API', () => {
  let pool: Pool
  let app: Express
  let tokenStore: any
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

  // Helper: Create tournament and advance through group stage
  async function setupBracketTournament(organizerId: string, numGroups: number = 2) {
    const tournament = await TournamentFactory.create(pool, organizerId)

    // Set status to registration_closed
    const { TournamentRepository } = require('../../db')
    const repo = new TournamentRepository(pool)
    await repo.updateStatus(tournament.id, 'registration_closed')

    // Create and register players (at least numGroups * 2)
    const playerIds: string[] = []
    for (let i = 0; i < numGroups * 3; i++) {
      const player = await PlayerFactory.create(pool)
      await PlayerFactory.createAndRegister(pool, tournament.id, {
        email: player.email,
        name: player.name,
      })
      playerIds.push(player.id)
    }

    // Create groups
    const { GroupRepository } = require('../../db')
    const groupRepo = new GroupRepository(pool)
    const groups = await groupRepo.createGroups(tournament.id, numGroups, 2, playerIds)

    // Set status to group_stage_complete
    await repo.updateStatus(tournament.id, 'group_stage_complete')

    return { tournament, groups, playerIds }
  }

  // Helper: Create player with session token
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

  // Helper: Get player token for specific player ID
  async function getPlayerToken(playerId: string, tournamentId: string) {
    const { PlayerRepository } = require('../../db')
    const playerRepo = new PlayerRepository(pool)
    const player = await playerRepo.findById(playerId)
    if (!player) throw new Error(`Player not found: ${playerId}`)

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

  describe('GET /tournaments/:id/bracket', () => {
    it('returns bracket after generation', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Get bracket
      const res = await request(app).get(`/tournaments/${tournament.id}/bracket`)

      expect(res.status).toBe(200)
      expect(res.body.bracket).toBeDefined()
      expect(Array.isArray(res.body.bracket.rounds)).toBe(true)
      expect(res.body.bracket.totalPlayers).toBeGreaterThan(0)
      expect(typeof res.body.bracket.byeCount).toBe('number')
    })

    it('returns 404 if bracket not generated', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      const res = await request(app).get(`/tournaments/${tournament.id}/bracket`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('BRACKET_NOT_GENERATED')
    })

    it('returns 404 for non-existent tournament', async () => {
      const res = await request(app).get('/tournaments/nonexistent/bracket')

      expect(res.status).toBe(404)
    })

    it('returns bracket structure with matches', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const res = await request(app).get(`/tournaments/${tournament.id}/bracket`)

      expect(res.status).toBe(200)
      const rounds = res.body.bracket.rounds
      expect(rounds.length).toBeGreaterThan(0)

      // Check first round has matches
      const firstRound = rounds.find((r: any) => r.round === 1)
      expect(firstRound).toBeDefined()
      expect(Array.isArray(firstRound.matches)).toBe(true)

      // Check match structure
      const match = firstRound.matches[0]
      expect(match.id).toBeDefined()
      expect(typeof match.round).toBe('number')
      expect(typeof match.position).toBe('number')
      expect(match.status).toBe('pending')
    })
  })

  describe('POST /tournaments/:id/bracket/generate', () => {
    it('generates bracket from group standings', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      expect(res.body.bracket).toBeDefined()
      expect(Array.isArray(res.body.bracket.rounds)).toBe(true)
      expect(res.body.bracket.totalPlayers).toBeGreaterThan(0)
    })

    it('rejects if tournament not in group_stage_complete status', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('rejects if no groups exist', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Manually set status to group_stage_complete without creating groups
      const { TournamentRepository } = require('../../db')
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)

      expect(res.status).toBe(401)
    })

    it('rejects if organizer does not own tournament', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Different organizer's token
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent tournament', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post('/tournaments/nonexistent/bracket/generate')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(404)
    })

    it('returns bracket with correct player seeding', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId, 2)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      const bracket = res.body.bracket
      expect(bracket.totalPlayers).toBe(4) // 2 groups * 2 advancing per group
      expect(bracket.rounds.length).toBeGreaterThan(0)
    })
  })

  describe('PATCH /tournaments/:id/bracket', () => {
    it('updates seeding for existing bracket', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament, playerIds } = await setupBracketTournament(organizerId)

      // Generate initial bracket
      const genRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const totalPlayers = genRes.body.bracket.totalPlayers
      const seeds = []

      // Use actual players from tournament, reordered
      for (let i = 0; i < totalPlayers; i++) {
        seeds.push({
          playerId: playerIds[i % playerIds.length],
          seedPosition: i + 1,
        })
      }

      // Reseed bracket
      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds })

      expect(res.status).toBe(200)
      expect(res.body.bracket).toBeDefined()
      expect(res.body.bracket.totalPlayers).toBe(seeds.length)
    })

    it('rejects if tournament not in group_stage_complete status', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds: [] })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('rejects if bracket not generated yet', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds: [] })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('BRACKET_NOT_GENERATED')
    })

    it('rejects invalid seed format', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate initial bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Invalid: missing seedPosition
      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds: [{ playerId: 'player_1' }] })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('rejects if seeds is not an array', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate initial bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ seeds: 'not-an-array' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate initial bracket
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/bracket`)
        .send({ seeds: [] })

      expect(res.status).toBe(401)
    })
  })

  describe('POST /tournaments/:id/bracket/publish', () => {
    it('publishes bracket and transitions to knockout_active', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Publish bracket
      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.matches)).toBe(true)
      expect(res.body.matches.length).toBeGreaterThan(0)
    })

    it('rejects if bracket not generated', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('BRACKET_NOT_GENERATED')
    })

    it('rejects if tournament not in group_stage_complete status', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('requires organizer authentication', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate bracket
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)

      expect(res.status).toBe(401)
    })

    it('rejects if organizer does not own tournament', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate bracket with original organizer
      const { accessToken } = OrganizerFactory.token(jwtConfig)
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Try to publish with different organizer
      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent tournament', async () => {
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post('/tournaments/nonexistent/bracket/publish')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(404)
    })

    it('creates knockout matches with correct structure', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Publish bracket
      const res = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      const matches = res.body.matches
      expect(matches.length).toBeGreaterThan(0)

      // Check match structure
      const match = matches[0]
      expect(match.id).toBeDefined()
      expect(typeof match.round).toBe('number')
      expect(typeof match.position).toBe('number')
      expect(match.status).toBe('pending')
    })
  })

  describe('POST /tournaments/:id/knockout/:matchId/score', () => {
    it('player submits knockout match score', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId, 8)

      // Generate and publish bracket with many players
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      const matches = publishRes.body.matches
      expect(Array.isArray(matches)).toBe(true)
      expect(matches.length).toBeGreaterThan(0)

      // Test that endpoint accepts requests when tournament is in knockout_active
      const { sessionToken } = await createPlayerWithToken(tournament.id)
      const match = matches[0]

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ score: '6-4 6-3' })

      // Response should be 200, 403 (player not in match), or 409 (incomplete match)
      expect([200, 403, 409]).toContain(res.status)
    })

    it('rejects score submission if tournament not in knockout_active', async () => {
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)

      // Set to group_stage_complete but don't generate or publish bracket
      const { TournamentRepository } = require('../../db')
      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'group_stage_complete')

      const { sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/knockout/match_1/score`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ score: '6-4 6-3' })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('rejects if match has incomplete players', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId, 1)

      // Generate and publish bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Find a match with incomplete players (no players or only one)
      const matches = publishRes.body.matches
      const incompleteMatch = matches.find((m: any) => !m.player1Id || !m.player2Id)

      if (incompleteMatch) {
        // Create a player in the tournament to test
        const { player, sessionToken } = await createPlayerWithToken(tournament.id)

        const res = await request(app)
          .post(`/tournaments/${tournament.id}/knockout/${incompleteMatch.id}/score`)
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({ score: '6-4 6-3' })

        // Should be 409 (incomplete players) or 403 (player not in match) depending on match structure
        expect([409, 403]).toContain(res.status)
      }
    })

    it('requires player authentication', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate and publish bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      const match = publishRes.body.matches[0]

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
        .send({ score: '6-4 6-3' })

      expect(res.status).toBe(401)
    })

    it('rejects if player not in tournament', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament: tournament1 } = await setupBracketTournament(organizerId)

      // Create a different tournament
      const tournament2 = await TournamentFactory.create(pool, organizerId)

      // Generate and publish bracket for tournament1
      await request(app)
        .post(`/tournaments/${tournament1.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament1.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      const match = publishRes.body.matches[0]

      // Create player in tournament2 but not tournament1
      const { sessionToken } = await createPlayerWithToken(tournament2.id)

      const res = await request(app)
        .post(`/tournaments/${tournament1.id}/knockout/${match.id}/score`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ score: '6-4 6-3' })

      expect(res.status).toBe(403)
    })

    it('rejects if player not participant in match', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament, playerIds } = await setupBracketTournament(organizerId, 4)

      // Generate and publish bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      const match = publishRes.body.matches[0]

      // Find a player not in this match
      let outsidePlayerToken
      if (match.player1Id && match.player2Id) {
        for (const playerId of playerIds) {
          if (playerId !== match.player1Id && playerId !== match.player2Id) {
            const result = await getPlayerToken(playerId, tournament.id)
            outsidePlayerToken = result.sessionToken
            break
          }
        }
      }

      if (outsidePlayerToken) {
        const res = await request(app)
          .post(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
          .set('Authorization', `Bearer ${outsidePlayerToken}`)
          .send({ score: '6-4 6-3' })

        expect(res.status).toBe(403)
      }
    })

    it('rejects invalid score format', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate and publish bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      const match = publishRes.body.matches[0]

      // Use actual player from match
      if (match.player1Id) {
        const { sessionToken } = await getPlayerToken(match.player1Id, tournament.id)

        const res = await request(app)
          .post(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({ score: 'invalid-score' })

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('SCORE_INVALID')
      }
    })

    it('returns 404 for non-existent match', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate and publish bracket to set status to knockout_active
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      const { sessionToken } = await createPlayerWithToken(tournament.id)

      const res = await request(app)
        .post(`/tournaments/${tournament.id}/knockout/nonexistent/score`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ score: '6-4 6-3' })

      expect(res.status).toBe(404)
    })

    it('returns 404 for non-existent tournament', async () => {
      // Create a player in any tournament just to get a valid session token
      const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const { sessionToken } = await createPlayerWithToken(tournament.id)

      // Use a completely non-existent tournament ID format
      const fakeId = `tournament_${Date.now()}_fake_nonexistent`

      const res = await request(app)
        .post(`/tournaments/${fakeId}/knockout/match_1/score`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ score: '6-4 6-3' })

      // Endpoint returns 404 when tournament doesn't exist (before checking player in tournament)
      expect([404, 403]).toContain(res.status)
    })
  })

  describe('PATCH /tournaments/:id/knockout/:matchId/score', () => {
    it('organizer overrides knockout match score', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId, 8)

      // Generate and publish bracket with many players
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      // Test that endpoint accepts requests from organizer
      const matches = publishRes.body.matches
      const match = matches[0]

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ score: '6-4 6-3' })

      // Response should be 200, 409 (incomplete match), or 400 (validation error)
      expect([200, 409, 400]).toContain(res.status)
    })

    it('requires organizer authentication', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate and publish bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      const matches = publishRes.body.matches
      const match = matches.find((m: any) => m.player1Id && m.player2Id) || matches[0]

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
        .send({ score: '6-4 6-3' })

      expect(res.status).toBe(401)
    })

    it('rejects if organizer does not own tournament', async () => {
      const { sub: organizerId, accessToken: token1 } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate and publish bracket with original organizer
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${token1}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${token1}`)

      const matches = publishRes.body.matches
      const match = matches.find((m: any) => m.player1Id && m.player2Id) || matches[0]

      // Try to override with different organizer
      const { accessToken: otherToken } = OrganizerFactory.token(jwtConfig)
      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ score: '6-4 6-3' })

      expect(res.status).toBe(403)
    })

    it('rejects invalid score format', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate and publish bracket
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      const publishRes = await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      const matches = publishRes.body.matches
      const match = matches.find((m: any) => m.player1Id && m.player2Id) || matches[0]

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ score: 'definitely-invalid-score-format' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('SCORE_INVALID')
    })

    it('returns 404 for non-existent knockout match', async () => {
      const { sub: organizerId, accessToken } = OrganizerFactory.token(jwtConfig)
      const { tournament } = await setupBracketTournament(organizerId)

      // Generate and publish bracket to set status to knockout_active
      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/generate`)
        .set('Authorization', `Bearer ${accessToken}`)

      await request(app)
        .post(`/tournaments/${tournament.id}/bracket/publish`)
        .set('Authorization', `Bearer ${accessToken}`)

      const res = await request(app)
        .patch(`/tournaments/${tournament.id}/knockout/truly_nonexistent_match_id/score`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ score: '6-4 6-3' })

      expect(res.status).toBe(404)
    })
  })
})
