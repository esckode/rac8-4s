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

export interface GroupRow {
  id: string
  tournament_id: string
  name: string
  advancing_count: number
  created_at: string
}

export interface GroupMatchRow {
  id: string
  group_id: string
  tournament_id: string
  player1_id: string
  player2_id: string
  winner_id?: string
  score?: string
  status: string
  created_at: string
  updated_at: string
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

  const migration3Path = path.join(__dirname, '../../..', 'db', 'migrations', '003_create_groups.sql')
  const migration3 = fs.readFileSync(migration3Path, 'utf-8')
  db.exec(migration3)

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
    const publishedStatuses = ['registration_open', 'group_stage_active', 'group_stage_complete', 'knockout_active']

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

  updateStatus(id: string, status: string): TournamentRow {
    const stmt = this.db.prepare('UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ?')
    stmt.run(status, new Date().toISOString(), id)
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

export class GroupRepository {
  constructor(private db: Database.Database) {}

  createGroups(tournamentId: string, numGroups: number, advancingCount: number, playerIds: string[]): GroupRow[] {
    const groupIds: string[] = []
    const now = new Date().toISOString()

    // Create groups
    for (let i = 1; i <= numGroups; i++) {
      const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2)}`
      groupIds.push(groupId)

      const stmt = this.db.prepare(`
        INSERT INTO groups (id, tournament_id, name, advancing_count, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      stmt.run(groupId, tournamentId, `Group ${String.fromCharCode(64 + i)}`, advancingCount, now)
    }

    // Shuffle and distribute players evenly
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5)
    const playersPerGroup = Math.ceil(shuffled.length / numGroups)

    for (let i = 0; i < numGroups; i++) {
      const groupId = groupIds[i]
      const start = i * playersPerGroup
      const end = Math.min(start + playersPerGroup, shuffled.length)
      const groupPlayers = shuffled.slice(start, end)

      // Add players to group
      const memberStmt = this.db.prepare(`
        INSERT INTO group_memberships (group_id, player_id)
        VALUES (?, ?)
      `)

      // Generate round-robin matches for this group
      const matchStmt = this.db.prepare(`
        INSERT INTO group_matches (id, group_id, tournament_id, player1_id, player2_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      // Add members and generate matches
      for (const playerId of groupPlayers) {
        memberStmt.run(groupId, playerId)
      }

      // Generate round-robin: each player plays every other player once
      for (let j = 0; j < groupPlayers.length; j++) {
        for (let k = j + 1; k < groupPlayers.length; k++) {
          const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2)}`
          matchStmt.run(matchId, groupId, tournamentId, groupPlayers[j], groupPlayers[k], 'pending', now, now)
        }
      }
    }

    return this.findGroupsByTournament(tournamentId)
  }

  findGroupsByTournament(tournamentId: string): GroupRow[] {
    const stmt = this.db.prepare('SELECT * FROM groups WHERE tournament_id = ? ORDER BY name')
    return stmt.all(tournamentId) as GroupRow[]
  }

  findGroupById(groupId: string): GroupRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM groups WHERE id = ?')
    return stmt.get(groupId) as GroupRow | undefined
  }

  findMatchesByGroup(groupId: string): GroupMatchRow[] {
    const stmt = this.db.prepare('SELECT * FROM group_matches WHERE group_id = ? ORDER BY created_at')
    return stmt.all(groupId) as GroupMatchRow[]
  }

  countPendingMatchesByTournament(tournamentId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM group_matches WHERE tournament_id = ? AND status = ?')
    const result = stmt.get(tournamentId, 'pending') as { count: number }
    return result.count
  }

  findMembersByGroup(groupId: string): PlayerRow[] {
    const stmt = this.db.prepare(`
      SELECT p.* FROM players p
      JOIN group_memberships gm ON gm.player_id = p.id
      WHERE gm.group_id = ?
      ORDER BY p.name
    `)
    return stmt.all(groupId) as PlayerRow[]
  }
}
