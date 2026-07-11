import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('group-repository')

export interface GroupRow {
  id: string
  name: string
  createdBy: string
  defaultMatchFormat: 'singles' | 'doubles'
  createdAt: Date
  assistantEnabled: boolean
}

export interface MemberRow {
  groupId: string
  playerId: string
  role: 'owner' | 'member'
  notifyLevel: string
  joinedAt: Date
}

export interface CreateGroupInput {
  name: string
  createdBy: string
  defaultMatchFormat?: 'singles' | 'doubles'
}

// Thrown when an action would leave the group with zero owners and no auto-transfer is possible.
export class LastOwnerError extends Error {
  constructor() {
    super('Cannot remove or demote the last owner of a group')
    this.name = 'LastOwnerError'
  }
}

export class GroupRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new player group and add the creator as role='owner' atomically.
   */
  async createGroup(input: CreateGroupInput): Promise<GroupRow> {
    const { name, createdBy, defaultMatchFormat } = input
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const groupResult = await client.query(
        `INSERT INTO public.player_groups (name, created_by${defaultMatchFormat ? ', default_match_format' : ''})
         VALUES ($1, $2${defaultMatchFormat ? ', $3' : ''})
         RETURNING id, name, created_by, default_match_format, created_at, assistant_enabled`,
        defaultMatchFormat ? [name, createdBy, defaultMatchFormat] : [name, createdBy]
      )
      const row = groupResult.rows[0]

      await client.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'owner')`,
        [row.id, createdBy]
      )

      await client.query('COMMIT')

      const group = rowToGroup(row)
      log.info('group.created', { groupId: group.id, createdBy: group.createdBy })

      return group
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Promote a member to owner.
   * Requires the actor to be an owner of the group.
   * Throws if the target is not a member of the group.
   */
  async promoteMember(
    groupId: string,
    actorPlayerId: string,
    targetPlayerId: string
  ): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      await this.assertOwner(client, groupId, actorPlayerId)

      const result = await client.query(
        `UPDATE public.player_group_members
         SET role = 'owner'
         WHERE group_id = $1 AND player_id = $2
         RETURNING player_id`,
        [groupId, targetPlayerId]
      )
      if (result.rowCount === 0) {
        throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
      }

      await client.query('COMMIT')

      log.info('group.member.promoted', { groupId, actorPlayerId, targetPlayerId })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Demote an owner to member.
   * Requires the actor to be an owner. Blocked if target is the last owner.
   */
  async demoteMember(
    groupId: string,
    actorPlayerId: string,
    targetPlayerId: string
  ): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      await this.assertOwner(client, groupId, actorPlayerId)
      await this.assertNotLastOwner(client, groupId, targetPlayerId)

      const result = await client.query(
        `UPDATE public.player_group_members
         SET role = 'member'
         WHERE group_id = $1 AND player_id = $2
         RETURNING player_id`,
        [groupId, targetPlayerId]
      )
      if (result.rowCount === 0) {
        throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
      }

      await client.query('COMMIT')

      log.info('group.member.demoted', { groupId, actorPlayerId, targetPlayerId })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Kick (remove) a member from the group.
   * Requires the actor to be an owner. Cannot kick the last owner.
   */
  async kickMember(
    groupId: string,
    actorPlayerId: string,
    targetPlayerId: string
  ): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      await this.assertOwner(client, groupId, actorPlayerId)

      // Check if target is last owner
      const targetRole = await this.getMemberRole(client, groupId, targetPlayerId)
      if (targetRole === null) {
        throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
      }
      if (targetRole === 'owner') {
        await this.assertNotLastOwner(client, groupId, targetPlayerId)
      }

      await client.query(
        `DELETE FROM public.player_group_members
         WHERE group_id = $1 AND player_id = $2`,
        [groupId, targetPlayerId]
      )

      await client.query('COMMIT')

      log.info('group.member.removed', { groupId, actorPlayerId, targetPlayerId })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Self-leave: a member removes themselves from the group.
   * - If they are a non-last owner or a member: remove row directly.
   * - If they are the last owner and other members exist: auto-transfer to
   *   the longest-tenured remaining member (earliest joined_at), then remove.
   * - If they are the last owner with no other members: blocked (LastOwnerError).
   *
   * The check+mutate is in one transaction to prevent races.
   */
  async leaveGroup(groupId: string, playerId: string): Promise<{ autoTransferredTo?: string }> {
    const client = await this.pool.connect()
    let autoTransferredTo: string | undefined
    try {
      await client.query('BEGIN')

      const role = await this.getMemberRole(client, groupId, playerId)
      if (role === null) {
        throw Object.assign(new Error('Not a member of this group'), { code: 'NOT_FOUND' })
      }

      if (role === 'owner') {
        // Count remaining owners excluding this player
        const ownerCountResult = await client.query(
          `SELECT COUNT(*) FROM public.player_group_members
           WHERE group_id = $1 AND role = 'owner' AND player_id != $2`,
          [groupId, playerId]
        )
        const remainingOwnerCount = parseInt(ownerCountResult.rows[0].count)

        if (remainingOwnerCount === 0) {
          // Last owner: auto-transfer or block
          const longestTenuredResult = await client.query(
            `SELECT player_id FROM public.player_group_members
             WHERE group_id = $1 AND player_id != $2
             ORDER BY joined_at ASC
             LIMIT 1`,
            [groupId, playerId]
          )

          if (longestTenuredResult.rowCount === 0) {
            // No other members — cannot leave
            throw new LastOwnerError()
          }

          const newOwnerPlayerId = longestTenuredResult.rows[0].player_id as string

          // Transfer ownership
          await client.query(
            `UPDATE public.player_group_members
             SET role = 'owner'
             WHERE group_id = $1 AND player_id = $2`,
            [groupId, newOwnerPlayerId]
          )

          autoTransferredTo = newOwnerPlayerId

          log.info('group.ownership.transferred', {
            groupId,
            fromPlayerId: playerId,
            toPlayerId: newOwnerPlayerId,
          })
        }
      }

      // Remove the leaving member's row
      await client.query(
        `DELETE FROM public.player_group_members
         WHERE group_id = $1 AND player_id = $2`,
        [groupId, playerId]
      )

      await client.query('COMMIT')

      log.info('group.member.removed', { groupId, playerId, reason: 'self-leave' })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    return { autoTransferredTo }
  }

  /**
   * Remove a player from all groups unconditionally (DSR hard-delete of membership).
   * Idempotent: safe to re-run if player is already not a member of any group.
   */
  async removeFromAllGroups(playerId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM public.player_group_members WHERE player_id = $1`,
      [playerId]
    )
    log.info('group.member.removed_all', { playerId })
  }

  /**
   * List all groups a player is a member of (G2.5 — My Groups tab).
   * Returns group id, name, the player's role, and total member count.
   */
  async getGroupsForPlayer(
    playerId: string
  ): Promise<Array<{ id: string; name: string; role: 'owner' | 'member'; memberCount: number; assistantEnabled: boolean }>> {
    const result = await this.pool.query(
      `SELECT g.id, g.name, m.role, g.assistant_enabled,
              (SELECT COUNT(*) FROM public.player_group_members WHERE group_id = g.id)::int AS member_count
       FROM public.player_groups g
       JOIN public.player_group_members m ON m.group_id = g.id AND m.player_id = $1
       ORDER BY g.created_at DESC`,
      [playerId]
    )
    return result.rows.map(row => ({
      id: row.id as string,
      name: row.name as string,
      role: row.role as 'owner' | 'member',
      memberCount: row.member_count as number,
      assistantEnabled: row.assistant_enabled as boolean,
    }))
  }

  /**
   * List all members of a group (G2.5 — Members panel).
   * Returns playerId, display name, role, and join date.
   */
  async getGroupMembers(
    groupId: string
  ): Promise<Array<{ playerId: string; name: string; role: 'owner' | 'member'; joinedAt: Date }>> {
    const result = await this.pool.query(
      `SELECT m.player_id, COALESCE(p.name, m.player_id) AS name, m.role, m.joined_at
       FROM public.player_group_members m
       JOIN public.players p ON p.id = m.player_id
       WHERE m.group_id = $1
       ORDER BY m.joined_at ASC`,
      [groupId]
    )
    return result.rows.map(row => ({
      playerId: row.player_id as string,
      name: row.name as string,
      role: row.role as 'owner' | 'member',
      joinedAt: row.joined_at instanceof Date ? row.joined_at : new Date(row.joined_at),
    }))
  }

  /**
   * Get all members of a group for notification selection.
   * Returns playerId, notifyLevel, and display name for each member.
   * Used by G2.4 to compute per-recipient notify eligibility.
   */
  async getGroupMembersForNotify(
    groupId: string
  ): Promise<Array<{ playerId: string; notifyLevel: string; name: string }>> {
    const result = await this.pool.query(
      `SELECT m.player_id, m.notify_level, COALESCE(p.name, '') AS name
       FROM public.player_group_members m
       JOIN public.players p ON p.id = m.player_id
       WHERE m.group_id = $1`,
      [groupId]
    )
    return result.rows.map(row => ({
      playerId: row.player_id as string,
      notifyLevel: row.notify_level as string,
      name: row.name as string,
    }))
  }

  /**
   * Update the notify_level for a group member (B-NOTIFYLVL).
   * Throws NOT_FOUND if the player is not a member of the group.
   */
  async updateNotifyLevel(
    groupId: string,
    playerId: string,
    notifyLevel: 'all' | 'mentions_polls' | 'muted'
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE public.player_group_members
       SET notify_level = $3
       WHERE group_id = $1 AND player_id = $2`,
      [groupId, playerId, notifyLevel]
    )
    if (result.rowCount === 0) {
      throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
    }
  }

  /**
   * Update group name and/or default_match_format. Actor must be an owner.
   * Returns the updated group row.
   */
  async updateGroup(
    groupId: string,
    actorPlayerId: string,
    updates: { name?: string; defaultMatchFormat?: 'singles' | 'doubles'; assistantEnabled?: boolean }
  ): Promise<GroupRow & { assistantEnabledTransitionedOn: boolean }> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await this.assertOwner(client, groupId, actorPlayerId)

      // Capture the pre-update value to detect an off→on transition (A6.2:
      // the intro message re-posts on every off→on flip, including rollout).
      const before = await client.query(
        `SELECT assistant_enabled FROM public.player_groups WHERE id = $1`,
        [groupId]
      )
      const wasEnabled = before.rows[0]?.assistant_enabled === true

      const setClauses: string[] = []
      const params: unknown[] = [groupId]

      if (updates.name !== undefined) {
        params.push(updates.name)
        setClauses.push(`name = $${params.length}`)
      }
      if (updates.defaultMatchFormat !== undefined) {
        params.push(updates.defaultMatchFormat)
        setClauses.push(`default_match_format = $${params.length}`)
      }
      if (updates.assistantEnabled !== undefined) {
        params.push(updates.assistantEnabled)
        setClauses.push(`assistant_enabled = $${params.length}`)
      }

      if (setClauses.length === 0) {
        // Nothing to update — return current row
        const current = await client.query(
          `SELECT id, name, created_by, default_match_format, created_at, assistant_enabled
           FROM public.player_groups WHERE id = $1`,
          [groupId]
        )
        await client.query('COMMIT')
        return { ...rowToGroup(current.rows[0]), assistantEnabledTransitionedOn: false }
      }

      const result = await client.query(
        `UPDATE public.player_groups SET ${setClauses.join(', ')} WHERE id = $1
         RETURNING id, name, created_by, default_match_format, created_at, assistant_enabled`,
        params
      )

      await client.query('COMMIT')
      const group = rowToGroup(result.rows[0])
      const assistantEnabledTransitionedOn =
        updates.assistantEnabled === true && !wasEnabled
      return { ...group, assistantEnabledTransitionedOn }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Get a member's role, or null if not a member.
   */
  async getMemberRole(
    clientOrPool: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
    groupId: string,
    playerId: string
  ): Promise<'owner' | 'member' | null> {
    const result = await clientOrPool.query(
      `SELECT role FROM public.player_group_members
       WHERE group_id = $1 AND player_id = $2`,
      [groupId, playerId]
    )
    if (result.rows.length === 0) return null
    return result.rows[0].role as 'owner' | 'member'
  }

  /**
   * Check group existence and that the actor is an owner.
   * Throws NOT_FOUND if group doesn't exist, FORBIDDEN if actor is not an owner.
   */
  private async assertOwner(
    client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
    groupId: string,
    actorPlayerId: string
  ): Promise<void> {
    // Check group exists
    const groupResult = await client.query(
      `SELECT id FROM public.player_groups WHERE id = $1`,
      [groupId]
    )
    if (groupResult.rows.length === 0) {
      throw Object.assign(new Error('Group not found'), { code: 'NOT_FOUND' })
    }

    // Check actor is an owner
    const memberResult = await client.query(
      `SELECT role FROM public.player_group_members
       WHERE group_id = $1 AND player_id = $2`,
      [groupId, actorPlayerId]
    )
    if (
      memberResult.rows.length === 0 ||
      memberResult.rows[0].role !== 'owner'
    ) {
      throw Object.assign(new Error('Not an owner of this group'), { code: 'FORBIDDEN' })
    }
  }

  /**
   * Assert that the target is NOT the last owner. Throws LastOwnerError if they are.
   */
  private async assertNotLastOwner(
    client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }> },
    groupId: string,
    targetPlayerId: string
  ): Promise<void> {
    const result = await client.query(
      `SELECT player_id FROM public.player_group_members
       WHERE group_id = $1 AND role = 'owner' AND player_id != $2`,
      [groupId, targetPlayerId]
    )
    if (result.rows.length === 0) {
      throw new LastOwnerError()
    }
  }
}

function rowToGroup(row: any): GroupRow {
  return {
    id: row.id as string,
    name: row.name as string,
    createdBy: row.created_by as string,
    defaultMatchFormat: row.default_match_format as 'singles' | 'doubles',
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    assistantEnabled: row.assistant_enabled as boolean,
  }
}
