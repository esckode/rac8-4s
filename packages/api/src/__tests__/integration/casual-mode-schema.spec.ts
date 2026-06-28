/**
 * G4.1 — Schema: mode / visibility / group_id / abandoned + nullable deadlines
 *
 * RED tests (TDD): written FIRST; will fail until:
 *   1. Migration 044 is applied (adds mode, visibility, group_id columns; status CHECK
 *      widened to include 'abandoned'; deadline columns made nullable).
 *   2. listPublic() in TournamentRepository adds AND visibility = 'public' filter.
 *
 * Suites:
 *   A. Migration: new columns exist with correct defaults and constraints
 *   B. Browse filter: GET /tournaments/public hides unlisted tournaments
 *   C. Direct fetch: unlisted tournaments are still accessible by ID
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { TournamentFactory, OrganizerFactory } from '../factories'
import { TournamentRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('G4.1 casual-mode schema (migration 044)', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore
  let organizerId: string
  let accessToken: string

  beforeAll(async () => {
    pool = await getTestPool()
    const deps = createTestApp(pool) as any
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
    const org = OrganizerFactory.token(jwtConfig)
    organizerId = org.sub
    accessToken = org.accessToken
  })

  beforeEach(async () => {
    await beginTransaction(pool)
  })

  afterEach(async () => {
    await rollbackTransaction()
  })

  // ── Suite A: Migration columns ────────────────────────────────────────────

  describe('A. tournaments table new columns (migration 044)', () => {
    it('mode column exists with default "scheduled"', async () => {
      const res = await pool.query(`
        SELECT column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tournaments'
          AND column_name = 'mode'
      `)
      expect(res.rows.length).toBe(1)
      expect(res.rows[0].column_default).toContain('scheduled')
      expect(res.rows[0].is_nullable).toBe('NO')
    })

    it('visibility column exists with default "public"', async () => {
      const res = await pool.query(`
        SELECT column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tournaments'
          AND column_name = 'visibility'
      `)
      expect(res.rows.length).toBe(1)
      expect(res.rows[0].column_default).toContain('public')
      expect(res.rows[0].is_nullable).toBe('NO')
    })

    it('group_id column exists and is nullable', async () => {
      const res = await pool.query(`
        SELECT data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tournaments'
          AND column_name = 'group_id'
      `)
      expect(res.rows.length).toBe(1)
      expect(res.rows[0].is_nullable).toBe('YES')
    })

    it('"abandoned" is a valid status value', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      // Direct update bypassing the app-layer enum validation
      await expect(
        pool.query(
          `UPDATE public.tournaments SET status = 'abandoned' WHERE id = $1`,
          [t.id]
        )
      ).resolves.toBeDefined()

      const check = await pool.query(
        `SELECT status FROM public.tournaments WHERE id = $1`,
        [t.id]
      )
      expect(check.rows[0].status).toBe('abandoned')
    })

    it('deadline columns are nullable', async () => {
      const res = await pool.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tournaments'
          AND column_name IN ('registration_deadline', 'group_stage_deadline', 'knockout_stage_deadline')
        ORDER BY column_name
      `)
      expect(res.rows.length).toBe(3)
      for (const row of res.rows) {
        expect(row.is_nullable).toBe('YES')
      }
    })

    it('existing scheduled tournaments default to mode="scheduled" and visibility="public"', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const row = await pool.query(
        `SELECT mode, visibility FROM public.tournaments WHERE id = $1`,
        [t.id]
      )
      expect(row.rows[0].mode).toBe('scheduled')
      expect(row.rows[0].visibility).toBe('public')
    })

    it('existing tournaments keep their deadline values after migration', async () => {
      const t = await TournamentFactory.create(pool, organizerId)
      const row = await pool.query(
        `SELECT registration_deadline, group_stage_deadline, knockout_stage_deadline
         FROM public.tournaments WHERE id = $1`,
        [t.id]
      )
      expect(row.rows[0].registration_deadline).not.toBeNull()
      expect(row.rows[0].group_stage_deadline).not.toBeNull()
      expect(row.rows[0].knockout_stage_deadline).not.toBeNull()
    })
  })

  // ── Suite B: Browse filter hides unlisted ─────────────────────────────────

  describe('B. GET /tournaments/public hides unlisted tournaments', () => {
    it('returns a public (visibility=public, registration_open) tournament', async () => {
      const t = await TournamentFactory.open(pool, organizerId)
      // Ensure visibility is public (default)
      await pool.query(
        `UPDATE public.tournaments SET visibility = 'public' WHERE id = $1`,
        [t!.id]
      )

      const res = await request(app).get('/tournaments/public')
      expect(res.status).toBe(200)
      const ids = res.body.tournaments.map((x: any) => x.id)
      expect(ids).toContain(t!.id)
    })

    it('does NOT return an unlisted tournament from browse', async () => {
      const t = await TournamentFactory.open(pool, organizerId)
      // Set visibility to unlisted
      await pool.query(
        `UPDATE public.tournaments SET visibility = 'unlisted' WHERE id = $1`,
        [t!.id]
      )

      const res = await request(app).get('/tournaments/public')
      expect(res.status).toBe(200)
      const ids = res.body.tournaments.map((x: any) => x.id)
      expect(ids).not.toContain(t!.id)
    })
  })

  // ── Suite C: Direct fetch still works for unlisted ────────────────────────

  describe('C. GET /tournaments/:id fetches unlisted by direct ID', () => {
    it('returns an unlisted tournament by direct GET /:id', async () => {
      const repo = new TournamentRepository(pool)
      const t = await TournamentFactory.create(pool, organizerId)
      // Set visibility to unlisted
      await pool.query(
        `UPDATE public.tournaments SET visibility = 'unlisted' WHERE id = $1`,
        [t.id]
      )

      const res = await request(app).get(`/tournaments/${t.id}`)
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(t.id)
    })
  })
})
