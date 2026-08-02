/**
 * Ratings Service — Phase 3 (P13): apply and correct
 *
 * Pure application logic on top of the Phase 2 calculator and the Phase 1
 * repository.
 *
 * correctRatingForMatch is the critical piece (R16/R17): it reverses the
 * MOST RECENT history row for the match (never the original — a corrected
 * match can itself be corrected again, and the service worker's sync-queue
 * can replay a queued edit on reconnect), recomputes against each
 * participant's CURRENT rating, and never touches any other match. It does
 * not increment matches_played — that match was already counted when it was
 * first applied.
 *
 * Phase 12 (R29): applyRatingForMatch/correctRatingForMatch each own a
 * single transaction — separate from the score write (design §3b) — that
 * locks every participant's row with one `SELECT ... FOR UPDATE` (sorted by
 * player id) and writes with one multi-row upsert and one multi-row history
 * insert. This closes ISSUE-47 (a partial settle on failure) and ISSUE-48
 * (an unlocked read-modify-write losing an update under overlap).
 *
 * Task 14.1: Phase 12's lock only covered rows that already existed, so a
 * player's FIRST match in a (sport, format) was computed from an unlocked
 * read — ISSUE-48's shape again, narrowed to first matches. applyRatingForMatch
 * now seeds a row (ON CONFLICT DO NOTHING) for every participant before
 * locking, so every id is guaranteed present in the locked map.
 */
import type { Pool, PoolClient } from 'pg'
import { RatingsRepository, type DbConnection, type PlayerRating } from '../repositories/ratings-repository'
import { computeDelta, computeTeamDelta, applyDelta } from './ratings-calculator'
import { SEED_DEFAULT } from './ratings-constants'
import { getLogger } from '../logger'

const log = getLogger('ratings-service')

export interface SinglesMatchParticipants {
  format: 'singles'
  player1Id: string
  player2Id: string
  winnerId: string
}

export interface DoublesMatchParticipants {
  format: 'doubles'
  team1: [string, string]
  team2: [string, string]
  winningTeam: 'team1' | 'team2'
}

export type MatchParticipants = SinglesMatchParticipants | DoublesMatchParticipants

/** True if two participant snapshots describe the same match outcome (ratings-relevant "score"). */
function sameOutcome(a: MatchParticipants, b: MatchParticipants): boolean {
  if (a.format !== b.format) return false
  if (a.format === 'singles' && b.format === 'singles') {
    return a.winnerId === b.winnerId
  }
  if (a.format === 'doubles' && b.format === 'doubles') {
    return a.winningTeam === b.winningTeam
  }
  return false
}

/**
 * Opens the settle's own transaction (plain connect + BEGIN/COMMIT/ROLLBACK
 * per CLAUDE.md §7 — the test harness rewrites these to savepoints) and
 * hands `fn` a repository bound to the locked, transactional connection.
 */
async function withRatingsTransaction<T>(pool: DbConnection, fn: (repo: RatingsRepository) => Promise<T>): Promise<T> {
  const client: PoolClient = await (pool as Pool).connect()
  try {
    await client.query('BEGIN')
    const repo = new RatingsRepository(client)
    const result = await fn(repo)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

function requireLocked(locked: Map<string, PlayerRating>, playerId: string, matchId: string): { rating: number; matchesPlayed: number } {
  const existing = locked.get(playerId)
  if (!existing) {
    throw new Error(`correctRatingForMatch: no current rating for player ${playerId}; match ${matchId} was never applied`)
  }
  return existing
}

async function applySinglesRating(
  repo: RatingsRepository,
  matchId: string,
  sport: string,
  { player1Id, player2Id, winnerId }: SinglesMatchParticipants
): Promise<void> {
  const format = 'singles'
  const won1 = winnerId === player1Id
  const ids = [player1Id, player2Id]

  // Task 14.1 (ISSUE-48): seed before locking so a player's first match in
  // this (sport, format) has a row for FOR UPDATE to actually lock.
  await repo.seedManyFor(ids, sport, format, SEED_DEFAULT)
  const locked = await repo.lockManyFor(ids, sport, format)
  const p1 = locked.get(player1Id)!
  const p2 = locked.get(player2Id)!

  const delta1 = computeDelta(p1.rating, p2.rating, won1, p1.matchesPlayed)
  const delta2 = computeDelta(p2.rating, p1.rating, !won1, p2.matchesPlayed)
  const rating1 = applyDelta(p1.rating, delta1)
  const rating2 = applyDelta(p2.rating, delta2)

  await repo.upsertMany([
    { playerId: player1Id, sport, format, rating: rating1, matchesPlayed: p1.matchesPlayed + 1 },
    { playerId: player2Id, sport, format, rating: rating2, matchesPlayed: p2.matchesPlayed + 1 },
  ])
  await repo.appendHistoryMany([
    { playerId: player1Id, sport, format, delta: delta1, ratingAfter: rating1, matchId },
    { playerId: player2Id, sport, format, delta: delta2, ratingAfter: rating2, matchId },
  ])

  log.info('rating.applied', { matchId, sport, format })
}

async function applyDoublesRating(
  repo: RatingsRepository,
  matchId: string,
  sport: string,
  { team1, team2, winningTeam }: DoublesMatchParticipants
): Promise<void> {
  const format = 'doubles'
  const team1Won = winningTeam === 'team1'
  const [t1p1id, t1p2id] = team1
  const [t2p1id, t2p2id] = team2
  const ids = [t1p1id, t1p2id, t2p1id, t2p2id]

  // Task 14.1 (ISSUE-48): seed before locking so a player's first match in
  // this (sport, format) has a row for FOR UPDATE to actually lock.
  await repo.seedManyFor(ids, sport, format, SEED_DEFAULT)
  const locked = await repo.lockManyFor(ids, sport, format)
  const t1p1 = locked.get(t1p1id)!
  const t1p2 = locked.get(t1p2id)!
  const t2p1 = locked.get(t2p1id)!
  const t2p2 = locked.get(t2p2id)!

  // Team "matches played" for K-decay mirrors how the calculator itself treats
  // team rating — the mean of the two partners.
  const team1MatchesPlayed = (t1p1.matchesPlayed + t1p2.matchesPlayed) / 2
  const team2MatchesPlayed = (t2p1.matchesPlayed + t2p2.matchesPlayed) / 2

  const delta1 = computeTeamDelta([t1p1.rating, t1p2.rating], [t2p1.rating, t2p2.rating], team1Won, team1MatchesPlayed)
  const delta2 = computeTeamDelta([t2p1.rating, t2p2.rating], [t1p1.rating, t1p2.rating], !team1Won, team2MatchesPlayed)
  const rating1a = applyDelta(t1p1.rating, delta1)
  const rating1b = applyDelta(t1p2.rating, delta1)
  const rating2a = applyDelta(t2p1.rating, delta2)
  const rating2b = applyDelta(t2p2.rating, delta2)

  await repo.upsertMany([
    { playerId: t1p1id, sport, format, rating: rating1a, matchesPlayed: t1p1.matchesPlayed + 1 },
    { playerId: t1p2id, sport, format, rating: rating1b, matchesPlayed: t1p2.matchesPlayed + 1 },
    { playerId: t2p1id, sport, format, rating: rating2a, matchesPlayed: t2p1.matchesPlayed + 1 },
    { playerId: t2p2id, sport, format, rating: rating2b, matchesPlayed: t2p2.matchesPlayed + 1 },
  ])
  await repo.appendHistoryMany([
    { playerId: t1p1id, sport, format, delta: delta1, ratingAfter: rating1a, matchId },
    { playerId: t1p2id, sport, format, delta: delta1, ratingAfter: rating1b, matchId },
    { playerId: t2p1id, sport, format, delta: delta2, ratingAfter: rating2a, matchId },
    { playerId: t2p2id, sport, format, delta: delta2, ratingAfter: rating2b, matchId },
  ])

  log.info('rating.applied', { matchId, sport, format })
}

/**
 * Step 3.1 — apply ratings for a newly scored match. Seeds any participant
 * without an existing (sport, format) row from SEED_DEFAULT, moves each
 * participant, and increments their matches_played. Runs inside its own
 * transaction (Phase 12) — separate from the score write.
 */
export async function applyRatingForMatch(
  pool: DbConnection,
  matchId: string,
  sport: string,
  participants: MatchParticipants
): Promise<void> {
  await withRatingsTransaction(pool, async (repo) => {
    if (participants.format === 'singles') {
      await applySinglesRating(repo, matchId, sport, participants)
    } else {
      await applyDoublesRating(repo, matchId, sport, participants)
    }
  })
}

async function correctSinglesRating(
  repo: RatingsRepository,
  matchId: string,
  sport: string,
  { player1Id, player2Id, winnerId }: SinglesMatchParticipants
): Promise<void> {
  const format = 'singles'
  const won1New = winnerId === player1Id
  const ids = [player1Id, player2Id]

  const locked = await repo.lockManyFor(ids, sport, format)
  const cur1 = requireLocked(locked, player1Id, matchId)
  const cur2 = requireLocked(locked, player2Id, matchId)

  const lastDeltas = await repo.findLatestHistoryForMany(ids, matchId)
  const last1 = lastDeltas.get(player1Id)
  const last2 = lastDeltas.get(player2Id)
  if (!last1 || !last2) {
    throw new Error(`correctRatingForMatch: no prior rating history for match ${matchId}`)
  }

  const baseline1 = cur1.rating - last1.delta
  const baseline2 = cur2.rating - last2.delta

  const delta1 = computeDelta(baseline1, baseline2, won1New, cur1.matchesPlayed)
  const delta2 = computeDelta(baseline2, baseline1, !won1New, cur2.matchesPlayed)
  const rating1 = applyDelta(baseline1, delta1)
  const rating2 = applyDelta(baseline2, delta2)

  // matches_played is NOT incremented on a correction — the match was already counted.
  await repo.upsertMany([
    { playerId: player1Id, sport, format, rating: rating1, matchesPlayed: cur1.matchesPlayed },
    { playerId: player2Id, sport, format, rating: rating2, matchesPlayed: cur2.matchesPlayed },
  ])
  await repo.appendHistoryMany([
    { playerId: player1Id, sport, format, delta: delta1, ratingAfter: rating1, matchId },
    { playerId: player2Id, sport, format, delta: delta2, ratingAfter: rating2, matchId },
  ])

  log.info('rating.corrected', { matchId, sport, format })
}

async function correctDoublesRating(
  repo: RatingsRepository,
  matchId: string,
  sport: string,
  { team1, team2, winningTeam }: DoublesMatchParticipants
): Promise<void> {
  const format = 'doubles'
  const team1WonNew = winningTeam === 'team1'
  const [t1p1id, t1p2id] = team1
  const [t2p1id, t2p2id] = team2
  const ids = [t1p1id, t1p2id, t2p1id, t2p2id]

  const locked = await repo.lockManyFor(ids, sport, format)
  const cur_t1p1 = requireLocked(locked, t1p1id, matchId)
  const cur_t1p2 = requireLocked(locked, t1p2id, matchId)
  const cur_t2p1 = requireLocked(locked, t2p1id, matchId)
  const cur_t2p2 = requireLocked(locked, t2p2id, matchId)

  const lastDeltas = await repo.findLatestHistoryForMany(ids, matchId)
  const missing = ids.filter((id) => !lastDeltas.has(id))
  if (missing.length > 0) {
    throw new Error(`correctRatingForMatch: no prior rating history for match ${matchId}`)
  }

  const baseline_t1p1 = cur_t1p1.rating - lastDeltas.get(t1p1id)!.delta
  const baseline_t1p2 = cur_t1p2.rating - lastDeltas.get(t1p2id)!.delta
  const baseline_t2p1 = cur_t2p1.rating - lastDeltas.get(t2p1id)!.delta
  const baseline_t2p2 = cur_t2p2.rating - lastDeltas.get(t2p2id)!.delta

  const team1MatchesPlayed = (cur_t1p1.matchesPlayed + cur_t1p2.matchesPlayed) / 2
  const team2MatchesPlayed = (cur_t2p1.matchesPlayed + cur_t2p2.matchesPlayed) / 2

  const delta1 = computeTeamDelta(
    [baseline_t1p1, baseline_t1p2],
    [baseline_t2p1, baseline_t2p2],
    team1WonNew,
    team1MatchesPlayed
  )
  const delta2 = computeTeamDelta(
    [baseline_t2p1, baseline_t2p2],
    [baseline_t1p1, baseline_t1p2],
    !team1WonNew,
    team2MatchesPlayed
  )
  const rating_t1p1 = applyDelta(baseline_t1p1, delta1)
  const rating_t1p2 = applyDelta(baseline_t1p2, delta1)
  const rating_t2p1 = applyDelta(baseline_t2p1, delta2)
  const rating_t2p2 = applyDelta(baseline_t2p2, delta2)

  await repo.upsertMany([
    { playerId: t1p1id, sport, format, rating: rating_t1p1, matchesPlayed: cur_t1p1.matchesPlayed },
    { playerId: t1p2id, sport, format, rating: rating_t1p2, matchesPlayed: cur_t1p2.matchesPlayed },
    { playerId: t2p1id, sport, format, rating: rating_t2p1, matchesPlayed: cur_t2p1.matchesPlayed },
    { playerId: t2p2id, sport, format, rating: rating_t2p2, matchesPlayed: cur_t2p2.matchesPlayed },
  ])
  await repo.appendHistoryMany([
    { playerId: t1p1id, sport, format, delta: delta1, ratingAfter: rating_t1p1, matchId },
    { playerId: t1p2id, sport, format, delta: delta1, ratingAfter: rating_t1p2, matchId },
    { playerId: t2p1id, sport, format, delta: delta2, ratingAfter: rating_t2p1, matchId },
    { playerId: t2p2id, sport, format, delta: delta2, ratingAfter: rating_t2p2, matchId },
  ])

  log.info('rating.corrected', { matchId, sport, format })
}

/**
 * Step 3.2 — correct ratings after a score edit/override (R16/R17).
 *
 * `previous` must reflect the ACTUAL current stored outcome (not a stale
 * value) — the caller re-reads it fresh. If `previous` and `current`
 * describe the same outcome, this is a no-op: nothing is read from or
 * written to history, so a replayed edit (e.g. the service worker's
 * sync-queue retry on reconnect) does not double-correct.
 *
 * Reverses only the MOST RECENT history row per participant (never the
 * original), recomputes against each participant's CURRENT rating, and
 * touches only the participants of THIS match — no cascade to opponents'
 * other matches. matches_played is left unchanged. Runs inside its own
 * transaction (Phase 12) — separate from the score write.
 */
export async function correctRatingForMatch(
  pool: DbConnection,
  matchId: string,
  sport: string,
  previous: MatchParticipants,
  current: MatchParticipants
): Promise<void> {
  if (sameOutcome(previous, current)) return

  await withRatingsTransaction(pool, async (repo) => {
    if (current.format === 'singles') {
      await correctSinglesRating(repo, matchId, sport, current)
    } else {
      await correctDoublesRating(repo, matchId, sport, current)
    }
  })
}

/**
 * Step 5.1 — set a new self-rating seed for a sport, seeding BOTH formats
 * from the same value (R5).
 *
 * R21: the caller (route) rejects with 409 before this runs if either
 * format's bucket already has a scored match — seeding is only legal
 * before the first score. By construction there is therefore no history to
 * reconcile here: this simply writes the baseline for both buckets.
 *
 * R23: stays synchronous and outside the Phase 12 lock — it is a single-row
 * write with no concurrent settle to race against before a bucket has any
 * matches.
 */
export async function seedRatingForSport(
  repo: RatingsRepository,
  playerId: string,
  sport: string,
  seedValue: number
): Promise<{ singles: PlayerRating; doubles: PlayerRating }> {
  await repo.upsert(playerId, sport, 'singles', seedValue, 0)
  await repo.upsert(playerId, sport, 'doubles', seedValue, 0)

  log.info('rating.seeded', { playerId, sport })

  return {
    singles: (await repo.getFor(playerId, sport, 'singles'))!,
    doubles: (await repo.getFor(playerId, sport, 'doubles'))!,
  }
}
