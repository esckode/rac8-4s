import { Pool, PoolClient } from 'pg'
import { randomInt } from 'crypto'
import { NotFoundError, DeadlockError, CheckConstraintError, UniqueConstraintError } from './db/errors'
import { getLogger } from './logger'

const log = getLogger('db')

// Accept either Pool or PoolClient for database operations
// Both have compatible query() method signatures
export type DbConnection = Pool | PoolClient

/**
 * Get a client from a Pool or return the PoolClient directly.
 * Used internally when code needs a dedicated client for transactions.
 */
async function getClientFromConnection(
  connection: DbConnection
): Promise<{ client: any; isPoolClient: boolean }> {
  // Check if it's already a PoolClient (has release method)
  if (connection && typeof (connection as any).release === 'function') {
    // Already a client, return as-is
    return { client: connection, isPoolClient: true }
  } else {
    // It's a Pool, get a client from it
    const client = await (connection as Pool).connect()
    return { client, isPoolClient: false }
  }
}

/**
 * Release a client only if it came from pool.connect() (not if it's a transaction client).
 */
function releaseClientIfNeeded(client: any, isPoolClient: boolean): void {
  if (!isPoolClient && client && typeof client.release === 'function') {
    client.release()
  }
}

async function retryOnDeadlock<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isDeadlock = err instanceof Error && (err.message.includes('40P01') || err.message.includes('deadlock'))
      if (!isDeadlock || attempt === maxAttempts) {
        throw err
      }
      const delayMs = 1000 * Math.pow(2, attempt - 1)
      log.warn('deadlock.retry', { attempt, delayMs, message: err instanceof Error ? err.message : String(err) })
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  return fn()
}

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
  share_contact: boolean
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
  player1_confirmed: boolean
  player2_confirmed: boolean
  player1_confirmed_at?: string
  player2_confirmed_at?: string
  created_at: string
  updated_at: string
}

export interface GroupMatchWithPlayers extends GroupMatchRow {
  player1_name: string
  player1_email: string
  player1_share_contact: boolean
  player2_name: string
  player2_email: string
  player2_share_contact: boolean
}

export interface AccountRow {
  id: string
  email: string
  password_hash: string | null
  role: string
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
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
  constructor(private pool: DbConnection) {}

  async create(input: CreateTournamentInput): Promise<TournamentRow> {
    const id = `tournament_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    // Validate enum values
    if (!['singles', 'doubles'].includes(input.matchFormat)) {
      throw new CheckConstraintError('matchFormat')
    }

    await this.pool.query(
      `INSERT INTO public.tournaments (
        id, name, sport, match_format, creator_id, status,
        max_players, description, registration_deadline,
        group_stage_deadline, knockout_stage_deadline,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
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
        now,
      ]
    )

    const tournament = await this.findById(id)
    if (!tournament) throw new NotFoundError('Tournament')
    return tournament
  }

  async findById(id: string): Promise<TournamentRow | undefined> {
    const result = await this.pool.query('SELECT * FROM public.tournaments WHERE id = $1', [id])
    return result.rows[0] as TournamentRow | undefined
  }

  async findByName(name: string): Promise<TournamentRow | undefined> {
    const result = await this.pool.query('SELECT * FROM public.tournaments WHERE name = $1 AND deleted_at IS NULL', [name])
    return result.rows[0] as TournamentRow | undefined
  }

  async listByOrganizer(
    creatorId: string,
    opts: ListOptions & { status?: string } = {}
  ): Promise<{ rows: TournamentRow[]; total: number }> {
    const offset = opts.offset || 0
    const limit = opts.limit || 10

    const countParams = [creatorId]
    let countQuery = 'SELECT COUNT(*) as count FROM public.tournaments WHERE creator_id = $1 AND deleted_at IS NULL'

    if (opts.status) {
      countParams.push(opts.status)
      countQuery += ` AND status = $${countParams.length}`
    }

    const countResult = await this.pool.query(countQuery, countParams)
    const total = Number((countResult.rows[0] as { count: any }).count)

    const params = [creatorId]
    let query = 'SELECT * FROM public.tournaments WHERE creator_id = $1 AND deleted_at IS NULL'

    if (opts.status) {
      params.push(opts.status)
      query += ` AND status = $${params.length}`
    }

    params.push(String(limit), String(offset))
    query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

    const result = await this.pool.query(query, params)
    const rows = result.rows as TournamentRow[]

    return { rows, total }
  }

  async listPublic(
    opts: ListOptions & { sport?: string } = {}
  ): Promise<{ rows: TournamentRow[]; total: number }> {
    const offset = opts.offset || 0
    const limit = opts.limit || 10
    const publishedStatuses = ['registration_open', 'group_stage_active', 'group_stage_complete', 'knockout_active']

    const params = [...publishedStatuses]
    const placeholders = publishedStatuses.map((_, i) => `$${i + 1}`).join(',')
    let query = `SELECT * FROM public.tournaments WHERE status IN (${placeholders}) AND deleted_at IS NULL`

    if (opts.sport) {
      params.push(opts.sport)
      query += ` AND sport = $${params.length}`
    }

    const countParams = [...params]
    const countResult = await this.pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*) as count'),
      countParams
    )
    const total = parseInt((countResult.rows[0] as { count: string }).count)

    params.push(String(limit), String(offset))
    query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

    const result = await this.pool.query(query, params)
    const rows = result.rows as TournamentRow[]

    return { rows, total }
  }

  async listAvailable(
    opts: ListOptions & { sport?: string } = {}
  ): Promise<{ rows: TournamentRow[]; total: number }> {
    const offset = opts.offset || 0
    const limit = opts.limit || 20

    const params = ['registration_open']
    let query = `SELECT * FROM public.tournaments WHERE status = $1 AND deleted_at IS NULL`

    if (opts.sport) {
      params.push(opts.sport)
      query += ` AND sport = $${params.length}`
    }

    const countParams = [...params]
    const countResult = await this.pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*) as count'),
      countParams
    )
    const total = parseInt((countResult.rows[0] as { count: string }).count)

    params.push(String(limit), String(offset))
    query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

    const result = await this.pool.query(query, params)
    const rows = result.rows as TournamentRow[]

    return { rows, total }
  }

  async update(id: string, input: UpdateTournamentInput): Promise<TournamentRow> {
    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex}`)
      values.push(input.name)
      paramIndex++
    }
    if (input.maxPlayers !== undefined) {
      updates.push(`max_players = $${paramIndex}`)
      values.push(input.maxPlayers)
      paramIndex++
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex}`)
      values.push(input.description)
      paramIndex++
    }

    updates.push(`updated_at = $${paramIndex}`)
    values.push(new Date().toISOString())
    paramIndex++

    values.push(id)

    await this.pool.query(
      `UPDATE public.tournaments SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    )

    const tournament = await this.findById(id)
    if (!tournament) throw new NotFoundError('Tournament')
    return tournament
  }

  async updateStatus(id: string, status: string): Promise<TournamentRow> {
    // Validate status enum
    const validStatuses = ['draft', 'registration_open', 'registration_closed', 'group_stage_active', 'group_stage_complete', 'knockout_active', 'knockout_complete', 'completed']
    if (!validStatuses.includes(status)) {
      throw new CheckConstraintError('status')
    }

    await this.pool.query(
      'UPDATE public.tournaments SET status = $1, updated_at = $2 WHERE id = $3',
      [status, new Date().toISOString(), id]
    )
    const tournament = await this.findById(id)
    if (!tournament) throw new NotFoundError('Tournament')
    return tournament
  }

  async softDelete(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE public.tournaments SET deleted_at = $1 WHERE id = $2',
      [new Date().toISOString(), id]
    )
  }
}

export class PlayerRepository {
  constructor(private pool: DbConnection) {}

  async findOrCreatePlayerByEmail(
    email: string,
    name: string,
    phone?: string,
    preferredContact?: string
  ): Promise<PlayerRow> {
    const existing = await this.findByEmail(email)
    if (existing) {
      return existing
    }

    const id = `player_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    await this.pool.query(
      `INSERT INTO public.players (id, email, name, phone, preferred_contact, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, email, name, phone || null, preferredContact || null, now, now]
    )

    const player = await this.findById(id)
    if (!player) throw new NotFoundError('Player')
    return player
  }

  async findByEmail(email: string): Promise<PlayerRow | undefined> {
    const result = await this.pool.query('SELECT * FROM public.players WHERE email = $1', [email])
    const row = result.rows[0] as any
    if (!row) return undefined
    return { ...row, share_contact: !!row.share_contact }
  }

  async createRegistration(playerId: string, tournamentId: string): Promise<RegistrationRow> {
    const id = `reg_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    await this.pool.query(
      `INSERT INTO public.player_registrations (id, player_id, tournament_id, registered_at)
       VALUES ($1, $2, $3, $4)`,
      [id, playerId, tournamentId, now]
    )

    const registration = await this.findRegistration(playerId, tournamentId)
    if (!registration) throw new NotFoundError('Registration')
    return registration
  }

  async findRegistration(playerId: string, tournamentId: string): Promise<RegistrationRow | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM public.player_registrations WHERE player_id = $1 AND tournament_id = $2',
      [playerId, tournamentId]
    )
    return result.rows[0] as RegistrationRow | undefined
  }

  async countRegistrationsForTournament(tournamentId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM public.player_registrations WHERE tournament_id = $1',
      [tournamentId]
    )
    return Number((result.rows[0] as { count: any }).count)
  }

  async listTournamentsByPlayer(playerId: string, opts: ListOptions = {}): Promise<{ rows: TournamentRow[]; total: number }> {
    const offset = opts.offset || 0
    const limit = opts.limit || 10

    const countResult = await this.pool.query(
      `SELECT COUNT(DISTINCT t.id) as count FROM public.tournaments t
       JOIN public.player_registrations pr ON pr.tournament_id = t.id
       WHERE pr.player_id = $1 AND t.deleted_at IS NULL`,
      [playerId]
    )
    const total = Number((countResult.rows[0] as { count: any }).count)

    const result = await this.pool.query(
      `SELECT DISTINCT t.* FROM public.tournaments t
       JOIN public.player_registrations pr ON pr.tournament_id = t.id
       WHERE pr.player_id = $1 AND t.deleted_at IS NULL
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [playerId, limit, offset]
    )
    const rows = result.rows as TournamentRow[]

    return { rows, total }
  }

  async findRegistrationById(registrationId: string): Promise<RegistrationRow | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM public.player_registrations WHERE id = $1',
      [registrationId]
    )
    const row = result.rows[0] as any
    if (!row) return undefined
    return { ...row, partner_confirmed: !!row.partner_confirmed } as RegistrationRow
  }

  async findRegistrationsByTournament(tournamentId: string, opts: ListOptions = {}): Promise<{ rows: RegistrationRow[]; total: number }> {
    const offset = opts.offset || 0
    const limit = opts.limit || 50

    const countResult = await this.pool.query(
      'SELECT COUNT(*) as count FROM public.player_registrations WHERE tournament_id = $1',
      [tournamentId]
    )
    const total = Number((countResult.rows[0] as { count: any }).count)

    const result = await this.pool.query(
      `SELECT * FROM public.player_registrations
       WHERE tournament_id = $1
       ORDER BY registered_at DESC
       LIMIT $2 OFFSET $3`,
      [tournamentId, limit, offset]
    )
    const rows = (result.rows as any[]).map(r => ({ ...r, partner_confirmed: !!r.partner_confirmed })) as RegistrationRow[]

    return { rows, total }
  }

  async updateRegistrationWithPartner(registrationId: string, partnerId: string): Promise<RegistrationRow> {
    const now = new Date().toISOString()
    await this.pool.query(
      `UPDATE public.player_registrations
       SET partner_id = $1, status = $2, registered_at = $3
       WHERE id = $4`,
      [partnerId, 'pending_partner_confirm', now, registrationId]
    )
    const registration = await this.findRegistrationById(registrationId)
    if (!registration) throw new NotFoundError('Registration')
    return registration
  }

  async confirmPartner(registrationId: string): Promise<RegistrationRow> {
    const now = new Date().toISOString()
    await this.pool.query(
      `UPDATE public.player_registrations
       SET partner_confirmed = $1, status = $2, confirmed_at = $3
       WHERE id = $4`,
      [true, 'registered', now, registrationId]
    )
    const registration = await this.findRegistrationById(registrationId)
    if (!registration) throw new NotFoundError('Registration')
    return registration
  }

  async updateRegistrationStatus(registrationId: string, status: string): Promise<RegistrationRow> {
    const validStatuses = ['registered', 'pending_partner_confirm', 'withdrawn', 'withdrawal_pending']
    if (!validStatuses.includes(status)) {
      throw new CheckConstraintError('status')
    }

    await this.pool.query(
      `UPDATE public.player_registrations SET status = $1 WHERE id = $2`,
      [status, registrationId]
    )
    const registration = await this.findRegistrationById(registrationId)
    if (!registration) throw new NotFoundError('Registration')
    return registration
  }

  async withdrawRegistration(registrationId: string, isBeforeDeadline: boolean): Promise<RegistrationRow> {
    const now = new Date().toISOString()
    const status = isBeforeDeadline ? 'withdrawn' : 'withdrawal_pending'
    await this.pool.query(
      `UPDATE public.player_registrations
       SET status = $1, withdrawal_requested_at = $2
       WHERE id = $3`,
      [status, now, registrationId]
    )
    const registration = await this.findRegistrationById(registrationId)
    if (!registration) throw new NotFoundError('Registration')
    return registration
  }

  async findById(playerId: string): Promise<PlayerRow | undefined> {
    const result = await this.pool.query('SELECT * FROM public.players WHERE id = $1', [playerId])
    const row = result.rows[0] as any
    if (!row) return undefined
    return { ...row, share_contact: !!row.share_contact }
  }

  async updateShareContact(playerId: string, shareContact: boolean): Promise<PlayerRow> {
    const now = new Date().toISOString()
    await this.pool.query(
      `UPDATE public.players SET share_contact = $1, updated_at = $2 WHERE id = $3`,
      [shareContact, now, playerId]
    )
    const player = await this.findById(playerId)
    if (!player) throw new NotFoundError('Player')
    return player
  }
}

export class GroupRepository {
  constructor(private pool: DbConnection) {}

  async createGroups(tournamentId: string, numGroups: number, advancingCount: number, playerIds: string[]): Promise<GroupRow[]> {
    return retryOnDeadlock(async () => {
      const { client, isPoolClient } = await getClientFromConnection(this.pool)
      try {
        await client.query('BEGIN')

        const groupIds: string[] = []
        const now = new Date().toISOString()

        // Create groups
        for (let i = 1; i <= numGroups; i++) {
          const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2)}`
          groupIds.push(groupId)

          await client.query(
            `INSERT INTO public.groups (id, tournament_id, name, advancing_count, created_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [groupId, tournamentId, `Group ${String.fromCharCode(64 + i)}`, advancingCount, now]
          )
        }

        // Shuffle and distribute players evenly
        const shuffled = [...playerIds].sort(() => Math.random() - 0.5)
        const playersPerGroup = Math.ceil(shuffled.length / numGroups)

        for (let i = 0; i < numGroups; i++) {
          const groupId = groupIds[i]
          const start = i * playersPerGroup
          const end = Math.min(start + playersPerGroup, shuffled.length)
          const groupPlayers = shuffled.slice(start, end)

          // Add members and generate matches
          for (const playerId of groupPlayers) {
            await client.query(
              `INSERT INTO public.group_memberships (group_id, player_id)
               VALUES ($1, $2)`,
              [groupId, playerId]
            )
          }

          // Generate round-robin: each player plays every other player once
          for (let j = 0; j < groupPlayers.length; j++) {
            for (let k = j + 1; k < groupPlayers.length; k++) {
              const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2)}`
              await client.query(
                `INSERT INTO public.group_matches (id, group_id, tournament_id, format, player1_id, player2_id, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [matchId, groupId, tournamentId, 'singles', groupPlayers[j], groupPlayers[k], 'pending', now, now]
              )
            }
          }
        }

        await client.query('COMMIT')
        return this.findGroupsByTournament(tournamentId)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        releaseClientIfNeeded(client, isPoolClient)
      }
    })
  }

  async findGroupsByTournament(tournamentId: string): Promise<GroupRow[]> {
    const result = await this.pool.query(
      'SELECT * FROM public.groups WHERE tournament_id = $1 ORDER BY name',
      [tournamentId]
    )
    return result.rows as GroupRow[]
  }

  async findGroupById(groupId: string): Promise<GroupRow | undefined> {
    const result = await this.pool.query('SELECT * FROM public.groups WHERE id = $1', [groupId])
    return result.rows[0] as GroupRow | undefined
  }

  async findMatchesByGroup(groupId: string): Promise<GroupMatchRow[]> {
    const result = await this.pool.query(
      'SELECT * FROM public.group_matches WHERE group_id = $1 ORDER BY created_at',
      [groupId]
    )
    return result.rows as GroupMatchRow[]
  }

  async countPendingMatchesByTournament(tournamentId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM public.group_matches WHERE tournament_id = $1 AND status = $2',
      [tournamentId, 'pending']
    )
    return Number((result.rows[0] as { count: any }).count)
  }

  async findMembersByGroup(groupId: string): Promise<PlayerRow[]> {
    const result = await this.pool.query(
      `SELECT p.* FROM public.players p
       JOIN public.group_memberships gm ON gm.player_id = p.id
       WHERE gm.group_id = $1
       ORDER BY p.name`,
      [groupId]
    )
    return result.rows as PlayerRow[]
  }

  async findMatchById(matchId: string): Promise<GroupMatchRow | undefined> {
    const result = await this.pool.query('SELECT * FROM public.group_matches WHERE id = $1', [matchId])
    const row = result.rows[0] as any
    if (!row) return undefined
    return {
      ...row,
      player1_confirmed: !!row.player1_confirmed,
      player2_confirmed: !!row.player2_confirmed,
    }
  }

  async updateMatch(matchId: string, winnerId: string, score: string): Promise<GroupMatchRow> {
    const now = new Date().toISOString()
    await this.pool.query(
      `UPDATE public.group_matches SET winner_id = $1, score = $2, status = $3, updated_at = $4 WHERE id = $5`,
      [winnerId, score, 'completed', now, matchId]
    )
    const match = await this.findMatchById(matchId)
    if (!match) throw new NotFoundError('Match')
    return match
  }

  async findMatchByIdWithPlayers(matchId: string): Promise<GroupMatchWithPlayers | undefined> {
    const result = await this.pool.query(
      `SELECT gm.*,
              p1.name as player1_name, p1.email as player1_email, p1.share_contact as player1_share_contact,
              p2.name as player2_name, p2.email as player2_email, p2.share_contact as player2_share_contact
       FROM public.group_matches gm
       JOIN public.players p1 ON gm.player1_id = p1.id
       JOIN public.players p2 ON gm.player2_id = p2.id
       WHERE gm.id = $1`,
      [matchId]
    )
    const row = result.rows[0] as any
    if (!row) return undefined
    return {
      ...row,
      player1_confirmed: !!row.player1_confirmed,
      player2_confirmed: !!row.player2_confirmed,
    }
  }

  async findMatchesByPlayer(tournamentId: string, playerId: string): Promise<GroupMatchWithPlayers[]> {
    const result = await this.pool.query(
      `SELECT gm.*,
              p1.name as player1_name, p1.email as player1_email, p1.share_contact as player1_share_contact,
              p2.name as player2_name, p2.email as player2_email, p2.share_contact as player2_share_contact
       FROM public.group_matches gm
       JOIN public.players p1 ON gm.player1_id = p1.id
       JOIN public.players p2 ON gm.player2_id = p2.id
       WHERE gm.tournament_id = $1 AND (gm.player1_id = $2 OR gm.player2_id = $3)
       ORDER BY gm.created_at`,
      [tournamentId, playerId, playerId]
    )
    return (result.rows as any[]).map(row => ({
      ...row,
      player1_confirmed: !!row.player1_confirmed,
      player2_confirmed: !!row.player2_confirmed,
    }))
  }

  async confirmMatch(matchId: string, position: 'player1' | 'player2'): Promise<GroupMatchRow> {
    const now = new Date().toISOString()
    if (position === 'player1') {
      await this.pool.query(
        'UPDATE public.group_matches SET player1_confirmed = $1, player1_confirmed_at = $2, updated_at = $3 WHERE id = $4',
        [true, now, now, matchId]
      )
    } else {
      await this.pool.query(
        'UPDATE public.group_matches SET player2_confirmed = $1, player2_confirmed_at = $2, updated_at = $3 WHERE id = $4',
        [true, now, now, matchId]
      )
    }
    const match = await this.findMatchById(matchId)
    if (!match) throw new NotFoundError('Match')
    return match
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
  player1_confirmed: boolean
  player2_confirmed: boolean
  player1_confirmed_at?: string
  player2_confirmed_at?: string
  created_at: string
  updated_at: string
}

export interface KnockoutMatchWithPlayers extends KnockoutMatchRow {
  player1_name: string | null
  player1_email: string | null
  player1_share_contact: boolean
  player2_name: string | null
  player2_email: string | null
  player2_share_contact: boolean
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
  constructor(private pool: DbConnection) {}

  async setSeeds(tournamentId: string, seeds: Array<{ playerId: string; seedPosition: number }>): Promise<void> {
    return retryOnDeadlock(async () => {
      const { client, isPoolClient } = await getClientFromConnection(this.pool)
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM public.bracket_seeds WHERE tournament_id = $1', [tournamentId])

        for (const seed of seeds) {
          await client.query(
            'INSERT INTO public.bracket_seeds (tournament_id, seed_position, player_id) VALUES ($1, $2, $3)',
            [tournamentId, seed.seedPosition, seed.playerId]
          )
        }

        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        releaseClientIfNeeded(client, isPoolClient)
      }
    })
  }

  async getSeeds(tournamentId: string): Promise<Array<{ playerId: string; seedPosition: number }>> {
    const result = await this.pool.query(
      'SELECT * FROM public.bracket_seeds WHERE tournament_id = $1 ORDER BY seed_position',
      [tournamentId]
    )
    return (result.rows as Array<{ tournament_id: string; seed_position: number; player_id: string }>).map((r) => ({
      playerId: r.player_id,
      seedPosition: r.seed_position,
    }))
  }

  async createKnockoutMatches(tournamentId: string, bracket: any, seedMap: Map<number, string>): Promise<KnockoutMatchRow[]> {
    return retryOnDeadlock(async () => {
      const { client, isPoolClient } = await getClientFromConnection(this.pool)
      try {
        await client.query('BEGIN')

        const now = new Date().toISOString()

        for (const round of bracket.rounds) {
          for (const match of round.matches) {
            const id = `km_${Date.now()}_${Math.random().toString(36).slice(2)}`
            const player1Id = match.player1 ? seedMap.get(parseInt(match.player1.replace('seed_', ''))) ?? null : null
            const player2Id = match.player2 ? seedMap.get(parseInt(match.player2.replace('seed_', ''))) ?? null : null
            const status = player2Id === null && player1Id !== null ? 'bye' : 'pending'
            await client.query(
              `INSERT INTO public.knockout_matches (id, tournament_id, round, position, format, player1_id, player2_id, status, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [id, tournamentId, match.round, match.position, 'singles', player1Id, player2Id, status, now, now]
            )
          }
        }

        await client.query('COMMIT')
        return this.findKnockoutMatchesByTournament(tournamentId)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        releaseClientIfNeeded(client, isPoolClient)
      }
    })
  }

  async findKnockoutMatchesByTournament(tournamentId: string): Promise<KnockoutMatchRow[]> {
    const result = await this.pool.query(
      'SELECT * FROM public.knockout_matches WHERE tournament_id = $1 ORDER BY round, position',
      [tournamentId]
    )
    return result.rows as KnockoutMatchRow[]
  }

  async findKnockoutMatchById(matchId: string): Promise<KnockoutMatchRow | undefined> {
    const result = await this.pool.query('SELECT * FROM public.knockout_matches WHERE id = $1', [matchId])
    const row = result.rows[0] as any
    if (!row) return undefined
    return { ...row, player1_confirmed: !!row.player1_confirmed, player2_confirmed: !!row.player2_confirmed }
  }

  async updateKnockoutMatch(matchId: string, winnerId: string, score: string): Promise<KnockoutMatchRow> {
    const now = new Date().toISOString()
    await this.pool.query(
      'UPDATE public.knockout_matches SET winner_id = $1, score = $2, status = $3, updated_at = $4 WHERE id = $5',
      [winnerId, score, 'completed', now, matchId]
    )
    const match = await this.findKnockoutMatchById(matchId)
    if (!match) throw new NotFoundError('Match')
    return match
  }

  async findKnockoutMatchByIdWithPlayers(matchId: string): Promise<KnockoutMatchWithPlayers | undefined> {
    const result = await this.pool.query(
      `SELECT km.*,
              p1.name as player1_name, p1.email as player1_email, p1.share_contact as player1_share_contact,
              p2.name as player2_name, p2.email as player2_email, p2.share_contact as player2_share_contact
       FROM public.knockout_matches km
       LEFT JOIN public.players p1 ON km.player1_id = p1.id
       LEFT JOIN public.players p2 ON km.player2_id = p2.id
       WHERE km.id = $1`,
      [matchId]
    )
    const row = result.rows[0] as any
    if (!row) return undefined
    return {
      ...row,
      player1_confirmed: !!row.player1_confirmed,
      player2_confirmed: !!row.player2_confirmed,
    }
  }

  async findKnockoutMatchesByPlayer(tournamentId: string, playerId: string): Promise<KnockoutMatchWithPlayers[]> {
    const result = await this.pool.query(
      `SELECT km.*,
              p1.name as player1_name, p1.email as player1_email, p1.share_contact as player1_share_contact,
              p2.name as player2_name, p2.email as player2_email, p2.share_contact as player2_share_contact
       FROM public.knockout_matches km
       LEFT JOIN public.players p1 ON km.player1_id = p1.id
       LEFT JOIN public.players p2 ON km.player2_id = p2.id
       WHERE km.tournament_id = $1 AND (km.player1_id = $2 OR km.player2_id = $3)
       ORDER BY km.round, km.position`,
      [tournamentId, playerId, playerId]
    )
    return (result.rows as any[]).map(row => ({
      ...row,
      player1_confirmed: !!row.player1_confirmed,
      player2_confirmed: !!row.player2_confirmed,
    }))
  }

  async confirmKnockoutMatch(matchId: string, position: 'player1' | 'player2'): Promise<KnockoutMatchRow> {
    const now = new Date().toISOString()
    if (position === 'player1') {
      await this.pool.query(
        'UPDATE public.knockout_matches SET player1_confirmed = $1, player1_confirmed_at = $2, updated_at = $3 WHERE id = $4',
        [true, now, now, matchId]
      )
    } else {
      await this.pool.query(
        'UPDATE public.knockout_matches SET player2_confirmed = $1, player2_confirmed_at = $2, updated_at = $3 WHERE id = $4',
        [true, now, now, matchId]
      )
    }
    const match = await this.findKnockoutMatchById(matchId)
    if (!match) throw new NotFoundError('Match')
    return match
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
  constructor(private pool: DbConnection) {}

  async create(input: CreateLocationInput): Promise<LocationRow> {
    const id = `location_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    await this.pool.query(
      `INSERT INTO public.locations (
        id, name, sport, latitude, longitude, total_courts,
        restricted, entry_conditions, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        input.name,
        input.sport,
        input.latitude,
        input.longitude,
        input.totalCourts,
        input.restricted ?? false,
        input.entryConditions || null,
        now,
        now,
      ]
    )

    const location = await this.findById(id)
    if (!location) throw new NotFoundError('Location')
    return location
  }

  async findById(id: string): Promise<LocationRow | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM public.locations WHERE id = $1 AND deleted_at IS NULL',
      [id]
    )
    const row = result.rows[0] as any
    if (!row) return undefined
    const { deleted_at, ...rest } = row
    return { ...rest, restricted: !!rest.restricted } as LocationRow
  }

  async findBySport(sport: string, opts: ListOptions = {}): Promise<{ rows: LocationRow[]; total: number }> {
    const offset = opts.offset || 0
    const limit = opts.limit || 10

    const countResult = await this.pool.query(
      'SELECT COUNT(*) as count FROM public.locations WHERE sport = $1 AND deleted_at IS NULL',
      [sport]
    )
    const total = Number((countResult.rows[0] as { count: any }).count)

    const result = await this.pool.query(
      `SELECT * FROM public.locations WHERE sport = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [sport, limit, offset]
    )
    const rows = (result.rows as any[]).map(r => ({ ...r, restricted: !!r.restricted })) as LocationRow[]

    return { rows, total }
  }

  async listAll(opts: ListOptions = {}): Promise<{ rows: LocationRow[]; total: number }> {
    const offset = opts.offset || 0
    const limit = opts.limit || 10

    const countResult = await this.pool.query('SELECT COUNT(*) as count FROM public.locations WHERE deleted_at IS NULL')
    const total = Number((countResult.rows[0] as { count: any }).count)

    const result = await this.pool.query(
      `SELECT * FROM public.locations WHERE deleted_at IS NULL
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
    const rows = (result.rows as any[]).map(r => ({ ...r, restricted: !!r.restricted })) as LocationRow[]

    return { rows, total }
  }

  async update(id: string, input: UpdateLocationInput): Promise<LocationRow> {
    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex}`)
      values.push(input.name)
      paramIndex++
    }
    if (input.totalCourts !== undefined) {
      updates.push(`total_courts = $${paramIndex}`)
      values.push(input.totalCourts)
      paramIndex++
    }
    if (input.restricted !== undefined) {
      updates.push(`restricted = $${paramIndex}`)
      values.push(input.restricted)
      paramIndex++
    }
    if (input.entryConditions !== undefined) {
      updates.push(`entry_conditions = $${paramIndex}`)
      values.push(input.entryConditions || null)
      paramIndex++
    }

    updates.push(`updated_at = $${paramIndex}`)
    values.push(new Date().toISOString())
    paramIndex++

    values.push(id)

    await this.pool.query(
      `UPDATE public.locations SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    )

    const location = await this.findById(id)
    if (!location) throw new NotFoundError('Location')
    return location
  }

  async calculateCapacity(locationId: string): Promise<number> {
    const location = await this.findById(locationId)
    if (!location) return 0

    const result = await this.pool.query(
      `SELECT COUNT(*) as unavailable_count FROM public.courts
       WHERE location_id = $1 AND status != $2`,
      [locationId, 'available']
    )
    const unavailableCount = Number((result.rows[0] as { unavailable_count: any }).unavailable_count)

    return location.total_courts - unavailableCount
  }

  async findNearby(latitude: number, longitude: number, radiusKm: number = 0.025): Promise<LocationRow[]> {
    const result = await this.pool.query(
      `SELECT * FROM public.locations
       WHERE deleted_at IS NULL
         AND (latitude BETWEEN $1 AND $2)
         AND (longitude BETWEEN $3 AND $4)
       ORDER BY created_at DESC`,
      [latitude - radiusKm, latitude + radiusKm, longitude - radiusKm, longitude + radiusKm]
    )

    return (result.rows as any[]).map(r => ({ ...r, restricted: !!r.restricted })) as LocationRow[]
  }

  async softDelete(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE public.locations SET deleted_at = $1 WHERE id = $2',
      [new Date().toISOString(), id]
    )
  }
}

export interface CreateCourtInput {
  locationId: string
  status?: 'available' | 'unavailable' | 'maintenance'
}

export class CourtRepository {
  constructor(private pool: DbConnection) {}

  async create(input: CreateCourtInput): Promise<CourtRow> {
    const id = `court_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    // Validate status enum
    const validStatuses = ['available', 'unavailable', 'maintenance']
    const status = input.status || 'available'
    if (!validStatuses.includes(status)) {
      throw new CheckConstraintError('status')
    }

    await this.pool.query(
      `INSERT INTO public.courts (id, location_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, input.locationId, status, now, now]
    )

    const court = await this.findById(id)
    if (!court) throw new NotFoundError('Court')
    return court
  }

  async findById(id: string): Promise<CourtRow | undefined> {
    const result = await this.pool.query('SELECT * FROM public.courts WHERE id = $1', [id])
    return result.rows[0] as CourtRow | undefined
  }

  async findByLocation(locationId: string): Promise<CourtRow[]> {
    const result = await this.pool.query(
      'SELECT * FROM public.courts WHERE location_id = $1 ORDER BY created_at',
      [locationId]
    )
    return result.rows as CourtRow[]
  }

  async updateStatus(id: string, status: 'available' | 'unavailable' | 'maintenance'): Promise<CourtRow> {
    const validStatuses = ['available', 'unavailable', 'maintenance']
    if (!validStatuses.includes(status)) {
      throw new CheckConstraintError('status')
    }

    const now = new Date().toISOString()
    await this.pool.query(
      'UPDATE public.courts SET status = $1, updated_at = $2 WHERE id = $3',
      [status, now, id]
    )

    const court = await this.findById(id)
    if (!court) throw new NotFoundError('Court')
    return court
  }

  async countByLocation(locationId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM public.courts WHERE location_id = $1',
      [locationId]
    )
    return Number((result.rows[0] as { count: any }).count)
  }

  async countByLocationAndStatus(locationId: string, status: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM public.courts WHERE location_id = $1 AND status = $2',
      [locationId, status]
    )
    return Number((result.rows[0] as { count: any }).count)
  }
}

export class AccountRepository {
  constructor(private pool: DbConnection) {}

  async create(email: string, role: string, status: string = 'active'): Promise<AccountRow> {
    const id = `account_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()

    log.debug('account.query', { method: 'create', email })

    try {
      await this.pool.query(
        `INSERT INTO auth.accounts (id, email, password_hash, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, email.toLowerCase(), '', role, status, now, now]
      )
    } catch (err) {
      if (err instanceof Error && (err.message.includes('unique violation') || err.message.includes('duplicate key'))) {
        throw new UniqueConstraintError('email')
      }
      throw err
    }

    const account = await this.findById(id)
    if (!account) throw new NotFoundError('Account')
    return account
  }

  async findByEmail(email: string): Promise<AccountRow | null> {
    log.debug('account.query', { method: 'findByEmail' })

    const result = await this.pool.query(
      'SELECT * FROM auth.accounts WHERE LOWER(email) = LOWER($1)',
      [email]
    )
    const row = result.rows[0] as any
    if (!row) return null
    return this.formatAccountRow(row)
  }

  async findById(id: string): Promise<AccountRow | null> {
    log.debug('account.query', { method: 'findById' })

    const result = await this.pool.query(
      'SELECT * FROM auth.accounts WHERE id = $1',
      [id]
    )
    const row = result.rows[0] as any
    if (!row) return null
    return this.formatAccountRow(row)
  }

  private formatAccountRow(row: any): AccountRow {
    return {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      role: row.role,
      status: row.status,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      deleted_at: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at,
    }
  }

  async updatePasswordHash(id: string, hash: string): Promise<void> {
    const now = new Date().toISOString()

    log.debug('account.query', { method: 'updatePasswordHash' })

    await this.pool.query(
      'UPDATE auth.accounts SET password_hash = $1, updated_at = $2 WHERE id = $3',
      [hash, now, id]
    )
  }

  async getAttempts(id: string): Promise<number> {
    log.debug('account.query', { method: 'getAttempts' })

    const result = await this.pool.query(
      `SELECT COALESCE(SUM(attempts), 0) as total_attempts
       FROM auth.password_reset_codes
       WHERE account_id = $1`,
      [id]
    )
    return Number((result.rows[0] as { total_attempts: any }).total_attempts)
  }
}

export interface PasswordResetCodeRow {
  id: string
  account_id: string
  code: string
  attempts: number
  expires_at: string
  used_at: string | null
  created_at: string
}

export class PasswordResetCodeRepository {
  constructor(private pool: DbConnection) {}

  /**
   * Generate a cryptographically secure random 6-digit code.
   */
  static generateCode(): string {
    const code = randomInt(0, 1000000)
    return String(code).padStart(6, '0')
  }

  /**
   * Check if a password reset code has expired.
   */
  static isExpired(row: PasswordResetCodeRow): boolean {
    const now = new Date()
    const expiresAt = new Date(row.expires_at)
    return now > expiresAt
  }

  /**
   * Check if a password reset code has been used.
   */
  static isUsed(row: PasswordResetCodeRow): boolean {
    return row.used_at !== null
  }

  /**
   * Create a new password reset code for an account.
   * @param accountId The account ID
   * @param code The 6-digit reset code
   * @param expirationMinutes Number of minutes until the code expires
   * @returns The created PasswordResetCodeRow
   */
  async create(accountId: string, code: string, expirationMinutes: number): Promise<PasswordResetCodeRow> {
    const id = `prc_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + expirationMinutes * 60 * 1000)

    await this.pool.query(
      `INSERT INTO auth.password_reset_codes (id, account_id, code, attempts, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, accountId, code, 0, expiresAt.toISOString(), now.toISOString()]
    )

    log.info('reset_code.created', { accountId, expiresAt: expiresAt.toISOString() })

    const row = await this.findById(id)
    if (!row) throw new NotFoundError('PasswordResetCode')
    return row
  }

  /**
   * Find a password reset code by its ID.
   */
  private async findById(id: string): Promise<PasswordResetCodeRow | null> {
    const result = await this.pool.query(
      'SELECT * FROM auth.password_reset_codes WHERE id = $1',
      [id]
    )
    return (result.rows[0] as PasswordResetCodeRow | undefined) ?? null
  }

  /**
   * Find a password reset code by its 6-digit code.
   * Returns null if not found or if expired.
   */
  async findByCode(code: string): Promise<PasswordResetCodeRow | null> {
    const result = await this.pool.query(
      'SELECT * FROM auth.password_reset_codes WHERE code = $1',
      [code]
    )
    const row = (result.rows[0] as PasswordResetCodeRow | undefined) ?? null
    return row
  }

  /**
   * Find the latest password reset code for an account.
   * Returns null if no codes exist for the account.
   */
  async findByAccountId(accountId: string): Promise<PasswordResetCodeRow | null> {
    const result = await this.pool.query(
      'SELECT * FROM auth.password_reset_codes WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
      [accountId]
    )
    return (result.rows[0] as PasswordResetCodeRow | undefined) ?? null
  }

  /**
   * Increment the attempt counter for a password reset code.
   * @param id The password reset code ID
   * @returns The new attempt count (0 if code not found)
   */
  async incrementAttempts(id: string): Promise<number> {
    const result = await this.pool.query(
      'UPDATE auth.password_reset_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
      [id]
    )
    return result.rows.length > 0 ? Number(result.rows[0].attempts) : 0
  }

  /**
   * Mark a password reset code as used.
   * @param id The password reset code ID
   */
  async markAsUsed(id: string): Promise<void> {
    const now = new Date().toISOString()
    await this.pool.query(
      'UPDATE auth.password_reset_codes SET used_at = $1 WHERE id = $2',
      [now, id]
    )
  }

  /**
   * Delete all expired password reset codes.
   * @returns The number of codes deleted
   */
  async deleteExpired(): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM auth.password_reset_codes WHERE expires_at < NOW()'
    )
    return result.rowCount || 0
  }
}
