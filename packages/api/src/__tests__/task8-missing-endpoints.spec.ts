import request from 'supertest'
import { createApp } from '../app'
import { openDatabase, PlayerRepository, TournamentRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import { DEFAULT_APP_CONFIG } from '../config'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Task #8 - Missing Endpoints', () => {
  let db: Database.Database
  let tokenStore: InMemoryTokenStore
  let playerRepo: PlayerRepository
  let tournamentRepo: TournamentRepository
  let app: any

  beforeEach(() => {
    tokenStore = new InMemoryTokenStore()
    db = openDatabase(':memory:')
    app = createApp({ config: DEFAULT_APP_CONFIG, db, jwtConfig: STANDARD_CONFIG, tokenStore })
    playerRepo = new PlayerRepository(db)
    tournamentRepo = new TournamentRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('GET /tournaments/available', () => {
    let tournamentId1: string
    let tournamentId2: string
    let organizerId: string

    beforeEach(async () => {
      organizerId = 'org_test_available'
      const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'org@test.com' }, STANDARD_CONFIG)

      // Create tournament 1
      const tour1 = await tournamentRepo.create({
        name: 'Available Tournament 1',
        sport: 'badminton',
        matchFormat: 'singles',
        maxPlayers: 16,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })
      tournamentId1 = tour1.id

      // Transition to registration_open
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', tournamentId1)

      // Create tournament 2
      const tour2 = await tournamentRepo.create({
        name: 'Available Tournament 2',
        sport: 'tennis',
        matchFormat: 'doubles',
        maxPlayers: 20,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })
      tournamentId2 = tour2.id

      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', tournamentId2)
    })

    it('should list available tournaments without auth', async () => {
      const res = await request(app).get('/tournaments/available')

      expect(res.status).toBe(200)
      expect(res.body.tournaments).toBeInstanceOf(Array)
      expect(res.body.tournaments.length).toBeGreaterThan(0)
      expect(res.body.total).toBeGreaterThan(0)
      expect(res.body.page).toBe(1)
      expect(res.body.limit).toBe(20)
    })

    it('should filter available tournaments by sport', async () => {
      const res = await request(app).get('/tournaments/available?sport=badminton')

      expect(res.status).toBe(200)
      expect(res.body.tournaments.every((t: any) => t.sport === 'badminton')).toBe(true)
    })

    it('should return tournaments with correct structure', async () => {
      const res = await request(app).get('/tournaments/available')

      expect(res.body.tournaments[0]).toHaveProperty('id')
      expect(res.body.tournaments[0]).toHaveProperty('name')
      expect(res.body.tournaments[0]).toHaveProperty('sport')
      expect(res.body.tournaments[0]).toHaveProperty('format')
      expect(res.body.tournaments[0]).toHaveProperty('status')
      expect(res.body.tournaments[0]).toHaveProperty('registrationDeadline')
      expect(res.body.tournaments[0]).toHaveProperty('maxParticipants')
      expect(res.body.tournaments[0]).toHaveProperty('currentParticipants')
      expect(res.body.tournaments[0].status).toBe('open')
    })

    it('should handle pagination', async () => {
      const res = await request(app).get('/tournaments/available?limit=1&offset=0')

      expect(res.status).toBe(200)
      expect(res.body.tournaments.length).toBeLessThanOrEqual(1)
      expect(res.body.limit).toBe(1)
    })

    it('should track current participants count', async () => {
      const res = await request(app).get('/tournaments/available')
      const tournament = res.body.tournaments.find((t: any) => t.id === tournamentId1)

      expect(tournament).toBeDefined()
      expect(tournament.currentParticipants).toBe(0)
    })

    it('should only show registration_open tournaments', async () => {
      // Create a draft tournament
      const draftTour = await tournamentRepo.create({
        name: 'Draft Tournament',
        sport: 'squash',
        matchFormat: 'singles',
        maxPlayers: 8,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })

      const res = await request(app).get('/tournaments/available')
      expect(res.body.tournaments.every((t: any) => t.status === 'open')).toBe(true)
      expect(res.body.tournaments.find((t: any) => t.id === draftTour.id)).toBeUndefined()
    })
  })

  describe('GET /tournaments/:id/players', () => {
    let tournamentId: string
    let playerId1: string
    let playerId2: string
    let organizerId: string
    let organizerToken: string
    let playerToken1: string
    let playerToken2: string

    beforeEach(async () => {
      organizerId = 'org_test_players'
      const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'org@test.com' }, STANDARD_CONFIG)
      organizerToken = tokenPair.accessToken

      // Create tournament
      const tour = await tournamentRepo.create({
        name: 'Players List Tournament',
        sport: 'volleyball',
        matchFormat: 'singles',
        maxPlayers: 16,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })
      tournamentId = tour.id

      // Open registration
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', tournamentId)

      // Register player 1
      const reg1 = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'player1@test.com',
          name: 'Player One',
          phone: '5551234567',
        })

      const verify1 = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${reg1.body.magicLinkToken}`)

      playerId1 = verify1.body.playerId
      playerToken1 = verify1.body.playerToken

      // Register player 2
      const reg2 = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'player2@test.com',
          name: 'Player Two',
          phone: '5559876543',
        })

      const verify2 = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${reg2.body.magicLinkToken}`)

      playerId2 = verify2.body.playerId
      playerToken2 = verify2.body.playerToken
    })

    it('should list players without auth (no contact info)', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/players`)

      expect(res.status).toBe(200)
      expect(res.body.players).toBeInstanceOf(Array)
      expect(res.body.total).toBeGreaterThan(0)
    })

    it('should hide email for non-organizer, non-registered players', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/players`)

      const player = res.body.players[0]
      expect(player.playerEmail).toBeNull()
      expect(player.playerPhone).toBeNull()
    })

    it('should show email to organizer', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/players`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      const player = res.body.players.find((p: any) => p.playerId === playerId1)
      expect(player).toBeDefined()
      expect(player.playerEmail).toBe('player1@test.com')
      expect(player.playerPhone).toBeTruthy()
    })

    it('should show email to registered player for themselves', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/players`)
        .set('Authorization', `Bearer ${playerToken1}`)

      expect(res.status).toBe(200)
      const ownPlayer = res.body.players.find((p: any) => p.playerId === playerId1)
      expect(ownPlayer.playerEmail).toBe('player1@test.com')

      const otherPlayer = res.body.players.find((p: any) => p.playerId === playerId2)
      expect(otherPlayer.playerEmail).toBeNull()
    })

    it('should return 404 for nonexistent tournament', async () => {
      const res = await request(app).get('/tournaments/nonexistent_id/players')

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('should support pagination', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/players?limit=1&offset=0`)

      expect(res.status).toBe(200)
      expect(res.body.players.length).toBeLessThanOrEqual(1)
    })

    it('should include registration details', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/players`)

      const player = res.body.players[0]
      expect(player).toHaveProperty('registrationId')
      expect(player).toHaveProperty('playerId')
      expect(player).toHaveProperty('playerName')
      expect(player).toHaveProperty('doubles')
      expect(player).toHaveProperty('status')
      expect(player).toHaveProperty('registeredAt')
    })
  })

  describe('PATCH /registrations/:id/confirm', () => {
    let tournamentId: string
    let player1Id: string
    let player2Id: string
    let registrationId: string
    let player2Token: string
    let organizerToken: string

    beforeEach(async () => {
      const organizerId = 'org_test_confirm'
      const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'org@test.com' }, STANDARD_CONFIG)
      organizerToken = tokenPair.accessToken

      // Create doubles tournament
      const tour = await tournamentRepo.create({
        name: 'Partner Confirm Tournament',
        sport: 'badminton',
        matchFormat: 'doubles',
        maxPlayers: 16,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })
      tournamentId = tour.id

      // Open registration
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', tournamentId)

      // Register player 1
      const reg1 = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'partner1@test.com',
          name: 'Partner One',
        })

      const verify1 = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${reg1.body.magicLinkToken}`)
      player1Id = verify1.body.playerId

      // Register player 2
      const reg2 = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'partner2@test.com',
          name: 'Partner Two',
        })

      const verify2 = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${reg2.body.magicLinkToken}`)
      player2Id = verify2.body.playerId
      player2Token = verify2.body.playerToken

      // Set player2 as partner to player1's registration
      const regs = db
        .prepare('SELECT * FROM player_registrations WHERE player_id = ? AND tournament_id = ?')
        .all(player1Id, tournamentId) as any[]
      registrationId = regs[0].id
      db.prepare('UPDATE player_registrations SET partner_id = ?, status = ? WHERE id = ?').run(
        player2Id,
        'pending_partner_confirm',
        registrationId
      )
    })

    it('should confirm partner registration', async () => {
      const res = await request(app)
        .patch(`/tournaments/registrations/${registrationId}/confirm`)
        .set('Authorization', `Bearer ${player2Token}`)

      expect(res.status).toBe(200)
      expect(res.body.partnerConfirmed).toBe(true)
      expect(res.body.status).toBe('registered')
      expect(res.body.confirmedAt).toBeDefined()
    })

    it('should reject confirmation from non-partner', async () => {
      // Register another player
      const reg3 = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'notpartner@test.com',
          name: 'Not Partner',
        })

      const verify3 = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${reg3.body.magicLinkToken}`)

      const res = await request(app)
        .patch(`/tournaments/registrations/${registrationId}/confirm`)
        .set('Authorization', `Bearer ${verify3.body.playerToken}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('should return 404 for nonexistent registration', async () => {
      const res = await request(app)
        .patch('/tournaments/registrations/nonexistent_id/confirm')
        .set('Authorization', `Bearer ${player2Token}`)

      expect(res.status).toBe(404)
    })

    it('should require player auth', async () => {
      const res = await request(app).patch(`/tournaments/registrations/${registrationId}/confirm`)

      expect(res.status).toBe(401)
    })

    it('should reject if no partner pending', async () => {
      // Register a singles player
      const regSingle = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'single@test.com',
          name: 'Single Player',
        })

      const verifySingle = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${regSingle.body.magicLinkToken}`)

      const regs = db
        .prepare('SELECT * FROM player_registrations WHERE player_id = ? AND tournament_id = ?')
        .all(verifySingle.body.playerId, tournamentId) as any[]
      const singleRegId = regs[0].id

      const res = await request(app)
        .patch(`/tournaments/registrations/${singleRegId}/confirm`)
        .set('Authorization', `Bearer ${verifySingle.body.playerToken}`)

      expect(res.status).toBe(409)
    })

    it('should log partner confirmation event', async () => {
      const res = await request(app)
        .patch(`/tournaments/registrations/${registrationId}/confirm`)
        .set('Authorization', `Bearer ${player2Token}`)

      expect(res.status).toBe(200)
      expect(res.body.registrationId).toBe(registrationId)
    })
  })

  describe('DELETE /registrations/:id', () => {
    let tournamentId: string
    let registrationId: string
    let playerToken: string
    let organizerToken: string

    beforeEach(async () => {
      const organizerId = 'org_test_withdraw'
      const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'org@test.com' }, STANDARD_CONFIG)
      organizerToken = tokenPair.accessToken

      // Create tournament with future deadline
      const deadlineStr = new Date(Date.now() + 86400000).toISOString()

      const tour = await tournamentRepo.create({
        name: 'Withdrawal Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 16,
        registrationDeadline: deadlineStr,
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })
      tournamentId = tour.id

      // Open registration
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', tournamentId)

      // Register player
      const reg = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'withdraw@test.com',
          name: 'Withdraw Player',
        })

      const verify = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${reg.body.magicLinkToken}`)

      playerToken = verify.body.playerToken

      // Get registration ID
      const regs = db
        .prepare('SELECT * FROM player_registrations WHERE player_id = ? AND tournament_id = ?')
        .all(verify.body.playerId, tournamentId) as any[]
      registrationId = regs[0].id
    })

    it('should withdraw registration before deadline', async () => {
      const res = await request(app)
        .delete(`/tournaments/registrations/${registrationId}`)
        .set('Authorization', `Bearer ${playerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('withdrawn')
      expect(res.body.withdrawnAt).toBeDefined()
    })

    it('should require player auth', async () => {
      const res = await request(app).delete(`/tournaments/registrations/${registrationId}`)

      expect(res.status).toBe(401)
    })

    it('should reject withdrawal of other players registration', async () => {
      // Register two players
      const reg1 = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'player1withdraw@test.com',
          name: 'Player 1 Withdraw',
        })

      const verify1 = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${reg1.body.magicLinkToken}`)

      const reg2 = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'player2withdraw@test.com',
          name: 'Player 2 Withdraw',
        })

      const verify2 = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${reg2.body.magicLinkToken}`)

      const regs = db
        .prepare('SELECT * FROM player_registrations WHERE player_id = ?')
        .all(verify1.body.playerId) as any[]
      const reg1Id = regs[0].id

      const res = await request(app)
        .delete(`/tournaments/registrations/${reg1Id}`)
        .set('Authorization', `Bearer ${verify2.body.playerToken}`)

      expect(res.status).toBe(403)
    })

    it('should return 404 for nonexistent registration', async () => {
      const res = await request(app)
        .delete('/tournaments/registrations/nonexistent_id')
        .set('Authorization', `Bearer ${playerToken}`)

      expect(res.status).toBe(404)
    })

    it('should prevent double withdrawal', async () => {
      const reg = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({
          email: 'doublewithdraw@test.com',
          name: 'Double Withdraw',
        })

      const verify = await request(app).get(`/tournaments/${tournamentId}/auth/verify?token=${reg.body.magicLinkToken}`)

      const regs = db
        .prepare('SELECT * FROM player_registrations WHERE player_id = ? AND tournament_id = ?')
        .all(verify.body.playerId, tournamentId) as any[]
      const regId = regs[0].id

      // First withdrawal
      await request(app)
        .delete(`/tournaments/registrations/${regId}`)
        .set('Authorization', `Bearer ${verify.body.playerToken}`)

      // Second withdrawal
      const res = await request(app)
        .delete(`/tournaments/registrations/${regId}`)
        .set('Authorization', `Bearer ${verify.body.playerToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('ALREADY_WITHDRAWN')
    })

    it('should track withdrawal request after deadline', async () => {
      // Create tournament with past deadline
      const pastDeadline = new Date(Date.now() - 86400000).toISOString()

      const tour = await tournamentRepo.create({
        name: 'Past Deadline Tournament',
        sport: 'squash',
        matchFormat: 'singles',
        maxPlayers: 16,
        registrationDeadline: pastDeadline,
        groupStageDeadline: new Date(Date.now() + 86400000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        creatorId: 'org_test_withdraw',
      })

      const pastTournamentId = tour.id

      // Manually insert a registration
      const playerId = 'player_test_' + Date.now()
      db.prepare('INSERT INTO players (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(playerId, `test${Date.now()}@test.com`, 'Test Player', new Date().toISOString(), new Date().toISOString())

      const regId = 'reg_test_' + Date.now()
      db.prepare(
        'INSERT INTO player_registrations (id, player_id, tournament_id, registered_at, partner_confirmed, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(regId, playerId, pastTournamentId, new Date().toISOString(), 0, 'registered')

      // Create session token for player
      const sessionToken = crypto.randomBytes(32).toString('hex')
      await tokenStore.set(`session:${sessionToken}`, JSON.stringify({ playerId, tournamentId: pastTournamentId, email: `test${Date.now()}@test.com`, createdAt: Date.now() }), 86400)

      const res = await request(app)
        .delete(`/tournaments/registrations/${regId}`)
        .set('Authorization', `Bearer ${sessionToken}`)

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('withdrawal_pending')
    })
  })
})
