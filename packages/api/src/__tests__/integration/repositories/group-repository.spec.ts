/**
 * G1.1 — Schema: player_groups + player_group_members (multi-owner)
 *
 * Migration 039 creates:
 *   - public.player_groups(id, name, created_by, default_match_format, created_at)
 *   - public.player_group_members(group_id, player_id, role, notify_level, joined_at)
 *
 * Tests verify:
 *   - Both tables exist with correct columns and types (TIMESTAMPTZ, not TIMESTAMP)
 *   - default_match_format defaults to 'singles'
 *   - notify_level defaults to 'mentions_polls'
 *   - Many-to-many: a player can be in multiple groups
 *   - Multi-owner: multiple role='owner' rows allowed per group (no unique-owner constraint)
 *   - PK/uniqueness on (group_id, player_id)
 *   - GroupRepository skeleton can be instantiated
 */

import { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { GroupRepository } from '../../../repositories/group-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function insertPlayer(pool: Pool, email: string, name: string): Promise<string> {
  const id = crypto.randomUUID()
  const result = await pool.query(
    `INSERT INTO public.players (id, email, name) VALUES ($1, $2, $3) RETURNING id`,
    [id, email, name]
  )
  return result.rows[0].id as string
}

async function insertGroup(
  pool: Pool,
  name: string,
  createdBy: string,
  defaultMatchFormat?: string
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO public.player_groups (name, created_by${defaultMatchFormat !== undefined ? ', default_match_format' : ''})
     VALUES ($1, $2${defaultMatchFormat !== undefined ? ', $3' : ''}) RETURNING id`,
    defaultMatchFormat !== undefined
      ? [name, createdBy, defaultMatchFormat]
      : [name, createdBy]
  )
  return result.rows[0].id as string
}

describe('G1.1 — player_groups schema + GroupRepository skeleton', () => {
  let pool: Pool
  let client: PoolClient

  beforeAll(async () => {
    pool = await getTestPool()
    client = await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // ─── Table existence & column types ────────────────────────────────────────

  describe('player_groups table', () => {
    it('exists with expected columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'player_groups'
        ORDER BY ordinal_position
      `)
      const cols = Object.fromEntries(result.rows.map((r: any) => [r.column_name, r]))

      expect(cols['id']).toBeDefined()
      expect(cols['name']).toBeDefined()
      expect(cols['created_by']).toBeDefined()
      expect(cols['default_match_format']).toBeDefined()
      expect(cols['created_at']).toBeDefined()
    })

    it('created_at is TIMESTAMPTZ (not naive TIMESTAMP)', async () => {
      const result = await pool.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'player_groups'
          AND column_name = 'created_at'
      `)
      // PostgreSQL reports TIMESTAMPTZ as 'timestamp with time zone'
      expect(result.rows[0].data_type).toBe('timestamp with time zone')
    })

    it('default_match_format defaults to singles', async () => {
      const playerEmail = `pg-default-fmt-${uid()}@test.local`
      const playerId = await insertPlayer(pool, playerEmail, `Player ${uid()}`)

      const result = await pool.query(
        `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING default_match_format`,
        [`Group ${uid()}`, playerId]
      )
      expect(result.rows[0].default_match_format).toBe('singles')
    })

    it('accepts default_match_format = doubles', async () => {
      const playerId = await insertPlayer(pool, `pg-dbl-${uid()}@test.local`, `Player ${uid()}`)
      const result = await pool.query(
        `INSERT INTO public.player_groups (name, created_by, default_match_format)
         VALUES ($1, $2, 'doubles') RETURNING default_match_format`,
        [`Group ${uid()}`, playerId]
      )
      expect(result.rows[0].default_match_format).toBe('doubles')
    })

    it('rejects invalid default_match_format values', async () => {
      const playerId = await insertPlayer(pool, `pg-bad-fmt-${uid()}@test.local`, `Player ${uid()}`)
      await expect(
        pool.query(
          `INSERT INTO public.player_groups (name, created_by, default_match_format)
           VALUES ($1, $2, 'team')`,
          [`Group ${uid()}`, playerId]
        )
      ).rejects.toThrow()
    })
  })

  describe('player_group_members table', () => {
    it('exists with expected columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'player_group_members'
        ORDER BY ordinal_position
      `)
      const colNames = result.rows.map((r: any) => r.column_name)

      expect(colNames).toContain('group_id')
      expect(colNames).toContain('player_id')
      expect(colNames).toContain('role')
      expect(colNames).toContain('notify_level')
      expect(colNames).toContain('joined_at')
    })

    it('joined_at is TIMESTAMPTZ (not naive TIMESTAMP)', async () => {
      const result = await pool.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'player_group_members'
          AND column_name = 'joined_at'
      `)
      expect(result.rows[0].data_type).toBe('timestamp with time zone')
    })

    it('notify_level defaults to mentions_polls', async () => {
      const playerId = await insertPlayer(pool, `pgm-notify-${uid()}@test.local`, `Player ${uid()}`)
      const groupId = await insertGroup(pool, `Group ${uid()}`, playerId)

      const result = await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'owner') RETURNING notify_level`,
        [groupId, playerId]
      )
      expect(result.rows[0].notify_level).toBe('mentions_polls')
    })

    it('accepts all valid notify_level values', async () => {
      const playerId = await insertPlayer(pool, `pgm-nlvl-${uid()}@test.local`, `Player ${uid()}`)
      const groupId = await insertGroup(pool, `Group ${uid()}`, playerId)

      for (const [i, level] of ['all', 'muted'].entries()) {
        const pid = await insertPlayer(pool, `pgm-nlvl-${uid()}-${i}@test.local`, `P${i}`)
        const row = await pool.query(
          `INSERT INTO public.player_group_members (group_id, player_id, role, notify_level)
           VALUES ($1, $2, 'member', $3) RETURNING notify_level`,
          [groupId, pid, level]
        )
        expect(row.rows[0].notify_level).toBe(level)
      }
    })

    it('rejects invalid role values', async () => {
      const playerId = await insertPlayer(pool, `pgm-badrole-${uid()}@test.local`, `Player ${uid()}`)
      const groupId = await insertGroup(pool, `Group ${uid()}`, playerId)

      await expect(
        pool.query(
          `INSERT INTO public.player_group_members (group_id, player_id, role)
           VALUES ($1, $2, 'admin')`,
          [groupId, playerId]
        )
      ).rejects.toThrow()
    })

    it('rejects invalid notify_level values', async () => {
      const playerId = await insertPlayer(pool, `pgm-badnl-${uid()}@test.local`, `Player ${uid()}`)
      const groupId = await insertGroup(pool, `Group ${uid()}`, playerId)

      await expect(
        pool.query(
          `INSERT INTO public.player_group_members (group_id, player_id, role, notify_level)
           VALUES ($1, $2, 'member', 'important')`,
          [groupId, playerId]
        )
      ).rejects.toThrow()
    })
  })

  // ─── Many-to-many: one player in multiple groups ───────────────────────────

  describe('many-to-many membership', () => {
    it('allows a player to be a member of multiple groups', async () => {
      const playerId = await insertPlayer(pool, `pgm-m2m-${uid()}@test.local`, `Player ${uid()}`)

      const groupId1 = await insertGroup(pool, `Group A ${uid()}`, playerId)
      const groupId2 = await insertGroup(pool, `Group B ${uid()}`, playerId)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
        [groupId1, playerId]
      )
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
        [groupId2, playerId]
      )

      const result = await pool.query(
        `SELECT group_id FROM public.player_group_members WHERE player_id = $1 ORDER BY joined_at`,
        [playerId]
      )
      const groupIds = result.rows.map((r: any) => r.group_id)
      expect(groupIds).toContain(groupId1)
      expect(groupIds).toContain(groupId2)
      expect(groupIds.length).toBe(2)
    })
  })

  // ─── Multi-owner: multiple role='owner' rows per group (no unique-owner) ───

  describe('multi-owner: no unique-owner constraint', () => {
    it('allows multiple role=owner rows for the same group', async () => {
      const owner1Id = await insertPlayer(pool, `pgm-own1-${uid()}@test.local`, `Owner1`)
      const owner2Id = await insertPlayer(pool, `pgm-own2-${uid()}@test.local`, `Owner2`)
      const groupId = await insertGroup(pool, `Group ${uid()}`, owner1Id)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
        [groupId, owner1Id]
      )
      // Second owner in the same group — must succeed (no unique-owner constraint)
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
        [groupId, owner2Id]
      )

      const result = await pool.query(
        `SELECT player_id FROM public.player_group_members
         WHERE group_id = $1 AND role = 'owner'`,
        [groupId]
      )
      expect(result.rows.length).toBe(2)
    })
  })

  // ─── PK uniqueness on (group_id, player_id) ────────────────────────────────

  describe('(group_id, player_id) uniqueness', () => {
    it('rejects duplicate (group_id, player_id) rows', async () => {
      const playerId = await insertPlayer(pool, `pgm-dup-${uid()}@test.local`, `Player ${uid()}`)
      const groupId = await insertGroup(pool, `Group ${uid()}`, playerId)

      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
        [groupId, playerId]
      )
      await expect(
        pool.query(
          `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
          [groupId, playerId]
        )
      ).rejects.toThrow()
    })
  })

  // ─── FK constraints ────────────────────────────────────────────────────────

  describe('foreign key constraints', () => {
    it('player_groups.created_by references public.players', async () => {
      await expect(
        pool.query(
          `INSERT INTO public.player_groups (name, created_by) VALUES ('Test', $1)`,
          [crypto.randomUUID()]
        )
      ).rejects.toThrow()
    })

    it('player_group_members.group_id references player_groups', async () => {
      const playerId = await insertPlayer(pool, `pgm-fk-${uid()}@test.local`, `Player ${uid()}`)
      await expect(
        pool.query(
          `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
          [crypto.randomUUID(), playerId]
        )
      ).rejects.toThrow()
    })
  })

  // ─── GroupRepository skeleton ──────────────────────────────────────────────

  describe('GroupRepository', () => {
    it('can be instantiated with a pool', () => {
      const repo = new GroupRepository(pool)
      expect(repo).toBeInstanceOf(GroupRepository)
    })
  })
})
