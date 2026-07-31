/**
 * P13 Phase 5 — PUT /player/ratings/seed (Step 5.1) and replay-on-seed (Step 5.2).
 *
 * Step 5.1: a player-authenticated route that seeds BOTH formats (singles +
 * doubles) for one sport from a single self-rating value, validated against
 * RATING_MIN/RATING_MAX.
 *
 * Step 5.2: seeding re-bases the player and replays their existing match
 * history for that (sport, format) from the new baseline — no cascade to
 * opponents, matches_played preserved.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { PlayerFactory } from '../factories'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { RatingsRepository } from '../../repositories/ratings-repository'
import { applyRatingForMatch, MatchParticipants } from '../../services/ratings-service'
import { SEED_DEFAULT, RATING_MIN, RATING_MAX } from '../../services/ratings-constants'
import { computeDelta, applyDelta } from '../../services/ratings-calculator'

const SPORT = 'tennis'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('PUT /player/ratings/seed (P13 Phase 5)', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let ratingsRepo: RatingsRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    ratingsRepo = new RatingsRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function playerToken() {
    const player = await PlayerFactory.create(pool)
    const session = await generatePlayerSession(
      { playerId: player.id, tournamentId: `tournament_${uid()}`, email: player.email, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return { player, token: session.token }
  }

  it('seeds BOTH formats for the sport from one call', async () => {
    const { player, token } = await playerToken()
    const seedValue = RATING_MIN + 250

    const res = await request(app)
      .put('/player/ratings/seed')
      .set('Authorization', `Bearer ${token}`)
      .send({ sport: SPORT, rating: seedValue })

    expect(res.status).toBe(200)

    const singles = await ratingsRepo.getFor(player.id, SPORT, 'singles')
    const doubles = await ratingsRepo.getFor(player.id, SPORT, 'doubles')

    expect(singles?.rating).toBe(seedValue)
    expect(doubles?.rating).toBe(seedValue)
  })

  it('rejects a value below RATING_MIN with 400', async () => {
    const { token } = await playerToken()

    const res = await request(app)
      .put('/player/ratings/seed')
      .set('Authorization', `Bearer ${token}`)
      .send({ sport: SPORT, rating: RATING_MIN - 1 })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a value above RATING_MAX with 400', async () => {
    const { token } = await playerToken()

    const res = await request(app)
      .put('/player/ratings/seed')
      .set('Authorization', `Bearer ${token}`)
      .send({ sport: SPORT, rating: RATING_MAX + 1 })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('never seeding leaves the player unset (treated as SEED_DEFAULT)', async () => {
    const { player } = await playerToken()

    const rating = await ratingsRepo.getFor(player.id, SPORT, 'singles')

    expect(rating).toBeUndefined()
  })

  it('a player scored once at the default, then seeding replays that match onto the new baseline', async () => {
    const { player: playerA, token: tokenA } = await playerToken()
    const { player: playerB } = await playerToken()
    const matchId = `match_${uid()}`

    const participants: MatchParticipants = {
      format: 'singles',
      player1Id: playerA.id,
      player2Id: playerB.id,
      winnerId: playerA.id,
    }
    await applyRatingForMatch(ratingsRepo, matchId, SPORT, participants)

    const beforeSeed = await ratingsRepo.getFor(playerA.id, SPORT, 'singles')
    expect(beforeSeed?.rating).not.toBe(SEED_DEFAULT)

    // Both players were fresh (SEED_DEFAULT, 0 matches played) when this
    // match was scored — the exact delta A earned is derivable from the
    // same calculator the service used.
    const originalDelta = computeDelta(SEED_DEFAULT, SEED_DEFAULT, true, 0)
    const seedValue = RATING_MIN + 250

    const res = await request(app)
      .put('/player/ratings/seed')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ sport: SPORT, rating: seedValue })

    expect(res.status).toBe(200)

    const afterSeed = await ratingsRepo.getFor(playerA.id, SPORT, 'singles')
    const expectedFinal = applyDelta(seedValue, originalDelta)

    // Started at the seed value AND played that match — not the seed value
    // flat, and not the old default-plus-delta result.
    expect(afterSeed?.rating).toBeCloseTo(expectedFinal)
    expect(afterSeed?.rating).not.toBe(seedValue)
    expect(afterSeed?.rating).not.toBe(SEED_DEFAULT + originalDelta)
  })

  it("does not cascade — the opponent's rating is unchanged by the seeding player's replay", async () => {
    const { player: playerA, token: tokenA } = await playerToken()
    const { player: playerB } = await playerToken()
    const matchId = `match_${uid()}`

    await applyRatingForMatch(ratingsRepo, matchId, SPORT, {
      format: 'singles',
      player1Id: playerA.id,
      player2Id: playerB.id,
      winnerId: playerA.id,
    })

    const opponentBefore = await ratingsRepo.getFor(playerB.id, SPORT, 'singles')

    const res = await request(app)
      .put('/player/ratings/seed')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ sport: SPORT, rating: RATING_MIN + 250 })

    expect(res.status).toBe(200)

    const opponentAfter = await ratingsRepo.getFor(playerB.id, SPORT, 'singles')

    expect(opponentAfter?.rating).toBe(opponentBefore?.rating)
    expect(opponentAfter?.matchesPlayed).toBe(opponentBefore?.matchesPlayed)
  })

  it('matches_played is not inflated by the replay', async () => {
    const { player: playerA, token: tokenA } = await playerToken()
    const { player: playerB } = await playerToken()
    const matchId = `match_${uid()}`

    await applyRatingForMatch(ratingsRepo, matchId, SPORT, {
      format: 'singles',
      player1Id: playerA.id,
      player2Id: playerB.id,
      winnerId: playerA.id,
    })

    const beforeSeed = await ratingsRepo.getFor(playerA.id, SPORT, 'singles')
    expect(beforeSeed?.matchesPlayed).toBe(1)

    const res = await request(app)
      .put('/player/ratings/seed')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ sport: SPORT, rating: RATING_MIN + 250 })

    expect(res.status).toBe(200)

    const afterSeed = await ratingsRepo.getFor(playerA.id, SPORT, 'singles')
    expect(afterSeed?.matchesPlayed).toBe(1)
  })
})
