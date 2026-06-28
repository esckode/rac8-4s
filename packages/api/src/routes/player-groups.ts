/**
 * G1.2 + G1.3 + G2.2 + G2.5 — Player group membership lifecycle, invite flow, chat, and UI routes.
 *
 * Mounted at /player/groups. Route ordering §10: static paths before :id.
 *
 * Routes:
 *   GET    /player/groups                               — list the caller's groups (G2.5)
 *   POST   /player/groups                               — create group (creator becomes owner)
 *   POST   /player/groups/:groupId/invites/accept       — invitee accepts invite (age-gated)
 *   POST   /player/groups/:groupId/invites              — owner creates email-bound invite
 *   GET    /player/groups/:groupId/members              — member list (G2.5)
 *   POST   /player/groups/:groupId/messages             — member sends a text message (G2.2)
 *   GET    /player/groups/:groupId/messages             — member gets history (G2.2)
 *   GET    /player/groups/:groupId/events               — SSE stream for the group (G2.5)
 *   POST   /player/groups/:groupId/members/:pid/promote — owner promotes member → owner
 *   POST   /player/groups/:groupId/members/:pid/demote  — owner demotes owner → member
 *   DELETE /player/groups/:groupId/members/:pid/leave   — self-leave (any member)
 *   DELETE /player/groups/:groupId/members/:pid         — owner kicks member
 */

import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { requirePlayerSessionAuth } from '../auth'
import { ForbiddenError, TokenInvalidError } from '../auth/errors'
import { GroupRepository, LastOwnerError } from '../repositories/group-repository'
import { PlayerRepository, AgeAttestationRequiredError, UnderAgeError } from '../db'
import {
  generateGroupInviteToken,
  validateGroupInviteToken,
} from '../auth/magic-link'
import { getLogger } from '../logger'
import { GroupMessageRepository } from '../repositories/group-message-repository'
import { ConversationRepository } from '../repositories/conversation-repository'
import { selectNotifyRecipients, type GroupMemberForNotify } from '../group-notify-selector'
import { PollRepository, type PollChoice } from '../repositories/poll-repository'
import { LeaderboardRepository } from '../repositories/leaderboard-repository'
import { TournamentRepository } from '../db'

const INVITE_TTL_SECONDS = 7 * 24 * 3600 // 7 days

const log = getLogger('player-groups')

const MAX_BODY_LENGTH = 4000

function validateGroupMessageBody(body: unknown): string | null {
  if (typeof body !== 'string' || !body.trim()) {
    return 'body must be a non-empty string'
  }
  if (body.length > MAX_BODY_LENGTH) {
    return `body must not exceed ${MAX_BODY_LENGTH} characters`
  }
  return null
}

export default function playerGroupsRouter(deps: AppDependencies): Router {
  const router = Router({ mergeParams: true })
  const groupRepo = new GroupRepository(deps.db as any)
  const playerRepo = new PlayerRepository(deps.db as any)
  const groupMsgRepo = new GroupMessageRepository(deps.db as any)
  const conversationRepo = new ConversationRepository(deps.db as any)
  const pollRepo = new PollRepository(deps.db as any)
  const leaderboardRepo = new LeaderboardRepository(deps.db as any)
  const tournamentRepo = new TournamentRepository(deps.db as any)

  // GET /player/groups — list the caller's groups (G2.5)
  // §10: static GET registered before POST and /:groupId param routes
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const groups = await groupRepo.getGroupsForPlayer(session.playerId)
      return res.status(200).json({ groups })
    } catch (err) {
      next(err)
    }
  })

  // POST /player/groups — create a player group
  // §10: registered before /:groupId param routes
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
      const { name, defaultMatchFormat } = req.body

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'name is required' })
      }

      if (
        defaultMatchFormat !== undefined &&
        defaultMatchFormat !== 'singles' &&
        defaultMatchFormat !== 'doubles'
      ) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: "defaultMatchFormat must be 'singles' or 'doubles'",
        })
      }

      const group = await groupRepo.createGroup({
        name: name.trim(),
        createdBy: session.playerId,
        defaultMatchFormat,
      })

      return res.status(201).json({
        id: group.id,
        name: group.name,
        createdBy: group.createdBy,
        defaultMatchFormat: group.defaultMatchFormat,
        createdAt: group.createdAt,
      })
    } catch (err) {
      next(err)
    }
  })

  // ─── G1.3 Invite routes ────────────────────────────────────────────────────
  // §10: /:groupId/invites/accept (static suffix) registered before /:groupId/invites
  // Both are registered before /:groupId/members to keep member param routes after.

  // POST /player/groups/:groupId/invites/accept — invitee accepts an email-bound invite
  // Public (no session auth): the invitee may be a brand-new player.
  router.post(
    '/:groupId/invites/accept',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const groupId = req.params.groupId as string
        const { token, email, name, ageAttestation } = req.body

        if (!token || !email) {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'token and email are required' })
        }
        if (typeof email !== 'string' || !email.trim()) {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'email must be a non-empty string' })
        }

        // Verify token is valid, email-bound, and single-use
        let invitePayload
        try {
          invitePayload = await validateGroupInviteToken(token, email.trim(), deps.tokenStore)
        } catch (err) {
          if (err instanceof TokenInvalidError) {
            return res.status(400).json({ code: 'TOKEN_INVALID', message: err.message })
          }
          throw err
        }

        // Token groupId must match path groupId
        if (invitePayload.groupId !== groupId) {
          return res.status(400).json({ code: 'TOKEN_INVALID', message: 'Token does not match this group' })
        }

        // Confirm the group exists
        const groupRow = await (deps.db as any).query(
          `SELECT id FROM public.player_groups WHERE id = $1`,
          [groupId]
        )
        if (groupRow.rows.length === 0) {
          return res.status(404).json({ code: 'NOT_FOUND', message: 'Group not found' })
        }

        // findOrCreatePlayerByEmail: existing players bypass the age gate;
        // new players must provide a valid 18+ attestation (G0.1 gate).
        let player
        try {
          player = await playerRepo.findOrCreatePlayerByEmail(
            email.trim(),
            name || email.trim(),
            undefined,
            undefined,
            ageAttestation ?? null
          )
        } catch (err) {
          if (err instanceof AgeAttestationRequiredError || err instanceof UnderAgeError) {
            return res.status(400).json({
              code: err instanceof UnderAgeError ? 'UNDERAGE' : 'AGE_ATTESTATION_REQUIRED',
              message: err.message,
            })
          }
          throw err
        }

        // Add to group as member (idempotent: ON CONFLICT DO NOTHING)
        await (deps.db as any).query(
          `INSERT INTO public.player_group_members (group_id, player_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (group_id, player_id) DO NOTHING`,
          [groupId, player.id]
        )

        log.info('group.invite.accepted', { groupId, playerId: player.id })

        // G2.2: post system event "Name joined" into the group conversation.
        // Fire-and-forget: if this fails it is non-fatal to the invite-accept.
        const joinMsg = `${player.name ?? 'A member'} joined`
        groupMsgRepo.postSystemEvent(groupId, joinMsg).catch((e: Error) => {
          log.warn('group.system.event.failed', { groupId, playerId: player.id, error: e.message })
        })

        return res.status(200).json({ ok: true, groupId, playerId: player.id })
      } catch (err) {
        next(err)
      }
    }
  )

  // POST /player/groups/:groupId/invites — owner sends an email-bound invite
  // §10: after /accept (static suffix), before /:groupId/members (param routes)
  router.post(
    '/:groupId/invites',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const { email } = req.body

        if (!email || typeof email !== 'string' || !email.trim()) {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'email is required' })
        }

        // Verify actor is an owner of this group
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole !== 'owner') {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group owners can send invites' })
        }

        // Mint a single-use, email-bound group-invite token
        const { token } = await generateGroupInviteToken(
          {
            type: 'group-invite',
            groupId,
            email: email.trim().toLowerCase(),
            createdAt: Date.now(),
          },
          INVITE_TTL_SECONDS,
          deps.tokenStore
        )

        // Send the invite email
        if (deps.emailAdapter) {
          const frontendUrl = deps.config.email?.frontendUrl ?? 'http://localhost:5173'
          const acceptUrl = `${frontendUrl}/player/groups/${groupId}/invites/accept?token=${token}`
          await deps.emailAdapter.send(
            email.trim(),
            `You've been invited to join a group`,
            `<p>You have been invited to join a group.</p>
<p><a href="${acceptUrl}">Accept your invite</a></p>
<p>This link is single-use and valid for 7 days. It can only be used by this email address.</p>
<p>Or copy this URL: ${acceptUrl}</p>`
          )
        }

        log.info('group.invite.sent', { groupId, actorPlayerId: session.playerId })

        return res.status(201).json({ ok: true })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // ─── G4.4 Leaderboard endpoints ──────────────────────────────────────────
  // §10: static suffixes 'leaderboard/individual' and 'leaderboard/pairs' registered
  // before the bare /:groupId param routes to avoid shadowing.

  // GET /player/groups/:groupId/leaderboard/individual — individual W/L stats
  router.get(
    '/:groupId/leaderboard/individual',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string

        // Authz: caller must be a member
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group members can view leaderboards' })
        }

        const leaderboard = await leaderboardRepo.getIndividualLeaderboard(groupId)
        return res.status(200).json({ leaderboard })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // GET /player/groups/:groupId/leaderboard/pairs — pair W/L stats (doubles)
  router.get(
    '/:groupId/leaderboard/pairs',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string

        // Authz: caller must be a member
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group members can view leaderboards' })
        }

        const leaderboard = await leaderboardRepo.getPairLeaderboard(groupId)
        return res.status(200).json({ leaderboard })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // ─── G2.5 Member list + SSE ──────────────────────────────────────────────

  // GET /player/groups/:groupId/members — list members (G2.5)
  // §10: literal suffix 'members' registered before /:groupId/members/:pid param routes
  router.get(
    '/:groupId/members',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string

        // Authz: caller must be a member
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group members can view members' })
        }

        const members = await groupRepo.getGroupMembers(groupId)
        return res.status(200).json({
          members: members.map(m => ({
            playerId: m.playerId,
            name: m.name,
            role: m.role,
            joinedAt: m.joinedAt,
          })),
        })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // GET /player/groups/:groupId/events — SSE stream for the group's conversation (G2.5)
  // §10: literal suffix 'events' registered before /:groupId param routes
  router.get(
    '/:groupId/events',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const groupId = req.params.groupId as string

        if (!deps.broadcastBus) {
          return res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'SSE not available' })
        }

        // Support both Authorization header and query param token (EventSource compat)
        let authHeader = req.headers.authorization
        if (!authHeader && req.query.token) {
          const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token
          authHeader = `Bearer ${token}`
        }

        const session = await requirePlayerSessionAuth(authHeader, deps.tokenStore)

        // Authz: caller must be a member
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Access denied' })
        }

        const conversationId = await conversationRepo.resolveGroupConversation(groupId)

        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.flushHeaders()

        const unsubscribe = deps.broadcastBus.subscribe(conversationId, (event, data) => {
          if (!res.writableEnded) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          }
        })

        req.on('close', () => {
          unsubscribe()
        })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // ─── G2.2 Group chat routes ───────────────────────────────────────────────
  // §10: /:groupId/messages registered before /:groupId/members to keep the literal
  // suffix 'messages' from being shadowed by a parameterized member route.

  // POST /player/groups/:groupId/messages — send a text message (members only)
  router.post(
    '/:groupId/messages',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string

        // Authz: caller must be a member (owner or member)
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group members can send messages' })
        }

        const bodyErr = validateGroupMessageBody(req.body.body)
        if (bodyErr) {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: bodyErr })
        }

        const { message, conversationId } = await groupMsgRepo.sendGroupMessage({
          groupId,
          playerId: session.playerId,
          body: req.body.body,
          type: 'text',
        })

        // Bus emit on conversation_id — reuse the V2 IBroadcastBus
        if (deps.broadcastBus) {
          deps.broadcastBus.emit(conversationId, 'message.created', {
            id: message.id,
            conversationId,
            groupId,
            playerId: message.playerId,
            senderName: message.senderName,
            body: message.body,
            type: message.type,
            createdAt: message.createdAt,
          })
        }

        // G2.4: enqueue messaging.notify jobs per-recipient according to notify_level.
        // Fetch members + their notify levels, run the selector, then enqueue one job
        // per recipient (deduped by jobId — debounce/coalesce reusing §17.2 pipeline).
        if (deps.jobQueue) {
          const rawMembers = await groupRepo.getGroupMembersForNotify(groupId)
          const membersForNotify: GroupMemberForNotify[] = rawMembers.map(m => ({
            playerId: m.playerId,
            notifyLevel: m.notifyLevel as 'all' | 'mentions_polls' | 'muted',
            name: m.name,
          }))
          const recipientIds = selectNotifyRecipients({
            members: membersForNotify,
            messageType: message.type,
            body: message.body,
            senderPlayerId: session.playerId,
          })
          for (const recipientId of recipientIds) {
            await deps.jobQueue.add(
              'messaging.notify',
              { conversationId, groupId },
              { jobId: `notify:${conversationId}:${recipientId}` }
            )
          }
        }

        log.info('group.message.sent', {
          groupId,
          conversationId,
          messageId: message.id,
          playerId: session.playerId,
        })

        return res.status(201).json({
          id: message.id,
          conversationId,
          playerId: message.playerId,
          senderNameSnapshot: message.senderName,
          body: message.body,
          type: message.type,
          createdAt: message.createdAt,
        })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // GET /player/groups/:groupId/messages — history (members only)
  router.get(
    '/:groupId/messages',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string

        // Authz: caller must be a member
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group members can view messages' })
        }

        const conversationId = await conversationRepo.resolveGroupConversation(groupId)

        const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50

        const messages = await groupMsgRepo.getGroupHistory({ conversationId, limit })

        return res.status(200).json({
          messages: messages.map(m => ({
            id: m.id,
            conversationId: m.conversationId,
            playerId: m.playerId,
            senderName: m.senderName,
            body: m.body,
            type: m.type,
            createdAt: m.createdAt,
            removedAt: m.removedAt ?? null,
            ...(m.type === 'poll' && {
              pollId: m.pollId ?? null,
              targetTime: m.targetTime ?? null,
              closedAt: m.closedAt ?? null,
            }),
          })),
        })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // DELETE /player/groups/:groupId/messages/:messageId — owner tombstones a message (G2.3)
  // §10: /:groupId/messages/:messageId registered after /:groupId/messages (GET/POST)
  // and before /:groupId/members to keep member param routes after.
  router.delete(
    '/:groupId/messages/:messageId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const messageId = req.params.messageId as string

        // Authz: caller must be an owner
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole !== 'owner') {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group owners can remove messages' })
        }

        const removed = await groupMsgRepo.removeGroupMessage(messageId, session.playerId)
        if (!removed) {
          return res.status(404).json({ code: 'NOT_FOUND', message: 'Message not found' })
        }

        return res.status(200).json({ ok: true })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // ─── G3.1 Poll routes ─────────────────────────────────────────────────────
  // §10: /:groupId/polls registered before /:groupId/members

  // POST /player/groups/:groupId/polls — member creates a poll (G3.1)
  router.post(
    '/:groupId/polls',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string

        // Authz: caller must be a member (owner or member)
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group members can create polls' })
        }

        const { question, targetTime } = req.body
        if (!question || typeof question !== 'string' || !question.trim()) {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'question is required' })
        }

        const parsedTargetTime = targetTime ? new Date(targetTime) : null

        const poll = await pollRepo.createPoll({
          groupId,
          creatorPlayerId: session.playerId,
          question: question.trim(),
          targetTime: parsedTargetTime,
        })

        // Resolve conversation_id for bus emit and notify
        const conversationId = await conversationRepo.resolveGroupConversation(groupId)

        // Bus emit (SSE) — reuse existing broadcast path
        if (deps.broadcastBus) {
          deps.broadcastBus.emit(conversationId, 'message.created', {
            id: poll.messageId,
            conversationId,
            groupId,
            playerId: session.playerId,
            type: 'poll',
            pollId: poll.pollId,
            question: poll.question,
            targetTime: parsedTargetTime ?? null,
            closedAt: null,
            createdAt: new Date().toISOString(),
          })
        }

        // G2.4 notify-on-create: poll type → notify 'all' + 'mentions_polls'
        if (deps.jobQueue) {
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
            senderPlayerId: session.playerId,
          })
          for (const recipientId of recipientIds) {
            await deps.jobQueue.add(
              'messaging.notify',
              { conversationId, groupId },
              { jobId: `notify:${conversationId}:${recipientId}` }
            )
          }
        }

        log.info('poll.created', {
          groupId,
          pollId: poll.pollId,
          messageId: poll.messageId,
          playerId: session.playerId,
        })

        return res.status(201).json({
          pollId: poll.pollId,
          messageId: poll.messageId,
          question: poll.question,
        })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // POST /player/groups/:groupId/polls/:messageId/launch — poll creator launches a casual tournament (G4.5)
  // §10: static suffix 'launch' registered before 'close' and before parameterized /:pollId routes
  router.post(
    '/:groupId/polls/:messageId/launch',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const messageId = req.params.messageId as string

        // Load group (404 if not found), read default_match_format
        const groupResult = await (deps.db as any).query(
          `SELECT id, name, default_match_format FROM public.player_groups WHERE id = $1`,
          [groupId]
        )
        if (groupResult.rows.length === 0) {
          return res.status(404).json({ code: 'NOT_FOUND', message: 'Group not found' })
        }
        const group = groupResult.rows[0]

        // Load poll (404 if not found)
        const poll = await pollRepo.getPollByMessageId(messageId)
        if (!poll) {
          return res.status(404).json({ code: 'NOT_FOUND', message: 'Poll not found' })
        }

        // Authz: only the poll creator may launch
        if (poll.creatorPlayerId !== session.playerId) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the poll creator can launch a tournament from this poll' })
        }

        // Get In-voters
        const votersResult = await (deps.db as any).query(
          `SELECT player_id FROM messaging.poll_votes
           WHERE message_id = $1 AND choice = 'in' AND player_id IS NOT NULL`,
          [messageId]
        )
        const inVoters: string[] = votersResult.rows.map((r: any) => r.player_id as string)

        // Determine match format: body override or group default
        const rawFormat = req.body.matchFormat ?? group.default_match_format ?? 'singles'
        if (rawFormat !== 'singles' && rawFormat !== 'doubles') {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: "matchFormat must be 'singles' or 'doubles'" })
        }
        const matchFormat: 'singles' | 'doubles' = rawFormat

        const sport = req.body.sport || 'tennis'
        const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const tournamentName = `${group.name} — ${dateLabel}`

        // Create tournament (casual, unlisted, seeded from group)
        const tournament = await tournamentRepo.create({
          name: tournamentName,
          sport,
          matchFormat,
          maxPlayers: inVoters.length || 1,
          creatorId: session.playerId,
          mode: 'casual',
          visibility: 'unlisted',
          groupId,
        })

        // Register all In-voters
        for (const voterId of inVoters) {
          await playerRepo.createRegistration(voterId, tournament.id)
        }

        // Lock registration
        await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

        // Post system message into group conversation
        const conversationId = await conversationRepo.resolveGroupConversation(groupId)
        await (deps.db as any).query(
          `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type)
           VALUES ($1, NULL, 'system', $2, 'system')`,
          [conversationId, `Tournament started: ${tournament.name} (ID: ${tournament.id})`]
        )

        log.info('tournament.launched', {
          tournamentId: tournament.id,
          groupId,
          pollMessageId: messageId,
          playerCount: inVoters.length,
        })

        return res.status(201).json({
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          registeredPlayerIds: inVoters,
        })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // POST /player/groups/:groupId/polls/:messageId/close — poll creator or group owner closes (G3.2)
  // §10: /:groupId/polls/:messageId/close (static suffix 'close') registered before /:groupId/polls/:pollId/votes
  router.post(
    '/:groupId/polls/:messageId/close',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const messageId = req.params.messageId as string

        // Authz: caller must be a group member
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group members can close polls' })
        }

        // Look up the poll to check creator_player_id and closed_at
        const pollMeta = await pollRepo.getPollByMessageId(messageId)
        if (!pollMeta) {
          return res.status(404).json({ code: 'NOT_FOUND', message: 'Poll not found' })
        }

        // Only the poll creator or a group owner may close
        const isCreator = pollMeta.creatorPlayerId === session.playerId
        const isOwner = memberRole === 'owner'
        if (!isCreator && !isOwner) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the poll creator or a group owner can close this poll' })
        }

        const result = await pollRepo.closePoll(messageId, groupId, session.playerId)

        // Emit poll.closed over SSE so connected members freeze the card immediately
        if (deps.broadcastBus) {
          try {
            const conversationId = await conversationRepo.resolveGroupConversation(groupId)
            deps.broadcastBus.emit(conversationId, 'poll.closed', {
              messageId,
              pollId: pollMeta.pollId,
              tally: result.tally,
              closedAt: result.closedAt,
            })
          } catch {
            // Non-fatal
          }
        }

        return res.status(200).json({ tally: result.tally, closedAt: result.closedAt })
      } catch (err) {
        const code = (err as any)?.code
        if (code === 'POLL_ALREADY_CLOSED') {
          return res.status(409).json({ code: 'POLL_ALREADY_CLOSED', message: 'Poll is already closed' })
        }
        next(handleGroupError(err))
      }
    }
  )

  // GET /player/groups/:groupId/polls/:pollId/votes — live tally (members only)
  // §10: /:groupId/polls/:pollId/votes (static suffix) before /:groupId/polls/:pollId
  router.get(
    '/:groupId/polls/:pollId/votes',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const pollId = req.params.pollId as string

        // Authz: caller must be a member
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group members can view poll results' })
        }

        const result = await pollRepo.getVotes(pollId)

        return res.status(200).json({
          votes: result.votes.map(v => ({
            playerId: v.playerId,
            choice: v.choice,
            votedAt: v.votedAt,
          })),
          tally: result.tally,
        })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // POST /player/groups/:groupId/polls/:pollId/votes — cast/re-cast a vote (G3.1)
  router.post(
    '/:groupId/polls/:pollId/votes',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const pollId = req.params.pollId as string

        // Authz: caller must be a member
        const memberRole = await groupRepo.getMemberRole(deps.db as any, groupId, session.playerId)
        if (memberRole === null) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Only group members can vote on polls' })
        }

        const { choice } = req.body
        const validChoices: PollChoice[] = ['in', 'out', 'maybe']
        if (!choice || !validChoices.includes(choice as PollChoice)) {
          return res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: `choice must be one of: ${validChoices.join(', ')}`,
          })
        }

        const result = await pollRepo.castVote({
          pollId,
          playerId: session.playerId,
          choice: choice as PollChoice,
        })

        log.info('poll.vote.cast', {
          groupId,
          pollId,
          playerId: session.playerId,
          choice,
        })

        // Emit tally update over SSE so all connected members see live tally
        if (deps.broadcastBus) {
          try {
            const votes = await pollRepo.getVotes(pollId)
            const conversationId = await conversationRepo.resolveGroupConversation(groupId)
            deps.broadcastBus.emit(conversationId, 'poll.tally.updated', {
              pollId,
              tally: votes.tally,
            })
          } catch {
            // Non-fatal — vote was recorded; tally SSE is best-effort
          }
        }

        return res.status(201).json({
          pollId,
          choice: result.choice,
          votedAt: result.votedAt,
        })
      } catch (err) {
        const code = (err as any)?.code
        if (code === 'POLL_CLOSED') {
          return res.status(409).json({ code: 'POLL_CLOSED', message: 'Poll is closed' })
        }
        next(handleGroupError(err))
      }
    }
  )

  // POST /player/groups/:groupId/members/:playerId/promote
  router.post(
    '/:groupId/members/:playerId/promote',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const playerId = req.params.playerId as string

        await groupRepo.promoteMember(groupId, session.playerId, playerId)

        return res.status(200).json({ ok: true })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // POST /player/groups/:groupId/members/:playerId/demote
  router.post(
    '/:groupId/members/:playerId/demote',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const playerId = req.params.playerId as string

        await groupRepo.demoteMember(groupId, session.playerId, playerId)

        return res.status(200).json({ ok: true })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // DELETE /player/groups/:groupId/members/:playerId/leave — self-leave
  // §10: literal suffix '/leave' registered before the bare /:playerId DELETE
  router.delete(
    '/:groupId/members/:playerId/leave',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const playerId = req.params.playerId as string

        // Self-leave only — actor must be the player identified in the path
        if (session.playerId !== playerId) {
          return next(new ForbiddenError('group'))
        }

        // Resolve group existence before calling leaveGroup
        const groupResult = await (deps.db as any).query(
          `SELECT id FROM public.player_groups WHERE id = $1`,
          [groupId]
        )
        if (groupResult.rows.length === 0) {
          return res.status(404).json({ code: 'NOT_FOUND', message: 'Group not found' })
        }

        // Fetch player's name BEFORE leaving (player row stays in public.players)
        const playerName = await groupMsgRepo.getPlayerName(playerId)

        await groupRepo.leaveGroup(groupId, playerId)

        // G2.2: post system event "Name left" into the group conversation
        // Fire-and-forget: if this fails it is non-fatal to the leave operation.
        const leaveMsg = `${playerName ?? 'A member'} left`
        groupMsgRepo.postSystemEvent(groupId, leaveMsg).catch((e: Error) => {
          log.warn('group.system.event.failed', { groupId, playerId, error: e.message })
        })

        return res.status(200).json({ ok: true })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  // DELETE /player/groups/:groupId/members/:playerId — owner kick
  // §10: registered after '/leave' so the literal suffix is matched first
  router.delete(
    '/:groupId/members/:playerId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
        const groupId = req.params.groupId as string
        const playerId = req.params.playerId as string

        // Special case: if the actor IS the target, redirect to leaveGroup semantics
        // (allows the last-owner block to apply correctly vs kick)
        if (session.playerId === playerId) {
          // A self-kick of the last owner should be blocked by leaveGroup
          // This path is reached when the owner hits DELETE /members/:ownerId without /leave
          // Apply the same last-owner guard
          const groupResult = await (deps.db as any).query(
            `SELECT id FROM public.player_groups WHERE id = $1`,
            [groupId]
          )
          if (groupResult.rows.length === 0) {
            return res.status(404).json({ code: 'NOT_FOUND', message: 'Group not found' })
          }

          const memberResult = await (deps.db as any).query(
            `SELECT role FROM public.player_group_members WHERE group_id = $1 AND player_id = $2`,
            [groupId, playerId]
          )
          if (memberResult.rows.length === 0) {
            return res.status(404).json({ code: 'NOT_FOUND', message: 'Member not found' })
          }

          if (memberResult.rows[0].role === 'owner') {
            // Check if last owner
            const otherOwners = await (deps.db as any).query(
              `SELECT COUNT(*) FROM public.player_group_members
               WHERE group_id = $1 AND role = 'owner' AND player_id != $2`,
              [groupId, playerId]
            )
            if (parseInt(otherOwners.rows[0].count) === 0) {
              return res.status(409).json({ code: 'LAST_OWNER', message: 'Cannot remove the last owner' })
            }
          }
        }

        await groupRepo.kickMember(groupId, session.playerId, playerId)

        return res.status(200).json({ ok: true })
      } catch (err) {
        next(handleGroupError(err))
      }
    }
  )

  return router
}

/**
 * Map repository-layer errors to HTTP-appropriate errors.
 */
function handleGroupError(err: unknown): unknown {
  if (err instanceof LastOwnerError) {
    const e = new Error('Cannot remove or demote the last owner') as any
    e.code = 'LAST_OWNER'
    e.statusCode = 409
    return e
  }

  if (err instanceof Error) {
    const code = (err as any).code
    if (code === 'FORBIDDEN') {
      return new ForbiddenError('group')
    }
    if (code === 'NOT_FOUND') {
      // Return a plain object the error handler will interpret as 404
      const notFound = new Error(err.message) as any
      notFound.statusCode = 404
      notFound.code = 'NOT_FOUND'
      return notFound
    }
  }

  return err
}
