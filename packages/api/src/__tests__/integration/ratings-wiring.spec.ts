/**
 * P13 Phase 4 — wiring skill ratings into the live score paths.
 *
 * Covers the two hook points:
 *  - POST /:id/matches/:matchId/score  → applyRatingForMatch  (score-service.ts)
 *  - PATCH /:id/matches/:matchId/score → correctRatingForMatch (tournaments.ts,
 *    both the participant self-edit and the organizer-override branches)
 *
 * Not testing the rating maths itself (Phase 2/3 own that) — only that these
 * routes actually call the ratings service, that the direction of movement
 * reflects the current winner, and that a ratings failure never fails the
 * score write.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, OrganizerFactory, PlayerFactory } from '../factories'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { RatingsRepository } from '../../repositories/ratings-repository'
import { SEED_DEFAULT } from '../../services/ratings-constants'

describe('P13 Phase 4: ratings wired into score paths', () => {
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

  /** Creates a 4-player scheduled tournament, one group, and returns its first singles match. */
  async function setupSinglesMatch() {
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

    return { tournament, organizerId, orgToken, match, groupRepo, player1Token: player1Session.token }
  }

  it("submitting a score seeds and moves both players' ratings", async () => {
    const { tournament, match, player1Token } = await setupSinglesMatch()
    const ratingsRepo = new RatingsRepository(pool)

    // Neither player has a rating yet — they did not exist before.
    expect(await ratingsRepo.getFor(match.player1_id!, tournament.sport, 'singles')).toBeUndefined()
    expect(await ratingsRepo.getFor(match.player2_id!, tournament.sport, 'singles')).toBeUndefined()

    // Player 1 wins in straight sets.
    const submitRes = await request(app)
      .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ score: '6-4, 6-3' })

    expect(submitRes.status).toBe(200)

    const p1 = await ratingsRepo.getFor(match.player1_id!, tournament.sport, 'singles')
    const p2 = await ratingsRepo.getFor(match.player2_id!, tournament.sport, 'singles')

    // Seeded from the default, then moved: winner up, loser down.
    expect(p1).toBeDefined()
    expect(p2).toBeDefined()
    expect(p1!.matchesPlayed).toBe(1)
    expect(p2!.matchesPlayed).toBe(1)
    expect(p1!.rating).toBeGreaterThan(SEED_DEFAULT)
    expect(p2!.rating).toBeLessThan(SEED_DEFAULT)
  })

  it('editing that score to flip the winner moves the ratings back the other way', async () => {
    const { tournament, match, player1Token } = await setupSinglesMatch()
    const ratingsRepo = new RatingsRepository(pool)

    // Player 1 wins first.
    const submitRes = await request(app)
      .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ score: '6-4, 6-3' })
    expect(submitRes.status).toBe(200)

    const p1AfterSubmit = (await ratingsRepo.getFor(match.player1_id!, tournament.sport, 'singles'))!
    const p2AfterSubmit = (await ratingsRepo.getFor(match.player2_id!, tournament.sport, 'singles'))!
    expect(p1AfterSubmit.rating).toBeGreaterThan(SEED_DEFAULT)
    expect(p2AfterSubmit.rating).toBeLessThan(SEED_DEFAULT)

    // Participant edits their own score, flipping the winner to player 2.
    const editRes = await request(app)
      .patch(`/tournaments/${tournament.id}/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ score: '4-6, 3-6' })
    expect(editRes.status).toBe(200)

    const p1Final = (await ratingsRepo.getFor(match.player1_id!, tournament.sport, 'singles'))!
    const p2Final = (await ratingsRepo.getFor(match.player2_id!, tournament.sport, 'singles'))!

    // End state reflects the NEW winner (player 2), not the old one.
    expect(p2Final.rating).toBeGreaterThan(SEED_DEFAULT)
    expect(p1Final.rating).toBeLessThan(SEED_DEFAULT)
    expect(p2Final.rating).toBeGreaterThan(p1Final.rating)

    // And each player moved back the other way relative to right after submission.
    expect(p1Final.rating).toBeLessThan(p1AfterSubmit.rating)
    expect(p2Final.rating).toBeGreaterThan(p2AfterSubmit.rating)

    // A correction never counts as an additional match played.
    expect(p1Final.matchesPlayed).toBe(1)
    expect(p2Final.matchesPlayed).toBe(1)
  })

  it('does not fail the score request when the ratings path throws', async () => {
    const { tournament, match, player1Token, groupRepo } = await setupSinglesMatch()

    const failure = jest
      .spyOn(RatingsRepository.prototype, 'getFor')
      .mockRejectedValueOnce(new Error('ratings backend unavailable'))

    try {
      const submitRes = await request(app)
        .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1Token}`)
        .send({ score: '6-4, 6-3' })

      // The score write must succeed regardless of the ratings failure.
      expect(submitRes.status).toBe(200)

      const persisted = await groupRepo.findMatchById(match.id)
      expect(persisted?.status).toBe('completed')
      expect(persisted?.score).toBe('6-4, 6-3')
      expect(persisted?.winner_id).toBe(match.player1_id)
    } finally {
      failure.mockRestore()
    }
  })

  it('the organizer override branch also triggers a correction', async () => {
    const { tournament, match, player1Token, orgToken } = await setupSinglesMatch()
    const ratingsRepo = new RatingsRepository(pool)

    // Player 1 wins first.
    const submitRes = await request(app)
      .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ score: '6-4, 6-3' })
    expect(submitRes.status).toBe(200)

    const p1AfterSubmit = (await ratingsRepo.getFor(match.player1_id!, tournament.sport, 'singles'))!
    const p2AfterSubmit = (await ratingsRepo.getFor(match.player2_id!, tournament.sport, 'singles'))!

    // Organizer overrides, flipping the winner to player 2.
    const overrideRes = await request(app)
      .patch(`/tournaments/${tournament.id}/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ score: '4-6, 3-6', reason: 'Correcting a scorekeeping error' })
    expect(overrideRes.status).toBe(200)

    const p1Final = (await ratingsRepo.getFor(match.player1_id!, tournament.sport, 'singles'))!
    const p2Final = (await ratingsRepo.getFor(match.player2_id!, tournament.sport, 'singles'))!

    expect(p2Final.rating).toBeGreaterThan(p1Final.rating)
    expect(p1Final.rating).toBeLessThan(p1AfterSubmit.rating)
    expect(p2Final.rating).toBeGreaterThan(p2AfterSubmit.rating)
    expect(p1Final.matchesPlayed).toBe(1)
    expect(p2Final.matchesPlayed).toBe(1)
  })
})
