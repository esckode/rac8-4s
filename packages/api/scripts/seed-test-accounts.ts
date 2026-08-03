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

async function seedTestAccounts(pool: Pool): Promise<void> {
  const accountRepo = new AccountRepository(pool)
  const playerRepo = new PlayerRepository(pool)

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
      log.error('account.creation.failed', {
        email: account.email,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export { seedTestAccounts, TEST_ACCOUNTS }

// Run directly if called as main module
if (require.main === module) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/tournament_app',
  })

  seedTestAccounts(pool)
    .then(() => {
      log.info('seed.complete')
      process.exit(0)
    })
    .catch((err) => {
      log.error('seed.error', { error: err instanceof Error ? err.message : String(err) })
      process.exit(1)
    })
    .finally(() => {
      pool.end()
    })
}
