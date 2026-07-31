import { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { RatingsRepository } from '../../../repositories/ratings-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniquePlayerId(): string {
  return `player_${uid()}`
}

async function createTestPlayer(client: PoolClient, playerId: string): Promise<string> {
  const res = await client.query(
    `INSERT INTO public.players (id, email, name) VALUES ($1, $2, $3) RETURNING id`,
    [playerId, `${playerId}@test.local`, playerId]
  )
  return res.rows[0].id
}

describe('RatingsRepository', () => {
  let pool: Pool
  let client: PoolClient
  let repo: RatingsRepository
  let testPlayerId: string
  let testPlayerId2: string

  beforeAll(async () => {
    pool = await getTestPool()
    client = await beginTransaction(pool)
    repo = new RatingsRepository(client)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  beforeEach(async () => {
    testPlayerId = uniquePlayerId()
    testPlayerId2 = uniquePlayerId()
    await createTestPlayer(client, testPlayerId)
    await createTestPlayer(client, testPlayerId2)
  })

  describe('getFor', () => {
    it('returns rating when it exists', async () => {
      await repo.upsert(testPlayerId, 'racquetball', 'singles', 250, 5)
      const rating = await repo.getFor(testPlayerId, 'racquetball', 'singles')

      expect(rating).toBeDefined()
      expect(rating?.rating).toBe(250)
      expect(rating?.matchesPlayed).toBe(5)
    })

    it('returns undefined when rating does not exist', async () => {
      const rating = await repo.getFor(testPlayerId, 'racquetball', 'singles')

      expect(rating).toBeUndefined()
    })
  })

  describe('getAllFor', () => {
    it('returns all ratings for a player', async () => {
      await repo.upsert(testPlayerId, 'racquetball', 'singles', 250, 5)
      await repo.upsert(testPlayerId, 'racquetball', 'doubles', 280, 3)
      await repo.upsert(testPlayerId, 'squash', 'singles', 300, 2)

      const allRatings = await repo.getAllFor(testPlayerId)

      expect(allRatings).toHaveLength(3)
      expect(allRatings.map((r) => r.sport).sort()).toEqual(['racquetball', 'racquetball', 'squash'])
      expect(allRatings.map((r) => r.format).sort()).toEqual(['doubles', 'singles', 'singles'])
    })

    it('returns empty array when player has no ratings', async () => {
      const allRatings = await repo.getAllFor(testPlayerId)

      expect(allRatings).toEqual([])
    })
  })

  describe('upsert', () => {
    it('creates a new rating', async () => {
      await repo.upsert(testPlayerId, 'racquetball', 'singles', 250, 5)

      const rating = await repo.getFor(testPlayerId, 'racquetball', 'singles')
      expect(rating?.rating).toBe(250)
      expect(rating?.matchesPlayed).toBe(5)
    })

    it('updates an existing rating', async () => {
      await repo.upsert(testPlayerId, 'racquetball', 'singles', 250, 5)
      await repo.upsert(testPlayerId, 'racquetball', 'singles', 260, 6)

      const rating = await repo.getFor(testPlayerId, 'racquetball', 'singles')
      expect(rating?.rating).toBe(260)
      expect(rating?.matchesPlayed).toBe(6)
    })

    it('sets updated_at to current time', async () => {
      const before = new Date(Date.now() - 1000) // 1 second buffer
      await repo.upsert(testPlayerId, 'racquetball', 'singles', 250, 5)
      const after = new Date(Date.now() + 1000) // 1 second buffer

      const rating = await repo.getFor(testPlayerId, 'racquetball', 'singles')
      const updatedAt = new Date(rating!.updatedAt)

      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  describe('appendHistory', () => {
    it('appends a history entry', async () => {
      const matchId = `match_${uid()}`
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', 15, 265, matchId)

      const history = await repo.findHistoryFor(testPlayerId, 'racquetball', 'singles')
      expect(history).toHaveLength(1)
      expect(history[0].delta).toBe(15)
      expect(history[0].ratingAfter).toBe(265)
      expect(history[0].matchId).toBe(matchId)
    })

    it('allows multiple history entries for same player/sport/format', async () => {
      const matchId1 = `match_${uid()}`
      const matchId2 = `match_${uid()}`
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', 15, 265, matchId1)
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', -5, 260, matchId2)

      const history = await repo.findHistoryFor(testPlayerId, 'racquetball', 'singles')
      expect(history).toHaveLength(2)
    })
  })

  describe('findLatestHistoryFor', () => {
    it('returns the most recent row for a match', async () => {
      const matchId = `match_${uid()}`
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', 15, 265, matchId)
      // R17: correction logic writes a second row for the same match
      // Delay to ensure different timestamps (database may have coarse timestamp granularity)
      await new Promise((r) => setTimeout(r, 100))
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', -3, 262, matchId)

      const latest = await repo.findLatestHistoryFor(testPlayerId, matchId)

      expect(latest).toBeDefined()
      expect(latest?.delta).toBe(-3)
      expect(latest?.ratingAfter).toBe(262)
    })

    it('returns undefined if no history exists for that match', async () => {
      const latest = await repo.findLatestHistoryFor(testPlayerId, 'nonexistent_match')

      expect(latest).toBeUndefined()
    })

    it('only returns rows for the specified player', async () => {
      const matchId = `match_${uid()}`
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', 15, 265, matchId)
      await repo.appendHistory(testPlayerId2, 'racquetball', 'singles', 12, 282, matchId)

      const latest1 = await repo.findLatestHistoryFor(testPlayerId, matchId)
      const latest2 = await repo.findLatestHistoryFor(testPlayerId2, matchId)

      expect(latest1?.ratingAfter).toBe(265)
      expect(latest2?.ratingAfter).toBe(282)
    })
  })

  describe('findHistoryFor', () => {
    it('returns history ordered by created_at ASC (for replay)', async () => {
      const matchId1 = `match_${uid()}`
      const matchId2 = `match_${uid()}`
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', 15, 265, matchId1)
      // Delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 100))
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', -5, 260, matchId2)

      const history = await repo.findHistoryFor(testPlayerId, 'racquetball', 'singles')

      expect(history).toHaveLength(2)
      expect(history[0].ratingAfter).toBe(265) // First entry
      expect(history[1].ratingAfter).toBe(260) // Second entry
    })

    it('returns empty array when no history exists', async () => {
      const history = await repo.findHistoryFor(testPlayerId, 'racquetball', 'singles')

      expect(history).toEqual([])
    })

    it('filters by sport and format', async () => {
      const matchId1 = `match_${uid()}`
      const matchId2 = `match_${uid()}`
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', 15, 265, matchId1)
      await repo.appendHistory(testPlayerId, 'squash', 'singles', 20, 290, matchId2)

      const rqHistory = await repo.findHistoryFor(testPlayerId, 'racquetball', 'singles')
      const squashHistory = await repo.findHistoryFor(testPlayerId, 'squash', 'singles')

      expect(rqHistory).toHaveLength(1)
      expect(rqHistory[0].ratingAfter).toBe(265)
      expect(squashHistory).toHaveLength(1)
      expect(squashHistory[0].ratingAfter).toBe(290)
    })
  })

  describe('deleteFor', () => {
    it('deletes ratings from both tables', async () => {
      const matchId = `match_${uid()}`
      await repo.upsert(testPlayerId, 'racquetball', 'singles', 250, 5)
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', 15, 265, matchId)

      await repo.deleteFor(testPlayerId)

      const rating = await repo.getFor(testPlayerId, 'racquetball', 'singles')
      const history = await repo.findHistoryFor(testPlayerId, 'racquetball', 'singles')

      expect(rating).toBeUndefined()
      expect(history).toEqual([])
    })

    it('is idempotent — no error if player has no ratings', async () => {
      await expect(repo.deleteFor(testPlayerId)).resolves.not.toThrow()
    })

    it('does not delete other players', async () => {
      const matchId = `match_${uid()}`
      await repo.upsert(testPlayerId, 'racquetball', 'singles', 250, 5)
      await repo.upsert(testPlayerId2, 'racquetball', 'singles', 280, 3)
      await repo.appendHistory(testPlayerId, 'racquetball', 'singles', 15, 265, matchId)
      await repo.appendHistory(testPlayerId2, 'racquetball', 'singles', 12, 292, matchId)

      await repo.deleteFor(testPlayerId)

      const rating1 = await repo.getFor(testPlayerId, 'racquetball', 'singles')
      const rating2 = await repo.getFor(testPlayerId2, 'racquetball', 'singles')
      const history2 = await repo.findHistoryFor(testPlayerId2, 'racquetball', 'singles')

      expect(rating1).toBeUndefined()
      expect(rating2).toBeDefined()
      expect(history2).toHaveLength(1)
    })
  })
})
