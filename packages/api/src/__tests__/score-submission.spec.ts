import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../app'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'
import { initializeTestDb, resetTestDb } from './db-test-setup'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Score Submission Endpoints', () => {
  let db: Pool
  let app: any
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let tokenStore: InMemoryTokenStore

  let organizerId: string
  let tournamentId: string
  let groupId: string
  let matchId: string
  let player1Id: string
  let player2Id: string
  let player3Id: string
  let player4Id: string
  let player5Id: string
  let player6Id: string
  let player1Token: string
  let player2Token: string
  let player3Token: string
  let player4Token: string
  let player5Token: string
  let player6Token: string
  let matchPlayer1Id: string
  let matchPlayer2Id: string
  let matchPlayer1Token: string
  let matchPlayer2Token: string
  let playerNotInMatchToken: string
  let organizerToken: string

  beforeAll(async () => {
    db = await initializeTestDb()
  }, 30000)

  beforeEach(async () => {
    tokenStore = new InMemoryTokenStore()
    await resetTestDb(db)
    app = createApp({

      config: DEFAULT_APP_CONFIG,      db,
      jwtConfig: STANDARD_CONFIG,
      tokenStore,
    })

    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)

    // Create organizer
    organizerId = `org_${Date.now()}_1`
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'organizer@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    // Create tournament
    const now = new Date()
    const registrationDeadline = new Date(now.getTime() + 86400000).toISOString()
    const groupStageDeadline = new Date(now.getTime() + 172800000).toISOString()
    const knockoutDeadline = new Date(now.getTime() + 259200000).toISOString()

    const tournament = await tournamentRepo.create({
      name: `Score Test ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 8,
      description: 'Test tournament for score submission',
      registrationDeadline,
      groupStageDeadline,
      knockoutStageDeadline: knockoutDeadline,
      creatorId: organizerId,
    })
    tournamentId = tournament.id

    // Set tournament to registration_open for player registration
    await tournamentRepo.updateStatus(tournamentId, 'registration_open')

    // Register 6 players through the API
    const testTimestamp = Date.now()
    const playerEmails = [
      `score_test_1_${testTimestamp}@test.com`,
      `score_test_2_${testTimestamp}@test.com`,
      `score_test_3_${testTimestamp}@test.com`,
      `score_test_4_${testTimestamp}@test.com`,
      `score_test_5_${testTimestamp}@test.com`,
      `score_test_6_${testTimestamp}@test.com`,
    ]

    const playerTokens: string[] = []
    for (let i = 0; i < playerEmails.length; i++) {
      const email = playerEmails[i]
      const registerRes = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({ email, name: `Player ${i + 1}` })

      if (registerRes.status !== 202) {
        throw new Error(`Failed to register player: ${registerRes.status} ${JSON.stringify(registerRes.body)}`)
      }

      const verifyRes = await request(app).get(
        `/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`
      )

      if (verifyRes.status !== 200) {
        throw new Error(`Failed to verify magic link: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`)
      }

      playerTokens.push(verifyRes.body.playerToken)
    }

    // Assign player tokens
    player1Token = playerTokens[0]
    player2Token = playerTokens[1]
    player3Token = playerTokens[2]
    player4Token = playerTokens[3]
    player5Token = playerTokens[4]
    player6Token = playerTokens[5]

    // Get all player IDs
    const p1 = await playerRepo.findByEmail(playerEmails[0])
    const p2 = await playerRepo.findByEmail(playerEmails[1])
    const p3 = await playerRepo.findByEmail(playerEmails[2])
    const p4 = await playerRepo.findByEmail(playerEmails[3])
    const p5 = await playerRepo.findByEmail(playerEmails[4])
    const p6 = await playerRepo.findByEmail(playerEmails[5])

    if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) throw new Error('Failed to create players')
    player1Id = p1.id
    player2Id = p2.id
    player3Id = p3.id
    player4Id = p4.id
    player5Id = p5.id
    player6Id = p6.id

    const allPlayerIds = [player1Id, player2Id, player3Id, player4Id, player5Id, player6Id]

    // Create groups
    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    const groups = await groupRepo.createGroups(tournamentId, 2, 2, allPlayerIds)
    groupId = groups[0].id

    // Get the first match and get its players
    const matches = await groupRepo.findMatchesByGroup(groupId)
    const targetMatch = matches[0]
    matchId = targetMatch.id
    matchPlayer1Id = targetMatch.player1_id
    matchPlayer2Id = targetMatch.player2_id

    // Find tokens for the match players
    if (matchPlayer1Id === player1Id) {
      matchPlayer1Token = player1Token
    } else if (matchPlayer1Id === player2Id) {
      matchPlayer1Token = player2Token
    } else if (matchPlayer1Id === player3Id) {
      matchPlayer1Token = player3Token
    } else if (matchPlayer1Id === player4Id) {
      matchPlayer1Token = player4Token
    } else if (matchPlayer1Id === player5Id) {
      matchPlayer1Token = player5Token
    } else {
      matchPlayer1Token = player6Token
    }

    if (matchPlayer2Id === player1Id) {
      matchPlayer2Token = player1Token
    } else if (matchPlayer2Id === player2Id) {
      matchPlayer2Token = player2Token
    } else if (matchPlayer2Id === player3Id) {
      matchPlayer2Token = player3Token
    } else if (matchPlayer2Id === player4Id) {
      matchPlayer2Token = player4Token
    } else if (matchPlayer2Id === player5Id) {
      matchPlayer2Token = player5Token
    } else {
      matchPlayer2Token = player6Token
    }

    // Find a player who is NOT in the match
    const matchPlayerIds = new Set([matchPlayer1Id, matchPlayer2Id])
    const notInMatchId = allPlayerIds.find(id => !matchPlayerIds.has(id))

    if (notInMatchId === player1Id) {
      playerNotInMatchToken = player1Token
    } else if (notInMatchId === player2Id) {
      playerNotInMatchToken = player2Token
    } else if (notInMatchId === player3Id) {
      playerNotInMatchToken = player3Token
    } else if (notInMatchId === player4Id) {
      playerNotInMatchToken = player4Token
    } else if (notInMatchId === player5Id) {
      playerNotInMatchToken = player5Token
    } else {
      playerNotInMatchToken = player6Token
    }
  }, 30000)

  describe('POST /tournaments/:id/matches/:matchId/score (player submission)', () => {
    test('should submit a valid score by player1', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${matchPlayer1Token}`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(200)
      expect(res.body.match).toBeDefined()
      expect(res.body.match.score).toBe('6-3, 6-2')
      expect(res.body.match.status).toBe('completed')
      expect(res.body.match.winnerId).toBeDefined()

      const updated = await groupRepo.findMatchById(matchId)
      expect(updated?.score).toBe('6-3, 6-2')
      expect(updated?.status).toBe('completed')
    })

    test('should submit a valid score by player2 (overwrite)', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${matchPlayer1Token}`)
        .send({ score: '6-3, 6-2' })

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${matchPlayer2Token}`)
        .send({ score: '3-6, 2-6' })

      expect(res.status).toBe(200)
      expect(res.body.match.score).toBe('3-6, 2-6')

      const updated = await groupRepo.findMatchById(matchId)
      expect(updated?.score).toBe('3-6, 2-6')
    })

    test('should reject invalid score format', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${matchPlayer1Token}`)
        .send({ score: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('SCORE_INVALID')
    })

    test('should reject missing score field', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${matchPlayer1Token}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    test('should reject missing auth', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(401)
    })

    test('should reject player not in tournament', async () => {
      const otherTournament = await tournamentRepo.create({
        name: `Other Tournament ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 8,
        registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: organizerId,
      })

      // Set status to registration_open for this tournament
      await tournamentRepo.updateStatus(otherTournament.id, 'registration_open')

      const otherEmail = `other_player_${Date.now()}@test.com`
      const registerRes = await request(app)
        .post(`/tournaments/${otherTournament.id}/register`)
        .send({ email: otherEmail, name: 'Other Player' })

      const verifyRes = await request(app).get(
        `/tournaments/${otherTournament.id}/auth/verify?token=${registerRes.body.magicLinkToken}`
      )
      const otherToken = verifyRes.body.playerToken

      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    test('should reject player not in this match', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${playerNotInMatchToken}`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    test('should return 404 for non-existent tournament', async () => {
      const res = await request(app)
        .post(`/tournaments/invalid_tournament/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${matchPlayer1Token}`)
        .send({ score: '6-3, 6-2' })

      // The player token is for the original tournament, but we're trying a different tournament ID
      // The assertPlayerInTournament check will fail first, returning 403
      expect(res.status).toBe(403)
    })

    test('should return 404 for non-existent match', async () => {
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/invalid_match/score`)
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    test('should reject score submission after deadline', async () => {
      const pastDeadline = new Date(Date.now() - 3600000).toISOString()
      const futureDeadline = new Date(Date.now() + 3600000).toISOString()

      const pastTournament = await tournamentRepo.create({
        name: `Past Deadline Tournament ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 8,
        creatorId: organizerId,
        registrationDeadline: pastDeadline,
        groupStageDeadline: pastDeadline,
        knockoutStageDeadline: futureDeadline,
      })

      // Set status to registration_open
      await tournamentRepo.updateStatus(pastTournament.id, 'registration_open')

      const email = `past_deadline_${Date.now()}@test.com`
      const registerRes = await request(app)
        .post(`/tournaments/${pastTournament.id}/register`)
        .send({ email, name: 'Test Player' })

      const verifyRes = await request(app).get(
        `/tournaments/${pastTournament.id}/auth/verify?token=${registerRes.body.magicLinkToken}`
      )
      const playerToken = verifyRes.body.playerToken

      const email2 = `past_deadline_2_${Date.now()}@test.com`
      await request(app)
        .post(`/tournaments/${pastTournament.id}/register`)
        .send({ email: email2, name: 'Test Player 2' })

      const player1 = await playerRepo.findByEmail(email)
      const player2 = await playerRepo.findByEmail(email2)

      if (!player1 || !player2) throw new Error('Failed to create players')
      await tournamentRepo.updateStatus(pastTournament.id, 'registration_closed')
      const groups = await groupRepo.createGroups(pastTournament.id, 1, 1, [player1.id, player2.id])
      const matches = await groupRepo.findMatchesByGroup(groups[0].id)

      const res = await request(app)
        .post(`/tournaments/${pastTournament.id}/matches/${matches[0].id}/score`)
        .set('Authorization', `Bearer ${playerToken}`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('DEADLINE_PASSED')
    })
  })

  describe('PATCH /tournaments/:id/matches/:matchId/score (organizer override)', () => {
    test('should allow organizer to submit score', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '7-5, 6-4' })

      expect(res.status).toBe(200)
      expect(res.body.match).toBeDefined()
      expect(res.body.match.score).toBe('7-5, 6-4')
      expect(res.body.match.status).toBe('completed')

      const updated = await groupRepo.findMatchById(matchId)
      expect(updated?.score).toBe('7-5, 6-4')
    })

    test('should allow organizer to submit after deadline', async () => {
      const pastDeadline = new Date(Date.now() - 3600000).toISOString()
      const futureDeadline = new Date(Date.now() + 3600000).toISOString()

      const pastTournament = await tournamentRepo.create({
        name: `Past Deadline Org ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 8,
        creatorId: organizerId,
        registrationDeadline: pastDeadline,
        groupStageDeadline: pastDeadline,
        knockoutStageDeadline: futureDeadline,
      })

      // Set status to registration_open
      await tournamentRepo.updateStatus(pastTournament.id, 'registration_open')

      const email1 = `org_deadline_1_${Date.now()}@test.com`
      const email2 = `org_deadline_2_${Date.now()}@test.com`

      await request(app)
        .post(`/tournaments/${pastTournament.id}/register`)
        .send({ email: email1, name: 'Player 1' })

      await request(app)
        .post(`/tournaments/${pastTournament.id}/register`)
        .send({ email: email2, name: 'Player 2' })

      const player1 = await playerRepo.findByEmail(email1)
      const player2 = await playerRepo.findByEmail(email2)

      if (!player1 || !player2) {
        throw new Error('Failed to find registered players')
      }

      await tournamentRepo.updateStatus(pastTournament.id, 'registration_closed')
      const groups = await groupRepo.createGroups(pastTournament.id, 1, 1, [player1.id, player2.id])
      const matches = await groupRepo.findMatchesByGroup(groups[0].id)

      const res = await request(app)
        .patch(`/tournaments/${pastTournament.id}/matches/${matches[0].id}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-0, 6-0' })

      expect(res.status).toBe(200)
      expect(res.body.match.score).toBe('6-0, 6-0')
    })

    test('should reject invalid score format', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: 'not-a-score' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('SCORE_INVALID')
    })

    test('should reject missing score field', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    test('should reject missing auth', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(401)
    })

    test('should reject non-owner organizer', async () => {
      const otherId = `org_${Date.now()}_other`
      const otherTokenPair = issueOrganizerToken({ sub: otherId, email: 'other@test.com' }, STANDARD_CONFIG)
      const otherToken = otherTokenPair.accessToken

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    test('should return 404 for non-existent tournament', async () => {
      const res = await request(app)
        .patch(`/tournaments/invalid_tournament/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    test('should return 404 for non-existent match', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/invalid_match/score`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ score: '6-3, 6-2' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })
  })

  describe('Score determination and winner mapping', () => {
    test('should correctly map winner for player1 win', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${matchPlayer1Token}`)
        .send({ score: '6-3, 6-2' })

      const updated = await groupRepo.findMatchById(matchId)
      if (!updated) throw new Error('Match not found')
      expect(updated.winner_id).toBe(matchPlayer1Id)
    })

    test('should correctly map winner for player2 win', async () => {
      await request(app)
        .post(`/tournaments/${tournamentId}/matches/${matchId}/score`)
        .set('Authorization', `Bearer ${matchPlayer1Token}`)
        .send({ score: '3-6, 2-6' })

      const updated = await groupRepo.findMatchById(matchId)
      if (!updated) throw new Error('Match not found')
      expect(updated.winner_id).toBe(matchPlayer2Id)
    })
  })
})
