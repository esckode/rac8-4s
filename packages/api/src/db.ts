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
  partner_id?: string
  partner_confirmed: boolean
  status: 'registered' | 'pending_partner_confirm' | 'withdrawn' | 'withdrawal_pending'
  withdrawal_requested_at?: string
  confirmed_at?: string
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

  const migration4Path = path.join(__dirname, '../../..', 'db', 'migrations', '004_create_knockout.sql')
  const migration4 = fs.readFileSync(migration4Path, 'utf-8')
  db.exec(migration4)

  const migration5Path = path.join(__dirname, '../../..', 'db', 'migrations', '005_create_locations.sql')
  const migration5 = fs.readFileSync(migration5Path, 'utf-8')
  db.exec(migration5)

  const migration6Path = path.join(__dirname, '../../..', 'db', 'migrations', '006_create_courts.sql')
  const migration6 = fs.readFileSync(migration6Path, 'utf-8')
  db.exec(migration6)

  const migration7Path = path.join(__dirname, '../../..', 'db', 'migrations', '007_extend_registrations.sql')
  const migration7 = fs.readFileSync(migration7Path, 'utf-8')
  db.exec(migration7)

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

  listAvailable(opts: ListOptions & { sport?: string } = {}): { rows: TournamentRow[]; total: number } {
    const offset = opts.offset || 0
    const limit = opts.limit || 20

    let query = `SELECT * FROM tournaments WHERE status = 'registration_open' AND deleted_at IS NULL`
    const params: unknown[] = []

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

  findRegistrationById(registrationId: string): RegistrationRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM player_registrations WHERE id = ?')
    const row = stmt.get(registrationId) as any
    if (!row) return undefined
    return { ...row, partner_confirmed: !!row.partner_confirmed } as RegistrationRow
  }

  findRegistrationsByTournament(tournamentId: string, opts: ListOptions = {}): { rows: RegistrationRow[]; total: number } {
    const offset = opts.offset || 0
    const limit = opts.limit || 50

    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM player_registrations WHERE tournament_id = ?')
    const countResult = countStmt.get(tournamentId) as { count: number }

    const stmt = this.db.prepare(`
      SELECT * FROM player_registrations
      WHERE tournament_id = ?
      ORDER BY registered_at DESC
      LIMIT ? OFFSET ?
    `)
    const rows = (stmt.all(tournamentId, limit, offset) as any[]).map(r => ({ ...r, partner_confirmed: !!r.partner_confirmed })) as RegistrationRow[]

    return { rows, total: countResult.count }
  }

  updateRegistrationWithPartner(registrationId: string, partnerId: string): RegistrationRow {
    const stmt = this.db.prepare(`
      UPDATE player_registrations
      SET partner_id = ?, status = ?, registered_at = ?
      WHERE id = ?
    `)
    const now = new Date().toISOString()
    stmt.run(partnerId, 'pending_partner_confirm', now, registrationId)
    return this.findRegistrationById(registrationId)!
  }

  confirmPartner(registrationId: string): RegistrationRow {
    const stmt = this.db.prepare(`
      UPDATE player_registrations
      SET partner_confirmed = ?, status = ?, confirmed_at = ?
      WHERE id = ?
    `)
    const now = new Date().toISOString()
    stmt.run(1, 'registered', now, registrationId)
    return this.findRegistrationById(registrationId)!
  }

  updateRegistrationStatus(registrationId: string, status: string): RegistrationRow {
    const stmt = this.db.prepare(`
      UPDATE player_registrations SET status = ? WHERE id = ?
    `)
    stmt.run(status, registrationId)
    return this.findRegistrationById(registrationId)!
  }

  withdrawRegistration(registrationId: string, isBeforeDeadline: boolean): RegistrationRow {
    const now = new Date().toISOString()
    const status = isBeforeDeadline ? 'withdrawn' : 'withdrawal_pending'
    const stmt = this.db.prepare(`
      UPDATE player_registrations
      SET status = ?, withdrawal_requested_at = ?
      WHERE id = ?
    `)
    stmt.run(status, now, registrationId)
    return this.findRegistrationById(registrationId)!
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

  findMatchById(matchId: string): GroupMatchRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM group_matches WHERE id = ?')
    return stmt.get(matchId) as GroupMatchRow | undefined
  }

  updateMatch(matchId: string, winnerId: string, score: string): GroupMatchRow {
    const now = new Date().toISOString()
    const stmt = this.db.prepare(`
      UPDATE group_matches SET winner_id = ?, score = ?, status = 'completed', updated_at = ? WHERE id = ?
    `)
    stmt.run(winnerId, score, now, matchId)
    return this.findMatchById(matchId)!
  }
}

export interface KnockoutMatchRow {
  id: string
  tournament_id: string
  round: number
  position: number
  player1_id: string | null
  player2_id: string | null
  winner_id: string | null
  score: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface LocationRow {
  id: string
  name: string
  sport: string
  latitude: number
  longitude: number
  total_courts: number
  restricted: boolean
  entry_conditions?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface CourtRow {
  id: string
  location_id: string
  status: 'available' | 'unavailable' | 'maintenance'
  created_at: string
  updated_at: string
}

export class KnockoutRepository {
  constructor(private db: Database.Database) {}

  setSeeds(tournamentId: string, seeds: Array<{ playerId: string; seedPosition: number }>): void {
    const deleteStmt = this.db.prepare('DELETE FROM bracket_seeds WHERE tournament_id = ?')
    deleteStmt.run(tournamentId)

    const insertStmt = this.db.prepare('INSERT INTO bracket_seeds (tournament_id, seed_position, player_id) VALUES (?, ?, ?)')
    for (const seed of seeds) {
      insertStmt.run(tournamentId, seed.seedPosition, seed.playerId)
    }
  }

  getSeeds(tournamentId: string): Array<{ playerId: string; seedPosition: number }> {
    const rows = this.db.prepare('SELECT * FROM bracket_seeds WHERE tournament_id = ? ORDER BY seed_position').all(tournamentId) as Array<{
      tournament_id: string
      seed_position: number
      player_id: string
    }>
    return rows.map((r) => ({ playerId: r.player_id, seedPosition: r.seed_position }))
  }

  createKnockoutMatches(tournamentId: string, bracket: any, seedMap: Map<number, string>): KnockoutMatchRow[] {
    const now = new Date().toISOString()
    const insertStmt = this.db.prepare(`
      INSERT INTO knockout_matches (id, tournament_id, round, position, player1_id, player2_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const round of bracket.rounds) {
      for (const match of round.matches) {
        const id = `km_${Date.now()}_${Math.random().toString(36).slice(2)}`
        const player1Id = match.player1 ? seedMap.get(parseInt(match.player1.replace('seed_', ''))) ?? null : null
        const player2Id = match.player2 ? seedMap.get(parseInt(match.player2.replace('seed_', ''))) ?? null : null
        const status = player2Id === null && player1Id !== null ? 'bye' : 'pending'
        insertStmt.run(id, tournamentId, match.round, match.position, player1Id, player2Id, status, now, now)
      }
    }

    return this.findKnockoutMatchesByTournament(tournamentId)
  }

  findKnockoutMatchesByTournament(tournamentId: string): KnockoutMatchRow[] {
    const rows = this.db.prepare('SELECT * FROM knockout_matches WHERE tournament_id = ? ORDER BY round, position').all(tournamentId)
    return rows as KnockoutMatchRow[]
  }

  findKnockoutMatchById(matchId: string): KnockoutMatchRow | undefined {
    return this.db.prepare('SELECT * FROM knockout_matches WHERE id = ?').get(matchId) as KnockoutMatchRow | undefined
  }

  updateKnockoutMatch(matchId: string, winnerId: string, score: string): KnockoutMatchRow {
    const now = new Date().toISOString()
    this.db.prepare(`UPDATE knockout_matches SET winner_id = ?, score = ?, status = 'completed', updated_at = ? WHERE id = ?`).run(
      winnerId,
      score,
      now,
      matchId
    )
    return this.findKnockoutMatchById(matchId)!
  }
}

export interface CreateLocationInput {
  name: string
  sport: string
  latitude: number
  longitude: number
  totalCourts: number
  restricted?: boolean
  entryConditions?: string
}

export interface UpdateLocationInput {
  name?: string
  totalCourts?: number
  restricted?: boolean
  entryConditions?: string
}

export class LocationRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateLocationInput): LocationRow {
    const id = `location_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO locations (
        id, name, sport, latitude, longitude, total_courts,
        restricted, entry_conditions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      input.name,
      input.sport,
      input.latitude,
      input.longitude,
      input.totalCourts,
      (input.restricted ?? false) ? 1 : 0,
      input.entryConditions || null,
      now,
      now
    )

    return this.findById(id)!
  }

  findById(id: string): LocationRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM locations WHERE id = ? AND deleted_at IS NULL')
    const row = stmt.get(id) as any
    if (!row) return undefined
    const result = { ...row, restricted: !!row.restricted } as LocationRow
    delete (result as any).deleted_at
    return result
  }

  findBySport(sport: string, opts: ListOptions = {}): { rows: LocationRow[]; total: number } {
    const offset = opts.offset || 0
    const limit = opts.limit || 10

    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM locations WHERE sport = ? AND deleted_at IS NULL')
    const countResult = countStmt.get(sport) as { count: number }

    const stmt = this.db.prepare(`
      SELECT * FROM locations WHERE sport = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `)
    const rows = (stmt.all(sport, limit, offset) as any[]).map(r => ({ ...r, restricted: !!r.restricted })) as LocationRow[]

    return { rows, total: countResult.count }
  }

  listAll(opts: ListOptions = {}): { rows: LocationRow[]; total: number } {
    const offset = opts.offset || 0
    const limit = opts.limit || 10

    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM locations WHERE deleted_at IS NULL')
    const countResult = countStmt.get() as { count: number }

    const stmt = this.db.prepare(`
      SELECT * FROM locations WHERE deleted_at IS NULL
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `)
    const rows = (stmt.all(limit, offset) as any[]).map(r => ({ ...r, restricted: !!r.restricted })) as LocationRow[]

    return { rows, total: countResult.count }
  }

  update(id: string, input: UpdateLocationInput): LocationRow {
    const updates: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      updates.push('name = ?')
      values.push(input.name)
    }
    if (input.totalCourts !== undefined) {
      updates.push('total_courts = ?')
      values.push(input.totalCourts)
    }
    if (input.restricted !== undefined) {
      updates.push('restricted = ?')
      values.push(input.restricted ? 1 : 0)
    }
    if (input.entryConditions !== undefined) {
      updates.push('entry_conditions = ?')
      values.push(input.entryConditions || null)
    }

    updates.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    const stmt = this.db.prepare(`UPDATE locations SET ${updates.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.findById(id)!
  }

  calculateCapacity(locationId: string): number {
    const location = this.findById(locationId)
    if (!location) return 0

    const stmt = this.db.prepare(`
      SELECT COUNT(*) as unavailable_count FROM courts
      WHERE location_id = ? AND status != 'available'
    `)
    const result = stmt.get(locationId) as { unavailable_count: number }

    return location.total_courts - result.unavailable_count
  }

  findNearby(latitude: number, longitude: number, radiusKm: number = 0.025): LocationRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM locations
      WHERE deleted_at IS NULL
        AND (latitude BETWEEN ? AND ?)
        AND (longitude BETWEEN ? AND ?)
      ORDER BY created_at DESC
    `)

    const rows = stmt.all(
      latitude - radiusKm,
      latitude + radiusKm,
      longitude - radiusKm,
      longitude + radiusKm
    ) as any[]

    return rows.map(r => ({ ...r, restricted: !!r.restricted })) as LocationRow[]
  }

  softDelete(id: string): void {
    const stmt = this.db.prepare('UPDATE locations SET deleted_at = ? WHERE id = ?')
    stmt.run(new Date().toISOString(), id)
  }
}

export interface CreateCourtInput {
  locationId: string
  status?: 'available' | 'unavailable' | 'maintenance'
}

export class CourtRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateCourtInput): CourtRow {
    const id = `court_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO courts (id, location_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    stmt.run(id, input.locationId, input.status || 'available', now, now)

    return this.findById(id)!
  }

  findById(id: string): CourtRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM courts WHERE id = ?')
    return stmt.get(id) as CourtRow | undefined
  }

  findByLocation(locationId: string): CourtRow[] {
    const stmt = this.db.prepare('SELECT * FROM courts WHERE location_id = ? ORDER BY created_at')
    return stmt.all(locationId) as CourtRow[]
  }

  updateStatus(id: string, status: 'available' | 'unavailable' | 'maintenance'): CourtRow {
    const now = new Date().toISOString()
    const stmt = this.db.prepare('UPDATE courts SET status = ?, updated_at = ? WHERE id = ?')
    stmt.run(status, now, id)

    return this.findById(id)!
  }

  countByLocation(locationId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM courts WHERE location_id = ?')
    const result = stmt.get(locationId) as { count: number }
    return result.count
  }

  countByLocationAndStatus(locationId: string, status: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM courts WHERE location_id = ? AND status = ?')
    const result = stmt.get(locationId, status) as { count: number }
    return result.count
  }
}
