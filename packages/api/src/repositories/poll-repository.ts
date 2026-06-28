/**
 * PollRepository — create polls, cast votes, get live tally, §0.5 erasure.
 *
 * A poll is stored as:
 *   - A type='poll' message in messaging.group_messages (carries the body for history)
 *   - A row in messaging.polls linking to that message (question + target_time)
 *   - Votes in messaging.poll_votes (one row per (message_id, player_id), re-vote = upsert)
 *
 * §0.5 — anonymizePollVotesFor(playerId): deletes the player's vote rows entirely.
 * The tally is derived at query time, so removing the row is sufficient — no tombstone
 * needed. Other voters' rows are untouched. Idempotent: re-running matches 0 rows.
 */
import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('poll-repository')

export type PollChoice = 'in' | 'out' | 'maybe'

export interface CreatePollInput {
  groupId: string
  creatorPlayerId: string
  question: string
  targetTime?: Date | null
}

export interface CreatePollResult {
  pollId: string
  messageId: string
  question: string
}

export interface PollVoteRow {
  playerId: string
  choice: PollChoice
  votedAt: Date
}

export interface GetVotesResult {
  votes: PollVoteRow[]
  tally: { in: number; out: number; maybe: number }
}

export interface CastVoteInput {
  pollId: string
  playerId: string
  choice: PollChoice
}

export class PollRepository {
  constructor(private pool: Pool) {}

  /**
   * Resolve (or create) the conversation_id for a player group.
   * Same pattern as GroupMessageRepository.resolveConversationId.
   */
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
   * Create a poll:
   *   1. Resolve the group conversation.
   *   2. Insert a type='poll' message into messaging.group_messages.
   *   3. Insert a row into messaging.polls linking message + question + target_time.
   *
   * Returns pollId (messaging.polls.id) + messageId (messaging.group_messages.id).
   */
  async createPoll(input: CreatePollInput): Promise<CreatePollResult> {
    const { groupId, creatorPlayerId, question, targetTime } = input

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const conversationId = await this.resolveConversationId(client, groupId)

      // Snapshot sender name (same pattern as GroupMessageRepository)
      const nameRes = await client.query(
        `SELECT name FROM public.players WHERE id = $1`,
        [creatorPlayerId]
      )
      const senderNameSnapshot: string = nameRes.rows[0]?.name ?? 'Unknown'

      // Insert type='poll' message; body = question (so it appears in history)
      const msgRes = await client.query(
        `INSERT INTO messaging.group_messages
           (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, $2, $3, $4, 'poll')
         RETURNING id`,
        [conversationId, creatorPlayerId, senderNameSnapshot, question]
      )
      const messageId = msgRes.rows[0].id as string

      // Insert poll metadata
      const pollRes = await client.query(
        `INSERT INTO messaging.polls (message_id, question, target_time)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [messageId, question, targetTime ?? null]
      )
      const pollId = pollRes.rows[0].id as string

      await client.query('COMMIT')

      log.info('poll.created', { groupId, conversationId, messageId, pollId, creatorPlayerId })

      return { pollId, messageId, question }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Cast or replace a vote on a poll.
   * Upsert: one row per (message_id, player_id) — re-vote replaces prior choice.
   *
   * pollId is messaging.polls.id — we resolve message_id from it.
   */
  async castVote(input: CastVoteInput): Promise<{ choice: PollChoice; votedAt: Date }> {
    const { pollId, playerId, choice } = input

    // Resolve message_id from poll
    const pollRow = await this.pool.query(
      `SELECT message_id FROM messaging.polls WHERE id = $1`,
      [pollId]
    )
    if (pollRow.rows.length === 0) {
      throw Object.assign(new Error('Poll not found'), { code: 'NOT_FOUND' })
    }
    const messageId = pollRow.rows[0].message_id as string

    const res = await this.pool.query(
      `INSERT INTO messaging.poll_votes (message_id, player_id, choice, voted_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (message_id, player_id) DO UPDATE
         SET choice = EXCLUDED.choice,
             voted_at = EXCLUDED.voted_at
       RETURNING choice, voted_at`,
      [messageId, playerId, choice]
    )

    const row = res.rows[0]
    log.info('poll.vote.cast', { pollId, messageId, playerId, choice })
    return {
      choice: row.choice as PollChoice,
      votedAt: row.voted_at instanceof Date ? row.voted_at : new Date(row.voted_at),
    }
  }

  /**
   * Get all votes for a poll with a live tally.
   * Non-anonymous: each vote row includes playerId and choice.
   * Tally is computed from the current vote rows.
   */
  async getVotes(pollId: string): Promise<GetVotesResult> {
    // Resolve message_id from poll
    const pollRow = await this.pool.query(
      `SELECT message_id FROM messaging.polls WHERE id = $1`,
      [pollId]
    )
    if (pollRow.rows.length === 0) {
      throw Object.assign(new Error('Poll not found'), { code: 'NOT_FOUND' })
    }
    const messageId = pollRow.rows[0].message_id as string

    const res = await this.pool.query(
      `SELECT player_id, choice, voted_at
       FROM messaging.poll_votes
       WHERE message_id = $1
       ORDER BY voted_at ASC`,
      [messageId]
    )

    const votes: PollVoteRow[] = res.rows.map(r => ({
      playerId: r.player_id as string,
      choice: r.choice as PollChoice,
      votedAt: r.voted_at instanceof Date ? r.voted_at : new Date(r.voted_at),
    }))

    const tally = { in: 0, out: 0, maybe: 0 }
    for (const v of votes) {
      tally[v.choice]++
    }

    return { votes, tally }
  }

  /**
   * Resolve a poll's message_id from its pollId, returning null if not found.
   * Used by routes to look up the conversation_id for bus emit.
   */
  async getPollMessageId(pollId: string): Promise<string | null> {
    const res = await this.pool.query(
      `SELECT message_id FROM messaging.polls WHERE id = $1`,
      [pollId]
    )
    return res.rows[0]?.message_id ?? null
  }

  /**
   * §0.5 — DSR erasure primitive (legal-critical).
   *
   * Deletes all poll_votes rows where player_id = $1 across all polls.
   * The vote itself is PII; deletion (not tombstone) is appropriate because:
   *   - The tally is computed at query time from remaining rows.
   *   - After deletion, other voters' rows are untouched and tally recomputes correctly.
   *   - No cross-participant history is destroyed (the poll message remains).
   *
   * Idempotent: if player has no votes, the DELETE matches 0 rows — no error.
   * Re-running after the first call is always safe.
   */
  async anonymizePollVotesFor(playerId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM messaging.poll_votes WHERE player_id = $1`,
      [playerId]
    )
    log.info('poll.votes.anonymized', { playerId })
  }
}
