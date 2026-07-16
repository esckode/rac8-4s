# Personal Stats Dashboard — Design
## The premium bundle's "am I improving?" page — presentation of existing data only

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-16 — **grilled to resolution 2026-07-16, see §3.**
**Status:** 📐 **Design (grilled)** — the launch-blocking build from
[MONETIZATION_DESIGN.md](./MONETIZATION_DESIGN.md) §4 (⚖ #9: full advertised bundle ships day one).
**Hard constraint carried in:** presentation of *existing* data only — no rating computation; skill
ratings remain [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) P13's own future grill.

---

## 1. Framing

The $10/mo bundle advertises "personal stats." The coach answers "am I getting worse?"
conversationally; this page is the visual, glanceable version — and the thing a subscriber can
show a friend. v1 draws only from data that already has queries or repo methods.

## 2. Grounding — data sources (verified 2026-07-16)

| Source | What it gives | Bounds |
|---|---|---|
| Completed matches (core tables) | All-time W-L, streaks, full match history, opponents, scores | Durable forever; **includes doubles** (player on winning/losing team) |
| Live standings (`calculateStandings` + `buildRankReason`, as composed in `assistant/player-snapshot.ts`) | Per-active-tournament rank, W-L, `rank_reason` | Live-computed; handles doubles |
| `standings_snapshots` (migration 055, P11 weekly digest sweep) | Weekly rank/wins/sets time-series per tournament | **Singles-only** (doubles snapshot deferred); **purged 90 days after tournament completes** (`deleteForOldCompletedTournaments`) |
| `group_match_log` (migration 045) + `leaderboard-repository.ts` | Casual results incl. pairs; per-group individual/pair leaderboards exist | Cross-group *personal* aggregate is a **new query**; DSR anonymizes slots (`anonymizeMatchLogSlotsFor`) |

## 3. Grill decisions (2026-07-16)

⚖ = owner call that diverged from the recommendation.

| # | Question | Decision |
|---|---|---|
| 1 Surface | Where does it live? | **Own page `/stats`** — premium (account-JWT) route, linked prominently from `/profile` and the home hub. No bottom-tab rework at v1 (tab promotion is a cheap later change); a flagship paid feature gets its own URL |
| 2 Content | What's on it? | **Core four:** ① all-time W-L record + current streak, ② active-tournament standings cards (rank, W-L, `rank_reason` — reuse the snapshot composition), ③ weekly rank-trend sparkline per tournament (singles-only, active + ≤90-day-completed — the 055 bounds), ④ full match history, paginated. **Head-to-head deferred to v1.1** (new aggregate surface + touches other players' data; the coach already discusses named opponents) |
| 3 Casual ⚖ | Do casual (group) results appear? | **Include casual, as a separated section** (owner call; rec was tournament-only). A "Casual play" section aggregates `group_match_log` across the player's groups: individual casual W-L (incl. matches played in a pair) + per-group breakdown rows. **Never blended** into competitive numbers — separate section, separate totals. Cost accepted: a second aggregation pipeline in the launch build |

### Stated assumptions (not grilled — flag if wrong)

- **Doubles:** competitive W-L, streaks, and history **include** doubles matches; only the rank
  sparkline is singles-only (055 limitation, already a documented deferral). Sparkline absence for
  doubles-only tournaments is handled by simply omitting the chart, not an error state.
- **Privacy:** the dashboard is **private — own stats only**. No viewing other players' dashboards;
  group leaderboards remain the comparative/social surface. Consistent with the coach privacy posture.
- **Retention unchanged:** the 90-day snapshot purge stays (it's a deliberate retention decision).
  Trends are honest about their window ("last N weeks"); no new long-term data class for v1.
- **Empty state matters:** a brand-new subscriber has zero matches — the flagship page must not look
  broken. Empty states link to `/browse` (join a tournament) and groups (play casually).

## 4. API sketch

- `GET /player/stats` — account-JWT (premium) route: `{ record: {wins, losses, streak},
  tournaments: [standings cards + snapshot series], history: {page, items} }`. Read-only → `debug`
  logging via middleware suffices (CLAUDE.md §6); register before any param routes (§10).
- `GET /player/stats/casual` — cross-group aggregate from `group_match_log` (or folded into the
  same endpoint; implementation's call). New repo method(s) beside the per-group leaderboard queries.

## 5. Build notes (for the implementation doc)

- **TDD-first** (CLAUDE.md §4): unit tests for the aggregation queries + e2e spec
  (`stats.spec.ts`) and `e2e-scenarios.md` entries **before** implementation; red tests committed
  separately.
- Sparkline: no chart lib in the frontend — a small inline SVG per the design system
  (DESIGN_SYSTEM.md tokens); load the dataviz skill at build time.
- `docs/assistant-help.md` gains "where do I see my stats?" answers in the same change (CLAUDE.md §9).
- Route protection: `/stats` joins the auth-gated list (rac8-4s-HL.md + `route-protection.spec.tsx`
  updated in the same change, CLAUDE.md §9).

## 6. Deferred (with triggers)

| Item | Trigger |
|---|---|
| Head-to-head per-opponent records (v1.1) | Subscriber requests / coach H2H questions in usage logs |
| Doubles rank trends | 055's own deferral — doubles snapshot support lands |
| Career-long trend arcs (beyond 90-day purge) | Real demand → new retention decision, its own data class |
| Skill ratings on the dashboard | P13's own grill (PERSONALIZATION_DESIGN.md) |
| Bottom-tab promotion for `/stats` | Usage shows it's a top-3 destination |

## 7. Relationship to other docs

- [MONETIZATION_DESIGN.md](./MONETIZATION_DESIGN.md) §4 — this doc is that launch blocker's scope pass.
- [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) — P11 snapshots feed §3 ②③; P13 stays out.
- [COACH_1TO1_DESIGN.md](./COACH_1TO1_DESIGN.md) — same underlying reads as the coach player snapshot;
  the dashboard is the visual sibling of that text block.
- [PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md) — casual section (⚖ #3) reads its match log;
  group leaderboards remain the social surface.
- Next: fold into `MONETIZATION_IMPLEMENTATION.md` as the first build phase (it blocks launch).
