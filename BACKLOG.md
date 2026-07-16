# Project Backlog

Index for design → implementation tracking. Use this to see **what's built**, **which designs still
need an implementation plan**, and **which plans are ready to tackle**. Each linked document links back
here.

## Status legend
| | Meaning |
|---|---|
| ✅ **Built** | Implemented & merged to `main` |
| 📋 **Plan ready** | Implementation plan exists, not started — *available to tackle* |
| 📐 **Design** | Design captured; **needs conversion to an implementation plan** |
| 🧭 **Decision** | Strategy/decision recorded (may have build work pending) |
| 🚧 **In progress** | Being implemented |
| ⏸️ **Deferred** | Intentionally not now (has a trigger to revisit) |
| 🔧 **Reconciliation** | Doc/test debt where a new decision overrides older requirements — resolve *within* the triggering feature's implementation |

---

## Design documents
| Document | Covers | Status |
|---|---|---|
| [MESSAGING_DESIGN.md](assets/planning/MESSAGING_DESIGN.md) | §16 as-built messaging (single-instance MVP) + §17 multi-instance forward design (diagram + R-requirements) | §16 ✅ **Built**; §17 📐 **Design** → has a plan (V2 below) |
| [PLAYER_GROUPS_DESIGN.md](assets/planning/PLAYER_GROUPS_DESIGN.md) | Durable groups, group chat, availability polls, casual-mode group-launched tournaments | 📐 **Design (fully grilled, §11–§12)** → plan ✅ **Built & merged** ([PLAYER_GROUPS_IMPLEMENTATION.md](assets/planning/PLAYER_GROUPS_IMPLEMENTATION.md)) |
| [FRONTEND_PLATFORM_STRATEGY.md](assets/planning/FRONTEND_PLATFORM_STRATEGY.md) | PWA-first now; Capacitor (native wrapper) deferred | 🧭 **Decision** — PWA work pending; Capacitor ⏸️ **Deferred** (trigger documented) |
| [MONETIZATION_STRATEGY.md](assets/planning/MONETIZATION_STRATEGY.md) | How the app earns: transaction fee on entry fees (long-term primary) + organizer SaaS (secondary); ads rejected; §3.2 coach-led player subscription added 2026-07-15 | 📐 **Strategy** — wedge/pricing/rail **grilled 2026-07-15 → MONETIZATION_DESIGN.md** |
| [MONETIZATION_DESIGN.md](assets/planning/MONETIZATION_DESIGN.md) | Paid player registration ($10/mo, 14-day card trial, $5×3mo launch intro; Stripe Billing, US-only): guests keep tournaments + community layer free forever; registration = identity + /matches + /standings + profile + stats dashboard (new build) + 1:1 coach | 📐 **Design (fully grilled 2026-07-15, §2; 2 ⚖ owner calls; lapse-retention amended 2026-07-16 §2 #6b — coach data purges 90d after lapse)** — stats scope ✅ grilled (row below); → `MONETIZATION_IMPLEMENTATION.md` next |
| [STATS_DASHBOARD_DESIGN.md](assets/planning/STATS_DASHBOARD_DESIGN.md) | Premium `/stats` page (monetization launch blocker): core four — all-time W-L + streak, standings cards w/ rank_reason, per-tournament rank sparkline (singles, 90-day snapshot window), match history; ⚖ casual play as separated section; H2H → v1.1 | 📐 **Design (fully grilled 2026-07-16, §3; 1 ⚖ owner call; window grilled same day → all-history, subscription-window rejected)** — build folds into `MONETIZATION_IMPLEMENTATION.md` phase 1 |
| [GROUP_CHALLENGE_STRATEGY.md](assets/planning/GROUP_CHALLENGE_STRATEGY.md) | Inter-group casual tournaments: owner-to-owner challenge → dual auto-polls (047 machinery) → merged roster tagged `origin_group_id` on registrations (single host `group_id` FK unchanged) → derived rivalry stats; N-ary entity, v1 capped at 2 groups; free (casual-mode boundary) | 📐 **Strategy (draft, 2026-07-16)** — **not yet grilled**; grill §6 → `GROUP_CHALLENGE_DESIGN.md` |
| [LLM_ASSISTANT_DESIGN.md](assets/planning/LLM_ASSISTANT_DESIGN.md) | @coach LLM assistant in group chat — Tier 1 read-only Q&A (MVP), Tier 2 confirmed write actions, Tier 3 proactive nudges | 📐 **Design (fully grilled 2026-07-10 §10, Phase B/C mechanics grilled 2026-07-11/12 §11)** → Tier 1 ✅ **Built**, Tier 2 ✅ **Built**, Tier 3 ✅ **Built** (nudges/recap/digest) ([LLM_ASSISTANT_IMPLEMENTATION.md](assets/planning/LLM_ASSISTANT_IMPLEMENTATION.md)) |
| [PERSONALIZATION_DESIGN.md](assets/planning/PERSONALIZATION_DESIGN.md) | Player personalization P0–P13 — `player_settings` store + first `/profile` page, 3-level timezone hierarchy (player/group/venue — supersedes assistant B-Q6/C-Q3/C-Q8), self-centered UI (standings anchoring, initials avatars, local times), pending-actions endpoint → badges/up-next strip/composer chip, per-event notify prefs + quiet hours, table density (theme system ⚖ cut), standings snapshots → trends, availability grid | 📐 **Design (fully grilled 2026-07-13, §5; 3 ⚖ owner calls)** → P0–P12 ✅ **Built & merged** ([PERSONALIZATION_IMPLEMENTATION.md](assets/planning/PERSONALIZATION_IMPLEMENTATION.md)); P13 skill ratings **needs its own grill**; 1:1 Coach later phase → own docs below |
| [COACH_1TO1_DESIGN.md](assets/planning/COACH_1TO1_DESIGN.md) | Private per-player 1:1 Coach conversation (performance/tactics/scouting) + opt-in consented memory (`propose_remember` cards) + privacy-policy page | 📐 **Design (fully grilled 2026-07-14, §7)** → ✅ **Built & merged** ([COACH_1TO1_IMPLEMENTATION.md](assets/planning/COACH_1TO1_IMPLEMENTATION.md)) |
| [DESIGN_SYSTEM.md](assets/planning/DESIGN_SYSTEM.md) | "C U At Court" token-driven design system (tokens + Tailwind v4 + shared component lib) — as-built + gaps (no doc/Storybook/a11y/theming/governance) | 📐 **Design (as-built)** — **governance gap grilled 2026-06-29, now ✅ built** ([DESIGN_SYSTEM_ENFORCEMENT.md](assets/planning/DESIGN_SYSTEM_ENFORCEMENT.md)); remaining gaps (doc/Storybook/a11y/theming) **not yet grilled** |

## Implementation plans
| Plan | Drives | Status |
|---|---|---|
| [MESSAGING_IMPLEMENTATION.md](assets/planning/MESSAGING_IMPLEMENTATION.md) | Messaging MVP — Phases P–7 (schema, partitioning, repo, routes+SSE, batching, frontend, coverage) | ✅ **Built & merged** |
| [MESSAGING_IMPLEMENTATION_V2.md](assets/planning/MESSAGING_IMPLEMENTATION_V2.md) | `conversations` abstraction (V1.0, Player-Groups prereq) + §17 multi-instance foundation (Redis bus/queue/token store, worker, dev distributed stack; Redis-required failure mode) + product gaps (offline notify, sender names, thread model, read-receipts) | ✅ **Built & merged** (V1–V6, migrations 034–037); V7 deferred |
| [FRONTEND_IMPLEMENTATION.md](assets/planning/FRONTEND_IMPLEMENTATION.md) | Frontend-quality / rendering tasks driving [FRONTEND_PLATFORM_STRATEGY.md](assets/planning/FRONTEND_PLATFORM_STRATEGY.md) — FE-RENDER-1 (memoize `AuthProvider` value) | 📋 **Plan ready** — not started |
| [PLAYER_GROUPS_IMPLEMENTATION.md](assets/planning/PLAYER_GROUPS_IMPLEMENTATION.md) | Community layer — Phases G0–G5 (compliance/age-gate prereq, group entity+membership, durable chat+moderation, polls, casual tournament engine+launch, DSR erasure cascade). TDD-first, ≥85% coverage; carries R-A reconciliation (G4.7) | ✅ **Built & merged** (G0.1–G5.1, migrations 038–045) |
| [PLAYER_GROUPS_V2_IMPLEMENTATION.md](assets/planning/PLAYER_GROUPS_V2_IMPLEMENTATION.md) | Community-layer refinements (FrontEndPlan §A/§B, grilled Q1–Q16) in **3 phases** — P1 member layer (group settings, member mgmt, invite-accept, age-gate wiring, @mentions), P2 personal notification thread (conversation-backed, DM seed), P3 casual play (launch flow + poll auto-launch/min-count + **shared scheduler** + casual scoring/leaderboards). TDD-first, ≥85%; 3 new pages + 1 tab; carries backend deltas + the 🔴 shared scheduler | ✅ **Built & merged** (P1.1–P3.9, migrations 046–048) |
| [LLM_ASSISTANT_IMPLEMENTATION.md](assets/planning/LLM_ASSISTANT_IMPLEMENTATION.md) | @coach assistant — Phase A MVP (A0–A9: migration 049, @coach trigger, read-only tool layer + rank_reason, Haiku 4.5 via adapter, worker processor + rate limits, toggle + intro, FE render/picker/settings, e2e), Phase B confirm-card writes (B0–B7: assistant_cards migration, propose_score/propose_poll/propose_poll_vote/propose_casual_launch, ActionCard UI, confirm/cancel/complete routes, timezone plumbing, Tier-2 prompt), Phase C proactive (C0–C6: migration 051, nudge/recap/digest sweeps + hourly/weekly BullMQ jobs). TDD + e2e-scenario-first | ✅ **Built** (Phase A/B merged to `main`; Phase C 2026-07-13, branch `llm-assistant-phase-c`, not yet merged) — Phase A 8/8 + Phase B 7/7 + Phase C 11/11 e2e passing (26/26 total), no regressions. Launch gate: prod channel stays off (`ASSISTANT_ADAPTER` unset/mock = bot inert) until the privacy-policy AI clause ships (A9.2); recap-polish live-model quality also blocked on the same A0.1b (P-AWS enrollment) smoke gate |
| [PERSONALIZATION_IMPLEMENTATION.md](assets/planning/PERSONALIZATION_IMPLEMENTATION.md) | Player personalization — S0–S8 (migrations 052–056: `player_settings` + `/profile` page; timezone hierarchy + group-tz digest reschedule; "you" anchoring + initials avatars + viewer-local times; pending-actions endpoint + tab badges + up-next strip + composer chip; notify prefs + quiet hours AND-layered with the group dial; table density; digest-aligned standings snapshots + rank movement; availability grid + Coach counts-only tool). TDD + e2e-scenario-first | ✅ **Built & merged** (S0–S8, 2026-07-14, branch `personalization-design` → `main`) — found+fixed a real dual-auth bug via live e2e |
| [COACH_1TO1_IMPLEMENTATION.md](assets/planning/COACH_1TO1_IMPLEMENTATION.md) | 1:1 Coach — S0–S10 (migration 057: `type='coach'` convo + `player_memories` + `assistant_cards.conversation_id` re-key; `/player/coach/*` routes + SSE; player-level tool context + snapshot; history-cached coach client (`COACH_MODEL`); 20/hr+60/day limiter + heads-up; `propose_remember` + memory routes; pinned entry + `/coach` page + Profile section; DSR export/erasure incl. the §5.2 [RED] personal-scope card test; **privacy-policy page** clearing the A9.2 gate). TDD + e2e-scenario-first | ✅ **Built & merged** (S0–S10, 2026-07-14/15, branch `coach-1to1` → `main`) — e2e 8/8 chromium+firefox, coverage ≥85% stmts on all named modules, regression ladder green modulo documented pre-existing flakes. Privacy-policy page (`/privacy`) live; **owner review/approval of its text still pending**, and manual live-model smoke blocked on A0.1b (P-AWS enrollment) — A9.2 + launch-readiness clear once those land |
| [DESIGN_SYSTEM_ENFORCEMENT.md](assets/planning/DESIGN_SYSTEM_ENFORCEMENT.md) | Token-usage lint gate — Phases E0–E5: (b) repair broken ESLint config + clear 53 errors + gate lint in CI, (a) color-literal `no-restricted-syntax` rule on the unified gate w/ interim baseline + permanent allowlist, (c) husky/lint-staged pre-commit, **(E5 mandatory) full retrofit of all ~301 legacy color literals across 11 files + tear down the baseline** (gate becomes total). TDD-first via ESLint fixture harness | ✅ **Built & merged** to `main` |

## Test scenarios
| Spec doc | Covers | Status |
|---|---|---|
| [e2e-scenarios.md](e2e-scenarios.md) | Browser e2e scenarios (Gherkin → Playwright) | Phases 1–7 + Messaging ✅ **Built** (17 spec files); **Phases 8–10 ⏳ pending: Offline (4) + Mobile (4) → **folded into PWA-first**; Accessibility (5) → **tracked separately** (general frontend quality)** |

---

## Queues

### ✅ Built (requirements delivered)
- Messaging MVP (single-instance, flat group-feed) — §16 of MESSAGING_DESIGN + MESSAGING_IMPLEMENTATION.
- TIMESTAMPTZ normalization (migration 031); messaging schema/partitioning (032/033); ≥85% coverage gate.
- **Messaging V2 (multi-instance) — §17 / MESSAGING_IMPLEMENTATION_V2 V1–V6** ✅: conversations abstraction,
  Redis bus/queue/token store, worker tier, dev distributed stack + multi-instance e2e, rate limiting, cache
  consistency, offline notify, sender names, thread model, read receipts. Migrations 034–037. (V7 deferred;
  prod-readiness gaps in [PRODUCTION_READINESS.md](assets/planning/PRODUCTION_READINESS.md).)
- **DESIGN_SYSTEM_ENFORCEMENT.md** — token-usage lint gate (TDD-first, Phases E0–E5) ✅: ESLint fixture test
  harness (E0), repaired the broken `npm run lint` (53 errors) + gated lint in CI (E1), color-literal
  `no-restricted-syntax` rule (E2), husky/lint-staged pre-commit (E3), full retrofit of all ~301 legacy
  color literals across 11 files + baseline torn down (E5), final verify + docs (E4.1) — merged to `main`. Justified by
  "theming eventually yes" — protects the existing semantic-token layer.
- **PLAYER_GROUPS_IMPLEMENTATION.md** — community layer, Phases G0–G5 (TDD-first, ≥85%) ✅: 18+ age gate at
  the universal player boundary (G0), multi-owner groups + email-bound invite (G1), durable group chat +
  moderation + 3-level notify/@mentions (G2), availability polls with live SSE tally (G3), casual tournament
  engine + social-mixer doubles + durable cross-tournament leaderboards + group→tournament launch (G4),
  operator DSR erase/export orchestration (G5). Migrations 038–045. Resolves **R-A** (casual mode) in G4.7.
- **PLAYER_GROUPS_V2_IMPLEMENTATION.md** — community-layer refinements, Phases P1–P3 (TDD-first, ≥85%) ✅:
  member layer (group settings + member mgmt + invite-accept landing + age-gate lazy wiring + @mentions +
  desktop TopNav Groups link + refetch-on-reconnect; P1.1–P1.11, migrations 046–046b), personal notification
  thread (schema + 4 events + header bell + /notifications stream + digest generalization + hold-aware DSR;
  P2.1–P2.6), casual play (shared scheduler + poll auto-launch config + auto-close consumer + auto-launch hook
  + launch deep-link metadata + poll-config form + launch confirmation sheet + open-scoring MatchCard +
  leaderboard tab; P3.1–P3.9, migrations 047–048). Resolves FrontEndPlan §A/§B.

### 📐 Design → needs an implementation plan
- *(done)* ~~**Player Groups** → `PLAYER_GROUPS_IMPLEMENTATION.md`~~ — **✅ Built & merged** (G0.1–G5.1,
  migrations 038–045). See the Built queue above.
- **PWA-first frontend** (FRONTEND_PLATFORM_STRATEGY.md) → create `PWA_FRONTEND_IMPLEMENTATION.md` =
  PWA enablement (manifest, web push, service worker) **+ the Offline (`offline-error.spec.ts`) and
  Mobile/Responsive (`mobile-responsive.spec.ts`) e2e specs** ([e2e-scenarios.md](e2e-scenarios.md)) —
  these *are* the PWA surface. TDD-first.
- **Accessibility e2e** ([e2e-scenarios.md](e2e-scenarios.md)) — 5 a11y scenarios (keyboard nav, input
  labels, button roles, color-independence, error-field association). **Separate frontend-quality item,
  NOT PWA-specific** — applies to any web frontend. → its own spec / general frontend hardening.
- **Monetization** — ~~grill first to pick the wedge~~ **grilled 2026-07-15
  ([MONETIZATION_DESIGN.md](assets/planning/MONETIZATION_DESIGN.md)): wedge = paid player
  registration ($10/mo), coach as headline.** ~~Stats-dashboard scope pass~~ **grilled 2026-07-16
  ([STATS_DASHBOARD_DESIGN.md](assets/planning/STATS_DASHBOARD_DESIGN.md))**. Next: create
  `MONETIZATION_IMPLEMENTATION.md` — phase 1 = stats dashboard build (launch blocker, TDD-first),
  then Stripe Checkout/Billing signup rework, subscription-status webhook mirror, resubscribe wall,
  privacy-policy billing section.
- *(done)* ~~**LLM assistant (@coach)** → `LLM_ASSISTANT_IMPLEMENTATION.md`~~ — **Phase A (A0–A9) +
  Phase B (B0–B7)** merged to `main`; **Phase C (C0–C6) built 2026-07-13** on branch
  `llm-assistant-phase-c` (not yet merged to `main`).

### 📋 Plan ready → available to tackle
- **FRONTEND_IMPLEMENTATION.md** — frontend-quality tasks (TDD). First task: **FE-RENDER-1** memoize the
  `AuthProvider` context value.

### ⏸️ Deferred (with triggers)
- **Capacitor native wrapper** — trigger: reliable iOS push / app-store presence / engagement for the
  social+availability features (see FRONTEND_PLATFORM_STRATEGY.md).

### 🔧 Reconciliation (doc + test debt from recent decisions)
> Resolve each by **updating the source-of-truth docs (`rac8-4s-HL.md` §9, `REQUIREMENTS.md`) + the
> affected tests** — **within the implementation that triggered it**, not as a standalone task. Left
> unreconciled, implementers build to the stale requirement or code contradicts the docs.

- **R-A — Casual-mode tournament reconciliation** ✅ **RESOLVED** in
  [PLAYER_GROUPS_IMPLEMENTATION.md](assets/planning/PLAYER_GROUPS_IMPLEMENTATION.md) **G4.7** (docs + tests
  merged to `main`; schema in G4.1). *(Original scope, for reference:)* Introduce a
  **`tournament mode: scheduled | casual`** concept and carve out
  5 conflicting requirements: deadlines `NOT NULL` → **nullable** (HL 705–707); partner-confirm by
  registration deadline → **N/A** (REQUIREMENTS:21); organizer-manual advance → **auto-advance**
  (REQUIREMENTS:84,140); own-match/organizer scoring → **open scoring**; registration-deadline guard →
  **seeded roster** (REQUIREMENTS:1158). Update HL + REQUIREMENTS; add casual-mode tests **alongside** the
  scheduled-mode ones.
  - **Terminology (PLAYER_GROUPS_DESIGN §6.0):** `mode` (engine: `scheduled | casual`) and **`visibility`
    (`public | unlisted`)** are **two orthogonal axes** — not one concept. The group-launch flow sets
    **both** `visibility = unlisted` **and** `mode = casual` (two fields). We use **`unlisted`**, *not*
    "private," to avoid private/casual confusion. There is **no separate "private tournaments" item** —
    it's the `visibility` attribute. (HL:1140 "only public shown" → the `unlisted` browse-filter carve-out.)
- **R-B — PWA reconciliation** *(triggered by PWA-first; resolve in the PWA build).* HL **already**
  mandates PWA + Service Workers + IndexedDB sync queue + "Offline - will retry" banner (HL
  21/112/137/172/589) — the PWA plan **folds these in, doesn't reinvent**. Promote **push notifications
  "future" → in-scope** (web push). Update the HL roadmap status; reference existing offline reqs.

### 🔍 Frontend gaps (surfaced by e2e work, 2026-07-01)
> Small, standalone implementation gaps found while writing Playwright specs. No design grilling needed —
> the desired behaviour is clear from the existing scenario docs and API contracts.

- **FE-GAP-1 — Login 429 rate-limit UI.** `Login.tsx` doesn't handle a `429 RATE_LIMITED` response from
  `POST /api/auth/login`. The API correctly returns `{ code: 'RATE_LIMITED', message: 'Too many attempts.
  Try again later.' }` after 5 failed attempts (verified in `offline.spec.ts`), but the login form shows
  nothing (no error message, no disabled state). Target behaviour (per `e2e-scenarios.md`): display "Too
  many attempts" text, disable the form fields, show a retry countdown. Compare with `ResetPassword.tsx`
  which already handles `status === 429`. The e2e test (`offline.spec.ts` — "Rate limit countdown UI") is
  written and self-skips until this is built.

- **FE-GAP-2 — Groups unread badge not SSE-driven.** `MyGroupsUnreadBadge` and the `groupsUnread` state
  variable are wired into `ResponsiveLayout.tsx`, but the count is never incremented via SSE while the user
  is away from the group page. The SSE bus emits `message.created` events; a listener in the auth/groups
  context needs to increment the badge counter when a new message arrives for a group the user isn't
  currently viewing, and reset it to zero when they open that group. Distinct from **P1.11**
  (refetch-on-reconnect), which is about history refresh, not the nav badge. The e2e test
  (`player-groups.spec.ts` — "Unread badge appears on My Groups nav tab") is written and self-skips until
  this is built.

### 🔍 Backend gaps (surfaced by the Phase C proactive assistant build, 2026-07-13)
> Grounding findings from `LLM_ASSISTANT_IMPLEMENTATION.md` §C0/C6 — pre-existing, out of assistant scope.
> No design grilling needed; noted so the next person touching either area doesn't assume the wiring exists.

- **BE-GAP-1 — `processAutoCloseSweep` has no production caller.** The poll auto-close sweep
  (`auto-close-processor.ts`) is fully built and unit/integration-tested, but nothing registers it as a
  BullMQ repeatable job or calls it from any route — only tests invoke it directly. The only *wired*
  recurring mechanism in this codebase is the BullMQ repeatable-cron pattern in
  `@worker/partition-scheduler` (`registerPartitionJobs`). Fix: register `auto-close.sweep` alongside the
  Phase-C `registerAssistantSweepJobs` pattern (`assistant/sweep-scheduler.ts`) the next time someone
  touches poll auto-close.
- **BE-GAP-2 — no production route drives a SCHEDULED tournament to `tournament_complete`.**
  `'tournament_complete'` is a reachable `TournamentRepository.updateStatus` value (in the valid-status
  list, and the Phase-C recap sweep watches for it), but no route ever calls it — the only status-terminal
  route is `POST /:id/end-session`, which is casual-only and only reaches `'completed'`/`'abandoned'`.
  Scheduled (bracket) tournaments have no organizer action that marks them fully complete. E2E for the
  Phase-C recap sweep works around this with a test-only endpoint
  (`/test/complete-tournament`, `NODE_ENV!=production` only). Fix: add an organizer "mark tournament
  complete" action (or auto-transition on final knockout match score) the next time someone touches the
  scheduled-tournament lifecycle.
- **BE-GAP-3 — `NotificationMessage` has no correlation id, so an "awaiting me" filter on `/notifications`
  can't be built cleanly.** Surfaced building Player Personalization P8's "small touches" (S4.6,
  2026-07-14): the design calls for a personal-inbox view filtered to items the P5 pending-actions endpoint
  says are awaiting the player, but `NotificationCard`/`NotificationMessage` (`components/NotificationCard.tsx`)
  carry only `{id, body, type, createdAt}` — no `matchId`/`pollId`/`cardId` to join against
  `pending-actions-service.ts`'s output. A body-text heuristic would be fragile (breaks on copy changes);
  correlating properly needs a metadata field threaded through wherever these system messages are
  authored. Deferred rather than half-built. Own-vote styling on `PollCard` (the other P8 touch) was
  already present from Phase B and needed no work; the personalized `/browse` empty state (P8's third
  touch) **was built** (S4.6, `BrowseTournaments.tsx`).
- **BE-GAP-4 — standings snapshots (P11) are singles-only.** `standings_snapshots` (migration 055,
  S6.1/S6.2, 2026-07-14) FKs `player_id` directly to `public.players`, so a doubles team id — which has
  no row of its own in `players` — can't be written there without breaking the FK (and the DSR-erasure
  cascade it exists for). The weekly digest's rank-movement line (P11) is silently skipped for doubles
  tournaments (`digest-processor.ts`'s `writeSnapshotAndComputeMovements` early-returns on
  `match_format === 'doubles'`). Fix, if doubles movement becomes a request: either a separate
  `team_id`-keyed snapshot table, or resolve each team to its two underlying player rows and store two
  per-player snapshot rows with a shared team-rank value.

### 🚀 Production readiness (before multi-instance prod cutover)
> Cross-cutting gaps surfaced during the messaging V2 build — **not** blocking the build (V1–V6 done), but
> they block a real multi-instance prod rollout. Full detail in
> [PRODUCTION_READINESS.md](assets/planning/PRODUCTION_READINESS.md).
- **PR-1 🔴 `trust proxy` behind the LB** *(platform-wide; do first).* `req.ip` = LB IP for proxied traffic
  → rate-limit keys + IP logging collapse to one value. Fix: `app.set('trust proxy', …)`. Small, TDD-able.
- **PR-2 🟠 SSE catch-up on reconnect** *(messaging).* At-most-once pub/sub → reconnect to another instance
  can miss gap messages. Add `Last-Event-ID` / backfill.
- **PR-3 🟠 Prod cutover** *(platform/infra; touches `IaC-*.md`).* ElastiCache(multi-AZ)/ASG/ALB
  provisioning, rolling-deploy mixed-mode, live-session migration. Add a closing phase.

### 🗒️ Open design threads (not yet grilled/decided)
- **Group challenges** ([GROUP_CHALLENGE_STRATEGY.md](assets/planning/GROUP_CHALLENGE_STRATEGY.md) §6):
  inter-group casual tournaments via owner handshake → dual auto-polls → merged roster tagged
  `origin_group_id` → derived rivalry stats. Strategy drafted 2026-07-16 (subgroup-tag model = owner's
  call, verified against 044/047/G4.5 machinery). **Grill §6** (challenge entity, leaderboard
  attribution, defaults, feed presence, v2 directory prereqs) → `GROUP_CHALLENGE_DESIGN.md`. v1 free +
  2 groups by invite, N-ary entity from day one; member-side free-forever, **owner-side gating routed
  to the parked organizer/owner-tier grill** (§5 — symmetric paywall ruled out; v2 directory = natural
  paid owner surface).
- **🔴 Legal hold not enforced by the DSR erasure cascade** *(compliance; platform-wide; grill in the DSR
  track, PLAYER_GROUPS_DESIGN §12).* A legal hold / litigation-preservation obligation **overrides** a DSR
  erasure for the data in scope (GDPR Art. 17(3) / CCPA "retain to meet a legal obligation or defend
  claims"), but today `DataSubjectRequestService` anonymizes/hard-deletes with **no hold check**
  (`dsr-service.ts`), and the only existing `legal_hold` flag is on **tournament messages alone**
  (`messages.legal_hold`) — no other store has one. **Concrete gap:** an erasure would destroy
  legally-held data. **To grill:** hold granularity (per-subject vs per-record), which stores need a hold
  flag, making erasure **hold-aware** (preserve + segregate + log the exemption, proceed on non-held),
  retention schedule, hold-release. Needs counsel input on retention specifics. *(Surfaced 2026-06-30 while
  grilling the personal notification thread — every store's DSR primitive, incl. the new personal thread,
  must become hold-aware once the mechanism lands.)*
- **Personal notification thread (conversation-backed) — DM foundation** *(grilled 2026-06-30 → planned as
  **Phase 2** of [PLAYER_GROUPS_V2_IMPLEMENTATION.md](assets/planning/PLAYER_GROUPS_V2_IMPLEMENTATION.md)).*
  `conversations.type='personal'`, one
  lazily-resolved conversation per player, **system/announcement only** (DMs deferred as a separate additive
  `type='direct'` later). v1 routes **four events**: kick (personal-only), promote, demote, auto-transfer-to-
  owner (last three also keep their group system event). Surface: 🔔 header bell → dedicated `/notifications`
  read-only stream (+ add Groups to desktop `TopNav`); mark-read on view. Always-notify (no `notify_level`
  gating); reuses the grace-window digest email (generalize the hardcoded subject); **hold-aware** hard-delete
  on DSR. Ties to MESSAGING_DESIGN §17.4 (thread model) / §17.5.
- MESSAGING_DESIGN §17.2 (offline), §17.4 (thread model), §17.5 (sender names), §17.6 (read-receipt
  visibility) — recommendations only, not yet confirmed.
- ~~Player Groups: moderation policy, group discovery/privacy, custom-option polls, admin role~~ —
  **RESOLVED 2026-06-24** (PLAYER_GROUPS_DESIGN §11–§12). Remaining deferrals (with triggers): custom-option
  polls, Elo leaderboard, knockout casual, 7-day idle auto-archive (G4.6 — **trigger met:** the shared
  scheduler is delivered by [PLAYER_GROUPS_V2_IMPLEMENTATION.md](assets/planning/PLAYER_GROUPS_V2_IMPLEMENTATION.md)
  P3.1, so this is now buildable as a 4th scheduler consumer), self-serve DSR UI.
- **V2-grill deferrals (2026-06-30)** — explicitly deferred while grilling
  [PLAYER_GROUPS_V2_IMPLEMENTATION.md](assets/planning/PLAYER_GROUPS_V2_IMPLEMENTATION.md); need their own
  requirements grilling later:
  - **Direct messages (`conversations.type='direct'`)** *(Q4).* The personal-thread primitive (V2 Phase 2) is
    the foundation; DMs add a `type='direct'` + a participants model + a compose/send surface, **reusing** the
    `/notifications`-style stream. Grill **with** MESSAGING_DESIGN §17.4 (thread model) / §17.5 (sender/targeting).
  - **Structured `@[playerId]` mention storage** *(Q11).* v1 mentions are **name-based** (fragile: breaks on
    rename, collides on duplicate display names). Trigger: collisions/renames become a real problem → backend
    `parseMentions` + storage change to id-based markup.
  - **Casual mid-game late-join (open roster)** *(Q14, option B).* v1 keeps a **fixed roster** (the open poll
    window is the join window). Trigger: demand to join *after* a casual tournament starts → a **core casual-
    engine change** (round-robin re-scheduling + social-mixer rotation recompute + re-seeding), not a FE change.
- ~~Monetization (MONETIZATION_STRATEGY.md §6): wedge choice, pricing shape, payments integration,
  tax/compliance, free-forever community boundary~~ — **grilled 2026-07-15
  ([MONETIZATION_DESIGN.md](assets/planning/MONETIZATION_DESIGN.md) §2)**. Still parked with triggers
  (§7): **organizer registration pricing** (owner unsure it stays free — resolve with organizer-SaaS
  grill), entry-fee/Stripe-Connect details, sponsorship mechanics, annual pricing, EU sales.
- Design system (DESIGN_SYSTEM.md §4): formality bar (doc-only vs. + Storybook/visual regression),
  portability, a11y bar, theming/dark-mode scope, ~~token-usage governance~~ **(governance grilled
  2026-06-29 → [DESIGN_SYSTEM_ENFORCEMENT.md](assets/planning/DESIGN_SYSTEM_ENFORCEMENT.md))**, component
  API contracts. Theming confirmed **in scope "eventually"** (justifies the token gate); still ungrilled
  for its own implementation.
- ~~**Frontend (community layer + cross-cutting)** ([FrontEndPlan.md](assets/planning/FrontEndPlan.md))~~ —
  **GRILLED 2026-06-30 (Q1–Q16) → plan written**
  ([PLAYER_GROUPS_V2_IMPLEMENTATION.md](assets/planning/PLAYER_GROUPS_V2_IMPLEMENTATION.md), 3 phases). §A
  Player-Groups FE gaps + §B.4 (nav) + §B.5 (SSE reconnect, FE refetch) all resolved there. **Still deferred
  to their own tracks:** §B.2 PWA/web-push + offline banner → `PWA_FRONTEND_IMPLEMENTATION.md`; §B.3 cross-app
  a11y → a11y spec (new surfaces carry inline a11y in the V2 plan); §B.1 design-system governance already ✅.

---

*Convention: every design/implementation doc under `assets/planning/` that belongs to this backlog
carries a "🗂️ Tracked in the [project backlog](../../BACKLOG.md)" link near its top.*
