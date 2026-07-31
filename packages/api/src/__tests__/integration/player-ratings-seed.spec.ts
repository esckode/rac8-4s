/**
 * P13 Phase 5 — PUT /player/ratings/seed (Step 5.1), gated (R21).
 *
 * A player-authenticated route that seeds BOTH formats (singles + doubles)
 * for one sport from a single self-rating value, validated against
 * RATING_MIN/RATING_MAX. R21 moved the prompt to tournament registration,
 * before any score exists, so seeding is rejected with 409 once either
 * format's bucket already has a scored match — there is no replay.
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
import { applyRatingForMatch } from '../../services/ratings-service'
import { SEED_DEFAULT, RATING_MIN, RATING_MAX, PROVISIONAL_MATCHES } from '../../services/ratings-constants'

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

  it('rejects a seed once the bucket already has a scored match (R21)', async () => {
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

    const res = await request(app)
      .put('/player/ratings/seed')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ sport: SPORT, rating: RATING_MIN + 250 })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('RATING_ALREADY_SCORED')

    const afterSeed = await ratingsRepo.getFor(playerA.id, SPORT, 'singles')
    expect(afterSeed?.rating).toBe(beforeSeed?.rating)
  })
})

describe('GET /player/ratings (P13 Phase 7)', () => {
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

  it('returns the caller\'s own buckets with correct provisional flag', async () => {
    const { player, token } = await playerToken()

    await ratingsRepo.upsert(player.id, SPORT, 'singles', 300, PROVISIONAL_MATCHES - 1)
    await ratingsRepo.upsert(player.id, SPORT, 'doubles', 280, PROVISIONAL_MATCHES)

    const res = await request(app)
      .get('/player/ratings')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.ratings)).toBe(true)

    const singlesRating = res.body.ratings.find((r: any) => r.sport === SPORT && r.format === 'singles')
    const doublesRating = res.body.ratings.find((r: any) => r.sport === SPORT && r.format === 'doubles')

    expect(singlesRating).toEqual({
      sport: SPORT,
      format: 'singles',
      rating: 300,
      matchesPlayed: PROVISIONAL_MATCHES - 1,
      provisional: true,
    })

    expect(doublesRating).toEqual({
      sport: SPORT,
      format: 'doubles',
      rating: 280,
      matchesPlayed: PROVISIONAL_MATCHES,
      provisional: false,
    })
  })

  it('returns min, max, seedDefault from constants', async () => {
    const { token } = await playerToken()

    const res = await request(app)
      .get('/player/ratings')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.min).toBe(RATING_MIN)
    expect(res.body.max).toBe(RATING_MAX)
    expect(res.body.seedDefault).toBe(SEED_DEFAULT)
  })

  it('a player cannot fetch another player\'s ratings', async () => {
    const { player: player1, token: token1 } = await playerToken()
    const { player: player2, token: token2 } = await playerToken()

    await ratingsRepo.upsert(player2.id, SPORT, 'singles', 300, 5)

    const res = await request(app)
      .get('/player/ratings')
      .set('Authorization', `Bearer ${token1}`)

    expect(res.status).toBe(200)
    expect(res.body.ratings).toEqual([])
  })

  it('returns 401 if unauthenticated', async () => {
    const res = await request(app)
      .get('/player/ratings')

    expect(res.status).toBe(401)
  })
})
