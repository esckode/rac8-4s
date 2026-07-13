# Player Personalization — Implementation Plan (P0–P12)

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).
> Drives: [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) (grilled 2026-07-13, §5
> resolution table — **read it first; do not relitigate**, especially the three ⚖ owner calls).

**Date:** 2026-07-13
**Status:** 📋 PLAN READY — not started.
**Method:** TDD-first per CLAUDE.md §4/§11 — every step is a **[RED]** commit (failing tests,
run them, confirm they fail *for the right reason*) then a **[GREEN]** commit. E2E scenarios
land in `e2e-scenarios.md` **before** code (S0). Coverage ≥85% on new modules. One logical
change per commit. **Each micro-step's success criteria = its named tests passing plus the
touched package's suite staying green; each stage ends with the full ladder for its packages.**
**Out of scope:** P13 skill ratings and everything in COACH_1TO1_DESIGN.md (ungrilled).

---

## 0. Context pack (read first)

### 0.1 What is being built (one paragraph)

Per-player personalization in two layers on top of the shipped @coach A–C stack: a
`player_settings` store + first-ever `/profile` page (P0); a three-level timezone hierarchy —
player/group/venue — that reworks the shipped digest scheduling and lets Coach/nudges speak
absolute times (P1); self-centering UI (standings/bracket anchoring, initials avatars,
local-time rendering — P2/P3/P4); a per-player pending-actions endpoint feeding tab badges, an
"up next" strip on the authenticated home, and one composer chip (P5–P8); player-global notify
toggles + quiet hours layered AND-wise with the group dial (P9); a table-density preference
(P10 — **theme system explicitly cut**); weekly digest-aligned standings snapshots powering
rank-movement lines (P11); and a day-part availability grid exposed to Coach as aggregates
only (P12).

### 0.2 Key files (verified 2026-07-13)

| Concern | File |
|---|---|
| Players table (002; + `share_contact` 008) | `db/migrations/002_create_players.sql` — id TEXT PK, email, name, phone, preferred_contact |
| Migrations dir — **next number: 052** | `db/migrations/` (051 = digest settings) |
| Auth routes / the settings mount | `packages/api/src/routes/auth.ts` — `GET /me` ~line 304; mounted at `/api/auth` (no CloudFront change needed — **never add a new top-level mount**, CLAUDE.md §9) |
| Group settings PATCH (owner tz pin goes here) | `packages/api/src/routes/player-groups.ts` — `PATCH /:groupId` ~line 122 (handles `assistantEnabled`/`digestEnabled` already) |
| Notify enqueue shape (message path) | `player-groups.ts` ~line 554 (`messaging.notify`, jobId `notify:<conversationId>:<recipientId>`) + `group-notify-selector.ts` |
| Digest processor (rework target) | `packages/api/src/workers/digest-processor.ts` (opted-in query ~line 122) |
| Nudge processor (absolute-times + notify-prefs target) | `packages/api/src/workers/nudge-processor.ts` |
| Sweep job registration | `packages/api/src/assistant/sweep-scheduler.ts` (`registerAssistantSweepJobs`) + `worker-entrypoint.ts` queues `assistant.nudge.sweep`/`assistant.recap.sweep`/`assistant.digest` ~lines 175–200 |
| Coach prompt + turn context (tz already rides payload) | `packages/api/src/assistant/prompt.ts` (~line 45), `assistant-service.ts` (`payload.timezone` ~line 27) |
| Test-only trigger endpoints (all in the `NODE_ENV!=='production'` block) | `packages/api/src/app.ts` — `/test/player-token` ~192, `/test/casual-session` ~219, `/test/scheduled-session` ~270, `/test/nudge-sweep` ~313, `/test/recap-sweep` ~364, `/test/digest-sweep` ~379 |
| DSR export/erasure | `packages/api/src/dsr-service.ts` |
| Bottom nav + header (badges, avatar entry) | `packages/frontend/src/components/shared/ResponsiveLayout.tsx` — tabs ~lines 120–135 (testIds `nav-*`), signout entry ~line 91 |
| **Live** standings table | `packages/frontend/src/components/shared/StandingsTable.tsx` (used by `pages/TournamentDetail/Standings.tsx`). ⚠️ `components/StandingsTable.tsx` is a **stale duplicate — do not edit it** |
| Bracket view | `shared/OrganizerBracket.tsx` + `shared/bracketToFlow.ts`; `shared/MatchCard.tsx` |
| Chat UI (avatars, chip) | `GroupChatPanel.tsx`, `PollCard.tsx`, `NotificationCard.tsx`, `MentionAutocomplete.tsx` |
| SSE events the client already handles (P5 refetch triggers) | `hooks/useGroupMessages.ts` — `message.created` :117, `poll.tally.updated` :132, `poll.closed` :143, `card.updated` :159 |
| Authenticated home (up-next strip target) | `pages/BrowseTournaments.tsx` — post-login redirect is `/browse` (`Login.tsx:72`) |
| Route protection tests (must update when adding `/profile`) | `e2e/auth.spec.ts` + `src/__tests__/route-protection.spec.tsx` (CLAUDE.md §9) |
| E2E fixtures/config/scenarios; DB harness | `e2e/fixtures.ts`, `e2e/config.ts`, repo-root `e2e-scenarios.md`; `__tests__/helpers/db.ts` (**never bypass**) |

### 0.3 Non-negotiable decisions (design §5 — the ⚖ items are owner overrides)

`player_settings` typed-column table, FK cascade · settings API on `/api/auth` mount, lazy
upsert · `/profile` via header avatar · ⚖ **group digest reschedules to group tz** (hourly
sweep, Sunday ~09:00 group-local, UTC-slot fallback) · player tz auto-follows browser until
manually set (then sticky + reset-to-auto) · group tz = majority-derived, owner-pinnable ·
venue tz = `locations.timezone`, casual inherits group tz · FE timestamps in viewer's
**browser** tz; Coach group prose in **group** tz absolute · highlight+auto-scroll (no sticky
row) · initials+color avatars (color-blind-safe token palette, no photos) · counts capped 9+ ·
strip on `/browse`, auto-hides, non-dismissible · **ONE** composer chip, pre-fill/navigate
only, hidden when `assistant_enabled=false` · notify = player-global event toggles AND group
dial; quiet hours **drop** the push (no deferred delivery) · ⚖ **single theme — no dark mode,
no toggle**; P10 = density only · snapshots weekly, written by the digest sweep, retention
live+90d · availability = weekday×day-part, **aggregates-only** visibility · ⚖ **no rollout
checkpoint** — S0→S8 straight through.

### 0.4 Cross-cutting pins

- **User-visible changes update `docs/assistant-help.md` in the same change** (CLAUDE.md §9):
  applies to S1 (/profile), S2 (times/digest timing), S4 (strip/badges/chip), S5, S7.
- **New protected route `/profile`** → update `auth.spec.ts` + `route-protection.spec.tsx` in
  the same change (§9).
- **Logging** (CLAUDE.md §6): `settings.updated`, `group.timezone.pinned`,
  `availability.updated` at info with actor ids; reads stay silent.
- **Prompt edits (S2.7) keep the system prompt byte-stable per turn** — group tz is volatile →
  it goes in the **user context block** (like `payload.timezone` today), never the system
  prompt.
- **Jest tz determinism:** unit tests asserting time formatting set `TZ` explicitly (e.g.
  `process.env.TZ='America/New_York'` in the suite) — never assume the runner's zone.
- Migrations are stage-local: 052 (S1), 053 (S2), 054 (S5), 055 (S6), 056 (S7).

---

## S0 — Scenario docs FIRST (own commit)

Add "Personalization" Gherkin section to `e2e-scenarios.md`: *(1)* profile page reachable from
header avatar, edits density + manual timezone, round-trips; *(2)* unauthenticated `/profile` →
login redirect; *(3)* standings auto-scrolls to and highlights my row; *(4)* chat shows
initials avatars with stable colors; *(5)* deadline shown in my browser tz with relative
secondary; *(6)* tab badge shows my pending count and decreases after I act; *(7)* up-next
strip lists my unscored match and deep-links to it; strip absent when nothing pending; *(8)*
composer chip "Report score" pre-fills `@coach beat …` and disappears once scored; chip absent
when assistant disabled; *(9)* nudge body contains an absolute group-local time; *(10)* digest
fires at the group's local Sunday morning (sweep-trigger + seeded group tz) and contains a
rank-movement line when a snapshot diff exists; *(11)* NEGATIVE — player A's pending-actions
payload never contains player B's items; *(12)* availability set in profile → Coach poll
suggestion cites only aggregate counts, never who; *(13)* quiet-hours player gets no push but
the item still shows in badge/strip.

## S1 — P0: `player_settings` + `/profile` (migration 052)

- **S1.1 [RED]** Integration (`__tests__/integration/player-settings.spec.ts`): table exists
  with typed columns (`timezone TEXT NULL`, `timezone_manual BOOLEAN NOT NULL DEFAULT false`,
  `table_density TEXT NOT NULL DEFAULT 'comfortable'` CHECK in
  ('comfortable','compact')); deleting a player cascades the row; `GET /api/auth/me` returns a
  `settings` block with defaults when no row; `PATCH /api/auth/me/settings` lazily upserts,
  round-trips, 400s on bad density; DSR export includes the settings row; erasure removes it
  (cascade asserted). *Success: all fail for missing table/route.*
- **S1.2 [GREEN]** Migration 052 + `PlayerSettingsRepository` (`getOrDefaults`, `upsert`) +
  route (log `settings.updated`) + dsr-service export line. *Success: S1.1 green, api suite
  green.*
- **S1.3 [RED]** FE: `/profile` page tests (RTL) — renders settings from `/me`, density toggle
  PATCHes; `ResponsiveLayout` header gains avatar/gear (`data-testid="nav-profile"`) →
  navigates `/profile`; `route-protection.spec.tsx` gains `/profile` as protected.
- **S1.4 [GREEN]** `pages/Profile.tsx` + layout entry + route; update `auth.spec.ts`
  protected-route list; `docs/assistant-help.md` gains the profile section. *Success: FE suite
  + protection tests green.*
- **S1.5 E2E** scenarios (1)(2) in `e2e/profile.spec.ts` (unique-suffix users; testids via
  `e2e/config.ts`).

## S2 — P1: timezone hierarchy (migration 053) + digest rework

- **S2.1 [RED]** Player tz semantics: message POST with `timezone` updates
  `player_settings.timezone` **only when** `timezone_manual=false`; manual PATCH sets both
  value and flag; reset-to-auto clears the flag (next POST re-follows). Login can also carry
  tz (extend `/api/auth` login response path if a hook exists; else message-POST only — note
  which in the [GREEN] commit).
- **S2.2 [GREEN]** Implement in the message route (the tz already arrives — B4.1) + settings
  route.
- **S2.3 [RED]** Group tz: pure `majorityTimezone(tzs: string[]): string|null` (majority; tie →
  lexically-earlier zone; empty → null); `PATCH /:groupId {groupTimezone}` owner-only (member →
  403; null clears the pin); effective tz = pin ?? majority ?? null. Venue: **⚠️ verified
  2026-07-13 — no locations route exists anywhere** (`LocationRepository` in `db.ts` ~1307 has
  `create`/`update` but nothing mounts it; rows come from seed/test paths only). Do NOT invent
  an admin surface (CLAUDE.md §2): 053 adds the `locations.timezone` column +
  `LocationRepository` support only; it is settable via the repository/seed path, surfaced by
  `get_tournament`, and **venue-time rendering falls back to group tz when NULL**. An organizer
  venue-management UI is explicitly out of scope.
- **S2.4 [GREEN]** Migration 053 (`player_groups.group_timezone TEXT NULL`,
  `locations.timezone TEXT NULL`) + code. Log `group.timezone.pinned`.
- **S2.5 [RED]** Digest rework (unit on `digest-processor` + `sweep-scheduler` registration):
  `assistant.digest` becomes **hourly**; processor posts only when (a) it is Sunday and the
  hour is 09 in the group's effective tz, or (b) group has no effective tz and it is Sunday
  18:00 UTC (legacy fallback); ISO-week marker still dedupes (run twice → one post); toggles
  respected. **The processor takes `now` from ctx** (InMemoryScheduler pattern) so tests fake
  time — no sleeps.
- **S2.6 [GREEN]** Implement. *Success: S2.5 green + existing digest tests updated, not
  deleted.*
- **S2.7 [RED→GREEN]** Absolute times: nudge template gains group-local absolute ("deadline
  Sun 6:00pm") with relative as secondary — unit-test the template with fixed tz; Coach group
  turns: effective group tz added to the **user context block** (assert system prompt still
  byte-identical across turns) + prompt.ts instruction to compose absolute times in the
  group's tz. Update the C-Q8-era template tests rather than deleting.
- **S2.8 E2E** scenario (9) via `/test/nudge-sweep` + seeded group tz; scenario (10) timing
  half via `/test/digest-sweep` (the trigger endpoint may accept an optional `now` — extend it
  test-only if not).

## S3 — P2/P3/P4: FE quick wins

- **S3.1 [RED]** `shared/StandingsTable.tsx` (**the live one — not the stale duplicate**):
  viewer's row gets `data-testid="standings-row-you"`, highlight tokens, and auto-scroll
  (~2nd from top; mock `scrollIntoView`); "you" marker. Bracket: the player-facing
  `pages/TournamentDetail/Bracket.tsx` is `MatchCard`-list based (verified — `OrganizerBracket`
  is the flow-canvas variant) — **auto-scroll to the viewer's next `MatchCard`**, same
  mechanism as standings; do not touch the xyflow viewport.
- **S3.2 [GREEN]** Implement (design tokens only — the color lint gate is total).
- **S3.3 [RED]** `shared/Avatar.tsx`: initials (1–2 chars from name) + deterministic bg from
  player-id hash over a **curated color-blind-safe token palette** (same id → same color;
  distinct ids spread); integrated into `GroupChatPanel` message rows and `StandingsTable`.
- **S3.4 [GREEN]** Implement + wire.
- **S3.5 [RED→GREEN]** `shared/formatLocal.ts`: absolute-in-browser-tz primary + relative
  secondary; applied to deadlines, poll target times, match times (grep render sites of raw
  dates). Unit tests under fixed `TZ`.
- **S3.6 E2E** scenarios (3)(4)(5) in `e2e/personalization-ui.spec.ts`.

## S4 — P5–P8: pending actions, badges, strip, chip

- **S4.1 [RED]** Integration: `GET /api/auth/me/pending-actions` →
  `{unscoredMatches[], openPolls[], pendingCards[], nearestDeadline}` — all caller-scoped
  (reuse existing repos; **auth-wall negative test: player B's items never appear for A** —
  scenario (11)); empty state returns empty arrays, 200.
- **S4.2 [GREEN]** Route + `pending-actions-service.ts` (read-only — no logging needed).
- **S4.3 [RED]** FE badges: `ResponsiveLayout` tabs show per-tab counts capped "9+"
  (`data-testid="nav-badge-matches"` etc.); `usePendingActions` hook fetches on mount + window
  focus (**the primary mechanism** — SSE connections are per-conversation via `useSSE.ts`, so
  the 0.2-table events only arrive while a group chat is open; subscribe to them
  opportunistically for instant updates in-chat, never as the sole refresh path).
- **S4.4 [GREEN]** Implement.
- **S4.5 [RED→GREEN]** Up-next strip at top of `BrowseTournaments`: renders **only when**
  payload non-empty (`data-testid="up-next-strip"`); items deep-link (match → its tournament
  page, poll → group chat, card → group chat); no dismiss affordance.
- **S4.6 [RED→GREEN]** Composer chip in `GroupChatPanel`: exactly one, priority Report score >
  Vote > generic `@coach` suggestion; Report-score pre-fills `@coach beat <opponent> ` (no
  send); Vote scrolls to the poll card; hidden entirely when the group's `assistantEnabled` is
  false (mirror the picker test); disappears when its state clears. P8: own-vote styling on
  `PollCard`, personalized empty state on `/browse` from the payload, "awaiting me" filter on
  the Notifications page.
- **S4.7 E2E** scenarios (6)(7)(8) — seed via fixtures; assert badge decrement after scoring
  through the existing flow.

## S5 — P9: notify prefs + quiet hours (migration 054) · P10: density

- **S5.1 [RED]** Integration: 054 adds to `player_settings`: `notify_mentions`,
  `notify_polls`, `notify_nudges` (BOOLEAN NOT NULL DEFAULT true), `quiet_hours_start`,
  `quiet_hours_end` (SMALLINT NULL, 0–23 CHECK). AND-layer tests: message-path notify enqueue
  (player-groups.ts ~554) skips a recipient whose event toggle is off even when the group dial
  allows; nudge enqueue (nudge-processor) respects `notify_nudges`; quiet hours (evaluated in
  the player's tz, P1a) **drop** the push — no job enqueued, nothing deferred — while the item
  still appears in pending-actions (scenario 13); wrap-around windows (22→7) covered.
- **S5.2 [GREEN]** Implement at both enqueue sites; `selectNotifyRecipients` itself stays
  untouched (the B-Q11 regression test must still pass).
- **S5.3 [RED→GREEN]** `/profile` gains the notify section (three toggles + quiet hours) and
  the density toggle wired to table rendering (compact class on `StandingsTable`).
- **S5.4 E2E** scenario (13) via `/test/nudge-sweep` with a quiet-hours player seeded.

## S6 — P11: standings snapshots (migration 055)

- **S6.1 [RED]** Integration: 055 `standings_snapshots` (`tournament_id`, `player_id` FK →
  players ON DELETE CASCADE, `iso_week`, `rank`, `wins`, `sets_won`, `created_at`; PK
  (tournament_id, player_id, iso_week)). Digest sweep writes the week's snapshot **before**
  composing (idempotent — re-run same week, no duplicate); movement = diff vs previous week's
  row ("Alice ↑2 to 1st"); first week → no movement line; erasure cascades; retention: sweep
  deletes rows of tournaments completed >90 days.
- **S6.2 [GREEN]** Snapshot write + movement line in `digest-processor` (compose from repo
  data + `calculateStandings` — **the C0 pin applies: never the asker-scoped tools**).
- **S6.3 E2E** scenario (10) movement half: two `/test/digest-sweep` runs with a score between
  and forced different ISO weeks (extend the trigger with test-only `now` if S2.8 didn't).

## S7 — P12: availability (migration 056)

- **S7.1 [RED]** Integration: 056 `player_availability` (`player_id` FK cascade, `weekday`
  SMALLINT 0–6, `day_part` TEXT CHECK morning/afternoon/evening, PK triple, `updated_at`).
  `GET/PUT /api/auth/me/availability` (full-grid replace, owner-only by construction); DSR
  export includes it; erasure cascades. **Aggregates wall:** new read tool
  `get_group_availability(ctx)` returns per-slot **counts** for the ctx group's members —
  negative test asserts no player ids/names appear in tool output (the P12 privacy rule,
  enforced at the tool layer like A3.3).
- **S7.2 [GREEN]** Table + routes (log `availability.updated`) + tool registered in the Coach
  read registry + prompt hint ("suggest times where most are free; cite counts only") +
  `propose_poll` description nudge. `MockAssistantClient` gains a `when can we play` route →
  real `get_group_availability` (e2e determinism, B7 pattern).
- **S7.3 [RED→GREEN]** `/profile` grid UI (21 checkboxes, `data-testid="avail-{d}-{part}"`),
  "last updated" + re-confirm prompt >60d.
- **S7.4 E2E** scenario (12): seed two players' grids → "@coach when can we play?" → reply
  contains "N of M" and **neither player's name tied to a slot**.

## S8 — Wrap-up + Definition of done

- `docs/assistant-help.md` final sweep (profile, times, availability, digest timing) —
  same-change rule was applied per stage; verify nothing missed. Update BACKLOG.md + design-doc
  status headers (→ Built) in the final merge PR.
- **DoD:** all S-steps merged with [RED]→[GREEN] history · `npm test` (api + frontend),
  `npm run lint`, `npm run test:e2e` green (the pre-existing `partial-indexes` planner flake is
  the only tolerated failure, unchanged from Phases A–C) · coverage ≥85% statements on
  `player_settings`/pending-actions/availability modules and touched FE files · `LOG_LEVEL=debug`
  trace shows `settings.updated` / `group.timezone.pinned` / `availability.updated` with actor
  ids · DSR export/erasure verified for all three new tables (S1.1/S6.1/S7.1 tests are the
  gate) · no live-model dependency anywhere (mock adapter covers S7's Coach path; live
  availability-suggestion quality joins the A0.1b-blocked smoke list).
