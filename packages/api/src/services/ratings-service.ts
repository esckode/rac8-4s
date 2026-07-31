/**
 * Ratings Service — Phase 3 (P13): apply and correct
 *
 * Pure application logic on top of the Phase 2 calculator and the Phase 1
 * repository. Not yet wired into any route (Phase 4).
 *
 * correctRatingForMatch is the critical piece (R16/R17): it reverses the
 * MOST RECENT history row for the match (never the original — a corrected
 * match can itself be corrected again, and the service worker's sync-queue
 * can replay a queued edit on reconnect), recomputes against each
 * participant's CURRENT rating, and never touches any other match. It does
 * not increment matches_played — that match was already counted when it was
 * first applied.
 */
import type { RatingsRepository, PlayerRating } from '../repositories/ratings-repository'
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

async function getOrSeedRating(
  repo: RatingsRepository,
  playerId: string,
  sport: string,
  format: string
): Promise<{ rating: number; matchesPlayed: number }> {
  const existing = await repo.getFor(playerId, sport, format)
  if (existing) return { rating: existing.rating, matchesPlayed: existing.matchesPlayed }
  return { rating: SEED_DEFAULT, matchesPlayed: 0 }
}

async function requireCurrentRating(
  repo: RatingsRepository,
  playerId: string,
  sport: string,
  format: string,
  matchId: string
): Promise<{ rating: number; matchesPlayed: number }> {
  const existing = await repo.getFor(playerId, sport, format)
  if (!existing) {
    throw new Error(
      `correctRatingForMatch: no current rating for player ${playerId} (${sport}/${format}); match ${matchId} was never applied`
    )
  }
  return existing
}

/** Reverses the most recent history row for this player+match, throwing if none exists. */
async function reverseLastDelta(
  repo: RatingsRepository,
  playerId: string,
  matchId: string,
  currentRating: number
): Promise<number> {
  const last = await repo.findLatestHistoryFor(playerId, matchId)
  if (!last) {
    throw new Error(`correctRatingForMatch: no prior rating history for player ${playerId}, match ${matchId}`)
  }
  return currentRating - last.delta
}

async function settlePlayerRating(
  repo: RatingsRepository,
  playerId: string,
  sport: string,
  format: string,
  baseline: number,
  delta: number,
  matchesPlayed: number,
  matchId: string
): Promise<number> {
  const newRating = applyDelta(baseline, delta)
  await repo.upsert(playerId, sport, format, newRating, matchesPlayed)
  await repo.appendHistory(playerId, sport, format, delta, newRating, matchId)
  return newRating
}

async function applySinglesRating(
  repo: RatingsRepository,
  matchId: string,
  sport: string,
  { player1Id, player2Id, winnerId }: SinglesMatchParticipants
): Promise<void> {
  const format = 'singles'
  const won1 = winnerId === player1Id

  const p1 = await getOrSeedRating(repo, player1Id, sport, format)
  const p2 = await getOrSeedRating(repo, player2Id, sport, format)

  const delta1 = computeDelta(p1.rating, p2.rating, won1, p1.matchesPlayed)
  const delta2 = computeDelta(p2.rating, p1.rating, !won1, p2.matchesPlayed)

  await settlePlayerRating(repo, player1Id, sport, format, p1.rating, delta1, p1.matchesPlayed + 1, matchId)
  await settlePlayerRating(repo, player2Id, sport, format, p2.rating, delta2, p2.matchesPlayed + 1, matchId)

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

  const t1p1 = await getOrSeedRating(repo, t1p1id, sport, format)
  const t1p2 = await getOrSeedRating(repo, t1p2id, sport, format)
  const t2p1 = await getOrSeedRating(repo, t2p1id, sport, format)
  const t2p2 = await getOrSeedRating(repo, t2p2id, sport, format)

  // Team "matches played" for K-decay mirrors how the calculator itself treats
  // team rating — the mean of the two partners.
  const team1MatchesPlayed = (t1p1.matchesPlayed + t1p2.matchesPlayed) / 2
  const team2MatchesPlayed = (t2p1.matchesPlayed + t2p2.matchesPlayed) / 2

  const delta1 = computeTeamDelta([t1p1.rating, t1p2.rating], [t2p1.rating, t2p2.rating], team1Won, team1MatchesPlayed)
  const delta2 = computeTeamDelta([t2p1.rating, t2p2.rating], [t1p1.rating, t1p2.rating], !team1Won, team2MatchesPlayed)

  await settlePlayerRating(repo, t1p1id, sport, format, t1p1.rating, delta1, t1p1.matchesPlayed + 1, matchId)
  await settlePlayerRating(repo, t1p2id, sport, format, t1p2.rating, delta1, t1p2.matchesPlayed + 1, matchId)
  await settlePlayerRating(repo, t2p1id, sport, format, t2p1.rating, delta2, t2p1.matchesPlayed + 1, matchId)
  await settlePlayerRating(repo, t2p2id, sport, format, t2p2.rating, delta2, t2p2.matchesPlayed + 1, matchId)

  log.info('rating.applied', { matchId, sport, format })
}

/**
 * Step 3.1 — apply ratings for a newly scored match. Seeds any participant
 * without an existing (sport, format) row from SEED_DEFAULT, moves each
 * participant, and increments their matches_played.
 */
export async function applyRatingForMatch(
  repo: RatingsRepository,
  matchId: string,
  sport: string,
  participants: MatchParticipants
): Promise<void> {
  if (participants.format === 'singles') {
    await applySinglesRating(repo, matchId, sport, participants)
  } else {
    await applyDoublesRating(repo, matchId, sport, participants)
  }
}

async function correctSinglesRating(
  repo: RatingsRepository,
  matchId: string,
  sport: string,
  { player1Id, player2Id, winnerId }: SinglesMatchParticipants
): Promise<void> {
  const format = 'singles'
  const won1New = winnerId === player1Id

  const cur1 = await requireCurrentRating(repo, player1Id, sport, format, matchId)
  const cur2 = await requireCurrentRating(repo, player2Id, sport, format, matchId)

  const baseline1 = await reverseLastDelta(repo, player1Id, matchId, cur1.rating)
  const baseline2 = await reverseLastDelta(repo, player2Id, matchId, cur2.rating)

  const delta1 = computeDelta(baseline1, baseline2, won1New, cur1.matchesPlayed)
  const delta2 = computeDelta(baseline2, baseline1, !won1New, cur2.matchesPlayed)

  // matches_played is NOT incremented on a correction — the match was already counted.
  await settlePlayerRating(repo, player1Id, sport, format, baseline1, delta1, cur1.matchesPlayed, matchId)
  await settlePlayerRating(repo, player2Id, sport, format, baseline2, delta2, cur2.matchesPlayed, matchId)

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

  const cur_t1p1 = await requireCurrentRating(repo, t1p1id, sport, format, matchId)
  const cur_t1p2 = await requireCurrentRating(repo, t1p2id, sport, format, matchId)
  const cur_t2p1 = await requireCurrentRating(repo, t2p1id, sport, format, matchId)
  const cur_t2p2 = await requireCurrentRating(repo, t2p2id, sport, format, matchId)

  const baseline_t1p1 = await reverseLastDelta(repo, t1p1id, matchId, cur_t1p1.rating)
  const baseline_t1p2 = await reverseLastDelta(repo, t1p2id, matchId, cur_t1p2.rating)
  const baseline_t2p1 = await reverseLastDelta(repo, t2p1id, matchId, cur_t2p1.rating)
  const baseline_t2p2 = await reverseLastDelta(repo, t2p2id, matchId, cur_t2p2.rating)

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

  await settlePlayerRating(repo, t1p1id, sport, format, baseline_t1p1, delta1, cur_t1p1.matchesPlayed, matchId)
  await settlePlayerRating(repo, t1p2id, sport, format, baseline_t1p2, delta1, cur_t1p2.matchesPlayed, matchId)
  await settlePlayerRating(repo, t2p1id, sport, format, baseline_t2p1, delta2, cur_t2p1.matchesPlayed, matchId)
  await settlePlayerRating(repo, t2p2id, sport, format, baseline_t2p2, delta2, cur_t2p2.matchesPlayed, matchId)

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
 * other matches. matches_played is left unchanged.
 */
export async function correctRatingForMatch(
  repo: RatingsRepository,
  matchId: string,
  sport: string,
  previous: MatchParticipants,
  current: MatchParticipants
): Promise<void> {
  if (sameOutcome(previous, current)) return

  if (current.format === 'singles') {
    await correctSinglesRating(repo, matchId, sport, current)
  } else {
    await correctDoublesRating(repo, matchId, sport, current)
  }
}

async function seedAndReplayBucket(
  repo: RatingsRepository,
  playerId: string,
  sport: string,
  format: 'singles' | 'doubles',
  seedValue: number
): Promise<PlayerRating> {
  const existing = await repo.getFor(playerId, sport, format)
  const matchesPlayed = existing ? existing.matchesPlayed : 0

  const history = await repo.findHistoryFor(playerId, sport, format)

  let running = seedValue
  for (const entry of history) {
    running = applyDelta(running, entry.delta)
    await repo.appendHistory(playerId, sport, format, entry.delta, running, entry.matchId)
  }

  await repo.upsert(playerId, sport, format, running, matchesPlayed)

  return (await repo.getFor(playerId, sport, format))!
}

/**
 * Step 5.2 — set a new self-rating seed for a sport and replay this
 * player's existing history for BOTH formats from the new baseline.
 *
 * "Replay" is event-log replay: each recorded delta is re-folded onto the
 * new running rating in `created_at` order (the outcome of each match
 * doesn't change, only what it's added on top of does), and a fresh
 * history row is appended per replayed match so a later correction — which
 * reverses only the LATEST row for a match (R17) — still reverses the
 * right amount.
 *
 * No cascade — only this player's (sport, format) buckets are touched.
 * Opponents keep the deltas they already earned; they are never read or
 * written here. matches_played is carried forward unchanged: this replay
 * doesn't add or remove matches, only re-bases where they started from.
 */
export async function seedRatingForSport(
  repo: RatingsRepository,
  playerId: string,
  sport: string,
  seedValue: number
): Promise<{ singles: PlayerRating; doubles: PlayerRating }> {
  const singles = await seedAndReplayBucket(repo, playerId, sport, 'singles', seedValue)
  const doubles = await seedAndReplayBucket(repo, playerId, sport, 'doubles', seedValue)

  log.info('rating.seeded', { playerId, sport })

  return { singles, doubles }
}
