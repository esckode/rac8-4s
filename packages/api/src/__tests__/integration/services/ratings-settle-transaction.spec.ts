/**
 * P13 Phase 12 — batched transactional settle (R29).
 *
 * Closes ISSUE-47 (a doubles settle was 8+ autocommitted statements, so a
 * failure partway left two of four players moved) and ISSUE-48 (the
 * read-modify-write took no lock, so two overlapping settles for the same
 * player could silently lose one delta).
 *
 * applyRatingForMatch/correctRatingForMatch now open their own transaction
 * (separate from the score write — CLAUDE.md §7, design §3b) and lock every
 * participant's row with one `SELECT ... FOR UPDATE`, sorted by player id.
 *
 * ⚠ Genuine lock contention needs two truly overlapping transactions, which
 * the per-suite harness cannot produce — it serializes every statement onto
 * one physical connection (helpers/db.ts). partner-confirm-atomicity.spec.ts
 * (ISSUE-18) hit the same wall and documented the resolution: prove the
 * locking mechanism directly (statement shape, sorted ids) rather than
 * simulate real concurrency. This file does the same.
 */
import { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { RatingsRepository } from '../../../repositories/ratings-repository'
import { applyRatingForMatch, correctRatingForMatch, type MatchParticipants } from '../../../services/ratings-service'

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

describe('P13 Phase 12 — batched transactional settle', () => {
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

  async function fourDoublesPlayers() {
    const ids = [uniquePlayerId(), uniquePlayerId(), uniquePlayerId(), uniquePlayerId()]
    for (const id of ids) await createTestPlayer(client, id)
    return ids as [string, string, string, string]
  }

  it('locks with FOR UPDATE, sorted by player id (ISSUE-48 deadlock avoidance)', async () => {
    const [t1p1, t1p2, t2p1, t2p2] = await fourDoublesPlayers()
    const matchId = uniqueMatchId()
    const participants: MatchParticipants = {
      format: 'doubles',
      team1: [t1p2, t1p1], // deliberately unsorted input
      team2: [t2p2, t2p1],
      winningTeam: 'team1',
    }

    const conn = await pool.connect()
    const querySpy = jest.spyOn(conn, 'query')
    try {
      await applyRatingForMatch(pool, matchId, SPORT, participants)
    } finally {
      const lockCall = querySpy.mock.calls.find(
        ([text]) => typeof text === 'string' && /FOR UPDATE/i.test(text)
      )
      querySpy.mockRestore()

      expect(lockCall).toBeDefined()
      const idsParam = (lockCall![1] as unknown[])[0] as string[]
      expect(idsParam).toEqual([...idsParam].sort())
    }
  })

  it('batches a doubles apply into ~4 data statements instead of 14', async () => {
    const [t1p1, t1p2, t2p1, t2p2] = await fourDoublesPlayers()
    const matchId = uniqueMatchId()
    const participants: MatchParticipants = {
      format: 'doubles',
      team1: [t1p1, t1p2],
      team2: [t2p1, t2p2],
      winningTeam: 'team1',
    }

    const conn = await pool.connect()
    const querySpy = jest.spyOn(conn, 'query')
    try {
      await applyRatingForMatch(pool, matchId, SPORT, participants)
    } finally {
      const dataStatements = querySpy.mock.calls.filter(([text]) => {
        if (typeof text !== 'string') return false
        const norm = text.trim().toUpperCase()
        return norm !== 'BEGIN' && norm !== 'COMMIT' && norm !== 'ROLLBACK'
      })
      querySpy.mockRestore()

      // 1 seed insert (ON CONFLICT DO NOTHING, Task 14.1/ISSUE-48) + 1 locked
      // select + 1 upsert + 1 history insert.
      expect(dataStatements.length).toBeLessThanOrEqual(4)
    }
  })

  it('seeds every unseeded participant before locking, so a first-match settle locks all four (Task 14.1, ISSUE-48)', async () => {
    const [t1p1, t1p2, t2p1, t2p2] = await fourDoublesPlayers()
    const matchId = uniqueMatchId()
    const participants: MatchParticipants = {
      format: 'doubles',
      team1: [t1p2, t1p1], // deliberately unsorted input
      team2: [t2p2, t2p1],
      winningTeam: 'team1',
    }

    const conn = await pool.connect()
    const querySpy = jest.spyOn(conn, 'query')
    try {
      await applyRatingForMatch(pool, matchId, SPORT, participants)
    } finally {
      const seedIndex = querySpy.mock.calls.findIndex(
        ([text]) => typeof text === 'string' && /INSERT INTO public\.player_ratings/i.test(text) && /DO NOTHING/i.test(text)
      )
      const lockIndex = querySpy.mock.calls.findIndex(
        ([text]) => typeof text === 'string' && /FOR UPDATE/i.test(text)
      )
      querySpy.mockRestore()

      expect(seedIndex).toBeGreaterThanOrEqual(0)
      expect(lockIndex).toBeGreaterThan(seedIndex)
    }

    // Proxy for "the FOR UPDATE actually locked something, not just queried an
    // empty result": every participant now has a row, seeded then moved once.
    for (const id of [t1p1, t1p2, t2p1, t2p2]) {
      const row = await repo.getFor(id, SPORT, 'doubles')
      expect(row).toBeDefined()
      expect(row!.matchesPlayed).toBe(1)
    }
  })

  it('a settle that throws partway leaves no partial movement (ISSUE-47)', async () => {
    const [t1p1, t1p2, t2p1, t2p2] = await fourDoublesPlayers()
    const matchId = uniqueMatchId()
    const participants: MatchParticipants = {
      format: 'doubles',
      team1: [t1p1, t1p2],
      team2: [t2p1, t2p2],
      winningTeam: 'team1',
    }

    const failure = jest
      .spyOn(RatingsRepository.prototype, 'appendHistoryMany')
      .mockRejectedValueOnce(new Error('boom mid-settle'))

    try {
      await expect(applyRatingForMatch(pool, matchId, SPORT, participants)).rejects.toThrow('boom mid-settle')
    } finally {
      failure.mockRestore()
    }

    // The upsert that ran before the throw must have rolled back too — not
    // just the statement that failed. Today's bug (pre-Phase-12) would leave
    // all four players' player_ratings rows written here.
    for (const id of [t1p1, t1p2, t2p1, t2p2]) {
      expect(await repo.getFor(id, SPORT, 'doubles')).toBeUndefined()
    }
  })

  it("a settle that throws after the seed insert leaves no seed rows behind (Task 14.1 — ISSUE-47's guarantee extended to the new statement)", async () => {
    const [t1p1, t1p2, t2p1, t2p2] = await fourDoublesPlayers()
    const matchId = uniqueMatchId()
    const participants: MatchParticipants = {
      format: 'doubles',
      team1: [t1p1, t1p2],
      team2: [t2p1, t2p2],
      winningTeam: 'team1',
    }

    // Fail a statement that runs after the seed insert but before commit —
    // the seed row it just wrote must roll back with everything else.
    const failure = jest
      .spyOn(RatingsRepository.prototype, 'upsertMany')
      .mockRejectedValueOnce(new Error('boom after seed'))

    try {
      await expect(applyRatingForMatch(pool, matchId, SPORT, participants)).rejects.toThrow('boom after seed')
    } finally {
      failure.mockRestore()
    }

    for (const id of [t1p1, t1p2, t2p1, t2p2]) {
      expect(await repo.getFor(id, SPORT, 'doubles')).toBeUndefined()
    }
  })

  it('singles with one already-seeded and one unseeded participant locks both (Task 14.1)', async () => {
    const p1 = uniquePlayerId()
    const p2 = uniquePlayerId()
    await createTestPlayer(client, p1)
    await createTestPlayer(client, p2)

    // p1 already has a rating row from an earlier match; p2 has none yet.
    await repo.upsert(p1, SPORT, 'singles', 300, 3)

    const matchId = uniqueMatchId()
    const participants: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p2 }

    await applyRatingForMatch(pool, matchId, SPORT, participants)

    const after1 = await repo.getFor(p1, SPORT, 'singles')
    const after2 = await repo.getFor(p2, SPORT, 'singles')
    expect(after1?.matchesPlayed).toBe(4)
    expect(after2?.matchesPlayed).toBe(1)
    // p1 moved from its real 300 baseline, not from SEED_DEFAULT — the seed
    // insert's ON CONFLICT DO NOTHING must not have clobbered the existing row.
    expect(after1!.rating).toBeLessThan(300)
  })

  it('a correction that throws partway leaves no partial movement', async () => {
    const p1 = uniquePlayerId()
    const p2 = uniquePlayerId()
    await createTestPlayer(client, p1)
    await createTestPlayer(client, p2)
    const matchId = uniqueMatchId()

    const applied: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p1 }
    await applyRatingForMatch(pool, matchId, SPORT, applied)
    const beforeP1 = await repo.getFor(p1, SPORT, 'singles')
    const beforeP2 = await repo.getFor(p2, SPORT, 'singles')

    const flipped: MatchParticipants = { format: 'singles', player1Id: p1, player2Id: p2, winnerId: p2 }
    const failure = jest
      .spyOn(RatingsRepository.prototype, 'appendHistoryMany')
      .mockRejectedValueOnce(new Error('boom mid-correction'))

    try {
      await expect(
        correctRatingForMatch(pool, matchId, SPORT, applied, flipped)
      ).rejects.toThrow('boom mid-correction')
    } finally {
      failure.mockRestore()
    }

    const afterP1 = await repo.getFor(p1, SPORT, 'singles')
    const afterP2 = await repo.getFor(p2, SPORT, 'singles')
    expect(afterP1?.rating).toBe(beforeP1?.rating)
    expect(afterP2?.rating).toBe(beforeP2?.rating)
  })

  it('two applies for the same player across different matches both count — no lost update', async () => {
    // Not genuine concurrency (see file header) — this is a regression guard
    // that the batched multi-row write still lands both deltas when a
    // player appears in two settles. Real lock contention is proven above
    // by the FOR UPDATE + sorted-id assertion, which is what prevents the
    // lost-update race under real overlapping transactions.
    const shared = uniquePlayerId()
    const opponentA = uniquePlayerId()
    const opponentB = uniquePlayerId()
    await createTestPlayer(client, shared)
    await createTestPlayer(client, opponentA)
    await createTestPlayer(client, opponentB)

    await applyRatingForMatch(pool, uniqueMatchId(), SPORT, {
      format: 'singles',
      player1Id: shared,
      player2Id: opponentA,
      winnerId: shared,
    })
    const afterFirst = await repo.getFor(shared, SPORT, 'singles')

    await applyRatingForMatch(pool, uniqueMatchId(), SPORT, {
      format: 'singles',
      player1Id: shared,
      player2Id: opponentB,
      winnerId: opponentB,
    })
    const afterSecond = await repo.getFor(shared, SPORT, 'singles')

    expect(afterSecond?.matchesPlayed).toBe(2)
    // Second delta was computed from the first result, not a stale baseline —
    // it moved further from the first settle's rating, not back to SEED_DEFAULT.
    expect(afterSecond?.rating).not.toBe(afterFirst?.rating)
    const history = await repo.findHistoryFor(shared, SPORT, 'singles')
    expect(history).toHaveLength(2)
  })
})
