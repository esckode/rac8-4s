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

export interface PlayerRow {
  id: string
  email: string
  name: string
  phone?: string
  preferred_contact?: string
  created_at: string
  updated_at: string
}

export interface RegistrationRow {
  id: string
  player_id: string
  tournament_id: string
  registered_at: string
}

export function openDatabase(filename?: string): Database.Database {
  const db = new Database(filename)

  // Load and run migrations
  const migration1Path = path.join(__dirname, '../../..', 'db', 'migrations', '001_create_tournaments.sql')
  const migration1 = fs.readFileSync(migration1Path, 'utf-8')
  db.exec(migration1)

  const migration2Path = path.join(__dirname, '../../..', 'db', 'migrations', '002_create_players.sql')
  const migration2 = fs.readFileSync(migration2Path, 'utf-8')
  db.exec(migration2)

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

export class PlayerRepository {
  constructor(private db: Database.Database) {}

  findOrCreatePlayerByEmail(
    email: string,
    name: string,
    phone?: string,
    preferredContact?: string
  ): PlayerRow {
    const existing = this.db.prepare('SELECT * FROM players WHERE email = ?').get(email) as PlayerRow | undefined
    if (existing) {
      return existing
    }

    const id = `player_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
      INSERT INTO players (id, email, name, phone, preferred_contact, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(id, email, name, phone || null, preferredContact || null, now, now)

    return this.findById(id)!
  }

  findById(id: string): PlayerRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM players WHERE id = ?')
    return stmt.get(id) as PlayerRow | undefined
  }

  findByEmail(email: string): PlayerRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM players WHERE email = ?')
    return stmt.get(email) as PlayerRow | undefined
  }

  createRegistration(playerId: string, tournamentId: string): RegistrationRow {
    const id = `reg_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    this.db
      .prepare(
        `
      INSERT INTO player_registrations (id, player_id, tournament_id, registered_at)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(id, playerId, tournamentId, now)

    return this.findRegistration(playerId, tournamentId)!
  }

  findRegistration(playerId: string, tournamentId: string): RegistrationRow | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM player_registrations WHERE player_id = ? AND tournament_id = ?'
    )
    return stmt.get(playerId, tournamentId) as RegistrationRow | undefined
  }

  countRegistrationsForTournament(tournamentId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM player_registrations WHERE tournament_id = ?')
    const result = stmt.get(tournamentId) as { count: number }
    return result.count
  }

  listTournamentsByPlayer(playerId: string, opts: ListOptions = {}): { rows: TournamentRow[]; total: number } {
    const offset = opts.offset || 0
    const limit = opts.limit || 10

    const query = `
      SELECT DISTINCT t.* FROM tournaments t
      JOIN player_registrations pr ON pr.tournament_id = t.id
      WHERE pr.player_id = ? AND t.deleted_at IS NULL
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `

    const countStmt = this.db.prepare(
      `
      SELECT COUNT(DISTINCT t.id) as count FROM tournaments t
      JOIN player_registrations pr ON pr.tournament_id = t.id
      WHERE pr.player_id = ? AND t.deleted_at IS NULL
    `
    )
    const countResult = countStmt.get(playerId) as { count: number }

    const stmt = this.db.prepare(query)
    const rows = stmt.all(playerId, limit, offset) as TournamentRow[]

    return { rows, total: countResult.count }
  }
}
