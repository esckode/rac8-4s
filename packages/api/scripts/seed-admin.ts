import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import { getLogger } from '../src/logger'
import { AccountRepository } from '../src/db'

const log = getLogger('seed-admin')

async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  // Validate environment variables
  if (!email) {
    log.error('ADMIN_EMAIL environment variable not set')
    process.exit(1)
  }
  if (!password) {
    log.error('ADMIN_PASSWORD environment variable not set')
    process.exit(1)
  }

  // Validate DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    log.error('DATABASE_URL environment variable not set')
    process.exit(1)
  }

  // Initialize database
  const pool = new Pool({
    connectionString: databaseUrl,
  })

  try {
    // Check if admin exists
    const accountRepo = new AccountRepository(pool)
    const existing = await accountRepo.findByEmail(email)

    if (existing) {
      log.info('admin.exists', { email })
      return
    }

    // Create admin account
    const account = await accountRepo.create(email, 'admin', 'active')

    // Hash and set password
    const hash = await bcryptjs.hash(password, 10)
    await accountRepo.updatePasswordHash(account.id, hash)

    log.info('admin.seeded', { email, role: 'admin' })
  } catch (err) {
    log.error('seed.failed', { error: err instanceof Error ? err.message : String(err) })
    process.exit(1)
  } finally {
    await pool.end()
  }
}

seedAdmin()
