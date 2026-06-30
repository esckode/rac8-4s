# Player Groups V2 — Implementation Plan (community-layer refinements)
## TDD-first build of the §A/§B frontend refinements + the backend deltas they require

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-30
**Status:** 📋 PLAN — not started.
**Design source of truth:** [`PLAYER_GROUPS_DESIGN.md`](./PLAYER_GROUPS_DESIGN.md) (§4 UI, §5 polls, §6 launch,
§11 decisions, §12 compliance) and the gap inventory [`FrontEndPlan.md`](./FrontEndPlan.md) §A/§B. This plan
is the **grilled** resolution of that inventory (decisions Q1–Q16 below, grilled 2026-06-30).
**Foundation:** layers on the merged **Player Groups v1** ([`PLAYER_GROUPS_IMPLEMENTATION.md`](./PLAYER_GROUPS_IMPLEMENTATION.md),
G0–G5 on `main`, migrations 038–045) and the **messaging V2** `conversations` abstraction (migration 034).
**Out of scope (cross-referenced, not built here):** PWA/web-push + offline banner/queue → `PWA_FRONTEND_IMPLEMENTATION.md`
(B.2/R-B); cross-app a11y audit → the separate a11y spec (B.3); DMs → a later additive `type='direct'`;
legal-hold enforcement → the 🔴 DSR-track item (this plan's erasure primitives are **hold-aware-ready**).

---

## 0. Scope, constraints & global rules

### What this builds
The community-layer **refinements** surfaced by the FrontEndPlan grill, in three phases:
**Phase 1 — member layer** (group settings, member management, invite-accept, age-gate wiring, @mentions);
**Phase 2 — personal notification thread** (conversation-backed individual notifications, the DM seed);
**Phase 3 — casual play** (launch flow + poll auto-launch/min-count + the shared scheduler + casual scoring
& leaderboards). Each phase is independently shippable.

### Hard rules (apply to EVERY task) — mirror PLAYER_GROUPS_IMPLEMENTATION §0
1. **TDD-first (CLAUDE.md §4, §11):** write/extend **unit + integration + e2e tests AND scenario docs
   (`e2e-scenarios.md`) FIRST**, confirm they fail for the right reason, **commit the red tests separately**
   (`test:`), then implement to green (`feat:`/`fix:`). Behavior-preserving refactors `refactor:` green-to-green.
2. **Run ALL tests after each task:** `npx jest` from repo root (all projects), `npm run type-check` clean,
   **e2e for the affected area `--retries=2`**. A task is **not done** until run-green, not report-green.
3. **Coverage ≥ 85%** (`packages/api/jest.config.js`). New scheduler/auto-launch and the personal-thread
   erasure primitive are correctness/legal-critical → ≥ 85% on their own files.
4. **Tests/CI stay single-process + in-memory** — reuse the env-selected bus/queue/token backends from V2;
   no new external dependency in the unit suite.
5. **Design-system compliance (non-negotiable for every FE task):** build on `components/shared` primitives;
   **token-only colors** — no hex/`rgb()/rgba()/hsl()` literals (must pass the `DESIGN_SYSTEM_ENFORCEMENT`
   color-literal lint and `npm run lint -- --max-warnings 0`); select by `data-testid` + `e2e/config.ts`;
   **inline a11y** on each new surface (keyboard nav, roles/labels, `aria-live` for the poll tally and the
   notification/chat streams). The cross-app a11y audit (B.3) is the separate net; new surfaces carry their
   own a11y *here* (decision Q1).
6. **Branch/commit:** branch off `main` (`feat/player-groups-v2`); one logical change per commit; red `test:`
   precedes `feat:`; trailers per CLAUDE.md §11.

### Conventions to mirror
Migrations `db/migrations/046+` (045 is taken); `getLogger` `noun.verb` (IDs only, never bodies/PII);
transactional harness `getTestPool()` (no autocommit — CLAUDE.md §7); **route ordering §10** (static before
`/:id`); **`TIMESTAMPTZ` only**; factories under `__tests__/factories`; e2e seeds own data via fixtures.

---

## 1. Decisions (grilled 2026-06-30 — Q1–Q16)

| # | Decision |
|---|---|
| Q1 | Scope = §A.1–A.9 + B.4 + B.5 in one plan; B.2/B.3 deferred to their docs, B.1 done. **Inline a11y for new components here; cross-app audit in B.3.** |
| Q2 | Group-page IA: **Chat \| Members** tabs (Members = read-only roster for all) + a **member-accessible per-group Settings screen** with **role-aware sections** — Notifications + Leave (all); Group config + Manage-members (owners). No header bell. |
| Q3 | Member-action surfacing: **promote/demote → group system events** (+ personal note in Phase 2); **kick → no public message**. Auto-transfer is **leave-only** (owner-initiated demote/kick of last owner is blocked, 409). |
| Q4 | Notification thread = **`type='personal'`, one conversation per player, system/announcement only**. DMs are a **separate additive `type='direct'`** later — not built now. |
| Q5 | Surface = **🔔 header bell → dedicated `/notifications` read-only stream**, mark-read on view (+ add Groups to desktop `TopNav`). Not a sheet, not buried in More. |
| Q6 | v1 routes **four** events to the personal thread: **kick (personal-only), promote, demote, auto-transfer-to-owner** (last three also keep their group system event). |
| Q7 | Personal thread **always notifies** (no `notify_level` gating); **reuses the grace-window digest email** (generalize the hardcoded subject); DSR = **hold-aware hard-delete** (solely-theirs). |
| Q8 | Invite-accept landing `/groups/:groupId/invite`: 5 response states; DobScreen on `AGE_ATTESTATION_REQUIRED`; **accept route mints a session** on success (identity already proven by the email-bound single-use token). |
| Q9 | Age-gate (A.9): **uniform lazy** — render DobScreen only on `AGE_ATTESTATION_REQUIRED`, on all 3 entry paths; `UNDERAGE` terminal. **No backfill** (no live users). |
| Q11 | @mentions: **name-based for v1** — autocomplete → insert always-quoted `@"Display Name"`; render as highlighted chips. Structured `@[playerId]` storage = future backend hardening. |
| Q12 | Launch: **wire the button + confirmation sheet** (seed preview + format toggle), navigate on success; deep-link via **structured `tournament_id` metadata** on the system message. |
| Q13 | **Auto-launch-on-close built fully** (incl. the 🔴 shared scheduler). Poll config (auto-close time, auto-launch, format) set **at poll creation**; skip-on-below-threshold; **skip if creator left**. |
| Q14 | **Min-count** is a launch **floor evaluated at close**; the **open poll window is the join window** (roster locks at close, **fixed-roster preserved** — no mid-game join). |
| Q5/A.5 | Casual scoring **reuses `MatchCard`/`ScoreSubmitForm`** with an **open-scoring flag**; mixer/sit-out **derived client-side**; leaderboard shows **names** (`name_snapshot`); surface **scored_by** if available. |
| Q16 | A.8: reusable `EmptyState`/`LoadingState`/`ErrorState` + a **reconnecting** indicator; offline banner → PWA. B.5: **refetch-on-reconnect** via existing history/tally endpoints (FE-only for durable surfaces; PR-2 stays scoped to ephemeral streams). |

---

## 2. Backend deltas (this plan owns these)

| Tag | Delta | Phase |
|---|---|---|
| B-SESSION | Invite-accept route **mints + returns a player session** on 200 (Q8) | 1 |
| B-ROLEMSG | Emit **group system events** on promote/demote (Q3) | 1 |
| B-NOTIFYLVL | `PATCH …/members/:pid/notify-level` to set a member's `notify_level` *(add if absent)* (A.2) | 1 |
| B-PERSONAL | Migration `046`: `conversations.type='personal'` + `player_id` scope; `resolvePersonalConversation`; post the 4 events (Q4/Q6) | 2 |
| B-DIGEST | Generalize the `notify-processor` digest subject per conversation type (Q7) | 2 |
| B-DSR | Hold-aware hard-delete primitive for the personal thread + compose in `DataSubjectRequestService` (Q7) | 2 |
| B-SCHED | **Shared scheduler** (repeatable jobs; 🔴 — one scheduler, three consumers) | 3 |
| B-POLLCFG | Migration `047`: poll `auto_close_at`, `auto_launch`, `min_players`, `launch_match_format` (Q13/Q14) | 3 |
| B-AUTOCLOSE | Scheduler consumer: close due polls (freeze tally + system msg) — completes G3.2 | 3 |
| B-AUTOLAUNCH | Auto-launch hook on close: min-count gate, skip-on-below/zero, skip-if-creator-gone, idempotent (Q13/Q14) | 3 |
| B-DEEPLINK | Structured `tournament_id` metadata on the launch system message (Q12) | 3 |
| B-LBNAMES | Leaderboard endpoint returns `name_snapshot`; expose `scored_by` on the match payload *(if absent)* (A.5) | 3 |

---

## PHASE 1 — Member layer

### P1.1 — Reusable state components (foundational; A.8)
- **RED:** unit — `EmptyState`, `LoadingState`, `ErrorState` (with a retry callback), and a `ReconnectingIndicator`
  render their variants; tokens-only (lint-green); `data-testid`s in `e2e/config.ts`.
- **GREEN:** the four components in `components/shared`; export from the shared index.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P1.2 — Invite-accept session minting (B-SESSION)
- **RED:** integration — `POST /:groupId/invites/accept` on 200 **returns a player session token** (valid,
  resolves the joined player); existing failure branches (`TOKEN_INVALID`, `UNDERAGE`,
  `AGE_ATTESTATION_REQUIRED`, `NOT_FOUND`) unchanged.
- **GREEN:** mint + return a session in the accept handler (reuse the magic-link/player-session path).
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P1.3 — Group system events on promote/demote (B-ROLEMSG)
- **RED:** integration — promote/demote post a neutral group `system` event ("Sam is now an owner/member");
  kick still posts **nothing** to the group; ordering preserved in history.
- **GREEN:** emit system events in the promote/demote handlers (reuse `postSystemEvent`).
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P1.4 — Group page header + Group Settings shell (Q2)
- **RED (unit + e2e):** `GroupDetail` header shows the group name + a **settings gear**; `/groups/:groupId/settings`
  renders a **member-accessible** screen whose **owner-only sections are hidden for members** (role-aware);
  reachable by both roles. `data-testid`s for header, gear, settings sections.
- **GREEN:** header + `GroupSettings` page + role-aware section scaffold (sections filled by P1.5–P1.6).
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

### P1.5 — Settings: Notifications + Leave (all members) (A.2 + B-NOTIFYLVL)
- **RED:** unit — notify-level control (`all/mentions_polls/muted`, default shown) calls the update endpoint;
  Leave-group calls self-leave and routes back to `/groups`. Integration — `PATCH …/notify-level` persists
  (add route if absent); self-leave unchanged.
- **GREEN:** `NotifyLevelControl` + Leave action wired; backend notify-level route if missing.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P1.6 — Settings: Manage members + Group config (owners) (A.1)
- **RED:** unit + e2e — owner-only **Manage members** rows expose **promote/demote/kick** with **confirm**
  on destructive actions; last-owner demote/kick surfaces the **409 `LAST_OWNER`** as inline guidance;
  kick handled implicitly (group leaves the affected member's `/groups` — personal notification arrives in
  Phase 2); owner **rename** + **default_match_format** edit persist. Members never see these controls.
- **GREEN:** `ManageMembersList` (row actions + confirm dialogs), rename + format controls, wired to existing
  routes.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

### P1.7 — Invite-accept landing page (A.4 + A.9 path 3)
- **RED (scenarios + e2e):** add "Feature: Player Groups — invite accept" to `e2e-scenarios.md`. Public
  `/groups/:groupId/invite` reads `token`+`email`, auto-accepts, and renders one state per response:
  **AGE_ATTESTATION_REQUIRED → `DobScreen`** (re-submit with attestation), **UNDERAGE → terminal reject**,
  **TOKEN_INVALID**, **NOT_FOUND**, **200 → "You've joined …" → lands in the group (authenticated** via P1.2).
- **GREEN:** the landing page + state machine; store the returned session; redirect into `/groups/:groupId`.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

### P1.8 — Age-gate lazy wiring: Signup + Registration (A.9 paths 1–2)
- **RED:** e2e — a new-player **signup** and a new-player **tournament registration** that hit
  `AGE_ATTESTATION_REQUIRED` render `DobScreen`, re-submit with `dob_attestation`, and succeed; `UNDERAGE`
  is terminal; an already-attested email is **never** asked. Guard existing `auth.spec.ts` flows.
- **GREEN:** lazy DobScreen integration in `Signup` + the registration form (one shared hook).
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

### P1.9 — @mention composer (A.3)
- **RED:** unit — typing `@` opens a **member autocomplete**; selecting inserts **`@"Display Name"`**
  (always quoted — matches `parseMentions`); the stream renders mentions as **highlighted chips** (quotes
  stripped), self-mention highlighted distinctly; non-members aren't offered.
- **GREEN:** `MentionAutocomplete` + mention rendering in `GroupChatPanel`. (Backend mention parse/notify
  exists — no backend change; structured-mention storage flagged as future.)
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P1.10 — Desktop TopNav: Groups (B.4 desktop gap)
- **RED:** unit — `TopNav` includes a **Groups** link (authenticated); active state correct.
- **GREEN:** add Groups to `TopNav` (the bell is added in P2.3).
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P1.11 — Refetch-on-reconnect for group chat (B.5, durable)
- **RED:** unit — on SSE reconnect, the group-chat hook **refetches history since the last-rendered message**
  (no gap, no dupes) and shows the **reconnecting → caught-up** indicator; uses the existing history endpoint.
- **GREEN:** reconnect→refetch in `useGroupMessages` + the P1.1 indicator.
- **Verify gate.** **Commit:** `test:` → `feat:`.

---

## PHASE 2 — Personal notification thread (DM seed)

### P2.1 — Schema: personal conversation (B-PERSONAL, migration 046)
- **RED:** migration test — `conversations.type` CHECK widened to include `'personal'`; a `player_id` scope
  column + a partial unique index (one personal conversation per player); `resolvePersonalConversation(playerId)`
  is idempotent (INSERT … ON CONFLICT + SELECT, mirroring tournament/group resolvers).
- **GREEN:** migration `046`; `resolvePersonalConversation` on the conversation repo.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P2.2 — Post the four events into the personal thread (B-PERSONAL; Q6)
- **RED:** integration — **kick** posts a `system` message to the target's personal thread (**and no public
  group message**); **promote/demote/auto-transfer** post a personal message to the affected player (the group
  system event from P1.3 still fires); always enqueues notify (no `notify_level` gating, Q7). Recipient row
  written so unread + digest work.
- **GREEN:** a `postPersonalNotification(playerId, body)` helper; call it from the kick / promote / demote /
  auto-transfer paths.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P2.3 — Header bell + `/notifications` route (Q5)
- **RED (unit + e2e):** a **🔔 bell** in the header (mobile + desktop `TopNav`) shows an unread count from the
  `(player_id, read_at)` mechanism; tapping navigates to **`/notifications`**.
- **GREEN:** bell + unread hook (reuse the group-unread pattern); register the route.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

### P2.4 — Notifications stream + read semantics (Q5)
- **RED (unit + e2e):** `/notifications` renders the personal conversation as a **read-only** stream
  (`NotificationCard`, no composer); live via SSE; **mark-read on view** clears the badge; reconnect refetches
  (P1.11 pattern); empty/loading/error via P1.1. `aria-live` on the stream.
- **GREEN:** `Notifications` page + `NotificationCard` + mark-read.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

### P2.5 — Generalize the notify digest (B-DIGEST; Q7)
- **RED:** unit — the `notify-processor` subject is **conversation-type-aware** ("You have N new
  notifications" for personal; existing wording for tournament/group); idempotency (`notified_at`) preserved.
- **GREEN:** branch the subject on conversation type.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P2.6 — DSR: hold-aware hard-delete of the personal thread (B-DSR; Q7)
- **RED:** integration — `deletePersonalThreadFor(playerId)` hard-deletes the player's personal conversation +
  messages (solely-theirs), is **idempotent**, and is **hold-aware** (skips records flagged under legal hold
  once that mechanism exists — assert the hold-check seam now, even if the flag is always-false today);
  `DataSubjectRequestService` composes it; co-participant data untouched.
- **GREEN:** the primitive + composition; a hold-check seam (no-op until the 🔴 legal-hold item lands).
- **Verify gate.** **Commit:** `test:` → `feat:`.

---

## PHASE 3 — Casual play & launch (+ shared scheduler)

### P3.1 — Shared scheduler infrastructure (B-SCHED; 🔴)
- **RED:** worker test — a **repeatable-job scheduler** registers and fires jobs on the existing worker tier
  (reuse V2 queue infra); handlers are **idempotent** under at-least-once; single-process/in-memory in tests.
- **GREEN:** the scheduler skeleton + registration API (consumers added in P3.3/P3.7 and, later, idle-archive
  G4.6 + partition-purge).
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P3.2 — Poll auto-launch config schema (B-POLLCFG; migration 047)
- **RED:** migration + integration — poll gains `auto_close_at TIMESTAMPTZ NULL`, `auto_launch BOOLEAN`,
  `min_players INT NULL`, `launch_match_format` (null = group default); existing polls unaffected; the
  poll/message payload + votes endpoint carry the new fields.
- **GREEN:** migration `047`; thread the fields through create + read.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P3.3 — Auto-close consumer (B-AUTOCLOSE; completes G3.2)
- **RED:** worker test — a scheduled sweep closes polls with `auto_close_at <= now()` → **freezes tally** +
  posts the `system` follow-up; idempotent (a re-run closes nothing twice); manual close still works.
- **GREEN:** the auto-close consumer on the P3.1 scheduler.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P3.4 — Auto-launch hook + min-count + edge rules (B-AUTOLAUNCH; Q13/Q14)
- **RED:** integration — on auto-close of an `auto_launch` poll: if In-count **≥ `min_players`** → launch with
  `launch_match_format`; **below threshold (incl. 0) → skip + system message** ("Only 3 in, needed 4 — no
  game"); **creator no longer a member → skip + system message**; **idempotent** (no double-launch). Reuses the
  existing launch service.
- **GREEN:** the auto-launch hook invoked by P3.3 on close.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P3.5 — Launch system-message deep-link metadata (B-DEEPLINK; Q12)
- **RED:** integration — the launch `system` message carries **structured `tournament_id`** metadata (not a
  text-embedded ID); history returns it so the client can render a real link.
- **GREEN:** add the metadata field; set it in both manual (G4.5) and auto-launch (P3.4) paths.
- **Verify gate.** **Commit:** `test:` → `feat:`.

### P3.6 — Poll-config form + close-window display (Q13/Q14)
- **RED (unit + e2e):** poll creation gains **auto-close time**, an **auto-launch toggle** (enabled only when a
  close time is set), **min players**, and a **format** selector; the `PollCard` shows the close window to
  **all** members — "Voting closes <time>" (+ relative hint, "closing soon" under ~1h) and, when auto-launch is
  on, **"Closes & auto-starts <time>"**; distinct from the existing **play** time.
- **GREEN:** `PollConfigForm` + close-window rendering on `PollCard`.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

### P3.7 — Launch confirmation sheet + wire button (Q12)
- **RED (unit + e2e):** the **creator-only** launch button (now wired with `isCreator`/`onLaunch` in
  `GroupChatPanel`) opens a **confirmation sheet** with a **seed preview** (In-voters by name, from the votes
  endpoint) + a **format toggle** (default = group format); confirm → POST → on 201 **navigate** to the new
  tournament; the group system message renders as a **deep-link** (P3.5).
- **GREEN:** `LaunchConfirmSheet` + wiring + navigation + deep-link rendering.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

### P3.8 — Casual scoring view + mixer/sit-out (A.5)
- **RED (scenarios + e2e):** add "Feature: Player Groups — casual play" to `e2e-scenarios.md`. The casual
  tournament view lists the **current round** as `MatchCard`s; **open scoring** (any participant submits/edits
  any current match via an open-scoring flag); **scored-by** shown when available; **edit-until-terminal**;
  **mixer**: partnerships from match teams + **"Sitting out this round: …"** derived client-side
  (roster − current-round participants); SSE/refetch advances rounds.
- **GREEN:** open-scoring flag on `MatchCard`/`ScoreSubmitForm`; `MixerStatePanel`; casual-mode rendering.
- **Verify gate** (unit + e2e; **scheduled-mode scoring unregressed**). **Commit:** `test:` → `feat:`.

### P3.9 — Leaderboard names + Leaderboard tab (B-LBNAMES; A.5)
- **RED (unit + e2e):** the leaderboard endpoint returns **`name_snapshot`** (pair + individual); the new
  **`/tournament/:tournamentId/leaderboard`** tab renders **names, not UUIDs**, persists across sessions;
  expose `scored_by` if not already present.
- **GREEN:** endpoint name fields; `LeaderboardPanel` name rendering; register the tab.
- **Verify gate** (unit + e2e). **Commit:** `test:` → `feat:`.

---

## Test strategy
- **Unit (jest):** every component/branch — state components, mention parsing/insertion, role-aware settings
  gating, notify-level selection, personal-thread posting, scheduler/auto-launch decisions, mixer derivation.
- **Integration (transactional `getTestPool()`):** session-on-accept, role system events, personal conversation
  + posting + digest + DSR primitive, poll-config schema, auto-close/auto-launch, deep-link metadata, leaderboard names.
- **E2E (Playwright, `--retries=2`, seed own data):** invite-accept (5 states + DOB), settings + member mgmt,
  notifications bell→stream, poll-config + close-window, launch sheet, casual scoring + leaderboard.
- **Coverage ≥ 85**; scheduler/auto-launch + personal-thread DSR primitive ≥ 85 on their own files.

## Per-task Definition of Done
1. `test:` (failing) precedes `feat:`. 2. `npx jest` (all projects) green — run & shown. 3. `npm run type-check`
clean. 4. Relevant e2e green with retries. 5. Coverage ≥ 85. 6. **FE tasks:** shared primitives, token-only
(lint `--max-warnings 0` green), `data-testid`/`e2e/config.ts`, inline a11y. 7. No regressions (esp.
scheduled-mode scoring + existing auth flows).

## Sequencing & risks
- **Order:** Phase 1 → Phase 2 → Phase 3. Phases are independent deliverables; within a phase, backend deltas
  precede the FE that consumes them (P1.2 before P1.7; P2.1→P2.2 before P2.3/P2.4; P3.1→P3.4 before P3.6/P3.7).
- **Biggest risk — Phase 3 scheduler (P3.1):** the only **Large** item and the critical path for auto-launch.
  Leverage: the same scheduler unblocks G3.2 poll auto-close and G4.6 idle-archive (the 🔴 "one scheduler,
  three consumers"). Mitigate with idempotent handlers asserted under at-least-once.
- **Core-engine guard (P3.8):** casual open scoring rides the existing engine; assert **scheduled-mode**
  scoring/e2e stay green in every P3 task.
- **Legal hold (cross-cutting):** P2.6 ships a **hold-check seam** (no-op today). When the 🔴 legal-hold item
  lands, every store's primitive — including this one — flips the seam to enforce. Don't hard-delete around a
  hold once the mechanism exists.
- **Known v1 limitations (deliberate):** name-based mentions (Q11), no mid-game late-join (Q14, fixed roster),
  offline banner deferred to PWA (Q16), DMs deferred (Q4).

## Backlog linkage
- **Drives** the resolution of [`FrontEndPlan.md`](./FrontEndPlan.md) §A/§B and is indexed in the
  [project backlog](../../BACKLOG.md) under *Implementation plans*.
- **Depends on:** Player Groups v1 (merged) + messaging V2 `conversations` (migration 034).
- **Related:** 🔴 legal-hold (DSR track), 🔴 shared scheduler (delivered here, P3.1), PR-2 SSE Last-Event-ID
  (ephemeral streams only — out of scope here), PWA `PWA_FRONTEND_IMPLEMENTATION.md` (B.2), a11y spec (B.3).
