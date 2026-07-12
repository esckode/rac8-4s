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
  autoCloseAt?: Date | null
  autoLaunch?: boolean
  minPlayers?: number | null
  launchMatchFormat?: string | null
}

export interface ClosePollResult {
  tally: { in: number; out: number; maybe: number }
  closedAt: Date
}

export interface CreatePollResult {
  pollId: string
  messageId: string
  question: string
  autoCloseAt: Date | null
  autoLaunch: boolean
  minPlayers: number | null
  launchMatchFormat: string | null
}

export interface PollVoteRow {
  playerId: string
  voterName: string | null
  choice: PollChoice
  votedAt: Date
}

export interface GetVotesResult {
  votes: PollVoteRow[]
  tally: { in: number; out: number; maybe: number }
  autoCloseAt: Date | null
  autoLaunch: boolean
  minPlayers: number | null
  launchMatchFormat: string | null
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
    const {
      groupId, creatorPlayerId, question, targetTime,
      autoCloseAt, autoLaunch = false, minPlayers, launchMatchFormat,
    } = input

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

      // Insert poll metadata (creator_player_id stored so close authz can check without a join)
      const pollRes = await client.query(
        `INSERT INTO messaging.polls
           (message_id, question, target_time, creator_player_id,
            auto_close_at, auto_launch, min_players, launch_match_format)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, auto_close_at, auto_launch, min_players, launch_match_format`,
        [
          messageId, question, targetTime ?? null, creatorPlayerId,
          autoCloseAt ?? null, autoLaunch, minPlayers ?? null, launchMatchFormat ?? null,
        ]
      )
      const pollRow = pollRes.rows[0]
      const pollId = pollRow.id as string

      await client.query('COMMIT')

      log.info('poll.created', { groupId, conversationId, messageId, pollId, creatorPlayerId })

      return {
        pollId,
        messageId,
        question,
        autoCloseAt: pollRow.auto_close_at ? new Date(pollRow.auto_close_at) : null,
        autoLaunch: pollRow.auto_launch as boolean,
        minPlayers: pollRow.min_players as number | null,
        launchMatchFormat: pollRow.launch_match_format as string | null,
      }
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
   * Throws POLL_CLOSED (409-style) if the poll has been closed.
   */
  async castVote(input: CastVoteInput): Promise<{ choice: PollChoice; votedAt: Date }> {
    const { pollId, playerId, choice } = input

    // Resolve message_id from poll and check closed_at
    const pollRow = await this.pool.query(
      `SELECT message_id, closed_at FROM messaging.polls WHERE id = $1`,
      [pollId]
    )
    if (pollRow.rows.length === 0) {
      throw Object.assign(new Error('Poll not found'), { code: 'NOT_FOUND' })
    }
    if (pollRow.rows[0].closed_at !== null) {
      throw Object.assign(new Error('Poll is closed'), { code: 'POLL_CLOSED' })
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
    // Resolve message_id + config from poll
    const pollRow = await this.pool.query(
      `SELECT message_id, auto_close_at, auto_launch, min_players, launch_match_format
       FROM messaging.polls WHERE id = $1`,
      [pollId]
    )
    if (pollRow.rows.length === 0) {
      throw Object.assign(new Error('Poll not found'), { code: 'NOT_FOUND' })
    }
    const { message_id: messageId, auto_close_at, auto_launch, min_players, launch_match_format } = pollRow.rows[0]

    const res = await this.pool.query(
      `SELECT pv.player_id, pv.choice, pv.voted_at, p.name AS voter_name
       FROM messaging.poll_votes pv
       LEFT JOIN public.players p ON p.id = pv.player_id
       WHERE pv.message_id = $1
       ORDER BY pv.voted_at ASC`,
      [messageId]
    )

    const votes: PollVoteRow[] = res.rows.map(r => ({
      playerId: r.player_id as string,
      voterName: r.voter_name as string | null,
      choice: r.choice as PollChoice,
      votedAt: r.voted_at instanceof Date ? r.voted_at : new Date(r.voted_at),
    }))

    const tally = { in: 0, out: 0, maybe: 0 }
    for (const v of votes) {
      tally[v.choice]++
    }

    return {
      votes,
      tally,
      autoCloseAt: auto_close_at ? new Date(auto_close_at) : null,
      autoLaunch: auto_launch as boolean,
      minPlayers: min_players as number | null,
      launchMatchFormat: launch_match_format as string | null,
    }
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
   * Look up a poll by its group_message id (messageId = messaging.polls.message_id).
   * Returns { pollId, creatorPlayerId, closedAt } or null if not found.
   * Used by the close route which receives the messageId from the URL path.
   */
  async getPollByMessageId(
    messageId: string
  ): Promise<{ pollId: string; creatorPlayerId: string | null; closedAt: Date | null } | null> {
    const res = await this.pool.query(
      `SELECT id, creator_player_id, closed_at FROM messaging.polls WHERE message_id = $1`,
      [messageId]
    )
    if (res.rows.length === 0) return null
    const row = res.rows[0]
    return {
      pollId: row.id as string,
      creatorPlayerId: row.creator_player_id ?? null,
      closedAt: row.closed_at ? (row.closed_at instanceof Date ? row.closed_at : new Date(row.closed_at)) : null,
    }
  }

  /**
   * Close a poll:
   *   1. Sets closed_at = now() on messaging.polls (if not already closed).
   *   2. Computes the final tally from messaging.poll_votes.
   *   3. Posts a system group message with the tally summary.
   *
   * This is a plain function (takes messageId + groupId) so it can be called from
   * the manual close route now and plugged into a cron/job scheduler later.
   *
   * Throws POLL_ALREADY_CLOSED if closed_at is already set.
   * Throws NOT_FOUND if the poll does not exist.
   */
  async closePoll(messageId: string, groupId: string, closerPlayerId: string): Promise<ClosePollResult> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      // Lock + close the poll atomically
      const updateRes = await client.query(
        `UPDATE messaging.polls
         SET closed_at = now()
         WHERE message_id = $1
           AND closed_at IS NULL
         RETURNING id, closed_at`,
        [messageId]
      )

      if (updateRes.rows.length === 0) {
        // Either not found or already closed — check which
        const checkRes = await client.query(
          `SELECT id, closed_at FROM messaging.polls WHERE message_id = $1`,
          [messageId]
        )
        if (checkRes.rows.length === 0) {
          throw Object.assign(new Error('Poll not found'), { code: 'NOT_FOUND' })
        }
        throw Object.assign(new Error('Poll is already closed'), { code: 'POLL_ALREADY_CLOSED' })
      }

      const closedAt: Date = updateRes.rows[0].closed_at instanceof Date
        ? updateRes.rows[0].closed_at
        : new Date(updateRes.rows[0].closed_at)

      // Compute final tally
      const votesRes = await client.query(
        `SELECT choice FROM messaging.poll_votes WHERE message_id = $1`,
        [messageId]
      )
      const tally = { in: 0, out: 0, maybe: 0 }
      for (const row of votesRes.rows) {
        tally[row.choice as PollChoice]++
      }

      // Post a system message with the tally summary
      const conversationId = await this.resolveConversationId(client, groupId)
      const summaryParts: string[] = []
      if (tally.in > 0) summaryParts.push(`${tally.in} in`)
      if (tally.out > 0) summaryParts.push(`${tally.out} out`)
      if (tally.maybe > 0) summaryParts.push(`${tally.maybe} maybe`)
      const summaryBody = summaryParts.length > 0
        ? `Poll closed: ${summaryParts.join(', ')}`
        : 'Poll closed: no votes'

      await client.query(
        `INSERT INTO messaging.group_messages
           (conversation_id, player_id, sender_name_snapshot, body, type)
         VALUES ($1, NULL, 'system', $2, 'system')`,
        [conversationId, summaryBody]
      )

      await client.query('COMMIT')

      log.info('poll.closed', { messageId, groupId, closerPlayerId, tally })

      return { tally, closedAt }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * Find open (not yet closed) polls in a group — used by propose_poll_vote
   * (B4.1) to disambiguate which poll a natural-language vote refers to,
   * the same candidate-matching pattern propose_score uses for opponents.
   */
  async findOpenPollsByGroup(
    groupId: string
  ): Promise<Array<{ pollId: string; messageId: string; question: string }>> {
    const res = await this.pool.query(
      `SELECT p.id, p.message_id, p.question
       FROM messaging.polls p
       JOIN messaging.group_messages gm ON gm.id = p.message_id
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.group_id = $1 AND p.closed_at IS NULL
       ORDER BY gm.created_at DESC`,
      [groupId]
    )
    return res.rows.map(r => ({
      pollId: r.id as string,
      messageId: r.message_id as string,
      question: r.question as string,
    }))
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
