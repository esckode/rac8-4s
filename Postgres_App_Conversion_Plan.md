# PostgreSQL App Conversion Plan

This plan details the conversion from synchronous better-sqlite3 to asynchronous PostgreSQL with a TDD approach. Tasks are logically grouped by feature area, with routes and tests converted together to maintain testability.

**Scope:** Convert 6 repository classes, 3 route files, 15 test suites, and update 200+ repository method calls to async/await pattern.

**Timeline Estimate:** 12-16 hours of work
- Phase 0 (environment + infrastructure): 2-3 hours
- Phase 1 (repositories): 2-3 hours
- Phase 2 (routes + tests + isolation): 4-6 hours
- Phase 3 (auth schema): 1-2 hours
- Phase 4 (validation + commit): 2-3 hours

---

## Phase 0: Infrastructure Setup (6 tasks)

### Task 0.0: Environment & Prerequisites Verification

**Prerequisites:**
- Project repository is accessible
- User has admin/sudo access on local machine (for Docker)

**Implementation Criteria:**
- Verify Docker is installed and running: `docker --version`
- Verify Node.js version is 18+ : `node --version`
- Verify npm is available: `npm --version`
- Create `.env` template file at project root with required variables:
  ```
  # Database Configuration
  DATABASE_URL=postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app
  NODE_ENV=development
  
  # Server Configuration
  PORT=3001
  
  # Add any other required variables
  ```
- Document all environment variables in README with descriptions
- Verify project builds on current setup: `npm run build`
- Verify all SQLite tests pass before migration: `npm run test`
- Create backup of SQLite database if it contains test data: `cp db/tournament.db db/tournament.db.backup`

**Success Criteria:**
- Docker is installed and running
- Node.js 18+ is available
- `.env` template exists with all required variables
- README documents environment setup
- All SQLite tests pass
- SQLite backup exists (if needed)
- Project builds without errors

---

### Task 0.1: Set Up Local PostgreSQL Instance

**Prerequisites:**
- Docker is installed and running
- Project is in a stable state with all SQLite tests passing

**Implementation Criteria:**
- Create `docker-compose.yml` for PostgreSQL 15+ service
- Define one database: `tournament_app`
- Set connection parameters: host=localhost, port=5432
- Create initialization script to set up database user with appropriate permissions
- Document connection string in project README (format: `postgresql://user:pass@localhost:5432/tournament_app`)
- Test connection from Node.js using `pg` client

**Success Criteria:**
- PostgreSQL container starts without errors
- Can connect to database from CLI (`psql postgresql://user:pass@localhost:5432/tournament_app`)
- Node.js can establish connection to database
- Docker setup is idempotent (can destroy and recreate without data loss)

---

### Task 0.2: Update Dependencies

**Prerequisites:**
- Task 0.1 complete (PostgreSQL running)

**Implementation Criteria:**
- Add `pg` (^8.0.0) to `packages/api/package.json` dependencies
- Add `@types/pg` to devDependencies
- Remove or downgrade `@types/better-sqlite3` if no longer needed
- Update `tsconfig.json` if needed for new types
- Run `npm install` and verify no conflicts
- Update `.npmrc` or build config for new dependencies

**Success Criteria:**
- `npm install` completes without errors
- TypeScript compiles without errors
- Type definitions for `pg` are available
- Package-lock.json is updated

---

### Task 0.3: Create Database Connection Pool

**Prerequisites:**
- Task 0.2 complete (dependencies installed)

**Implementation Criteria:**
- Create `packages/api/src/db-connections.ts` exporting:
  - `getDb(): Pool` — connection pool for tournament_app database
  - Configuration: min 2 connections, max 10
  - Connection string from environment variable: `DATABASE_URL`
  - Export `initializeDb(): Promise<Pool>` for startup initialization
- Update `AppDependencies` interface in `app.ts`:
  - Change `db: Database.Database` to `db: Pool`
- **Update `packages/api/src/server.ts`:**
  - Add pool initialization on startup (before migrations):
    ```typescript
    const pool = await initializeDb()
    ```
  - Pass pool to app dependencies
  - Add graceful shutdown for pool (close on SIGTERM/SIGINT)
- Add health check endpoint: `GET /health`
  - Returns 200 + `{ status: 'ok', database: 'connected' }` when database is reachable
  - Returns 503 if database unavailable
- Document environment variable: `DATABASE_URL`
- Note: Repositories will access different schemas (`public` and `auth`) from same pool

**Success Criteria:**
- Connection pool initializes on server start
- Can query database from request handlers
- Graceful shutdown closes pool properly
- No connection leaks (pool size stays stable under load)
- Health check endpoint returns 200 when database is up
- Single Pool object available to all repositories

---

### Task 0.4: Create PostgreSQL Migration System

**Prerequisites:**
- Task 0.3 complete (single DB connection pool initialized)
- Existing migrations exist in `db/migrations/001-009_*.sql`

**Implementation Criteria:**
- Create migration runner for PostgreSQL:
  - Adapt existing `db.ts` migration logic to work with `pg` Pool
  - Create `packages/api/src/migrations.ts` with:
    - Export `runMigrations(pool: Pool, migrationsDir: string): Promise<void>`
    - Tracking table: `public.schema_migrations(version TEXT, executed_at TIMESTAMP)`
    - Verify all migrations run idempotently (safe to run multiple times)
  - Validate that `.sql` files use PostgreSQL-compatible syntax:
    - Change `TEXT DEFAULT CURRENT_TIMESTAMP` to `TIMESTAMP DEFAULT NOW()`
    - Change SQLite-specific syntax to PostgreSQL equivalents
    - Add schema prefixes where needed (e.g., `CREATE TABLE public.tournaments`)
- Plan schema structure for migrations (actual conversion happens in Task 0.5):
  - Migration 001: `CREATE SCHEMA IF NOT EXISTS public; CREATE SCHEMA IF NOT EXISTS auth;`
  - Migrations 002-010: Main schema (tournaments, players, groups, matches, locations, courts, events)
  - Migrations 011-012: Auth schema (accounts, password_reset_codes)
- **Update `packages/api/src/server.ts`** (after pool is initialized in Task 0.3):
  - Add migration runner on startup (after pool init, before app listen):
    ```typescript
    await runMigrations(pool, 'db/migrations')
    ```
  - Log migration progress
- Document schema organization in README

**Success Criteria:**
- Migration system runs without errors
- Both `public` and `auth` schemas are created in `tournament_app` database
- `public.schema_migrations` table tracks all migrations
- All migrations are idempotent (running twice produces same result)
- `npm run dev` initializes database schema on first run
- Query filters correctly by schema (e.g., `SELECT * FROM public.tournaments`)

---

### Task 0.5: Convert Existing SQLite Migrations to PostgreSQL

**Prerequisites:**
- Task 0.4 complete (migration system created)
- Existing SQLite migrations 001-009 are in `db/migrations/` directory

**Implementation Criteria:**
- Review all existing SQLite migration files (001-009):
  - `001_create_tournaments.sql`
  - `002_create_players.sql`
  - `003_create_groups.sql`
  - `004_create_knockout.sql`
  - `005_create_locations.sql`
  - `006_create_courts.sql`
  - `007_extend_registrations.sql`
  - `008_match_coordination.sql`
  - `009_create_user_events.sql`
- Convert each migration to PostgreSQL syntax:
  - Change `TEXT DEFAULT CURRENT_TIMESTAMP` to `TIMESTAMP DEFAULT NOW()`
  - Convert SQLite-specific types (BOOLEAN storage) to PostgreSQL equivalents
  - Add `public.` schema prefix to all CREATE TABLE statements
  - Convert CHECK constraints to PostgreSQL syntax if needed
  - Convert FOREIGN KEY constraints to PostgreSQL syntax if needed
  - Verify `AUTOINCREMENT` is handled (likely remove as sequences work differently)
  - Keep PRIMARY KEY and UNIQUE constraints as-is (mostly compatible)
- Verify each migration:
  - Runs without errors on PostgreSQL
  - Creates tables with correct columns and types
  - Maintains data integrity constraints
  - All indexes are created
  - No syntax errors
- Test idempotency:
  - Run all 001-009 migrations twice on fresh database
  - Verify same result both times
  - Verify `schema_migrations` table only has one entry per version

**Success Criteria:**
- All 001-009 migrations converted and verified
- PostgreSQL syntax is correct throughout
- All tables exist in `public` schema with `public.` prefix
- All constraints, indexes, and types are correct
- Migrations run without errors
- Idempotency verified
- Can create fresh database from migrations 001-009 in PostgreSQL
- Data types match PostgreSQL best practices (TIMESTAMP, BIGINT, NUMERIC, etc.)

---

## Phase 1: Repository Layer Refactoring (6 tasks)

### Phase 1 Guidance: Transaction Handling

**Important:** Some repository methods perform multiple database operations that must succeed or fail together:

- `GroupRepository.createGroups()` — Inserts groups + memberships + matches (3+ operations)
- `KnockoutRepository.createKnockoutMatches()` — Inserts multiple match records

**Transaction Pattern for PostgreSQL:**
```typescript
// For multi-step operations, use explicit transactions:
async createGroups(...) {
  const client = await this.pool.connect()
  try {
    await client.query('BEGIN')
    // ... insert groups
    // ... insert members
    // ... insert matches
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

**During refactoring (Tasks 1.1-1.6):**
- If a method does multiple operations in sequence, wrap in transaction
- If a method is single operation, no transaction needed
- Add comment noting which methods use transactions for future reference

---

### Task 1.1: Refactor TournamentRepository to Async

**Prerequisites:**
- Task 0.4 complete (PostgreSQL migrations running)
- All TournamentRepository tests passing on SQLite

**Implementation Criteria:**
- Update `TournamentRepository` class in `packages/api/src/db.ts`:
  - Change constructor to accept `Pool` instead of `Database.Database`
  - Convert all methods to `async`:
    - `async create(input): Promise<TournamentRow>`
    - `async findById(id): Promise<TournamentRow | undefined>`
    - `async findByName(name): Promise<TournamentRow | undefined>`
    - `async listByOrganizer(creatorId, opts): Promise<...>`
    - `async listPublic(opts): Promise<...>`
    - `async listAvailable(opts): Promise<...>`
    - `async update(id, input): Promise<TournamentRow>`
    - `async updateStatus(id, status): Promise<TournamentRow>`
    - `async softDelete(id): Promise<void>`
  - Replace `db.prepare().run()` calls with `pool.query()` await calls
  - Use parameterized queries: `$1, $2, $3` instead of `?`
  - Prefix queries with schema: `SELECT * FROM public.tournaments WHERE ...`
  - Handle PostgreSQL date format (TIMESTAMP vs TEXT)
- Update `TournamentRow` interface if needed (timestamps should be strings/Dates)
- Add error handling for query failures

**Success Criteria:**
- All methods are `async` and return Promises
- SQL queries use PostgreSQL syntax with `public.` schema prefix
- Parameterized queries used throughout
- No hardcoded query results or test data
- Compiled without TypeScript errors
- Ready for route/test updates (not tested yet)

---

### Task 1.2: Refactor PlayerRepository to Async

**Prerequisites:**
- Task 1.1 complete (TournamentRepository async)
- All PlayerRepository tests passing on SQLite

**Implementation Criteria:**
- Update `PlayerRepository` class in `packages/api/src/db.ts`:
  - Change constructor to accept `Pool` instead of `Database.Database`
  - Convert all methods to `async` (similar pattern as Task 1.1):
    - `async findOrCreatePlayerByEmail(...): Promise<PlayerRow>`
    - `async findByEmail(email): Promise<PlayerRow | undefined>`
    - `async createRegistration(...): Promise<RegistrationRow>`
    - `async findRegistration(...): Promise<RegistrationRow | undefined>`
    - `async countRegistrationsForTournament(...): Promise<number>`
    - `async listTournamentsByPlayer(...): Promise<...>`
    - `async findRegistrationById(...): Promise<RegistrationRow | undefined>`
    - `async findRegistrationsByTournament(...): Promise<...>`
    - `async updateRegistrationWithPartner(...): Promise<RegistrationRow>`
    - `async confirmPartner(...): Promise<RegistrationRow>`
    - `async updateRegistrationStatus(...): Promise<RegistrationRow>`
    - `async withdrawRegistration(...): Promise<RegistrationRow>`
    - `async findById(playerId): Promise<PlayerRow | undefined>`
    - `async updateShareContact(...): Promise<PlayerRow>`
  - Use `public.` schema prefix in queries
  - Replace SQLite syntax with PostgreSQL
  - Use parameterized queries

**Success Criteria:**
- All methods are `async` and return Promises
- SQL queries use PostgreSQL syntax with `public.` schema prefix
- No TypeScript errors
- Ready for route/test updates

---

### Task 1.3: Refactor GroupRepository to Async

**Prerequisites:**
- Task 1.2 complete (PlayerRepository async)
- All GroupRepository tests passing on SQLite

**Implementation Criteria:**
- Update `GroupRepository` class in `packages/api/src/db.ts`:
  - Change constructor to accept `Pool`
  - Convert all methods to `async`:
    - `async createGroups(...): Promise<GroupRow[]>`
    - `async findGroupsByTournament(...): Promise<GroupRow[]>`
    - `async findGroupById(...): Promise<GroupRow | undefined>`
    - `async findMatchesByGroup(...): Promise<GroupMatchRow[]>`
    - `async countPendingMatchesByTournament(...): Promise<number>`
    - `async findMembersByGroup(...): Promise<PlayerRow[]>`
    - `async findMatchById(...): Promise<GroupMatchRow | undefined>`
    - `async updateMatch(...): Promise<GroupMatchRow>`
    - `async findMatchByIdWithPlayers(...): Promise<GroupMatchWithPlayers | undefined>`
    - `async findMatchesByPlayer(...): Promise<GroupMatchWithPlayers[]>`
    - `async confirmMatch(...): Promise<GroupMatchRow>`
  - Use `public.` schema prefix in all queries
  - Note: `createGroups()` does multiple inserts — verify transaction handling
  - Replace SQLite syntax with PostgreSQL

**Success Criteria:**
- All methods are `async` and return Promises
- SQL queries use PostgreSQL syntax with `public.` schema prefix
- Multi-statement operations (like `createGroups`) handle transactions correctly
- No TypeScript errors
- Ready for route/test updates

---

### Task 1.4: Refactor KnockoutRepository to Async

**Prerequisites:**
- Task 1.3 complete (GroupRepository async)
- All KnockoutRepository tests passing on SQLite

**Implementation Criteria:**
- Update `KnockoutRepository` class in `packages/api/src/db.ts`:
  - Change constructor to accept `Pool`
  - Convert all methods to `async`:
    - `async setSeeds(...): Promise<void>`
    - `async getSeeds(...): Promise<...>`
    - `async createKnockoutMatches(...): Promise<KnockoutMatchRow[]>`
    - `async findKnockoutMatchesByTournament(...): Promise<KnockoutMatchRow[]>`
    - `async findKnockoutMatchById(...): Promise<KnockoutMatchRow | undefined>`
    - `async updateKnockoutMatch(...): Promise<KnockoutMatchRow>`
    - `async findKnockoutMatchByIdWithPlayers(...): Promise<KnockoutMatchWithPlayers | undefined>`
    - `async findKnockoutMatchesByPlayer(...): Promise<KnockoutMatchWithPlayers[]>`
    - `async confirmKnockoutMatch(...): Promise<KnockoutMatchRow>`
  - Use `public.` schema prefix in all queries
  - Replace SQLite syntax with PostgreSQL

**Success Criteria:**
- All methods are `async` and return Promises
- SQL queries use PostgreSQL syntax with `public.` schema prefix
- No TypeScript errors
- Ready for route/test updates

---

### Task 1.5: Refactor LocationRepository to Async

**Prerequisites:**
- Task 1.4 complete (KnockoutRepository async)
- All LocationRepository tests passing on SQLite

**Implementation Criteria:**
- Update `LocationRepository` class in `packages/api/src/db.ts`:
  - Change constructor to accept `Pool`
  - Convert all methods to `async`:
    - `async create(...): Promise<LocationRow>`
    - `async findById(...): Promise<LocationRow | undefined>`
    - `async findBySport(...): Promise<...>`
    - `async listAll(...): Promise<...>`
    - `async update(...): Promise<LocationRow>`
    - `async calculateCapacity(...): Promise<number>`
    - `async findNearby(...): Promise<LocationRow[]>`
    - `async softDelete(...): Promise<void>`
  - Use `public.` schema prefix in all queries
  - Replace SQLite syntax with PostgreSQL

**Success Criteria:**
- All methods are `async` and return Promises
- SQL queries use PostgreSQL syntax with `public.` schema prefix
- No TypeScript errors
- Ready for route/test updates

---

### Task 1.6: Refactor CourtRepository to Async

**Prerequisites:**
- Task 1.5 complete (LocationRepository async)
- All CourtRepository tests passing on SQLite

**Implementation Criteria:**
- Update `CourtRepository` class in `packages/api/src/db.ts`:
  - Change constructor to accept `Pool`
  - Convert all methods to `async`:
    - `async create(...): Promise<CourtRow>`
    - `async findById(...): Promise<CourtRow | undefined>`
    - `async findByLocation(...): Promise<CourtRow[]>`
    - `async updateStatus(...): Promise<CourtRow>`
    - `async countByLocation(...): Promise<number>`
    - `async countByLocationAndStatus(...): Promise<number>`
  - Use `public.` schema prefix in all queries
  - Replace SQLite syntax with PostgreSQL

**Success Criteria:**
- All methods are `async` and return Promises
- SQL queries use PostgreSQL syntax with `public.` schema prefix
- No TypeScript errors
- All repositories (1.1-1.6) are now async and ready for routes/tests

---

## Phase 2: Routes & Tests Conversion (5 tasks)

### Phase 2 Guidance: Error Messages & Middleware

**Error Message Changes (PostgreSQL vs SQLite):**

SQLite error messages and codes differ from PostgreSQL. Update error handling:

| Scenario | SQLite | PostgreSQL | Action |
|----------|--------|------------|--------|
| Duplicate email | `UNIQUE constraint failed: accounts.email` | `duplicate key value violates unique constraint "accounts_email_key"` | Update error catching logic |
| Foreign key violation | `FOREIGN KEY constraint failed` | `insert or update on table "accounts" violates foreign key constraint` | Update constraint error handling |
| Connection error | Connection timeout | `connect ECONNREFUSED` or pool timeout | Update connection error messages |

**Middleware to Verify (before Task 2.1):**

Before converting routes, verify middleware is async-compatible:
- `requirePlayerSessionAuth()` in `auth/middleware.ts` — uses TokenStore (check if async)
- `requireOrganizerAuth()` — same
- Any other middleware in routes

**Action:** If middleware uses async operations, ensure routes properly `await` them.

**Test Error Assertions Update:**

Tests with error assertions will need updates:
```typescript
// OLD: expect error message to match SQLite error
expect(err.message).toMatch('UNIQUE constraint failed')

// NEW: expect error message to match PostgreSQL error
expect(err.message).toMatch('duplicate key value violates')
```

---

### Task 2.1: Convert Tournaments Routes & Tests

**Prerequisites:**
- Task 1.6 complete (all repositories async)
- `tournaments.ts` route file is stable on SQLite
- All tournament tests passing

**Implementation Criteria:**

**Routes (`packages/api/src/routes/tournaments.ts`):**
- Update all route handlers to properly await repository calls
- Change repository instantiation to use new async signature:
  ```typescript
  const repo = new TournamentRepository(deps.mainDb)  // was deps.db
  ```
- Add `await` to all repository method calls (approximately 30+ locations):
  - Line 94: `const existing = await repo.findByName(...)`
  - Line 99: `const tournament = await repo.create(...)`
  - Line 130: `const tournament = await repo.findById(...)`
  - ... and all others
- Update error handling to use `.catch()` or try/catch for Promise rejections
- Ensure response is only sent after all awaits complete

**Tests (`packages/api/src/__tests__/` — tournament-related specs):**
- Update test files using TournamentRepository:
  - `tournaments.bundle.spec.ts` (~50 test cases)
  - `e2e-tournament-workflow.spec.ts` (~30 test cases)
  - `bracket.spec.ts` (~40 test cases)
  - `task15-bracket-job.spec.ts` (~15 test cases)
  - Any others that use TournamentRepository
- Convert all test setup/teardown to `async`:
  ```typescript
  beforeEach(async () => {
    tournamentRepo = new TournamentRepository(db)
    // ... other setup
  })
  ```
- Add `await` to all repository calls in tests
- Update assertions to handle Promises correctly:
  - Use `expect(promise).resolves.toBeDefined()`
  - Or `await promise; expect(...)`
- Add error handling tests:
  - Test what happens when query fails
  - Test database constraint violations
  - Test null/undefined returns

**Success Criteria:**
- All tournament routes use `await` on repository calls
- All tournament tests pass with async repositories
- Tests properly verify both success and failure paths
- Code coverage for tournament routes ≥ 90%
- No unhandled Promise rejections
- All error scenarios are tested

---

### Task 2.2: Convert Players Routes & Tests

**Prerequisites:**
- Task 2.1 complete (tournaments routes/tests converted)
- `player.ts` route file is stable on SQLite
- All player tests passing

**Implementation Criteria:**

**Routes (`packages/api/src/routes/player.ts`):**
- Update route handlers to await PlayerRepository and related repos:
  - Line 21: `const result = await playerRepo.listTournamentsByPlayer(...)`
  - Line 48: `const player = await playerRepo.findById(...)`
  - Line 68: `const updated = await playerRepo.updateShareContact(...)`
  - ... and all others
- Update repository instantiation:
  ```typescript
  const playerRepo = new PlayerRepository(deps.mainDb)
  ```

**Tests (player-related specs):**
- Update test files:
  - `player-registration.spec.ts` (~40 test cases)
  - `player-auth-coverage.spec.ts` (~20 test cases)
  - `auth-player.spec.ts` (~30 test cases)
  - Any others using PlayerRepository
- Convert setup/teardown to async
- Add `await` to all repository calls
- Update assertions for Promises
- Add error handling tests for player operations

**Success Criteria:**
- All player routes use `await` on repository calls
- All player tests pass with async repositories
- Tests verify both success and failure paths
- Code coverage for player routes ≥ 90%
- No unhandled Promise rejections

---

### Task 2.3: Convert Analytics Routes & Tests

**Prerequisites:**
- Task 2.2 complete (players routes/tests converted)
- `analytics.ts` route file is stable on SQLite
- All analytics tests passing

**Implementation Criteria:**

**Routes (`packages/api/src/routes/analytics.ts`):**
- Update route handlers to await repository calls
- Update repository instantiation:
  ```typescript
  const playerRepo = new PlayerRepository(deps.mainDb)
  // etc.
  ```
- Add `await` to all repository method calls

**Tests (analytics-related specs):**
- Update test files:
  - `analytics.spec.ts` (~30 test cases)
  - `coverage-improvement.spec.ts` (~20 test cases)
  - Any others using repositories for analytics
- Convert setup/teardown to async
- Add `await` to all repository calls
- Update assertions for Promises
- Add error handling tests

**Success Criteria:**
- All analytics routes use `await` on repository calls
- All analytics tests pass with async repositories
- Tests verify both success and failure paths
- Code coverage for analytics routes ≥ 90%
- No unhandled Promise rejections

---

### Task 2.4: Add Async Error Handling & Edge Cases

**Prerequisites:**
- Task 2.3 complete (all routes/tests converted)

**Implementation Criteria:**
- Create comprehensive error handling tests:
  - **Connection failures:** Test behavior when database is unreachable
  - **Query timeouts:** Test behavior when query takes too long
  - **Constraint violations:** Test unique constraint, foreign key violations
  - **Null handling:** Test methods returning null/undefined
  - **Concurrent operations:** Test race conditions (two updates simultaneously)
  - **Rollback scenarios:** Test transaction rollback behavior
- Add tests for:
  - Promise rejection handling in routes
  - Proper error messages without leaking internals
  - Graceful degradation when one query fails
  - Timeout handling (set reasonable query timeout in connection pool)
- Create test utilities:
  - Helper to simulate database failure
  - Helper to artificially delay queries (for timeout testing)
  - Helper to verify error response structure

**Test files to create/update:**
- `packages/api/src/__tests__/async-error-handling.spec.ts` (new)
- `packages/api/src/__tests__/concurrency.spec.ts` (new)
- Update existing specs with edge case coverage

**Success Criteria:**
- All error paths are tested and verified
- Connection failures are handled gracefully
- Concurrent operations don't cause data corruption
- Timeout handling works correctly
- Error messages don't leak sensitive info
- Code coverage for error paths ≥ 85%

---

### Task 2.5: Test Database Setup & Isolation

**Prerequisites:**
- Task 2.4 complete (all routes/tests converted)
- All tests currently passing with async code

**Implementation Criteria:**
- **Jest Configuration for PostgreSQL:**
  - Update `packages/api/jest.config.js`:
    - Set `testEnvironment: 'node'`
    - Set `testTimeout: 10000` (async operations may be slower)
    - Configure test reporters for better error messages
  - Ensure database connection pool doesn't leak between tests
  
- **Test Database Isolation Strategy:**
  - Option A (Recommended): Fresh database per test suite
    - Create `setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts']`
    - In setup.ts: before each test suite, create fresh schema
    - After each test suite, drop schema
    - Uses same `tournament_app` database but fresh `public` and `auth` schemas per test
  - Option B: Transactions that rollback
    - Wrap each test in a transaction, rollback after
    - Simpler but slower (less parallelization)
  
- **Implement Database Setup/Cleanup:**
  - Create `packages/api/src/__tests__/db-setup.ts`:
    ```typescript
    export async function setupTestDatabase(pool: Pool) {
      // Recreate fresh schemas
      await pool.query('DROP SCHEMA IF EXISTS public, auth CASCADE')
      await pool.query('CREATE SCHEMA public')
      await pool.query('CREATE SCHEMA auth')
      // Run all migrations (001-012)
    }
    
    export async function teardownTestDatabase(pool: Pool) {
      // Drop test schemas
      await pool.query('DROP SCHEMA IF EXISTS public, auth CASCADE')
    }
    ```
  - Create `beforeAll` and `afterAll` hooks in test setup
  
- **Update Test Database Connection:**
  - Tests should use same `DATABASE_URL` (will connect to test instance)
  - Or create separate test database in PostgreSQL if preferred
  - Document in README how to set up test database
  
- **Verify No Shared State:**
  - Run test suite twice, verify same results both times
  - Run tests in parallel: `npm run test -- --maxWorkers=4`
  - Verify no flaky tests due to shared state

**Success Criteria:**
- Jest is configured for async PostgreSQL testing
- Tests use isolated databases (fresh schema per test suite)
- Test cleanup hooks properly reset database state
- Tests can run in parallel without interference
- Test timeout is appropriate for PostgreSQL queries
- No database state leaks between test suites
- All 500+ tests pass
- No flaky tests (consistent results across runs)

---

## Phase 3: Auth Schema Layer (prerequisite for Phase 1 auth endpoints)

### Task 3.1: Create Auth Schema & Repositories

**Prerequisites:**
- Task 0.4 complete (PostgreSQL migrations set up)
- Task 1.6 complete (all main DB repositories async)

**Implementation Criteria:**
- Create `db/migrations/011_create_auth_schema.sql`:
  - `CREATE SCHEMA IF NOT EXISTS auth;`
  - Table: `auth.accounts` (id, email, password_hash, role, status, created_at)
  - Table: `auth.password_reset_codes` (id, account_id, code, attempts, expires_at, used_at, created_at)
  - Constraints: UNIQUE on email, FOREIGN KEY on account_id, CHECK on role/status
  - Indexes: on email, account_id, code for performance
- Create `db/migrations/012_create_auth_indexes.sql`:
  - Create indexes if not created above
- Update `migrations.ts` to run auth migrations on main pool (they reference auth schema)
- Create `AccountRepository` class in `packages/api/src/db.ts`:
  - Constructor accepts `Pool` (same as other repos)
  - All methods async
  - Uses `auth.` schema prefix in queries
- Create `PasswordResetCodeRepository` class:
  - Constructor accepts `Pool`
  - All methods async
  - Uses `auth.` schema prefix in queries

**Success Criteria:**
- Auth migrations run without errors in `tournament_app` database
- `auth` schema exists with correct tables, constraints, indexes
- Both `AccountRepository` and `PasswordResetCodeRepository` are async
- All queries properly prefix with `auth.` schema
- No TypeScript errors
- Ready for auth endpoint implementation (Phase 1 auth plan)

---

## Phase 4: Validation & Integration (4 tasks)

### Task 4.1: Run Code Coverage Analysis

**Prerequisites:**
- All routes and tests converted (Tasks 2.1-2.4 complete)
- All tests passing

**Implementation Criteria:**
- Run code coverage for all modified files:
  ```bash
  npm run test:coverage -- --collectCoverageFrom='src/**/*.ts' --testMatch='**/__tests__/**'
  ```
- Verify coverage thresholds:
  - Statements: ≥ 85%
  - Branches: ≥ 80%
  - Functions: ≥ 85%
  - Lines: ≥ 85%
- Identify any gaps in coverage:
  - Uncovered error paths
  - Uncovered edge cases
  - Uncovered async scenarios
- Add tests to reach thresholds
- Document any coverage exceptions (e.g., untestable platform-specific code)

**Success Criteria:**
- Coverage meets or exceeds all thresholds
- All critical paths (error handling, async operations) are covered
- Coverage report is generated and reviewed
- Any gaps have documented justification

---

### Task 4.2: Run Security & Vulnerability Scans

**Prerequisites:**
- Task 4.1 complete (coverage verified)

**Implementation Criteria:**
- Run dependency vulnerability scan:
  ```bash
  npm audit
  ```
- Fix or document any vulnerabilities:
  - Critical: Fix immediately
  - High: Fix before deployment
  - Medium: Document reasoning if not fixed
  - Low: Document reasoning if not fixed
- Run code security analysis:
  - Check for hardcoded secrets (should use `process.env`)
  - Verify parameterized queries (prevent SQL injection)
  - Verify no XSS vulnerabilities in error messages
  - Verify no CSRF vulnerabilities in state-changing operations
- Verify async-specific security:
  - No unhandled Promise rejections that leak info
  - No timing-based side channels
  - No race conditions in auth/security-critical paths

**Success Criteria:**
- All critical vulnerabilities fixed
- All high vulnerabilities fixed or documented
- No hardcoded secrets found
- Parameterized queries used throughout
- Error messages don't leak sensitive info
- Security scan passes

---

### Task 4.3: Verify Database Integrity

**Prerequisites:**
- Task 4.2 complete (security scan)

**Implementation Criteria:**
- Verify migration system:
  - Run migrations on fresh PostgreSQL instance
  - Verify both `public` and `auth` schemas are created
  - Verify all tables created in correct schemas
  - Verify all indexes exist and are functional
  - Verify all constraints (UNIQUE, FOREIGN KEY, CHECK) are present
- Verify data integrity:
  - Run constraint validation queries (UNIQUE constraints on email, etc.)
  - Verify no orphaned foreign keys (auth.password_reset_codes → auth.accounts)
  - Verify timestamp columns are ISO 8601 format
  - Verify numeric precision (player IDs, tournament max_players, etc.)
- Test migration idempotency:
  - Run migrations twice on fresh DB, verify same result
  - Verify no duplicate indexes
  - Verify schema_migrations table tracks all migrations
  - Verify no failed migrations marked as complete
- Verify connection pool:
  - No connection leaks
  - Pool size stays stable under load
  - Graceful timeout/reconnect on connection failure
- Verify schema isolation:
  - Queries correctly reference `public.` and `auth.` schemas
  - No cross-schema issues in migrations

**Success Criteria:**
- All migrations run successfully on fresh PostgreSQL instance
- Both schemas exist with all correct tables, indexes, constraints
- Data integrity verified
- Migrations are idempotent
- Connection pool is stable and performs well
- Schemas are properly isolated

---

### Task 4.4: Run Full Integration Test Suite

**Prerequisites:**
- Task 4.3 complete (DB integrity verified)

**Implementation Criteria:**
- Run all tests:
  ```bash
  npm run test
  ```
- Verify all tests pass:
  - No skipped tests
  - No timeout failures
  - No flaky tests
- Run specific integration tests:
  - Tournament creation → registration → group stage → knockout flow
  - Player registration → match scoring → standings
  - Location management → court availability
- Verify error handling end-to-end:
  - 400 errors return correct messages
  - 401 errors return correct auth challenges
  - 404 errors return correct not-found messages
  - 500 errors are logged but don't leak internals
- Verify async patterns:
  - No unhandled Promise rejections
  - No race conditions under concurrent load
  - Proper error propagation through middleware

**Success Criteria:**
- All tests pass (0 failures)
- No flaky tests (run 3 times, all pass)
- All error scenarios return correct status and message
- No unhandled Promise rejections in logs
- Integration tests verify complete user workflows
- Performance is acceptable (queries < 100ms, routes < 500ms)

---

### Task 4.5: Final Commit & Documentation

**Prerequisites:**
- Task 4.4 complete (all integration tests pass)
- Code coverage ≥ 85%
- Security scan passed
- Database integrity verified

**Implementation Criteria:**
- Update documentation:
  - Update README with PostgreSQL setup instructions
  - Document connection string format
  - Document migration running
  - Update any architecture diagrams
  - Document breaking changes (if any)
- Create migration guide (SQLite → PostgreSQL):
  - Document how to migrate existing data (if needed)
  - Document any manual steps required
  - Document rollback procedures
- Verify clean git state:
  - `git status` shows no uncommitted changes (except migrations if fresh)
  - `git log` shows coherent commit history
- Create final commit:
  ```
  feat: convert database layer from SQLite to async PostgreSQL

  - Refactor all 6 repository classes to use async/await
  - Convert 200+ repository method calls to async
  - Update all route handlers to await database calls
  - Convert 15 test suites to async testing patterns
  - Add async error handling and edge case tests
  - Create dual database system (main + auth DB)
  - Migrate to PostgreSQL with connection pooling
  
  Verification:
  - All tests passing (500+ test cases)
  - Code coverage: 85%+
  - Security scan: passed
  - Database integrity: verified
  
  Co-Authored-By: [Your Name]
  ```

**Success Criteria:**
- All code is committed (no uncommitted changes)
- README is updated with PostgreSQL instructions
- Migration guide is documented
- Commit message clearly explains changes
- All tests passing
- Code is ready for Phase 1 (auth implementation) on PostgreSQL

---

## Summary

| Phase | Tasks | Focus | Completion |
|-------|-------|-------|-----------|
| **0** | 0.0-0.5 | Infrastructure setup | Environment + Docker + Single DB with schemas + migration conversion |
| **1** | 1.1-1.6 | Repository layer refactoring | All repos async (public schema) + transaction guidance |
| **2** | 2.1-2.5 | Routes & tests conversion | All routes async + error handling + test isolation |
| **3** | 3.1 | Auth schema layer (prerequisite) | Auth schema + repos |
| **4** | 4.1-4.5 | Validation & commit | Ready for production |

**Total: 18 tasks** (was 16)

---

## Implementation Notes

1. **Single Database Design:** One PostgreSQL database (`tournament_app`) with two schemas:
   - `public` schema: tournaments, players, groups, matches, locations, courts, events
   - `auth` schema: accounts, password_reset_codes
   - All repositories use same connection pool, schema prefixed in queries

2. **Environment Setup (Task 0.0):** Must be done first before any infrastructure setup
   - Create `.env` file with `DATABASE_URL` before Task 0.1
   - Verify SQLite tests pass before migration
   - Backup SQLite database

3. **Server.ts Coordination (Tasks 0.3 & 0.4):**
   - Task 0.3: Initialize connection pool on startup
   - Task 0.4: Run migrations after pool is initialized (within same `server.ts` startup sequence)
   - Order: pool init → migrations → app listen

4. **Task Dependencies:** Phases must complete in order; tasks within phases have sequential dependencies

5. **Testing Strategy:** 
   - Each task's code is tested before moving to next
   - Task 2.5 (test isolation) ensures test database is fresh for each test suite
   - Full integration testing in Phase 4

6. **Transaction Handling (Phase 1 Guidance):**
   - Multi-step repository methods (createGroups, createKnockoutMatches) must use explicit transactions
   - Single-operation methods don't need transactions
   - Pattern provided in Phase 1 guidance section

7. **Error Message Updates (Phase 2 Guidance):**
   - PostgreSQL error messages differ from SQLite
   - Error assertions in tests will need updates
   - Table provided for common error message changes
   - Verify middleware is async-compatible before converting routes

8. **Test Database Isolation (Task 2.5):**
   - Fresh `public` and `auth` schemas per test suite
   - Migrations run fresh for each test suite
   - Setup/teardown hooks handle schema creation/deletion
   - Tests can run in parallel safely

9. **Rollback Plan:** If critical issues arise, can revert to SQLite (migration structure is backward-compatible)

10. **Parallel Work:** Tasks 0.1-0.3 can be done in parallel after 0.0 and 0.2

11. **Review Points:** After Phase 0 (environment verified), Phase 1 (repos async), Phase 2 (routes async + tests isolated), Phase 3 (auth layer), and before Phase 4 commit

12. **Schema Prefixing:** All SQL queries must explicitly prefix table names with schema (e.g., `public.tournaments`, `auth.accounts`) to ensure clarity and prevent accidental cross-schema queries
