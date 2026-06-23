# Player Messaging Design
## Architecture & Feasibility Analysis

**Date:** 2026-06-22
**Status:** 📋 DESIGN ONLY — Phase 7 (deferred). No implementation in repo.

---

## Executive Summary

This document captures the design exploration for adding player-to-player messaging
to RAC8-4S. The conclusion is **build it as a tournament-scoped, functional
communication feature, reusing existing infrastructure — but not yet.** Per
`rac8-4s-HL.md`, in-app messaging is a **Phase 7** enhancement, deliberately deferred;
the realtime plumbing was intentionally laid for it ("infrastructure ready").

The through-line of every decision below: **reuse what's built (SSE + `BroadcastBus`,
Postgres, Redis worker, durable player identity), keep it in-process and
tournament-scoped, persist-then-broadcast, and let *measured* demand — not anticipated
asymmetry — drive every step toward more infrastructure.**

---

## 1. Does messaging fit the app?

Yes, directionally. The HL doc lists in-app messaging under **Known Limitations →
Communication** ("No in-app messaging (infrastructure ready)") and again under
**Phase 7: Advanced Features**. So it is:

- **Anticipated, not bolted on** — the SSE + `BroadcastBus` realtime layer was built
  with messaging in mind.
- **A current *limitation*, not a current feature** — the app is intentionally a
  tournament-management tool today.
- **Intended as *functional* communication, not social** — grouped with push
  notifications and score-dispute resolution. The intended forms are **organizer→participant
  announcements**, **match/opponent coordination**, and an **admin/dispute channel** —
  not open-ended social DMs.

## 2. Market validation

- All-in-one pickleball/league apps (MatchTime, SportNinja, Swish, Matchspace) ship
  native messaging; bracket-engine tools (Challonge, Toornament) skip it and defer to
  **Discord**.
- Where built, it is the three functional forms above. **Battlefy is the best template**:
  match chat (opponent coordination) + private admin chat (disputes/support).
- **Nobody ships it as a standalone reusable service.**

## 3. Discord vs. in-built

**Build the functional pieces in-house.** Discord wins on raw capability and zero build
cost, but the **guest/magic-link identity model is the dealbreaker**: email-only
participants would have to onboard to a second platform, and you lose tournament context,
your own analytics/audit trail, and control. Optionally link out to Discord for richer
community/voice. (Challonge/Toornament→Discord is a valid position for a *bracket-engine*;
rac8-4s is positioned as all-in-one, where messaging is closer to table-stakes.)

## 4. Bundled vs. standalone — build shape

Build as an **in-process `packages/messaging` module** in the monorepo, **not** a separate
deployable service. Reuse the existing **SSE + `BroadcastBus`** for delivery (no
WebSockets/Pusher/Ably). Extract to a service only if a *committed* second app or genuine
cross-app messaging appears — extract on demonstrated need, never speculatively (CLAUDE.md §2).

## 5. Transport vs. storage

The `BroadcastBus` is **ephemeral fan-out, not storage** — an in-memory `EventEmitter`
that forgets. **Rule: persist first, then broadcast.**

- **Postgres = system of record** (durable). Dedicated `messaging` schema (alongside
  `public`/`auth`).
- **Redis pub/sub = cross-instance relay** only (so an SSE client on api-node-2 receives a
  message emitted on api-node-1). Redis already present via the worker (ioredis/BullMQ).
  **Never the record.**
- **SSE = last mile** to the browser.

> **Horizontal-scaling gap:** `BroadcastBus` is currently an in-process `EventEmitter`,
> single-instance only. Messaging across >1 api instance requires backing it with **Redis
> pub/sub**. Worth doing for messaging specifically (dropped chat is more visible than a
> stale standings number).

## 6. Data model

```sql
-- messaging.messages  — content, written once (DM or broadcast)
id                  UUID         -- part of PK (see partitioning)
tournament_id       UUID NOT NULL
sender_player_id    UUID NOT NULL          -- durable player_id (works for guests + accounts)
recipient_player_id UUID                   -- NULL = broadcast
match_id            UUID                   -- NULL unless match-scoped (coordination/dispute)
body                TEXT NOT NULL
created_at          TIMESTAMPTZ NOT NULL   -- MUST be TIMESTAMPTZ (see deadline bug, migration 025)
legal_hold          BOOLEAN NOT NULL DEFAULT false

-- messaging.message_recipients — per-(message, player) state. A DM is a broadcast-to-one,
-- so per-player state lives HERE for ALL message types (do not split state between the
-- message row and this table).
message_id          UUID NOT NULL
player_id           UUID NOT NULL
read_at             TIMESTAMPTZ            -- track now; unread badges
-- delivered_at / acknowledged_at: add only when a feature needs them (CLAUDE.md §2)
```

Notes:
- Keyed on **durable `player_id`** — a magic-link guest who reads a message resolves to a
  stable player, so history/read-state persist across sessions.
- Nullable `recipient_player_id` + `match_id` encode the three functional forms in one table.
- **Authz differs by type:** anyone may DM; **only the organizer** may broadcast to a
  tournament. Log `message.sent` / `announcement.sent` with IDs only — never the body
  (CLAUDE.md §6).

## 7. Broadcast

- **Delivery is the bus's native mode** — already keyed by `tournamentId`. The hard part is
  **offline reach** ("round delayed 20 min"): connected → SSE; reconnecting → backfill via
  history query; offline → fall back to email/push via the worker + `email-adapter`.
- **Storage default: single-row announcement feed** (`recipient_player_id = NULL`, everyone
  reads via the tournament query). Add per-recipient state (`message_recipients`) **only**
  when read/ack tracking is actually needed. **Never fan-out the body on write.**

## 8. Read receipts

- Track **`read_at` now** (unread badges); add `delivered_at` / `acknowledged_at` only when
  a concrete feature needs them.
- Per-player read state is **write-amplifying** — **batch the writes via the worker** rather
  than one synchronous UPDATE per message-open.
- Read receipts on **player↔player DMs are a privacy/product choice** — fine for organizer
  broadcasts; consider off/opt-in for DMs.

## 9. Same DB as tournament data?

**Yes — same database, separate `messaging` schema. Not a separate database.**
MVCC means read-heavy (tournament) and write-heavy (messaging) workloads coexist without
lock contention; splitting would cost referential integrity, transactional consistency, and
operational simplicity for a scaling problem you don't have. **Isolation ladder** (climb only
as measured load demands): separate schema → tune/batch the churn table → read replica →
separate DB. **Watch one signal:** autovacuum/bloat on `message_recipients`.

## 10. Caching

Order of wins: (1) **stop re-fetching client-side** — fetch history once, let SSE stream
deltas into the React Query cache; (2) cache *immutable* reference data (message bodies,
sender display info); (3) **maintain** unread counts as **Redis counters** (INCR/reset)
rather than caching-and-invalidating a `COUNT(*)`. Cache the slow-changing, maintain the
fast-changing, let SSE be the invalidation signal. No speculative server cache.

## 11. Performance: batching

Batch the **bookkeeping**, never the **delivery**.
- **Batch:** read-receipt UPDATEs (bulk, via worker), broadcast fan-out INSERTs (one
  multi-row INSERT), offline notifications (queue + coalesce), sender lookups (N+1 → `IN`-list),
  client read-acks (debounce), Redis counter ops (pipeline).
- **Never batch:** live message delivery (latency-sensitive — emit per message immediately)
  or the durable persist of the message itself (no in-memory buffering — crash-loss).

## 12. Kafka?

**No, not for live delivery.** Kafka can't reach the browser (last mile is still SSE), and
the only hop it could serve (inter-node relay) is already better served by **Redis pub/sub**
at lower latency and far lower ops cost. Kafka's strengths (durable replayable log,
partitioned high-throughput, stream processing) are either already covered by Postgres or
are scale this app doesn't have. Kafka could earn a place later behind an **analytics /
event-sourcing** pipeline — that is offline event processing, not chat.

## 13. Storage requirements

Storage is dominated by **`message_recipients`** (fan-out multiplier: a broadcast to N
players = N rows), and by **MVCC bloat** from read-receipt churn — *not* by message bodies.
Also budget: index storage, and a **write-heavier WAL/backup profile** than tournament data.

- **Retention policy is the key lever** (see §14) — without it, `message_recipients` grows
  unbounded forever.
- **Text-only for the MVP** keeps everything in Postgres. Attachments would require **object
  storage (S3/GCS)** + CDN + lifecycle — a separate, later decision.

## 14. Retention strategy

**Anchor on the tournament lifecycle, not the calendar.** Retention = `completed_at + grace`,
not "messages older than N days."

**Baseline rule (start here):** purge messages + read-receipts **90 days after the tournament
completes**, with two non-negotiable exceptions:
1. **Legal/dispute hold** — a `legal_hold` flag exempts threads under an open/appealed dispute.
2. **Erasure on account deletion** (PII/GDPR) — anonymize/erase a player's message content on
   account deletion, except under legal hold.

Refine to per-type tiers (receipts shortest → DMs → broadcasts → disputes longest) **only if**
a real value gradient appears.

**Mechanism:** make purge cheap, not bloaty — prefer **partition-drop over mass DELETE**
(see §15). Schedule via the worker (BullMQ); purge `message_recipients` first (it drives
storage + bloat).

## 15. Partitioning (LOCKED DECISION)

**Monthly `RANGE(created_at)` partitioning on `messages` and `message_recipients` (aligned),
with boundary safety via a padded, gated drop.**

Decision rationale:
- **Time vs tournament:** for *many short tournaments* (this app's profile), **time wins** —
  bounded partition count + predictable pre-creation. Tournament-LIST gives exact retention +
  perfect pruning but **unbounded partition count** + reactive per-tournament DDL (disqualifying
  here). Tournament-HASH is bounded but **gives no retention benefit** (mixed-era buckets can't
  be dropped). **Exact-per-tournament retention is incompatible with bounded partition count.**
- **No sub-partitioning of time × tournament-LIST** — sub-partitioning *multiplies* counts and
  amplifies the LIST explosion. The only sane composite is time → HASH (bounded × bounded), and
  even that is more than this workload warrants. You don't need tournament *partitioning* for
  locality — a `tournament_id` index within time-partitions already makes tournament-scoped
  queries fast.

```sql
CREATE TABLE messaging.messages (
  id            UUID DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  sender_player_id    UUID NOT NULL,
  recipient_player_id UUID,
  match_id      UUID,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  legal_hold    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (id, created_at)                  -- partition key must be in the PK
) PARTITION BY RANGE (created_at);

CREATE TABLE messaging.message_recipients (
  message_id         UUID NOT NULL,
  message_created_at TIMESTAMPTZ NOT NULL,      -- denormalized to satisfy the FK
  player_id          UUID NOT NULL,
  read_at            TIMESTAMPTZ,
  PRIMARY KEY (message_id, message_created_at, player_id),
  FOREIGN KEY (message_id, message_created_at)
    REFERENCES messaging.messages (id, created_at)
) PARTITION BY RANGE (message_created_at);       -- aligned to messages

-- Indexes: messages (tournament_id, created_at); message_recipients (player_id, read_at)
-- Aligned monthly children: messages_YYYY_MM  <->  message_recipients_YYYY_MM
```

**Automation:** pre-create **+2 months** ahead (so inserts never hit a missing partition);
via `pg_partman` if the extension is available, else a worker monthly cron.

### Boundary handling (tournament crossing a monthly boundary)

A tournament running e.g. June 28 → July 5 has its rows split across `*_2026_06` and
`*_2026_07` by each row's own `created_at`. Inserts/queries are correct automatically
(half-open ranges + `TIMESTAMPTZ`; queries merge across partitions in order). The risk is
**retention**: a calendar-month partition ages out independently of the tournament lifecycle,
so a naive drop could truncate a still-active/retained tournament's early messages.

**Retention job (boundary-safe):**
```
PARAMS: RETENTION_DAYS = 90 (after tournament completion)
        DROP_PADDING   = max_tournament_duration + buffer   (≈ keep ~4 months)

For each partition older than (RETENTION_DAYS + DROP_PADDING):
  1. GATE: does it contain rows for any tournament that is
           (a) still within completed_at + RETENTION_DAYS, or
           (b) legal_hold / under open dispute?
  2. If clear      -> DROP messages partition AND its aligned recipients partition.
  3. If any remain -> DETACH (keep cold) instead of DROP; retry next cycle.
```
This combines: **padded threshold** (never drop a boundary partition on the early-month clock),
**gated detach-not-drop** (preserve still-retained/held tournaments), and **aligned recipients**
(read-state never orphans from its messages).

### Deferred-complexity note (CLAUDE.md §2)
Partitioning machinery is only worth it once `message_recipients` is genuinely large. The
schema is designed so partitioning + retention are real from day one, but the same schema also
works **unpartitioned with a batched `DELETE` retention job** if shipping lean first — keeping
`created_at` non-null + indexed preserves the conversion path.

---

## Deferred status & next steps

- **Status:** design only. **Do not create `packages/messaging` until the feature is scheduled.**
- **When built (TDD per CLAUDE.md §4/§11):** failing tests (unit + e2e) + migration first as
  their own commit, then implementation. Add a `packages/messaging/README.md` ("how to use the
  module") that links back to this design doc ("why").
- **Open product decisions:** tournament group chat vs 1:1 DMs vs both; read-receipt visibility
  on DMs; whether to link out to Discord for community/voice.
