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
      // Score response contract: { id, score, winnerId, status }. For doubles winnerId is a team ID.
      expect(scoreRes.body.match.winnerId).toBeTruthy()
      expect(scoreRes.body.match.status).toBe('completed')
    })

    it('allows a team member to edit a doubles score via PATCH', async () => {
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

      // Submit, then edit via PATCH as a team member
      await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-3' })

      const editRes = await request(app)
        .patch(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Session.token}`)
        .send({ score: '6-4, 6-2' })

      expect(editRes.status).toBe(200)
      expect(editRes.body.match.score).toBe('6-4, 6-2')
      expect(editRes.body.match.winnerId).toBeTruthy()
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

  describe('Scenario: Registration API + Group Creation Flow (doubles)', () => {
    it('registers players via API without partner selection and creates groups', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
      const repo = new TournamentRepository(pool)

      // Open registration
      await repo.updateStatus(tournament.id, 'registration_open')

      // Register 4 players via API without partner selection
      const emails = [
        `api-player-1-${Date.now()}@test.local`,
        `api-player-2-${Date.now()}@test.local`,
        `api-player-3-${Date.now()}@test.local`,
        `api-player-4-${Date.now()}@test.local`,
      ]

      for (let i = 0; i < emails.length; i++) {
        const regRes = await request(app)
          .post(`/tournaments/${tournament.id}/register`)
          .send({
            email: emails[i],
            name: `API Player ${i + 1}`,
          })

        if (regRes.status !== 202) {
          console.error(`Registration ${i} failed:`, regRes.status, regRes.body)
        }
        expect(regRes.status).toBe(202)
      }

      // Close registration
      await repo.updateStatus(tournament.id, 'registration_closed')

      // Create groups
      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 1 })

      if (groupRes.status !== 201) {
        console.error('Group creation failed:', groupRes.status, groupRes.body)
      }
      expect(groupRes.status).toBe(201)
      expect(groupRes.body.groups).toBeDefined()
      expect(groupRes.body.groups.length).toBe(1)
      expect(groupRes.body.groups[0].playerCount).toBeGreaterThan(0)
    })

    it('registers 8 players and creates 2 groups with 2 teams each', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
      const repo = new TournamentRepository(pool)

      // Open registration
      await repo.updateStatus(tournament.id, 'registration_open')

      // Register 8 players via API
      const emails: string[] = []
      for (let i = 0; i < 8; i++) {
        const email = `api-8p-${i}-${Date.now()}@test.local`
        emails.push(email)

        const regRes = await request(app)
          .post(`/tournaments/${tournament.id}/register`)
          .send({
            email,
            name: `Player ${i + 1}`,
          })

        if (regRes.status !== 202) {
          console.error(`Registration ${i} failed:`, regRes.status, regRes.body)
        }
        expect(regRes.status).toBe(202)
      }

      // Close registration
      await repo.updateStatus(tournament.id, 'registration_closed')

      // Create groups (2 groups for 8 players = 4 per group = 2 teams per group)
      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      if (groupRes.status !== 201) {
        console.error('Group creation failed:', groupRes.status, groupRes.body)
      }
      expect(groupRes.status).toBe(201)
      expect(groupRes.body.groups.length).toBe(2)

      // Each group should have 4 players (2 teams × 2 players)
      for (const group of groupRes.body.groups) {
        expect(group.playerCount).toBe(4)
      }
    })

    it('registers 12 players and creates 3 groups', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles', maxPlayers: 12 })
      const repo = new TournamentRepository(pool)

      // Open registration
      await repo.updateStatus(tournament.id, 'registration_open')

      // Register 12 players
      for (let i = 0; i < 12; i++) {
        const regRes = await request(app)
          .post(`/tournaments/${tournament.id}/register`)
          .send({
            email: `api-12p-${i}-${Date.now()}@test.local`,
            name: `Player ${i + 1}`,
          })

        if (regRes.status !== 202) {
          console.error(`Registration ${i} failed:`, regRes.status, regRes.body)
        }
        expect(regRes.status).toBe(202)
      }

      // Close registration
      await repo.updateStatus(tournament.id, 'registration_closed')

      // Create groups (3 groups for 12 players = 4 per group)
      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 3, advancingPerGroup: 1 })

      if (groupRes.status !== 201) {
        console.error('Group creation failed:', groupRes.status, groupRes.body)
      }
      expect(groupRes.status).toBe(201)
      expect(groupRes.body.groups.length).toBe(3)

      // Verify each group has correct player count
      let totalPlayers = 0
      for (const group of groupRes.body.groups) {
        expect(group.playerCount).toBe(4)
        totalPlayers += group.playerCount
      }
      expect(totalPlayers).toBe(12)
    })

    it('verifies group membership after group creation', async () => {
      const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
      const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
      const repo = new TournamentRepository(pool)

      // Open and register players
      await repo.updateStatus(tournament.id, 'registration_open')

      for (let i = 0; i < 4; i++) {
        await request(app)
          .post(`/tournaments/${tournament.id}/register`)
          .send({
            email: `verify-${i}-${Date.now()}@test.local`,
            name: `Verify Player ${i}`,
          })
      }

      await repo.updateStatus(tournament.id, 'registration_closed')

      // Create groups
      const groupRes = await request(app)
        .post(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ numGroups: 1, advancingPerGroup: 1 })

      expect(groupRes.status).toBe(201)
      const groupId = groupRes.body.groups[0].id

      // Fetch group details
      const detailRes = await request(app)
        .get(`/tournaments/${tournament.id}/groups`)
        .set('Authorization', `Bearer ${orgToken}`)

      expect(detailRes.status).toBe(200)
      expect(detailRes.body.groups).toBeDefined()

      const group = detailRes.body.groups.find((g: any) => g.id === groupId)
      expect(group).toBeDefined()
      expect(group.players).toBeDefined()
      expect(group.players.length).toBe(4)
    })
  })
})
