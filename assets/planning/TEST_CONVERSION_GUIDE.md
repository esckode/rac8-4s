# Test Conversion Guide: SQLite → PostgreSQL Async

This guide documents the pattern used to convert test files from synchronous SQLite to asynchronous PostgreSQL.

## Completed Example
**Template file:** `packages/api/src/__tests__/tournaments.spec.ts`

Use this as a reference for converting remaining test files.

## Conversion Steps

### 1. Update Imports
```typescript
// OLD
import Database from 'better-sqlite3'
import { openDatabase, TournamentRepository } from '../db'

// NEW
import { Pool } from 'pg'
import { TournamentRepository } from '../db'
import { initializeTestDb, resetTestDb, closeTestDb } from './db-test-setup'
```

### 2. Change Database Type
```typescript
// OLD
let db: Database.Database

// NEW
let db: Pool
```

### 3. Update Test Lifecycle Hooks
```typescript
// OLD
beforeEach(() => {
  db = openDatabase(':memory:')
  // ... setup
})

afterEach(() => {
  if (db) db.close()
})

// NEW
beforeAll(async () => {
  db = await initializeTestDb()
})

beforeEach(async () => {
  await resetTestDb(db)
  // ... setup
})

afterAll(async () => {
  await closeTestDb()
})
```

### 4. Add `await` to Repository Calls
```typescript
// OLD
const tournament = repo.create({
  name: 'Test Tournament',
  // ...
})

// NEW
const tournament = await repo.create({
  name: 'Test Tournament',
  // ...
})
```

### 5. Convert Raw Database Queries
```typescript
// OLD (SQLite)
db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('open', t.id)

// NEW (PostgreSQL)
await db.query('UPDATE public.tournaments SET status = $1 WHERE id = $2', ['open', t.id])
```

### 6. Handle Non-Null Assertions with await
```typescript
// OLD
const deleted = repo.findById(t.id)!

// NEW
const deleted = (await repo.findById(t.id))!
```

## Common Patterns by File Type

### Repositories Used
- **TournamentRepository:** create, findById, findByName, listByOrganizer, listPublic, updateStatus, softDelete
- **PlayerRepository:** create, findById, findByEmail, findOrCreatePlayerByEmail, createRegistration, findRegistration, confirmPartner, withdrawRegistration
- **GroupRepository:** createGroups, findGroupsByTournament, findMembersByGroup, findMatchesByGroup, updateMatch, confirmMatch
- **KnockoutRepository:** setSeeds, getSeeds, createKnockoutMatches, findKnockoutMatchesByTournament, updateKnockoutMatch, confirmKnockoutMatch

### PostgreSQL Query Parameter Mapping
| SQLite | PostgreSQL | Example |
|--------|-----------|---------|
| `?` | `$1, $2, $3...` | `WHERE id = $1` |
| `.run()` | `await db.query()` | `await db.query('UPDATE ...', [value])` |
| `.get()` or `.all()` | `await db.query()` then `.rows` | `const {rows} = await db.query(...); rows[0]` |
| No schema prefix | `public.` prefix | `UPDATE public.tournaments` |

## Test Database Setup

The `db-test-setup.ts` utility provides:
- **`initializeTestDb()`** - Creates/initializes test database once per test suite
- **`resetTestDb(pool)`** - Clears schemas and re-runs migrations before each test
- **`closeTestDb()`** - Closes database connection after test suite

Uses `TEST_DATABASE_URL` environment variable (falls back to `DATABASE_URL`).

## Files Remaining to Convert

### Primary Tournament Tests (4 files)
1. ✅ `tournaments.spec.ts` - COMPLETE (use as template)
2. `tournaments.bundle.spec.ts` - uses TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository
3. `e2e-tournament-workflow.spec.ts` - full tournament lifecycle, HTTP server tests
4. `bracket.spec.ts` - bracket generation, knockout operations

### Secondary Files (14 files)
- `player-registration.spec.ts`
- `player-auth-coverage.spec.ts`
- `group-stage.spec.ts`
- `coverage-improvement.spec.ts`
- `score-submission.spec.ts`
- `task13-job-queue-integration.spec.ts`
- `task14-standings-job.spec.ts`
- `task15-bracket-job.spec.ts`
- `task16-email-job.spec.ts`
- `task17-sse.spec.ts`
- `task12-match-coordination.spec.ts`
- `match-scoring-coverage.spec.ts`
- `analytics.spec.ts`
- `task8-missing-endpoints.spec.ts`

## Verification Checklist

For each converted test file:
- [ ] Imports updated (remove better-sqlite3, add Pool)
- [ ] Database type changed to Pool
- [ ] beforeAll/beforeEach/afterAll made async with test setup
- [ ] All `repo.` calls have `await`
- [ ] All `db.prepare()` calls converted to `db.query()` with PostgreSQL syntax
- [ ] All non-null assertions handle Promise: `(await repo.method())!`
- [ ] File compiles without TypeScript errors

## Notes

- Test database is isolated per test file via `resetTestDb()`
- Schemas (public, auth) are dropped and recreated before each test
- Migrations are re-run on schema reset to ensure clean state
- Uses same PostgreSQL instance as development (assumes it's available)
- If PostgreSQL not available, tests will fail at database initialization
