# Group Challenges — Strategy
## Inter-group casual tournaments: one group challenges another; subgroup tags derive the rivalry

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-16
**Status:** 📐 DESIGN (strategy draft) — **not yet grilled.** Shape agreed in owner discussion
2026-07-16 (the subgroup-tag model and dual-poll flow below are the owner's calls); a grilling
session resolves §6 into a full `GROUP_CHALLENGE_DESIGN.md`. No build work implied yet.

---

## 1. Framing — why group-vs-group

The underlying want is "find people to play." Individual nearby-player matchmaking was discussed
and set aside: it stands on three missing pillars (a skill rating — P13 is ungrilled; player
location data — none exists; and a stranger-contact + safety layer — DMs/blocking/reporting are
deliberately absent), and it flips the app's privacy posture, since today **no player is
discoverable by strangers at all**.

Group-vs-group sidesteps all three. The *group* is the discoverable/contactable unit; contact is
**owner-to-owner** (the multi-owner model exists); members are exposed only when the joint
tournament forms — the same name-visibility as any tournament they join today. Skill becomes an
owner-declared group level (later, for discovery); location becomes one coarse owner-set field
(later, for discovery). And inter-club rivalry is the classic retention loop of racquet-sport
clubs — it re-engages **whole groups at once**.

## 2. The core mechanism — subgroup tags, not multi-group tournaments (owner's call)

**Do not** restructure the tournament↔group linkage. Instead, create one ordinary casual
tournament rostered with members of *all* participating groups, each registration carrying an
**origin tag**:

- `tournaments.group_id` (single FK, migration 044) stays as-is = the **host** group. Every code
  path assuming one organizing group keeps working.
- One nullable `origin_group_id` column on `player_registrations` records which group each
  player came through.
- The casual engine (round-robin / social-mixer) runs unchanged — it just sees a bigger roster.
- **Group-vs-group stats are a query, not a feature**: join match results to the registrants'
  tags; cross-tag matches → the rivalry tally ("Group A 7–5 Group B"). Derive-don't-store, same
  philosophy as `rank_reason` and the stats dashboard.
- The existing `UNIQUE(player_id, tournament_id)` constraint **structurally solves dual-membership**:
  a player in both groups registers once, carries exactly one tag per tournament.

## 3. The v1 flow (verified against existing machinery, 2026-07-16)

1. **Challenge handshake** — Group A's owner sends a challenge to Group B's owner
   (challenge-by-invite; owners already know each other, like club captains). *New build:
   challenge entity — participating groups, per-group poll ids, status, config (target time,
   format, min players per side).*
2. **Accept → one availability poll auto-created in each group** — the existing poll-creation
   path, system-initiated with the challenge's config pre-filled. Polls already carry
   `auto_close_at`, `auto_launch`, `min_players`, `launch_match_format` (migration 047).
3. **Existing P3.3 auto-close sweep closes both polls** — no new scheduling machinery.
4. **Both closed + each side ≥ min → merged launch** — *new build: a dual-poll variant of the
   G4.5 launch* (`player-groups.ts:831`): registers the union of yes-voters through the normal
   `player_registrations` path, stamping `origin_group_id`; tournament created as today (casual,
   unlisted, `group_id` = host).
5. **Fizzle case** — one side misses `min_players`: notify both owners; extend poll or cancel.
   Already modeled per-poll.

**Total new build: the challenge entity + the dual-poll launch variant + one column.** Poll
creation, auto-close, thresholds, registration, engine, and visibility are all reuse.

## 4. Scale — N-ary by construction, capped at 2 for v1 UX

Nothing in the model is pairwise: the tag is N-ary, the challenge holds a *list* of
(group, poll), the launch unions N polls, and stats generalize to a standings-of-groups table.
**Design the challenge entity N-ary from day one** (retrofitting pairwise schemas is the classic
regret) but **cap v1 UX at 2 groups** — single accept, no RSVP fan-out states.

What strains at N=5–10 (v2+ work, not data-model work):
- **RSVP fan-out**: per-group invite status, RSVP deadline, "launch with whoever's in, min K groups."
- **Format ceiling**: 10 groups × 8 players = 80-person roster; round-robin is O(n²) and mixers
  strain past ~24–32 people. Past the ceiling the product answer is the **structured engine**
  (group stages + knockout already exist): a multi-club event = a scheduled tournament whose
  registrations carry origin tags, with pools optionally **seeded by origin group**. The same
  one-column mechanism serves both ends of the scale.

**Ladder:** v1 two-group challenge-by-invite → v2 N-group RSVP + opt-in group directory
(area + level fields, owner-consented) → v3 structured multi-club events, origin-seeded pools,
rivalry/standings boards.

## 5. Monetization boundary *(refined 2026-07-16 — owner challenged "free forever")*

**Member-side: free-forever** (casual-mode boundary, [MONETIZATION_DESIGN.md](./MONETIZATION_DESIGN.md)
§3) — joining a challenge tournament never requires an account.

**Owner-side: open question, deliberately NOT settled here.** Owner instinct: the owners actioning
challenges are the plausible payers (the strategy doc's original organizer-WTP thesis; group owners
are the community-layer analog of organizers, whose registration pricing is already parked). Facts
recorded for that grill:
- Owners currently need **no account at all** (group ownership runs on player sessions) — gating
  challenge actions on a paid account would be the first community-layer role coupled to the paid tier.
- **Symmetric gating is ruled out** (two-sided paywall: challenge probability ≈ paid-owner-rate²,
  feature looks dead pre-density) — if gating ever lands, it's initiate-paid/accept-free or a quota.
- **v1 ships free**: challenges are the app's strongest acquisition mechanic (a challenge activates a
  whole second group), and taxing the growth loop that feeds the $10 personal tier is backwards while
  density is low.
- The **v2 group directory is the natural paid owner surface** (charging to *discover new clubs* is a
  service; charging to *invite a club you already know* is a toll) — route owner-side pricing to the
  parked **organizer/owner-tier grill** (MONETIZATION_DESIGN §7), decided with v1 usage data in hand.

The premium tie-in meanwhile stays indirect: rivalry keeps whole groups playing → feeds the
stats/coach funnel; inter-group results land in the premium dashboard's casual section
([STATS_DASHBOARD_DESIGN.md](./STATS_DASHBOARD_DESIGN.md) §3 #3), and a rivalry-history view is a
natural later premium surface.

## 6. Open questions for the grilling session

- **Challenge entity shape** — statuses (pending/accepted/polling/launched/fizzled/cancelled),
  who may cancel, expiry of unanswered challenges.
- **Leaderboard attribution** — cross-tag matches log to *both* groups' `group_match_log` boards?
  Same-tag matches to their own group only? (Mechanical either way; needs a decision.)
- **Dual-membership tag choice** — first-confirmed-poll wins vs. the player picks a side.
- **Defaults** — min players per side, poll window length, format default (mixer vs round-robin).
- **Feed presence** — how the challenge + joint tournament appear in each group's feed/cards
  (assistant `propose_casual_launch` card has a sibling here?).
- **Cross-tag pairing preference** — should the mixer/scheduler prefer inter-group matchups
  (v1: no; tally counts whatever cross-tag matches occur — confirm).
- **Rivalry stat surface** — where the tally lives (tournament page banner? group feed recap?
  premium dashboard?), and its exact derivation.
- **v2 directory prerequisites** — group area + level fields, owner consent posture, discovery UX.
- **Naming** — "challenge," "friendly," "club match."
- **Abuse/annoyance** — challenge spam between strangers' groups (v1 invite-by-link largely
  avoids it; confirm rate limits).

## 7. Relationship to other docs

- [PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md) — polls, casual mode, owner model; this is
  the community layer's first cross-group feature.
- [MONETIZATION_DESIGN.md](./MONETIZATION_DESIGN.md) — free-forever boundary (§5 here).
- [STATS_DASHBOARD_DESIGN.md](./STATS_DASHBOARD_DESIGN.md) — casual section shows inter-group
  results; rivalry views derive from the same tags.
- [MESSAGING_DESIGN.md](./MESSAGING_DESIGN.md) — challenge notifications ride the existing
  feed/notification surfaces.
- A later `GROUP_CHALLENGE_DESIGN.md` (grilled) → `GROUP_CHALLENGE_IMPLEMENTATION.md`.
