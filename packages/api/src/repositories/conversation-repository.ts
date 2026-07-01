import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('conversation-repository')

/**
 * ConversationRepository — manages messaging.conversations rows.
 *
 * V1.0 scope: type='tournament' conversations (resolveConversation).
 * G2.1 scope: type='group' conversations (resolveGroupConversation) +
 *             per-store DSR erasure primitive (anonymizeGroupMessagesFor).
 */
export class ConversationRepository {
  constructor(private pool: Pool) {}

  /**
   * Return the conversation_id for a tournament, creating one if it does not
   * exist yet. Idempotent: concurrent calls for the same tournament_id are
   * safe (INSERT … ON CONFLICT DO NOTHING + SELECT).
   */
  async resolveConversation(tournamentId: string): Promise<string> {
    // Upsert: insert if not present, then return the id in both cases.
    const result = await this.pool.query(
      `INSERT INTO messaging.conversations (type, tournament_id)
       VALUES ('tournament', $1)
       ON CONFLICT (tournament_id) WHERE tournament_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [tournamentId]
    )

    if (result.rows.length > 0) {
      log.debug('conversation.created', { tournamentId, conversationId: result.rows[0].id })
      return result.rows[0].id as string
    }

    // Row already existed — fetch it.
    const existing = await this.pool.query(
      `SELECT id FROM messaging.conversations WHERE tournament_id = $1`,
      [tournamentId]
    )
    return existing.rows[0].id as string
  }

  /**
   * Return the conversation_id for a player_group, creating one if it does not
   * exist yet. Idempotent: concurrent calls for the same groupId are safe
   * (INSERT … ON CONFLICT DO NOTHING + SELECT).
   *
   * groupId is the UUID primary key of public.player_groups, stored as TEXT in
   * messaging.conversations.group_id (mirrors how tournament_id is stored as TEXT).
   */
  async resolveGroupConversation(groupId: string): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO messaging.conversations (type, group_id)
       VALUES ('group', $1)
       ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [groupId]
    )

    if (result.rows.length > 0) {
      log.debug('conversation.group.created', { groupId, conversationId: result.rows[0].id })
      return result.rows[0].id as string
    }

    // Row already existed — fetch it.
    const existing = await this.pool.query(
      `SELECT id FROM messaging.conversations WHERE group_id = $1`,
      [groupId]
    )
    return existing.rows[0].id as string
  }

  /**
   * Per-store DSR/erasure primitive (§0.5, G2.1 — legal-critical).
   *
   * Tombstones all group_messages attributed to playerId:
   *   - player_id → NULL
   *   - sender_name_snapshot → 'Former player'
   *   - body → '' (cleared)
   *
   * Co-authors' messages in the same conversation(s) are NOT touched — the
   * WHERE clause matches only rows WHERE player_id = $1.
   *
   * Idempotent: rows already tombstoned (player_id IS NULL) are not matched
   * by the WHERE clause and are left as-is. Re-running is always safe.
   *
   * Spans all group conversations this player ever participated in (no
   * conversation_id filter — a DSR must be complete across the platform).
   */
  /**
   * Return the conversation_id for a player's personal notification thread,
   * creating one if it does not exist yet. Idempotent.
   */
  async resolvePersonalConversation(playerId: string): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO messaging.conversations (type, player_id)
       VALUES ('personal', $1)
       ON CONFLICT (player_id) WHERE player_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [playerId]
    )

    if (result.rows.length > 0) {
      log.debug('conversation.personal.created', { playerId, conversationId: result.rows[0].id })
      return result.rows[0].id as string
    }

    const existing = await this.pool.query(
      `SELECT id FROM messaging.conversations WHERE player_id = $1`,
      [playerId]
    )
    return existing.rows[0].id as string
  }

  async anonymizeGroupMessagesFor(playerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE messaging.group_messages
       SET player_id            = NULL,
           sender_name_snapshot = 'Former player',
           body                 = ''
       WHERE player_id = $1`,
      [playerId]
    )
    log.info('group.messages.anonymized', { playerId })
  }
}
