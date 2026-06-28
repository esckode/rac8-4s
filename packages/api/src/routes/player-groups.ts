/**
 * G1.2 + G1.3 + G2.2 — Player group membership lifecycle, invite flow, and chat routes.
 *
 * Mounted at /player/groups. Route ordering §10: static paths before :id.
 *
 * Routes:
 *   POST   /player/groups                               — create group (creator becomes owner)
 *   POST   /player/groups/:groupId/invites/accept       — invitee accepts invite (age-gated)
 *   POST   /player/groups/:groupId/invites              — owner creates email-bound invite
 *   POST   /player/groups/:groupId/messages             — member sends a text message (G2.2)
 *   GET    /player/groups/:groupId/messages             — member gets history (G2.2)
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
          })),
        })
      } catch (err) {
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
