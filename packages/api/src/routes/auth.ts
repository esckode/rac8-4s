import { Router, Request, Response, NextFunction } from 'express'
import bcryptjs from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { AppDependencies } from '../app'
import { AccountRepository, PasswordResetCodeRepository } from '../db'
import { hashPassword } from '../auth/password'
import { issueOrganizerToken } from '../auth/tokens'
import { validateMagicLinkToken } from '../auth/magic-link'
import { requireOrganizerAuth } from '../auth/middleware'
import { createRateLimitMiddleware } from '../middleware/rate-limit'
import { getLogger } from '../logger'
import { TokenInvalidError } from '../auth/errors'
import { sendPasswordResetEmail } from '../email-adapter'

const log = getLogger('auth')

// Email validation regex: must have @ and at least one dot, no spaces
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Issue a session token for login (works for any role).
 * Similar to issueOrganizerToken but role-agnostic.
 */
function issueSessionToken(
  payload: { sub: string; email: string },
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

  // POST /api/auth/signup - Create a new account
  router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
    try {
      let { email, name, password, token } = req.body

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

      // Validate password length (minimum 6 characters)
      if (password && password.length < 6) {
        validationErrors.push('password must be at least 6 characters')
      }

      // Step 2: If token provided (including empty string as an attempt), validate it and extract email
      // Check if token was explicitly provided (even if empty), or if email is missing (requiring token)
      const tokenProvided = 'token' in req.body

      if (tokenProvided) {
        try {
          const magicPayload = await validateMagicLinkToken(token, deps.tokenStore)
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

      // Step 4: Hash password with bcryptjs (10 salt rounds)
      const passwordHash = await hashPassword(password, 10)

      // Step 5: Create account
      const account = await accountRepo.create(email, 'organizer', 'active')

      // Step 5b: Update password hash
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Step 6: Generate JWT session token
      const tokenPair = issueOrganizerToken(
        {
          sub: account.id,
          email: account.email,
        },
        deps.jwtConfig
      )

      // Step 8: Log success
      log.info('account.created', {
        accountId: account.id,
        email: account.email,
        role: 'organizer'
      })

      // Step 9: Return 201 with user and token
      return res.status(201).json({
        user: {
          id: account.id,
          email: account.email,
          name: name,
          role: 'player'
        },
        token: tokenPair.accessToken
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
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        })
      }

      // Generate session token
      const token = issueSessionToken(
        {
          sub: account.id,
          email: account.email,
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

      // Return user info (without password_hash or other sensitive data)
      return res.status(200).json({
        id: account.id,
        email: account.email,
        role: account.role,
      })
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

      // Generate 6-digit reset code
      const code = PasswordResetCodeRepository.generateCode()

      // Lookup account by email (may not exist)
      const account = await accountRepo.findByEmail(normalizedEmail)

      // If account exists, create reset code and send email
      if (account) {
        // Create reset code with 15-minute expiration
        const resetCode = await resetCodeRepo.create(account.id, code, 15)

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
