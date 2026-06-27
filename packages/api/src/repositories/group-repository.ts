import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('group-repository')

export interface GroupRow {
  id: string
  name: string
  createdBy: string
  defaultMatchFormat: 'singles' | 'doubles'
  createdAt: Date
}

export interface CreateGroupInput {
  name: string
  createdBy: string
  defaultMatchFormat?: 'singles' | 'doubles'
}

export class GroupRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new player group.
   * The caller is responsible for inserting the creator as a role='owner' member.
   * Full membership lifecycle is implemented in G1.2.
   */
  async createGroup(input: CreateGroupInput): Promise<GroupRow> {
    const { name, createdBy, defaultMatchFormat } = input
    const result = await this.pool.query(
      `INSERT INTO public.player_groups (name, created_by${defaultMatchFormat ? ', default_match_format' : ''})
       VALUES ($1, $2${defaultMatchFormat ? ', $3' : ''})
       RETURNING id, name, created_by, default_match_format, created_at`,
      defaultMatchFormat ? [name, createdBy, defaultMatchFormat] : [name, createdBy]
    )
    const row = result.rows[0]
    const group = rowToGroup(row)

    log.info('group.created', { groupId: group.id, createdBy: group.createdBy })

    return group
  }
}

function rowToGroup(row: any): GroupRow {
  return {
    id: row.id as string,
    name: row.name as string,
    createdBy: row.created_by as string,
    defaultMatchFormat: row.default_match_format as 'singles' | 'doubles',
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }
}
