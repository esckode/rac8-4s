import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import bcryptjs from 'bcryptjs'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { createTestApp, JwtConfig } from '../../helpers/app'
import { AccountRepository, PlayerRepository } from '../../../db'
import { InMemoryTokenStore } from '../../../auth/token-store'
import { generateMagicLinkToken, validateMagicLinkToken } from '../../../auth/magic-link'
import jwt from 'jsonwebtoken'
import { defaultAdultAttestation } from '../../factories/player.factory'

/** Default adult attestation used by tests that just need a valid signup. */
const ADULT_ATTESTATION = defaultAdultAttestation()

function uniqueEmail(prefix: string = ''): string {
  const id = crypto.randomUUID().slice(0, 8)
  return `signup-${prefix}-${id}@test.local`.toLowerCase()
}

describe('POST /api/auth/signup', () => {
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
    accountRepo = new AccountRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('Valid standalone signup', () => {
    it('creates an account with email, name, and password', async () => {
      const email = uniqueEmail('valid')
      const name = 'Test User'
      const password = 'password123'

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name, password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('user')
      expect(res.body).toHaveProperty('token')

      // Verify user object structure
      expect(res.body.user).toHaveProperty('id')
      expect(res.body.user.email).toBe(email.toLowerCase())
      expect(res.body.user.name).toBe(name)
      expect(res.body.user.role).toBe('player')

      // Verify token is a valid JWT
      const decoded = jwt.verify(res.body.token, jwtConfig.secret) as any
      expect(decoded.sub).toBe(res.body.user.id)
      expect(decoded.email).toBe(email.toLowerCase())
    })

    it('persists account to database with hashed password', async () => {
      const email = uniqueEmail('persist')
      const name = 'Persist Test'
      const password = 'securepass456'

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name, password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      const accountId = res.body.user.id

      // Verify account exists in database
      const account = await accountRepo.findById(accountId)
      expect(account).toBeDefined()
      expect(account?.email).toBe(email.toLowerCase())
      expect(account?.password_hash).toBeDefined()
      expect(account?.password_hash).not.toBe('')

      // Verify password is hashed (not plaintext)
      expect(account?.password_hash).not.toBe(password)

      // Verify password can be verified with bcryptjs
      const passwordMatches = await bcryptjs.compare(password, account?.password_hash || '')
      expect(passwordMatches).toBe(true)
    })

    it('issues a JWT token with correct claims', async () => {
      const email = uniqueEmail('token')
      const name = 'Token Test'
      const password = 'tokenpass789'

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name, password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      expect(res.body.token).toBeDefined()

      const decoded = jwt.verify(res.body.token, jwtConfig.secret) as any
      expect(decoded.sub).toBeDefined()
      expect(decoded.email).toBe(email.toLowerCase())
      expect(decoded.role).toBe('player')
      expect(decoded.exp).toBeDefined()
      expect(decoded.iat).toBeDefined()
    })

    it('normalizes email to lowercase', async () => {
      const email = uniqueEmail('upper').toUpperCase()
      const name = 'Case Test'
      const password = 'casepass123'

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name, password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      expect(res.body.user.email).toBe(email.toLowerCase())

      // Verify database also has lowercase
      const account = await accountRepo.findById(res.body.user.id)
      expect(account?.email).toBe(email.toLowerCase())
    })
  })

  describe('Duplicate email error', () => {
    it('returns 409 when email already exists (case-insensitive)', async () => {
      const email = uniqueEmail('duplicate')
      const name1 = 'First User'
      const password1 = 'firstpass123'

      // Create first account
      const res1 = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: name1, password: password1, dob_attestation: ADULT_ATTESTATION })
      expect(res1.status).toBe(201)

      // Try to create with same email
      const res2 = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Second User', password: 'secondpass456', dob_attestation: ADULT_ATTESTATION })

      expect(res2.status).toBe(409)
      expect(res2.body).toHaveProperty('code')
      expect(res2.body).toHaveProperty('message')
      expect(res2.body.message).toMatch(/already.*use|duplicate/i)
    })

    it('returns 409 when email exists with different case', async () => {
      const emailBase = uniqueEmail('casedup')
      const emailLower = emailBase.toLowerCase()
      const emailUpper = emailBase.toUpperCase()

      // Create with lowercase
      const res1 = await request(app)
        .post('/api/auth/signup')
        .send({ email: emailLower, name: 'User 1', password: 'pass123', dob_attestation: ADULT_ATTESTATION })
      expect(res1.status).toBe(201)

      // Try with uppercase
      const res2 = await request(app)
        .post('/api/auth/signup')
        .send({ email: emailUpper, name: 'User 2', password: 'pass456', dob_attestation: ADULT_ATTESTATION })

      expect(res2.status).toBe(409)
      expect(res2.body.code).toBeDefined()
    })
  })

  describe('Invalid email format error', () => {
    it('returns 400 for email without @', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'invalidemail.local', name: 'Test', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message.toLowerCase()).toMatch(/valid.*email|email.*format|invalid/)
    })

    it('returns 400 for email without domain', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'user@', name: 'Test', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
    })

    it('returns 400 for email with invalid format', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'user @example.com', name: 'Test', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
    })

    it('returns 400 for empty email', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: '', name: 'Test', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
    })
  })

  describe('Password validation errors', () => {
    it('returns 400 when password is too short (less than 6 characters)', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: uniqueEmail('short-pwd'),
          name: 'Test',
          password: 'short',
        })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message.toLowerCase()).toMatch(/password.*6|6.*character|short/)
    })

    it('returns 400 when password is empty', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: uniqueEmail('empty-pwd'),
          name: 'Test',
          password: '',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
    })

    it('accepts password with exactly 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: uniqueEmail('exact6'),
          name: 'Test',
          password: '123456',
          dob_attestation: ADULT_ATTESTATION,
        })

      expect(res.status).toBe(201)
    })

    it('accepts password longer than 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: uniqueEmail('long-pwd'),
          name: 'Test',
          password: 'verylongpasswordhere',
          dob_attestation: ADULT_ATTESTATION,
        })

      expect(res.status).toBe(201)
    })
  })

  describe('Name validation errors', () => {
    it('returns 400 when name is too short (less than 2 characters)', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: uniqueEmail('short-name'),
          name: 'A',
          password: 'password123',
        })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message.toLowerCase()).toMatch(/name.*2|2.*character|short/)
    })

    it('returns 400 when name is empty', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: uniqueEmail('empty-name'),
          name: '',
          password: 'password123',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
    })

    it('accepts name with exactly 2 characters', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: uniqueEmail('name2'),
          name: 'AB',
          password: 'password123',
          dob_attestation: ADULT_ATTESTATION,
        })

      expect(res.status).toBe(201)
    })

    it('accepts longer names', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: uniqueEmail('long-name'),
          name: 'Very Long User Name Here',
          password: 'password123',
          dob_attestation: ADULT_ATTESTATION,
        })

      expect(res.status).toBe(201)
    })
  })

  describe('Missing required fields', () => {
    it('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Test', password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
    })

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: uniqueEmail('no-name'), password: 'password123' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
    })

    it('returns 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: uniqueEmail('no-pwd'), name: 'Test' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
    })

    it('returns 400 when all fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBeDefined()
    })
  })

  describe('Magic link signup with valid token', () => {
    it('creates account with email from magic link token', async () => {
      const email = uniqueEmail('magic-valid')
      const name = 'Magic User'
      const password = 'magicpass123'

      // Generate a magic link token for signup
      const magicPayload = {
        playerId: 'player_temp',
        tournamentId: 'tournament_test',
        email,
        createdAt: Date.now(),
      }

      const magicLink = await generateMagicLinkToken(magicPayload, 3600, tokenStore)

      // Signup with magic link token
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ token: magicLink.token, name, password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      expect(res.body.user.email).toBe(email.toLowerCase())
      expect(res.body).toHaveProperty('token')
    })

    it('persists account created via magic link to database', async () => {
      const email = uniqueEmail('magic-persist')
      const name = 'Magic Persist'
      const password = 'magicpersist123'

      const magicPayload = {
        playerId: 'player_temp',
        tournamentId: 'tournament_test',
        email,
        createdAt: Date.now(),
      }

      const magicLink = await generateMagicLinkToken(magicPayload, 3600, tokenStore)

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ token: magicLink.token, name, password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      const accountId = res.body.user.id

      // Verify in database
      const account = await accountRepo.findById(accountId)
      expect(account).toBeDefined()
      expect(account?.email).toBe(email.toLowerCase())
    })
  })

  describe('Magic link with expired token', () => {
    it('returns 401 when magic link token has expired', async () => {
      const email = uniqueEmail('magic-expired')
      const magicPayload = {
        playerId: 'player_temp',
        tournamentId: 'tournament_test',
        email,
        createdAt: Date.now(),
      }

      // Create token with very short TTL
      const magicLink = await generateMagicLinkToken(magicPayload, 1, tokenStore)

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ token: magicLink.token, name: 'Test', password: 'password123' })

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(res.body.message.toLowerCase()).toMatch(/expire|invalid|link/)
    })

    it('returns 401 for invalid/malformed token', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ token: 'invalid-token-string', name: 'Test', password: 'password123' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBeDefined()
    })

    it('returns 401 for empty token', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ token: '', name: 'Test', password: 'password123' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBeDefined()
    })
  })

  describe('Magic link email override', () => {
    it('allows user to override email from magic link token', async () => {
      const tokenEmail = uniqueEmail('magic-token')
      const userEmail = uniqueEmail('magic-override')
      const name = 'Override User'
      const password = 'overridepass123'

      const magicPayload = {
        playerId: 'player_temp',
        tournamentId: 'tournament_test',
        email: tokenEmail,
        createdAt: Date.now(),
      }

      const magicLink = await generateMagicLinkToken(magicPayload, 3600, tokenStore)

      // Signup with different email than token
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ token: magicLink.token, email: userEmail, name, password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      // Should use the user-provided email, not the token email
      expect(res.body.user.email).toBe(userEmail.toLowerCase())
    })

    it('persists overridden email to database', async () => {
      const tokenEmail = uniqueEmail('token-email')
      const userEmail = uniqueEmail('user-email')
      const name = 'Override Persist'
      const password = 'overridepersist123'

      const magicPayload = {
        playerId: 'player_temp',
        tournamentId: 'tournament_test',
        email: tokenEmail,
        createdAt: Date.now(),
      }

      const magicLink = await generateMagicLinkToken(magicPayload, 3600, tokenStore)

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ token: magicLink.token, email: userEmail, name, password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      const accountId = res.body.user.id

      const account = await accountRepo.findById(accountId)
      expect(account?.email).toBe(userEmail.toLowerCase())
    })
  })

  describe('Password hashing verification', () => {
    it('stores password as bcrypt hash, not plaintext', async () => {
      const email = uniqueEmail('hash-check')
      const password = 'thisisapassword'

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Hash Test', password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      const accountId = res.body.user.id

      const account = await accountRepo.findById(accountId)
      expect(account?.password_hash).toBeDefined()

      // Verify it's not plaintext
      expect(account?.password_hash).not.toBe(password)

      // Verify it's a bcryptjs hash (starts with $2a$, $2b$, or $2y$)
      expect(account?.password_hash).toMatch(/^\$2[aby]\$/i)
    })

    it('password can be verified with bcryptjs after signup', async () => {
      const email = uniqueEmail('verify-hash')
      const password = 'verifiablepassword'

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Verify Test', password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      const accountId = res.body.user.id

      const account = await accountRepo.findById(accountId)
      const isValid = await bcryptjs.compare(password, account?.password_hash || '')
      expect(isValid).toBe(true)
    })

    it('different password does not verify with stored hash', async () => {
      const email = uniqueEmail('wrong-pwd')
      const password = 'correctpassword'
      const wrongPassword = 'wrongpassword'

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Wrong Pwd Test', password, dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      const accountId = res.body.user.id

      const account = await accountRepo.findById(accountId)
      const isValid = await bcryptjs.compare(wrongPassword, account?.password_hash || '')
      expect(isValid).toBe(false)
    })
  })

  describe('Response schema compliance', () => {
    it('returns correct schema for 201 success response', async () => {
      const email = uniqueEmail('schema-201')
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Schema Test', password: 'schemapass123', dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)
      expect(res.body).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({
            id: expect.any(String),
            email: expect.any(String),
            name: expect.any(String),
            role: expect.any(String),
          }),
          token: expect.any(String),
        })
      )
    })

    it('returns correct schema for 400 validation error', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'notanemail', name: 'Test', password: 'pass123' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        })
      )
    })

    it('returns correct schema for 409 conflict error', async () => {
      const email = uniqueEmail('schema-409')

      // Create first
      await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'First', password: 'password123', dob_attestation: ADULT_ATTESTATION })

      // Try duplicate
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Second', password: 'password456' })

      expect(res.status).toBe(409)
      expect(res.body).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        })
      )
    })

    it('returns correct schema for 401 auth error', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ token: 'badtoken', name: 'Test', password: 'password123' })

      expect(res.status).toBe(401)
      expect(res.body).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        })
      )
    })
  })

  describe('Edge cases and isolation', () => {
    it('creates multiple accounts without interference', async () => {
      const email1 = uniqueEmail('multi1')
      const email2 = uniqueEmail('multi2')

      const res1 = await request(app)
        .post('/api/auth/signup')
        .send({ email: email1, name: 'User 1', password: 'pass123456', dob_attestation: ADULT_ATTESTATION })

      const res2 = await request(app)
        .post('/api/auth/signup')
        .send({ email: email2, name: 'User 2', password: 'pass789012', dob_attestation: ADULT_ATTESTATION })

      expect(res1.status).toBe(201)
      expect(res2.status).toBe(201)
      expect(res1.body.user.id).not.toBe(res2.body.user.id)
      expect(res1.body.user.email).toBe(email1.toLowerCase())
      expect(res2.body.user.email).toBe(email2.toLowerCase())
    })

    it('account created via magic link prevents duplicate with same email', async () => {
      const email = uniqueEmail('magic-dup')

      const magicPayload = {
        playerId: 'player_temp',
        tournamentId: 'tournament_test',
        email,
        createdAt: Date.now(),
      }

      const magicLink = await generateMagicLinkToken(magicPayload, 3600, tokenStore)

      // Create with magic link
      const res1 = await request(app)
        .post('/api/auth/signup')
        .send({ token: magicLink.token, name: 'Magic User', password: 'pass123456', dob_attestation: ADULT_ATTESTATION })

      expect(res1.status).toBe(201)

      // Try to create again with same email (standalone)
      const res2 = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Another User', password: 'pass789012', dob_attestation: ADULT_ATTESTATION })

      expect(res2.status).toBe(409)
    })

    it('whitespace in email is handled correctly', async () => {
      const emailWithSpace = ' ' + uniqueEmail('space') + ' '

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: emailWithSpace, name: 'Space Test', password: 'pass123456', dob_attestation: ADULT_ATTESTATION })

      // Should either trim or reject - most systems trim
      // Adjust expectation based on implementation
      if (res.status === 201) {
        expect(res.body.user.email).toBe(emailWithSpace.trim().toLowerCase())
      } else {
        expect(res.status).toBe(400)
      }
    })
  })

  describe('Account ↔ player linkage (P1)', () => {
    it('claims an existing guest player by email and links it to the account, carrying playerId in the JWT', async () => {
      const playerRepo = new PlayerRepository(pool)
      const email = uniqueEmail('claim')

      // An existing guest player (e.g. previously registered for a tournament)
      const guest = await playerRepo.findOrCreatePlayerByEmail(email, 'Guest Name', undefined, undefined, ADULT_ATTESTATION)

      // Signing up with the same email (different casing) must claim that player
      // No attestation needed: guest already exists, so find path runs (ungated)
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: email.toUpperCase(), name: 'Account Name', password: 'password123' })

      expect(res.status).toBe(201)

      const account = await accountRepo.findByEmail(email)
      expect((account as any)?.player_id).toBe(guest.id)

      const decoded = jwt.verify(res.body.token, jwtConfig.secret) as any
      expect(decoded.playerId).toBe(guest.id)
    })

    it('creates and links a new player when none exists yet', async () => {
      const playerRepo = new PlayerRepository(pool)
      const email = uniqueEmail('newlink')

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email, name: 'Fresh User', password: 'password123', dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(201)

      const account = await accountRepo.findByEmail(email)
      const player = await playerRepo.findByEmail(email)
      expect(player).toBeDefined()
      expect((account as any)?.player_id).toBe(player?.id)
    })
  })
})
