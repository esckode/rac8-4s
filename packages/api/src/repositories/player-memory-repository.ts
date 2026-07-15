/**
 * PlayerMemoryRepository — 1:1 Coach opt-in memory store (COACH_1TO1_DESIGN.md §5, §5.2).
 *
 * Every row is the result of an explicit player confirm (propose_remember → card →
 * confirm, S6) or a direct player-dictated "remember …" — never silent auto-extraction.
 * The ~20-entry cap and 280-char length are service-enforced (revalidated at confirm,
 * S6.4), not DB constraints, except the 280-char CHECK which is a schema-level backstop.
 */
import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('player-memory-repository')

export type PlayerMemorySource = 'player' | 'coach'

export interface PlayerMemoryRow {
  id: string
  playerId: string
  body: string
  source: PlayerMemorySource
  createdAt: Date
}

export interface InsertMemoryInput {
  playerId: string
  body: string
  source: PlayerMemorySource
}

function rowToMemory(row: any): PlayerMemoryRow {
  return {
    id: row.id as string,
    playerId: row.player_id as string,
    body: row.body as string,
    source: row.source as PlayerMemorySource,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }
}

const MEMORY_COLUMNS = `id, player_id, body, source, created_at`

export class PlayerMemoryRepository {
  constructor(private pool: Pool) {}

  async insertMemory(input: InsertMemoryInput): Promise<PlayerMemoryRow> {
    const { playerId, body, source } = input
    const res = await this.pool.query(
      `INSERT INTO public.player_memories (player_id, body, source)
       VALUES ($1, $2, $3)
       RETURNING ${MEMORY_COLUMNS}`,
      [playerId, body, source]
    )
    const memory = rowToMemory(res.rows[0])
    log.info('coach.memory.inserted', { playerId, memoryId: memory.id, source })
    return memory
  }

  /** Newest-first — used for the Profile memories list and turn injection (age-annotated). */
  async listMemories(playerId: string): Promise<PlayerMemoryRow[]> {
    const res = await this.pool.query(
      `SELECT ${MEMORY_COLUMNS} FROM public.player_memories
       WHERE player_id = $1
       ORDER BY created_at DESC, id DESC`,
      [playerId]
    )
    return res.rows.map(rowToMemory)
  }

  async countMemories(playerId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT count(*)::int AS count FROM public.player_memories WHERE player_id = $1`,
      [playerId]
    )
    return res.rows[0].count as number
  }

  /** Owner-scoped — deleting another player's memory id is a no-op (returns 0). */
  async deleteMemory(playerId: string, memoryId: string): Promise<number> {
    const res = await this.pool.query(
      `DELETE FROM public.player_memories WHERE id = $1 AND player_id = $2`,
      [memoryId, playerId]
    )
    log.info('coach.memory.deleted', { playerId, memoryId, deleted: res.rowCount })
    return res.rowCount ?? 0
  }
}
