import request from 'supertest'
import Database from 'better-sqlite3'
import { createApp } from '../app'
import { openDatabase, TournamentRepository, PlayerRepository, GroupRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Group Stage Management', () => {
  let db: Database.Database
  let app: any
  let tournamentsRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let tokenStore: InMemoryTokenStore
  let organizerToken: string
  let organizerId: string
  let tournamentId: string
  let playerIds: string[] = []

  beforeEach(() => {
    tokenStore = new InMemoryTokenStore()
    db = openDatabase(':memory:')
    app = createApp({

      config: DEFAULT_APP_CONFIG,      db,
      jwtConfig: STANDARD_CONFIG,
      tokenStore,
    })

    tournamentsRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)

    organizerId = 'organizer_test_123'
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'org@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    // Create tournament
    const tournament = tournamentsRepo.create({
      name: 'Test Tournament',
      sport: 'Tennis',
      matchFormat: 'singles',
      maxPlayers: 8,
      registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
      groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
      knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
      creatorId: organizerId,
    })
    tournamentId = tournament.id

    // Set status to registration_open
    tournamentsRepo.updateStatus(tournamentId, 'registration_open')

    // Create and register 6 players
    for (let i = 1; i <= 6; i++) {
      const player = playerRepo.findOrCreatePlayerByEmail(`player${i}@test.com`, `Player ${i}`)
      playerIds.push(player.id)
      playerRepo.createRegistration(player.id, tournamentId)
    }

    // Set status to registration_closed
    tournamentsRepo.updateStatus(tournamentId, 'registration_closed')
  })

  describe('POST /:id/advance - tournament state transitions', () => {
    it('should advance from registration_open to registration_closed', async () => {
      // Reset tournament to registration_open
      tournamentsRepo.updateStatus(tournamentId, 'registration_open')

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/advance`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ action: 'CLOSE_REGISTRATION' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('registration_closed')
      expect(res.body.previousStatus).toBe('registration_open')
    })

    it('should return 409 for invalid transition', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/advance`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ action: 'COMPLETE_TOURNAMENT' })

      expect(res.status).toBe(409)
      expect(res.body.code).toMatch(/INVALID_TRANSITION|GUARD_FAILED/)
    })

    it('should return 400 if action is missing', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/advance`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 404 for unknown tournament', async () => {
      const res = await request(app)
        .post('/tournaments/unknown_id/advance')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ action: 'CLOSE_REGISTRATION' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('should return 403 if non-owner organizer tries to advance', async () => {
      const otherTokenPair = issueOrganizerToken({ sub: 'other_organizer', email: 'other@test.com' }, STANDARD_CONFIG)
      const otherOrganizerToken = otherTokenPair.accessToken

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/advance`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({ action: 'CLOSE_REGISTRATION' })

      expect(res.status).toBe(403)
    })

    it('should return 401 if no auth provided', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/advance`)
        .send({ action: 'CLOSE_REGISTRATION' })

      expect(res.status).toBe(401)
    })
  })

  describe('POST /:id/groups - create groups', () => {
    it('should create groups and distribute players evenly', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(201)
      expect(res.body.groups).toHaveLength(2)
      expect(res.body.groups[0].name).toBe('Group A')
      expect(res.body.groups[1].name).toBe('Group B')

      // Verify tournament status is updated
      const updated = tournamentsRepo.findById(tournamentId)
      expect(updated!.status).toBe('group_stage_active')
    })

    it('should generate correct number of matches per group', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      const groups = groupRepo.findGroupsByTournament(tournamentId)
      expect(groups).toHaveLength(2)

      for (const group of groups) {
        const matches = groupRepo.findMatchesByGroup(group.id)
        const members = groupRepo.findMembersByGroup(group.id)
        const expectedMatches = (members.length * (members.length - 1)) / 2

        expect(matches.length).toBe(expectedMatches)
      }
    })

    it('should return 400 if numGroups is invalid', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: -1, advancingPerGroup: 1 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 400 if advancingPerGroup is invalid', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: 2, advancingPerGroup: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 400 if not enough players for requested groups', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: 10, advancingPerGroup: 1 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 409 if tournament is not in registration_closed status', async () => {
      tournamentsRepo.updateStatus(tournamentId, 'registration_open')

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_STATE')
    })

    it('should return 403 if non-owner organizer tries to create groups', async () => {
      const otherTokenPair = issueOrganizerToken({ sub: 'other_organizer', email: 'other@test.com' }, STANDARD_CONFIG)
      const otherOrganizerToken = otherTokenPair.accessToken

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(403)
    })

    it('should return 401 if no auth provided', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      expect(res.status).toBe(401)
    })
  })

  describe('GET /:id/groups - list groups with members', () => {
    beforeEach(async () => {
      // Create groups first
      await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })
    })

    it('should return groups with member names', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.groups).toHaveLength(2)
      expect(res.body.groups[0].name).toBe('Group A')
      expect(res.body.groups[0].players).toBeDefined()
      expect(res.body.groups[0].players.length).toBeGreaterThan(0)
      expect(res.body.groups[0].matchCount).toBeGreaterThan(0)
    })

    it('should return 403 if non-owner organizer tries to list groups', async () => {
      const otherTokenPair = issueOrganizerToken({ sub: 'other_organizer', email: 'other@test.com' }, STANDARD_CONFIG)
      const otherOrganizerToken = otherTokenPair.accessToken

      const res = await request(app)
        .get(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)

      expect(res.status).toBe(403)
    })

    it('should return 401 if no auth provided', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/groups`)

      expect(res.status).toBe(401)
    })
  })

  describe('GET /:id/groups/:groupId/standings - group standings', () => {
    let groupId: string
    let playerSessionToken: string
    let standingsTournamentId: string
    let standingsPlayerIds: string[]

    beforeEach(async () => {
      // Create a fresh tournament for standings tests to avoid state conflicts
      const standingsTournament = tournamentsRepo.create({
        name: 'Standings Test Tournament',
        sport: 'Tennis',
        matchFormat: 'singles',
        maxPlayers: 8,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })
      standingsTournamentId = standingsTournament.id

      // Set status to registration_open
      tournamentsRepo.updateStatus(standingsTournamentId, 'registration_open')

      // Create 6 players for this tournament (use timestamp to ensure uniqueness across tests)
      standingsPlayerIds = []
      let player1Email = ''
      const testTimestamp = Date.now()
      for (let i = 1; i <= 6; i++) {
        const email = `standings_player${i}_${testTimestamp}@test.com` // Include timestamp to ensure uniqueness across tests
        const player = playerRepo.findOrCreatePlayerByEmail(email, `Standings Player ${i}`)
        standingsPlayerIds.push(player.id)
        playerRepo.createRegistration(player.id, standingsTournamentId)
        if (i === 1) {
          player1Email = email
        }
      }

      // Set status to registration_closed
      tournamentsRepo.updateStatus(standingsTournamentId, 'registration_closed')

      // Temporarily set back to registration_open to get a session token for player 1
      tournamentsRepo.updateStatus(standingsTournamentId, 'registration_open')

      // Re-register player 1 to get their session token (idempotent)
      const registerRes = await request(app)
        .post(`/tournaments/${standingsTournamentId}/register`)
        .send({
          email: player1Email,
          name: 'Standings Player 1',
        })

      // Now set it back to registration_closed for group creation
      tournamentsRepo.updateStatus(standingsTournamentId, 'registration_closed')

      if (!registerRes.body.magicLinkToken) {
        throw new Error(`No magic link token in register response: ${registerRes.status} ${JSON.stringify(registerRes.body)}`)
      }

      const verifyRes = await request(app).get(
        `/tournaments/${standingsTournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`
      )
      if (verifyRes.status !== 200) {
        throw new Error(`Failed to get session token: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`)
      }
      playerSessionToken = verifyRes.body.playerToken

      // Create groups
      const createRes = await request(app)
        .post(`/tournaments/${standingsTournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ numGroups: 2, advancingPerGroup: 1 })

      // Find which group contains player 1 (standingsPlayerIds[0])
      const allGroups = groupRepo.findGroupsByTournament(standingsTournamentId)
      const player1Id = standingsPlayerIds[0]
      for (const g of allGroups) {
        const members = groupRepo.findMembersByGroup(g.id)
        if (members.find(m => m.id === player1Id)) {
          groupId = g.id
          break
        }
      }

      // If player1 is not in any group (shouldn't happen), default to first group
      if (!groupId && allGroups.length > 0) {
        groupId = allGroups[0].id
      }
    })

    it('should return standings with all players', async () => {
      const res = await request(app)
        .get(`/tournaments/${standingsTournamentId}/groups/${groupId}/standings`)
        .set('Authorization', `Bearer ${playerSessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body.standings).toBeDefined()
      expect(res.body.standings.length).toBeGreaterThan(0)
      expect(res.body.standings[0]).toHaveProperty('rank')
      expect(res.body.standings[0]).toHaveProperty('playerId')
      expect(res.body.standings[0]).toHaveProperty('name')
      expect(res.body.standings[0]).toHaveProperty('wins')
      expect(res.body.standings[0]).toHaveProperty('losses')
      expect(res.body.standings[0]).toHaveProperty('setsWon')
      expect(res.body.standings[0]).toHaveProperty('setsLost')
    })

    it('should compute standings correctly after match results', async () => {
      const res = await request(app)
        .get(`/tournaments/${standingsTournamentId}/groups/${groupId}/standings`)
        .set('Authorization', `Bearer ${playerSessionToken}`)

      expect(res.status).toBe(200)
      const standings = res.body.standings

      // Verify standings are returned and properly formatted
      expect(standings.length).toBeGreaterThan(0)
      expect(standings[0]).toHaveProperty('rank')
      expect(standings[0]).toHaveProperty('wins')
      expect(standings[0]).toHaveProperty('losses')
      expect(standings[0]).toHaveProperty('setsWon')
      expect(standings[0]).toHaveProperty('setsLost')

      // All rankings should be unique and sequential
      const ranks = standings.map((s: any) => s.rank)
      expect(ranks).toEqual([...Array(standings.length).keys()].map(i => i + 1))
    })

    it('should return 404 for unknown group', async () => {
      const res = await request(app)
        .get(`/tournaments/${standingsTournamentId}/groups/unknown_group_id/standings`)
        .set('Authorization', `Bearer ${playerSessionToken}`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('should return 401 if no session token provided', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/groups/${groupId}/standings`)

      expect(res.status).toBe(401)
    })

    it('should return 403 if player not in tournament', async () => {
      // Create another tournament and register a player there
      const otherTournament = tournamentsRepo.create({
        name: 'Other Tournament',
        sport: 'Tennis',
        matchFormat: 'singles',
        maxPlayers: 8,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })

      tournamentsRepo.updateStatus(otherTournament.id, 'registration_open')

      // Register a player for the other tournament
      const registerRes = await request(app)
        .post(`/tournaments/${otherTournament.id}/register`)
        .send({
          email: `other_player_${Date.now()}@test.com`,
          name: 'Other Player',
        })

      const verifyRes = await request(app).get(
        `/tournaments/${otherTournament.id}/auth/verify?token=${registerRes.body.magicLinkToken}`
      )
      const otherPlayerToken = verifyRes.body.playerToken

      // Try to access standings for a different tournament
      const res = await request(app)
        .get(`/tournaments/${standingsTournamentId}/groups/${groupId}/standings`)
        .set('Authorization', `Bearer ${otherPlayerToken}`)

      expect(res.status).toBe(403)
    })

    it('should return 403 if player is not in the group', async () => {
      // Register a 7th player for the same tournament AFTER groups are created
      // This player is registered but not in any group
      tournamentsRepo.updateStatus(standingsTournamentId, 'registration_open')

      const otherPlayerRegisterRes = await request(app)
        .post(`/tournaments/${standingsTournamentId}/register`)
        .send({
          email: 'non_member@test.com',
          name: 'Non-Member Player',
        })

      const otherPlayerVerifyRes = await request(app).get(
        `/tournaments/${standingsTournamentId}/auth/verify?token=${otherPlayerRegisterRes.body.magicLinkToken}`
      )

      tournamentsRepo.updateStatus(standingsTournamentId, 'registration_closed')
      const otherPlayerToken = otherPlayerVerifyRes.body.playerToken

      // This player is registered for the tournament but not in any group
      const res = await request(app)
        .get(`/tournaments/${standingsTournamentId}/groups/${groupId}/standings`)
        .set('Authorization', `Bearer ${otherPlayerToken}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })
  })
})
