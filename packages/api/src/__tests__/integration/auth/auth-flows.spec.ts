import request from 'supertest'
import { Express } from 'express'
import { Pool, PoolClient } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { getTestPool, beginTransaction, rollbackTransaction, getTransactionClient } from '../../helpers/db'
import { createTestApp, JwtConfig } from '../../helpers/app'
import { AccountRepository, PasswordResetCodeRepository } from '../../../db'
import { generateMagicLinkToken } from '../../../auth/magic-link'
import { InMemoryTokenStore } from '../../../auth/token-store'
import { clearRateLimitStore } from '../../../middleware/rate-limit'

function getDb(pool: Pool): Pool | PoolClient {
  return getTransactionClient() || pool
}

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniqueEmail(prefix: string = ''): string {
  const id = uid()
  return `flow-test-${prefix}-${id}@test.local`.toLowerCase()
}

/**
 * Complete Authentication Flow Tests
 *
 * These tests verify entire user workflows combining multiple endpoints,
 * ensuring state transitions and data integrity across the auth system.
 */
describe('Complete Authentication Flows', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jwtConfig: JwtConfig
  let accountRepo: AccountRepository
  let resetCodeRepo: PasswordResetCodeRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    jwtConfig = deps.jwtConfig
    accountRepo = new AccountRepository(getDb(pool))
    resetCodeRepo = new PasswordResetCodeRepository(getDb(pool))
  })

  afterAll(async () => {
    clearRateLimitStore()
    await rollbackTransaction()
  })

  beforeEach(() => {
    clearRateLimitStore()
  })

  // ===================================
  // Flow 1: Complete Signup → Login
  // ===================================
  describe('Flow 1: Signup → Logout → Login', () => {
    it('user can signup, logout, and login with same credentials', async () => {
      const email = uniqueEmail('signup-login')
      const name = 'Flow Test User'
      const password = 'flowpassword123'

      // Step 1: Signup
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ email, name, password })

      expect(signupRes.status).toBe(201)
      expect(signupRes.body.user).toHaveProperty('id')
      const accountId = signupRes.body.user.id
      const signupToken = signupRes.body.token

      // Verify user is created in database
      const account = await accountRepo.findById(accountId)
      expect(account).toBeDefined()
      expect(account?.email).toBe(email.toLowerCase())
      expect(account?.status).toBe('active')

      // Verify token can decode
      const decoded = jwt.verify(signupToken, jwtConfig.secret) as any
      expect(decoded.sub).toBe(accountId)
      expect(decoded.email).toBe(email.toLowerCase())

      // Step 2: Logout with signup token
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${signupToken}`)

      expect(logoutRes.status).toBe(204)

      // Verify token is invalidated
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${signupToken}`)
      expect(meRes.status).toBe(401)

      // Step 3: Login with email and password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(loginRes.status).toBe(200)
      expect(loginRes.body.user.id).toBe(accountId)
      expect(loginRes.body.user.email).toBe(email.toLowerCase())
      const loginToken = loginRes.body.token

      // Verify new token is valid
      const meRes2 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginToken}`)

      expect(meRes2.status).toBe(200)
      expect(meRes2.body.id).toBe(accountId)
      expect(meRes2.body.email).toBe(email.toLowerCase())
    })

    it('signup user receives correct JWT claims for subsequent auth', async () => {
      const email = uniqueEmail('jwt-claims')
      const name = 'JWT Test User'
      const password = 'jwtpass123'

      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ email, name, password })

      expect(signupRes.status).toBe(201)
      const token = signupRes.body.token

      // Decode JWT
      const decoded = jwt.verify(token, jwtConfig.secret) as any

      // Verify essential claims for session validation
      expect(decoded).toHaveProperty('sub') // subject (user ID)
      expect(decoded).toHaveProperty('email')
      expect(decoded).toHaveProperty('role')
      expect(decoded).toHaveProperty('iat') // issued at
      expect(decoded).toHaveProperty('exp') // expiration
      expect(decoded.email).toBe(email.toLowerCase())

      // Verify token expiration is in the future
      const expirationTime = new Date(decoded.exp * 1000)
      expect(expirationTime.getTime()).toBeGreaterThan(Date.now())
    })

    it('new user defaults to organizer role after signup', async () => {
      const email = uniqueEmail('role-default')
      const password = 'rolepass123'

      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Role User', password })

      expect(signupRes.status).toBe(201)
      expect(signupRes.body.user.role).toBe('organizer')

      // Verify database also has organizer role
      const account = await accountRepo.findById(signupRes.body.user.id)
      expect(account?.role).toBe('organizer')
    })
  })

  // ===================================
  // Flow 2: Forgot Password → Reset → Login
  // ===================================
  describe('Flow 2: Forgot Password → Reset Password → Login', () => {
    it('user can request password reset, reset password, and login with new password', async () => {
      const email = uniqueEmail('password-reset')
      const originalPassword = 'originalpass123'
      const newPassword = 'newpass456'

      // Step 1: Create account with original password
      const account = await accountRepo.create(email, 'organizer')
      const originalHash = await bcryptjs.hash(originalPassword, 10)
      await accountRepo.updatePasswordHash(account.id, originalHash)

      // Verify login works with original password
      let loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: originalPassword })
      expect(loginRes.status).toBe(200)

      // Step 2: Request password reset
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(forgotRes.status).toBe(202)

      // Verify reset code was created in database
      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode).toBeDefined()
      expect(resetCode?.used_at).toBeNull() // Not used yet

      // Step 3: Reset password with code
      const code = resetCode!.code
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: newPassword })

      expect(resetRes.status).toBe(200)
      expect(resetRes.body.message).toBe('Password updated successfully')

      // Verify code is marked as used
      const usedCode = await resetCodeRepo.findByCode(code)
      expect(usedCode?.used_at).not.toBeNull()

      // Verify old password doesn't work
      const oldPasswordLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: originalPassword })

      expect(oldPasswordLoginRes.status).toBe(401)
      expect(oldPasswordLoginRes.body.code).toBe('INVALID_CREDENTIALS')

      // Step 4: Login with new password
      const newPasswordLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: newPassword })

      expect(newPasswordLoginRes.status).toBe(200)
      expect(newPasswordLoginRes.body.user.id).toBe(account.id)
      expect(newPasswordLoginRes.body.user.email).toBe(email)

      // Verify new token is valid
      const newToken = newPasswordLoginRes.body.token
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${newToken}`)

      expect(meRes.status).toBe(200)
      expect(meRes.body.id).toBe(account.id)
    })

    it('reset code can only be used once', async () => {
      const email = uniqueEmail('code-once')
      const password1 = 'newpass1'
      const password2 = 'newpass2'

      // Setup: Create account and request reset
      const account = await accountRepo.create(email, 'organizer')
      await accountRepo.updatePasswordHash(account.id, await bcryptjs.hash('oldpass', 10))

      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(forgotRes.status).toBe(202)

      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      const code = resetCode!.code

      // First reset should succeed
      const resetRes1 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: password1 })

      expect(resetRes1.status).toBe(200)

      // Attempt to reuse same code should fail
      const resetRes2 = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: password2 })

      expect(resetRes2.status).toBe(401)

      // Verify only first password works
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: password1 })

      expect(loginRes.status).toBe(200)
    })

    it('expired reset code cannot be used', async () => {
      const email = uniqueEmail('expired-code')
      const newPassword = 'newpass789'

      // Create account and reset code with very short TTL
      const account = await accountRepo.create(email, 'organizer')
      const code = PasswordResetCodeRepository.generateCode()
      await resetCodeRepo.create(account.id, code, 1 / 60) // 1 second TTL (parameter is in minutes)

      // Wait for code to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Try to use expired code
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code, password: newPassword })

      expect(resetRes.status).toBe(401)
      expect(resetRes.body.code).toBe('INVALID_RESET_CODE')
    })
  })

  // ===================================
  // Flow 3: Magic Link Signup → Login
  // ===================================
  describe('Flow 3: Magic Link Signup → Login', () => {
    it('user can signup with magic link token and login with email/password', async () => {
      const email = uniqueEmail('magic-flow')
      const name = 'Magic User'
      const password = 'magicpass123'

      // Step 1: Create magic link token (organizer would do this)
      const magicPayload = {
        playerId: 'player_temp',
        tournamentId: 'tournament_test',
        email,
        createdAt: Date.now(),
      }

      const magicLink = await generateMagicLinkToken(magicPayload, 3600, tokenStore)

      // Step 2: Signup with magic link token
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ token: magicLink.token, name, password })

      expect(signupRes.status).toBe(201)
      expect(signupRes.body.user.email).toBe(email.toLowerCase())
      const accountId = signupRes.body.user.id

      // Verify account created with magic link email
      const account = await accountRepo.findById(accountId)
      expect(account).toBeDefined()
      expect(account?.email).toBe(email.toLowerCase())
      expect(account?.status).toBe('active')

      // Step 3: Login with email and password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(loginRes.status).toBe(200)
      expect(loginRes.body.user.id).toBe(accountId)

      // Step 4: Verify session with GET /auth/me
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.token}`)

      expect(meRes.status).toBe(200)
      expect(meRes.body.id).toBe(accountId)
      expect(meRes.body.email).toBe(email.toLowerCase())
    })

    it('magic link email can be overridden but user still logs in with original email', async () => {
      const tokenEmail = uniqueEmail('token-email')
      const userEmail = uniqueEmail('user-email')
      const password = 'magicpass456'

      // Create magic link with one email
      const magicPayload = {
        playerId: 'player_temp',
        tournamentId: 'tournament_test',
        email: tokenEmail,
        createdAt: Date.now(),
      }

      const magicLink = await generateMagicLinkToken(magicPayload, 3600, tokenStore)

      // Signup with different email
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ token: magicLink.token, email: userEmail, name: 'Override User', password })

      expect(signupRes.status).toBe(201)
      expect(signupRes.body.user.email).toBe(userEmail.toLowerCase())

      // Should be able to login with overridden email
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: userEmail, password })

      expect(loginRes.status).toBe(200)

      // Should NOT be able to login with token email
      const loginRes2 = await request(app)
        .post('/api/auth/login')
        .send({ email: tokenEmail, password })

      expect(loginRes2.status).toBe(401)
    })
  })

  // ===================================
  // Flow 4: Rate Limiting During Login
  // ===================================
  describe('Flow 4: Rate Limiting with Multiple Failed Attempts', () => {
    it('user is rate limited after 5 failed login attempts, recovers after wait', async () => {
      const email = uniqueEmail('rate-limit')
      const password = 'correctpass123'

      // Create account
      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Step 1: Make 5 failed attempts with wrong password
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' })

        expect(res.status).toBe(401)
      }

      // Step 2: 6th attempt should be rate limited
      const rateLimitedRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(rateLimitedRes.status).toBe(429)
      expect(rateLimitedRes.body.code).toBe('RATE_LIMITED')

      // Step 3: Clear rate limit store (simulating time passing)
      clearRateLimitStore()

      // Step 4: Should be able to login with correct password now
      const successLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(successLoginRes.status).toBe(200)
      expect(successLoginRes.body.user.id).toBe(account.id)
    })

    it('successful login clears failed attempt counter', async () => {
      const email = uniqueEmail('counter-clear')
      const password = 'correctpass456'

      // Create account
      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Make 3 failed attempts
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' })
        expect(res.status).toBe(401)
      }

      // Successful login should clear counter
      const successRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(successRes.status).toBe(200)

      // Should be able to make more failed attempts without hitting rate limit
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' })
        expect(res.status).toBe(401)
      }

      // Only on 5th attempt should be rate limited
      const rateLimitedRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })

      expect(rateLimitedRes.status).toBe(429)
    }, 15000)
  })

  // ===================================
  // Flow 5: Session Persistence
  // ===================================
  describe('Flow 5: Session Persistence After Login', () => {
    it('user can restore session using stored token (page reload simulation)', async () => {
      const email = uniqueEmail('session-persist')
      const password = 'sessionpass123'

      // Step 1: Login and get token
      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(loginRes.status).toBe(200)
      const token = loginRes.body.token
      const initialUserData = loginRes.body.user

      // Step 2: Simulate page reload - fetch user data with stored token
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)

      // Verify session data matches initial login
      expect(meRes.body.id).toBe(initialUserData.id)
      expect(meRes.body.email).toBe(initialUserData.email)
      expect(meRes.body.role).toBe(initialUserData.role)

      // Step 3: Multiple subsequent requests with same token
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.id).toBe(account.id)
      }
    })

    it('session is restored correctly with user data matching database', async () => {
      const email = uniqueEmail('session-verify')
      const password = 'sessionverify456'

      // Create account with specific data
      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      // Fetch with /me and verify matches database
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)

      // Fetch user from database directly
      const dbAccount = await accountRepo.findById(account.id)

      // Verify /me response matches database
      expect(meRes.body.id).toBe(dbAccount?.id)
      expect(meRes.body.email).toBe(dbAccount?.email)
      expect(meRes.body.role).toBe(dbAccount?.role)
    })

    it('invalidated token cannot restore session after logout', async () => {
      const email = uniqueEmail('session-invalid')
      const password = 'invalidpass789'

      // Create account and login
      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.token

      // Verify token works before logout
      let meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)

      // Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(logoutRes.status).toBe(204)

      // Try to use token after logout
      meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(401)
    })
  })

  // ===================================
  // Flow 6: Auth State Transitions
  // ===================================
  describe('Flow 6: Complete Auth State Transitions', () => {
    it('user transitions through all auth states: unauthenticated → signup → authenticated → logout → unauthenticated', async () => {
      const email = uniqueEmail('state-transitions')
      const password = 'statepass123'

      // State 1: Unauthenticated - /me should fail
      let meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')

      expect(meRes.status).toBe(401)

      // State 2: Signup - transition to authenticated
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({
          email,
          name: 'State Test User',
          password,
        })

      expect(signupRes.status).toBe(201)
      const token = signupRes.body.token
      const accountId = signupRes.body.user.id

      // State 3: Authenticated - /me should work
      meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)
      expect(meRes.body.id).toBe(accountId)

      // State 4: Logout - transition to unauthenticated
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(logoutRes.status).toBe(204)

      // State 5: Unauthenticated again - /me should fail
      meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(401)
    })

    it('user transitions through password reset flow: forgot → reset → authenticated', async () => {
      const email = uniqueEmail('pwd-state')
      const originalPassword = 'original123'
      const newPassword = 'newpwd456'

      // Setup: Create account and verify login works
      const account = await accountRepo.create(email, 'organizer')
      const originalHash = await bcryptjs.hash(originalPassword, 10)
      await accountRepo.updatePasswordHash(account.id, originalHash)

      let loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: originalPassword })
      expect(loginRes.status).toBe(200)

      // State 1: Request password reset
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })

      expect(forgotRes.status).toBe(202)

      // State 2: Get reset code from database
      const resetCode = await resetCodeRepo.findByAccountId(account.id)
      expect(resetCode).toBeDefined()

      // State 3: Reset password with code
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: resetCode!.code, password: newPassword })

      expect(resetRes.status).toBe(200)

      // State 4: Login with new password - authenticated again
      loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: newPassword })

      expect(loginRes.status).toBe(200)

      // Verify old password no longer works
      const oldRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: originalPassword })

      expect(oldRes.status).toBe(401)
    })

    it('multiple users maintain separate auth states and sessions', async () => {
      const email1 = uniqueEmail('user1')
      const email2 = uniqueEmail('user2')
      const password1 = 'pass1'
      const password2 = 'pass2'

      // User 1: Signup
      const signup1 = await request(app)
        .post('/api/auth/signup')
        .send({ email: email1, name: 'User 1', password: password1 })

      expect(signup1.status).toBe(201)
      const token1 = signup1.body.token
      const user1Id = signup1.body.user.id

      // User 2: Signup
      const signup2 = await request(app)
        .post('/api/auth/signup')
        .send({ email: email2, name: 'User 2', password: password2 })

      expect(signup2.status).toBe(201)
      const token2 = signup2.body.token
      const user2Id = signup2.body.user.id

      // User 1: Verify session with their token
      const me1 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token1}`)

      expect(me1.status).toBe(200)
      expect(me1.body.id).toBe(user1Id)
      expect(me1.body.email).toBe(email1.toLowerCase())

      // User 2: Verify session with their token
      const me2 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token2}`)

      expect(me2.status).toBe(200)
      expect(me2.body.id).toBe(user2Id)
      expect(me2.body.email).toBe(email2.toLowerCase())

      // Verify tokens are distinct and work independently
      expect(token1).not.toBe(token2)

      // User 1: Logout
      const logout1 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)

      expect(logout1.status).toBe(204)

      // User 1: Cannot use token after logout
      const me1After = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token1}`)

      expect(me1After.status).toBe(401)

      // User 2: Can still use their token
      const me2After = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token2}`)

      expect(me2After.status).toBe(200)
      expect(me2After.body.id).toBe(user2Id)
    })
  })

  // ===================================
  // Flow 7: Data Integrity Across Flows
  // ===================================
  describe('Flow 7: Data Integrity Across Complete Workflows', () => {
    it('user data remains consistent through signup and multiple logins', async () => {
      const email = uniqueEmail('consistency')
      const name = 'Consistency User'
      const password = 'conspass123'

      // Signup
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ email, name, password })

      expect(signupRes.status).toBe(201)
      const signupUserData = signupRes.body.user

      // Multiple logins - verify data consistency
      for (let i = 0; i < 3; i++) {
        const loginRes = await request(app)
          .post('/api/auth/login')
          .send({ email, password })

        expect(loginRes.status).toBe(200)
        expect(loginRes.body.user.id).toBe(signupUserData.id)
        expect(loginRes.body.user.email).toBe(signupUserData.email)
        expect(loginRes.body.user.role).toBe(signupUserData.role)
      }

      // Verify database has consistent data
      const account = await accountRepo.findById(signupUserData.id)
      expect(account?.id).toBe(signupUserData.id)
      expect(account?.email).toBe(email.toLowerCase())
    })

    it('password hash never leaks into API responses', async () => {
      const email = uniqueEmail('no-leak')
      const password = 'securepass456'

      // Create account directly
      const account = await accountRepo.create(email, 'organizer')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Login should not return password hash
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(loginRes.status).toBe(200)
      expect(loginRes.body).not.toHaveProperty('password_hash')
      expect(loginRes.body).not.toHaveProperty('password')

      // /me should not return password hash
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.token}`)

      expect(meRes.status).toBe(200)
      expect(meRes.body).not.toHaveProperty('password_hash')
      expect(meRes.body).not.toHaveProperty('password')
    })

    it('account status remains active through workflows', async () => {
      const email = uniqueEmail('status-active')
      const password = 'statuspass123'

      // Signup
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Status User', password })

      const accountId = signupRes.body.user.id

      // Check account status after signup
      let account = await accountRepo.findById(accountId)
      expect(account?.status).toBe('active')

      // Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(loginRes.status).toBe(200)

      // Check account status after login
      account = await accountRepo.findById(accountId)
      expect(account?.status).toBe('active')

      // Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${loginRes.body.token}`)

      expect(logoutRes.status).toBe(204)

      // Check account status after logout - should still be active
      account = await accountRepo.findById(accountId)
      expect(account?.status).toBe('active')
    })
  })
})
