import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { PlayerRepository } from '../db'
import { requirePlayerSessionAuth, resolvePlayerIdentity } from '../auth'
import { buildCoachToolContext } from '../assistant/tools'
import { buildPlayerSnapshot } from '../assistant/player-snapshot'
import { RatingsRepository } from '../repositories/ratings-repository'
import { seedRatingForSport } from '../services/ratings-service'
import { RATING_MIN, RATING_MAX, SEED_DEFAULT, PROVISIONAL_MATCHES } from '../services/ratings-constants'
import { isReservedDisplayName } from '../assistant/trigger'
import { getLogger } from '../logger'

const log = getLogger('player')

export default function playerRouter(deps: AppDependencies) {
  const router = Router()
  const playerRepo = new PlayerRepository(deps.db)
  const ratingsRepo = new RatingsRepository(deps.db)

  // Resolve the acting player's id from either a magic-link player session or a
  // registered player's account JWT (role 'player', carries playerId). Used by
  // the cross-tournament player views, which aren't tournament-scoped.
  // ISSUE-35: delegates to the shared identity resolver — this used to be a
  // third hand-rolled copy of the same dual-auth logic duplicated in
  // tournaments.ts and (until ISSUE-35) analytics.ts.
  async function resolvePlayerId(authHeader: string | undefined): Promise<string> {
    const resolved = await resolvePlayerIdentity(deps, authHeader)
    return resolved.playerId
  }

  // GET /player/session - validate a player-session token and return identity
  // Used by the frontend to restore a magic-link player session (no account JWT).
  router.get('/session', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      res.json({
        playerId: payload.playerId,
        tournamentId: payload.tournamentId,
        role: 'player',
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/tournaments - list player's tournaments
  router.get('/tournaments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
      const limit = req.query.limit ? parseInt(req.query.limit as string) : deps.config.limits.paginationDefaults.tournaments

      const result = await playerRepo.listTournamentsByPlayer(playerId, { offset, limit })

      res.json({
        tournaments: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          sport: row.sport,
          status: row.status,
          registeredAt: row.created_at,
        })),
        pagination: {
          offset,
          limit,
          total: result.total,
          hasMore: offset + limit < result.total,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/snapshot - next match, standings, and last results across
  // tournaments (ISSUE-28: the Play hub's data source). Reuses the coach's
  // own gathering — buildCoachToolContext + buildPlayerSnapshot — rather
  // than a second query path.
  router.get('/snapshot', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)
      const ctx = await buildCoachToolContext(deps.db as any, playerId)
      const data = await buildPlayerSnapshot(ctx)
      res.json(data)
    } catch (err) {
      next(err)
    }
  })

  // GET /player/contact-preferences - get player's contact sharing preference
  router.get('/contact-preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      const player = await playerRepo.findById(payload.playerId)
      if (!player) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Player not found' })
      }

      res.json({ shareContact: player.share_contact })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /player/contact-preferences - update contact sharing preference
  router.patch('/contact-preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      if (typeof req.body.shareContact !== 'boolean') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'shareContact must be a boolean' })
      }

      const updated = await playerRepo.updateShareContact(payload.playerId, req.body.shareContact)

      log.info('contact.preferences.updated', { playerId: payload.playerId, shareContact: req.body.shareContact })

      res.json({ shareContact: updated.share_contact })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/read-receipt-preferences - get player's read-receipt sharing preference (V6.1)
  // Registered before PATCH to respect §10 route ordering.
  router.get('/read-receipt-preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      const player = await playerRepo.findById(payload.playerId)
      if (!player) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Player not found' })
      }

      res.json({ shareReadReceipts: player.share_read_receipts })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /player/read-receipt-preferences - update read-receipt sharing preference (V6.1)
  router.patch('/read-receipt-preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      if (typeof req.body.shareReadReceipts !== 'boolean') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'shareReadReceipts must be a boolean' })
      }

      const updated = await playerRepo.updateShareReadReceipts(payload.playerId, req.body.shareReadReceipts)

      log.info('read_receipt.preferences.updated', { playerId: payload.playerId, shareReadReceipts: req.body.shareReadReceipts })

      res.json({ shareReadReceipts: updated.share_read_receipts })
    } catch (err) {
      next(err)
    }
  })

  const MAX_NAME_LENGTH = 50

  // PATCH /player/name - update the caller's display name (ISSUE-58, Profile
  // Account section). Names are how @mentions resolve (player-groups.ts),
  // so a rename changes who future @OldName mentions reach; past messages
  // are unaffected — they carry sender_name_snapshot.
  router.patch('/name', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      const { name } = req.body
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'name is required' })
      }
      const trimmed = name.trim()
      if (trimmed.length > MAX_NAME_LENGTH) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: `name must not exceed ${MAX_NAME_LENGTH} characters`,
        })
      }
      if (isReservedDisplayName(trimmed)) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'name is reserved' })
      }

      const player = await playerRepo.updateName(playerId, trimmed)

      log.info('player.renamed', { playerId })

      res.json({ name: player.name })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/ratings - read the caller's own skill ratings
  // Returns all buckets (sport/format) for the authenticated player, each with
  // a provisional flag (true if matchesPlayed < PROVISIONAL_MATCHES). Never
  // returns another player's ratings — this is a read-only player surface.
  // Also returns min/max/seedDefault so the frontend never holds its own copy
  // of a rating constant (§0a).
  router.get('/ratings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      const ratings = await ratingsRepo.getAllFor(playerId)

      res.json({
        ratings: ratings.map(r => ({
          sport: r.sport,
          format: r.format,
          rating: r.rating,
          matchesPlayed: r.matchesPlayed,
          provisional: r.matchesPlayed < PROVISIONAL_MATCHES,
        })),
        min: RATING_MIN,
        max: RATING_MAX,
        seedDefault: SEED_DEFAULT,
      })
    } catch (err) {
      next(err)
    }
  })

  // PUT /player/ratings/seed - accept a player's self-rating for one sport,
  // seeding BOTH formats (singles + doubles) from the same value (P13 Phase
  // 5). R21: fired at tournament registration, before any score exists —
  // rejected with 409 once either format's bucket already has a scored
  // match, since seeding is only legal before the first score. Skippable by
  // design — a player who never calls this simply stays at SEED_DEFAULT.
  router.put('/ratings/seed', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      const { sport, rating } = req.body

      if (typeof sport !== 'string' || !sport.trim()) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'sport is required' })
      }

      if (typeof rating !== 'number' || rating < RATING_MIN || rating > RATING_MAX) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: `rating must be a number between ${RATING_MIN} and ${RATING_MAX}`,
        })
      }

      const [existingSingles, existingDoubles] = await Promise.all([
        ratingsRepo.getFor(playerId, sport, 'singles'),
        ratingsRepo.getFor(playerId, sport, 'doubles'),
      ])

      if ((existingSingles?.matchesPlayed ?? 0) > 0 || (existingDoubles?.matchesPlayed ?? 0) > 0) {
        return res.status(409).json({
          code: 'RATING_ALREADY_SCORED',
          message: 'This sport already has a scored match; seeding is only allowed before the first score.',
        })
      }

      const seeded = await seedRatingForSport(ratingsRepo, playerId, sport, rating)

      res.json({
        sport,
        singles: { rating: seeded.singles.rating, matchesPlayed: seeded.singles.matchesPlayed },
        doubles: { rating: seeded.doubles.rating, matchesPlayed: seeded.doubles.matchesPlayed },
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/partners - the caller's last 10 distinct doubles partners
  // across all groups/tournaments (P13 Phase 13, R28), most recent first.
  // Own partners only — there is no way to ask for another player's list;
  // R1/R28 permit cross-group visibility solely because this page is
  // owner-private.
  router.get('/partners', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      const result = await deps.db.query(
        `SELECT p.id AS partner_id, p.name AS partner_name, MAX(t.created_at) AS last_partnered_at
         FROM public.teams t
         JOIN public.players p
           ON p.id = CASE WHEN t.player1_id = $1 THEN t.player2_id ELSE t.player1_id END
         WHERE t.player1_id = $1 OR t.player2_id = $1
         GROUP BY p.id, p.name
         ORDER BY last_partnered_at DESC
         LIMIT 10`,
        [playerId]
      )

      res.json({
        partners: result.rows.map((r: any) => ({
          playerId: r.partner_id,
          name: r.partner_name,
          lastPartneredAt: r.last_partnered_at,
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/notifications/messages - personal notification history
  router.get('/notifications/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 100) : 50

      const result = await deps.db.query(
        `SELECT gm.id, gm.body, gm.type, gm.created_at, gm.metadata
         FROM messaging.group_messages gm
         JOIN messaging.conversations c ON c.id = gm.conversation_id
         WHERE c.type = 'personal' AND c.player_id = $1
         ORDER BY gm.created_at DESC
         LIMIT $2`,
        [playerId, limit]
      )

      res.json({
        messages: result.rows.map((r: any) => ({
          id: r.id,
          body: r.body,
          type: r.type,
          createdAt: r.created_at,
          metadata: r.metadata,
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /player/notifications/read - mark all personal notifications as read
  router.post('/notifications/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      // ISSUE-63: actionable notifications (metadata carries an unresolved
      // action — groupInviteToken today) stay unread until the action
      // completes, so the badge means "you still owe someone a response,"
      // not just "you've scrolled past this."
      await deps.db.query(
        `UPDATE messaging.group_message_recipients gmr
         SET read_at = now()
         FROM messaging.group_messages gm
         JOIN messaging.conversations c ON c.id = gm.conversation_id
         WHERE gmr.message_id = gm.id
           AND c.type = 'personal'
           AND c.player_id = $1
           AND gmr.player_id = $1
           AND gmr.read_at IS NULL
           AND (gm.metadata->>'groupInviteToken') IS NULL`,
        [playerId]
      )

      log.info('notifications.read', { playerId })

      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  // POST /player/notifications/:messageId/read - clear one specific row
  // (ISSUE-63: used when an actionable notification's action completes,
  // e.g. a group invite is accepted — mark-all-read above deliberately
  // skips it until then). Idempotent; no-op if the row doesn't belong to
  // the caller.
  router.post('/notifications/:messageId/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)
      const messageId = req.params.messageId as string

      await deps.db.query(
        `UPDATE messaging.group_message_recipients gmr
         SET read_at = now()
         FROM messaging.group_messages gm
         JOIN messaging.conversations c ON c.id = gm.conversation_id
         WHERE gmr.message_id = gm.id
           AND gm.id = $2
           AND c.type = 'personal'
           AND c.player_id = $1
           AND gmr.player_id = $1`,
        [playerId, messageId]
      )

      log.info('notification.read', { playerId, messageId })

      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  // GET /player/notifications/unread - count of unread personal notifications
  router.get('/notifications/unread', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePlayerId(req.headers.authorization)

      const result = await deps.db.query(
        `SELECT COUNT(*) AS n
         FROM messaging.group_message_recipients gmr
         JOIN messaging.group_messages gm ON gm.id = gmr.message_id
         JOIN messaging.conversations c ON c.id = gm.conversation_id
         WHERE c.type = 'personal'
           AND c.player_id = $1
           AND gmr.player_id = $1
           AND gmr.read_at IS NULL`,
        [playerId]
      )

      res.json({ unread: Number(result.rows[0].n) })
    } catch (err) {
      next(err)
    }
  })

  return router
}
