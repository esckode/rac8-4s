# Player Messaging — Implementation Plan
## TDD-driven build of the Phase 7 messaging feature

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-22
**Status:** 📋 PLAN — not started. Pulls `MESSAGING_DESIGN.md` (Phase 7) forward.
**Design source of truth:** [`MESSAGING_DESIGN.md`](./MESSAGING_DESIGN.md)

---

## 0. Scope, constraints & assumptions

### In scope (functional MVP — all three forms via one schema)
- **Organizer → participant broadcasts** (announcements).
- **Match/opponent coordination** DMs (player ↔ player, optionally `match_id`-scoped).
- **Dispute channel** (player ↔ organizer; `legal_hold` capable).
- Real-time delivery over existing **SSE + `BroadcastBus`**; **persist-then-broadcast**.
- **Read receipts:** `read_at` only (batched writes).
- **DB partitioning + lifecycle:** monthly `RANGE(created_at)` partitions, automated
  creation + boundary-safe purge.

### Explicitly out of scope (later)
- Attachments/media (would need object storage), `delivered_at`/`acknowledged_at`,
  cross-app reuse / service extraction, Discord linkout, voice.

### Hard constraints
1. **TDD-first (CLAUDE.md §4, §11):** for every behavior — write/update **E2E scenarios
   (`e2e-scenarios.md`) + Playwright specs + unit/integration tests** first, confirm they
   fail for the right reason, then implement. **Failing tests commit separately** from impl.
2. **Coverage ≥ 85%:** raise `packages/api/jest.config.js` `coverageThreshold.global` from
   `80` → `85` (branches/functions/lines/statements). CI gate (commit `848e024`) enforces on
   push/PR to `main`. Every new module must carry tests that keep global ≥ 85.
3. **Conventions:** migrations numbered `db/migrations/031+` with matching `db/rollback/`;
   structured logging (`getLogger`, `noun.verb` events, IDs only — never message body, §6);
   **route ordering** static-before-param (§10); `TIMESTAMPTZ` everywhere (`[[deadline bug]]`);
   durable `player_id` via `resolveTournamentPlayer`/`requirePlayerSessionAuth`.
4. **Test isolation (§7):** integration tests use `getTestPool()` transactional harness
   (savepoint rollback). Partition DDL is transactional in Postgres, so create/drop/detach
   inside a test transaction rolls back cleanly — but see §6.4 for the harness caveat.

### Assumptions to confirm at Phase 0 (§1 — surfaced, not silently chosen)
- **A1.** MVP includes broadcasts **and** 1:1 DMs (the schema supports both; confirm product wants both now).
- **A2.** Read receipts are **on for broadcasts**, **off/opt-in for DMs** (privacy).
- **A3.** Partitioning ships **from day one** (vs unpartitioned + batched DELETE first). Plan assumes day-one partitioning per the locked decision.

---

## 1. Module layout (new/updated files)

```
db/migrations/031_normalize_timestamps_to_timestamptz.sql  NEW  PREREQUISITE PHASE (see §5.0, Phase P)
db/migrations/032_create_messaging_schema.sql              NEW  partitioned tables + indexes (+ tournaments.completed_at)
db/migrations/033_messaging_partition_functions.sql        NEW  PL/pgSQL create/purge functions
db/rollback/031_normalize_timestamps_to_timestamptz.sql    NEW
db/rollback/032_create_messaging_schema.sql                NEW
db/rollback/033_messaging_partition_functions.sql          NEW

packages/api/src/repositories/message-repository.ts    NEW  CRUD + history + read-state
packages/api/src/routes/messages.ts                    NEW  send/broadcast/history/mark-read + SSE event
packages/api/src/services/partition-manager.ts         NEW  TS wrappers over the SQL functions
packages/api/src/workers/partition-processor.ts        NEW  ensure-partitions + purge jobs
packages/api/src/workers/read-receipt-processor.ts     NEW  batched read_at flush
packages/worker/src/types.ts                           EDIT add JobName/JobPayload entries
packages/api/src/app.ts                                EDIT mount messagesRouter, register jobs
packages/api/src/config.ts                             EDIT retention/padding/partition config

scripts/messaging-partitions.js                        NEW  manual/cron create + purge CLI

packages/frontend/src/hooks/useMessages.ts             NEW
packages/frontend/src/hooks/useSSE.ts                  EDIT handle 'message.created' event
packages/frontend/src/state/message-state.ts           NEW
packages/frontend/src/components/.../MessagePanel.tsx  NEW

# Tests (written FIRST)
packages/api/src/__tests__/integration/messaging.spec.ts            NEW
packages/api/src/__tests__/integration/messaging-partitions.spec.ts NEW (lifecycle + boundary)
packages/api/src/__tests__/unit/partition-manager.spec.ts           NEW
packages/api/src/__tests__/unit/message-repository.spec.ts          NEW
packages/api/src/__tests__/factories.ts                             EDIT add MessageFactory
packages/frontend/e2e/messaging.spec.ts                             NEW
packages/frontend/src/hooks/__tests__/useMessages.spec.tsx          NEW
e2e-scenarios.md                                                    EDIT add Feature: Messaging
```

---

## 2. Phased execution (each phase: RED → GREEN → verify → commit)

> Commit discipline (§11): each phase is **two commits** — `test:` (failing) then `feat:`
> (implementation). Branch off `main` first.
>
> **Phase P is the exception:** it's a behavior-preserving refactor (CLAUDE.md §4 "tests pass
> before *and* after"), not a red→green feature. No new failing tests up front — the success
> criterion is the *existing* suite staying green across the change.

### Phase P (PREREQUISITE) — Normalize all timestamps to TIMESTAMPTZ
**Runs before any messaging-specific phase.** Schema-wide hygiene (independently valuable);
also removes the `tournaments`↔messaging naive/`TIMESTAMPTZ` seam so `completed_at` lands clean
with no backfill. Only test-created records can be affected; the conversion is a pure type
change when rows are absent.

Workflow (exactly as requested — green before, change, green after):
1. **Baseline green (FIRST):** run the full suite — `npm test` (unit + integration) **and**
   `npm run test:e2e` — and confirm **all pass**. Record the baseline (counts). Do nothing else
   until green.
2. **Audit:** `\d` the live tables to list columns *currently* naive `TIMESTAMP` (per §5.0 table),
   **excluding** the deadline columns already converted by migration 025. Don't double-convert.
3. **Change:** write `031_normalize_timestamps_to_timestamptz.sql` (+ rollback) using
   `ALTER COLUMN … TYPE TIMESTAMPTZ USING col AT TIME ZONE 'UTC'` for each remaining naive column.
   Then grep the API + frontend for code that assumes naive/local-wall-clock semantics on these
   fields and fix any (display formatting, manual date math).
4. **Regression green (FINALLY):** re-run **the same** unit + integration + e2e suites and confirm
   **all pass as before** (same baseline). If any test asserted naive behavior, update it to the
   correct `TIMESTAMPTZ` expectation and note why.
- **Verify:** suite green before and after; `npm run type-check` clean.
- **Commit:** single `refactor: normalize timestamps to TIMESTAMPTZ (migration 031)` (no red/green
  split — behavior preserved).

### Phase 0 — Confirm scope & raise the gate
- Confirm A1–A3 with stakeholder.
- **RED isn't applicable**; this is config. Bump coverage threshold 80 → 85, watch CI fail
  (no messaging code yet won't fail it, but locks the bar). Add messaging config to `config.ts`.
- **Verify:** `npm run test:coverage` still green at 85 for existing code.
- **Commit:** `chore: raise api coverage 80→85; add messaging config`.

### Phase 1 — DB schema & partitioning (depends on Phase P)
- **`completed_at`:** add `public.tournaments.completed_at TIMESTAMPTZ` as part of migration
  `032`, set on the status→completed transition. **No backfill** (Phase P already made the table
  fully `TIMESTAMPTZ`, and there are no records) — the §5.0 seam is gone.
- **RED:** `messaging-partitions.spec.ts` — assert tables exist, are partitioned, route rows
  by `created_at`, enforce the `(id, created_at)` PK and the composite FK; assert a row in
  June lands in `messages_2026_06`. Plus a test that `completed_at` is set on status→completed.
  These fail (no schema/column).
- **GREEN:** `032_create_messaging_schema.sql` (see §5.1, includes `completed_at`) + rollback.
- **Verify:** migration runs in test DB; partition-routing + completed_at assertions pass.
- **Commits:** `test:` then `feat:` (migration).

### Phase 2 — Partition lifecycle (functions + manager + jobs)
- **RED:** extend `messaging-partitions.spec.ts` + `partition-manager.spec.ts`:
  - `ensure_future_partitions(2)` creates next 2 months idempotently.
  - **Boundary-safe purge (the centerpiece test):** seed a tournament whose messages span
    `2026_06`→`2026_07`, mark it `completed_at` recent / `legal_hold` / in-progress in
    separate cases; assert the old partition is **DETACHED not DROPPED** while unsafe, and
    **DROPPED** only once fully past `retention + padding` and the gate is clear. (See §5.3.)
- **GREEN:** `032_messaging_partition_functions.sql` (PL/pgSQL, §5.2), `partition-manager.ts`,
  `partition-processor.ts`, new `JobName`s `messaging.partition.ensure` / `messaging.partition.purge`,
  schedule as BullMQ repeatable monthly jobs; `scripts/messaging-partitions.js` CLI.
  (Partition functions land in migration `033`.)
- **Verify:** lifecycle + boundary tests pass; manual `node scripts/messaging-partitions.js --ensure`.
- **Commits:** `test:` then `feat:`.

### Phase 3 — Repository layer
- **RED:** `message-repository.spec.ts` + integration: insert DM, insert broadcast (fan-out
  recipient rows in one multi-row INSERT), fetch history (ordered, paginated), mark-read,
  unread count. Fail (no repo).
- **GREEN:** `message-repository.ts` using `this.pool` (+ `BEGIN/COMMIT` for fan-out atomicity,
  §7 plain-pool pattern). Add `MessageFactory`.
- **Verify + Commits.**

### Phase 4 — API routes + SSE
- **RED:** `messaging.spec.ts` (supertest, mirrors `analytics.spec.ts` style):
  - `POST /tournaments/:id/messages` — player DM (auth required), persists + emits
    `message.created` on `broadcastBus`.
  - `POST /tournaments/:id/announcements` — **organizer-only** broadcast (403 for players).
  - `GET /tournaments/:id/messages` — history backfill; auth-scoped; pagination.
  - `POST /tournaments/:id/messages/:msgId/read` — mark read.
  - Authz matrix (guest/player/organizer/none), validation (empty body, length cap),
    logging events (`message.sent`, `announcement.sent` — IDs only).
- **GREEN:** `messages.ts` router (default-export factory taking `AppDependencies`),
  **register static routes before `:id` params** (§10), mount in `app.ts`. Emit after persist.
- **Verify + Commits.**

### Phase 5 — Read-receipt batching
- **RED:** `read-receipt-processor.spec.ts` — N read events coalesce into one bulk UPDATE;
  ordering/idempotency.
- **GREEN:** `read-receipt-processor.ts` + `messaging.read_receipt.flush` job; route enqueues
  instead of synchronous UPDATE.
- **Verify + Commits.**

### Phase 6 — Frontend + E2E
- **RED:** add **Gherkin scenarios** to `e2e-scenarios.md` (§4), write
  `packages/frontend/e2e/messaging.spec.ts` (seed via fixtures, `data-testid` from `config.ts`)
  and `useMessages.spec.tsx`. Fail (no UI/hook).
- **GREEN:** `useMessages.ts`, `message-state.ts`, extend `useSSE.ts` for `message.created`,
  `MessagePanel.tsx`. Fetch-once-then-SSE-delta (no re-fetch).
- **Verify:** `/e2e-testing` skill workflow; both browser projects green.
- **Commits.**

### Phase 7 — Coverage hardening
- Run `npm run test:coverage`; fill gaps (error branches, auth failures, validation,
  partition gate edge cases) until **global ≥ 85** and messaging files ≥ 85.
- **Verify:** coverage gate green; type-check green.
- **Commit:** `test: harden messaging coverage to ≥85%`.

---

## 3. API surface (summary)

| Method & path | Auth | Notes |
|---|---|---|
| `POST /tournaments/:id/messages` | player session | DM / coordination; optional `recipientPlayerId`, `matchId` |
| `POST /tournaments/:id/announcements` | **organizer** | broadcast; single-row feed by default |
| `GET /tournaments/:id/messages` | player/organizer | history; paginated; backfill on reconnect |
| `POST /tournaments/:id/messages/:msgId/read` | player session | enqueues batched read flush |

Delivery: each write → persist (Postgres) → `deps.broadcastBus.emit(tournamentId,
'message.created', payload)` → existing `/tournaments/:id/events` SSE stream → `useSSE`.

---

## 4. E2E scenarios to add (`e2e-scenarios.md` → "Feature: Player Messaging")

```gherkin
Scenario: Organizer broadcasts an announcement to all participants
  Given an organizer with a tournament that has registered players
  When the organizer posts an announcement
  Then every connected participant receives it in real time
  And a reconnecting participant sees it in message history

Scenario: Player sends a coordination message to their match opponent
  Given two players in the same match
  When one sends a message scoped to the match
  Then the opponent receives it and it appears in the match thread

Scenario: Player cannot broadcast to the tournament
  Given an authenticated player (not organizer)
  When the player attempts to post an announcement
  Then the request is rejected with 403

Scenario: Unread badge updates and clears on read
  Given a player with one unread message
  Then the unread badge shows 1
  When the player opens the thread
  Then the badge clears

Scenario: Unauthenticated user cannot access messages
  When an unauthenticated user requests tournament messages
  Then the request is rejected with 401
```
(Each maps to a Playwright test in `messaging.spec.ts`, seeded via `fixtures.ts`,
selected via `data-testid` constants in `config.ts`.)

---

## 5. DB layer — partition creation & boundary-safe purge

### 5.0 Prerequisite — normalize timestamps + clean `completed_at`

**Phase P (migration `031`) — schema-wide TIMESTAMPTZ normalization.** ~13 naive `TIMESTAMP`
columns remain across 10 tables (migration 025 only converted the three tournament *deadline*
columns). Convert the rest, finishing the "UTC everywhere = `TIMESTAMPTZ`" job (`[[deadline bug]]`).
No records exist, so this is a pure type change; the explicit `USING` clause keeps it correct
even if a populated env appears later.

```sql
-- 031: per remaining naive column (audit live state first — skip 025's deadline columns)
ALTER TABLE public.tournaments
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';
-- …repeat for: players, groups, group_matches, knockout_matches, locations, courts,
--    player_registrations, user_events, teams (see the §5.0 audit table in chat / Phase P step 2)
```

**`completed_at` (added clean in migration `032`).** With the table now fully `TIMESTAMPTZ` and
zero records, the retention anchor is added with **no backfill** and **no cast subtlety**:

```sql
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
-- set via now() on the status→completed transition in the tournament status-update path
```
> Confirm the exact `status` value(s) that mean "done" against the tournament state machine
> before wiring the transition — `groups.status` uses `'completed'`; verify the tournament-level value.

### 5.1 Schema (migration `032`, includes `completed_at`)
Partitioned parent tables + initial partitions (current month ± 1) + indexes, exactly as the
locked design (`MESSAGING_DESIGN.md` §15): `messaging.messages` `PARTITION BY RANGE(created_at)`
with PK `(id, created_at)`; `messaging.message_recipients` `PARTITION BY RANGE(message_created_at)`,
PK `(message_id, message_created_at, player_id)`, composite FK to `messages(id, created_at)`.
Indexes: `messages(tournament_id, created_at)`, `message_recipients(player_id, read_at)`.

### 5.2 Lifecycle functions (migration `033`, PL/pgSQL)

```sql
-- Create one month's aligned partitions, idempotently.
CREATE OR REPLACE FUNCTION messaging.create_month_partition(target_month date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  start_ts date := date_trunc('month', target_month);
  end_ts   date := (date_trunc('month', target_month) + interval '1 month');
  suffix   text := to_char(start_ts, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS messaging.messages_%s
       PARTITION OF messaging.messages FOR VALUES FROM (%L) TO (%L)',
    suffix, start_ts, end_ts);
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS messaging.message_recipients_%s
       PARTITION OF messaging.message_recipients FOR VALUES FROM (%L) TO (%L)',
    suffix, start_ts, end_ts);
END $$;

-- Pre-create the next N months (call monthly; idempotent).
CREATE OR REPLACE FUNCTION messaging.ensure_future_partitions(months_ahead int DEFAULT 2)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE i int;
BEGIN
  FOR i IN 0..months_ahead LOOP
    PERFORM messaging.create_month_partition((date_trunc('month', now()) + (i || ' month')::interval)::date);
  END LOOP;
END $$;
```

### 5.3 Boundary-safe purge (the key requirement)

The gate: a month partition is **safe to DROP only if it contains no message belonging to a
tournament that is (a) still in-progress, (b) within `completed_at + retention_days`, or
(c) under `legal_hold`.** Otherwise **DETACH and keep cold**, retry next cycle. Padding
(`drop_padding_days`) means a partition isn't even *considered* until well past the retention
window — so a tournament that spilled a few late-June messages into July is never truncated.

```sql
CREATE OR REPLACE FUNCTION messaging.purge_old_partitions(
  retention_days   int DEFAULT 90,
  drop_padding_days int DEFAULT 45     -- ≥ max plausible tournament span + buffer
) RETURNS TABLE(partition text, action text) LANGUAGE plpgsql AS $$
DECLARE
  part        record;
  p_start     timestamptz;
  p_end       timestamptz;
  cutoff      timestamptz := now() - ((retention_days + drop_padding_days) || ' days')::interval;
  is_safe     boolean;
BEGIN
  FOR part IN
    SELECT c.relname,
           pg_get_expr(c.relpartbound, c.oid) AS bound
    FROM pg_inherits inh
    JOIN pg_class c       ON c.oid = inh.inhrelid
    JOIN pg_class parent  ON parent.oid = inh.inhparent
    JOIN pg_namespace ns  ON ns.oid = parent.relnamespace
    WHERE ns.nspname = 'messaging' AND parent.relname = 'messages'
  LOOP
    -- derive [p_start, p_end) from the partition name suffix YYYY_MM
    p_start := to_date(right(part.relname, 7), 'YYYY_MM');
    p_end   := p_start + interval '1 month';
    CONTINUE WHEN p_end > cutoff;           -- not old enough (padding) → skip entirely

    -- GATE: anything in this partition that must be retained?
    EXECUTE format($q$
      SELECT NOT EXISTS (
        SELECT 1 FROM messaging.%I m
        JOIN public.tournaments t ON t.id = m.tournament_id
        WHERE t.completed_at IS NULL                                   -- in-progress
           OR t.completed_at > now() - ($1 || ' days')::interval       -- within retention
           OR m.legal_hold                                             -- legal hold
      )$q$, part.relname)
      INTO is_safe USING retention_days;

    IF is_safe THEN
      EXECUTE format('DROP TABLE messaging.%I',  part.relname);
      EXECUTE format('DROP TABLE messaging.message_recipients_%s', right(part.relname,7));
      partition := part.relname; action := 'DROPPED'; RETURN NEXT;
    ELSE
      EXECUTE format('ALTER TABLE messaging.messages DETACH PARTITION messaging.%I', part.relname);
      partition := part.relname; action := 'DETACHED'; RETURN NEXT;
    END IF;
  END LOOP;
END $$;
```

### 5.4 Scheduling & scripts
- **Worker jobs** (BullMQ repeatable, monthly): `messaging.partition.ensure` →
  `ensure_future_partitions(2)`; `messaging.partition.purge` → `purge_old_partitions()`.
  Implemented in `partition-processor.ts`, invoked via `partition-manager.ts`.
- **CLI** `scripts/messaging-partitions.js` (mirrors `scripts/e2e-setup.js`): `--ensure`,
  `--purge [--dry-run]` for ops/cron. `--dry-run` returns the would-be actions without DDL.
- **`pg_partman` alternative:** if the extension is approved, replace `ensure_*` with
  pg_partman config; keep the custom `purge_old_partitions` (the boundary gate is app-specific).

---

## 6. Test plan & coverage map

### 6.1 Unit (`src/__tests__/unit/`)
- `partition-manager.spec.ts` — month-suffix math, dry-run output, error propagation.
- `message-repository.spec.ts` — query shapes, fan-out INSERT builder, pagination cursor.
- `read-receipt-processor.spec.ts` — batching/coalescing, idempotency.

### 6.2 Integration (`src/__tests__/integration/`, transactional harness + factories)
- `messaging.spec.ts` — full API matrix: auth (401/403), validation, DM persist+emit,
  broadcast organizer-only, history pagination, mark-read.
- `messaging-partitions.spec.ts` — **partition routing** (June row → June partition);
  `ensure_future_partitions` idempotency; **boundary-safe purge cases**:
  1. tournament fully past retention+padding, no hold → **DROPPED**.
  2. month-spanning tournament still within retention → **DETACHED** (early month kept).
  3. tournament `legal_hold` → **DETACHED**.
  4. in-progress (`completed_at IS NULL`) tournament → **DETACHED**.

### 6.3 E2E (`packages/frontend/e2e/messaging.spec.ts`) — the §4 scenarios.

### 6.4 Harness caveat
Partition `CREATE`/`DROP`/`DETACH` is transactional DDL → rolls back inside the
`getTestPool()` savepoint harness, leaving row counts unchanged (§7). The purge tests assert
on the **function's returned action set** (`DROPPED`/`DETACHED`) and post-state within the
transaction — they must not rely on cross-suite persistence. Do **not** reintroduce
test-only branching in `db.ts`.

### 6.5 Hitting ≥ 85%
`collectCoverageFrom` already includes `src/**/*.ts`. New files (`messages.ts`,
`message-repository.ts`, `partition-manager.ts`, `partition-processor.ts`,
`read-receipt-processor.ts`) must each clear 85% — driven by the matrices above. Watch
**branch** coverage (auth/validation/gate branches are the usual miss). Pure-SQL functions are
covered indirectly via integration assertions on their effects.

---

## 7. Commit sequence (TDD history)

```
refactor: normalize timestamps to TIMESTAMPTZ (migration 031)    (Phase P — suite green before & after)
chore: raise api coverage 80→85; add messaging config            (Phase 0)
test: failing partition schema + completed_at tests              (Phase 1 red)
feat: messaging schema + tournaments.completed_at (032)          (Phase 1 green)
test: failing partition lifecycle + boundary-safe purge tests    (Phase 2 red)
feat: partition functions (032), manager, jobs, CLI              (Phase 2 green)
test: failing message-repository tests                           (Phase 3 red)
feat: message-repository + MessageFactory                        (Phase 3 green)
test: failing messaging API + SSE tests                          (Phase 4 red)
feat: messaging routes + SSE message.created emit                (Phase 4 green)
test: failing read-receipt batching tests                        (Phase 5 red)
feat: batched read-receipt processor                             (Phase 5 green)
test: messaging e2e scenarios + useMessages tests                (Phase 6 red)
feat: messaging frontend (hook, store, SSE, panel)               (Phase 6 green)
test: harden messaging coverage to ≥85%                          (Phase 7)
```

---

## 8. Risks & open decisions
- **Product scope (A1/A2)** — DM vs broadcast vs both; DM read-receipt visibility. Resolve at Phase 0.
- **DETACHed partitions accumulate** — need an ops step to cold-archive/finally-drop them once
  their hold/retention clears (a follow-up `purge --reattach-and-recheck` pass).
- **Purge gate cost** — the `NOT EXISTS` scan reads the partition; fine as a monthly admin op.
  If it grows costly, add a `messaging.partition_summary(min/max completed_at, has_hold)`
  maintained table. Defer until measured (§2).
- **`completed_at` — CONFIRMED MISSING.** `public.tournaments` has no completion timestamp
  (only `status`). Migration `032` adds `completed_at TIMESTAMPTZ` (clean, no backfill — Phase P
  normalized the table and there are no records) and wires it into the status→completed
  transition; without it the retention gate has nothing to anchor on. Verify the exact "done"
  `status` value before implementing.
- **Phase P blast radius.** Normalizing ~13 columns across 10 tables touches more than messaging.
  Risk is low (no data + explicit `AT TIME ZONE 'UTC'`), but the regression check (full unit + e2e
  suite green after) is the gate. Watch for any test/UI that asserted naive/local-wall-clock behavior.
- **Pulling Phase 7 forward** — confirm this is intended vs keeping messaging deferred.
```
