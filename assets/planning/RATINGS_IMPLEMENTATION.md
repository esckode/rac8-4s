# Skill Ratings (P13) — Implementation Plan

> Implements [`RATINGS_DESIGN.md`](./RATINGS_DESIGN.md) (grilled ×2, R1–R20).
> **Read the design first.** This plan assumes its decisions and does not re-argue them.

**Date:** 2026-07-30 · **Status:** 📋 Plan — not started. **Phase 0 signed off 2026-07-30; Phase 1 is
ready to dispatch.**

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
  | grep -v ratings-constants.ts
# expect: no matches
```

**Optional guard, and it fits this repo.** The same `no-restricted-syntax` mechanism ISSUE-44c used to
ban the `-[--token]` class form can ban numeric literals in `ratings-*.ts`. Worth doing if these files
are expected to churn. Phase 0's values are now signed off and stable, so this is likely unnecessary —
the §0a grep covers it. Decide at Phase 2, not before; that is when the shape of the code is known.

---

## Phase 1 — Data layer

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

## Phase 2 — Rating maths (pure module)

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

## Phase 3 — Apply and correct

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

## Phase 4 — Wire into the score paths

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

## Phase 5 — Self-rating seed and replay

**Model: Sonnet.** Ordering plus reuse of Phase 3's primitive.

### Step 5.1 — `PUT /player/ratings/seed`

Accepts a self-rating per sport; seeds **both formats** (R5). Skippable — no call means the player
stays at `SEED_DEFAULT`. ⚠ Validate the input against `RATING_MIN`/`RATING_MAX` from the constants
module, not literals (§0a trap 4).

### Step 5.2 — replay on seed (R5 + R17)

Answering the prompt sets the new baseline and **replays that player's matches so far** from it,
reusing Phase 3's reverse-and-reapply primitive per match in `created_at` order.

Bounded by construction — a player being seeded has almost no history, which is *why* they are being
seeded. **No cascade**: opponents keep the deltas they earned against the default.

**Red:** a player scored once at the default, then seeds 350 → final rating equals "started at 350 and
played that match", not 350 flat and not default+delta. And: never seeding leaves them at 270.

### Step 5.3 — prompt UI

Fires at first *scored* match (R5, as amended). ⚠ In casual, **someone else may have scored it**, so
the prompt cannot be synchronous with submission — surface it on next app open.

---

## Phase 6 — DSR

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

## Phase 7 — Read API and `/profile`

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

## Phase 8 — Auto-pairing consumes the rating (R20)

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

## Definition of done

- [ ] Every step committed as failing-test-then-implementation (CLAUDE.md §11)
- [ ] `npx jest --findRelatedTests $(git diff --name-only main...HEAD)` green per workspace
- [ ] Coverage floors not breached; ratchet run once at the end, not per step (§13)
- [ ] Design doc §4's `dsr-service.ts` path corrected (Step 6.1) and §7's "hooked to score
      confirmation" line updated to *submission*
- [ ] No `-[--token]` classes introduced (§44c lint guard will fail the commit)
- [ ] **§0a grep clean** — no rating constant appears outside `ratings-constants.ts`, including in the
      migration, the tests, and the frontend
- [ ] Full e2e sweep once before merge (§8) — ratings touch scoring, which `group-stage-singles` and
      the casual specs exercise

## Deliberately out of scope

- **Knockout ratings** — design §6, moot while play is casual round-robin
- **Partner-chemistry stat (R11)** — separate later work
- **Partner-quality weighting (R10's cost)** — needs real doubles volume
- **Backfill** — design §6: existing match data is essentially all fixture data
