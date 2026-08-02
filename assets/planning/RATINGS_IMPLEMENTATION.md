# Skill Ratings (P13) — Implementation Plan

> Implements [`RATINGS_DESIGN.md`](./RATINGS_DESIGN.md) (grilled ×4, R1–R29).
> **Read the design first** — §3c in particular. This plan assumes its decisions and does not re-argue
> them, and the fourth pass **reversed** two of them.

**Date:** 2026-07-30 · **Status re-planned 2026-08-02:** 🔧 **In progress on `feat/ratings-p13`.**

**Phases 0–8 ✅ built** (each red-then-green; per-phase commit refs below). ⚠ **Phase 8 is superseded
and Phase 9 was dropped before it was built** — the R26–R29 grill established that R20's pairing yields
one distinct partner per player forever, so pairing stops consuming the rating (R26), the rating becomes
display-only (R27), and with no consumer needing freshness the async work loses its case (R29).

**Phases 11 → 12 → 13 → 10 built 2026-07-31**, markers flipped and commit refs recorded 2026-08-02
(Task 14.4). **Not building:** Step 5.3, Phase 9.

**Remaining: [Phase 14](#phase-14--post-verification-fixes--not-built)** — the fixes from the
2026-08-01 verification of that delivery. **Tasks 14.1–14.4 and 14.7 are done**, including
[ISSUE-48](./UAT_ISSUES.md#issue-48) (Task 14.1: a player's *first* match in a sport/format settling
without a lock — now closed). **Tasks 14.5 (e2e sweep reconciliation) and 14.6 (coverage-gate scope
call) remain** before this branch merges.

Every step is **TDD-first** per CLAUDE.md §4: write the test, watch it fail *and read why*, commit the
failing test, then implement and commit separately (§11). Every step names the model it is sized for.

---

## Model assignment — and why

Sized from what each model actually did on the ISSUE-39–44 batch in this repo.

**Haiku** handles work that is *mechanically specified against an existing pattern*: a migration that
mirrors migration 060, a repository that mirrors `player-settings-repository.ts`, a one-line addition
to a fan-out with three visible precedents beside it. Its failure mode is not bad code — it is
plausible code that satisfies a naive test.

**Sonnet** takes anything where **several rules interact**, where **a wrong implementation still
passes the obvious test**, or where the change **reaches across files**. On this repo Sonnet caught a
dead stub nobody had specified and flagged its own deviation; that judgement is what the rating maths
and the correction semantics need.

| Phase | Work | Model | Why |
|---|---|---|---|
| 0 | Constants | **Human/Sonnet** | A product judgement, not a coding task |
| 1 | Migration + repository | **Haiku** | Direct pattern copy, precedents in-repo |
| 2 | Rating maths (pure) | **Sonnet** | R9×R13×R18×R19 interact; wrong-but-passing is easy |
| 3 | Apply + correct service | **Sonnet** | R17's reverse-latest trap is documented and subtle |
| 4 | Wire into score paths | **Sonnet** | Two call sites, offline-queue interaction |
| 5 | Seed prompt + replay | **Sonnet** | Ordering, and replay reuses Phase 3's primitive |
| 6 | DSR erase + export | **Haiku** | One line each, three precedents adjacent |
| 7 | Read API + `/profile` | **Haiku** | Read-only render against existing page |
| 8 | Auto-pairing (R20) | **Sonnet** | Touches live pairing code that already works |
| ~~9~~ | ~~Async application (R22–R25)~~ | — | ⛔ **Dropped** — superseded by R29/Phase 12 |
| 10 | Test debt + merge gate | **Sonnet** | Reaches four files; 10.3 is a judgement call a mechanical fix gets wrong |
| 11 | Remove rating-based pairing (R26) | **Sonnet** | Deletion inside live pairing code; two rules sit in the block and are easy to drop with it |
| 12 | Batched transactional settle (R29) | **Sonnet** | Transaction + locking, and the harness rewrites savepoints under it |
| 13 | Last-10-partners panel (R28) | **Haiku** | One read route + one panel, both against existing patterns |
| 14 | Post-verification fixes | **Sonnet/Haiku** | Per-task, see the table in that phase |

**Order: 11 → 12 → 13 → 10.** Phase 11 deletes the ratings read from `db.ts`, which shrinks what 12 has
to reason about; 10 runs last because its ratchet reads the finished branch.

⛔ **Step 5.3 is not being built** *(owner, 2026-07-31)* — R27 made the rating display-only, which
removed every justification for the seed prompt. The endpoint stays; the UI does not get built.

**Escalation rule.** If a Haiku step needs a decision the plan does not already make, it must **stop
and report**, not choose. Any Haiku step that comes back with tests changed to fit the implementation
(rather than the reverse) gets redone by Sonnet.

---

## Phase 0 — Constants ✅ signed off 2026-07-30

**Model: human decision — done. Phase 2 is unblocked.**

§6 of the design says the constants must be *derived, not guessed*, and that there is no real data to
derive them from (all 290 doubles matches are synthetic). That is a genuine blocker for an exact
answer but **not** for implementation, because R20 means nothing consumes the rating until a bucket
leaves provisional. So the number can be imperfect for a while without affecting pairing.

**Approach:** put every constant in one file, `packages/api/src/services/ratings-constants.ts`, with
the reasoning in comments. Tuning later is then a one-file change with no logic touched.

**All values signed off by the owner, 2026-07-30.** The four that were proposals are now decided; the
rest were already fixed by the design. Recorded with their consequences so a future tune starts from
the reasoning rather than re-deriving it.

| Constant | Proposed | Reasoning |
|---|---|---|
| `LOGISTIC_DIVISOR` | **120** ✅ | ⚠ **Not Elo's 400.** Elo's 400 encodes "400 points ≈ 10:1 odds" on a scale where 100 points is a modest edge. Here 100 points = a full NTRP level, which is close to decisive. A divisor near 120 makes a one-level gap ≈ 85% expected win, which matches how racket players actually experience a 3.0 vs 4.0 match |
| `K_PROVISIONAL` | **24** ✅ | R13 wants a wrong seed corrected "in a few sessions, not a season". At ~5 matches a session, K=24 moves a 100-point error inside ~2–3 sessions |
| `K_SETTLED` | **10** ✅ | Roughly Elo's club value, scaled down for the coarser band |
| `PROVISIONAL_MATCHES` | **10** ✅ | Bucket leaves provisional here. Load-bearing beyond display — R20 gates pairing on it |
| `SEED_DEFAULT` | **270** | R4, already decided |
| `RATING_MIN` / `RATING_MAX` | **100 / 500** | R18, already decided |
| `TAIL_LOW` / `TAIL_HIGH` | **150 / 450** | R19, already decided |
| `TAIL_FACTOR` | **0.5** | R19, already decided ("double the results to cross") |

**What these values produce** — the sanity check the sign-off was made against, kept so Phase 2 can
assert against intent rather than arithmetic:

| Rating gap | Stronger player's win probability |
|---|---|
| 0 (equal) | 50% |
| 50 (half a level) | 72% |
| 100 (one NTRP level) | **87%** |
| 200 (two levels) | 98% |

| Result | Provisional (K=24) | Settled (K=10) |
|---|---|---|
| Beat someone 100 **above** you | **+20.9** | +8.7 |
| Beat an equal | +12.0 | +5.0 |
| Beat someone 100 **below** you | +3.1 | +1.3 |
| Lose to someone 100 above | −3.1 | −1.3 |
| Lose to someone 100 below | −20.9 | −8.7 |

R9 is visible here: beating someone a level up is worth **~7×** beating someone a level down. And a
player seeded 100 too low gains ~21/match against stronger opponents, correcting a bad seed in ~5
matches — R13's "a few sessions, not a season".

**Deliverable:** the constants file with comments. No tests — a constants module has no behaviour.
Phase 2 tests its *consequences*.

### 0a. No hard-coded constants — a hard rule, enforced 🚩

**`ratings-constants.ts` is the only place any of these numbers may appear.** Tuning must stay a
one-file change; a value duplicated anywhere else is a silent bug the moment someone tunes it. This
applies to **every** step below, and reviewers should reject on it.

**The four places this rule actually gets broken** — each is a real trap, not a hypothetical:

1. **The migration.** ⚠ **Do NOT write `DEFAULT 270` (or any bound) into the SQL.** It is the natural
   thing to type in Step 1.1 and it puts `SEED_DEFAULT` in two places that no test compares. A tuned
   constant would then silently disagree with every pre-existing row. The column is created with **no
   default**; the service supplies the seed from the constant on first write.
2. **The tests.** A test that asserts `expect(rating).toBe(270)` re-encodes the constant. Import it, or
   assert a property (Phase 2 already mandates properties over exact deltas for this reason). ⚠ **A
   test that fails after a legitimate tune is a bug in the test** — do not "fix" it by editing the
   expected number, which is exactly the failure this rule exists to prevent.
3. **The frontend.** The frontend resolves `@shared`, **not** `@core`, so API-side constants are not
   importable client-side without wiring both `vite.config.ts` and `jest.config.js`. **Do not wire
   them, and do not retype the values.** The API is the sole source of truth: `GET /player/ratings`
   (Step 7.1) returns `{ min, max, seedDefault }` alongside the buckets, and the seed prompt (Step
   5.3) renders its range hint and validation bounds from that response. The frontend never knows a
   rating constant.
4. **Validation and clamping.** Both the seed endpoint's input check (Step 5.1) and the calculator's
   clamp (Step 2.1) must read `RATING_MIN`/`RATING_MAX` — not restate `100`/`500`. Same for the tail
   thresholds in R19.

**Verification, per step:** the only numeric literals permitted in ratings code are `0` and `1`.
```bash
grep -rnE "\b(270|500|450|150|120|100|24|10|0\.5)\b" \
  packages/api/src/services/ratings-*.ts \
  packages/api/src/repositories/ratings-repository.ts \
  db/migrations/061_player_ratings.sql \
  packages/frontend/src/pages/Profile.tsx \
  packages/frontend/src/pages/__tests__/Profile.spec.tsx \
  packages/frontend/src/api/client.ts \
  | grep -v ratings-constants.ts
# expect: no matches, OR a hit inside a mocked wire-format response/fixture
# (a `json: async () => ({...})` mock, a component-prop fixture) — those
# restate the API's response shape, not a rating constant, and are the
# trap-3 exception (below), not a violation. Read each hit; do not just
# count them — CSS custom-property values (e.g. `--ink-500`) match too.
```

⚠ **Trap 3 exception, Task 14.2:** the frontend has no `@core` alias and must not gain one just to
satisfy this grep (trap 3 itself). So a frontend hit inside a mocked API response or component-prop
fixture is expected and is verified **by reading**, not by the grep passing — annotate it with a
comment naming §0a trap 2/3 so the next reader doesn't "fix" it into an import
(`Profile.spec.tsx`'s `seedDefault: 270` is the existing example). A hit **outside** a mock/fixture —
inline in component or client logic — is a real violation.

**Optional guard, and it fits this repo.** The same `no-restricted-syntax` mechanism ISSUE-44c used to
ban the `-[--token]` class form can ban numeric literals in `ratings-*.ts`. Worth doing if these files
are expected to churn. Phase 0's values are now signed off and stable, so this is likely unnecessary —
the §0a grep covers it. Decide at Phase 2, not before; that is when the shape of the code is known.

---

## Phase 1 — Data layer ✅ built (`71429c0` → `1fe631a`, `f74b394`)

**Model: Haiku.** Both artefacts have a direct in-repo template.

### Step 1.1 — Migration `061_player_ratings.sql`

- **Pattern to copy:** `db/migrations/060_auto_pair_consent.sql` for header/comment style.
- Two tables, exactly as design §4:
  ```sql
  player_ratings         (player_id, sport, format) → rating, matches_played, updated_at
  player_rating_history  (player_id, sport, format) → delta, rating_after, match_id, created_at
  ```
- `player_ratings`: PK `(player_id, sport, format)`. `rating` numeric. FK `player_id` → `players`.
- `player_rating_history`: surrogate id, **append-only**, index on `(player_id, match_id)` for R17's
  most-recent lookup, and on `(player_id, sport, format, created_at)` for replay order.
- ⚠ **Do NOT add `UNIQUE (player_id, match_id)`** — design §4 explains why: it forces corrections to
  overwrite in place, destroying both the audit trail and R17's mechanism. This is the single most
  likely wrong instinct in this step.
- ⚠ **Do NOT give `rating` a SQL `DEFAULT`** (§0a trap 1). `DEFAULT 270` is the natural thing to type
  and it duplicates `SEED_DEFAULT` into a place no test compares. No default in the column; the
  service supplies it from the constant.

**Red:** a migration test asserting both tables exist with the expected columns after `runMigrations`.
Follow whatever existing migration specs do; if none exist, Step 1.2's repository tests cover it and
this step commits with the migration only.
**Verify:** `npm --workspace=packages/api exec -- jest --findRelatedTests packages/api/src/migrations.ts --bail`

### Step 1.2 — `RatingsRepository`

- **Pattern to copy:** `packages/api/src/repositories/player-settings-repository.ts` — same shape,
  same `deleteFor` convention, same pool handling.
- Methods: `getFor(playerId, sport, format)`, `getAllFor(playerId)`, `upsert(...)`,
  `appendHistory(...)`, `findLatestHistoryFor(playerId, matchId)`, `findHistoryFor(playerId, ...)`
  (ordered, for replay), `deleteFor(playerId)` (current + history).
- ⚠ Per CLAUDE.md §7: use plain `this.pool.connect()` + `BEGIN/COMMIT/ROLLBACK` where a transaction is
  needed. **Do not** add test-only branching.

**Red:** integration spec covering each method, including that `deleteFor` removes *both* tables' rows
and that `findLatestHistoryFor` returns the newest row when several exist for one match (this is what
R17 depends on).
**Verify:** `npm --workspace=packages/api exec -- jest --findRelatedTests packages/api/src/repositories/ratings-repository.ts --bail`

---

## Phase 2 — Rating maths (pure module) ✅ built (`6bd186d` → `23eabbc`)

**Model: Sonnet.** Four rules interact here and a plausible implementation passes a naive test.

### Step 2.1 — `ratings-calculator.ts`, pure functions only

No DB, no I/O. Signature roughly:
```ts
computeDelta(playerRating, opponentRating, won, matchesPlayed): number
```
Composition order matters and must be **explicit**:
1. **R9** — expected score from the rating gap via `LOGISTIC_DIVISOR`
2. **R13** — **decay** K from `K_PROVISIONAL` to `K_SETTLED` as a *linear ramp*:
   ```
   K(n) = K_SETTLED + (K_PROVISIONAL − K_SETTLED) × max(0, 1 − n / PROVISIONAL_MATCHES)
   n=0 → 24    n=5 → 17    n=10 → 10    n>10 → 10
   ```
   ⚠ **Not a hard switch at `PROVISIONAL_MATCHES`.** R13 says the step *"decays with matches played"*,
   and a switch would jolt the rating — match 10 moving 24 points and match 11 moving 10. The ramp
   needs no extra constant
3. **R19** — if the *result* moves the rating toward a bound and the rating is in that tail zone,
   halve it. **Directional only**: at 470 a win is halved, a loss is not; at 130 a loss is halved, a
   win is not
4. **R18** — clamp to `[RATING_MIN, RATING_MAX]` last (read the constants; do not restate `100`/`500` — §0a trap 4)

**Red — assert properties, not exact numbers.** This is deliberate: the constants are unsigned-off
(Phase 0) and exact-value tests would have to be rewritten when they are tuned, which invites someone
to "fix" the test instead of the code.
  - beating a stronger opponent gains strictly more than beating a weaker one (R9)
  - a provisional player moves strictly more than a settled one, same inputs (R13)
  - at 470 a win gains ≤ half what the same win gains at 300; **a loss at 470 is not halved** (R19)
  - at 130 a loss drops ≤ half what it drops at 300; **a win at 130 is not halved** (R19)
  - no input produces a result outside `[100, 500]` (R18) — property-test across the range
  - a win never decreases a rating and a loss never increases it
  - **K decreases monotonically** with `matchesPlayed` and is **continuous** — no jump at
    `PROVISIONAL_MATCHES` (this is the guard against someone re-implementing the hard switch)
  - K never falls below `K_SETTLED`, however many matches are played

**Coverage:** this module is pure and fully reachable; expect ~100%. It is also where the
`coverageThreshold` in `packages/api/jest.config.js` may be ratcheted afterwards — run
`node scripts/ratchet-coverage.mjs` after Phase 4, not per-step (CLAUDE.md §13).

### Step 2.2 — doubles (R10)

`computeTeamDelta` — team rating is the **mean** of partners; both partners move **equally** by the
delta computed for the team.

**Red:** two partners rated 200 and 400 vs a team meaned 300 draw ~zero movement; both partners move
by the same amount, not proportionally to their own rating.

⚠ **Open, decided provisionally during Phase 3 (2026-07-30):** `computeTeamDelta` takes ONE
`matchesPlayed` for the K ramp, but partners can have different counts. **Implemented as the mean**,
mirroring how the same function already means the team *rating*. Not exercised by the current suite —
all its tests use fresh players. The alternative is `min`, which treats the team as provisional
whenever *either* partner is new: better for the newcomer's calibration (their guess corrects faster)
at the cost of moving the settled partner in larger steps than their own experience warrants. R10's
"both partners move equally" is what forces a single team-level K and creates the tension. **Revisit
with real doubles volume** — same trigger as R10's partner-quality weighting in design §6.

---

## Phase 3 — Apply and correct ✅ built (`453296b` → `ad76321`, `db1d19c`)

**Model: Sonnet.** R17's trap is documented in the design and is easy to get backwards.

### Step 3.1 — `applyRatingForMatch(matchId, …)`

Loads both/all participants, computes deltas via Phase 2, upserts `player_ratings`, appends history,
increments `matches_played`.

**Red:** a scored singles match moves both players in opposite directions; a doubles match moves all
four; history rows are written with the correct `match_id`.

### Step 3.2 — `correctRatingForMatch(matchId, …)` — R16/R17

The critical step. Semantics, exactly:
```
if newScore == storedScore: return            // no-op short-circuit
last = MOST RECENT history row for (player, match)
rating -= last.delta
rating += computeDelta(against CURRENT ratings)
append a NEW history row
```
⚠ **Reverse the most recent delta, never the original.** Get this backwards and a replayed edit
double-corrects. This is not hypothetical: the service worker replays queued score writes on
reconnect (`sw-lib/sync-queue.ts`).
⚠ **No cascade.** Opponents keep the deltas they already earned. Design §4 and R16 both refuse this
deliberately — do not "improve" it into a replay.

**Red — the idempotency test is the point of this step:**
  - applying a correction twice with identical input leaves the rating unchanged after the first
  - a correction that flips the winner reverses the original direction
  - `matches_played` does **not** increment on a correction (it was already counted)
  - an unchanged score writes **no** history row

---

## Phase 4 — Wire into the score paths ✅ built (`87061a5` → `0fc8d0a`) — ⚠ internals reworked by Phase 12

**Model: Sonnet.** Two call sites with different semantics.

### Step 4.1 — submission (R15)

Hook `applyRatingForMatch` into `score-service.ts`, at the point that currently logs
`score.submitted` (**`score-service.ts:239`**).

⚠ Rating movement must **never fail the score write**. Wrap it so a rating error logs and continues —
there is precedent at `tournaments.ts:469` ("Best-effort: swallow enqueue errors, never fail an
already-committed…"). A score is the user's data; a rating is derived.

### Step 4.2 — edit (R16)

Hook `correctRatingForMatch` into the `PATCH …/matches/:matchId/score` handler in `tournaments.ts`,
after the existing update. Applies to **both** branches — participant `score.edited` and organizer
`score.overridden` — since either changes the result.

**Red:** an integration test that submits, asserts the ratings moved, edits to flip the winner, and
asserts they moved back the other way. Plus: a rating failure does not 500 the score request.

**Scope note:** knockout is out — design §6 records it as moot while play is casual round-robin.

⚠ **Known gap, found during Phase 4 (2026-07-30): a match first scored via PATCH gets no rating.**
Phase 4 wires *apply* into submission (POST) only, so `correctRatingForMatch` is skipped when
`match.winner_id` was never set — there is nothing to reverse. Harmless today, because POST is the
only way to score a pending match. **But it becomes live if [ISSUE-46](./UAT_ISSUES.md#issue-46) is
fixed via its "route on role" option**, which would have an organizer PATCH a never-played match —
and that result would then never move a rating, silently. Whoever picks up ISSUE-46 must either take
the "gate the button" option or extend this hook to apply (not correct) when there is no prior
winner. Cross-referenced in ISSUE-46.

---

## Phase 5 — Self-rating seed *(replay removed, R21)* — 5.1/5.2 ✅ built, **5.3 ⛔ NOT BUILDING**

**Model: Sonnet.** 5.1/5.2 landed in `146d972` → `9ac5813`, then R21's gate in `3bd9bd3` → `a74b6aa`.

⚠ **Rewritten 2026-07-30 after R21.** The original Phase 5 asked for the self-rating at the first
*scored* match, which forced a "replay" of already-played matches onto the new baseline. R21 moves the
question to **tournament registration — before any score exists** — so there is nothing to replay.
Steps 5.1/5.2 were implemented under the old design (commits `146d972`, `9ac5813`) and **the replay
must now be removed**.

### Step 5.1 — `PUT /player/ratings/seed`, gated

Accepts a self-rating for one sport; seeds **both formats**. Validate against `RATING_MIN`/`RATING_MAX`
imported from the constants (§0a).

**New gate:** reject when the bucket already has `matches_played > 0` — seeding is only legal before
the first scored match. This is what makes replay unnecessary, and it also kills the double-seed
double-count bug for free.

### Step 5.2 — ~~replay on seed~~ **REMOVED**

Delete `seedAndReplayBucket` and its replay tests. Seeding now simply sets the baseline, because by
construction there is no history to reconcile.

### Step 5.3 — prompt UI ⛔ **NOT BUILDING** *(owner, 2026-07-31)*

> ⛔ **Decided: do not build.** The grill that produced R26–R29 dissolved this step rather than
> answering it. Every justification for a self-rating seed was about feeding R20's pairing — entry
> point for a newcomer, the sandbagging clamp, placement at group join. **R27 makes the rating
> display-only**, so a wrong or missing seed now costs the player nothing but a slightly odd number on
> their own private page, which R13's provisional period corrects anyway.
>
> `PUT /player/ratings/seed` **stays** (built, gated, harmless) — do not remove it. If a consumer is
> ever reintroduced, this step and design §3c's upward-only clamp become correct again together.
>
> Everything below is the pre-decision analysis, retained for that case.

**Model: Sonnet.** Small in code, but it needs a decision made before any of it is written.

**Current state, verified 2026-07-31.** `PUT /player/ratings/seed` has **no caller anywhere in the
frontend** — `api/client.ts` exposes `fetchPlayerRatings` and no seed function, and no component
references the route. So the endpoint is unreachable, **every player today holds `SEED_DEFAULT` (270)**,
and R21's "the gap it accepts" (an auto-registered player never gets asked) currently applies to 100% of
players, not the edge case R21 described.

⚠ **The blocker: R21 says "ask at tournament registration," and under the casual-unlisted scope that
moment does not exist as a UI.** A group launch auto-registers every "In" voter server-side
(`routes/player-groups.ts:947-949`) with no interactive step. The only interactive registration surface
is `TournamentBrowse.tsx`, which sits behind the public-discovery block
([ISSUE-29](./UAT_ISSUES.md#issue-29)). Building the prompt "at registration" as written would ship it
onto a screen nobody reaches.

**Recommended placement — needs an owner call before implementing.** Put it on **`/profile`, beside the
existing "Your Rating" panel**, as an editable self-rating for any bucket still at `matches_played = 0`.
Rationale: the panel already exists (Step 7.2), it is where a player goes to look at their rating, the
409 gate (`routes/player.ts:214-224`) already enforces exactly the right legality window server-side,
and it works regardless of how the player got registered. The cost is that it is *pull* rather than
*push* — players must go looking — which argues for pairing it with a one-time nudge on PlayHub for
players whose buckets are all unseeded.

⚠ **Do not build a registration-time modal until public browse is unblocked.** If the owner picks that
route instead, this step defers to the Public discovery cluster in `BACKLOG.md` rather than being built
against a dead surface.

**Implementation, once placement is settled (assumes `/profile`):**

1. Add `seedPlayerRating(token, sport, rating)` to `api/client.ts`, copying the surrounding
   `apiFetch` pattern. It maps to `PUT /player/ratings/seed`.
2. In `pages/Profile.tsx`, render the control only for buckets where `matchesPlayed === 0`. Use
   `min`/`max`/`seedDefault` from the **Step 7.1 response** — §0a trap 3, no constants in frontend code.
3. Surface the 409 (`RATING_ALREADY_SCORED`) as a plain message and refetch, since the bucket can be
   scored between page load and submit.
4. Both formats seed together from one value (Step 5.1's behaviour) — the UI asks **once per sport**,
   not once per bucket. Do not present singles and doubles as separately settable; that would imply a
   capability the endpoint does not have.

⚠ Use the **`-(--token)`** class form (ISSUE-44c lint guard). No trailing full stop in headings.

**Red (jest, `pages/__tests__/Profile.spec.tsx`):** the control renders for a `matchesPlayed: 0` bucket
and is absent once `matchesPlayed > 0`; submitting calls the endpoint with the sport and value; a 409
response shows the message and does not leave a stale optimistic value on screen.

**Red (e2e — new spec, see Phase 10):** a player with no scored matches sets a self-rating and sees it
reflected in the panel; the control is gone after a match is scored.

## Phase 6 — DSR ✅ built (`ff721e1` → `c43e11f`, `2374327`)

**Model: Haiku.** One line each, with three precedents immediately adjacent.

### Step 6.1 — erase

Add to the fan-out in **`packages/api/src/dsr-service.ts` (lines 81–84)**, beside
`playerSettingsRepo.deleteFor`, `standingsSnapshotRepo.deleteFor`, `availabilityRepo.deleteFor`:
```ts
await this.ratingsRepo.deleteFor(playerId)   // current + history
```
⚠ **Note the design doc says `src/services/dsr-service.ts` — that path is wrong.** The file is at
`packages/api/src/dsr-service.ts`. Fix the design doc reference in the same commit.

⚠ **Other players' ratings are left untouched** (design §4). Do not recompute them.

### Step 6.2 — export

Add both tables to `PlayerExport` (`dsr-service.ts:16`) and populate in `export()` (~line 163). A row
dump, per design §4.

**Red:** extend `dsr.spec.ts` — after erase, no rating rows survive for that player **and an
opponent's rating is unchanged**; export contains both tables.

---

## Phase 7 — Read API and `/profile` ✅ built (`8cfd140` → `8472276`; `36ba5ec` → `ed8a463`)

**Model: Haiku.** Read-only, against an existing page.

### Step 7.1 — `GET /player/ratings`

Returns the caller's own buckets with a `provisional` flag, **plus `{ min, max, seedDefault }`** so
the frontend never holds its own copy of a rating constant (§0a trap 3).
⚠ **Own ratings only** — R1 makes this private, so there must be no route that returns another
player's rating. Add an explicit test that this is not possible.

### Step 7.2 — client + panel

`fetchPlayerRatings` in `api/client.ts` (copy the surrounding pattern), and a "Your Rating" panel in
`pages/Profile.tsx` matching design §5's layout, with `(provisional)` shown.

⚠ **No rating constants in frontend code** (§0a trap 3) — take `min`/`max`/`seedDefault` from the
Step 7.1 response. Do not add a `@core` alias to `vite.config.ts`/`jest.config.js` to import them.
⚠ Use the **`-(--token)`** class form. The `-[--token]` form is banned by lint since ISSUE-44c and
emits invalid CSS.
⚠ Copy convention: no trailing full stop in the panel title.

---

## Phase 8 — Auto-pairing consumes the rating (R20) ✅ built (`0940c7d` → `ed191d2`) — ⛔ **SUPERSEDED by Phase 11**

> ⛔ **Do not extend this phase.** R20 was overturned by measurement on 2026-07-31 (design §3c): with
> perfect ratings it yields **one distinct partner per player across ten tournaments**. Phase 11 removes
> it; what replaces pairing for casual play is PLAYER_GROUPS_DESIGN §13, in the player-groups track. The
> step below is retained only so the diff Phase 11 produces is readable.

**Model: Sonnet.** Modifies pairing code that currently works.

In `createGroupsForDoubles` (`db.ts:997`), where consenting leftovers are paired (~`db.ts:1088-1094`):
pair to **balance team means** on the **doubles** rating — but only for players whose doubles bucket
is **out of provisional**. Anyone still provisional pairs exactly as today.

⚠ Do this **last**, and behind the provisional gate. It is the only step that changes behaviour for
existing flows, and ISSUE-17's `auto_pair_consent` rule still holds: a player who opted out is
excluded regardless.

**Red:** all-provisional roster pairs identically to today (regression guard); a settled roster pairs
strong-with-weak to balance means; an opted-out player is still excluded.

---

## Phase 9 — Application moves to the worker (R22–R25) ⛔ **DROPPED, never built**

> ⛔ **Do not build this.** Superseded by **R29** and **Phase 12** the same day it was written. Its case
> was hot-path latency *plus* R20 needing a fresh rating; R27 removed the consumer, and the statement
> count is fixable by batching inside the transaction ISSUE-47/48 already require — without a Redis
> dependency, a processor, or Step 9.6's silent-no-op trap. **Retained, not deleted**, because the
> analysis is correct and directly reusable if a consumer is ever reintroduced. Read §3b before
> resurrecting it.

**Model: Sonnet.** Design §3b carries the reasoning and the two rejected alternatives; do not re-derive
them. This phase changes *when* ratings are applied, never *what* they compute — Phase 2's maths and
Phase 3's semantics are untouched.

⚠ **Two live defects get fixed here, and they are the reason the phase is worth doing** —
[ISSUE-47](./UAT_ISSUES.md#issue-47) (a doubles settle is eight autocommitted statements with no
transaction) and [ISSUE-48](./UAT_ISSUES.md#issue-48) (unlocked read-modify-write loses updates). Both are in Phases
3–4 as built and are due before this branch merges. **If Phase 9 is descoped, they still need fixing
in place.**

### Step 9.1 — job type + `ratings-processor.ts`

Add `'rating.apply'` to `JobName` and `JobPayload` (`packages/worker/src/types.ts`, ten jobs today),
create `packages/api/src/workers/ratings-processor.ts` beside the existing thirteen, and register it in
`worker-entrypoint.ts`. Payload is `{ matchId, tournamentId }` and **nothing else** — see Step 9.3.

**Red:** an enqueued `rating.apply` job moves both players' ratings when the processor runs.

### Step 9.2 — make the settle transactional and locked *(closes ISSUE-47 + ISSUE-48)*

Wrap the whole multi-player settle in one transaction, taking `SELECT … FOR UPDATE` on each
participant's `player_ratings` row before computing. Doubles must lock all four.

⚠ Use plain `this.pool.connect()` + `BEGIN/COMMIT/ROLLBACK` — CLAUDE.md §7. The test harness rewrites
these into savepoints; **do not add test-only branching** to make it work.
⚠ Pin worker concurrency for this queue, or lock ordering will not save you from deadlocks between two
matches sharing two players. Lock in a deterministic order (sort participant ids) regardless.

**Red:** a settle that throws partway leaves **no** partial movement (today it leaves two of four
players moved); two concurrent applies for the same player produce the sum of both deltas, and
`matches_played` lands at +2.

### Step 9.3 — the worker reads the current score (R24)

The processor loads the match and derives participants and winner **at apply time**, from the row as it
then stands. It must not trust a payload snapshot taken at submission.

⚠ This is what makes the correction path safe, and it is easy to "simplify" away by passing
participants through the payload — that reintroduces exactly the race R24 exists to remove. The payload
carries ids only.

**Red:** a score submitted then edited *before* the job runs produces the rating for the **edited**
score, and writes exactly one history row.

### Step 9.4 — swap the two call sites (R22)

Replace the inline `applyRatingForMatch` block (`score-service.ts:255-274`) with the enqueue. In
`tournaments.ts:792-838`, `correctRatingForMatch` still applies — but only for a match that has already
been applied; if it has no history rows yet, the pending job will pick the edit up on its own (Step
9.3), so the correct behaviour is to skip, not to throw.

⚠ **`R23`: do not touch `PUT /player/ratings/seed`.** It stays synchronous. It is not part of this
phase and design §3b explains why queuing it corrupts data.

**Red:** submitting a score returns without any `player_ratings` write having happened; an edit to a
not-yet-applied match logs a skip rather than the current `no current rating` warning.

### Step 9.5 — rewrite `ratings-wiring.spec.ts`

All four of its tests assert rating movement *immediately after* the score request returns — that spec
is a test of the synchronous wiring, so it does not survive as written. Rewrite to enqueue, drive the
processor directly (the pattern the other processor specs already use), then assert.

⚠ Do not "fix" this by leaving an inline apply in place beside the enqueue. That is what
`standings.recalculate` does (`score-service.ts:171`) and it would defeat the whole phase.

### Step 9.6 — the worker becomes a prerequisite

`InMemoryJobQueue` **has no consumer** — `selectJobQueue()` falls back to it whenever `JOB_QUEUE` is not
`bullmq` or `REDIS_URL` is unset (`job-queue-factory.ts:19-31`), and it stores jobs in a `Map` nothing
drains. So without a running worker, matches silently stop being rated: `add()` resolves, no error is
ever raised.

Extend `scripts/e2e-setup.js`'s worker check to cover ratings-touching specs, and add them to
CLAUDE.md §8's list of specs that require `npm run dev:worker`.

**Red:** the setup script reports a missing worker for a ratings spec instead of the spec failing
opaquely.

---

## Phase 10 — Test debt and merge gate ✅ built (`a58851e` e2e spec, `ec5f418` §0a, `cc40fce` ratchet, `3288729` stale-spec repairs)

**Model: Sonnet.** Mechanical individually, but it reaches four files and one step is easy to get
backwards (10.3). Runs **last** — 10.2's ratchet reads whatever coverage the finished branch produces,
so running it before Phase 9 lands just gets redone.

⚠ **This phase exists because P13 currently ships with zero e2e coverage.** Verified 2026-07-31:
`grep -rln "rating" packages/frontend/e2e/` returns nothing. Every rating behaviour — the seed gate,
the `/profile` panel — is covered only by jest. Per CLAUDE.md §13 that is not automatically
wrong (a path exercised solely by e2e reads as uncovered, and vice versa), but here it means **no test
anywhere exercises a rating through a browser**.

### Step 10.1 — `ratings.spec.ts` + its selection-map row

New spec at `packages/frontend/e2e/ratings.spec.ts`, copied from `TEMPLATE.spec.ts`. Cover, in order of
value:

1. **The `/profile` panel** — a player with a settled bucket sees the rating and no `(provisional)`
   marker; a player with `matches_played < PROVISIONAL_MATCHES` sees the marker. Select via the existing
   `data-testid="rating-${sport}-${format}"` (`Profile.tsx:380`) and `rating-empty-state`.
2. **The seed control** — only if Step 5.3 was built; skip this block otherwise rather than writing a
   spec against an unbuilt control.
3. **Privacy (R1)** — a player cannot reach another player's rating. This is the one behaviour where an
   e2e test earns its cost over jest, because it proves no *route* exposes it, not just that one handler
   does not.

⚠ **Adding the spec means adding its row to the selection map in `e2e-scenarios.md` §"Test
Organization" in the same change** (CLAUDE.md §8). The table is how a future change picks the right
spec, and it is worthless once it drifts. Row format matches the existing ones:
`| **Skill ratings (P13)** | N | \`ratings.spec.ts\` | \`npx playwright test ratings\` |`

✅ **No worker needed.** This required `npm run dev:worker` while Phase 9 was live; R29 keeps application
synchronous, so the spec runs against the standard two-server setup and CLAUDE.md §8's worker list is
unchanged.

⚠ Seed your own data via the fixtures and use a random email suffix — parallel browser projects collide
otherwise (CLAUDE.md §8). Do **not** depend on ambient DB state to produce a settled bucket; score the
matches the spec needs.

### Step 10.2 — run the coverage ratchet

Not run at any point on this branch — `git diff main...HEAD -- '*jest.config.js'` is empty, so eight
phases of new code have contributed nothing to the floors.

```bash
node scripts/ratchet-coverage.mjs           # dry run
node scripts/ratchet-coverage.mjs --write   # apply
```

Commit the bump **with** this phase's work (CLAUDE.md §13).

⚠ **Raise-only.** If a floor comes back lower, do not lower it silently — find out what dropped. The one
legitimate reason is deleted well-covered code, and it must be stated in the commit message.
⚠ **Do not change `coverageProvider`** — the floors are `babel` numbers.
⚠ A metric that swings by more than a point between runs is a flaky test to fix, not a threshold to
loosen.

### Step 10.3 — §0a grep, and one judgement call

```bash
grep -rnE "\b(270|120|24|10|100|500|150|450)\b" \
  --include=*.ts --include=*.tsx --include=*.sql \
  packages/api/src packages/frontend/src db/migrations \
  | grep -iE "rating|seed|provisional|K_|LOGISTIC|TAIL" \
  | grep -v ratings-constants
```

Expect no hits that *restate a constant*. The grep is noisy — CSS custom-property values and unrelated
literals match — so read each hit rather than counting them.

**One known hit needs a decision, not a reflex fix:** `packages/frontend/src/pages/__tests__/Profile.spec.tsx:68`
has `seedDefault: 270`. §0a names tests explicitly, so it is in scope; but it sits inside a **mock of the
Step 7.1 API response**, where a literal is arguably correct — the mock's job is to state what the wire
format contains. ⚠ Do not "fix" it by importing `SEED_DEFAULT` into a frontend test: §0a trap 3 and Step
7.2 both forbid a `@core` alias in the frontend build config, and adding one to satisfy a lint-style rule
would be the worse trade. Either leave it with a comment naming it as a wire-format fixture, or have the
test assert on whatever the component renders without restating the number.

### Step 10.4 — the merge gate

Run once, in this order, and only after 10.1–10.3:

```bash
# ⚠ Task 14.3: `npm --workspace` runs jest with cwd packages/api|frontend,
# but `git diff --name-only` emits repo-relative paths — jest matched zero
# files against them. Strip each workspace's own prefix first.
FILES=$(git diff --name-only main...HEAD | grep '^packages/api/' | sed 's|^packages/api/||')
npm --workspace=packages/api exec -- jest --findRelatedTests $FILES --bail

FILES=$(git diff --name-only main...HEAD | grep '^packages/frontend/' | sed 's|^packages/frontend/||')
npm --workspace=packages/frontend exec -- jest --findRelatedTests $FILES --bail

npm run test:coverage        # per-workspace; enforces the floors (§13)
npm run test:e2e -- --reporter=line   # both browsers
```

Redirect each to the scratchpad and grep for `Tests:|Suites:|✕` (CLAUDE.md §12) — do not page the full
output into context.

⚠ **CLAUDE.md §11 carries the same broken (unprefixed) command.** That is a repo-wide doc, out of scope
for this branch — flag it to the owner rather than editing it here (Task 14.3).

---

## Phase 11 — Remove rating-based pairing (R26) ✅ built (`0b6531f` → `ae99e66`)

**Model: Sonnet.** Touches live pairing code, and two easily-dropped rules sit inside the block being
removed. Read design §3c first — do not re-derive the decision.

⚠ **Rescoped 2026-07-31, hours after being written.** This phase originally *replaced* R20's criterion
with novelty pairing inside `createGroupsForDoubles`. The casual model then moved again:
[PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md) **§13** removes system-assigned pairing entirely in
favour of a session ledger, and re-homes the novelty weighting as a **group-chat suggestion** (§13.3).

**This phase's job is now the deletion only** — take `player_ratings` out of the pairing path so no
consumer of the rating remains (R27). What replaces pairing for casual doubles is §13's work, planned in
the player-groups track, **not here**.

⚠ **Do not implement the novelty algorithm in `db.ts`.** It is preserved in **Appendix 11.A** below
because §13.3's suggestion job needs exactly it — as reference material, not build instructions.
Building it here rebuilds the thing §13.1 just removed.

**Do it before Phase 12.** It deletes the ratings read from `db.ts` entirely, which shrinks what
Phase 12 has to reason about.

### Step 11.1 — delete the rating-based selection; leftovers pair randomly

In `createGroupsForDoubles`, the R20 block at **`db.ts:1107-1142`** is a self-contained planning pass
with no writes and a catch-all fallback. **Delete the selection logic and keep the fallback as the
behaviour.**

Out: the per-player `ratingsRepo.getFor` loop, the settled/provisional split, the lo/hi sort, and the
`try/catch` that existed only to guard them. In: consenting leftovers go straight through the
**existing `pairRandomly` helper** (`db.ts:1098-1105`), which is already right there.

⚠ **This is a restoration, not a new behaviour** — random shuffle of consenting leftovers is exactly
what the code did before Phase 8, and exactly what the fallback path has been doing whenever the ratings
lookup failed. You are removing a layer, not adding one.

⚠ **Interim state, and it is deliberate.** Random pairing is *not* the end state — PLAYER_GROUPS_DESIGN
§13.1 removes system-assigned pairing entirely and §13.3 replaces it with a chat suggestion. Phase 11
gets `player_ratings` out of the path so R27 holds; §13 decides what pairing becomes. **Do not build
§13's model here**, and do not leave leftovers unpaired as a shortcut — that reintroduces ISSUE-31's
symptom (a launched tournament with nothing to play) for anyone who registered solo.

⚠ **Preserve, exactly:**
- **ISSUE-17** — a player with `auto_pair_consent = false` is excluded regardless of `pairUnpaired`.
- **Never fail group creation over pairing.** The old `log.warn('ratings.pairing.fallback')` catch goes
  away with the query it guarded; nothing that remains can throw. If you keep any lookup, keep a catch.

### Step 11.2 — cut the ratings dependency

`db.ts` should no longer import `RatingsRepository` or `PROVISIONAL_MATCHES`. Remove both, and remove
the "load-bearing for R20 pairing gate" clause from `ratings-constants.ts:20` — it is no longer true.

**Verification that R27 actually holds** — after this phase, `grep -rn "RatingsRepository\|player_ratings"
packages/api/src --include=*.ts | grep -v __tests__` must return only: the subsystem itself, the two
producers (`score-service.ts`, `tournaments.ts`), DSR (`dsr-service.ts`), and the read route
(`player.ts`). **`db.ts` must not appear.** That grep is the phase's definition of done.

**Red** (rewrite `ratings-pairing.spec.ts` → rename to `pairing.spec.ts`, since it no longer touches
ratings; update its row in `e2e-scenarios.md` §"Test Organization" if one exists):
- an all-consenting leftover roster is **fully paired** (regression guard against the ISSUE-31 symptom)
- a player with `auto_pair_consent = false` is still excluded — **carried forward from Phase 8**
- an odd number of consenting leftovers leaves exactly one unpaired, marked `unpaired` as today
- **no query touches `player_ratings`** during group creation — assert with a query spy. This is the
  assertion that makes R27 enforceable rather than aspirational
- ⛔ **Delete Phase 8's balance assertions.** "A settled roster pairs strong-with-weak to balance means"
  is now the *opposite* of intended behaviour; leaving it green means R20 is still there.

### Appendix 11.A — carried forward to §13.3, **do not build here**

The novelty algorithm this phase originally proposed is retained because §13.3's pre-session suggestion
job needs exactly it. Recorded here so it isn't re-derived; it belongs in the player-groups track.

```sql
SELECT t.player1_id, t.player2_id, COUNT(*) AS n
FROM public.teams t
JOIN public.tournaments tt ON tt.id = t.tournament_id
WHERE tt.group_id = $1
  AND t.player1_id = ANY($2::text[]) AND t.player2_id = ANY($2::text[])
GROUP BY 1, 2
```

- `public.teams` is the partner-history record — UNIQUE on `(tournament_id, player1_id, player2_id)`.
- ⚠ **Do not use `getPairLeaderboard`.** It looks like the right source and returns nothing: it
  self-joins participants on `slot > slot` within a side, but score-service writes doubles participants
  as **team IDs, one row per side** (`score-service.ts:205-220`), so it matches no rows.
- ⚠ `public.tournaments` has **no index on `group_id`** (only `(creator_id, status)` and
  `(status, created_at)`). §13.3's job needs one.
- Greedy pairing by fewest prior partnerships, with team balance as a tiebreak among equally-novel
  candidates — the tiebreak is what buys back most of the measured ~14% blowout rate.
- ⚠ Whatever signal the tiebreak uses, **it must not be `player_ratings`** — that rebuilds R2 by the
  back door, and §13.3 is a *suggestion* with no authority to justify it.

---

## Phase 12 — Batched transactional settle (R29) ✅ built (`6ff510d` → `d5f87e1`, then `3381875` → `6bf7d7c`)

**Model: Sonnet.** Transaction and locking semantics, and the test harness rewrites savepoints
underneath. Closes [ISSUE-47](./UAT_ISSUES.md#issue-47) outright and [ISSUE-48](./UAT_ISSUES.md#issue-48)
for players who already had a rating row — the first-match gap this left is Task 14.1, which closed it.

This is Phase 9's Step 9.2 without the queue. One transaction, one lock, and the batching falls out.

### Step 12.1 — one transaction, one lock, three statements

Wrap the whole multi-player settle in a single transaction using plain `this.pool.connect()` +
`BEGIN/COMMIT/ROLLBACK` (CLAUDE.md §7 — the harness rewrites these to savepoints; **do not add
test-only branching**).

Replace the current 14 statements per doubles score:
- 4 sequential `getOrSeedRating` → **one** `SELECT … WHERE player_id = ANY($1) … FOR UPDATE`
- 4 `upsert` + 4 `appendHistory` → **one** multi-row upsert + **one** multi-row history insert

⚠ **Lock in a deterministic order** — sort participant ids — or two doubles matches sharing two players
deadlock instead of racing.
⚠ **This transaction must be separate from the score write.** Extending the score's transaction to cover
ratings makes a rating failure roll back the *score*, inverting the rule the best-effort wrap exists to
enforce (R15, design §3b). The score is the user's data; the rating is derived.
⚠ Keep the `try/catch` + `log.warn('rating.apply.failed')` wrap at `score-service.ts:272`. It is still
correct — it just now guards an all-or-nothing unit instead of a partial one.

**Red:**
- a settle that throws partway leaves **no** partial movement (today it leaves two of four players moved)
- two concurrent applies for the same player produce the sum of both deltas, and `matches_played` lands
  at +2 — the ISSUE-48 regression
- statement count for one doubles score drops from 14 to ~3 (assert on a query spy, not a timing)
- singles still applies correctly — it shares the batched path

---

## Phase 13 — `/profile`: last 10 partners (R28) ✅ built (`9e8f839` → `823fa6c`, then `4f8ea00` → `e4fac69`)

**Model: Haiku.** One read endpoint and one panel, against a page and a pattern that both already exist.

### Step 13.1 — `GET /player/partners`

Returns the caller's last 10 distinct partners **across all groups** (R28), most recent first, with
name and the date last partnered. Source is `public.teams`, ordered by `MAX(t.created_at)` on the team
row itself — more accurate than a `tournaments` join for "when we partnered," since it is the team's
own creation time rather than the tournament's. `public.teams` is the same table Appendix 11.A records
for §13.3. *(Amended 2026-08-02, Task 14.7 — the built query orders this way; the plan originally said
"joined to `tournaments`," which was never built and the code is not being changed to match it.)*

⚠ **Own partners only.** R1/R28 permit cross-group *only* because the page is owner-private. There must
be no route that returns another player's partner list, and no group-scoped or shared view may reuse
this query. Add an explicit test that it is not reachable for another `playerId`.

⚠ Register before any `/player/:param` route if one exists (CLAUDE.md §10).

### Step 13.2 — the panel

Beside the existing "Your Rating" panel in `pages/Profile.tsx`, reusing its markup idiom.

⚠ Use the **`-(--token)`** class form (ISSUE-44c lint guard). No trailing full stop in the panel title.
⚠ Empty state for a player who has never played doubles — do not render an empty list.

**Red:** the endpoint returns at most 10, ordered most-recent-first, deduplicated by partner; a second
player's list is unreachable; the panel renders names and an empty state. **E2E:** fold into Step 10.1's
`ratings.spec.ts` rather than adding a spec — same page, same fixtures.

---

## Phase 14 — Post-verification fixes 🔲 NOT BUILT

**Opened 2026-08-01** by an independent verification of the Phases 11 → 12 → 13 → 10 delivery, run
against the branch rather than against the delivery report. Most of that work verified clean: Phase 11's
DoD grep passes (`db.ts` is absent from it), Phase 12's transaction/lock/batching is real, Phase 13's
route is own-only and deduplicated, and the frontend gates pass (22 suites / 210 tests via
`--findRelatedTests`; 144 suites / 1611 tests under `test:coverage` with the raised floors holding).

The tasks below are what did **not** hold. **Order: 14.1 → 14.2 → 14.7 (code) → 14.3 → 14.4 → 14.6
(process/docs) → 14.5 (sweep last — 14.1 changes API code).**

✅ **The per-phase status markers above were stale and are now fixed (Task 14.4, 2026-08-02)** — Phases
10–13 now read `✅ built` with their commit refs.

| Task | Work | Model | Why |
|---|---|---|---|
| 14.1 | First-match settles take no lock | **Sonnet** | Locking semantics again, and the harness cannot prove it |
| 14.2 | §0a grep not clean | **Haiku** | One constant extraction against an existing file |
| 14.3 | Merge-gate command runs zero tests | **Haiku** | Text fix in this doc, verified by re-running |
| 14.4 | Status markers, DoD boxes, uncommitted docs | **Haiku** | Mechanical, refs supplied below |
| 14.5 | Reconcile the e2e sweep count | **Sonnet** | Requires judging skip-vs-fail and whether a flake is real |
| 14.6 | `seed-test-accounts` blocks the API coverage gate | **Sonnet** | A scope call, not a code change |
| 14.7 | Two recorded deviations | **Haiku** | One doc amendment, one two-line choice |

### Task 14.1 — first-match settles take no lock (ISSUE-48 is not fully closed) 🟠

**This is the one thing on the branch that must not merge as-is.** Phase 12 closed
[ISSUE-47](./UAT_ISSUES.md#issue-47) outright and closed [ISSUE-48](./UAT_ISSUES.md#issue-48) *for
players who already have a rating row*. The first match in a `(sport, format)` is still unprotected.

**The mechanism**, in the code as built:

- `ratings-repository.ts:110` `lockManyFor` locks only rows that already exist — its own comment says
  "a player with no row is simply absent from the map — there is nothing to lock." True, and that is
  the bug: there is nothing to lock *yet*.
- `ratings-service.ts:79` `seededOrDefault` then supplies `SEED_DEFAULT` from memory for the absent
  player, computing the delta from an **unlocked** read.
- `ratings-repository.ts:152` `upsertMany`'s conflict clause writes **absolute** values:
  `matches_played = EXCLUDED.matches_played`.

**Failure scenario:** two matches for the same player's *first* two appearances in a `(sport, format)`
settle concurrently. Both see no row, both compute from `SEED_DEFAULT`, both upsert
`matches_played = 1`. The second commit overwrites the first: one delta is silently lost and the counter
reads 1 where it should read 2 — ISSUE-48's exact shape, narrowed to first matches. It is reachable
whenever two of a player's matches are scored at once, which is ordinary during a round-robin.

**Nothing currently covers it.** `ratings-settle-transaction.spec.ts:181` ("two applies for the same
player across different matches both count") runs the two applies **serially**, so it passes either way.

**Requirement — seed inside the transaction, then lock.** Inside `withRatingsTransaction`, before the
`FOR UPDATE`, insert a row for every participant that lacks one:

```sql
INSERT INTO public.player_ratings (player_id, sport, format, rating, matches_played, updated_at)
VALUES ...   -- one row per participant, rating = $seedDefault, matches_played = 0
ON CONFLICT (player_id, sport, format) DO NOTHING
```

Then `lockManyFor` covers **every** participant, and `seededOrDefault` becomes dead — every id is in the
map. This is correct under contention: a concurrent conflicting insert makes the statement wait on the
other transaction and then do nothing, and the following `SELECT … FOR UPDATE` sees and locks the
committed row.

⚠ **`SEED_DEFAULT` comes from `ratings-constants.ts` as a bound parameter.** Do not write the number
into the SQL and do not add a column default — §0a trap 1, verbatim.

⚠ **Two alternatives, both worse — do not pick them without saying why.** (a) Changing the conflict
clause to a relative `matches_played = public.player_ratings.matches_played + 1` fixes the *counter*
only; the rating is still computed from a stale read, so the delta is still lost. (b)
`pg_advisory_xact_lock` over the hashed sorted ids works but introduces a lock namespace nothing else in
this repo uses.

**Red (extend `ratings-settle-transaction.spec.ts`):**
- a doubles settle where **no** participant has a rating row still issues a `FOR UPDATE` whose id array
  contains all four ids — assert via the existing query spy, which is what makes this enforceable
- a settle that throws after the seed insert leaves **no** seed rows behind (they are in the same
  transaction — this is the ISSUE-47 guarantee extended to the new statement)
- singles with one seeded and one unseeded participant locks both

⚠ **Do not attempt a genuine-contention test.** `helpers/db.ts` serializes every statement onto one
connection; the spec's own header already documents this wall and the resolution (prove the mechanism —
statement shape and id coverage — not the race). `partner-confirm-atomicity.spec.ts` (ISSUE-18) settled
the same question the same way.

⚠ **Update the statement-count assertion in the same change.** `ratings-settle-transaction.spec.ts:95`
asserts "~3 data statements"; the seed insert makes it ~4. Amend the number and its comment — do not
leave a red assertion for the next session to "fix" by guessing.

**Done when:** the tests above are green and ISSUE-48 flips to ✅ in `UAT_ISSUES.md` (Task 14.4).

### Task 14.2 — the §0a grep is not clean 🟡

§0a's verification command still returns a hit:

```
packages/api/src/services/ratings-calculator.ts:22
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / LOGISTIC_DIVISOR))
```

The `10` is the logistic base. It is defensible as formula shape rather than a tunable — but §0a exists
precisely so that **no reviewer has to make that call**, and the rule as written says the only permitted
literals are `0` and `1`.

**Requirement — extract it.** Add `LOGISTIC_BASE = 10` to `ratings-constants.ts` beside
`LOGISTIC_DIVISOR` and use it. One line, and the grep goes back to being mechanical.

**Second half — Step 10.3 annotated a file the grep does not cover.** The commit (`ec5f418`) commented
`Profile.spec.tsx`'s wire-format fixture, which is the right judgement, but §0a's file list is
API-side only, so that hit never appears in the check and the check never sees the frontend. Either
widen the §0a command to include the frontend ratings surfaces (`pages/Profile.tsx`,
`pages/__tests__/Profile.spec.tsx`, `api/client.ts`) or state in §0a that trap 3 is verified by reading,
not by grep. **Pick one and write it into §0a** — leaving it implicit is how it drifted.

**Done when:** the §0a command as written in this doc returns no matches, and its file list matches what
it claims to cover.

### Task 14.3 — Step 10.4's merge-gate command runs zero tests 🟠

The command in Step 10.4 (and the same shape in CLAUDE.md §11) is:

```bash
npm --workspace=packages/api exec -- jest --findRelatedTests $(git diff --name-only main...HEAD)
```

`npm --workspace` runs jest with **cwd `packages/api`**, while `git diff --name-only` emits
**repo-relative** paths. Jest matches zero files and prints "No tests found, exiting with code 1" — it
runs nothing. Read as "no failures", it is a gate that cannot fail.

**Requirement — fix the command in this doc, both workspaces:**

```bash
FILES=$(git diff --name-only main...HEAD | grep '^packages/api/' | sed 's|^packages/api/||')
npm --workspace=packages/api exec -- jest --findRelatedTests $FILES --bail

FILES=$(git diff --name-only main...HEAD | grep '^packages/frontend/' | sed 's|^packages/frontend/||')
npm --workspace=packages/frontend exec -- jest --findRelatedTests $FILES --bail
```

**Baseline measured 2026-08-01, so a re-run has something to compare against:**
- api — 139 suites, **1892 passed, 3 failed**; all 3 failures are `seed-test-accounts.spec.ts` (Task
  14.6), none are P13 code
- frontend — 22 suites, **210 passed**

**Re-run 2026-08-02, corrected commands, after Task 14.1/14.2/14.7's fixes landed:**
- api — 139 suites, **1895 passed, 3 failed**; same 3 `seed-test-accounts.spec.ts` failures, same cause
  (Task 14.6, pre-existing/environmental — confirmed untouched by this branch)
- frontend — 22 suites, **210 passed**

⚠ **CLAUDE.md §11 carries the same broken command.** Flag it to the owner; do **not** edit CLAUDE.md as
part of this branch.

**Done when:** the corrected commands are in Step 10.4 and both have been run to a real, non-empty
result. ✅ Done 2026-08-02.

### Task 14.4 — status markers, DoD boxes, and six uncommitted docs 🟡

**The plan of record for this branch exists only on disk.** `git status` shows six modified planning
docs — `BACKLOG.md`, `PLAYER_GROUPS_DESIGN.md`, `PRODUCTION_READINESS.md`, `RATINGS_DESIGN.md`,
`RATINGS_IMPLEMENTATION.md`, `UAT_ISSUES.md`, 1112 lines — none committed. Commit them as one docs
commit before merging.

**Flip the phase markers**, matching the Phase 0–8 style (`✅ built (<red> → <green>)`):

| Phase | Commits |
|---|---|
| 11 | `0b6531f` → `ae99e66` |
| 12 | `6ff510d` → `d5f87e1`, then `3381875` → `6bf7d7c` |
| 13 | `9e8f839` → `823fa6c`, then `4f8ea00` → `e4fac69` |
| 10 | `a58851e` (e2e spec), `ec5f418` (§0a), `cc40fce` (ratchet), `3288729` (stale-spec repairs) |

**Tick the DoD boxes that now have evidence**, and only those:
- `--findRelatedTests` green per workspace — **after Task 14.3**, with its numbers
- coverage floors — frontend raised in `cc40fce` and re-verified green; **API floors are not breached**
  (measured 2026-08-01: 88.41% stmts / 77.89% branches / 88.70% funcs / 88.89% lines against a
  75-branch floor) but the gate itself could not run — see Task 14.6 before ticking
- §0a — **after Task 14.2**
- full e2e sweep — **after Task 14.5**
- ISSUE-47 ✅ closed by `6bf7d7c`; **ISSUE-48 stays open until Task 14.1**

**`UAT_ISSUES.md:72-73` still lists both ISSUE-47 and ISSUE-48 as 🔲 Open.** Update the table rows *and*
each issue's own section — the summary count at the top of the file too.

⚠ **Do not tick a box the same session's own report is the only evidence for.** That is the failure this
task is cleaning up.

### Task 14.5 — reconcile the e2e sweep count 🟡

The delivery reported "436 passed / 1 pre-existing flaky failure" across chromium + firefox. The
selection map now totals **250 test blocks across 43 specs**; two browsers is 500 run slots, and
436 + 1 = 437 leaves **~63 unaccounted for**. Conditional skips and chromium-only specs plausibly
explain it — nobody has checked, and an unexplained 63 is indistinguishable from a spec that silently
did not run.

**Requirement:** re-run the sweep after 14.1 lands, and record in this doc: total, passed, **skipped and
why** (name the specs and the skip conditions), and the failing spec by name with whether it reproduces
on a second run. If it reproduces, it is a defect — file it in `UAT_ISSUES.md`, do not call it flaky.

⚠ Needs `npm run dev:worker --workspace=packages/api` running (CLAUDE.md §8) or the assistant/coach
specs fail in confusing ways unrelated to ratings.
⚠ `--reporter=line`, redirect to the scratchpad, grep for the verdict (CLAUDE.md §12). Never `--ui` or
`--debug`.

**Done when:** the three numbers add up to the run slots, in writing, in this doc.

### Task 14.6 — `seed-test-accounts` blocks the API coverage gate 🟡 (pre-existing, not P13's)

`npm run test:coverage` cannot complete for `packages/api`. Three tests in `seed-test-accounts.spec.ts`
fail with:

```
update or delete on table "players" violates foreign key constraint
"player_groups_created_by_fkey" on table "player_groups"
```

The seed script deletes a player that ambient dev-DB `player_groups` rows still reference via
`created_by`. The spec and its subject are **untouched by this branch** (`git diff main...HEAD` does not
name them) and it reproduces standalone, so it is environmental/pre-existing. Excluding it, the API
suite is green: 182 suites, 2659 passed, 31 skipped, floors not breached.

**It is already filed — [ISSUE-45](./UAT_ISSUES.md#issue-45)** 🟠 Open, "`seed-test-accounts.spec.ts`
fails on a FK violation — test isolation is leaking". Do **not** file a duplicate; add the
`player_groups_created_by_fkey` reproduction above to that issue if it isn't already there.

**Requirement — make the scope call and record it.** Recommended: merge P13 with the exclusion
documented in the DoD and leave the fix to ISSUE-45, which owns it. Fixing the seed script here (cascade
or reassign `player_groups.created_by`) touches the group ownership model and does not belong in a
ratings branch.

**Then run the API ratchet.** `node scripts/ratchet-coverage.mjs` has never run on this branch for the
api workspace, and there is roughly 2 points of branch headroom (77.89 measured vs the 75 floor) that
eight phases of new code earned and never claimed. Do it once the suite can complete, and commit the
bump with this work (CLAUDE.md §13).

### Task 14.7 — two recorded deviations ⚪ resolved 2026-08-02

Neither is a defect; both are the code and the plan disagreeing, which is how a plan stops being usable.

1. **Partner ordering.** Step 13.1 specifies `public.teams` joined to `tournaments` for ordering; the
   built query orders by `MAX(t.created_at)` on `teams` itself. The built version is the more accurate
   "when we partnered". **Amend Step 13.1 to match the code** — do not change the code. ✅ Done — Step
   13.1 now describes the built ordering; the query is untouched.
2. **`lastPartneredAt` is fetched and never rendered.** The endpoint returns it (Step 13.1 asked for
   "name and the date last partnered"); the panel renders names only. **Owner call: render it or drop it
   from the response.** Do not leave a field on the wire that nothing reads. ✅ **Rendered** — Step 13.1
   asked for it and the cost is one line (`Profile.tsx`, next to the partner's name, same
   `toLocaleDateString()` idiom the memories list already uses). Dropping it would have thrown away
   information a "recent partners" panel exists to show. Jest coverage added in
   `pages/__tests__/Profile.spec.tsx`.

---

## Definition of done

*Status audited 2026-07-31 against the branch. Unticked ≠ not started — see each note.*
*⚠ Re-audited 2026-08-01 — see Phase 14; several boxes below have evidence now, and Task 14.4 owns
ticking them.*
*✅ Re-audited 2026-08-02 (Task 14.4), against Tasks 14.1–14.3 and 14.7's evidence. Tasks 14.5 and 14.6
still block the two remaining boxes — do not tick either from this session's own report alone.*

- [x] **Design doc §4's `dsr-service.ts` path corrected (Step 6.1) and §7's "hooked to score
      confirmation" line updated to *submission*.** Both done — `RATINGS_DESIGN.md:242` reads
      "submission (not confirmation — see R15)", and the wrong `services/` path is gone.
- [x] **Every step committed as failing-test-then-implementation (CLAUDE.md §11).** Holds for Phases
      1–8 and 10–13, each visible as a red-then-green pair in the log (Phase 14's tasks the same way).
      Phase 5.3 and Phase 9 are deliberately unbuilt (not "incomplete" — see their sections).
- [x] **No `-[--token]` classes introduced.** True for what shipped; Step 5.3's control (unbuilt) is
      moot.
- [x] **`jest --findRelatedTests $(git diff --name-only main...HEAD)` green per workspace** — Step
      10.4, corrected command (Task 14.3). Re-run 2026-08-02: api 139 suites / 1895 passed / 3 failed
      (all `seed-test-accounts.spec.ts`, Task 14.6, pre-existing/environmental — not P13 code); frontend
      22 suites / 210 passed.
- [ ] **Coverage floors not breached; ratchet run once at the end, not per step (§13).** Frontend raised
      in `cc40fce` and re-verified green. API floors are not breached (measured 2026-08-01: 88.41%
      stmts / 77.89% branches / 88.70% funcs / 88.89% lines against a 75-branch floor), **but
      `npm run test:coverage` cannot complete for the api workspace** (Task 14.6's blocker) and the api
      ratchet has never run on this branch. **Blocked on Task 14.6.**
- [x] **§0a grep clean.** Task 14.2: `LOGISTIC_BASE` extracted, API-side grep returns no matches; §0a
      widened to the frontend surfaces and the wire-format-fixture exception (`Profile.spec.tsx`) is
      written into the doc rather than left implicit.
- [ ] **Full e2e sweep once before merge (§8).** Step 10.1 added `ratings.spec.ts` and its
      selection-map row. **Blocked on Task 14.5** — the reported 436/1 sweep count doesn't reconcile
      against the 250-block selection map (~63 unaccounted for) and needs a clean re-run plus a written
      breakdown before this is trustworthy.
- [x] **[ISSUE-47](./UAT_ISSUES.md#issue-47) and [ISSUE-48](./UAT_ISSUES.md#issue-48) closed** —
      ISSUE-47 (non-transactional settle) by Phase 12 (`6bf7d7c`); ISSUE-48 (unlocked read-modify-write)
      by Phase 12 for existing rows and **Task 14.1** (`95d8463`) for a player's first match in a
      (sport, format), which Phase 12 alone left open. See `UAT_ISSUES.md`.
- [x] **Step 5.3 placement decided by the owner** — decided 2026-07-31: **not building.** R27 made the
      rating display-only, so the seed prompt lost its justification. The endpoint stays.
- [x] **Phase 8's R20 pairing removed by Phase 11**, verified by the Step 11.2 grep re-run 2026-08-02:
      `grep -rn "RatingsRepository\|player_ratings" packages/api/src --include=*.ts | grep -v __tests__`
      lists only the subsystem itself, `dsr-service.ts`, and `routes/player.ts` — `db.ts` does not
      appear.
- [x] **Casual pairing is a known interim state, not the end state.** Phase 11 (built) leaves consenting
      leftovers on a random shuffle (pre-Phase-8 behaviour), confirmed by the grep above. PLAYER_GROUPS_
      DESIGN §13 replaces it in a later track; this branch's job was only to stop reading ratings, which
      it now does.

## Deliberately out of scope

- **Knockout ratings** — design §6, moot while play is casual round-robin
- **Partner-chemistry stat (R11)** — separate later work
- **Partner-quality weighting (R10's cost)** — needs real doubles volume
- **Backfill** — design §6: existing match data is essentially all fixture data
- **A `rating.updated` SSE event** — design §3b: the `/profile` panel fetches once on mount and the
  value renders nowhere else, so a mount refetch already gets fresh data. If it is ever built, use the
  **player-scoped** stream; `sse-client.ts:28` is tournament-scoped and a rating is cross-tournament
- **Deferring application by hours** — design §3b, rejected: no benefit to batch, and it turns R25's
  bounded pairing lag and R24's correction race into the common case rather than the rare one
- **A sync-while-provisional / async-after split** — design §3b, rejected: there is no
  provisional/settled switch in doubles, only a ramp keyed on the partners' **mean** match count, so
  the predicate costs the same reads it was meant to save
