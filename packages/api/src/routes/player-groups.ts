/**
 * G1.2 — Player group membership lifecycle routes.
 *
 * Mounted at /player/groups. Route ordering §10: static paths before :id.
 *
 * Routes:
 *   POST   /player/groups                              — create group (creator becomes owner)
 *   POST   /player/groups/:groupId/members/:pid/promote — owner promotes member → owner
 *   POST   /player/groups/:groupId/members/:pid/demote  — owner demotes owner → member
 *   DELETE /player/groups/:groupId/members/:pid         — owner kicks member
 *   DELETE /player/groups/:groupId/members/:pid/leave   — self-leave (any member)
 */

import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { requirePlayerSessionAuth } from '../auth'
import { ForbiddenError } from '../auth/errors'
import { GroupRepository, LastOwnerError } from '../repositories/group-repository'
import { getLogger } from '../logger'

const log = getLogger('player-groups')

export default function playerGroupsRouter(deps: AppDependencies): Router {
  const router = Router({ mergeParams: true })
  const groupRepo = new GroupRepository(deps.db as any)

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

        await groupRepo.leaveGroup(groupId, playerId)

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
