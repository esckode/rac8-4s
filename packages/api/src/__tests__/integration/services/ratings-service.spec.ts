import { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { RatingsRepository } from '../../../repositories/ratings-repository'
import { applyRatingForMatch, correctRatingForMatch, type MatchParticipants } from '../../../services/ratings-service'
import { SEED_DEFAULT } from '../../../services/ratings-constants'
import { computeDelta, computeTeamDelta, applyDelta } from '../../../services/ratings-calculator'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniquePlayerId(): string {
  return `player_${uid()}`
}

function uniqueMatchId(): string {
  return `match_${uid()}`
}

async function createTestPlayer(client: PoolClient, playerId: string): Promise<string> {
  const res = await client.query(
    `INSERT INTO public.players (id, email, name) VALUES ($1, $2, $3) RETURNING id`,
    [playerId, `${playerId}@test.local`, playerId]
  )
  return res.rows[0].id
}

const SPORT = 'racquetball'

describe('ratings-service', () => {
  let pool: Pool
  let client: PoolClient
  let repo: RatingsRepository

  beforeAll(async () => {
    pool = await getTestPool()
    client = await beginTransaction(pool)
    repo = new RatingsRepository(client)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('applyRatingForMatch — singles', () => {
    it('moves both players in opposite directions and seeds fresh players from SEED_DEFAULT', async () => {
      const p1 = uniquePlayerId()
      const p2 = uniquePlayerId()
      await createTestPlayer(client, p1)
      await createTestPlayer(client, p2)
      const matchId = uniqueMatchId()

      const participants: MatchParticipants = {
        format: 'singles',
        player1Id: p1,
        player2Id: p2,
        winnerId: p1,
      }
      await applyRatingForMatch(repo, matchId, SPORT, participants)

      const r1 = await repo.getFor(p1, SPORT, 'singles')
      const r2 = await repo.getFor(p2, SPORT, 'singles')

      // Both players were unseeded, so the calculation starts from SEED_DEFAULT.
      const expectedDelta1 = computeDelta(SEED_DEFAULT, SEED_DEFAULT, true, 0)
      const expectedDelta2 = computeDelta(SEED_DEFAULT, SEED_DEFAULT, false, 0)
      const expectedRating1 = applyDelta(SEED_DEFAULT, expectedDelta1)
      const expectedRating2 = applyDelta(SEED_DEFAULT, expectedDelta2)

      expect(r1?.rating).toBeCloseTo(expectedRating1, 6)
      expect(r2?.rating).toBeCloseTo(expectedRating2, 6)
      // Winner moves up, loser moves down — opposite directions.
      expect(r1!.rating).toBeGreaterThan(SEED_DEFAULT)
      expect(r2!.rating).toBeLessThan(SEED_DEFAULT)
      expect(r1?.matchesPlayed).toBe(1)
      expect(r2?.matchesPlayed).toBe(1)

      const h1 = await repo.findHistoryFor(p1, SPORT, 'singles')
      const h2 = await repo.findHistoryFor(p2, SPORT, 'singles')
      expect(h1).toHaveLength(1)
      expect(h2).toHaveLength(1)
      expect(h1[0].matchId).toBe(matchId)
      expect(h2[0].matchId).toBe(matchId)
      expect(h1[0].delta).toBeCloseTo(expectedDelta1, 6)
      expect(h2[0].delta).toBeCloseTo(expectedDelta2, 6)
    })
  })

  describe('applyRatingForMatch — doubles', () => {
    it('moves all four players, both partners on a team by the same delta', async () => {
      const t1p1 = uniquePlayerId()
      const t1p2 = uniquePlayerId()
      const t2p1 = uniquePlayerId()
      const t2p2 = uniquePlayerId()
      await createTestPlayer(client, t1p1)
      await createTestPlayer(client, t1p2)
      await createTestPlayer(client, t2p1)
      await createTestPlayer(client, t2p2)
      const matchId = uniqueMatchId()

      const participants: MatchParticipants = {
        format: 'doubles',
        team1: [t1p1, t1p2],
        team2: [t2p1, t2p2],
        winningTeam: 'team1',
      }
      await applyRatingForMatch(repo, matchId, SPORT, participants)

      const r1a = await repo.getFor(t1p1, SPORT, 'doubles')
      const r1b = await repo.getFor(t1p2, SPORT, 'doubles')
      const r2a = await repo.getFor(t2p1, SPORT, 'doubles')
      const r2b = await repo.getFor(t2p2, SPORT, 'doubles')

      // Both partners on a team move by the exact same delta (R10).
      expect(r1a?.rating).toBe(r1b?.rating)
      expect(r2a?.rating).toBe(r2b?.rating)
      expect(r1a!.rating).toBeGreaterThan(SEED_DEFAULT)
      expect(r2a!.rating).toBeLessThan(SEED_DEFAULT)

      const expectedDelta1 = computeTeamDelta([SEED_DEFAULT, SEED_DEFAULT], [SEED_DEFAULT, SEED_DEFAULT], true, 0)
      const expectedRating1 = applyDelta(SEED_DEFAULT, expectedDelta1)
      expect(r1a?.rating).toBeCloseTo(expectedRating1, 6)

      expect(r1a?.matchesPlayed).toBe(1)
      expect(r1b?.matchesPlayed).toBe(1)
      expect(r2a?.matchesPlayed).toBe(1)
      expect(r2b?.matchesPlayed).toBe(1)

      for (const pid of [t1p1, t1p2, t2p1, t2p2]) {
        const h = await repo.findHistoryFor(pid, SPORT, 'doubles')
        expect(h).toHaveLength(1)
        expect(h[0].matchId).toBe(matchId)
      }
    })
  })

  describe('correctRatingForMatch', () => {
    async function applySinglesMatch(p1: string, p2: string, matchId: string, winnerId: string) {
      const participants: MatchParticipants = {
        format: 'singles',
        player1Id: p1,
        player2Id: p2,
        winnerId,
      }
      await applyRatingForMatch(repo, matchId, SPORT, participants)
    }

    it('writes no history row and does not change ratings when the score is unchanged (no-op short-circuit)', async () => {
      const p1 = uniquePlayerId()
      const p2 = uniquePlayerId()
      await createTestPlayer(client, p1)
      await createTestPlayer(client, p2)
      const matchId = uniqueMatchId()
      await applySinglesMatch(p1, p2, matchId, p1)

      const before1 = await repo.getFor(p1, SPORT, 'singles')
      const before2 = await repo.getFor(p2, SPORT, 'singles')

      const unchanged: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p1 }
      await correctRatingForMatch(repo, matchId, SPORT, unchanged, unchanged)

      const after1 = await repo.getFor(p1, SPORT, 'singles')
      const after2 = await repo.getFor(p2, SPORT, 'singles')
      expect(after1?.rating).toBe(before1?.rating)
      expect(after2?.rating).toBe(before2?.rating)
      expect(after1?.matchesPlayed).toBe(before1?.matchesPlayed)

      const h1 = await repo.findHistoryFor(p1, SPORT, 'singles')
      const h2 = await repo.findHistoryFor(p2, SPORT, 'singles')
      expect(h1).toHaveLength(1)
      expect(h2).toHaveLength(1)
    })

    it('reverses the original direction when a correction flips the winner', async () => {
      const p1 = uniquePlayerId()
      const p2 = uniquePlayerId()
      await createTestPlayer(client, p1)
      await createTestPlayer(client, p2)
      const matchId = uniqueMatchId()
      await applySinglesMatch(p1, p2, matchId, p1)

      const afterApply1 = await repo.getFor(p1, SPORT, 'singles')
      const afterApply2 = await repo.getFor(p2, SPORT, 'singles')
      expect(afterApply1!.rating).toBeGreaterThan(SEED_DEFAULT) // p1 won
      expect(afterApply2!.rating).toBeLessThan(SEED_DEFAULT) // p2 lost

      const previous: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p1 }
      const flipped: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p2 }
      await correctRatingForMatch(repo, matchId, SPORT, previous, flipped)

      const afterCorrect1 = await repo.getFor(p1, SPORT, 'singles')
      const afterCorrect2 = await repo.getFor(p2, SPORT, 'singles')

      // This was their only match — flipping the winner should now show p1 as the
      // loser and p2 as the winner relative to the shared baseline.
      expect(afterCorrect1!.rating).toBeLessThan(SEED_DEFAULT)
      expect(afterCorrect2!.rating).toBeGreaterThan(SEED_DEFAULT)
      expect(afterCorrect1!.rating).toBeLessThan(afterApply1!.rating)
      expect(afterCorrect2!.rating).toBeGreaterThan(afterApply2!.rating)
    })

    it('does not increment matches_played on a correction', async () => {
      const p1 = uniquePlayerId()
      const p2 = uniquePlayerId()
      await createTestPlayer(client, p1)
      await createTestPlayer(client, p2)
      const matchId = uniqueMatchId()
      await applySinglesMatch(p1, p2, matchId, p1)

      const beforeCorrect = await repo.getFor(p1, SPORT, 'singles')
      expect(beforeCorrect?.matchesPlayed).toBe(1)

      const previous: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p1 }
      const flipped: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p2 }
      await correctRatingForMatch(repo, matchId, SPORT, previous, flipped)

      const afterCorrect = await repo.getFor(p1, SPORT, 'singles')
      expect(afterCorrect?.matchesPlayed).toBe(1)
    })

    it('appends history rather than mutating — both rows exist for the match after a correction', async () => {
      const p1 = uniquePlayerId()
      const p2 = uniquePlayerId()
      await createTestPlayer(client, p1)
      await createTestPlayer(client, p2)
      const matchId = uniqueMatchId()
      await applySinglesMatch(p1, p2, matchId, p1)

      const previous: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p1 }
      const flipped: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p2 }
      await correctRatingForMatch(repo, matchId, SPORT, previous, flipped)

      const h1 = await repo.findHistoryFor(p1, SPORT, 'singles')
      expect(h1).toHaveLength(2)
      expect(h1[0].matchId).toBe(matchId)
      expect(h1[1].matchId).toBe(matchId)
      expect(h1[0].delta).toBeGreaterThan(0) // original: p1 won
      expect(h1[1].delta).toBeLessThan(0) // corrected: p1 lost

      const latest = await repo.findLatestHistoryFor(p1, matchId)
      expect(latest?.delta).toBe(h1[1].delta)
    })

    it('is idempotent — applying the same correction twice leaves the rating unchanged after the first (R17)', async () => {
      const p1 = uniquePlayerId()
      const p2 = uniquePlayerId()
      await createTestPlayer(client, p1)
      await createTestPlayer(client, p2)
      const matchId = uniqueMatchId()
      await applySinglesMatch(p1, p2, matchId, p1)

      const previous: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p1 }
      const flipped: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p2 }
      await correctRatingForMatch(repo, matchId, SPORT, previous, flipped)

      const afterFirst1 = await repo.getFor(p1, SPORT, 'singles')
      const afterFirst2 = await repo.getFor(p2, SPORT, 'singles')
      const historyLenAfterFirst = (await repo.findHistoryFor(p1, SPORT, 'singles')).length

      // A replayed correction (e.g. the service worker's sync-queue retry on
      // reconnect): the "previous" state now really is the flipped winner, and
      // the requested "current" state is the same flipped winner — a no-op.
      await correctRatingForMatch(repo, matchId, SPORT, flipped, flipped)

      const afterSecond1 = await repo.getFor(p1, SPORT, 'singles')
      const afterSecond2 = await repo.getFor(p2, SPORT, 'singles')
      const historyLenAfterSecond = (await repo.findHistoryFor(p1, SPORT, 'singles')).length

      expect(afterSecond1?.rating).toBe(afterFirst1?.rating)
      expect(afterSecond2?.rating).toBe(afterFirst2?.rating)
      expect(afterSecond1?.matchesPlayed).toBe(afterFirst1?.matchesPlayed)
      expect(historyLenAfterSecond).toBe(historyLenAfterFirst)
    })

    it('does not cascade — correcting one match leaves a different match of the same player untouched', async () => {
      const p1 = uniquePlayerId()
      const p2 = uniquePlayerId()
      const p3 = uniquePlayerId()
      await createTestPlayer(client, p1)
      await createTestPlayer(client, p2)
      await createTestPlayer(client, p3)

      const matchId1 = uniqueMatchId()
      const matchId2 = uniqueMatchId()
      await applySinglesMatch(p1, p2, matchId1, p1) // p1 beats p2
      await applySinglesMatch(p1, p3, matchId2, p3) // p1 loses to p3

      const p3RatingBefore = await repo.getFor(p3, SPORT, 'singles')
      const p1HistoryForMatch2Before = await repo.findLatestHistoryFor(p1, matchId2)

      const previous: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p1 }
      const flipped: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p2 }
      await correctRatingForMatch(repo, matchId1, SPORT, previous, flipped)

      const p3RatingAfter = await repo.getFor(p3, SPORT, 'singles')
      const p1HistoryForMatch2After = await repo.findLatestHistoryFor(p1, matchId2)

      expect(p3RatingAfter?.rating).toBe(p3RatingBefore?.rating)
      expect(p1HistoryForMatch2After?.delta).toBe(p1HistoryForMatch2Before?.delta)

      const h2 = await repo.findHistoryFor(p1, SPORT, 'singles')
      // Only match1's rows should have doubled up; match2 keeps exactly one row.
      expect(h2.filter((row) => row.matchId === matchId2)).toHaveLength(1)
      expect(h2.filter((row) => row.matchId === matchId1)).toHaveLength(2)
    })
  })
})
