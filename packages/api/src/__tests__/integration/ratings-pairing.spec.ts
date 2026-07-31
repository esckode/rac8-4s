/**
 * P13 Phase 8 (R20) — auto-pairing consumes the doubles rating.
 *
 * createGroupsForDoubles (db.ts) balances team means on settled DOUBLES
 * ratings for consenting solo leftovers. A player still provisional —
 * matchesPlayed < PROVISIONAL_MATCHES, including a player with no rating
 * row at all — pairs exactly as before (plain random shuffle). ISSUE-17's
 * auto_pair_consent gate still holds regardless of rating. A ratings
 * lookup failure must never fail group creation — it falls back to
 * pairing every consenting leftover exactly as today.
 */
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { TournamentFactory, OrganizerFactory, PlayerFactory } from '../factories'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../../db'
import { RatingsRepository } from '../../repositories/ratings-repository'
import { PROVISIONAL_MATCHES } from '../../services/ratings-constants'

describe('P13 Phase 8 (R20) — auto-pairing consumes the doubles rating', () => {
  let pool: Pool
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let ratingsRepo: RatingsRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    tournamentRepo = new TournamentRepository(pool)
    playerRepo = new PlayerRepository(pool)
    groupRepo = new GroupRepository(pool)
    ratingsRepo = new RatingsRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function openDoublesTournament() {
    const organizerId = OrganizerFactory.id()
    const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
    await tournamentRepo.updateStatus(tournament.id, 'registration_closed')
    return tournament
  }

  async function soloRegister(tournamentId: string, autoPairConsent = true) {
    const player = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(player.id, tournamentId, autoPairConsent)
    return player
  }

  /** A settled DOUBLES rating: matchesPlayed at the provisional/settled boundary. */
  async function settleRating(playerId: string, sport: string, rating: number) {
    await ratingsRepo.upsert(playerId, sport, 'doubles', rating, PROVISIONAL_MATCHES)
  }

  async function teamsFor(tournamentId: string) {
    const result = await pool.query(
      `SELECT player1_id, player2_id FROM public.teams WHERE tournament_id = $1`,
      [tournamentId]
    )
    return result.rows as { player1_id: string; player2_id: string }[]
  }

  function canonicalPairs(teams: { player1_id: string; player2_id: string }[]): Set<string> {
    return new Set(teams.map(t => [t.player1_id, t.player2_id].sort().join('|')))
  }

  /**
   * Deterministic-but-varying Math.random mock. A constant return would make
   * every team/match id (`team_${Date.now()}_${Math.random()...}`) collide
   * whenever two inserts land in the same millisecond, so this cycles
   * through many distinct values instead — while still being exactly
   * reproducible across two separate calls that each start a fresh mock at
   * n=0, which is what the identical-shuffle comparison below depends on.
   */
  function mockVaryingRandom() {
    let n = 0
    return jest.spyOn(Math, 'random').mockImplementation(() => {
      n += 1
      return (n % 997) / 997
    })
  }

  /** Replicates today's plain shuffle-and-pair-adjacent leftover algorithm. */
  function shufflePair(ids: string[]): Set<string> {
    const shuffled = [...ids].sort(() => Math.random() - 0.5)
    const pairs: string[] = []
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      pairs.push([shuffled[i], shuffled[i + 1]].sort().join('|'))
    }
    return new Set(pairs)
  }

  it('REGRESSION GUARD: an all-provisional roster pairs identically to today', async () => {
    const tournament = await openDoublesTournament()
    const players = await Promise.all([
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
    ])
    const ids = players.map(p => p.id)

    // What today's plain shuffle-and-pair would produce under a fixed
    // random sequence, computed independently of the repository call.
    let spy = mockVaryingRandom()
    const expectedPairs = shufflePair(ids)
    spy.mockRestore()

    // The real call, replaying the SAME sequence from the same start.
    spy = mockVaryingRandom()
    try {
      await groupRepo.createGroupsForDoubles(tournament.id, 1, 1, ids, true)
    } finally {
      spy.mockRestore()
    }

    const actualPairs = canonicalPairs(await teamsFor(tournament.id))
    expect(actualPairs).toEqual(expectedPairs)
  })

  it('a settled roster pairs strong-with-weak to balance team means', async () => {
    const tournament = await openDoublesTournament()
    const players = await Promise.all([
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
    ])
    const [a, b, c, d, e, f] = players
    // Ascending ratings a < b < c < d < e < f. Sort-and-pair-ends balances
    // means: (a,f), (b,e), (c,d).
    await settleRating(a.id, tournament.sport, 130)
    await settleRating(b.id, tournament.sport, 180)
    await settleRating(c.id, tournament.sport, 220)
    await settleRating(d.id, tournament.sport, 260)
    await settleRating(e.id, tournament.sport, 320)
    await settleRating(f.id, tournament.sport, 380)

    await groupRepo.createGroupsForDoubles(tournament.id, 1, 1, players.map(p => p.id), true)

    const actualPairs = canonicalPairs(await teamsFor(tournament.id))
    expect(actualPairs).toEqual(new Set([
      [a.id, f.id].sort().join('|'),
      [b.id, e.id].sort().join('|'),
      [c.id, d.id].sort().join('|'),
    ]))
  })

  it('a player with auto_pair_consent=false is still excluded regardless of rating (ISSUE-17)', async () => {
    const tournament = await openDoublesTournament()
    const optedOut = await soloRegister(tournament.id, false)
    await settleRating(optedOut.id, tournament.sport, 400) // high settled rating, still excluded
    const others = await Promise.all([
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
    ])

    await groupRepo.createGroupsForDoubles(
      tournament.id,
      1,
      1,
      [optedOut, ...others].map(p => p.id),
      true
    )

    const teams = await teamsFor(tournament.id)
    const teamed = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    expect(teamed.has(optedOut.id)).toBe(false)

    const reg = await playerRepo.findRegistration(optedOut.id, tournament.id)
    expect(reg?.status).toBe('unpaired')
  })

  it('a mixed roster (some settled, some provisional) pairs everyone eligible without crashing', async () => {
    const tournament = await openDoublesTournament()
    const [s1, s2, p1, p2] = await Promise.all([
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
    ])
    await settleRating(s1.id, tournament.sport, 200)
    await settleRating(s2.id, tournament.sport, 350)
    // p1, p2 stay provisional: no rating row at all.

    await expect(
      groupRepo.createGroupsForDoubles(tournament.id, 1, 1, [s1, s2, p1, p2].map(p => p.id), true)
    ).resolves.toBeDefined()

    const teams = await teamsFor(tournament.id)
    const teamed = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    for (const p of [s1, s2, p1, p2]) {
      expect(teamed.has(p.id)).toBe(true)
    }
  })

  it('a rating-lookup failure falls back to pairing everyone as today, without failing group creation', async () => {
    const tournament = await openDoublesTournament()
    const players = await Promise.all([
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
    ])

    const spy = jest.spyOn(RatingsRepository.prototype, 'getFor').mockRejectedValue(new Error('ratings lookup boom'))
    try {
      await expect(
        groupRepo.createGroupsForDoubles(tournament.id, 1, 1, players.map(p => p.id), true)
      ).resolves.toBeDefined()
    } finally {
      spy.mockRestore()
    }

    const teams = await teamsFor(tournament.id)
    const teamed = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    for (const p of players) {
      expect(teamed.has(p.id)).toBe(true)
    }
  })
})
