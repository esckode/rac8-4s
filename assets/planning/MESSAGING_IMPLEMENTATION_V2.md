# Player Messaging — Implementation Plan V2
## Foundation-first, TDD-driven build of the §17 multi-instance design

**Date:** 2026-06-23
**Status:** 📋 PLAN — not started.
**Design source of truth:** [`MESSAGING_DESIGN.md`](./MESSAGING_DESIGN.md) §16–§17 (esp. the §17.0 diagram and the R-17.x requirements).
**Reference impl (bus):** branch `spike/redis-pubsub-bus` (`RedisBroadcastBus`, `server.ts` env-selection, `scripts/two-instance-sse-test.mjs`).

---

## 0. Scope, constraints & global rules

### What this builds
The §17 forward design: a **distributed (multi-instance) messaging platform** — Redis-backed SSE bus,
BullMQ worker tier, shared token store / rate-limit / cache, the dev 2-instance topology — **then** the
product gaps (offline notify, sender names, thread model, read-receipt visibility). **Foundation first.**

### Hard rules (apply to EVERY task)
1. **TDD-first (CLAUDE.md §4, §11):** write/extend **unit + integration + e2e tests AND scenario docs
   (`e2e-scenarios.md`) FIRST**, confirm they fail for the right reason, **commit the red tests
   separately** (`test:`), then implement to green (`feat:`/`fix:`). Behavior-preserving refactors use
   green-before/green-after (no red), committed as `refactor:`.
2. **Run ALL tests after each task** (the verification gate — non-negotiable, per the user):
   - `npx jest` **from repo root (ALL projects** — core-logic, api, worker, frontend, shared). Not the
     api project alone. (Lesson from V1: a per-project run missed a cross-package failure.)
   - `npm run type-check` clean.
   - **e2e** for the affected area, run with `--retries=2`; **foundation tasks also run the
     multi-instance e2e suite** (§2). The `StandingsTable.virtualization` perf spec can flake under
     load — re-run in isolation to confirm the known flake, don't attribute it to the task.
   - A task is **not done** until the full unit suite + relevant e2e are green and verified *by running
     them*, not by trusting a report.
3. **Coverage ≥ 85%** stays enforced (the gate raised in Phase 7). New code carries tests to keep it.
4. **Tests/CI stay single-process + in-memory** — the default `InMemoryJobQueue` / in-process
   `BroadcastBus` / `InMemoryTokenStore` paths must keep working with **no Redis dependency** in unit
   tests. Multi-instance behavior is validated by a **dedicated 2-instance e2e harness** (§2), not by
   forcing Redis into the unit suite.
5. **Env-selected backends:** every shared-state component is interface-based with two
   implementations — in-memory (dev/test default) and Redis (prod / dev-distributed), chosen by env.
6. **Branch/commit:** branch off `main` (`feat/messaging-v2`); one logical change per commit; trailers
   per CLAUDE.md §11.

### Conventions to mirror
Migrations `db/migrations/034+`; `getLogger` `noun.verb` logging (IDs only, never message bodies);
the transactional test harness `getTestPool()`; factories; route ordering §10; `TIMESTAMPTZ` only.

---

## PHASE V1 — Redis foundation & env-selected backends

### V1.1 — Redis config + connectivity + health
- **RED:** unit tests for config parsing (`REDIS_URL`, `JOB_QUEUE`, `SSE_BUS` defaults + overrides); a
  Redis connectivity helper test (fail-fast when down); `/health` reports `redis: connected|down`.
- **GREEN:** add `redis` to `docker-compose`; config fields; a shared ioredis connection factory
  (fail-fast options); extend `/health`.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### V1.2 — Redis pub/sub bus (re-land the spike, TDD-first) — R-17.3
- **RED:** `IBroadcastBus` interface tests; `RedisBroadcastBus` unit spec (local-via-redis, cross-node
  between two bus instances, isolation — port from `spike/redis-pubsub-bus`); env-selection test
  (`SSE_BUS=memory|redis`); bus-connectivity health-signal test.
- **GREEN:** introduce `IBroadcastBus`; in-process `BroadcastBus` + `RedisBroadcastBus` both implement
  it; `server.ts` env-selects; health signal on `/health`. (Tests default to in-memory.)
- **Verify gate** (unit + the redis bus spec when Redis present). **Commit:** `test:` → `feat:`.

### V1.3 — BullMQ queue backend + worker entrypoint — R-17.1.1/.3
- **RED:** `JobQueue` contract tests run against BOTH `InMemoryJobQueue` and `BullMQJobQueue`
  (add/consume, dedup by jobId, retry/backoff); a worker-entrypoint test that registers processors and
  processes one enqueued job end-to-end (Redis-gated, skips without Redis).
- **GREEN:** wire `BullMQJobQueue` selection (`JOB_QUEUE=bullmq`); add a runnable worker entrypoint
  (`packages/worker`) + `dev:worker` script that registers existing processors (read-receipt flush,
  partition ensure/purge). Give the read-receipt flush a real consumer.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### V1.4 — Redis-backed token store — R-17.10.1 🔴
- **RED:** `TokenStore` contract tests against BOTH `InMemoryTokenStore` and `RedisTokenStore`
  (put/get/invalidate, TTL expiry); a **cross-connection** test (token written via one client is
  readable via another — simulating cross-instance); magic-link + player-session round-trip.
- **GREEN:** `RedisTokenStore implements TokenStore` (TTL-native); env-select in `server.ts`. JWT path
  unchanged.
- **Verify gate.** **Commit:** `test:` → `feat:`.

---

## PHASE V2 — Distributed dev topology & multi-instance validation

### V2.1 — Partition scheduling + maintenance observability — R-17.1.4/.5/.6/.7
- **RED:** unit/integration: repeatable-job registration (monthly cron) is idempotent across N workers
  (dedup by repeat key); **boot-time ensure** creates current+3-months; `messaging.partition_maintenance_runs`
  audit rows written with counts; `partition.coverage.low|critical` health signal fires when the
  furthest partition is within threshold; purge `--dry-run` flag path.
- **GREEN:** migration `034` (audit table + `reclaim_detached_partitions()`); schedule repeatable jobs +
  boot ensure in the worker; wire coverage signal into `/health`; observability logs.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### V2.2 — Dev distributed topology + multi-instance e2e harness — R-17.10.5
- **RED (scenario + harness):** add a **`messaging-multi-instance` e2e project** that boots the
  distributed stack (compose: `redis` + LB (nginx/caddy) over `api@:3001`/`api@:3002` + `worker`), with
  Playwright hitting the **LB**. Scenarios (red until topology exists):
  1. **Cross-node SSE:** client connected via the LB receives a `message.created` emitted by an action
     that lands on the *other* instance (promote `two-instance-sse-test.mjs` into a real Playwright spec).
  2. **Auth across instances:** log in (magic-link/player session) and perform actions across
     round-robined requests — **no random 401s** (proves R-17.10.1).
  3. **Job processing:** a read-receipt enqueued via the API is flushed by the worker (unread clears).
- **GREEN:** `docker-compose` LB service + 2 API + worker; `Vite proxy → LB`; npm scripts
  (`dev:distributed`); Playwright config for the new project (against the LB, non-sticky).
- **Verify gate** — **this is where the multi-instance e2e suite first goes green**; also full unit + the
  existing single-instance e2e. **Commit:** `test:` → `feat:`.

### V2.3 — Redis-backed rate limiting — R-17.10.2
- **RED:** rate-limit contract tests against in-memory AND Redis stores; **cross-instance** test (limit
  shared across two clients); e2e (multi-instance): a limit enforced regardless of which instance serves.
- **GREEN:** Redis-backed counter store behind the existing rate-limit middleware; env-select.
- **Verify gate** (incl. multi-instance e2e). **Commit:** `test:` → `feat:`.

### V2.4 — Standings cache consistency (bus-driven invalidation) — R-17.10.3
- **RED:** unit: a `standings.invalidate` published on the bus drops the cached group on *all*
  subscribers; e2e (multi-instance): submit a score on instance A → standings on instance B are fresh
  (no stale read).
- **GREEN:** publish `standings.invalidate` over the §17.3 bus on score writes; each instance drops the
  group from its `InMemoryStandingsCache` on receipt.
- **Verify gate** (incl. multi-instance e2e). **Commit:** `test:` → `feat:`.

> **End of Phase V2: the distributed foundation is live and proven by the multi-instance e2e suite.**
> All subsequent product work is developed/tested against 2 instances.

---

## PHASE V3 — Offline reach: notification fallback — §17.2

### V3.1 — `messaging.notify` worker job
- **RED:** unit: coalescing (N messages/recipient → one digest), debounce (burst → one email), grace
  window, "offline = unread after grace" selection (`read_at IS NULL`); integration: a broadcast
  enqueues notify jobs; e2e (mock email adapter): an offline participant receives one digest email,
  a participant who read it does not.
- **GREEN:** `messaging.notify` job + processor (worker), enqueued after persist; uses `email-adapter`;
  push is a later swap behind the same job.
- **Verify gate.** **Commit:** `test:` → `feat:`.

---

## PHASE V4 — Sender attribution — §17.5

### V4.1 — Sender name in payload + history + UI
- **RED:** integration: `message.created` payload + `GET history` include sender display name (resolved
  from `players`, cached); frontend unit: a message card renders **"Name · time"**; e2e: a received
  message shows the sender's name (two distinct senders distinguishable).
- **GREEN:** add sender-name resolution (cached reference data per §10) to the route/history payload;
  render in `MessagePanel`.
- **Verify gate.** **Commit:** `test:` → `feat:`.

---

## PHASE V5 — Targeted messaging + thread model — §17.4

### V5.1 — Backend: thread-grouped history + targeting
- **RED:** integration: `getHistory` grouped/filterable by thread (announcements vs the viewer's DM
  threads vs match/dispute threads); sending a DM with `recipientPlayerId`/`matchId` is scoped
  correctly; a player may only DM a **matched opponent** (authz), not arbitrary participants.
- **GREEN:** history grouping params; opponent-only DM authorization; dispute-thread (player↔organizer,
  `match_id`, `legal_hold`) support.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### V5.2 — Frontend: channels + recipient targeting UI
- **RED (scenarios + e2e):** add `e2e-scenarios.md` "Feature: Messaging — threads" + Playwright:
  Announcements channel (read-only for players); **"Message opponent"** from a match card opens the
  match thread and a DM reaches only the opponent; a dispute thread to the organizer; arbitrary-DM is
  not offered. Frontend unit tests for the thread list / channel switcher.
- **GREEN:** thread-list + message-view UI, channel switcher, match-card "Message opponent" affordance,
  recipient-scoped compose (passes `recipientPlayerId`/`matchId`). `data-testid`s in `e2e/config.ts`.
- **Verify gate** (incl. multi-instance e2e). **Commit:** `test:` → `feat:`.

---

## PHASE V6 — Read-receipt visibility — §17.6

### V6.1 — Organizer ack counts + opt-in DM "seen"
- **RED:** integration: broadcast exposes an **"X of N read"** count to the organizer; DM "seen" is
  surfaced to the sender **only when opt-in** (off by default); frontend unit + e2e for both.
- **GREEN:** read-count aggregation endpoint/payload; organizer ack-count UI; opt-in DM seen indicator.
- **Verify gate.** **Commit:** `test:` → `feat:`.

---

## PHASE V7 — As demand appears (deferred) — §17.7, §17.9
- **§17.9 messaging feature analytics** (messages/day, broadcasts, unread rates, per-partition storage)
  — own task, TDD-first, feeding the analytics pipeline.
- **§17.7** `delivered_at`/`acknowledged_at` (+ "Acknowledge" button), attachments (object storage),
  Discord linkout — each its own task when a concrete need arrives.

---

## Test strategy

- **Unit (jest):** every new module/branch; contract tests run shared suites against BOTH in-memory and
  Redis implementations (queue, bus, token store, rate-limit) so behavior is identical.
- **Integration (jest, transactional harness):** routes, repositories, jobs against Postgres; assert on
  bus emits via injected mock or the in-process bus.
- **E2E (Playwright):**
  - **Single-instance** suite (existing) — runs as today against one API.
  - **Multi-instance** suite (new, §V2.2) — boots the distributed stack and validates cross-node SSE,
    cross-instance auth, job processing, rate-limit, cache consistency, and (later) the thread-model UX.
    Run with `--retries=2`.
- **Coverage:** keep api global ≥ 85; new shared-infra files ≥ 85.

## Per-task Definition of Done
1. `test:` commit (failing) precedes `feat:` commit. 2. `npx jest` (ALL projects) green — run & shown.
3. `npm run type-check` clean. 4. Relevant e2e green with retries (foundation tasks: the multi-instance
suite too). 5. Coverage ≥ 85. 6. No regressions; flakes confirmed-flaky in isolation, not attributed to
the task.

## Sequencing & risks
- **Order is foundation-first** (V1 → V2 → V3 → V4 → V5 → V6 → V7); each phase depends on the prior.
- **Biggest risk:** the multi-instance e2e harness (V2.2) — bringing up LB+2 API+worker+Redis in CI is
  real test infra. Mitigate by making it a *separate* Playwright project that the foundation tasks gate
  on, while the main suite stays single-instance.
- **Cost:** prod ElastiCache (multi-AZ) + ASG (R-17.1.2/.10.4) — infra/cost owners must sign off.
- **Idempotency** of every worker handler is load-bearing (at-least-once under failure) — assert it.
