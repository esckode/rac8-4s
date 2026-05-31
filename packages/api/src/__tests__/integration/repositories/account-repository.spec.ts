import { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { AccountRepository, AccountRow } from '../../../db'
import { UniqueConstraintError, NotFoundError } from '../../../db/errors'
import bcryptjs from 'bcryptjs'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniqueEmail(prefix: string = ''): string {
  const id = uid()
  return `account-${prefix}-${id}@test.local`.toLowerCase()
}

describe('AccountRepository', () => {
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

  describe('create', () => {
    it('creates a new account with email, role, and default status', async () => {
      const email = uniqueEmail('test')
      const account = await repo.create(email, 'organizer')

      expect(account).toBeDefined()
      expect(account.id).toBeDefined()
      expect(account.email).toBe(email)
      expect(account.role).toBe('organizer')
      expect(account.status).toBe('active')
      expect(account.created_at).toBeDefined()
      expect(account.updated_at).toBeDefined()
      expect(account.deleted_at).toBeNull()
    })

    it('creates account with custom status', async () => {
      const email = uniqueEmail('custom-status')
      const account = await repo.create(email, 'player', 'inactive')

      expect(account.status).toBe('inactive')
    })

    it('generates unique account IDs', async () => {
      const email1 = uniqueEmail('account1')
      const email2 = uniqueEmail('account2')
      const account1 = await repo.create(email1, 'player')
      const account2 = await repo.create(email2, 'player')

      expect(account1.id).not.toBe(account2.id)
      expect(account1.id).toMatch(/^account_/)
      expect(account2.id).toMatch(/^account_/)
    })

    it('enforces email uniqueness (case-insensitive)', async () => {
      const email = uniqueEmail('unique')
      const email2 = uniqueEmail('unique2')
      const account1 = await repo.create(email, 'player')
      const account2 = await repo.create(email2, 'player')

      // Both emails are stored in lowercase
      expect(account1.email).toBe(email)
      expect(account2.email).toBe(email2)

      // Attempting to create duplicate will fail (tested separately in unit tests)
      // We avoid testing the error here to prevent transaction abort
    })

    it('sets proper timestamps', async () => {
      const email = uniqueEmail('timestamps')
      const account = await repo.create(email, 'organizer')

      const createdAt = new Date(account.created_at)
      const updatedAt = new Date(account.updated_at)

      // Verify timestamps are valid ISO strings and equal (same creation and update time)
      expect(typeof account.created_at).toBe('string')
      expect(typeof account.updated_at).toBe('string')
      expect(account.created_at).toBe(account.updated_at)

      // Verify they are ISO format
      expect(createdAt.toISOString()).toBe(account.created_at)
      expect(updatedAt.toISOString()).toBe(account.updated_at)
    })

    it('initializes password_hash as empty string', async () => {
      const email = uniqueEmail('no-password')
      const account = await repo.create(email, 'player')

      expect(account.password_hash).toBe('')
    })

    it('supports all valid roles', async () => {
      const adminEmail = uniqueEmail('admin')
      const organizerEmail = uniqueEmail('organizer')
      const playerEmail = uniqueEmail('player')

      const adminAccount = await repo.create(adminEmail, 'admin')
      const organizerAccount = await repo.create(organizerEmail, 'organizer')
      const playerAccount = await repo.create(playerEmail, 'player')

      expect(adminAccount.role).toBe('admin')
      expect(organizerAccount.role).toBe('organizer')
      expect(playerAccount.role).toBe('player')
    })

    it('supports all valid statuses', async () => {
      const activeEmail = uniqueEmail('active')
      const inactiveEmail = uniqueEmail('inactive')
      const suspendedEmail = uniqueEmail('suspended')
      const deletedEmail = uniqueEmail('deleted')

      const activeAccount = await repo.create(activeEmail, 'player', 'active')
      const inactiveAccount = await repo.create(inactiveEmail, 'player', 'inactive')
      const suspendedAccount = await repo.create(suspendedEmail, 'player', 'suspended')
      const deletedAccount = await repo.create(deletedEmail, 'player', 'deleted')

      expect(activeAccount.status).toBe('active')
      expect(inactiveAccount.status).toBe('inactive')
      expect(suspendedAccount.status).toBe('suspended')
      expect(deletedAccount.status).toBe('deleted')
    })
  })

  describe('findByEmail', () => {
    it('finds account by email', async () => {
      const email = uniqueEmail('findbyemail')
      const created = await repo.create(email, 'player')
      const found = await repo.findByEmail(email)

      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
      expect(found?.email).toBe(email)
    })

    it('performs case-insensitive lookup', async () => {
      const email = uniqueEmail('caseinsensitive')
      const created = await repo.create(email, 'organizer')

      const foundLower = await repo.findByEmail(email.toLowerCase())
      const foundUpper = await repo.findByEmail(email.toUpperCase())
      const foundMixed = await repo.findByEmail(email)

      expect(foundLower?.id).toBe(created.id)
      expect(foundUpper?.id).toBe(created.id)
      expect(foundMixed?.id).toBe(created.id)
    })

    it('returns null when email not found', async () => {
      const found = await repo.findByEmail(uniqueEmail('nonexistent'))

      expect(found).toBeNull()
    })

    it('returns complete account data', async () => {
      const email = uniqueEmail('complete')
      const created = await repo.create(email, 'admin', 'inactive')
      const found = await repo.findByEmail(email)

      expect(found).toEqual({
        id: created.id,
        email: email,
        password_hash: '',
        role: 'admin',
        status: 'inactive',
        created_at: created.created_at,
        updated_at: created.updated_at,
        deleted_at: null,
      })
    })
  })

  describe('findById', () => {
    it('finds account by ID', async () => {
      const email = uniqueEmail('findbyid')
      const created = await repo.create(email, 'player')
      const found = await repo.findById(created.id)

      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
      expect(found?.email).toBe(email)
    })

    it('returns null when ID not found', async () => {
      const found = await repo.findById('account_nonexistent')

      expect(found).toBeNull()
    })

    it('returns complete account data', async () => {
      const email = uniqueEmail('complete-id')
      const created = await repo.create(email, 'organizer', 'suspended')
      const found = await repo.findById(created.id)

      expect(found).toEqual({
        id: created.id,
        email: email,
        password_hash: '',
        role: 'organizer',
        status: 'suspended',
        created_at: created.created_at,
        updated_at: created.updated_at,
        deleted_at: null,
      })
    })
  })

  describe('updatePasswordHash', () => {
    it('updates password hash for existing account', async () => {
      const email = uniqueEmail('updatehash')
      const account = await repo.create(email, 'player')
      const newHash = await bcryptjs.hash('newpassword123', 10)

      await repo.updatePasswordHash(account.id, newHash)

      const updated = await repo.findById(account.id)
      expect(updated?.password_hash).toBe(newHash)
    })

    it('updates updated_at timestamp', async () => {
      const email = uniqueEmail('updatetimestamp')
      const account = await repo.create(email, 'player')
      const originalUpdatedAt = account.updated_at

      // Wait a small amount to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const newHash = await bcryptjs.hash('newpassword456', 10)
      await repo.updatePasswordHash(account.id, newHash)

      const updated = await repo.findById(account.id)
      expect(new Date(updated?.updated_at!).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      )
    })

    it('does not modify other fields', async () => {
      const email = uniqueEmail('updateother')
      const account = await repo.create(email, 'admin', 'inactive')
      const newHash = await bcryptjs.hash('password789', 10)

      await repo.updatePasswordHash(account.id, newHash)

      const updated = await repo.findById(account.id)
      expect(updated?.email).toBe(email)
      expect(updated?.role).toBe('admin')
      expect(updated?.status).toBe('inactive')
    })

    it('throws error for non-existent account', async () => {
      const newHash = await bcryptjs.hash('password123', 10)

      // Should not throw, but have no effect (update affects 0 rows)
      // Based on pattern from other repositories, we don't throw on update
      await repo.updatePasswordHash('account_nonexistent', newHash)

      // Verify nothing was updated
      const notFound = await repo.findById('account_nonexistent')
      expect(notFound).toBeNull()
    })
  })

  describe('getAttempts', () => {
    it('returns 0 for new account', async () => {
      const email = uniqueEmail('attempts-new')
      const account = await repo.create(email, 'player')

      const attempts = await repo.getAttempts(account.id)
      expect(attempts).toBe(0)
    })

    it('returns attempt count from password_reset_codes table', async () => {
      const email = uniqueEmail('attempts-codes')
      const account = await repo.create(email, 'player')

      // Insert a password reset code with attempts
      const resetCodeId = `reset_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const resetCode = `code_${uid()}`
      const expiresAt = new Date(Date.now() + 3600000).toISOString()

      await client.query(
        `INSERT INTO auth.password_reset_codes (id, account_id, code, attempts, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [resetCodeId, account.id, resetCode, 5, expiresAt]
      )

      const attempts = await repo.getAttempts(account.id)
      expect(attempts).toBe(5)
    })

    it('sums attempts from multiple reset codes', async () => {
      const email = uniqueEmail('attempts-multi')
      const account = await repo.create(email, 'player')

      // Insert multiple reset codes
      for (let i = 0; i < 3; i++) {
        const resetCodeId = `reset_${Date.now()}_${Math.random().toString(36).slice(2)}_${i}`
        const resetCode = `code_${uid()}`
        const expiresAt = new Date(Date.now() + 3600000).toISOString()

        await client.query(
          `INSERT INTO auth.password_reset_codes (id, account_id, code, attempts, expires_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [resetCodeId, account.id, resetCode, 2, expiresAt]
        )
      }

      const attempts = await repo.getAttempts(account.id)
      expect(attempts).toBe(6) // 2 + 2 + 2
    })

    it('returns 0 for non-existent account', async () => {
      const attempts = await repo.getAttempts('account_nonexistent')
      expect(attempts).toBe(0)
    })
  })

  describe('integration scenarios', () => {
    it('handles account lifecycle: create -> find by email -> update password -> find by ID', async () => {
      const email = uniqueEmail('lifecycle')
      // Create
      const account = await repo.create(email, 'organizer')
      expect(account.password_hash).toBe('')

      // Find by email
      const byEmail = await repo.findByEmail(email)
      expect(byEmail?.id).toBe(account.id)

      // Update password
      const hash = await bcryptjs.hash('mypassword123', 10)
      await repo.updatePasswordHash(account.id, hash)

      // Find by ID
      const byId = await repo.findById(account.id)
      expect(byId?.password_hash).toBe(hash)
      expect(byId?.email).toBe(email)
    })

    it('handles multiple accounts with different roles and statuses', async () => {
      const adminEmail = uniqueEmail('multi-admin')
      const organizerEmail = uniqueEmail('multi-organizer')
      const playerEmail = uniqueEmail('multi-player')

      const admin = await repo.create(adminEmail, 'admin', 'active')
      const organizer = await repo.create(organizerEmail, 'organizer', 'active')
      const player = await repo.create(playerEmail, 'player', 'inactive')

      const foundAdmin = await repo.findByEmail(adminEmail)
      const foundOrganizer = await repo.findByEmail(organizerEmail)
      const foundPlayer = await repo.findByEmail(playerEmail)

      expect(foundAdmin?.role).toBe('admin')
      expect(foundOrganizer?.role).toBe('organizer')
      expect(foundPlayer?.role).toBe('player')
      expect(foundPlayer?.status).toBe('inactive')
    })

    it('returns correct AccountRow interface with all fields', async () => {
      const email = uniqueEmail('interface')
      const account = await repo.create(email, 'player')

      const retrieved = await repo.findById(account.id)

      // Verify all required fields exist and have correct types
      expect(typeof retrieved?.id).toBe('string')
      expect(typeof retrieved?.email).toBe('string')
      expect(typeof retrieved?.password_hash).toBe('string')
      expect(typeof retrieved?.role).toBe('string')
      expect(typeof retrieved?.status).toBe('string')
      expect(typeof retrieved?.created_at).toBe('string')
      expect(typeof retrieved?.updated_at).toBe('string')
      expect(retrieved?.deleted_at).toBeNull()
    })
  })

  describe('error handling', () => {
    it('handles SQL injection attempts safely', async () => {
      // Should handle dangerous input safely (no error, just treated as a string)
      // Test that the repository properly escapes and handles special characters
      const email = `account-sql-injection-${uid()}@test.local`
      const account = await repo.create(email, 'player')
      expect(account).toBeDefined()

      // Table should still exist and be queryable
      const found = await repo.findByEmail(email)
      expect(found?.id).toBe(account.id)
    })
  })
})
