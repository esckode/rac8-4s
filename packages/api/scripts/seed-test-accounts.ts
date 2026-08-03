// Must stay the FIRST import — this file is also an entrypoint (`npm run
// seed:accounts`), and without it DATABASE_URL is unset, so the standalone run
// silently seeds nothing. See src/load-env.ts for why a same-file dotenv call
// would be too late.
import '../src/load-env'

import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import { getLogger } from '../src/logger'
import { AccountRepository, PlayerRepository } from '../src/db'

const log = getLogger('seed-test-accounts')

const TEST_ACCOUNTS = [
  {
    email: 'organizer@test.com',
    name: 'Test Organizer',
    password: 'testpass123',
    role: 'organizer' as const,
  },
  {
    email: 'player@test.com',
    name: 'Test Player',
    password: 'testpass123',
    role: 'player' as const,
  },
  // A named cohort, so group/tournament flows can be walked with more than two
  // identities that survive a DB reset. Created 2026-08-03 via real signup during
  // the ISSUE-44d walkthrough; added here so `npm run seed:accounts` restores them.
  { email: 'sunil@test.com', name: 'Sunil', password: 'testpass123', role: 'player' as const },
  { email: 'vimal@test.com', name: 'Vimal', password: 'testpass123', role: 'player' as const },
  { email: 'anil@test.com', name: 'Anil', password: 'testpass123', role: 'player' as const },
  { email: 'raj@test.com', name: 'Raj', password: 'testpass123', role: 'player' as const },
  { email: 'sudhakar@test.com', name: 'Sudhakar', password: 'testpass123', role: 'player' as const },
  { email: 'sasi@test.com', name: 'Sasi', password: 'testpass123', role: 'player' as const },
]

interface SeedFailure {
  email: string
  error: string
}

interface SeedResult {
  failures: SeedFailure[]
}

async function seedTestAccounts(pool: Pool): Promise<SeedResult> {
  const accountRepo = new AccountRepository(pool)
  const playerRepo = new PlayerRepository(pool)
  const failures: SeedFailure[] = []

  for (const account of TEST_ACCOUNTS) {
    try {
      // Check if account already exists
      const existing = await accountRepo.findByEmail(account.email)

      if (existing) {
        // Repair path (ISSUE-25): the seeder is idempotent-by-skip, so a
        // developer's existing DB (seeded before this fix) would otherwise
        // keep its unlinked account forever — the fix would appear to do
        // nothing on the exact machine that reported the bug.
        if (!existing.player_id) {
          const player = await playerRepo.findOrCreatePlayerByEmail(
            account.email,
            account.name,
            undefined,
            undefined,
            { dateOfBirth: '2000-01-01', policyVersion: 'v1' }
          )
          await accountRepo.linkPlayer(existing.id, player.id)
          log.info('account.repaired', { email: account.email, playerId: player.id })
        } else {
          log.debug('account.exists', { email: account.email })
        }
        continue
      }

      // Mirror real signup (auth.ts): claim/create the durable player identity
      // BEFORE the account, then link them (ISSUE-25). Real signup always
      // does both, so a seeded account with no linked player is a shape
      // signup can never produce — and it hits ISSUE-24's TOKEN_INVALID loop
      // on every player-scoped page (/standings, /matches, /groups, /notifications).
      const player = await playerRepo.findOrCreatePlayerByEmail(
        account.email,
        account.name,
        undefined,
        undefined,
        { dateOfBirth: '2000-01-01', policyVersion: 'v1' }
      )

      // Create account
      const newAccount = await accountRepo.create(account.email, account.role, 'active')

      // Hash and set password
      const hash = await bcryptjs.hash(account.password, 10)
      await accountRepo.updatePasswordHash(newAccount.id, hash)

      // Link the account to the player claimed/created above.
      await accountRepo.linkPlayer(newAccount.id, player.id)

      log.info('account.created', { email: account.email, role: account.role, playerId: player.id })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      log.error('account.creation.failed', { email: account.email, error })
      failures.push({ email: account.email, error })
    }
  }

  return { failures }
}

export { seedTestAccounts, TEST_ACCOUNTS }

// Run directly if called as main module
if (require.main === module) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/tournament_app',
  })

  // Written with console, not the logger, on purpose: the logger registers no
  // transport at all when LOG_LEVEL is unset (logger.ts), which is the default
  // for `npm run seed:accounts`. A CLI must report its own outcome regardless.
  seedTestAccounts(pool)
    .then(({ failures }) => {
      if (failures.length > 0) {
        console.error(`seed:accounts FAILED for ${failures.length} of ${TEST_ACCOUNTS.length} accounts:`)
        for (const f of failures) {
          console.error(`  ${f.email}: ${f.error}`)
        }
        process.exit(1)
      }
      log.info('seed.complete')
      console.log(`seed:accounts ok — ${TEST_ACCOUNTS.length} accounts present`)
      process.exit(0)
    })
    .catch((err) => {
      const error = err instanceof Error ? err.message : String(err)
      log.error('seed.error', { error })
      console.error(`seed:accounts FAILED: ${error}`)
      process.exit(1)
    })
    .finally(() => {
      pool.end()
    })
}
