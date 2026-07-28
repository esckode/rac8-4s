/**
 * ISSUE-25 — seed-test-accounts.ts creates accounts with no linked player.
 *
 * Real signup always links a durable player before creating the account
 * (auth.ts). The seeder used to skip that step, producing an account shape
 * signup can never produce — which then hits ISSUE-24's TOKEN_INVALID loop
 * on every player-scoped page. Verifies: fresh seeding links a player,
 * re-running is idempotent, and an already-existing-but-unlinked account
 * (the exact shape a pre-fix dev DB has) gets repaired rather than skipped.
 */

import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { AccountRepository, PlayerRepository } from '../../db'
import { seedTestAccounts, TEST_ACCOUNTS } from '../../../scripts/seed-test-accounts'

const SEED_EMAILS = TEST_ACCOUNTS.map(a => a.email)

describe('seedTestAccounts (ISSUE-25)', () => {
  let pool: Pool
  let accountRepo: AccountRepository
  let playerRepo: PlayerRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    accountRepo = new AccountRepository(pool)
    playerRepo = new PlayerRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // Start every test from a clean slate for the fixed seed emails, regardless
  // of whatever the shared dev DB already has for them (it may already carry
  // the pre-fix broken shape this issue exists to repair).
  beforeEach(async () => {
    await pool.query(`DELETE FROM auth.accounts WHERE email = ANY($1::text[])`, [SEED_EMAILS])
    await pool.query(`DELETE FROM public.players WHERE email = ANY($1::text[])`, [SEED_EMAILS])
  })

  it('creates both accounts with a linked player, mirroring real signup', async () => {
    await seedTestAccounts(pool)

    for (const email of SEED_EMAILS) {
      const account = await accountRepo.findByEmail(email)
      expect(account).not.toBeNull()
      expect(account?.player_id).toEqual(expect.any(String))

      const player = await playerRepo.findByEmail(email)
      expect(player?.id).toBe(account?.player_id)
    }
  })

  it('is idempotent: running twice does not create a duplicate player or account', async () => {
    await seedTestAccounts(pool)
    const before = await accountRepo.findByEmail('player@test.com')

    await seedTestAccounts(pool)
    const after = await accountRepo.findByEmail('player@test.com')

    expect(after?.id).toBe(before?.id)
    expect(after?.player_id).toBe(before?.player_id)

    const players = await pool.query(`SELECT id FROM public.players WHERE email = $1`, ['player@test.com'])
    expect(players.rows).toHaveLength(1)
  })

  it('repairs an existing unlinked account instead of skipping it', async () => {
    // Simulate the pre-fix seeder's shape directly: an account with no linked player.
    const created = await accountRepo.create('player@test.com', 'player', 'active')
    expect(created.player_id).toBeNull()

    await seedTestAccounts(pool)

    const repaired = await accountRepo.findByEmail('player@test.com')
    expect(repaired?.id).toBe(created.id) // same account row, not recreated
    expect(repaired?.player_id).toEqual(expect.any(String))
  })
})
