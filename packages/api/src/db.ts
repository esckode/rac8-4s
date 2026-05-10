import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'

export interface TournamentRow {
  id: string
  name: string
  sport: string
  match_format: string
  creator_id: string
  status: string
  max_players: number
  description?: string
  registration_deadline: string
  group_stage_deadline: string
  knockout_stage_deadline: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export function openDatabase(filename?: string): Database.Database {
  const db = new Database(filename)

  // Load and run migration
  const migrationPath = path.join(__dirname, '../../..', 'db', 'migrations', '001_create_tournaments.sql')
  const migration = fs.readFileSync(migrationPath, 'utf-8')
  db.exec(migration)

  return db
}

export interface CreateTournamentInput {
  name: string
  sport: string
  matchFormat: 'singles' | 'doubles'
  maxPlayers: number
  description?: string
  registrationDeadline: string
  groupStageDeadline: string
  knockoutStageDeadline: string
  creatorId: string
}

export interface UpdateTournamentInput {
  name?: string
  maxPlayers?: number
  description?: string
}

export interface ListOptions {
  offset?: number
  limit?: number
}

export class TournamentRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateTournamentInput): TournamentRow {
    const id = `tournament_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO tournaments (
        id, name, sport, match_format, creator_id, status,
        max_players, description, registration_deadline,
        group_stage_deadline, knockout_stage_deadline,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      input.name,
      input.sport,
      input.matchFormat,
      input.creatorId,
      'draft',
      input.maxPlayers,
      input.description || null,
      input.registrationDeadline,
      input.groupStageDeadline,
      input.knockoutStageDeadline,
      now,
      now
    )

    return this.findById(id)!
  }

  findById(id: string): TournamentRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM tournaments WHERE id = ?')
    return stmt.get(id) as TournamentRow | undefined
  }

  findByName(name: string): TournamentRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM tournaments WHERE name = ? AND deleted_at IS NULL')
    return stmt.get(name) as TournamentRow | undefined
  }

  listByOrganizer(creatorId: string, opts: ListOptions & { status?: string } = {}): { rows: TournamentRow[]; total: number } {
    const offset = opts.offset || 0
    const limit = opts.limit || 10

    let query = 'SELECT * FROM tournaments WHERE creator_id = ? AND deleted_at IS NULL'
    const params: unknown[] = [creatorId]

    if (opts.status) {
      query += ' AND status = ?'
      params.push(opts.status)
    }

    const countStmt = this.db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as count'))
    const countResult = countStmt.get(...params) as { count: number }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as TournamentRow[]

    return { rows, total: countResult.count }
  }

  listPublic(opts: ListOptions & { sport?: string } = {}): { rows: TournamentRow[]; total: number } {
    const offset = opts.offset || 0
    const limit = opts.limit || 10
    const publishedStatuses = ['registration_open', 'group_stage', 'knockout']

    let query = `SELECT * FROM tournaments WHERE status IN (${publishedStatuses.map(() => '?').join(',')}) AND deleted_at IS NULL`
    const params: unknown[] = publishedStatuses

    if (opts.sport) {
      query += ' AND sport = ?'
      params.push(opts.sport)
    }

    const countStmt = this.db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as count'))
    const countResult = countStmt.get(...params) as { count: number }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as TournamentRow[]

    return { rows, total: countResult.count }
  }

  update(id: string, input: UpdateTournamentInput): TournamentRow {
    const updates: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      updates.push('name = ?')
      values.push(input.name)
    }
    if (input.maxPlayers !== undefined) {
      updates.push('max_players = ?')
      values.push(input.maxPlayers)
    }
    if (input.description !== undefined) {
      updates.push('description = ?')
      values.push(input.description)
    }

    updates.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    const stmt = this.db.prepare(`UPDATE tournaments SET ${updates.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.findById(id)!
  }

  softDelete(id: string): void {
    const stmt = this.db.prepare('UPDATE tournaments SET deleted_at = ? WHERE id = ?')
    stmt.run(new Date().toISOString(), id)
  }
}
