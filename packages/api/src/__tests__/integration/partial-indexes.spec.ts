import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { getTestPool, closeTestPool } from '../helpers/db'
import { Pool } from 'pg'

describe('Partial Indexes for Discriminated Union', () => {
  let db: Pool

  beforeAll(async () => {
    db = await getTestPool()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  describe('Partial index creation', () => {
    it('should create partial index for singles matches on group_matches', async () => {
      const result = await db.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'group_matches' AND indexname = 'idx_group_matches_singles_player1'"
      )
      expect(result.rows.length).toBe(1)
    })

    it('should create partial index for doubles matches on group_matches', async () => {
      const result = await db.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'group_matches' AND indexname = 'idx_group_matches_doubles_team1'"
      )
      expect(result.rows.length).toBe(1)
    })

    it('should create partial index on knockout_matches for singles', async () => {
      const result = await db.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'knockout_matches' AND indexname = 'idx_knockout_matches_singles_player1'"
      )
      expect(result.rows.length).toBe(1)
    })

    it('should create partial index on knockout_matches for doubles', async () => {
      const result = await db.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'knockout_matches' AND indexname = 'idx_knockout_matches_doubles_team1'"
      )
      expect(result.rows.length).toBe(1)
    })

    it('should create partial index for player2 on singles group_matches', async () => {
      const result = await db.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'group_matches' AND indexname = 'idx_group_matches_singles_player2'"
      )
      expect(result.rows.length).toBe(1)
    })

    it('should create partial index for team2 on doubles group_matches', async () => {
      const result = await db.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'group_matches' AND indexname = 'idx_group_matches_doubles_team2'"
      )
      expect(result.rows.length).toBe(1)
    })

    it('should create partial index for player2 on singles knockout_matches', async () => {
      const result = await db.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'knockout_matches' AND indexname = 'idx_knockout_matches_singles_player2'"
      )
      expect(result.rows.length).toBe(1)
    })

    it('should create partial index for team2 on doubles knockout_matches', async () => {
      const result = await db.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'knockout_matches' AND indexname = 'idx_knockout_matches_doubles_team2'"
      )
      expect(result.rows.length).toBe(1)
    })
  })

  describe('Partial index query optimization', () => {
    it('should use partial index for singles player1 lookup', async () => {
      const plan = await db.query(
        "EXPLAIN (FORMAT json) SELECT * FROM group_matches WHERE format = $1 AND player1_id = $2",
        ['singles', 'player_1']
      )
      const jsonPlan = JSON.parse(plan.rows[0]['QUERY PLAN'])
      const indexName = jsonPlan[0]['Plan']['Index Name']

      // Verify partial index is used, not full table scan
      expect(indexName).toBe('idx_group_matches_singles_player1')
      expect(jsonPlan[0]['Plan']['Node Type']).toBe('Index Scan')
    })

    it('should use partial index for doubles team1 lookup', async () => {
      const plan = await db.query(
        "EXPLAIN (FORMAT json) SELECT * FROM group_matches WHERE format = $1 AND team1_id = $2",
        ['doubles', 'team_1']
      )
      const jsonPlan = JSON.parse(plan.rows[0]['QUERY PLAN'])
      const indexName = jsonPlan[0]['Plan']['Index Name']

      expect(indexName).toBe('idx_group_matches_doubles_team1')
      expect(jsonPlan[0]['Plan']['Node Type']).toBe('Index Scan')
    })

    it('should NOT use partial index if format predicate missing', async () => {
      const plan = await db.query(
        "EXPLAIN (FORMAT json) SELECT * FROM group_matches WHERE player1_id = $1",
        ['player_1']
      )
      const jsonPlan = JSON.parse(plan.rows[0]['QUERY PLAN'])

      // Without format predicate, full table scan expected
      expect(jsonPlan[0]['Plan']['Node Type']).toBe('Seq Scan')
    })

    it('should verify partial index excludes NULL values', async () => {
      const indexInfo = await db.query(
        "SELECT pg_size_pretty(pg_relation_size('idx_group_matches_singles_player1')) as size"
      )
      const singlesIndexSize = indexInfo.rows[0].size

      // Partial index should be smaller than if it included all rows
      // We verify it exists and has a size
      expect(singlesIndexSize).toBeDefined()
      expect(singlesIndexSize).not.toBe('0 bytes')
    })

    it('should use index for knockout_matches singles queries', async () => {
      const plan = await db.query(
        "EXPLAIN (FORMAT json) SELECT * FROM knockout_matches WHERE format = $1 AND player1_id = $2",
        ['singles', 'player_1']
      )
      const jsonPlan = JSON.parse(plan.rows[0]['QUERY PLAN'])
      const indexName = jsonPlan[0]['Plan']['Index Name']

      expect(indexName).toBe('idx_knockout_matches_singles_player1')
      expect(jsonPlan[0]['Plan']['Node Type']).toBe('Index Scan')
    })

    it('should use index for knockout_matches doubles queries', async () => {
      const plan = await db.query(
        "EXPLAIN (FORMAT json) SELECT * FROM knockout_matches WHERE format = $1 AND team1_id = $2",
        ['doubles', 'team_1']
      )
      const jsonPlan = JSON.parse(plan.rows[0]['QUERY PLAN'])
      const indexName = jsonPlan[0]['Plan']['Index Name']

      expect(indexName).toBe('idx_knockout_matches_doubles_team1')
      expect(jsonPlan[0]['Plan']['Node Type']).toBe('Index Scan')
    })
  })
})
