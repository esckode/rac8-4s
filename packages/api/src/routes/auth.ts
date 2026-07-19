import { Router, Request, Response, NextFunction } from 'express'
import bcryptjs from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { AppDependencies } from '../app'
import { AccountRepository, PasswordResetCodeRepository, PlayerRepository, AgeAttestation, AgeAttestationRequiredError, UnderAgeError } from '../db'
import { hashPassword } from '../auth/password'
import { issueOrganizerToken } from '../auth/tokens'
import { validateMagicLinkToken } from '../auth/magic-link'
import { requireOrganizerAuth, requirePlayerSessionAuth } from '../auth/middleware'
import { createRateLimitMiddleware } from '../middleware/rate-limit'
import { getLogger } from '../logger'
import { TokenInvalidError } from '../auth/errors'
import { sendPasswordResetEmail } from '../email-adapter'
import { isReservedDisplayName } from '../assistant/trigger'
import { PlayerSettingsRepository, DEFAULT_PLAYER_SETTINGS } from '../repositories/player-settings-repository'
import { getPendingActions } from '../services/pending-actions-service'
import { AvailabilityRepository } from '../repositories/availability-repository'

const log = getLogger('auth')

// Email validation regex: must have @ and at least one dot, no spaces
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Issue a session token for login (works for any role).
 * Similar to issueOrganizerToken but role-agnostic.
 */
function issueSessionToken(
  payload: { sub: string; email: string; playerId?: string },
  role: string,
  expiresInSeconds: number,
  secret: string
): string {
  const jti = randomUUID()
  const token = jwt.sign(
    {
      ...payload,
      role,
      jti,
    },
    secret,
    {
      expiresIn: expiresInSeconds,
    }
  )

  return token
}

export default function authRouter(deps: AppDependencies) {
  const router = Router()
  const accountRepo = new AccountRepository(deps.db)
  const resetCodeRepo = new PasswordResetCodeRepository(deps.db)
  const playerRepo = new PlayerRepository(deps.db)
  const playerSettingsRepo = new PlayerSettingsRepository(deps.db as any)
  const availabilityRepo = new AvailabilityRepository(deps.db as any)

  // POST /api/auth/signup - Create a new account
  router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
    try {
      let { email, name, password, token, dob_attestation } = req.body
      const ageAttestation: AgeAttestation | null = dob_attestation || null
      let magicPayload: any = null

      // Step 1: Validate all inputs
      const validationErrors: string[] = []

      // Check for required fields
      if (!name) {
        validationErrors.push('name is required')
      }
      if (!password) {
        validationErrors.push('password is required')
      }

      // Validate email format if provided
      if (email && !EMAIL_REGEX.test(email)) {
        validationErrors.push('email must be in valid format')
      }

      // Validate name length (minimum 2 characters)
      if (name && name.length < 2) {
        validationErrors.push('name must be at least 2 characters')
      }

      // Reserved display names (the @coach assistant) cannot be taken by players
      if (name && isReservedDisplayName(name)) {
        validationErrors.push('name is reserved')
      }

      // Validate password length (minimum 6 characters)
      if (password && password.length < 6) {
        validationErrors.push('password must be at least 6 characters')
      }

      // Step 2: If token provided (including empty string as an attempt), validate it and extract email
      // Check if token was explicitly provided (even if empty), or if email is missing (requiring token)
      const tokenProvided = 'token' in req.body

      if (tokenProvided) {
        try {
          magicPayload = await validateMagicLinkToken(token, deps.tokenStore)
          // Use the provided email if given, otherwise use token email
          if (!email) {
            email = magicPayload.email
          }
        } catch (err) {
          if (err instanceof TokenInvalidError) {
            return res.status(401).json({
              code: 'INVALID_TOKEN',
              message: 'This link has expired or is invalid'
            })
          }
          throw err
        }
      } else {
        // No token provided, so email is required
        if (!email) {
          validationErrors.push('email is required')
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: validationErrors.join(', ')
        })
      }

      // Normalize email to lowercase
      email = email.toLowerCase()

      // Step 3: Check if account with email already exists (case-insensitive)
      const existingAccount = await accountRepo.findByEmail(email)
      if (existingAccount) {
        return res.status(409).json({
          code: 'DUPLICATE_EMAIL',
          message: 'Email already in use'
        })
      }

      // Step 4: Claim/create the durable player identity by email. This makes a
      // registered user act as one player across tournaments and claims any prior
      // guest play under the same (normalized) email. On the creation path the
      // 18+ gate is enforced here — checked BEFORE any account/password work so a
      // rejection (first submit, no attestation yet) leaves no side effects. The
      // designed retry (submit again with a DOB from DobScreen) previously hit
      // this same email as an already-existing account and 409'd as DUPLICATE_EMAIL,
      // because the account used to be created before this check.
      let player
      try {
        player = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, ageAttestation)
      } catch (err) {
        if (err instanceof AgeAttestationRequiredError) {
          return res.status(400).json({ code: 'AGE_ATTESTATION_REQUIRED', message: err.message })
        }
        if (err instanceof UnderAgeError) {
          return res.status(422).json({ code: 'UNDER_AGE', message: err.message })
        }
        throw err
      }

      // Step 5: Hash password with bcryptjs (10 salt rounds)
      const passwordHash = await hashPassword(password, 10)

      // Step 6: Create account
      const account = await accountRepo.create(email, 'player', 'active')

      // Step 6b: Update password hash
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Step 6c: Link the account to the player claimed/created in Step 4.
      await accountRepo.linkPlayer(account.id, player.id)

      // Step 7: Generate JWT session token (carries playerId so the account can
      // act as the player on player-scoped endpoints)
      const sessionToken = issueSessionToken(
        {
          sub: account.id,
          email: account.email,
          playerId: player.id,
        },
        account.role,
        deps.config.auth.sessionTtlSeconds,
        deps.jwtConfig.secret
      )

      // Step 8: If magic link was used, log the tournament registration
      if (magicPayload && magicPayload.tournamentId) {
        log.info('tournament.signup_magic_link', {
          accountId: account.id,
          email: account.email,
          tournamentId: magicPayload.tournamentId
        })
      }

      // Step 9: Log success
      log.info('account.created', {
        accountId: account.id,
        email: account.email,
        role: account.role
      })

      // Step 10: Return 201 with user and token
      return res.status(201).json({
        user: {
          id: account.id,
          email: account.email,
          name: name,
          role: account.role,
          playerId: player.id
        },
        token: sessionToken,
        ...(magicPayload && magicPayload.tournamentId && { tournamentId: magicPayload.tournamentId })
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /api/auth/login - Login with email and password
  router.post(
    '/login',
    createRateLimitMiddleware(
      (req) => `login:${(req.body.email || '').toLowerCase()}:${req.ip}`,
      {
        maxAttempts: deps.config.limits.rateLimit.loginMaxAttempts,
        windowMs: deps.config.limits.rateLimit.loginWindowMs,
        prefix: 'login',
      }
    ),
    async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body

      // Validate email format
      if (!email || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Please enter a valid email',
        })
      }

      // Validate password is not empty
      if (!password || password === '') {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Password is required',
        })
      }

      // Look up account by email
      const account = await accountRepo.findByEmail(email)

      // If account not found or password_hash is not set, return generic error
      // to prevent email enumeration attacks
      if (
        !account ||
        !account.password_hash ||
        account.password_hash === ''
      ) {
        return res.status(401).json({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        })
      }

      // Verify password using bcryptjs (constant-time comparison)
      const passwordMatch = bcryptjs.compareSync(password, account.password_hash)

      if (!passwordMatch) {
        return res.status(401).json({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        })
      }

      // Generate session token (carries the linked playerId, if any, so the
      // account can act on player-scoped endpoints — dual-role capability)
      const token = issueSessionToken(
        {
          sub: account.id,
          email: account.email,
          playerId: account.player_id ?? undefined,
        },
        account.role,
        deps.config.auth.sessionTtlSeconds,
        deps.jwtConfig.secret
      )

      // Log successful login
      log.info('login.success', {
        accountId: account.id,
        email: account.email,
      })

      // Return success response with user info and token
      return res.status(200).json({
        user: {
          id: account.id,
          email: account.email,
          role: account.role,
          playerId: account.player_id ?? null,
        },
        token,
      })
    } catch (err) {
      next(err)
    }
    }
  )

  // GET /api/auth/me - Get current user info
  router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify JWT token and extract payload
      const payload = await requireOrganizerAuth(
        req.headers.authorization,
        deps.jwtConfig,
        deps.tokenStore
      )

      // Lookup account by id
      const account = await accountRepo.findById(payload.sub)

      if (!account) {
        return res.status(401).json({
          code: 'UNAUTHORIZED',
          message: 'Account not found',
        })
      }

      // Log the request
      log.debug('auth.me', { accountId: payload.sub })

      const settings = account.player_id
        ? await playerSettingsRepo.getOrDefaults(account.player_id)
        : { ...DEFAULT_PLAYER_SETTINGS }

      // Return user info (without password_hash or other sensitive data)
      return res.status(200).json({
        id: account.id,
        email: account.email,
        role: account.role,
        playerId: account.player_id ?? null,
        settings,
      })
    } catch (err) {
      next(err)
    }
  })

  // PATCH /api/auth/me/settings - Player Personalization P0: update preferences (lazy upsert)
  router.patch('/me/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requireOrganizerAuth(req.headers.authorization, deps.jwtConfig, deps.tokenStore)
      const account = await accountRepo.findById(payload.sub)
      if (!account) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Account not found' })
      }
      if (!account.player_id) {
        return res.status(400).json({ code: 'NO_LINKED_PLAYER', message: 'This account has no linked player' })
      }

      const { timezone, timezoneManual, tableDensity, coachMemoryEnabled } = req.body as {
        timezone?: unknown
        timezoneManual?: unknown
        tableDensity?: unknown
        coachMemoryEnabled?: unknown
      }

      const updates: {
        timezone?: string | null
        timezoneManual?: boolean
        tableDensity?: 'comfortable' | 'compact'
        coachMemoryEnabled?: boolean
      } = {}

      if (timezone !== undefined) {
        if (timezone !== null && typeof timezone !== 'string') {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'timezone must be a string or null' })
        }
        updates.timezone = timezone
      }
      if (timezoneManual !== undefined) {
        if (typeof timezoneManual !== 'boolean') {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'timezoneManual must be a boolean' })
        }
        updates.timezoneManual = timezoneManual
      }
      if (tableDensity !== undefined) {
        if (tableDensity !== 'comfortable' && tableDensity !== 'compact') {
          return res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: "tableDensity must be 'comfortable' or 'compact'",
          })
        }
        updates.tableDensity = tableDensity
      }
      if (coachMemoryEnabled !== undefined) {
        if (typeof coachMemoryEnabled !== 'boolean') {
          return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'coachMemoryEnabled must be a boolean' })
        }
        updates.coachMemoryEnabled = coachMemoryEnabled
      }

      const settings = await playerSettingsRepo.upsert(account.player_id, updates)

      log.info('settings.updated', { playerId: account.player_id, fields: Object.keys(updates) })

      return res.status(200).json({ settings })
    } catch (err) {
      next(err)
    }
  })

  // Resolve the acting player's id from either a magic-link player session or
  // a registered player's account JWT (role 'player', carries playerId) — same
  // dual-auth pattern as routes/player.ts's resolvePlayerId. Needed because a
  // group-chat visitor's auth_token is a player-session token, not an account
  // JWT, and pending-actions must work there too (it feeds the composer chip).
  async function resolvePendingActionsPlayerId(authHeader: string | undefined): Promise<string | null> {
    try {
      const session = await requirePlayerSessionAuth(authHeader, deps.tokenStore)
      return session.playerId
    } catch (sessionErr) {
      let account
      try {
        account = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore)
      } catch {
        throw sessionErr
      }
      return account.playerId ?? null
    }
  }

  // GET /api/auth/me/pending-actions - Player Personalization P5: caller-scoped
  // aggregation of unscored matches, unvoted open polls, my pending assistant
  // cards, and the nearest deadline across my tournaments. Read-only, no
  // linked-player 400 (an authenticated caller with no linked player has
  // nothing pending — empty state is a valid 200, not an error).
  router.get('/me/pending-actions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePendingActionsPlayerId(req.headers.authorization)
      if (!playerId) {
        return res.status(200).json({ unscoredMatches: [], openPolls: [], pendingCards: [], nearestDeadline: null })
      }

      const pendingActions = await getPendingActions(deps.db as any, playerId)
      return res.status(200).json(pendingActions)
    } catch (err) {
      next(err)
    }
  })

  const VALID_DAY_PARTS = new Set(['morning', 'afternoon', 'evening'])

  function validateAvailabilitySlots(slots: unknown): string | null {
    if (!Array.isArray(slots)) return 'slots must be an array'
    for (const slot of slots) {
      if (!slot || typeof slot !== 'object') return 'each slot must be an object'
      const { weekday, dayPart } = slot as { weekday?: unknown; dayPart?: unknown }
      if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        return 'weekday must be an integer 0-6'
      }
      if (typeof dayPart !== 'string' || !VALID_DAY_PARTS.has(dayPart)) {
        return "dayPart must be one of 'morning', 'afternoon', 'evening'"
      }
    }
    return null
  }

  // GET /api/auth/me/availability - Player Personalization P12: the caller's
  // own weekly availability grid (dual-auth, same as pending-actions).
  router.get('/me/availability', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePendingActionsPlayerId(req.headers.authorization)
      if (!playerId) {
        return res.status(200).json({ slots: [], updatedAt: null })
      }
      const [slots, updatedAt] = await Promise.all([
        availabilityRepo.getSlots(playerId),
        availabilityRepo.getAvailabilityUpdatedAt(playerId),
      ])
      return res.status(200).json({ slots, updatedAt: updatedAt ? updatedAt.toISOString() : null })
    } catch (err) {
      next(err)
    }
  })

  // PUT /api/auth/me/availability - full-grid replace, owner-only by
  // construction (caller-scoped, no target playerId param exists to spoof).
  router.put('/me/availability', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = await resolvePendingActionsPlayerId(req.headers.authorization)
      if (!playerId) {
        return res.status(400).json({ code: 'NO_LINKED_PLAYER', message: 'This account has no linked player' })
      }
      const validationError = validateAvailabilitySlots(req.body.slots)
      if (validationError) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: validationError })
      }
      await availabilityRepo.replaceSlots(playerId, req.body.slots)
      log.info('availability.updated', { playerId, slotCount: req.body.slots.length })
      return res.status(200).json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  // POST /api/auth/logout - Logout and invalidate token
  router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify JWT token and extract payload
      const payload = await requireOrganizerAuth(
        req.headers.authorization,
        deps.jwtConfig,
        deps.tokenStore
      )

      // Get the raw token from Authorization header
      const authHeader = req.headers.authorization || ''
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/)
      const token = tokenMatch ? tokenMatch[1] : ''

      // Decode token to extract JTI without verification
      const decoded = jwt.decode(token) as any
      if (decoded && decoded.jti) {
        // Calculate remaining TTL based on token expiration
        const remainingSeconds = Math.max(0, (decoded.exp * 1000 - Date.now()) / 1000)

        // Add JTI to blocklist with remaining TTL
        await deps.tokenStore.set(`jwt:blocklist:${decoded.jti}`, 'true', remainingSeconds)
      }

      // Log the logout event
      log.info('logout', {
        accountId: payload.sub,
      })

      // Return 204 No Content
      return res.status(204).send()
    } catch (err) {
      next(err)
    }
  })

  // POST /api/auth/forgot-password - Request password reset code (UNPROTECTED)
  router.post(
    '/forgot-password',
    createRateLimitMiddleware(
      (req) => `forgot:${(req.body.email || '').toLowerCase()}`,
      {
        maxAttempts: deps.config.limits.rateLimit.forgotPasswordMaxAttempts,
        windowMs: deps.config.limits.rateLimit.forgotPasswordWindowMs,
        prefix: 'forgot',
        countMode: 'all',
      }
    ),
    async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body

      // Validate email format
      if (!email || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Please enter a valid email',
        })
      }

      // Normalize email to lowercase
      const normalizedEmail = email.toLowerCase()

      // Generate 6-digit reset code (always, to avoid leaking account existence via timing)
      let code = PasswordResetCodeRepository.generateCode()

      // Lookup account by email (may not exist)
      const account = await accountRepo.findByEmail(normalizedEmail)

      // If account exists, create reset code and send email
      if (account) {
        // Create reset code with 15-minute expiration. Retry on the rare chance the
        // random code collides with an existing one (unique constraint violation).
        let resetCode
        for (let attempt = 0; ; attempt++) {
          try {
            resetCode = await resetCodeRepo.create(account.id, code, 15)
            break
          } catch (err) {
            if ((err as { code?: string })?.code === '23505' && attempt < 4) {
              code = PasswordResetCodeRepository.generateCode()
              continue
            }
            throw err
          }
        }

        // Log reset code generation
        log.info('reset_code.generated', {
          accountId: account.id,
          expiresAt: resetCode.expires_at,
        })

        // Send email if email adapter is available (optional, fail gracefully)
        if (deps.emailAdapter) {
          await sendPasswordResetEmail(
            deps.emailAdapter,
            deps.config.email,
            normalizedEmail,
            code,
            15
          )
        }
      }

      // Always return 202 (don't reveal if email exists)
      log.info('forgot_password.requested', {
        email: normalizedEmail,
      })

      return res.status(202).json({
        message: 'If an account exists for this email, a reset code has been sent',
      })
    } catch (err) {
      next(err)
    }
    }
  )

  // POST /api/auth/reset-password - Reset password with reset code (UNPROTECTED)
  router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, code, password } = req.body
      const resetCodeRepo = new PasswordResetCodeRepository(deps.db)

      // Validate email format
      if (!email || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Please enter a valid email'
        })
      }

      // Validate code is exactly 6 digits
      if (!code || !/^\d{6}$/.test(code)) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Code must be 6 digits'
        })
      }

      // Validate password is at least 6 characters
      if (!password || password.length < 6) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Password must be at least 6 characters'
        })
      }

      // Normalize email to lowercase for case-insensitive lookup
      const normalizedEmail = email.toLowerCase()

      // Look up account by email (case-insensitive)
      const account = await accountRepo.findByEmail(normalizedEmail)
      if (!account) {
        return res.status(401).json({
          code: 'INVALID_RESET_CODE',
          message: 'Invalid reset code'
        })
      }

      // Look up reset code
      let resetCode = await resetCodeRepo.findByCode(code)

      if (!resetCode) {
        // Code doesn't exist, find the account's most recent code to increment attempts
        const accountCode = await resetCodeRepo.findByAccountId(account.id)
        if (accountCode) {
          // Check attempts before incrementing
          if (accountCode.attempts > 5) {
            log.info('reset.attempt_blocked', {
              accountId: account.id,
            })
            return res.status(429).json({
              code: 'TOO_MANY_ATTEMPTS',
              message: 'Too many attempts. Try again later.'
            })
          }

          const newAttempts = await resetCodeRepo.incrementAttempts(accountCode.id)
          const attemptsRemaining = 5 - newAttempts

          // Check after incrementing
          if (newAttempts > 5) {
            log.info('reset.attempt_blocked', {
              accountId: account.id,
            })
            return res.status(429).json({
              code: 'TOO_MANY_ATTEMPTS',
              message: 'Too many attempts. Try again later.'
            })
          }

          if (newAttempts >= 2) {
            log.warn('reset.attempt_failed', {
              accountId: account.id,
              attemptsRemaining,
            })
            return res.status(401).json({
              code: 'INVALID_RESET_CODE',
              message: `Invalid reset code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining`
            })
          }

          log.warn('reset.attempt_failed', {
            accountId: account.id,
            attemptsRemaining,
          })
        }

        return res.status(401).json({
          code: 'INVALID_RESET_CODE',
          message: 'Invalid reset code'
        })
      }

      // Check if code is expired
      if (PasswordResetCodeRepository.isExpired(resetCode)) {
        // Check attempts before incrementing
        if (resetCode.attempts > 5) {
          log.info('reset.attempt_blocked', {
            accountId: account.id,
          })
          return res.status(429).json({
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Too many attempts. Try again later.'
          })
        }

        // Increment attempts for expired code
        const newAttempts = await resetCodeRepo.incrementAttempts(resetCode.id)
        const attemptsRemaining = 5 - newAttempts

        // Check after incrementing
        if (newAttempts > 5) {
          log.info('reset.attempt_blocked', {
            accountId: account.id,
          })
          return res.status(429).json({
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Too many attempts. Try again later.'
          })
        }

        if (newAttempts >= 2) {
          log.warn('reset.attempt_failed', {
            accountId: account.id,
            attemptsRemaining,
          })
          return res.status(401).json({
            code: 'INVALID_RESET_CODE',
            message: `Invalid reset code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining`
          })
        }

        log.warn('reset.attempt_failed', {
          accountId: account.id,
          attemptsRemaining,
        })
        return res.status(401).json({
          code: 'INVALID_RESET_CODE',
          message: 'Invalid reset code'
        })
      }

      // Check if code has already been used
      if (PasswordResetCodeRepository.isUsed(resetCode)) {
        return res.status(401).json({
          code: 'INVALID_RESET_CODE',
          message: 'Invalid reset code'
        })
      }

      // Check attempts rate limit even for valid codes
      if (resetCode.attempts >= 5) {
        log.info('reset.attempt_blocked', {
          accountId: account.id,
        })
        return res.status(429).json({
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many attempts. Try again later.'
        })
      }

      // All checks passed, update password
      const passwordHash = await hashPassword(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Mark code as used
      await resetCodeRepo.markAsUsed(resetCode.id)

      // Log success
      log.info('password.reset', {
        accountId: account.id,
        email: account.email
      })

      return res.status(200).json({
        message: 'Password updated successfully'
      })
    } catch (err) {
      next(err)
    }
  })

  return router
}
