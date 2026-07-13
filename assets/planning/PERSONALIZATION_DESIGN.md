# Player Personalization — Design (pre-grill draft)
## App-layer + UI-layer personalization, ordered for execution

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-13
**Status:** 📝 DRAFT — **not grilled.** Every item below carries open questions; none is
build-ready. Builds on the community layer ([PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md)),
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
| P0 | Player preferences store | App | S | — (foundation) |
| P1 | Stored player timezone | App | S | P0 |
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

A single per-player preferences surface (one new table or a `preferences JSONB` on the durable
player record) + GET/PATCH on the player settings route. Everything marked "P0" below stores its
setting here — one migration, one API shape, one DSR entry instead of five.
**Grill:** table vs JSONB column; validation strategy per key; does the existing player settings
surface exist to extend or is this the first one?; DSR export shape.

### P1 — Stored player timezone *(app, S)*

Phase B already captures the browser IANA timezone on every message POST and discards it after
the turn (design §11 B-Q6). Persist it in P0 (browser value as default, user-overridable).
Retires two documented gaps at once: the digest's fixed UTC slot (§11 C-Q3) and the
relative-time-only workaround in nudges (§11 C-Q8).
**Grill:** auto-update when the browser tz changes (travel) or sticky until edited?; per-player
digest delivery vs the group's single slot (interaction with C-Q3's one-post-per-group model —
a *group* digest can't honor every member's morning; see P10 in §3).

### P2 — "You" anchoring in standings & brackets *(UI, S, no deps)*

Auto-scroll to and visually pin the viewer's row in standings; center the bracket on the
viewer's next match (Task-19 is already match-focused); a "you" marker wherever the viewer's
name appears in shared tables. FE-only; the viewer's identity is already in every page's session.
**Grill:** pin-row vs highlight-in-place for standings on small screens; design-token treatment.

### P3 — Identity colors/avatars *(UI, S, no deps)*

Deterministic per-player color (hash of player id → token palette) used consistently across chat
bubbles, standings rows, brackets. Zero configuration, makes every shared surface scannable for
"where am I / where's Bob".
**Grill:** color-only vs initials-avatar; collision handling in small groups; accessibility
(contrast + color-blind-safe palette — must come from design-system tokens, lint gate is total).

### P4 — Local-time rendering everywhere *(UI, S, dep: P1)*

Deadlines, poll target times, match schedules rendered in the viewer's stored tz, relative
phrasing ("in 2 days") demoted to the secondary line. Frontend formatting layer only once P1
exists.
**Grill:** fallback when no stored tz (browser tz? UTC with suffix?); does Coach's *reply text*
also switch to absolute local times (it composes server-side per-asker — feasible since the tz
now rides the job payload) or stay relative?

### P5 — "My pending actions" endpoint + tab badges *(app+UI, M, no deps)*

One read-only endpoint aggregating per player: unscored matches they're in, open polls they
haven't voted in, pending confirm cards only they can act on, nearest deadline. Feeds tab badges
(counts) and P6/P7. All four facts already exist in the DB; this is aggregation, not new state.
**Grill:** endpoint shape (one call per app-open vs per-tab); staleness tolerance / SSE refresh;
badge semantics (count vs dot).

### P6 — "Up next" strip on landing *(UI, M, dep: P5)*

One glanceable card at the top of the landing screen: next match (opponent, court), unscored
match awaiting you, nearest deadline, open poll — each deep-linking to its screen. Converts the
app's most common lookups from three taps to zero; the static sibling of what @coach does
conversationally.
**Grill:** placement (landing page vs persistent header); dismissibility; empty-state content.

### P7 — State-aware composer quick chips *(UI, S, dep: P5)*

The mention picker already pins Coach; add suggestion chips above the composer personalized by
the player's P5 state: "Report score" when a pending match exists (pre-fills the Phase B propose
flow), "Vote" when a poll is open, a generic "@coach when's my next match?" otherwise. Turns the
Phase B machinery into one-tap flows with no new backend.
**Grill:** chip inventory + rotation rules; suppression once used; interaction with the group's
`assistant_enabled=false` (chips that invoke Coach must hide, mirroring the picker).

### P8 — Small touches *(UI, S)*

Your own vote state visually distinct on poll cards; personalized empty states ("Welcome back —
2 matches to score" vs generic zero-states); a personal inbox view over the existing
`NotificationCard`s filtered to "awaiting me" (dep: P5).
**Grill:** none individually heavy — bundle-grill with P6/P7.

### P9 — Per-event notification prefs + quiet hours *(app, M, deps: P0, P1)*

Split the single notify dial (`all`/`mentions_polls`/`muted`) into per-event-type preferences —
deadline nudges, digests, chat mentions, cards — plus local quiet hours (needs P1). Player-level
control complements the owner-level toggles from Phase C (C-Q1's master switch still wins).
**Grill:** matrix size (keep it small — 4 event types × on/off, not a grid of channels);
migration path from the existing 3-value dial; where quiet-hours-deferred notifications go
(drop vs delay — delay needs a scheduler consumer, see the C0 scheduling-reality pin).

### P10 — Persisted display preferences *(app+UI, M, dep: P0)*

Dark mode (token-based design system makes theming feasible), table density, text size, reduced
motion — stored in P0, applied on login, cross-device.
**Grill:** dark mode default (follow system?); scope of the first theme pass (chat + standings
+ nav, not every screen); reduced-motion as an a11y commitment (ties to the TASK7_2 audit);
whether text size defers to browser/OS settings instead of an in-app control.

### P11 — Standings snapshots → personal trends *(app, M, no deps)*

The weekly snapshot store that §11 C-Q11 rejected for the v1 digest — built deliberately this
time. Unlocks: "you're up 2 places" in digests, win/loss streaks, head-to-head records
("you're 3–1 vs Bob"), a personal stats view. Compounds with the community layer's durable
cross-tournament leaderboards.
**Grill:** snapshot cadence + retention; schema (per-player-per-tournament-per-week rows);
DSR erasure of snapshot rows; which consumer ships first (digest movement is cheapest).

### P12 — Availability preferences *(app, M, dep: P0)*

Weekly availability windows per player; Coach's `propose_poll` suggests times that work
("Tue evening — 5 of 6 available"), nudges become actionable ("you and Carol are both free
Thursday"). New read-only tool input for Coach — the registry wall is unaffected (read tool).
**Grill:** granularity (day-part vs hour grid); visibility (do other members see your
availability, or only aggregates?); staleness (availability rots — prompt to refresh?).

### P13 — Skill ratings *(app, L — needs its own grill session)*

ELO-style rating from match history → balanced round-robin seeding, "upset" callouts in
recaps, fairer social-mixer pairings.
**Grill (own session):** visible vs internal-only ratings (social dynamics of a casual app);
per-sport vs global; cold-start; whether this contradicts the community layer's casual framing.

## 3. Cross-cutting open questions (grill these before P0)

1. **Group digest vs personal delivery.** P1 makes *personal* local-morning delivery possible,
   but the Phase C digest is one post per group (C-Q3/C-Q11). Does the group digest stay UTC
   while a P9/P10-era *personal* digest (via the personal notification thread — also the
   deferred T1.4 catch-up trigger) handles the local-time experience? Recommendation to grill:
   yes — don't retrofit per-member timing onto a group post.
2. **Where preferences live in the UI.** A new "My settings" page vs sections inside existing
   pages. The app has group settings but (verify at grill time) no player-settings surface.
3. **Sequencing checkpoint.** Same C-Q5 lesson: P2/P3/P6 change how shared surfaces look for
   everyone. Ship the foundation tier (P0–P5), checkpoint on reception, then continue.
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
document's foundation tier (P0–P5) and its reception checkpoint; it also benefits from P11
(trends feed data-grounded coaching) and P12 (availability covers the structured half of what
players would ask Coach to remember).
