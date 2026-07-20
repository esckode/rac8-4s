import { Router, Request, Response, NextFunction } from 'express'
import { getLogger } from '../logger'
import { requireOrganizerAuth } from '../auth/middleware'
import { DataSubjectRequestService } from '../dsr-service'
import type { AppDependencies } from '../app'

const log = getLogger('admin')

export function adminRouter(deps: AppDependencies): Router {
  const router = Router()

  // POST /api/admin/dsr — operator data-subject-request (erase or export)
  // Auth: organizer JWT (any valid organizer — operator-level access assumed)
  router.post('/dsr', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)

      const { email, type } = req.body as { email?: string; type?: string }
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'email is required' })
      }
      if (type !== 'erase' && type !== 'export') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'type must be "erase" or "export"' })
      }

      const svc = new DataSubjectRequestService(deps.db as any)

      if (type === 'export') {
        const result = await svc.export(email)
        if (result.status === 'not_found') return res.status(404).json({ code: 'NOT_FOUND' })
        log.info('dsr.export.requested', {})
        return res.json(result.data)
      }

      // type === 'erase'
      const result = await svc.erase(email)
      if (result.status === 'not_found') return res.status(404).json({ code: 'NOT_FOUND' })
      log.info('dsr.erase.requested', {})
      return res.json({ status: 'erased' })
    } catch (err) {
      next(err)
    }
  })

  return router
}
