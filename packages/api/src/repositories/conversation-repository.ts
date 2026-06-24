import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('conversation-repository')

/**
 * ConversationRepository — manages messaging.conversations rows.
 *
 * V1.0 scope: only type='tournament' conversations. group_id and
 * type='group' are Player-Groups scope.
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
}
