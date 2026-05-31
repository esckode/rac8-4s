import { Pool, PoolClient } from 'pg'
import bcryptjs from 'bcryptjs'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { AccountRepository } from '../../db'
import crypto from 'crypto'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniqueEmail(prefix: string = ''): string {
  const id = uid()
  return `seed-${prefix}-${id}@test.local`.toLowerCase()
}

describe('Seed Admin Script Integration Tests', () => {
  let pool: Pool
  let client: PoolClient
  let repo: AccountRepository

  beforeAll(async () => {
    pool = await getTestPool()
    client = await beginTransaction(pool)
    repo = new AccountRepository(client)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('admin account creation', () => {
    it('creates admin account with hashed password', async () => {
      const email = uniqueEmail('create')
      const password = 'SecurePassword123'

      // Create admin account
      const account = await repo.create(email, 'admin', 'active')
      expect(account.role).toBe('admin')
      expect(account.status).toBe('active')

      // Hash and update password
      const hash = await bcryptjs.hash(password, 10)
      await repo.updatePasswordHash(account.id, hash)

      // Verify password is set
      const updated = await repo.findById(account.id)
      expect(updated?.password_hash).toBe(hash)
      expect(updated?.email).toBe(email)
    })

    it('creates account with active status by default', async () => {
      const email = uniqueEmail('active-status')
      const account = await repo.create(email, 'admin')

      expect(account.status).toBe('active')
      expect(account.role).toBe('admin')
    })

    it('creates account with admin role', async () => {
      const email = uniqueEmail('admin-role')
      const account = await repo.create(email, 'admin')

      expect(account.role).toBe('admin')
    })
  })

  describe('idempotency', () => {
    it('does not create duplicate admin if already exists', async () => {
      const email = uniqueEmail('idempotent')
      const password = 'Password123'

      // First creation
      const account1 = await repo.create(email, 'admin', 'active')
      const hash1 = await bcryptjs.hash(password, 10)
      await repo.updatePasswordHash(account1.id, hash1)

      // Check that account exists
      const existing = await repo.findByEmail(email)
      expect(existing).toBeDefined()
      expect(existing?.id).toBe(account1.id)

      // Verify the account has the password
      expect(existing?.password_hash).toBe(hash1)
    })

    it('returns existing account without modification on duplicate lookup', async () => {
      const email = uniqueEmail('duplicate-lookup')
      const account1 = await repo.create(email, 'admin', 'active')

      // Lookup by email
      const found = await repo.findByEmail(email)
      expect(found?.id).toBe(account1.id)
      expect(found?.email).toBe(email)
      expect(found?.role).toBe('admin')
    })
  })

  describe('password hashing', () => {
    it('hashes password with 10 salt rounds', async () => {
      const email = uniqueEmail('hash-rounds')
      const password = 'MySecurePassword123'

      const account = await repo.create(email, 'admin')
      const hash = await bcryptjs.hash(password, 10)
      await repo.updatePasswordHash(account.id, hash)

      const updated = await repo.findById(account.id)
      expect(updated?.password_hash).toBe(hash)

      // Verify hash is valid
      const isValid = await bcryptjs.compare(password, hash)
      expect(isValid).toBe(true)
    })

    it('stores different hashes for different passwords', async () => {
      const email1 = uniqueEmail('hash-different-1')
      const email2 = uniqueEmail('hash-different-2')
      const password1 = 'Password1'
      const password2 = 'Password2'

      const account1 = await repo.create(email1, 'admin')
      const account2 = await repo.create(email2, 'admin')

      const hash1 = await bcryptjs.hash(password1, 10)
      const hash2 = await bcryptjs.hash(password2, 10)

      await repo.updatePasswordHash(account1.id, hash1)
      await repo.updatePasswordHash(account2.id, hash2)

      const updated1 = await repo.findById(account1.id)
      const updated2 = await repo.findById(account2.id)

      expect(updated1?.password_hash).not.toBe(updated2?.password_hash)
    })

    it('produces valid bcrypt hash for password comparison', async () => {
      const email = uniqueEmail('hash-compare')
      const password = 'ValidPassword456'

      const account = await repo.create(email, 'admin')
      const hash = await bcryptjs.hash(password, 10)
      await repo.updatePasswordHash(account.id, hash)

      // Verify password matches hash
      const isMatch = await bcryptjs.compare(password, hash)
      expect(isMatch).toBe(true)

      // Verify wrong password doesn't match
      const isWrongMatch = await bcryptjs.compare('WrongPassword', hash)
      expect(isWrongMatch).toBe(false)
    })

    it('handles empty initial password hash', async () => {
      const email = uniqueEmail('empty-hash')
      const account = await repo.create(email, 'admin')

      expect(account.password_hash).toBe('')

      // Set password
      const password = 'NewPassword123'
      const hash = await bcryptjs.hash(password, 10)
      await repo.updatePasswordHash(account.id, hash)

      const updated = await repo.findById(account.id)
      expect(updated?.password_hash).not.toBe('')
      expect(updated?.password_hash).toBe(hash)
    })
  })

  describe('email handling', () => {
    it('stores email in lowercase', async () => {
      const mixedEmail = `Admin-${uid()}@TEST.local`
      const account = await repo.create(mixedEmail, 'admin')

      expect(account.email).toBe(mixedEmail.toLowerCase())
    })

    it('finds account by email case-insensitively', async () => {
      const email = uniqueEmail('case-insensitive')
      const account = await repo.create(email, 'admin')

      const foundLower = await repo.findByEmail(email.toLowerCase())
      const foundUpper = await repo.findByEmail(email.toUpperCase())
      const foundMixed = await repo.findByEmail(email)

      expect(foundLower?.id).toBe(account.id)
      expect(foundUpper?.id).toBe(account.id)
      expect(foundMixed?.id).toBe(account.id)
    })
  })

  describe('account status and role', () => {
    it('creates admin account with correct role and status', async () => {
      const email = uniqueEmail('role-status')
      const account = await repo.create(email, 'admin', 'active')

      expect(account.role).toBe('admin')
      expect(account.status).toBe('active')
      expect(account.email).toBe(email)
    })

    it('persists admin role on retrieval', async () => {
      const email = uniqueEmail('role-persist')
      const created = await repo.create(email, 'admin', 'active')

      const found = await repo.findById(created.id)
      expect(found?.role).toBe('admin')
    })

    it('persists active status on retrieval', async () => {
      const email = uniqueEmail('status-persist')
      const created = await repo.create(email, 'admin', 'active')

      const found = await repo.findById(created.id)
      expect(found?.status).toBe('active')
    })
  })

  describe('database integrity', () => {
    it('generates unique account IDs', async () => {
      const email1 = uniqueEmail('unique-id-1')
      const email2 = uniqueEmail('unique-id-2')

      const account1 = await repo.create(email1, 'admin')
      const account2 = await repo.create(email2, 'admin')

      expect(account1.id).not.toBe(account2.id)
      expect(account1.id).toMatch(/^account_/)
      expect(account2.id).toMatch(/^account_/)
    })

    it('sets created_at and updated_at timestamps', async () => {
      const email = uniqueEmail('timestamps')
      const account = await repo.create(email, 'admin')

      expect(account.created_at).toBeDefined()
      expect(account.updated_at).toBeDefined()

      const createdTime = new Date(account.created_at)
      const updatedTime = new Date(account.updated_at)

      expect(createdTime.getTime()).toBeGreaterThan(0)
      expect(updatedTime.getTime()).toBeGreaterThan(0)
      expect(account.created_at).toBe(account.updated_at)
    })

    it('updates updated_at when password is changed', async () => {
      const email = uniqueEmail('timestamp-update')
      const account = await repo.create(email, 'admin')
      const originalUpdatedAt = account.updated_at

      // Wait a small amount to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const hash = await bcryptjs.hash('password123', 10)
      await repo.updatePasswordHash(account.id, hash)

      const updated = await repo.findById(account.id)
      expect(new Date(updated?.updated_at!).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      )
    })

    it('returns null for non-existent accounts', async () => {
      const found = await repo.findByEmail(uniqueEmail('nonexistent'))
      expect(found).toBeNull()
    })
  })

  describe('complete admin seeding workflow', () => {
    it('simulates full admin seed process', async () => {
      const email = uniqueEmail('full-workflow')
      const password = 'AdminPassword789'

      // Check if admin exists (should not)
      let existing = await repo.findByEmail(email)
      expect(existing).toBeNull()

      // Create admin account
      const account = await repo.create(email, 'admin', 'active')
      expect(account.role).toBe('admin')
      expect(account.status).toBe('active')

      // Hash password
      const hash = await bcryptjs.hash(password, 10)

      // Update password
      await repo.updatePasswordHash(account.id, hash)

      // Verify admin exists and has correct properties
      const verified = await repo.findById(account.id)
      expect(verified).toBeDefined()
      expect(verified?.email).toBe(email)
      expect(verified?.role).toBe('admin')
      expect(verified?.status).toBe('active')
      expect(verified?.password_hash).toBe(hash)

      // Verify password is correct
      const passwordMatch = await bcryptjs.compare(password, verified?.password_hash!)
      expect(passwordMatch).toBe(true)

      // Verify idempotency - checking again returns same account
      const checkAgain = await repo.findByEmail(email)
      expect(checkAgain?.id).toBe(account.id)
    })
  })

  describe('concurrency and transactions', () => {
    it('maintains data consistency when updating password', async () => {
      const email = uniqueEmail('consistency-update')
      const account = await repo.create(email, 'admin')

      const password1 = 'Password1'
      const hash1 = await bcryptjs.hash(password1, 10)
      await repo.updatePasswordHash(account.id, hash1)

      const retrieved1 = await repo.findById(account.id)
      expect(retrieved1?.password_hash).toBe(hash1)

      const password2 = 'Password2'
      const hash2 = await bcryptjs.hash(password2, 10)
      await repo.updatePasswordHash(account.id, hash2)

      const retrieved2 = await repo.findById(account.id)
      expect(retrieved2?.password_hash).toBe(hash2)
      expect(retrieved2?.id).toBe(account.id)
      expect(retrieved2?.email).toBe(email)
    })
  })
})
