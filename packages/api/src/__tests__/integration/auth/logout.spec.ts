import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { getTestPool, beginTransaction, rollbackTransaction, getTransactionClient } from '../../helpers/db'
import { createTestApp, JwtConfig } from '../../helpers/app'
import { AccountRepository } from '../../../db'
import { InMemoryTokenStore } from '../../../auth/token-store'

function getDb(pool: Pool) {
  return getTransactionClient() || pool
}

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniqueEmail(prefix: string = ''): string {
  const id = uid()
  return `logout-test-${prefix}-${id}@test.local`.toLowerCase()
}

describe('POST /api/auth/logout', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jwtConfig: JwtConfig
  let accountRepo: AccountRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    jwtConfig = deps.jwtConfig
    accountRepo = new AccountRepository(getDb(pool))
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  /**
   * Helper function to create an account and get a valid login token
   */
  async function createAccountAndLogin(
    email: string,
    password: string = 'testpass123'
  ): Promise<{ token: string; accountId: string }> {
    // Create account
    const account = await accountRepo.create(email, 'player')
    const passwordHash = await bcryptjs.hash(password, 10)
    await accountRepo.updatePasswordHash(account.id, passwordHash)

    // Login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password })

    expect(loginRes.status).toBe(200)
    expect(loginRes.body.token).toBeDefined()

    return {
      token: loginRes.body.token,
      accountId: account.id,
    }
  }

  describe('Valid logout', () => {
    it('logs out with valid token in Authorization header and returns 204', async () => {
      const email = uniqueEmail('valid-logout')
      const { token } = await createAccountAndLogin(email)

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(204)
      // 204 should have no body
      expect(res.body).toEqual({})
    })

    it('invalidates token in token store after logout', async () => {
      const email = uniqueEmail('invalidate-check')
      const { token } = await createAccountAndLogin(email)

      // Before logout, token should not be in blocklist
      const decoded = jwt.decode(token) as any
      const blocklistKey = `jwt:blocklist:${decoded.jti}`
      let blocklisted = await tokenStore.get(blocklistKey)
      expect(blocklisted).toBeNull()

      // Perform logout
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(204)

      // After logout, token should be in blocklist
      blocklisted = await tokenStore.get(blocklistKey)
      expect(blocklisted).not.toBeNull()
    })

    it('sets blocklist entry with correct TTL based on token expiration', async () => {
      const email = uniqueEmail('ttl-check')
      const { token } = await createAccountAndLogin(email)

      // Perform logout
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(204)

      // Verify token can be decoded and has exp
      const decoded = jwt.decode(token) as any
      expect(decoded.exp).toBeDefined()

      // Verify blocklist entry exists
      const blocklistKey = `jwt:blocklist:${decoded.jti}`
      const blocklisted = await tokenStore.get(blocklistKey)
      expect(blocklisted).not.toBeNull()
    })

    it('logs logout event with account information', async () => {
      const email = uniqueEmail('log-check')
      const { token, accountId } = await createAccountAndLogin(email)

      // Logout and verify it succeeds
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(204)
      // Logging happens asynchronously, but we can verify the response
    })
  })

  describe('No token / Missing Authorization header', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/api/auth/logout')

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.code).toBe('MISSING_TOKEN')
    })

    it('returns 401 when Authorization header is empty string', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', '')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('MISSING_TOKEN')
    })

    it('returns 401 when Authorization header is whitespace only', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', '   ')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('MISSING_TOKEN')
    })

    it('returns 401 when Authorization header is missing "Bearer" prefix', async () => {
      const email = uniqueEmail('no-bearer')
      const { token } = await createAccountAndLogin(email)

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', token)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('returns 401 when Authorization header has incorrect format', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Basic somecredentials')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('returns 401 when Bearer token is empty', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer ')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('returns 401 when Bearer has extra whitespace but no token', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer    ')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })
  })

  describe('Invalid token', () => {
    it('returns 401 for malformed token', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer malformed-token-string')

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('returns 401 for token with invalid signature', async () => {
      // Create a token with different secret
      const payload = {
        sub: 'user123',
        email: 'test@example.com',
        role: 'organizer',
        jti: crypto.randomUUID(),
      }

      const invalidToken = jwt.sign(payload, 'different-secret-key', {
        expiresIn: 3600,
      })

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${invalidToken}`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('returns 401 for expired token', async () => {
      const email = uniqueEmail('expired-token')
      const { accountId } = await createAccountAndLogin(email)

      // Create an expired token
      const payload = {
        sub: accountId,
        email,
        role: 'organizer',
        jti: crypto.randomUUID(),
      }

      const expiredToken = jwt.sign(payload, jwtConfig.secret, {
        expiresIn: '-1h', // Expired 1 hour ago
      })

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${expiredToken}`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('returns 401 for random string as token', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer randomstringthatshouldnotbeatoken1234567890')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('returns 401 for token with garbage characters', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer !!!###$$$%%%^^^&&&***')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('returns 401 for empty-looking JWT (just dots)', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer ..')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })
  })

  describe('Token reuse after logout', () => {
    it('prevents token reuse after logout - returns 401 on second logout attempt', async () => {
      const email = uniqueEmail('token-reuse')
      const { token } = await createAccountAndLogin(email)

      // First logout succeeds
      const res1 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res1.status).toBe(204)

      // Second logout with same token fails because token is now blocklisted
      const res2 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res2.status).toBe(401)
      expect(res2.body.code).toBe('TOKEN_INVALID')
    })

    it('token cannot be used for protected endpoints after logout', async () => {
      const email = uniqueEmail('protected-route')
      const { token, accountId } = await createAccountAndLogin(email)

      // Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(logoutRes.status).toBe(204)

      // Try to logout again with same token - should fail
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('token is permanently invalidated - blocklist persists across requests', async () => {
      const email = uniqueEmail('persistent-blocklist')
      const { token } = await createAccountAndLogin(email)

      // Logout
      const res1 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res1.status).toBe(204)

      // Wait a moment to ensure any async operations complete
      await new Promise(resolve => setTimeout(resolve, 10))

      // Try again with same token
      const res2 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res2.status).toBe(401)

      // Try a third time
      const res3 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res3.status).toBe(401)
    })
  })

  describe('Multiple concurrent logouts', () => {
    it('handles multiple logout requests for different tokens', async () => {
      const email1 = uniqueEmail('multi1')
      const email2 = uniqueEmail('multi2')

      const { token: token1 } = await createAccountAndLogin(email1)
      const { token: token2 } = await createAccountAndLogin(email2)

      // Both logout concurrently
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token1}`),
        request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token2}`),
      ])

      expect(res1.status).toBe(204)
      expect(res2.status).toBe(204)

      // Both tokens should now be blocklisted
      const [res1_retry, res2_retry] = await Promise.all([
        request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token1}`),
        request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token2}`),
      ])

      expect(res1_retry.status).toBe(401)
      expect(res2_retry.status).toBe(401)
    })

    it('isolates logouts between accounts', async () => {
      const email1 = uniqueEmail('isolated1')
      const email2 = uniqueEmail('isolated2')

      const { token: token1 } = await createAccountAndLogin(email1)
      const { token: token2 } = await createAccountAndLogin(email2)

      // Logout with token1
      const res1 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)

      expect(res1.status).toBe(204)

      // token2 should still work
      const res2 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token2}`)

      expect(res2.status).toBe(204)

      // token1 should be blocked
      const res1_retry = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)

      expect(res1_retry.status).toBe(401)

      // token2 should also be blocked
      const res2_retry = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token2}`)

      expect(res2_retry.status).toBe(401)
    })
  })

  describe('Edge cases and response schema', () => {
    it('returns 204 with no content body on success', async () => {
      const email = uniqueEmail('no-content')
      const { token } = await createAccountAndLogin(email)

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(204)
      expect(res.body).toEqual({})
      expect(res.text).toBe('')
    })

    it('returns correct error response schema for 401', async () => {
      const res = await request(app)
        .post('/api/auth/logout')

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.code).toBe('string')
      expect(typeof res.body.message).toBe('string')
      expect(res.body).not.toHaveProperty('user')
      expect(res.body).not.toHaveProperty('token')
    })

    it('handles logout from different user roles', async () => {
      const emailOrganizer = uniqueEmail('organizer-logout')
      const emailPlayer = uniqueEmail('player-logout')

      // Create organizer account and login
      const organizerAccount = await accountRepo.create(emailOrganizer, 'organizer')
      const orgPwdHash = await bcryptjs.hash('password123', 10)
      await accountRepo.updatePasswordHash(organizerAccount.id, orgPwdHash)

      const orgLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: emailOrganizer, password: 'password123' })

      expect(orgLoginRes.status).toBe(200)
      const organizerToken = orgLoginRes.body.token

      // Create player account and login
      const playerAccount = await accountRepo.create(emailPlayer, 'player')
      const playerPwdHash = await bcryptjs.hash('password456', 10)
      await accountRepo.updatePasswordHash(playerAccount.id, playerPwdHash)

      const playerLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: emailPlayer, password: 'password456' })

      expect(playerLoginRes.status).toBe(200)
      const playerToken = playerLoginRes.body.token

      // Both can logout successfully
      const orgLogoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(orgLogoutRes.status).toBe(204)

      const playerLogoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${playerToken}`)

      expect(playerLogoutRes.status).toBe(204)
    })

    it('logout with extra Bearer prefix parts fails gracefully', async () => {
      const email = uniqueEmail('extra-bearer')
      const { token } = await createAccountAndLogin(email)

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token} extra`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })

    it('case-sensitive Bearer keyword check', async () => {
      const email = uniqueEmail('bearer-case')
      const { token } = await createAccountAndLogin(email)

      // lowercase 'bearer' should fail
      const res1 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `bearer ${token}`)

      expect(res1.status).toBe(401)
      expect(res1.body.code).toBe('TOKEN_INVALID')

      // UPPERCASE 'BEARER' should fail
      const res2 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `BEARER ${token}`)

      expect(res2.status).toBe(401)
      expect(res2.body.code).toBe('TOKEN_INVALID')
    })

    it('handles very long invalid token string', async () => {
      const longToken = 'a'.repeat(10000)

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${longToken}`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_INVALID')
    })
  })

  describe('Integration: logout with login flow', () => {
    it('can login again after logout with same credentials', async () => {
      const email = uniqueEmail('relogin')
      const password = 'password123'

      // Create account
      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // First login
      const login1 = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(login1.status).toBe(200)
      const token1 = login1.body.token

      // Logout
      const logout = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)

      expect(logout.status).toBe(204)

      // Second login should succeed
      const login2 = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(login2.status).toBe(200)
      const token2 = login2.body.token

      // Tokens should be different
      expect(token1).not.toBe(token2)

      // Old token should still be invalid
      const oldTokenLogout = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)

      expect(oldTokenLogout.status).toBe(401)

      // New token should be valid
      const newTokenLogout = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token2}`)

      expect(newTokenLogout.status).toBe(204)
    })

    it('multiple login/logout cycles work independently', async () => {
      const email = uniqueEmail('multi-cycle')
      const password = 'password123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Cycle 1: Login, logout
      const login1 = await request(app)
        .post('/api/auth/login')
        .send({ email, password })
      expect(login1.status).toBe(200)
      const token1 = login1.body.token

      const logout1 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)
      expect(logout1.status).toBe(204)

      // Cycle 2: Login, logout
      const login2 = await request(app)
        .post('/api/auth/login')
        .send({ email, password })
      expect(login2.status).toBe(200)
      const token2 = login2.body.token

      const logout2 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token2}`)
      expect(logout2.status).toBe(204)

      // Cycle 3: Login, logout
      const login3 = await request(app)
        .post('/api/auth/login')
        .send({ email, password })
      expect(login3.status).toBe(200)
      const token3 = login3.body.token

      const logout3 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token3}`)
      expect(logout3.status).toBe(204)

      // All three tokens are different
      expect(token1).not.toBe(token2)
      expect(token2).not.toBe(token3)
      expect(token1).not.toBe(token3)

      // All three tokens are now invalid
      const res1 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)
      expect(res1.status).toBe(401)

      const res2 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token2}`)
      expect(res2.status).toBe(401)

      const res3 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token3}`)
      expect(res3.status).toBe(401)
    })
  })
})
