/**
 * AssistantCardRepository — Phase B confirm-card storage (design §11 B-Q1/B-Q2).
 *
 * A card is stored as:
 *   - A type='assistant' message in messaging.group_messages (player_id=NULL,
 *     sender 'Coach', body = a human-readable prose summary — the durable/
 *     export/fallback record, B-Q9), metadata = {cardId}
 *   - A row in messaging.assistant_cards (status/args/expiry/result)
 *
 * Lifecycle: pending → confirmed | failed | cancelled. 'expired' is NEVER
 * stored — callers compute it from expires_at. claimCard() is the only
 * status-mutating primitive and is atomic (`WHERE status = 'pending'`), so
 * concurrent confirms can never double-flip a card.
 */
import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('assistant-card-repository')

export type AssistantCardStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled'

export interface AssistantCardRow {
  id: string
  messageId: string
  groupId: string
  proposerPlayerId: string
  action: string
  args: Record<string, unknown>
  status: AssistantCardStatus
  expiresAt: Date
  schemaVersion: number
  result: Record<string, unknown> | null
  createdAt: Date
}

export interface CreateCardInput {
  groupId: string
  proposerPlayerId: string
  action: string
  args: Record<string, unknown>
  /** Human-readable prose summary — the durable/export/fallback record. */
  body: string
  /** Default 900 (15 minutes, design Q7). May be negative in tests. */
  expiresInSeconds?: number
  schemaVersion?: number
}

function rowToCard(row: any): AssistantCardRow {
  return {
    id: row.id as string,
    messageId: row.message_id as string,
    groupId: row.group_id as string,
    proposerPlayerId: row.proposer_player_id as string,
    action: row.action as string,
    args: row.args as Record<string, unknown>,
    status: row.status as AssistantCardStatus,
    expiresAt: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
    schemaVersion: row.schema_version as number,
    result: row.result ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }
}

const CARD_COLUMNS = `id, message_id, group_id, proposer_player_id, action, args,
                       status, expires_at, schema_version, result, created_at`

export class AssistantCardRepository {
  constructor(private pool: Pool) {}

  /** Same pattern as GroupMessageRepository/PollRepository. */
  private async resolveConversationId(
    client: { query: (text: string, params?: unknown[]) => Promise<any> },
    groupId: string
  ): Promise<string> {
    const ins = await client.query(
      `INSERT INTO messaging.conversations (type, group_id)
       VALUES ('group', $1)
       ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [groupId]
    )
    if (ins.rows.length > 0) return ins.rows[0].id as string

    const sel = await client.query(
      `SELECT id FROM messaging.conversations WHERE group_id = $1`,
      [groupId]
    )
    return sel.rows[0].id as string
  }

  /**
   * Atomically inserts the assistant message + card row, then backfills the
   * message's metadata with {cardId} (the card id is only known once the
   * card row exists, so this is unavoidably a 3-statement transaction).
   */
  async createCard(
    input: CreateCardInput
  ): Promise<{ card: AssistantCardRow; conversationId: string }> {
    const {
      groupId, proposerPlayerId, action, args, body,
      expiresInSeconds = 900, schemaVersion = 1,
    } = input

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const conversationId = await this.resolveConversationId(client, groupId)

      const msgRes = await client.query(
        `INSERT INTO messaging.group_messages
           (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, NULL, 'Coach', $2, 'assistant')
         RETURNING id`,
        [conversationId, body]
      )
      const messageId = msgRes.rows[0].id as string

      const cardRes = await client.query(
        `INSERT INTO messaging.assistant_cards
           (message_id, group_id, proposer_player_id, action, args, status, expires_at, schema_version)
         VALUES ($1, $2, $3, $4, $5, 'pending', now() + make_interval(secs => $6), $7)
         RETURNING ${CARD_COLUMNS}`,
        [messageId, groupId, proposerPlayerId, action, args, expiresInSeconds, schemaVersion]
      )
      const card = rowToCard(cardRes.rows[0])

      await client.query(
        `UPDATE messaging.group_messages SET metadata = jsonb_build_object('cardId', $2::text) WHERE id = $1`,
        [messageId, card.id]
      )

      await client.query('COMMIT')

      log.info('assistant.card.created', { groupId, messageId, cardId: card.id, action, proposerPlayerId })

      return { card, conversationId }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  async getCard(cardId: string): Promise<AssistantCardRow | null> {
    const res = await this.pool.query(
      `SELECT ${CARD_COLUMNS} FROM messaging.assistant_cards WHERE id = $1`,
      [cardId]
    )
    return res.rows.length > 0 ? rowToCard(res.rows[0]) : null
  }

  async getCardByMessageId(messageId: string): Promise<AssistantCardRow | null> {
    const res = await this.pool.query(
      `SELECT ${CARD_COLUMNS} FROM messaging.assistant_cards WHERE message_id = $1`,
      [messageId]
    )
    return res.rows.length > 0 ? rowToCard(res.rows[0]) : null
  }

  /**
   * Atomic pending-only status flip (design §11 B-Q3: mutate first through
   * the existing route/service, THEN call this). Returns null — a no-op,
   * never an error — when the card is no longer pending (already
   * confirmed/failed/cancelled by a concurrent request), so callers can
   * distinguish "I won the race" from "someone else did".
   */
  async claimCard(
    cardId: string,
    toStatus: Exclude<AssistantCardStatus, 'pending'>,
    result?: Record<string, unknown>
  ): Promise<AssistantCardRow | null> {
    const res = await this.pool.query(
      `UPDATE messaging.assistant_cards
       SET status = $2, result = COALESCE($3::jsonb, result)
       WHERE id = $1 AND status = 'pending'
       RETURNING ${CARD_COLUMNS}`,
      [cardId, toStatus, result ? JSON.stringify(result) : null]
    )
    if (res.rows.length === 0) {
      log.info('assistant.card.claim.rejected', { cardId, toStatus })
      return null
    }
    const card = rowToCard(res.rows[0])
    log.info('assistant.card.claimed', { cardId, status: card.status })
    return card
  }

  /**
   * Pending, unexpired cards proposed by a given player — Player
   * Personalization P5 (pending-actions aggregation). Only the proposer can
   * act on a card (B-Q2), so this is the exact set relevant to them.
   */
  async findPendingForProposer(proposerPlayerId: string): Promise<AssistantCardRow[]> {
    const res = await this.pool.query(
      `SELECT ${CARD_COLUMNS} FROM messaging.assistant_cards
       WHERE proposer_player_id = $1 AND status = 'pending' AND expires_at > now()
       ORDER BY created_at DESC`,
      [proposerPlayerId]
    )
    return res.rows.map(rowToCard)
  }

  /** Attach/replace a result without requiring a status transition. */
  async setResult(cardId: string, result: Record<string, unknown>): Promise<AssistantCardRow | null> {
    const res = await this.pool.query(
      `UPDATE messaging.assistant_cards SET result = $2::jsonb WHERE id = $1 RETURNING ${CARD_COLUMNS}`,
      [cardId, JSON.stringify(result)]
    )
    return res.rows.length > 0 ? rowToCard(res.rows[0]) : null
  }
}
