/**
 * poll-service — poll create + vote (extracted from routes/player-groups.ts
 * POST /:groupId/polls and POST /:groupId/polls/:pollId/votes, B4.0).
 *
 * Behavior-preserving extraction: this is the exact logic the routes used to
 * run inline, now shared between the routes and the Phase B confirm-card
 * path (propose_poll / propose_poll_vote, B4.1) — same one-code-path
 * principle as score-service.ts (B2.0, design §11 B-Q3).
 *
 * Group-membership authorization is NOT this service's concern — both the
 * route and the assistant-cards confirm route already check it identically
 * (groupRepo.getMemberRole) before calling in.
 */
import type { Pool } from 'pg'
import type { PollRepository, PollChoice } from '../repositories/poll-repository'
import type { GroupRepository } from '../repositories/group-repository'
import type { ConversationRepository } from '../repositories/conversation-repository'
import { selectNotifyRecipients, type GroupMemberForNotify } from '../group-notify-selector'
import { shouldEnqueueNotify } from '../notify-gate'
import type { JobQueue } from '@worker/job-queue'
import type { IBroadcastBus } from '../broadcast-bus'
import { getLogger } from '../logger'

const log = getLogger('poll-service')

export interface PollServiceDeps {
  pollRepo: PollRepository
  groupRepo: GroupRepository
  conversationRepo: ConversationRepository
  /** Needed for the P9 per-event notify-toggle + quiet-hours AND-layer. */
  pool: Pool
  jobQueue?: JobQueue
  broadcastBus?: IBroadcastBus
}

// ── createPoll ──────────────────────────────────────────────────────────────

export interface CreatePollInput {
  groupId: string
  playerId: string
  question: unknown
  targetTime?: unknown
  autoCloseAt?: unknown
  autoLaunch?: unknown
  minPlayers?: unknown
  launchMatchFormat?: unknown
}

export interface CreatePollOutput {
  pollId: string
  messageId: string
  question: string
  autoCloseAt: Date | null
  autoLaunch: boolean
  minPlayers: number | null
  launchMatchFormat: string | null
}

export type CreatePollErrorCode = 'VALIDATION_ERROR'

export type CreatePollResult =
  | { ok: true; poll: CreatePollOutput }
  | { ok: false; code: CreatePollErrorCode; message: string }

export const CREATE_POLL_ERROR_HTTP_STATUS: Record<CreatePollErrorCode, number> = {
  VALIDATION_ERROR: 400,
}

export async function createPoll(deps: PollServiceDeps, input: CreatePollInput): Promise<CreatePollResult> {
  const { pollRepo, groupRepo, conversationRepo, pool, jobQueue, broadcastBus } = deps
  const { groupId, playerId, question, targetTime, autoCloseAt, autoLaunch, minPlayers, launchMatchFormat } = input

  if (!question || typeof question !== 'string' || !question.trim()) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'question is required' }
  }

  const parsedTargetTime = targetTime ? new Date(targetTime as string) : null
  const parsedAutoCloseAt = autoCloseAt ? new Date(autoCloseAt as string) : null

  const poll = await pollRepo.createPoll({
    groupId,
    creatorPlayerId: playerId,
    question: question.trim(),
    targetTime: parsedTargetTime,
    autoCloseAt: parsedAutoCloseAt,
    autoLaunch: typeof autoLaunch === 'boolean' ? autoLaunch : undefined,
    minPlayers: typeof minPlayers === 'number' ? minPlayers : undefined,
    launchMatchFormat: typeof launchMatchFormat === 'string' ? launchMatchFormat : undefined,
  })

  // Resolve conversation_id for bus emit and notify
  const conversationId = await conversationRepo.resolveGroupConversation(groupId)

  // Bus emit (SSE) — reuse existing broadcast path
  if (broadcastBus) {
    broadcastBus.emit(conversationId, 'message.created', {
      id: poll.messageId,
      conversationId,
      groupId,
      playerId,
      type: 'poll',
      pollId: poll.pollId,
      question: poll.question,
      targetTime: parsedTargetTime ?? null,
      closedAt: null,
      createdAt: new Date().toISOString(),
    })
  }

  // G2.4 notify-on-create: poll type → notify 'all' + 'mentions_polls'
  if (jobQueue) {
    const rawMembers = await groupRepo.getGroupMembersForNotify(groupId)
    const membersForNotify: GroupMemberForNotify[] = rawMembers.map(m => ({
      playerId: m.playerId,
      notifyLevel: m.notifyLevel as 'all' | 'mentions_polls' | 'muted',
      name: m.name,
    }))
    const recipientIds = selectNotifyRecipients({
      members: membersForNotify,
      messageType: 'poll',
      body: question.trim(),
      senderPlayerId: playerId,
    })
    // P9 AND-layer: personal notify_polls toggle + quiet hours.
    for (const recipientId of recipientIds) {
      if (!(await shouldEnqueueNotify(pool, recipientId, 'polls'))) continue
      await jobQueue.add(
        'messaging.notify',
        { conversationId, groupId },
        { jobId: `notify:${conversationId}:${recipientId}` }
      )
    }
  }

  log.info('poll.created', { groupId, pollId: poll.pollId, messageId: poll.messageId, playerId })

  return {
    ok: true,
    poll: {
      pollId: poll.pollId,
      messageId: poll.messageId,
      question: poll.question,
      autoCloseAt: poll.autoCloseAt ?? null,
      autoLaunch: poll.autoLaunch,
      minPlayers: poll.minPlayers ?? null,
      launchMatchFormat: poll.launchMatchFormat ?? null,
    },
  }
}

// ── castVote ────────────────────────────────────────────────────────────────

export interface CastVoteInput {
  groupId: string
  pollId: string
  playerId: string
  choice: unknown
}

export interface CastVoteOutput {
  pollId: string
  choice: PollChoice
  votedAt: Date
}

export type CastVoteErrorCode = 'VALIDATION_ERROR' | 'POLL_CLOSED'

export type CastVoteResult =
  | { ok: true; vote: CastVoteOutput }
  | { ok: false; code: CastVoteErrorCode; message: string }

export const CAST_VOTE_ERROR_HTTP_STATUS: Record<CastVoteErrorCode, number> = {
  VALIDATION_ERROR: 400,
  POLL_CLOSED: 409,
}

export async function castVote(deps: PollServiceDeps, input: CastVoteInput): Promise<CastVoteResult> {
  const { pollRepo, conversationRepo, broadcastBus } = deps
  const { groupId, pollId, playerId, choice } = input

  const validChoices: PollChoice[] = ['in', 'out', 'maybe']
  if (!choice || !validChoices.includes(choice as PollChoice)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: `choice must be one of: ${validChoices.join(', ')}` }
  }

  let result: { choice: PollChoice; votedAt: Date }
  try {
    result = await pollRepo.castVote({ pollId, playerId, choice: choice as PollChoice })
  } catch (err) {
    if ((err as { code?: string })?.code === 'POLL_CLOSED') {
      return { ok: false, code: 'POLL_CLOSED', message: 'Poll is closed' }
    }
    throw err
  }

  log.info('poll.vote.cast', { groupId, pollId, playerId, choice })

  // Emit tally update over SSE so all connected members see live tally
  if (broadcastBus) {
    try {
      const votes = await pollRepo.getVotes(pollId)
      const conversationId = await conversationRepo.resolveGroupConversation(groupId)
      broadcastBus.emit(conversationId, 'poll.tally.updated', { pollId, tally: votes.tally })
    } catch {
      // Non-fatal — vote was recorded; tally SSE is best-effort
    }
  }

  return { ok: true, vote: { pollId, choice: result.choice, votedAt: result.votedAt } }
}
