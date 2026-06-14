# Fix Plan: Test Database Connection Pooling & Isolation

## 1. Problem Summary

### The bug
Integration tests **commit data to the shared development database** instead of
rolling it back. Over time the DB accumulates orphaned rows (tournaments, players,
group matches, etc.). This already broke one test
(`database-format-column.spec.ts` → "all matches are singles", which became false
once doubles `group_matches` started leaking in) and will cause more
state-dependent flakiness as the data grows.

### Root cause
The test suite tries to achieve isolation with a single per-suite transaction, but
the writes and the reads do not share a connection:

- `packages/api/src/__tests__/helpers/db.ts`
  - `beginTransaction(pool)` checks out **one** `PoolClient` and issues `BEGIN`.
  - `getTransactionClient()` exposes that client.
  - `rollbackTransaction()` issues `ROLLBACK` in `afterAll`.
- `packages/api/src/__tests__/helpers/app.ts`
  - `createTestApp` wires the app's `deps.db` to `getTransactionClient() || pool`,
    so **the app writes through the suite transaction client**.
- Most specs, however, **read** app-created data through the **raw pool**, e.g.
  `new GroupRepository(pool).findMatchesByGroup(...)`.

A raw-pool read uses a *different* physical connection, so it cannot see the
suite transaction's uncommitted writes. The only reason these reads work today is
an accident: the repository transaction helpers in `packages/api/src/db.ts`
(`createGroups`, `createGroupsForDoubles`, and two others) run their own
`BEGIN … COMMIT` on whatever connection they are given. When that connection is
the **injected suite client**, the inner `COMMIT` **commits the entire suite
transaction**, making the data visible to pool reads — and permanently persisting
it. The subsequent `afterAll` `ROLLBACK` then has nothing to roll back.

So the cross-connection read visibility that the tests depend on **is** the
pollution.

### Why production is fine (do not change production behavior)
In production (`packages/api/src/server.ts:73`, `db: pool`) `deps.db` is a real
`pg.Pool`. Each transactional repository method borrows its own dedicated
connection (`pool.connect()`), runs a real `BEGIN/COMMIT/ROLLBACK`, and releases
it. There is no long-lived outer transaction, so the pollution cannot occur. The
`isPoolClient` duck-typing in `db.ts` exists **only** so tests can inject a single
client; in production it is always `false`.

### Evidence / blast radius
- Making the repo `BEGIN/COMMIT` a no-op when given an external client (the
  "obvious" fix) removes the accidental commit, after which raw-pool reads see
  nothing and the affected specs **time out on lock contention** (verified:
  `group-stage.spec.ts` went 24/24 → 6/6 failing at 30s timeouts).
- Affected files (read app-created group/knockout/match data via raw `pool`):
  `group-stage.spec.ts`, `group-stage-doubles.spec.ts`, `standings-processor.spec.ts`,
  `bracket-processor.spec.ts`, `bracket.spec.ts`, `tournaments.spec.ts`
  (~70 call sites total).

---

## 2. The Correct Way to Pool in Testing (Target Design — Option 1)

**Principle:** within a test suite, *every* database operation — app, factories,
and direct repository reads — must go through **one** connection (the suite's
transaction), and that transaction must be rolled back at the end. No spec code
should need to know about this.

Achieve it with a **transactional pool proxy** returned by `getTestPool()`. The
proxy is a `Pool`-shaped object that:

1. **Delegates all queries to the single suite connection.** `proxy.query(...)`
   forwards to the suite transaction client (once `beginTransaction` has run),
   otherwise to the underlying real pool. Because every repo (`new XRepository(pool)`)
   and factory already receives this object, they all transparently share the one
   connection — **no spec changes required**.

2. **Serializes queries onto that connection.** A single `pg` client cannot run
   queries concurrently, but specs do `await Promise.all([Factory.create(pool), ...])`.
   The proxy maintains an internal promise chain so overlapping `query()` calls are
   queued and executed one at a time. Errors must not break the chain.

3. **Translates transactions into savepoints.** When repository code runs
   `BEGIN` / `COMMIT` / `ROLLBACK` on the proxy (or on a client it hands out), the
   proxy rewrites them to `SAVEPOINT sp_n` / `RELEASE SAVEPOINT sp_n` /
   `ROLLBACK TO SAVEPOINT sp_n` so nested repo transactions work correctly *inside*
   the outer suite transaction and never commit it. Savepoint names must be unique
   and nest correctly (counter or stack).

4. **Makes `connect()` and `release()` safe.** `proxy.connect()` returns a thin
   client wrapper that also forwards/serializes to the suite connection and whose
   `release()` is a **no-op** (the shared suite connection must not be returned to
   the pool mid-suite). `proxy.end()` ends the underlying real pool (used by
   `closeTestPool`).

With this in place:
- App writes, factory writes, and direct reads all hit the same connection →
  reads see writes, no cross-connection invisibility, no timeouts.
- The outer suite `BEGIN` from `beginTransaction` + `afterAll` `ROLLBACK` discards
  **everything** → zero pollution.
- All the isolation machinery lives in `helpers/db.ts`; production `db.ts` no longer
  needs any test-awareness (see Task 7).

---

## 3. Implementation Tasks (Option 1)

> Work on a dedicated branch. Run the **full** API suite after each major step;
> the bar is "no regressions vs. the current pass count, and no new pollution."

### Task 1 — Build the transactional pool proxy
- In `packages/api/src/__tests__/helpers/db.ts`, add a `createTransactionalPool(realPool)`
  that returns a `Pool`-shaped proxy implementing `query`, `connect`, `end`.
- Internally hold a reference to the suite transaction client (reuse / fold in the
  existing `transactionClient` state).
- Implement **query serialization** (single promise chain; failures isolated so the
  chain keeps flowing).

### Task 2 — Implement savepoint translation
- Intercept statements equal to `BEGIN`, `COMMIT`, `ROLLBACK` (case-insensitive,
  trimmed) in the proxy's `query` path and rewrite to `SAVEPOINT` /
  `RELEASE SAVEPOINT` / `ROLLBACK TO SAVEPOINT` with a unique, correctly-nested name.
- Pass all other statements through unchanged.

### Task 3 — Implement the connect()/release() wrapper
- `proxy.connect()` returns a client wrapper that forwards `query` (serialized) to
  the suite connection and whose `release()` is a no-op.
- Ensure the wrapper satisfies whatever shape callers expect (at minimum `query`,
  `release`).

### Task 4 — Rewire the test helpers
- `getTestPool()` returns the proxy (after creating the real pool + running migrations
  on the real pool/connection).
- `beginTransaction()` opens the **one** suite connection on the real pool and issues
  the outer `BEGIN`; the proxy delegates to this connection thereafter.
- `rollbackTransaction()` issues the outer `ROLLBACK` and releases the suite
  connection.
- `closeTestPool()` ends the real pool via the proxy's `end()`.
- Confirm `helpers/app.ts` can simply pass the proxy as `deps.db` (it no longer needs
  the `getTransactionClient() || pool` branch, though leaving it is harmless if it
  resolves to the proxy).

### Task 5 — Verify factories and Promise.all paths
- Confirm specs using `await Promise.all([PlayerFactory.create(pool), ...])` pass
  (these exercise the serializer). Pay attention to `group-stage-doubles.spec.ts`,
  `group-stage.spec.ts`, `tournament-lifecycle.spec.ts`.

### Task 6 — Full-suite verification + pollution check
- Run the entire `packages/api` suite; expect parity with the pre-change pass count
  (target: 0 failures).
- Verify **no pollution**: capture `SELECT count(*) FROM public.group_matches` (and
  `tournaments`, `players`) before and after a full run — counts must be unchanged.
- Per-spec `getDb(pool)` helpers (`getTransactionClient() || pool`) become redundant
  once everything routes through the proxy; they may be left as-is (they resolve to
  the proxy/suite connection) or removed in a follow-up cleanup — do **not** let this
  expand scope here.

---

## 4. Final Task — Remove `isPoolClient` from production `db.ts`

Once the proxy (Tasks 1–6) handles all transaction translation, the test-only
duck-typing in `packages/api/src/db.ts` is no longer needed and should be deleted so
production code stops carrying test concerns.

### Task 7 — Delete the test-only connection machinery
1. **Precondition:** Tasks 1–6 complete and the full suite is green with no
   pollution. Do not start this task before that — `isPoolClient` is currently
   load-bearing.
2. In `packages/api/src/db.ts`:
   - Remove `getClientFromConnection` and `releaseClientIfNeeded`.
   - In each transactional method (currently around the four
     `getClientFromConnection(this.pool)` sites: `createGroups`,
     `createGroupsForDoubles`, and the two others near them), replace the
     borrow/branch/finally pattern with plain pool semantics:
     ```ts
     const client = await this.pool.connect()
     try {
       await client.query('BEGIN')
       // ... work using `client` ...
       await client.query('COMMIT')
       return /* ... */
     } catch (err) {
       await client.query('ROLLBACK')
       throw err
     } finally {
       client.release()
     }
     ```
   - `this.pool` is typed `DbConnection` (`Pool | PoolClient`); in production it is a
     real `Pool`, and in tests it is the proxy, both of which support `connect()` →
     a client whose `BEGIN/COMMIT/ROLLBACK` the proxy turns into savepoints and whose
     `release()` is a no-op. So the same plain code is correct in both environments.
3. Keep `DbConnection` if it is still referenced elsewhere; otherwise simplify the
   repository constructors to take `Pool`.
4. **Verify:** production transaction behavior is unchanged (real `BEGIN/COMMIT` on a
   borrowed pool connection), and the full test suite remains green with no pollution.

### Definition of done
- Full `packages/api` suite green.
- A full run leaves `group_matches` / `tournaments` / `players` row counts unchanged
  (no pollution).
- `isPoolClient`, `getClientFromConnection`, and `releaseClientIfNeeded` no longer
  exist in `src/db.ts`; all transaction-isolation logic lives in
  `src/__tests__/helpers/db.ts`.
- Production DB code path is plain `Pool` + real transactions, with no test-awareness.
