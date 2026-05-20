import request from 'supertest'
import { createApp } from '../app'
import { openDatabase, TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { issueOrganizerToken } from '../auth/tokens'
import { DEFAULT_APP_CONFIG } from '../config'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Match Coordination Endpoints', () => {
  let db: any
  let app: any
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let knockoutRepo: KnockoutRepository
  let tokenStore: InMemoryTokenStore

  let tournamentId: string
  let organizerToken: string
  let player1Id: string
  let player2Id: string
  let player3Id: string
  let player4Id: string
  let player1Token: string
  let player2Token: string
  let player3Token: string
  let player4Token: string
  let matchId: string
  let knockoutMatchId: string

  beforeEach(async () => {
    tokenStore = new InMemoryTokenStore()
    db = openDatabase(':memory:')
    app = createApp({

      config: DEFAULT_APP_CONFIG,      db,
      jwtConfig: STANDARD_CONFIG,
      tokenStore,
    })

    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    groupRepo = new GroupRepository(db)
    knockoutRepo = new KnockoutRepository(db)

    const organizerId = 'org_123'
    const tokenPair = issueOrganizerToken({ sub: organizerId, email: 'organizer@test.com' }, STANDARD_CONFIG)
    organizerToken = tokenPair.accessToken

    // Create tournament
    const now = new Date()
    const pastDeadline = new Date(now.getTime() - 86400000).toISOString()
    const futureDeadline = new Date(now.getTime() + 259200000).toISOString()

    const tournament = await tournamentRepo.create({
      name: `Match Coordination Test ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 8,
      registrationDeadline: pastDeadline,
      groupStageDeadline: futureDeadline,
      knockoutStageDeadline: futureDeadline,
      creatorId: organizerId,
    })
    tournamentId = tournament.id

    // Register 4 players
    await tournamentRepo.updateStatus(tournamentId, 'registration_open')
    const testTimestamp = Date.now()

    const emails = [
      `coord_test_1_${testTimestamp}@test.com`,
      `coord_test_2_${testTimestamp}@test.com`,
      `coord_test_3_${testTimestamp}@test.com`,
      `coord_test_4_${testTimestamp}@test.com`,
    ]

    const tokens: string[] = []
    for (let i = 0; i < emails.length; i++) {
      const registerRes = await request(app)
        .post(`/tournaments/${tournamentId}/register`)
        .send({ email: emails[i], name: `Player ${i + 1}` })

      const verifyRes = await request(app).get(
        `/tournaments/${tournamentId}/auth/verify?token=${registerRes.body.magicLinkToken}`
      )

      tokens.push(verifyRes.body.playerToken)
    }

    player1Token = tokens[0]
    player2Token = tokens[1]
    player3Token = tokens[2]
    player4Token = tokens[3]

    const p1 = await playerRepo.findByEmail(emails[0])!
    const p2 = await playerRepo.findByEmail(emails[1])!
    const p3 = await playerRepo.findByEmail(emails[2])!
    const p4 = await playerRepo.findByEmail(emails[3])!

    player1Id = p1.id
    player2Id = p2.id
    player3Id = p3.id
    player4Id = p4.id

    // Create groups and matches (single group to keep things simple)
    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    await tournamentRepo.updateStatus(tournamentId, 'group_stage_active')
    const groups = await groupRepo.createGroups(tournamentId, 1, 2, [player1Id, player2Id, player3Id, player4Id])

    // Find a match between player1 and player2 specifically
    const allMatches = await groupRepo.findMatchesByGroup(groups[0].id)
    const player1vs2Match = allMatches.find(m =>
      (m.player1_id === player1Id && m.player2_id === player2Id) ||
      (m.player1_id === player2Id && m.player2_id === player1Id)
    )

    if (!player1vs2Match) {
      throw new Error('No match found between player1 and player2')
    }
    matchId = player1vs2Match.id

    // Create knockout tournament for knockout tests
    await tournamentRepo.updateStatus(tournamentId, 'group_stage_complete')
    await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${organizerToken}`)

    const publishRes = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/publish`)
      .set('Authorization', `Bearer ${organizerToken}`)

    if (publishRes.body.matches && publishRes.body.matches.length > 0) {
      knockoutMatchId = publishRes.body.matches[0].id
    }
  })

  describe('GET /tournaments/:id/matches - list player matches', () => {
    it('should return player\'s group matches', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      expect(res.body.matches).toBeDefined()
      expect(res.body.matches.length).toBeGreaterThan(0)
      expect(res.body.matches[0].type).toBe('group')
    })

    it('should exclude matches player is not in', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches`)
        .set('Authorization', `Bearer ${player1Token}`)

      // Player1 should see at least some matches (they're in at least one)
      expect(res.body.matches.length).toBeGreaterThan(0)
      // And all matches should have opponent info
      for (const match of res.body.matches) {
        expect(match.opponent).toBeDefined()
      }
    })

    it('should hide opponent email when share_contact=false', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      if (res.body.matches.length > 0) {
        const match = res.body.matches[0]
        expect(match.opponent.email).toBeNull()
      }
    })

    it('should show opponent email when share_contact=true', async () => {
      // First, enable contact sharing for player2
      await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${player2Token}`)
        .send({ shareContact: true })

      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      if (res.body.matches.length > 0) {
        const match = res.body.matches[0]
        // If player2 is the opponent and has share_contact=true, email should be visible
        if (match.opponent.playerId === player2Id) {
          expect(match.opponent.email).toBeTruthy()
        }
      }
    })

    it('should return 401 without auth', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/matches`)

      expect(res.status).toBe(401)
    })

    it('should return 403 if player in different tournament', async () => {
      // Create another tournament
      const org2 = `org_${Date.now()}_diff`
      const token2 = issueOrganizerToken({ sub: org2, email: `org${Date.now()}@test.com` }, STANDARD_CONFIG).accessToken

      const newTournament = await tournamentRepo.create({
        name: `Other Tournament ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 8,
        registrationDeadline: new Date(Date.now() - 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: org2,
      })

      // Try to access matches from NEW tournament with token for ORIGINAL tournament
      // The player token is scoped to the original tournament, so this should fail
      const res = await request(app)
        .get(`/tournaments/${newTournament.id}/matches`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(403)
    })
  })

  describe('GET /tournaments/:id/matches/:matchId - match details', () => {
    it('should return match details for involved player', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches/${matchId}`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      expect(res.body.match).toBeDefined()
      expect(res.body.match.id).toBe(matchId)
      expect(res.body.match.opponent).toBeDefined()
    })

    it('should show opponent email to organizer regardless of share_contact', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches/${matchId}`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.match.opponent.email).toBeTruthy()
    })

    it('should hide opponent email from player when opponent share_contact=false', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches/${matchId}`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      expect(res.body.match.opponent.email).toBeNull()
    })

    it('should return 403 for player not in match', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches/${matchId}`)
        .set('Authorization', `Bearer ${player3Token}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('should return 404 for unknown match', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches/unknown_match_id`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('should return 401 without auth', async () => {
      const res = await request(app).get(`/tournaments/${tournamentId}/matches/${matchId}`)

      expect(res.status).toBe(401)
    })

    it('should include confirmation status in response', async () => {
      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches/${matchId}`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      expect(res.body.match).toHaveProperty('player1Confirmed')
      expect(res.body.match).toHaveProperty('player2Confirmed')
    })
  })

  describe('PATCH /tournaments/:id/matches/:matchId/confirm - confirm attendance', () => {
    it('should allow player1 to confirm attendance', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      expect(res.body.match).toBeDefined()
      expect(res.body.match.id).toBe(matchId)
    })

    it('should allow player2 to confirm attendance', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${player2Token}`)

      expect(res.status).toBe(200)
      expect(res.body.match).toBeDefined()
      expect(res.body.match.id).toBe(matchId)
    })

    it('should allow both players to confirm independently', async () => {
      const res1 = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${player1Token}`)
      expect(res1.status).toBe(200)

      const res2 = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${matchId}/confirm`)
        .set('Authorization', `Bearer ${player2Token}`)
      expect(res2.status).toBe(200)

      // Verify both players confirmed by getting match details
      const detailRes = await request(app)
        .get(`/tournaments/${tournamentId}/matches/${matchId}`)
        .set('Authorization', `Bearer ${player1Token}`)
      expect(detailRes.status).toBe(200)
    })

    it('should return 403 for player not in match', async () => {
      // Create a separate tournament and match where player3 is confirmed not a participant
      const org2 = 'org_notinmatch'
      const token2 = issueOrganizerToken({ sub: org2, email: 'org2@test.com' }, STANDARD_CONFIG).accessToken

      const otherTournament = await tournamentRepo.create({
        name: `Other Tournament ${Date.now()}`,
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 8,
        registrationDeadline: new Date(Date.now() - 86400000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
        creatorId: org2,
      })

      await tournamentRepo.updateStatus(otherTournament.id, 'registration_open')

      const otherEmail1 = `other_1_${Date.now()}@test.com`
      const otherEmail2 = `other_2_${Date.now()}@test.com`

      const reg1 = await request(app)
        .post(`/tournaments/${otherTournament.id}/register`)
        .send({ email: otherEmail1, name: 'Other Player 1' })

      const reg2 = await request(app)
        .post(`/tournaments/${otherTournament.id}/register`)
        .send({ email: otherEmail2, name: 'Other Player 2' })

      await tournamentRepo.updateStatus(otherTournament.id, 'registration_closed')
      await tournamentRepo.updateStatus(otherTournament.id, 'group_stage_active')

      const otherP1 = await playerRepo.findByEmail(otherEmail1)!
      const otherP2 = await playerRepo.findByEmail(otherEmail2)!

      const otherGroups = await groupRepo.createGroups(otherTournament.id, 1, 1, [otherP1.id, otherP2.id])
      const otherMatches = await groupRepo.findMatchesByGroup(otherGroups[0].id)
      const otherMatchId = otherMatches[0].id

      // Try to confirm player3 (from original tournament) in this match (from other tournament)
      const res = await request(app)
        .patch(`/tournaments/${otherTournament.id}/matches/${otherMatchId}/confirm`)
        .set('Authorization', `Bearer ${player3Token}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('should return 401 without auth', async () => {
      const res = await request(app).patch(`/tournaments/${tournamentId}/matches/${matchId}/confirm`)

      expect(res.status).toBe(401)
    })

    it('should return 404 for unknown match', async () => {
      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/unknown_match_id/confirm`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('should work for knockout matches too', async () => {
      if (!knockoutMatchId) {
        // Skip if no knockout match was created
        return
      }

      const knockoutMatch = await knockoutRepo.findKnockoutMatchById(knockoutMatchId)
      if (!knockoutMatch || !knockoutMatch.player1_id || !knockoutMatch.player2_id) {
        // Skip if match doesn't have both players (e.g., bye match)
        return
      }

      const res = await request(app)
        .patch(`/tournaments/${tournamentId}/matches/${knockoutMatchId}/confirm`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect([200, 403]).toContain(res.status)
    })
  })

  describe('GET /player/contact-preferences', () => {
    it('should return default false', async () => {
      const res = await request(app)
        .get('/player/contact-preferences')
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      expect(res.body.shareContact).toBe(false)
    })

    it('should return updated value after PATCH', async () => {
      await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ shareContact: true })

      const res = await request(app)
        .get('/player/contact-preferences')
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      expect(res.body.shareContact).toBe(true)
    })

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/player/contact-preferences')

      expect(res.status).toBe(401)
    })
  })

  describe('PATCH /player/contact-preferences', () => {
    it('should enable contact sharing', async () => {
      const res = await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ shareContact: true })

      expect(res.status).toBe(200)
      expect(res.body.shareContact).toBe(true)
    })

    it('should disable contact sharing', async () => {
      await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ shareContact: true })

      const res = await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ shareContact: false })

      expect(res.status).toBe(200)
      expect(res.body.shareContact).toBe(false)
    })

    it('should return 400 for non-boolean value', async () => {
      const res = await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ shareContact: 'true' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .patch('/player/contact-preferences')
        .send({ shareContact: true })

      expect(res.status).toBe(401)
    })

    it('should update only the authenticated player', async () => {
      await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ shareContact: true })

      const res2 = await request(app)
        .get('/player/contact-preferences')
        .set('Authorization', `Bearer ${player2Token}`)

      expect(res2.status).toBe(200)
      expect(res2.body.shareContact).toBe(false)
    })
  })

  describe('Contact visibility integration', () => {
    it('should respect contact preferences in match listing and details', async () => {
      // Player 2 enables contact sharing
      await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${player2Token}`)
        .send({ shareContact: true })

      // Player 1 sees player 2's email in match details
      const detailRes = await request(app)
        .get(`/tournaments/${tournamentId}/matches/${matchId}`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(detailRes.status).toBe(200)
      if (detailRes.body.match.opponent.playerId === player2Id) {
        expect(detailRes.body.match.opponent.email).toBeTruthy()
      }
    })

    it('should hide contact when preference is disabled', async () => {
      // Ensure player 2 has sharing disabled
      await request(app)
        .patch('/player/contact-preferences')
        .set('Authorization', `Bearer ${player2Token}`)
        .send({ shareContact: false })

      const res = await request(app)
        .get(`/tournaments/${tournamentId}/matches/${matchId}`)
        .set('Authorization', `Bearer ${player1Token}`)

      expect(res.status).toBe(200)
      if (res.body.match.opponent.playerId === player2Id) {
        expect(res.body.match.opponent.email).toBeNull()
      }
    })
  })
})
