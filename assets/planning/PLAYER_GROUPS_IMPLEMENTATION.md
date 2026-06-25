# Player Groups & Availability — Implementation Plan
## TDD-first build of the community layer (durable groups, chat, polls, casual tournaments)

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-25
**Status:** 📋 PLAN — not started.
**Design source of truth:** [`PLAYER_GROUPS_DESIGN.md`](./PLAYER_GROUPS_DESIGN.md) — esp. **§11** (the 14 grilled
decisions) and **§12** (CCPA/DSR + 18+ age gate). Data model in §7.
**Foundation dependency:** the **`conversations` abstraction** from
[`MESSAGING_IMPLEMENTATION_V2.md`](./MESSAGING_IMPLEMENTATION_V2.md) V1.0 (migration `034`, already on `main`).
This plan **layers on it** and is the consumer that justifies `messages.type` + `group_messages` (declared
Player-Groups scope by V1.0's scope guard).

---

## 0. Scope, constraints & global rules

### What this builds
The community track, in dependency order: **compliance/identity prerequisites → group entity & membership →
durable group conversation & chat → availability polls → casual tournament engine & group-launch → DSR
orchestration (pre-GA)**. Two parts touch the **core tournament engine** (casual mode + social-mixer
doubles, §11.10–11.13) and one is **platform-wide** (compliance, §12) — both are carried here because this
track is what forces them. **Erasure is decomposed** (rule §0.5): each durable store ships its own anonymize
primitive + contract test when it lands; G5 only orchestrates.

### Hard rules (apply to EVERY task) — mirror MESSAGING_IMPLEMENTATION_V2 §0
1. **TDD-first (CLAUDE.md §4, §11):** write/extend **unit + integration + e2e tests AND scenario docs
   (`e2e-scenarios.md`) FIRST**, confirm they fail for the right reason, **commit the red tests separately**
   (`test:`), then implement to green (`feat:`/`fix:`). Behavior-preserving refactors: green-before/
   green-after, committed `refactor:`.
2. **Run ALL tests after each task** (non-negotiable verification gate):
   - `npx jest` **from repo root (ALL projects** — core-logic, api, worker, frontend, shared).
   - `npm run type-check` clean.
   - **e2e** for the affected area with `--retries=2`. A task is **not done** until the full unit suite +
     relevant e2e are green **by running them**, not by trusting a report.
3. **Coverage ≥ 85%** (`branches/functions/lines/statements`, enforced in `packages/api/jest.config.js`).
   Every new module/branch carries tests to hold the gate. **New core-engine code (casual mode, mixer) and
   the erasure primitives + DSR orchestrator must each be ≥ 85% on their own files** — they are
   correctness- and legal-critical.
4. **Tests/CI stay single-process + in-memory** — no new Redis/external dependency in the unit suite. Reuse
   the env-selected backends from V2 (bus, queue, token store).
5. **Anonymization-ready durable tables + per-store erasure primitive (§12) — DECOMPOSED.** Every durable
   table that attributes data to a player uses a **nullable/replaceable `player_id` + a denormalized,
   tombstone-able display name**, enforced **from the first migration** (irreversible if baked wrong). To
   avoid validating erasability only at the end (the waterfall trap), **each durable store ships its own
   anonymize primitive + contract test in the same task that creates it** (G2.1, G3.1, G4.4): a migration
   test asserts `player_id` is nullable + a name-snapshot column exists, **and** a contract test proves
   `anonymize<Store>For(playerId)` turns that player's rows into "Former player" while **leaving
   co-participants' rows untouched**. **G5 then only composes these already-proven primitives** (fan-out +
   identity verification + export + operator entrypoint) — the hard, schema-coupled work lives next to the
   schema, not at the end. **Real-PII environments** (beta/dogfood/staging with real emails) are gated on
   the relevant primitive existing for every store they populate.
6. **Branch/commit:** branch off `main` (`feat/player-groups`); one logical change per commit; trailers per
   CLAUDE.md §11. **TDD history:** red `test:` commit precedes the `feat:` commit.

### Conventions to mirror
Migrations `db/migrations/036+` (034/035 are taken); `getLogger` `noun.verb` logging (**IDs only, never
message bodies, never PII beyond IDs** — CLAUDE.md §6); the transactional test harness `getTestPool()` (no
autocommit — CLAUDE.md §7); factories under `__tests__/factories`; **route ordering §10** (static before
`/:id`); **`TIMESTAMPTZ` only** (CLAUDE.md §7); e2e conventions — seed own data via fixtures, select by
`data-testid` + `e2e/config.ts`, unique test data, authenticate before protected routes.

### Reconciliation carried by this plan
- **R-A (casual mode)** — backlog item. Casual mode overrides 5 documented scheduled-mode requirements;
  **resolve the source-of-truth docs + tests inside Phase G4** (task **G4.7**), not as a standalone task.
- **§6.0 two axes** — `mode {scheduled|casual}` and `visibility {public|unlisted}` are orthogonal; the
  `unlisted` browse-filter carve-out (HL:1140) is part of G4.

---

## PHASE G0 — Compliance & identity prerequisites (§12.2)
*Must precede any group onboarding: groups create players via invite-accept, and the age gate sits at the
universal player boundary. DSR (§12.1) is **decomposed** (rule §0.5): each store's anonymize primitive +
contract test land with that store (G2.1/G3.1/G4.4); the thin **orchestrator** is G5.*

### G0.1 — 18+ age gate at the universal player boundary
- **RED:** unit — `findOrCreatePlayerByEmail` (`packages/api/src/db.ts:363`) rejects creation without a
  valid 18+ attestation and **accepts** with one; under-18 DOB → hard reject (no row written); store
  **derived** `is_adult` + `age_attested_at` + `policy_version`, assert **no raw DOB column/value persisted**
  (data-minimization). Integration — all **three** entry paths inherit the gate: public tournament
  registration (`routes/tournaments.ts:1252`), account signup (`routes/auth.ts:143`), and (stub for now)
  the group-invite accept path. e2e — onboarding shows a **neutral DOB screen** (not an "I am 18 ✓" box);
  under-18 is blocked with a clear message; 18+ proceeds.
- **GREEN:** migration `036` — `players.is_adult BOOLEAN`, `age_attested_at TIMESTAMPTZ`,
  `policy_version TEXT` (no DOB column). Add attestation params to `findOrCreatePlayerByEmail`; compute
  18+ from a transiently-submitted DOB, persist only the derived flag; reject under-18. Neutral DOB screen
  in onboarding UI; add 18+ requirement to ToS/privacy copy. **Backfill:** pre-gate players get a one-time
  attestation prompt at next login (block group features until attested) — flag-driven, no destructive
  migration.
- **Verify gate.** **Commit:** `test:` → `feat:`.

---

## PHASE G1 — Group entity & membership (§11.1–11.5, design §2)

### G1.1 — Schema: groups + group_members (multi-owner)
- **RED:** migration test — `groups(id, name, created_by, default_match_format{singles|doubles}, created_at)`
  and `group_members(group_id, player_id, role{owner|member}, notify_level, joined_at)` exist with correct
  constraints; **many-to-many** (a player in multiple groups); **multiple `role=owner` rows allowed** for one
  group (assert no unique-owner constraint); `default_match_format` defaults `singles`; `notify_level`
  defaults `mentions_polls`.
- **GREEN:** migration `037` (group tables). Repository skeleton (`GroupRepository`) with `getLogger`.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G1.2 — Membership lifecycle: create / promote / demote / kick / leave / auto-transfer (§11.1–11.3)
- **RED:** integration (transactional harness) —
  1. create group → creator becomes `role=owner`; `created_by` set.
  2. **multi-owner:** owner promotes a member → two owner rows; any owner may promote/demote/kick **any**
     owner or member (§11.3).
  3. **≥1-owner invariant:** demoting/kicking/leaving the **last** owner is blocked *unless* it triggers
     auto-transfer.
  4. **last-owner leave → auto-transfer** ownership to the **longest-tenured remaining member** (order by
     `joined_at`); group + history untouched.
  5. **self-leave** always allowed (non-last-owner / member); on exit the row is removed and access is lost.
  6. **kick** is owner-only; a member cannot kick.
  All actions log `group.member.promoted|demoted|removed`, `group.ownership.transferred` (IDs only).
- **GREEN:** `GroupRepository` membership methods using `this.pool.connect()` + `BEGIN/COMMIT/ROLLBACK`
  (savepoint-safe per CLAUDE.md §7); routes with authz; structured logs at `info` on each state change.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G1.3 — Invite flow: email-bound single-use magic link (§11.5)
- **RED:** unit — extend `MagicLinkPayload` with `groupId` (a `type: group-invite` variant) in
  `packages/api/src/auth/magic-link.ts`; token is single-use (consumed on validate) and email-bound.
  Integration — **owner-only** invite creation; accepting a valid token **creates/links the player via the
  G0.1-gated `findOrCreatePlayerByEmail`** (age gate enforced here too) and adds a `member` row; an invalid/
  reused token is rejected; **no shareable/group-wide link** path exists. e2e — owner invites by email →
  invitee follows the emailed link → email verification → lands in the group as a member.
- **GREEN:** group-invite token mint/validate; owner-only invite route; accept route wiring the age gate +
  membership insert; email via the existing adapter (subject/body, IDs only in logs).
- **Verify gate.** **Commit:** `test:` → `feat:`.

---

## PHASE G2 — Group conversation, chat & moderation (design §3, §11.2, §11.6, §11.7)

### G2.1 — Group conversation + durable `group_messages` (anonymization-ready)
- **RED:** migration test — a group gets a `conversations` row `type=group` (reusing migration 034's table);
  `messages.type` widened to `{text|poll|system|announcement}`; durable
  `messaging.group_messages(... conversation_id, player_id NULLABLE, sender_name_snapshot, created_at ...)`
  indexed by `(conversation_id, created_at)`; **rule §0.5 assertions** (nullable `player_id` +
  tombstone-able name); **retention test:** group conversations are **exempt from the completion-anchored
  purge** (§14/§15) — a purge run leaves group rows intact.
  **Per-store erasure primitive (§0.5):** a contract test proves `anonymizeGroupMessagesFor(playerId)`
  tombstones that player's messages ("Former player", body/attribution cleared) while **co-authors' messages
  in the same conversation are untouched**, and is idempotent on re-run.
- **GREEN:** migration `038`; make retention conversation-type-aware (group = durable). Extend the
  conversation repository to resolve a group→conversation. Add `anonymizeGroupMessagesFor` to the repo.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G2.2 — Group chat backend: send / history / sender names / system events
- **RED:** integration — post a `text` message to a group conversation (members only; non-members 403);
  `GET history` by `conversation_id` returns messages with **sender display name** (resolved from `players`,
  cached per §10) and `system` events ("Sam joined"); bus + SSE emit on `conversation_id` (reuse V2 bus).
- **GREEN:** message routes/repository for group conversations; system-event emitter on join/leave/launch;
  sender-name resolution.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G2.3 — Moderation: owner delete-message (tombstone) (§11.6)
- **RED:** integration — an **owner** can delete any message in their group → row tombstoned ("message
  removed"), body cleared, attribution dropped; a **member cannot**; history still returns the tombstone in
  order; logged `group.message.removed`. (No reporting/blocking surface exists — assert absence.)
- **GREEN:** soft-delete/tombstone on `group_messages`; owner-only authz; render tombstone.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G2.4 — Notifications: 3-level mute + @mentions + announcements (§11.7)
- **RED:** unit — `notify_level` gates delivery: `all` (poll-create + chat, **digested/debounced** via
  §17.2), `mentions_polls` *(default)* (poll-create + @mention only), `muted` (nothing pushed; in-app badge
  still updates); **@mentions** parsed and notify the mentioned member regardless of chat preference (except
  `muted`); **announcements** notify all **except `muted`**. Integration — a posted chat message enqueues
  notify jobs respecting each recipient's level.
- **GREEN:** mention parsing; per-recipient notify selection feeding the §17.2 `messaging.notify` job
  (debounce/digest); announcement path.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G2.5 — Frontend: "My Groups" tab, group page, unread badges (design §4, G-UI-1…3)
- **RED (scenarios + e2e):** add to `e2e-scenarios.md` "Feature: Player Groups — chat"; Playwright —
  the **👥 My Groups** bottom-nav tab lists the player's groups; tapping opens the **Group page**
  (**Chat · Members · invite**); a sent message appears live (SSE); **unread shows as a badge on the nav
  tab** (no unified inbox); two senders are distinguishable by name. Frontend unit — group list, message
  card "Name · time", members panel. `data-testid`s in `e2e/config.ts`.
- **GREEN:** My Groups route + tab, Group page (chat stream, members, invite-by-email), badge wiring.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

---

## PHASE G3 — Availability polls (design §5, §11.8)

### G3.1 — Poll backend: In/Out/Maybe (extensible), re-votable, notify-on-create
- **RED:** integration — **any member** creates a poll = a `type=poll` message + question + target time;
  `poll_votes(message_id, player_id, choice{in|out|maybe}, voted_at)` with **`choice` stored extensibly**
  (enum/string, not three booleans — §11.8 forward-compat); **non-anonymous** (everyone sees who's in);
  **re-votable** (latest vote wins, one row per player); **notify members on create** (per G2.4 levels).
  **Per-store erasure primitive (§0.5):** a contract test proves `anonymizePollVotesFor(playerId)` removes/
  tombstones that player's votes while **other voters' rows and the remaining tally stay correct**, and is
  idempotent.
- **GREEN:** poll create/vote routes; `poll_votes` table (migration `039`); live tally aggregation; add
  `anonymizePollVotesFor`.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G3.2 — Poll auto-close + system follow-up
- **RED:** unit/integration — **auto-close optional**; if unset, open indefinitely; on close the card
  **freezes** to the final tally **and** a `system` message posts ("Tonight: 6 in"); polls persist in
  durable history. (Auto-close timing rides the shared scheduler — see G4.6; until then, manual close +
  a tested close handler.)
- **GREEN:** close handler (manual + scheduler-driven); system follow-up emit.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G3.3 — Frontend: inline poll cards with live SSE tally (G-UI-4)
- **RED (scenarios + e2e):** poll rendered as an **inline card** in the chat stream; tapping In/Out/Maybe
  updates a **live tally over SSE**; re-voting moves your choice; a closed poll shows the frozen tally.
  Frontend unit for the poll card.
- **GREEN:** poll card component, vote affordance, SSE tally subscription.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

---

## PHASE G4 — Casual tournament engine & group-launch (design §6/§6.0/§6.1, §11.9–11.14) — **core-engine**

### G4.1 — Schema: mode / visibility / group_id / abandoned + nullable deadlines (§6.0, R-A)
- **RED:** migration test — `tournaments.mode{scheduled|casual}` (default `scheduled`),
  `visibility{public|unlisted}` (default `public`), `group_id` (nullable FK), `status += abandoned`;
  the three deadline columns (`registration_deadline`, `group_stage_deadline`, `knockout_stage_deadline`)
  become **nullable**; **existing tournaments unchanged** (all default `scheduled`/`public`, deadlines
  intact). Browse filter: `/browse` returns only `visibility=public` (HL:1140 carve-out) — `unlisted`
  hidden.
- **GREEN:** migration `040`; relax deadline NOT NULLs; add columns with safe defaults; apply the browse
  `visibility=public` filter.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G4.2 — Casual mode engine: no deadlines, fixed roster, open scoring, auto-progression (§6.1, §11.10/11.13)
- **RED:** integration — for `mode=casual`:
  1. **no `DEADLINE_PASSED` enforcement** and no date-driven advancement when deadlines are null.
  2. **fixed roster** — participants set at launch, **registration closed immediately**.
  3. **open scoring** — **any participant** may enter/edit **any** current match's score; **submitter
     logged** (`score.submitted` with `playerId`).
  4. **auto-progression** — when all current-round matches are scored, the bracket **auto-advances** (no
     organizer click); completes (`tournament_complete` + `completed_at`) when the final is scored.
  5. **edit window** — scores editable **until terminal state, locked after**; on edit, **recompute
     standings + leaderboard aggregates** (cheap — round-robin has no elimination dependency, §11.13).
  Scheduled mode behavior is **unchanged** (regression assertions on the existing engine).
- **GREEN:** branch the engine on `mode`; casual authz (open scoring) vs scheduled (own-match/organizer);
  auto-advance trigger on full-round scoring; recompute on edit.
- **Verify gate** (incl. the existing scheduled-mode e2e — no regressions). **Commit:** `test:` → `feat:`.

### G4.3 — Social-mixer doubles: random teams, best-effort rotation, sit-out (§11.11) — **NEW engine code**
- **RED:** unit — given N In-voters with `default_match_format=doubles`: form **random teams**; each round
  generates **different team combinations** via **best-effort greedy** rotation (track prior partnerships,
  minimize repeats — assert fewer repeats than random, **not** guaranteed-optimal); **odd N → sit-out
  rotation** (one rests per round, rotates ~evenly, sitting players score nothing). Deterministic under a
  seeded RNG for test stability.
- **GREEN:** mixer scheduler module (seedable RNG); integrate with G4.2 auto-progression for casual doubles.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G4.4 — Durable cross-tournament leaderboards (pair + individual, raw W/L) (§11.12)
> **⚠️ Hardest erasure case — decide the schema shape HERE, not in G5.** A doubles result has up to 4
> participants; anonymizing one player's slot must leave the other three intact. **Decision to make and test
> in this task:** model participants as **one row per slot** (`group_match_participants(match_id, slot,
> player_id NULLABLE, name_snapshot, side)`) rather than 4 player-id columns on a single row — per-slot rows
> make single-slot anonymization a plain `UPDATE … WHERE player_id = $1` and keep aggregation simple. If the
> single-row/4-column shape is chosen instead, the contract test below **must** still prove per-slot
> anonymization works; surface the shape as an explicit, tested choice now (late discovery here is the main
> risk called out in *Sequencing & risks*).
- **RED:** migration + integration — durable `group_match_log` + per-slot participants (**durable, never
  auto-purged**, **anonymization-ready** §0.5); every casual match writes rows; derive a **pair leaderboard**
  (`{A,B}` cumulative) and an **individual leaderboard** (each player across all partners), both ranked by
  **raw W/L + games-won**, **across multiple casual tournaments**; **partial results count** (an abandoned
  tournament contributes its played rows). (Elo explicitly out — deferred.)
  **Per-store erasure primitive (§0.5) — the load-bearing one:** a contract test proves
  `anonymizeMatchLogSlotsFor(playerId)` tombstones **only that player's slots** across multi-party rows
  (co-participants untouched), and that **`recomputeLeaderboards()` re-derives correct pair + individual
  standings from the mutated log** (drops the anonymized player from the individual board). Aggregation is
  built **re-runnable/idempotent** so G5 can call it after erasure.
- **GREEN:** migration `041`; per-slot participant model; match-log writer on score finalize; **idempotent**
  leaderboard aggregation queries + endpoints; add `anonymizeMatchLogSlotsFor` + `recomputeLeaderboards`.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G4.5 — Group → tournament launch (G-TOURN-1, §6)
- **RED:** integration — the **poll creator** launches an **`unlisted` + `casual`** tournament **seeded from
  current In-voters**, linked via `tournaments.group_id`; a `system` message posts linking to it; the new
  tournament gets its own ephemeral Messages tab while the group keeps its durable chat; inherits
  `groups.default_match_format` (overridable at launch, §11.9); if **auto-close** is set, the creator may opt
  for **auto-launch on close**. Authz: only the poll creator launches.
- **GREEN:** launch service (create tournament with mode/visibility/group_id, seed roster, close
  registration); auto-launch-on-close hook; system-message link.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G4.6 — Terminal state: "end session now" + deferred idle auto-archive (§11.14)
- **RED:** integration — **owner "end session now"** transitions a casual tournament to a terminal state
  (locks scores, finalizes leaderboard contributions, posts a `system` message); partial results counted.
  Scheduler test (worker, reuse V2 scheduler infra) — a casual tournament **idle N=7 days** auto-transitions
  to `abandoned` ("4 of 10 matches played"). The idle sweep is registered as a **repeatable job alongside
  the partition-purge cron** (one scheduler, three consumers — backlog 🔴).
- **GREEN:** "end session" route; idle-sweep repeatable job in the worker (gated on the shared scheduler;
  manual end ships regardless).
- **Verify gate.** **Commit:** `test:` → `feat:`.

### G4.7 — R-A reconciliation: docs + tests (backlog R-A)
- **RED/UPDATE:** carve out the **5 conflicting requirements** into `mode`-aware form and add **casual-mode
  tests alongside the scheduled-mode ones**: deadlines NOT NULL → nullable (HL 705–707); partner-confirm by
  registration deadline → N/A (REQUIREMENTS:21); organizer-manual advance → auto-advance
  (REQUIREMENTS:84,140); own-match/organizer scoring → open scoring; registration-deadline guard → seeded
  roster (REQUIREMENTS:1158). Document the `visibility` axis (HL:1140 unlisted carve-out).
- **GREEN:** update `rac8-4s-HL.md` §9 + `REQUIREMENTS.md`; no source-of-truth doc left contradicting casual
  mode.
- **Verify gate** (full suite — docs change shouldn't break tests; the new casual tests are green).
  **Commit:** `test:`/`docs:` → `feat:` as applicable.

### G4.8 — Frontend: launch, casual scoring, leaderboards
- **RED (scenarios + e2e):** "Feature: Player Groups — casual tournament" in `e2e-scenarios.md`; Playwright —
  launch from a poll's In-voters; any participant enters a score; the bracket auto-advances; the **pair +
  individual leaderboards** render and persist across two sessions; "end session" closes it. Frontend unit
  for scoring + leaderboard components.
- **GREEN:** launch affordance on the poll card, casual scoring UI (open entry), leaderboard views.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

---

## PHASE G5 — DSR orchestration (§12.1) — **before GA**
*The hard, schema-coupled work already shipped with each store: `anonymizeGroupMessagesFor` (G2.1),
`anonymizePollVotesFor` (G3.1), `anonymizeMatchLogSlotsFor` + `recomputeLeaderboards` (G4.4), and the
solely-theirs hard-deletes (membership/notify in G1, invite tokens in G1.3). G5 is now **thin plumbing** that
composes proven primitives — not a from-scratch cascade discovered at the end.*

### G5.1 — Operator data-subject-request: orchestrate / verify / export / entrypoint
- **RED:** integration — given an **email** (durable-player key), an **operator-triggered** request:
  - **resolves email → player** and **verifies identity** via the magic-link/email model before acting.
  - **composes the per-store primitives** in order: anonymize chat + votes + match-log slots, hard-delete
    membership/notify + live invite tokens, then `recomputeLeaderboards()`. (Each primitive is already
    unit-proven; G5 tests the **orchestration** — full fan-out leaves **no PII** for the player and **all
    co-participant data untouched**, and the whole request is **idempotent** on re-run.)
  - **export** reuses the **same** email-keyed traversal (one walk, two outputs — erase vs serialize).
  - **no self-serve UI** — operator script/admin route, auth-gated.
- **GREEN:** a `DataSubjectRequestService` that fans out to the existing primitives + export serializer +
  identity verification; operator entrypoint; **runbook** added to PLAYER_GROUPS_DESIGN §12.
- **Verify gate** (full unit suite; orchestrator + any new code ≥ 85%). **Commit:** `test:` → `feat:`.

---

## Test strategy
- **Unit (jest):** every new module/branch — membership invariants, mixer scheduler (seeded RNG),
  notify-level selection, casual auto-progression, DSR anonymize-vs-delete decisions.
- **Integration (jest, transactional harness `getTestPool()`):** routes, repositories, migrations, the
  launch service, the per-store anonymize primitives + DSR orchestrator — against Postgres, rolled back per
  suite (no autocommit).
- **E2E (Playwright):** group chat, polls, casual tournament + leaderboards, age-gate onboarding — single
  instance; run with `--retries=2`. Seed own data via fixtures; select by `data-testid`/`e2e/config.ts`.
- **Coverage:** api global ≥ 85; **casual-mode engine, mixer scheduler, the erasure primitives + DSR
  orchestrator each ≥ 85 on
  their own files** (correctness/legal-critical).

## Per-task Definition of Done
1. `test:` (failing) commit precedes `feat:`. 2. `npx jest` (ALL projects) green — run & shown.
3. `npm run type-check` clean. 4. Relevant e2e green with retries. 5. Coverage ≥ 85.
6. No regressions; flakes confirmed-flaky in isolation, not attributed to the task.

## Sequencing & risks
- **Order:** G0 (compliance prereq) → G1 (groups) → G2 (chat) → G3 (polls) → G4 (casual engine + launch) →
  G5 (DSR orchestration before GA). G0.1's age gate **must land first** (it gates onboarding). DSR is
  **decomposed**: the schema convention **and** each store's anonymize primitive + contract test land **with
  that store** (G2.1/G3.1/G4.4); only the thin orchestrator/export/operator-entrypoint is in G5. This
  pulls erasability **validation** forward so a bad schema constraint is caught when the (still-empty) table
  is created, not after it's populated.
- **Depends on** the `conversations` abstraction (migration 034, on `main`). If `MESSAGING_IMPLEMENTATION_V2`
  is still mid-flight, coordinate the bus/SSE conversation-key plumbing.
- **Biggest risk — core-engine ripple (G4.2/G4.3):** casual mode and social-mixer doubles are **new engine
  code**, not reuse; the chief hazard is **regressing scheduled mode**. Mitigate by branching on `mode` and
  asserting the existing scheduled-mode unit + e2e suites stay green in every G4 task.
- **Second risk — compliance correctness (G0.1 + the per-store primitives):** legally load-bearing. The age
  gate must cover **all three** player-creation paths (gate at `findOrCreatePlayerByEmail`, not signup);
  erasure must **never** touch co-participants' data — proven per-store at G2.1/G3.1/G4.4, then composed at
  G5. The **match-log shape (G4.4)** is the case to get right early (per-slot rows vs 4 columns); late
  discovery there was the chief reason not to defer all of erasure to G5. Each primitive carries its own
  ≥85% bar.
- **Scheduler dependency (G3.2/G4.6):** poll auto-close and idle auto-archive ride the **shared scheduler**
  that also runs partition purge/retention (backlog 🔴 — one scheduler, three consumers). Manual paths
  ("end session now", manual poll close) ship regardless so the track isn't blocked on the cron.
- **Idempotency** of every worker handler (notify, idle-sweep) is load-bearing under at-least-once delivery —
  assert it.

## Backlog linkage
- This plan **drives** [`PLAYER_GROUPS_DESIGN.md`](./PLAYER_GROUPS_DESIGN.md) and is indexed in the
  [project backlog](../../BACKLOG.md) under *Implementation plans*.
- **R-A** (casual-mode reconciliation) is resolved in **G4.7**; **§6.0 visibility carve-out** in **G4.1**.
