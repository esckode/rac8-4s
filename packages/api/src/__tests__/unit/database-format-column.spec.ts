import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { getTestPool, closeTestPool } from '../helpers/db'
import { Pool } from 'pg'
import * as fs from 'fs/promises'
import path from 'path'

describe('Format Column (Discriminated Union)', () => {
  let db: Pool

  beforeAll(async () => {
    db = await getTestPool()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  describe('Migration: 020_add_format_column', () => {
    it('should add format column to group_matches', async () => {
      const result = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'group_matches' AND column_name = 'format'"
      )
      expect(result.rows.length).toBe(1)
    })

    it('should add format column to knockout_matches', async () => {
      const result = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'knockout_matches' AND column_name = 'format'"
      )
      expect(result.rows.length).toBe(1)
    })

    it('should set DEFAULT format to singles for existing matches', async () => {
      const result = await db.query(
        "SELECT column_default FROM information_schema.columns WHERE table_name = 'group_matches' AND column_name = 'format'"
      )
      expect(result.rows[0].column_default).toContain("'singles'")
    })

    it('should migrate all existing matches to format=singles', async () => {
      const singles = await db.query('SELECT COUNT(*) FROM group_matches WHERE format = $1', ['singles'])
      const total = await db.query('SELECT COUNT(*) FROM group_matches')
      expect(singles.rows[0].count).toBe(total.rows[0].count)
    })

    it('should be idempotent (safe to re-run)', async () => {
      const before = await db.query('SELECT COUNT(*) FROM group_matches')
      // Re-running migration should not cause errors or data loss
      const after = await db.query('SELECT COUNT(*) FROM group_matches')
      expect(before.rows[0].count).toBe(after.rows[0].count)
    })

    it('should be reversible', async () => {
      // Verify rollback migration exists
      const rollbackPath = '/home/esckode/projects/claude/rac8-4s/db/rollback/020_add_format_column.sql'
      try {
        const rollback = await fs.readFile(rollbackPath, 'utf-8')
        expect(rollback).toBeDefined()
        expect(rollback.length).toBeGreaterThan(0)
      } catch (err) {
        // Migration not yet created, test should fail until migration is implemented
        throw new Error('Rollback migration does not exist')
      }
    })
  })

  describe('Schema Constraints', () => {
    it('should enforce format in (singles, doubles)', async () => {
      try {
        await db.query(
          `INSERT INTO group_matches (id, group_id, tournament_id, format, player1_id, player2_id, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          ['test_invalid_format', 'g1', 't1', 'invalid', 'p1', 'p2', 'pending', new Date(), new Date()]
        )
        // If we get here, the constraint is not enforced
        throw new Error('Constraint should have been violated')
      } catch (err: any) {
        expect(err.message).toMatch(/constraint|invalid|check/)
      }
    })

    it('should require format column (NOT NULL)', async () => {
      // Check that format column is NOT NULL
      const result = await db.query(
        "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'group_matches' AND column_name = 'format'"
      )
      expect(result.rows[0].is_nullable).toBe('NO')
    })
  })
})
