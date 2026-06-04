import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import { getLogger } from '../src/logger'
import { AccountRepository } from '../src/db'

const log = getLogger('seed-test-accounts')

const TEST_ACCOUNTS = [
  {
    email: 'organizer@test.com',
    password: 'testpass123',
    role: 'organizer' as const,
  },
  {
    email: 'player@test.com',
    password: 'testpass123',
    role: 'player' as const,
  },
]

async function seedTestAccounts(pool: Pool): Promise<void> {
  const accountRepo = new AccountRepository(pool)

  for (const account of TEST_ACCOUNTS) {
    try {
      // Check if account already exists
      const existing = await accountRepo.findByEmail(account.email)

      if (existing) {
        log.debug('account.exists', { email: account.email })
        continue
      }

      // Create account
      const newAccount = await accountRepo.create(account.email, account.role, 'active')

      // Hash and set password
      const hash = await bcryptjs.hash(account.password, 10)
      await accountRepo.updatePasswordHash(newAccount.id, hash)

      log.info('account.created', { email: account.email, role: account.role })
    } catch (err) {
      log.error('account.creation.failed', {
        email: account.email,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export { seedTestAccounts, TEST_ACCOUNTS }
