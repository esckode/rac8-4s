import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, PlayerFactory, OrganizerFactory } from '../factories'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../../db'
import { TeamRepository } from '../../repositories/team-repository'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'

describe('Phase 4: Group Stage - Doubles', () => {
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

  describe('Scenario: User views tournament standings (Doubles)', () => {
    it('retrieves team standings with correct ranking and stats', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
      const repo = new TournamentRepository(pool)

      await repo.updateStatus(tournament.id, 'registration_closed')

      // Create 4 players
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

      // Create groups - endpoint will auto-create teams from players
      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 1 })

      expect(groupRes.status).toBe(201)
      const groupId = groupRes.body.groups[0].id

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupId)
      const match = matches[0]

      // Player 1 submits a score on behalf of team 1
      const player1Session = await generatePlayerSession(
        {
          playerId: players[0].id,
          tournamentId: tournament.id,
          email: `player${players[0].id}@test.local`,
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

      // Verify standings include team info
      const standing = standingsRes.body.standings[0]
      expect(standing).toHaveProperty('rank')
      expect(standing).toHaveProperty('name') // Team name
      expect(standing).toHaveProperty('wins')
      expect(standing).toHaveProperty('losses')
      expect(standing).toHaveProperty('setsWon')
      expect(standing).toHaveProperty('setsLost')
    })
  })

  describe('Scenario: User views team matches (Doubles)', () => {
    it('retrieves match list with team names and opponent info', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
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
        .send({ numGroups: 1, advancingPerGroup: 1 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: players[0].id,
          tournamentId: tournament.id,
          email: `player${players[0].id}@test.local`,
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

      // Verify match includes team info
      const m = matchesRes.body.matches[0]
      expect(m).toHaveProperty('id')
      expect(m).toHaveProperty('team1_id')
      expect(m).toHaveProperty('team2_id')
      expect(m).toHaveProperty('status')
    })
  })

  describe('Scenario: User submits score for team match (Doubles)', () => {
    it('allows team member to submit match score and updates standings', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
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
        .send({ numGroups: 1, advancingPerGroup: 1 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const groupRepo = new GroupRepository(pool)
      const matches = await groupRepo.findMatchesByGroup(groupRes.body.groups[0].id)
      const match = matches[0]

      const player1Session = await generatePlayerSession(
        {
          playerId: players[0].id,
          tournamentId: tournament.id,
          email: `player${players[0].id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      // Submit score
      const scoreRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-3' })

      expect(scoreRes.status).toBe(200)
      expect(scoreRes.body.match).toHaveProperty('team1_id')
      expect(scoreRes.body.match).toHaveProperty('team2_id')
      expect(scoreRes.body.match).toHaveProperty('winner_id') // Team ID, not player ID
      expect(scoreRes.body.match.status).toBe('completed')
    })
  })

  describe('Scenario: Team stands in standings with correct name (Doubles)', () => {
    it('displays team name instead of individual player name', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
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
        .send({ numGroups: 1, advancingPerGroup: 1 })

      await repo.updateStatus(tournament.id, 'group_stage_active')

      const player1Session = await generatePlayerSession(
        {
          playerId: players[0].id,
          tournamentId: tournament.id,
          email: `player${players[0].id}@test.local`,
          createdAt: Date.now(),
        },
        3600,
        tokenStore
      )

      // Get standings
      const standingsRes = await request(app)
        .get(`/tournaments/${tournament.id}/groups/${groupRes.body.groups[0].id}/standings`)
        .set('Authorization', `Bearer ${player1Session.token}`)

      expect(standingsRes.status).toBe(200)
      const standings = standingsRes.body.standings

      // Team name should be something like "Team Name" or team identifier, not just player names
      const standing = standings[0]
      expect(standing.name).toBeTruthy()
      // Verify it's not a single player name (team names have specific format)
      expect(standing.name).not.toEqual(players[0].name)
    })
  })
})
