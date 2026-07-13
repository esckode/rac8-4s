# Player Personalization — Design (pre-grill draft)
## App-layer + UI-layer personalization, ordered for execution

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-13
**Status:** 📐 **GRILLED to resolution 2026-07-13** (P0–P12 + §3; see §5 resolution table —
do not relitigate without new evidence). P13 ratings still needs its own grill; the 1:1 Coach
later phase (§4) has its own doc. Builds on the community layer ([PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md)),
the @coach assistant ([LLM_ASSISTANT_DESIGN.md](./LLM_ASSISTANT_DESIGN.md) — Phases A–C merged to
`main` 2026-07-12/13), and the Task-19 mobile-first frontend architecture
([TASK19_DESIGN_SPEC.md](./TASK19_DESIGN_SPEC.md)).

---

## 1. Product framing

The app currently treats every player identically: shared standings, one group digest slot, one
notification dial, UTC-flavored times, and screens that open on the same view for everyone. The
personalization goal is the same as @coach's ("make using the app more easy"): **the app should
open to *you* — your next match, your pending actions, your clock, your preferences** — without
creating personal-data surfaces we can't erase, export, or explain.

Two layers, one list:

- **App layer** — new per-player data and behavior (preferences, personal digests, trends,
  availability, ratings).
- **UI layer** — the same shared data, rendered self-centered (anchoring, badges, quick actions,
  themes).

**Compliance rule inherited from the assistant work (non-negotiable):** every item that creates a
new durable per-player data class (P0, P9, P11, P12, P13) must settle its **DSR export +
erasure story at grill time, not retrofit it** — the `assistant_cards` precedent (design §11
B-Q10: ids-only where possible, cascade the rest).

## 2. Ordered task list

Ordering rule: **dependencies first, then cheapest-first within a tier.** P0/P1 are the
foundation several later items sit on; P2–P4 are independent quick wins that can proceed in
parallel with anything.

| # | Item | Layer | Effort | Depends on |
|---|------|-------|--------|-----------|
| P0 | Player preferences store (`player_settings` table + `/profile` page) | App | S | — (foundation) |
| P1 | Timezone hierarchy: player (P1a) / group (P1b) / venue (P1c) | App | M | P0; P1b needs P1a |
| P2 | "You" anchoring in standings & brackets | UI | S | — |
| P3 | Identity colors/avatars | UI | S | — |
| P4 | Local-time rendering everywhere | UI | S | P1 |
| P5 | "My pending actions" endpoint + tab badges | App+UI | M | — |
| P6 | "Up next" strip on landing | UI | M | P5 |
| P7 | State-aware composer quick chips | UI | S | P5 |
| P8 | Small touches: poll vote state, empty states, personal inbox | UI | S | P5 (inbox only) |
| P9 | Per-event notification prefs + quiet hours | App | M | P0, P1 (quiet hours) |
| P10 | Persisted display preferences (theme, density, text size, motion) | App+UI | M | P0 |
| P11 | Standings snapshots → personal trends | App | M | — |
| P12 | Availability preferences (Coach-aware) | App | M | P0 |
| P13 | Skill ratings | App | L | P11; own grill |

### P0 — Player preferences store *(foundation, do first)*

A single per-player preferences surface. Everything marked "P0" below stores its setting here —
one migration, one API shape, one DSR entry instead of five.
**Decided (2026-07-13):** dedicated **`player_settings` table** — one row per player, **typed
columns with CHECKs**, `FK → players ON DELETE CASCADE` (one-time DSR wiring: cascade + one
export entry; every future column inherits it). Chosen over columns-on-players (settings churn
would land on the hot identity table — ~12 columns by P12) and JSONB (validation drift, key
rot). **API:** rides the existing `/api/auth` mount — `GET /me` payload gains a `settings`
block + new `PATCH /api/auth/me/settings`; a `/player/settings` top-level mount would need a
CloudFront behavior entry (CLAUDE.md §9) for zero benefit. Row is lazily upserted on first
PATCH; defaults served when absent. **UI:** new **`/profile` page opened from a header
avatar/gear** — not a bottom tab (tabs are for daily, badged surfaces); verified 2026-07-13
that no player-settings page or PATCH route exists anywhere (auth has only `GET /me`), so P0
builds the app's first one. `/profile` is the future home of P9/P10/P12 sections.

### P1 — Timezone hierarchy: player / group / venue *(app, M)*

**Decided (2026-07-13) — a three-level model (user-proposed, adopted). Supersedes assistant
design §11 B-Q6 (group-tz rejection — predates stored player tz existing), C-Q3 (fixed UTC
digest slot), and C-Q8's relative-only rule for composed times; dated notes added there.**

- **P1a — Player timezone** (`player_settings.timezone`): Phase B already captures the browser
  IANA tz on every message POST and discards it — persist it. **Freshness: auto-follow the
  browser on every login/message until the player sets a tz manually in `/profile`; manual set
  is sticky, with a "back to automatic" reset.** Personal uses: quiet hours (P9), future
  personal digest, 1:1 Coach.
- **P1b — Group timezone** *(dep: P1a)*: **derived as the majority of members' stored
  timezones, until a group owner pins one** in group settings (the P1a pattern one level up).
  Used for everything composed *for the group*: **digest timing** — the shipped weekly
  `0 18 * * 0` cron becomes an **hourly sweep** ("is it Sunday ~09:00 in this group's tz +
  no ISO-week marker?"; existing dedupe marker prevents doubles; fallback = current UTC slot
  when no member has a tz; ties break to the earlier zone) — plus **Coach group replies and
  nudges, which now compose absolute times in group tz** ("deadline Sunday 6pm" — one clock
  per social space; asker-relative and per-viewer variants rejected since a shared body has
  many readers).
- **P1c — Venue timezone** (`locations.timezone`, IANA, set by the organizer with the venue):
  match schedules and venue-anchored times render in it — everyone is at the courts.
  Group-linked casual tournaments (no venue) inherit the group timezone. Verified 2026-07-13:
  no timezone column exists anywhere yet; all three are new columns, pre-launch = no backfill.
- **FE-rendered timestamps** (standings, deadlines shown in UI) always use the **viewer's
  browser tz** — the client always knows it, so P4 needs no fallback logic; stored tz is
  server-side only.

### P2 — "You" anchoring in standings & brackets *(UI, S, no deps)*

Auto-scroll to and visually pin the viewer's row in standings; center the bracket on the
viewer's next match (Task-19 is already match-focused); a "you" marker wherever the viewer's
name appears in shared tables. FE-only; the viewer's identity is already in every page's session.
**Decided (2026-07-13): highlight + auto-scroll** — on open, the table scrolls the viewer's
highlighted row into view (~2nd from top so context shows); scrolling away is free. No sticky
pinned row (duplicated-row confusion + sticky-inside-scroll fiddliness on mobile).

### P3 — Identity colors/avatars *(UI, S, no deps)*

Deterministic per-player color (hash of player id → token palette) used consistently across chat
bubbles, standings rows, brackets. Zero configuration, makes every shared surface scannable for
"where am I / where's Bob".
**Decided (2026-07-13): initials avatar + color** — a small circle with deterministic
background (player-id hash → curated color-blind-safe token palette) + 1–2 initials; initials
disambiguate the inevitable color collisions in 8+ member groups and carry identity for
color-blind users. No photo uploads (a storage/moderation/DSR surface explicitly out of scope;
not pre-built for).

### P4 — Local-time rendering everywhere *(UI, S, dep: P1)*

Deadlines, poll target times, match schedules rendered in the viewer's stored tz, relative
phrasing ("in 2 days") demoted to the secondary line. Frontend formatting layer only once P1
exists.
**Decided (2026-07-13):** resolved by the P1 hierarchy — FE-rendered timestamps always use the
viewer's **browser** tz (no fallback logic needed; stored tz is server-side only); Coach's
composed prose uses **group tz** in group chat (absolute times — supersedes C-Q8) and player
tz in the future 1:1 surface. Relative phrasing ("in 2 days") demotes to the secondary line.

### P5 — "My pending actions" endpoint + tab badges *(app+UI, M, no deps)*

One read-only endpoint aggregating per player: unscored matches they're in, open polls they
haven't voted in, pending confirm cards only they can act on, nearest deadline. Feeds tab badges
(counts) and P6/P7. All four facts already exist in the DB; this is aggregation, not new state.
**Decided (2026-07-13):** one aggregate endpoint fetched on app open + tab re-focus, with
refetch triggered by the SSE events the client already receives (score submitted, poll
created/closed, card updated) — no polling loop. Badges are **numeric counts capped at "9+"**
(counts communicate workload and reward action; dots hide magnitude).

### P6 — "Up next" strip on landing *(UI, M, dep: P5)*

One glanceable card at the top of the landing screen: next match (opponent, court), unscored
match awaiting you, nearest deadline, open poll — each deep-linking to its screen. Converts the
app's most common lookups from three taps to zero; the static sibling of what @coach does
conversationally.
**Decided (2026-07-13): top of the landing screen, rendered only when the P5 payload has
items** — auto-hides when empty (no empty state, no dismissal: dismissing your unscored match
doesn't unscore it, and the badge shows the count regardless). Not a persistent banner
(competes with content on every screen it duplicates).

### P7 — State-aware composer quick chips *(UI, S, dep: P5)*

The mention picker already pins Coach; add suggestion chips above the composer personalized by
the player's P5 state: "Report score" when a pending match exists (pre-fills the Phase B propose
flow), "Vote" when a poll is open, a generic "@coach when's my next match?" otherwise. Turns the
Phase B machinery into one-tap flows with no new backend.
**Decided (2026-07-13): ONE chip, highest applicable priority** — Report score > Vote >
generic "@coach …" suggestion — disappearing when its state clears (state-driven, no manual
suppression). Mis-taps are harmless by construction: **chips only pre-fill composer text or
navigate — they never send and never mutate** (any accidental send at worst drafts a card,
which is itself confirm-gated: two deliberate actions from any state change). Coach-invoking
chips hide when the group's `assistant_enabled` is off, mirroring the mention picker.

### P8 — Small touches *(UI, S)*

Your own vote state visually distinct on poll cards; personalized empty states ("Welcome back —
2 matches to score" vs generic zero-states); a personal inbox view over the existing
`NotificationCard`s filtered to "awaiting me" (dep: P5).
**Decided (2026-07-13):** settled by extension of P5–P7 patterns — vote-state styling on the
poll card, empty states fed by the P5 payload, inbox = filter over existing `NotificationCard`s.

### P9 — Per-event notification prefs + quiet hours *(app, M, deps: P0, P1)*

Split the single notify dial (`all`/`mentions_polls`/`muted`) into per-event-type preferences —
deadline nudges, digests, chat mentions, cards — plus local quiet hours (needs P1). Player-level
control complements the owner-level toggles from Phase C (C-Q1's master switch still wins).
**Decided (2026-07-13):** player-global toggles for the three event classes that actually push
(chat mentions, polls/announcements, deadline nudges — digests and Coach replies never push per
B-Q11, so no toggle), **combined with the existing per-group dial by AND** — a push sends only
if both allow. Purely additive; no dial migration. **Quiet hours drop the push outright** —
the item stays in badges/strip/inbox (P5 makes every push redundant), and no deferred-delivery
mechanism gets built (the C0 scheduling-reality lesson); a morning batch of stale pushes was
rejected.

### P10 — Persisted display preferences *(app+UI, M, dep: P0)*

Dark mode (token-based design system makes theming feasible), table density, text size, reduced
motion — stored in P0, applied on login, cross-device.
**Decided (2026-07-13) — scope cut (owner's call): the app keeps its single existing theme.**
No dark mode, no system-following, no time-of-day switching, no theme toggle in v1; a global
theme preference becomes a future item only when multiple validated themes exist (and is not
pre-built). P10 v1 shrinks to the **table-density preference** plus code hygiene that isn't a
setting (rem-based sizing deferring to OS text size; `prefers-reduced-motion` respected).
**Verification finding (2026-07-13), recorded as known debt for whenever theming happens:** a
full dark token set exists only in the design-spec sandbox (`src/design/index.html`
`html[data-mode="dark"]`); the live `styles/tokens.css` has no dark overrides and nothing sets
`data-mode`; and several shipped components use Tailwind `bg-white`/`bg-black` literals the
color lint gate doesn't catch — a token remap alone would leave white islands. Any future
second theme starts with: port sandbox overrides → sweep named-color literals to tokens +
extend the lint rule → visual audit.

### P11 — Standings snapshots → personal trends *(app, M, no deps)*

The weekly snapshot store that §11 C-Q11 rejected for the v1 digest — built deliberately this
time. Unlocks: "you're up 2 places" in digests, win/loss streaks, head-to-head records
("you're 3–1 vs Bob"), a personal stats view. Compounds with the community layer's durable
cross-tournament leaderboards.
**Decided (2026-07-13): weekly, digest-aligned** — the digest sweep itself snapshots each
group-linked tournament's standings just before composing (one mechanism; "since last digest"
is literally true). First consumer: **rank movement in the existing group digest**. Retention:
rows kept while the tournament is live + 90 days after completion. Schema:
per-player-per-tournament-per-week rows; erasure cascades with the player FK. Streaks/H2H are
later consumers of the same store.

### P12 — Availability preferences *(app, M, dep: P0)*

Weekly availability windows per player; Coach's `propose_poll` suggests times that work
("Tue evening — 5 of 6 available"), nudges become actionable ("you and Carol are both free
Thursday"). New read-only tool input for Coach — the registry wall is unaffected (read tool).
**Decided (2026-07-13): weekday × day-part grid** (morning/afternoon/evening — 21 cells,
thumb-friendly, matches "Tue evenings" thinking) in `/profile`. **Visibility:
aggregates only** — Coach and members see "5 of 6 free Tue evening", never an individual's
grid (personal schedule patterns stay private). Staleness: show "last updated" + a gentle
re-confirm prompt when >60 days old.

### P13 — Skill ratings *(app, L — needs its own grill session)*

ELO-style rating from match history → balanced round-robin seeding, "upset" callouts in
recaps, fairer social-mixer pairings.
**Grill (own session):** visible vs internal-only ratings (social dynamics of a casual app);
per-sport vs global; cold-start; whether this contradicts the community layer's casual framing.

## 3. Cross-cutting questions — resolved 2026-07-13

1. **Group digest timing — RESOLVED (owner's call, against the drafted recommendation):** the
   group digest is **rescheduled to the group's timezone** (P1b: majority-derived,
   owner-pinnable; Sunday ~09:00 local via hourly sweep), rather than staying UTC and waiting
   for a personal digest. The personal digest (+ T1.4 catch-up) remains a 1:1-surface item (§4).
2. **Preferences UI — RESOLVED by exploration:** no player-settings surface existed anywhere;
   P0 builds `/profile` (header avatar entry). See P0.
3. **Sequencing — RESOLVED (owner's call, against the drafted recommendation): no checkpoint —
   P0–P12 run straight through.** The C-Q5-style reception pause was declined; shared-surface
   changes (avatars, group-tz digest timing) ship in-line.
4. **Scope discipline.** P13 is flagged L and "own grill" — it should not ride along with the
   S/M tiers. Coach memory was removed from this list entirely: it belongs to the 1:1 Coach
   surface (§4), where its worst privacy problems don't exist.

## 4. Later phase — 1:1 Coach

A private per-player Coach conversation for performance improvement, tactics, and strategy —
the use case the group feed structurally blocks (you can't ask how to beat Bob in a chat Bob
reads) and the one the persona's name promises. Designed separately in
[COACH_1TO1_DESIGN.md](./COACH_1TO1_DESIGN.md) (pre-grill draft): it extends the assistant's
Q2 surface decision rather than this document's preference/UI scope, and it absorbs
**opt-in Coach memory** (formerly P13 here) as a sub-decision — a 1:1 surface removes the
public-reply leak class that made standalone memory a poor fit. Sequencing: after this
document's foundation tier (P0–P5) — §3.3 declined a reception checkpoint, so 1:1 Coach queues
behind the P-list rather than a pause; it also benefits from P11 (trends feed data-grounded
coaching) and P12 (availability covers the structured half of what players would ask Coach to
remember).

## 5. Grill resolutions (2026-07-13)

Grilled to resolution with the product owner; per-item detail lives inline above. Owner calls
that went against the drafted recommendation are marked ⚖.

| Q | Decision |
|---|----------|
| P0 storage | Dedicated `player_settings` table, typed columns + CHECKs, FK cascade (long-term churn isolated from the hot identity table; one-time DSR wiring) |
| P0 API/UI | `PATCH /api/auth/me/settings` on the existing mount (no new CloudFront behavior); lazy upsert; new `/profile` page via header avatar — first player-settings surface in the app (verified none existed) |
| §3.1 digest ⚖ | Group digest reschedules to **group tz** (not stay-UTC-until-personal-digest): hourly sweep, Sunday ~09:00 group-local, UTC fallback, existing ISO-week marker dedupes |
| P1a player tz | Auto-follow browser until manually set; manual = sticky + reset-to-auto |
| P1 hierarchy | Three-level model (user-proposed): player / group (majority-derived, owner-pinnable) / venue (`locations.timezone`; casual inherits group tz). Supersedes assistant §11 B-Q6, C-Q3, C-Q8 (dated notes there) |
| P4 times | FE timestamps in viewer's browser tz; Coach group prose in group tz (absolute); relative phrasing demoted to secondary |
| P2 anchoring | Highlight + auto-scroll; no sticky pinned row |
| P3 identity | Initials avatar + deterministic color from color-blind-safe token palette; no photos |
| P5 pending | One aggregate endpoint; fetch on open/refocus + SSE-triggered refetch; numeric badges capped 9+ |
| P6 up-next | Top of landing; renders only when non-empty; not dismissible |
| P7 chips | ONE chip, priority Report score > Vote > generic @coach; pre-fill/navigate only — never sends, never mutates; hidden with `assistant_enabled=false` |
| P9 notify | Player-global per-event toggles (mentions / polls / nudges) AND per-group dial — both must allow; additive, no dial migration. Quiet hours **drop** the push (P5 is the backstop; no deferred delivery) |
| P10 theme ⚖ | **Single existing theme only** — no dark mode, no system-follow, no toggle; future global theme pref only when multiple validated themes exist. v1 = table density + code hygiene. Known debt recorded: dark tokens exist only in the design sandbox; `bg-white/black` literals escape the lint gate |
| P11 snapshots | Weekly, taken by the digest sweep pre-compose; first consumer = rank movement in the group digest; retention live + 90d post-completion |
| P12 availability | Weekday × day-part grid in `/profile`; **aggregates-only** visibility; re-confirm prompt >60d |
| §3.3 rollout ⚖ | **No checkpoint** — P0–P12 run straight through |
