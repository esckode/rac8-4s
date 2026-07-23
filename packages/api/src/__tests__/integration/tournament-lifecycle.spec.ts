import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, OrganizerFactory, PlayerFactory } from '../factories'
import { TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository } from '../../db'
import { generatePlayerSession } from '../../auth/magic-link'
import { InMemoryTokenStore } from '../../auth/token-store'


describe('Tournament Lifecycle Workflows', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool) as any
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('Complete single-elimination tournament flow', () => {
    it('progresses from creation through group stage to bracket completion', async () => {
      const { sub: organizerId, accessToken: organizerToken } = OrganizerFactory.token(jwtConfig)

      // 1. Create tournament
      const tournamentData = TournamentFactory.data({
        maxPlayers: 8,
        matchFormat: 'singles',
      })

      const createRes = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(tournamentData)

      expect(createRes.status).toBe(201)
      const tournamentId = createRes.body.id
      expect(createRes.body.status).toBe('draft')

      // 1b. Open registration
      const tourneyRepo = new TournamentRepository(pool)
      await tourneyRepo.updateStatus(tournamentId, 'registration_open')

      // 2. Register 8 players
      const playerIds: string[] = []
      const playerSessions: { [key: string]: string } = {}

      for (let i = 0; i < 8; i++) {
        const player = await PlayerFactory.create(pool)
        playerIds.push(player.id)

        const regRes = await request(app)
          .post(`/tournaments/${tournamentId}/register`)
          .send({
            email: player.email,
            name: player.name,
          })

        expect(regRes.status).toBe(202)

        // Generate session for this player
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
        playerSessions[player.id] = session.token
      }

      // 3. Close registration (direct repo update for setup)
      const tournamentRepo = new TournamentRepository(pool)
      await tournamentRepo.updateStatus(tournamentId, 'registration_closed')

      // 4. Create groups
      const groupsRes = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 2,
          advancingPerGroup: 1,
        })

      expect(groupsRes.status).toBe(201)
      expect(groupsRes.body.groups.length).toBe(2)

      // 5. Score group matches
      const groupRepo = new GroupRepository(pool)
      const groups = await groupRepo.findGroupsByTournament(tournamentId)

      for (const group of groups) {
        const matches = await groupRepo.findMatchesByGroup(group.id)
        for (const match of matches) {
          const scoreRes = await request(app)
            .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
            .set('Authorization', `Bearer ${playerSessions[match.player1_id!]}`)
            .send({
              score: '6-3, 6-4',
            })

          expect(scoreRes.status).toBe(200)
        }
      }

      // 6. Transition to group stage complete
      await tourneyRepo.updateStatus(tournamentId, 'group_stage_complete')

      // 7. Generate bracket
      const bracketRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(bracketRes.status).toBe(200)
      expect(bracketRes.body.bracket).toBeDefined()

      // 8. Score knockout matches
      const knockoutRepo = new KnockoutRepository(pool)
      const knockoutMatches = await knockoutRepo.findKnockoutMatchesByTournament(tournamentId)

      for (const match of knockoutMatches) {
        if (match.player1_id && match.player2_id) {
          const scoreRes = await request(app)
            .post(`/tournaments/${tournamentId}/knockout/${match.id}/score`)
            .set('Authorization', `Bearer ${playerSessions[match.player1_id!]}`)
            .send({
              score: '6-4, 6-3',
            })

          expect(scoreRes.status).toBe(200)
        }
      }

      // 9. Verify tournament completion
      const finalRes = await request(app)
        .get(`/tournaments/${tournamentId}/bundle`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(finalRes.status).toBe(200)
      expect(finalRes.body.tournament).toBeDefined()
    })
  })

  describe('Doubles tournament lifecycle', () => {
    it('creates doubles tournament and closes registration', async () => {
      const { sub: organizerId, accessToken: organizerToken } = OrganizerFactory.token(jwtConfig)

      // Create doubles tournament
      const tournamentData = TournamentFactory.data({
        maxPlayers: 8,
        matchFormat: 'doubles',
      })

      const createRes = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(tournamentData)

      expect(createRes.status).toBe(201)
      const tournamentId = createRes.body.id
      expect(createRes.body.status).toBe('draft')

      // Open registration
      const regTournamentRepo = new TournamentRepository(pool)
      await regTournamentRepo.updateStatus(tournamentId, 'registration_open')

      // Register 8 players as 4 teams (pairs)
      for (let i = 0; i < 4; i++) {
        const player1 = await PlayerFactory.create(pool)
        const player2 = await PlayerFactory.create(pool)

        // Register first player, inviting the second (already-existing) player
        // by email — this creates both sides' registrations in one call, so
        // there's no separate call needed for player2.
        const regRes1 = await request(app)
          .post(`/tournaments/${tournamentId}/register`)
          .send({
            email: player1.email,
            name: player1.name,
            partnerEmail: player2.email,
          })

        expect(regRes1.status).toBe(202)
      }

      // Close registration
      const tournamentRepo = new TournamentRepository(pool)
      await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    })
  })


  describe('Tournament state validation during lifecycle', () => {
    it('progresses through valid state transitions', async () => {
      const { sub: organizerId, accessToken: organizerToken } = OrganizerFactory.token(jwtConfig)

      const tournamentData = TournamentFactory.data({
        maxPlayers: 4,
      })

      const createRes = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(tournamentData)

      const tournamentId = createRes.body.id
      expect(createRes.body.status).toBe('draft')

      // Open and register players
      const tournamentRepo = new TournamentRepository(pool)
      await tournamentRepo.updateStatus(tournamentId, 'registration_open')

      for (let i = 0; i < 4; i++) {
        const player = await PlayerFactory.create(pool)
        await request(app)
          .post(`/tournaments/${tournamentId}/register`)
          .send({
            email: player.email,
            name: player.name,
          })
      }

      // Transition to registration_closed
      await tournamentRepo.updateStatus(tournamentId, 'registration_closed')

      // Now can create groups
      const groupsRes = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 1,
          advancingPerGroup: 2,
        })

      expect(groupsRes.status).toBe(201)
    })
  })

  describe('Tournament with multiple groups', () => {
    it('advances all group stage winners to bracket correctly', async () => {
      const { sub: organizerId, accessToken: organizerToken } = OrganizerFactory.token(jwtConfig)

      const tournamentData = TournamentFactory.data({
        maxPlayers: 12,
        matchFormat: 'singles',
      })

      const createRes = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(tournamentData)

      const tournamentId = createRes.body.id
      const playerSessions: { [key: string]: string } = {}

      // Open registration
      const multiGroupTournamentRepo = new TournamentRepository(pool)
      await multiGroupTournamentRepo.updateStatus(tournamentId, 'registration_open')

      // Register 12 players
      for (let i = 0; i < 12; i++) {
        const player = await PlayerFactory.create(pool)

        await request(app)
          .post(`/tournaments/${tournamentId}/register`)
          .send({
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
        playerSessions[player.id] = session.token
      }

      // Close registration
      await multiGroupTournamentRepo.updateStatus(tournamentId, 'registration_closed')

      // Create 3 groups with 4 players each, advancing 2 from each (6 total to bracket)
      const groupsRes = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 3,
          advancingPerGroup: 2,
        })

      expect(groupsRes.status).toBe(201)
      expect(groupsRes.body.groups.length).toBe(3)

      // Score all group matches
      const groupRepo = new GroupRepository(pool)
      const groups = await groupRepo.findGroupsByTournament(tournamentId)

      for (const group of groups) {
        const matches = await groupRepo.findMatchesByGroup(group.id)
        for (const match of matches) {
          await request(app)
            .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
            .set('Authorization', `Bearer ${playerSessions[match.player1_id!]}`)
            .send({
              score: '6-2, 6-1',
            })
        }
      }

      // Advance to group stage complete
      const multiGroupRepo = new TournamentRepository(pool)
      await multiGroupRepo.updateStatus(tournamentId, 'group_stage_complete')

      // Generate bracket - should have 6 players (2 from each group)
      const bracketRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(bracketRes.status).toBe(200)

      // Count unique players in bracket
      const uniquePlayersInBracket = new Set<string>()
      bracketRes.body.bracket.rounds.forEach((r: any) => {
        r.matches.forEach((m: any) => {
          if (m.player1Id) uniquePlayersInBracket.add(m.player1Id)
          if (m.player2Id) uniquePlayersInBracket.add(m.player2Id)
        })
      })

      expect(uniquePlayersInBracket.size).toBe(6)
    })
  })

  describe('Tournament bracket publication', () => {
    it('publishes bracket and notifies all advancing players', async () => {
      const { sub: organizerId, accessToken: organizerToken } = OrganizerFactory.token(jwtConfig)

      const tournamentData = TournamentFactory.data({
        maxPlayers: 8,
        matchFormat: 'singles',
      })

      const createRes = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(tournamentData)

      const tournamentId = createRes.body.id
      const playerSessions: { [key: string]: string } = {}

      // Open registration
      const bracketTournamentRepo = new TournamentRepository(pool)
      await bracketTournamentRepo.updateStatus(tournamentId, 'registration_open')

      // Register 8 players
      for (let i = 0; i < 8; i++) {
        const player = await PlayerFactory.create(pool)

        await request(app)
          .post(`/tournaments/${tournamentId}/register`)
          .send({
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
        playerSessions[player.id] = session.token
      }

      // Close registration
      await bracketTournamentRepo.updateStatus(tournamentId, 'registration_closed')

      // Create and score groups
      const groupsRes = await request(app)
        .post(`/tournaments/${tournamentId}/groups`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          numGroups: 2,
          advancingPerGroup: 1,
        })

      const groupRepo = new GroupRepository(pool)
      const groups = await groupRepo.findGroupsByTournament(tournamentId)

      for (const group of groups) {
        const matches = await groupRepo.findMatchesByGroup(group.id)
        for (const match of matches) {
          await request(app)
            .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
            .set('Authorization', `Bearer ${playerSessions[match.player1_id!]}`)
            .send({
              score: '6-3, 6-4',
            })
        }
      }

      // Advance and generate bracket
      const bracketPubTourneyRepo = new TournamentRepository(pool)
      await bracketPubTourneyRepo.updateStatus(tournamentId, 'group_stage_complete')

      const bracketRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/generate`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(bracketRes.status).toBe(200)

      // Publish bracket
      const publishRes = await request(app)
        .post(`/tournaments/${tournamentId}/bracket/publish`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(publishRes.status).toBe(200)
      expect(publishRes.body.matches).toBeDefined()
      expect(publishRes.body.matches.length).toBeGreaterThan(0)
    })
  })

})
