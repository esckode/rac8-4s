import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, PlayerFactory, OrganizerFactory } from '../factories'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'

describe('Phase 3: Group Stage - Singles', () => {
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

  describe('Scenario: User views tournament standings (Singles)', () => {
    it('retrieves standings with correct ranking and stats', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 2 })

      expect(groupRes.status).toBe(201)
      const groupId = groupRes.body.groups[0].id

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupId)
      const match = matches[0]

      // Player 1 submits a score
      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id!,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-3' })

      // Get standings
      const standingsRes = await request(app)
        .get(`/tournaments/${tournament.id}/groups/${groupId}/standings`)
        .set('Authorization', `Bearer ${player1Session.token}`)

      expect(standingsRes.status).toBe(200)
      expect(Array.isArray(standingsRes.body.standings)).toBe(true)
      expect(standingsRes.body.standings.length).toBeGreaterThan(0)

      // Verify standings include required fields
      const standing = standingsRes.body.standings[0]
      expect(standing).toHaveProperty('rank')
      expect(standing).toHaveProperty('name') // API returns 'name' not 'playerName'
      expect(standing).toHaveProperty('wins')
      expect(standing).toHaveProperty('losses')
      expect(standing).toHaveProperty('setsWon')
      expect(standing).toHaveProperty('setsLost')
    })
  })

  describe('Scenario: User views upcoming matches (Singles)', () => {
    it('retrieves match list with correct status and opponent info', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 2 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id!,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      // Get player's matches
      const matchesRes = await request(app)
        .get(`/tournaments/${tournament.id}/matches`)
        .set('Authorization', `Bearer ${player1Session.token}`)

      expect(matchesRes.status).toBe(200)
      expect(Array.isArray(matchesRes.body.matches)).toBe(true)
      expect(matchesRes.body.matches.length).toBeGreaterThan(0)

      // Verify match includes required fields
      const playerMatch = matchesRes.body.matches[0]
      expect(playerMatch).toHaveProperty('id')
      expect(playerMatch).toHaveProperty('group_id') // API returns snake_case
      expect(playerMatch).toHaveProperty('player1_id')
      expect(playerMatch).toHaveProperty('player2_id')
      expect(playerMatch).toHaveProperty('status')
    })
  })

  describe('Scenario: User cannot submit tied score', () => {
    it('rejects tied score like 2-2', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 2 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id!,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const tiedScoreRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-6' })

      expect(tiedScoreRes.status).toBe(400)
      expect(tiedScoreRes.body.code).toBe('SCORE_INVALID')
    })
  })

  describe('Scenario: User cannot submit duplicate score', () => {
    it('rejects second score submission for already scored match', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 2 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id!,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      // First submission succeeds
      const firstRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-3' })

      expect(firstRes.status).toBe(200)

      // Second submission should fail
      const secondRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-2, 6-2' })

      expect(secondRes.status).toBe(409)
      expect(secondRes.body.code).toBe('ALREADY_SCORED')
    })
  })

  describe('Scenario: User can edit previously submitted score', () => {
    it('allows updating score via PATCH endpoint', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 2 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id!,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      // Submit initial score
      const firstRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-3' })

      expect(firstRes.status).toBe(200)
      expect(firstRes.body.match.score).toBe('6-4, 6-3')

      // Edit score via PATCH
      const editRes = await request(app)
        .patch(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-2, 6-1' })

      expect(editRes.status).toBe(200)
      expect(editRes.body.match.score).toBe('6-2, 6-1')
    })
  })

  describe('Scenario: User cannot submit score after deadline', () => {
    it('rejects score submission when group stage deadline passed', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const now = new Date()
      const pastDeadline = new Date(now.getTime() - 86400000)

      const tournament = await TournamentFactory.create(pool, organizerId, {
        groupStageDeadline: pastDeadline.toISOString(),
      })
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 2 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id!,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const scoreRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-3' })

      expect(scoreRes.status).toBe(409)
      expect(scoreRes.body.code).toBe('DEADLINE_PASSED')
    })

    it('rejects a score when the deadline passed only moments ago (timezone-correct)', async () => {
      // A deadline 60s in the past must be enforced regardless of server timezone.
      // With naive TIMESTAMP columns the stored value is shifted by the server's
      // UTC offset, so a recently-passed deadline reads as still in the future.
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const pastDeadline = new Date(Date.now() - 60_000) // 60 seconds ago

      const tournament = await TournamentFactory.create(pool, organizerId, {
        groupStageDeadline: pastDeadline.toISOString(),
      })
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')
      const players = await Promise.all([
        PlayerFactory.create(pool),
        PlayerFactory.create(pool),
      ])

      const playerRepo = new PlayerRepository(pool)
      for (const player of players) {
        await playerRepo.createRegistration(player.id, tournament.id)
      }

      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 1 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: match.player1_id!,
          tournamentId: tournament.id,
          email: `player${match.player1_id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      const scoreRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-3' })

      expect(scoreRes.status).toBe(409)
      expect(scoreRes.body.code).toBe('DEADLINE_PASSED')
    })
  })
})
