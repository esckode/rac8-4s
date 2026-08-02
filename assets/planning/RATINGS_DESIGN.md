# Skill Ratings (P13) — Design

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md). Implements
> [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) **P13**.

**Date:** 2026-07-30 — **grilled to resolution 2026-07-30, see §3 (R1–R14).**
**Second pass 2026-07-30** — a gap audit against the actual code found six holes, four of them in
load-bearing decisions. Grilled to resolution as **R15–R20** (§3). **R5 and R8 were rewritten, not
appended to** — they described mechanics that do not exist. See §3a for why the trust model changed.
**Status:** 📐 **Design (grilled ×2)** — implementation plan written, see [RATINGS_IMPLEMENTATION.md](./RATINGS_IMPLEMENTATION.md).

---

## 1. The model in one paragraph

Every player carries a **private** skill rating per **sport × format** on a **100–500** scale, seeded
from an optional self-assessment (default **270**) and updated **when a score is submitted** by an
amount **scaled to the rating gap** — beating someone stronger moves you more. A later correction to
that score reverses and reapplies the change, so a mistake is self-healing rather than permanent. It
is shown **only to its owner**, on `/profile`, and is used internally to balance auto-paired doubles —
but only once the number has stopped being a guess. Doubles teams are averaged and both partners move
equally. Casual group play counts in full, because after
[ISSUE-29](./COMPLETED_UAT_ISSUES.md#issue-29) it is essentially all the play there is.

## 2. Why private

The decisive argument is not privacy for its own sake — it is that the two things a rating is *for*
pull in opposite directions when it is public:

- **Motivation** needs the player to see it.
- **Social health** in a casual app needs nobody else to. A visible number invites sandbagging,
  avoiding strong opponents, and discourages beginners — in a product whose entire purpose is getting
  people to play each other.

Private-to-self satisfies both. It also has direct precedent: `PrivacyPolicy.tsx:46` already
establishes *"Every authenticated account has a **private** Coach."*

The existing group **Leaderboard keeps ranking on wins/losses** (`LeaderboardPanel`, `IndividualRow`)
— it is unchanged by this work.

## 3. Grill decisions (2026-07-30)

| # | Decision | Grounding |
|---|---|---|
| **R1** | **Private to the player.** Shown only to its owner; never on a leaderboard | Resolves the motivation-vs-social-health conflict above; matches the private-Coach precedent |
| **R2** | ~~Also used internally for balanced auto-pairing~~ → **superseded by R26 (2026-07-31)** | The grounding was *"a hidden rating makes mixers fairer with no number on screen."* Measured, it does the opposite: R20's sort-and-pair-lo/hi is deterministic, so with stable ratings **the same pairs re-form every tournament** — one distinct partner per player across ten tournaments. It made mixers *stop mixing*. See §3c. With R2 gone the rating has **no behavioural consumer at all** (R27) |
| **R3** | ~~Scale 0–500~~ → **Scale 100–500** (narrowed by **R18**), shaped like NTRP ×100 | Instantly interpretable to racket players. ⚠ **Do not claim NTRP equivalence in copy** — NTRP is a skill-descriptor system, not outcome-derived, so a 350 here is *not* a USTA 3.5 |
| **R4** | **Seed from an optional self-rating; default 270** | Mirrors how NTRP and UTR both start. Sandbagging, the usual objection, is largely defused because **nobody else sees the number** |
| **R5** | ~~at first confirmed match~~ ~~at first *scored* match~~ → **superseded by R21** — ask at tournament registration | Twice amended, twice for the same underlying reason: the trigger was tied to scoring. R21 moves it earlier and removes the replay it forced |
| **R6** | **Keyed per `(player, sport, format)`** | Data supports it: `tournaments.sport` (pickleball + tennis both in use) and `group_matches.format` |
| **R7** | **Portable across groups** | `player_id` is already durable cross-tournament. ⚠ Ratings are only strictly comparable *within* a group that shares opponents — tolerable precisely because R1 makes it private |
| **R8** | ~~Updated on score confirmation~~ → **Updated on score submission** (superseded by **R15**; kept visible because the original reasoning was wrong in an instructive way) | The premise was false. The columns exist, but nothing ever sets them: `db.ts:1311` marks a match `completed` on submission, the confirm endpoint has **no frontend caller**, and it 403s anyone who is not `player1`/`player2` — which in casual mode is routinely the person scoring. The "trust property for free" was not free; it was unbuilt |
| **R9** | **Movement scaled by the rating gap** | Without it the rating is a *win counter*, and the fastest way up is to only play weaker opponents — the exact opposite of the product's purpose |
| **R10** | **Doubles: team rating = mean of partners; both move equally** | Reuses the singles maths on the same scale; works with per-tournament `teams` and constant partner reshuffling. Known cost: a weak player carried by a strong partner gains what they did not earn — self-correcting across varied partners, which a mixer supplies |
| **R11** | **Partner chemistry is a *stat*, not a rating** ("you and Ben: 7–2") | A pair rating is not *yours*, is undefined for a new partner, and fragments N(N−1)/2 ways. Critically, **auto-pairing needs a rating for players who have never partnered** — exactly when a pair rating does not exist. `LeaderboardPanel` already has an unused `pairs` track for this |
| **R12** | **Casual counts in full** | Post-ISSUE-29 every group launch is `mode: 'casual'` and public discovery is off, so casual is ~100% of real play. Anything less than full weight is a rating that never moves |
| **R13** | **Provisional period** — larger step early, decaying with matches played | Self-assessment is noisy; a wrong seed must correct in a few sessions, not a season. Per bucket, so each `(sport, format)` starts provisional |
| **R14** | **No inactivity decay** — the rating simply persists | Racket sport is seasonal (the reason pause-instead-of-cancel was adopted in `MONETIZATION_DESIGN.md` §10c). Demoting someone for not playing punishes the off-season and discourages returning |
| **R15** | **Trigger is score submission, not confirmation** (supersedes R8) | Confirmation is unbuilt (see R8's revised grounding) and, more fundamentally, is the wrong shape for casual — see §3a. **Privacy replaces confirmation as the trust argument**: R1 means nobody else sees the number, so there is no incentive to falsify a result to move it |
| **R16** | **A corrected score reverses and reapplies the rating change** — no cascade to other players | This is what makes R15 safe: a wrong score is *self-healing* rather than permanent, so honest typos (the only realistic threat once R1 removes the malicious one) repair themselves through a path that already works today. Deliberately **not** a full replay — §4 already refuses to cascade-recompute for DSR on the same logic, and ratings are path-dependent, so an exact replay would fan out through every opponent in every group |
| **R17** | **Always reverse the *most recent* delta for that match, and no-op when the score is unchanged** | Gives idempotency for free rather than bolting it on. A duplicated edit reverses `new_delta` and reapplies `new_delta` — mathematically a no-op. ⚠ **Reverse the *original* delta instead and a replayed edit double-corrects.** This matters concretely: the service worker replays queued score writes on reconnect. (Submission is already safe — `score-service.ts:125` returns `ALREADY_SCORED`.) The no-op short-circuit keeps replays from writing junk history rows |
| **R18** | **Band is 100–500**, not 0–500 | Both NTRP and pickleball self-rating conventions start at **1.0**; there is no NTRP 0.0, so the old 0–100 band mapped to no real skill level. The 500 ceiling is right and clips essentially nobody — 5.0 is the practical top of *recreational* play in both sports, and above it is former-college/tournament territory |
| **R19** | **Tail zones 100–150 and 450–500 move at half step — toward the bound only** | Crossing a tail takes roughly double the results, so the extremes are earned rather than stumbled into. **Directional** is the important half: a beginner at 130 who starts winning climbs out at *full* speed, which is what §2's don't-discourage-beginners argument demands. Symmetric halving would make the tails a trap. Deepens the zero-sum break (in the tail a winner gains half while the loser loses full) — acceptable for a private, non-leaderboard number, but stated rather than discovered |
| **R20** | ~~**Auto-pairing consumes the *doubles* rating only, and only once that bucket is out of provisional**~~ → **superseded by R26 (2026-07-31)**; original reasoning kept because it was sound and the *measurement* is what overturned it | Pairing is doubles-only by construction — `createGroups` (singles) takes no `pairUnpaired` argument; only `createGroupsForDoubles` pairs, and only *leftovers* who registered without a partner. So R2 spends the **least** trustworthy number in the design: R5 seeds it from a single self-assessment, R10 concedes carried players gain what they did not earn, and §6 notes all 290 existing doubles matches are synthetic. Gating on R13's existing per-bucket provisional flag costs no new schema and switches itself on as real volume arrives |

| **R21** | **Ask the self-rating at tournament *registration*, before any score exists — and do not offer it once the bucket has a scored match. No replay.** | Registration already knows the sport (`tournaments.sport`), is not signup, and happens *before* scoring — so it keeps everything R5 wanted (no signup friction, one question per sport, asked in context) while making replay unnecessary. **Deletes an entire subsystem**: re-applying past results, its double-seed double-count bug, and the question of storing opponent ratings to recompute accurately. The gap it accepts: a player auto-registered by a group launch, whose match is scored before they open the app, is never offered the question — they keep `SEED_DEFAULT` and calibrate through R13's large early steps, which is exactly what R13 is for. A few matches of accuracy on a private number, traded for removing a subsystem |

*Third pass, 2026-07-31 — see §3b for the reasoning behind R22–R25.*
⚠ **R22, R24 and R25 were superseded the same day by R29** (§3c). They were correct given R20; removing
R20 removed the only consumer that needed a fresh rating, and with it the case for asynchrony. **R23
survives** — the seed endpoint stays synchronous. Kept visible rather than deleted because the
reasoning is sound and would be re-derived by anyone who reintroduces a consumer.

| # | Decision | Grounding |
|---|---|---|
| **R22** | **Rating application moves to the worker; the score write never waits for it** | R15 keeps its trigger — submission, not confirmation — but stops owning the *timing*. Ratings already run best-effort behind a swallow-and-continue wrap (`score-service.ts:255`), so the score path already does not depend on them succeeding; asynchrony only makes explicit what that wrap already conceded. Buys back 4–14 queries per score on a request that fires once per match under live-tournament latency, and — the larger win — lets the whole multi-player settle run in **one transaction with row locks**, which the inline path has never done (see [ISSUE-47](./UAT_ISSUES.md#issue-47), [ISSUE-48](./UAT_ISSUES.md#issue-48)) |
| **R23** | **The self-rating seed (R21) stays synchronous** | Not an exemption carved out of R22 — `PUT /player/ratings/seed` is a separate route that never enters `submitScore`, so keeping it costs nothing. Three reasons it must not be queued: it **returns the seeded values in its own response** (`player.ts:228`); its 409 legality guard (`player.ts:214`) is a read-then-write that becomes a TOCTOU race the moment the write is deferred; and `seedRatingForSport` upserts `matches_played = 0` **unconditionally** (`ratings-service.ts:293`), so a seed landing after an apply does not merge — it erases the match. Sync seeding is also what guarantees the baseline is committed before any apply job can read it |
| **R24** | **The worker reads the match's *current* score at apply time; no submit-time participant snapshot** | Makes the R16/R17 correction path race-free rather than merely narrow. A correction arriving before the apply simply changes what the worker computes, so `correctRatingForMatch` is only ever reached for edits to an **already-applied** match — precisely the case R17's "reverse the most recent delta" was written for. The snapshot alternative reintroduces the failure it was meant to avoid: the correction throws `no current rating` (`ratings-service.ts:71`), the best-effort catch swallows it, and the apply later bakes in the pre-correction result. `appendHistory` already stores `match_id`, so "settled matches with no history rows" is a ready-made watermark |
| **R25** | **R20's pairing gate may read a stale `matches_played`. Accepted, not fixed** | Group creation is organizer-triggered and separate from scoring — casual auto-advance only flips status to `group_stage_complete` (`score-service.ts:281`), it does **not** create groups — so minutes of human latency sit between the last score and the pairing read, and an immediate queue drains well inside that. The residual: a player who just crossed `PROVISIONAL_MATCHES` reads as provisional for one pass and lands in the random bucket. That is the documented `ratings.pairing.fallback` path (`db.ts:1143`) — degradation to pre-R20 behaviour, not breakage. ⚠ **Stated and accepted; not an oversight to re-raise.** If it ever needs to be airtight, drain the roster's unapplied matches at group creation — do not make application synchronous again |

*Fourth pass, 2026-07-31 — see §3c. These supersede R2, R20, and R22/R24/R25.*

| # | Decision | Grounding |
|---|---|---|
| **R26** | ~~Auto-pairing balances *partner novelty*, not rating~~ → **amended hours later, same day: the system does not pair at all.** Casual play becomes a session ledger where players form their own teams and results are logged after the fact — see [PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md) §13, which now owns this. **What survives for ratings is only the deletion:** `db.ts` stops reading `player_ratings`, and pairing leaves this subsystem permanently. The novelty *weighting* below is retained there as a chat **suggestion** (§13.3), not an assignment | Measured against R20 over ten successive tournaments with **perfect ratings supplied** (so this is not a calibration artifact): R20 yields **1.0 distinct partners per player, 100% repeat rate**; novelty yields **9.3 of a possible 11, 7% repeat**. R20 buys 0% blowouts and costs the product its purpose — a social mixer where you meet the same person forever is not a mixer. Novelty costs ~14% blowouts, reducible by the balance tiebreak. ⚠ It also **restores R10's premise**: R10 justified the carry effect as "self-correcting across varied partners, which a mixer supplies," and R20 was removing exactly that variety — which is why two players of identical true skill sat 39 points apart after 80 rounds and never converged. Needs **no new schema**: `public.teams (tournament_id, player1_id, player2_id)` is the partner-history record, written by the code being replaced |
| **R27** | **The rating is display-only. No system behaviour consumes it** | Consequence of R26, stated so it is not rediscovered. Full consumer list: producers (`score-service.ts`, `tournaments.ts`), the subsystem, DSR (`dsr-service.ts`), and the `/profile` read (`player.ts`). `db.ts`'s R20 pairing was the **only** behavioural consumer; @coach never reads a rating. The *singles* bucket was already display-only — R20 was doubles-only by construction — so this changes nothing for singles play. ⚠ A private progress number is a legitimate feature, but it is a **different product than R2 argued for**; anyone re-reading R1/R2 should know the functional justification was removed deliberately, not lost |
| **R28** | **`/profile` shows singles + doubles ratings and the player's last 10 partners, across *all* groups** | Owner call, 2026-07-31: engagement. Cross-group is safe **because the page is private to its owner** (R1) — the same argument that makes the rating itself safe to show. ⚠ This is the first thing in the product that surfaces *who you played with elsewhere*; it is only defensible while the surface stays owner-only. Do not reuse this query on any shared or group-scoped view. Same `teams` source as R26 — one data source serves both |
| **R29** | **Rating application stays synchronous, batched into one transaction** (supersedes R22/R24/R25) | R22's case was hot-path latency *plus* R20 needing freshness. R27 removes the consumer, so nothing depends on the rating being current, and the remaining cost is fixable without a queue: the ~14 statements per doubles score are four sequential reads and eight separate writes, which batch to ~3 (`SELECT … WHERE player_id = ANY($1) FOR UPDATE`, one multi-row upsert, one multi-row history insert). That batching **falls out of the transaction [ISSUE-47](./UAT_ISSUES.md#issue-47)/[ISSUE-48](./UAT_ISSUES.md#issue-48) already require**. Avoids a Redis dependency, a processor, and Step 9.6's trap where a missing worker silently stops rating matches. ⚠ **Lazy-on-read was considered and rejected**: the rating is path-dependent, so recomputing on read means replaying all history, and *per-player* laziness is outright wrong for doubles — one match's two team deltas are computed from all four current ratings at once, so applying it to one player now and another later computes the sides against different baselines |

### 3a. Why the trust model changed *(second pass, 2026-07-30)*

R8 was the load-bearing decision and it rested on a false premise, so the reasoning is worth recording
rather than just the correction.

**What R8 assumed.** That requiring both players to confirm a score would stop a disputed or unilateral
result from moving anyone's rating — and that this was free, because the confirmation columns already
existed.

**Why it does not hold.** Two separate problems, either of which alone would sink it:

1. **The mechanism is unbuilt.** `player1_confirmed`/`player2_confirmed` exist and are read, but
   nothing in the running app ever sets them. Submitting a score marks the match `completed` outright
   (`db.ts:1311`), and `PATCH /:id/matches/:matchId/confirm` has **no frontend caller and no e2e
   coverage**. A rating triggered on confirmation would never have fired once.
2. **It is the wrong shape for casual, which R12 says is ~100% of play.** Casual deliberately lets
   *any participant score any match* (`score-service.ts:97`), while the confirm route 403s anyone who
   is not `player1`/`player2` of that match. So the person who entered the score frequently *cannot*
   confirm it, and confirmation would depend on two players who may never open the app. R8 and R12
   were pulling in opposite directions.

**What replaces it.** R1's privacy does the work confirmation was meant to do. Nobody else sees the
number, so falsifying a result buys nothing — the same argument R4 already uses to defuse sandbagging.
That leaves honest mistakes, and R16 handles those by making corrections reversible through score
editing, which already works.

**The option deliberately rejected:** building the confirmation UI and requiring it. It is the most
"correct" answer and it produces R12's named failure mode — *"a rating that never moves"* — because in
a casual mixer most matches would simply never get confirmed.

### 3b. Why application became asynchronous *(third pass, 2026-07-31)*

Phases 0–8 shipped with rating movement applied inline, inside the score request. R22–R25 move it to
the worker. The route there ran through three weaker proposals, and the discarded ones are worth
recording because each looks reasonable until you check it against the code.

**Rejected: defer by hours.** The maths tolerates it — `computeDelta` reads each participant's current
rating and match count, so a backlog processed in order produces identical numbers to inline
processing. Three consumers do not tolerate it. R20's gate would misclassify recently-settled players
for hours rather than seconds; the correction path would break for the *common* case rather than a rare
one; and the `/profile` panel would need an "as of" affordance it does not have. There was also no
motivating benefit — the calculation is a handful of small queries and pure arithmetic, not something
worth batching.

**Rejected: sync while provisional, async after.** This aims at the right target — it makes R20's gate
exact, because the match that carries a player across `PROVISIONAL_MATCHES` is applied before any
pairing pass can read it. It breaks on doubles. There is no provisional/settled *switch* in the maths:
`stepSize` is a linear ramp, and a team's position on it is the **mean** of the partners' match counts
(`ratings-service.ts:147`). A settled player (10 matches) partnered with a newcomer (0) sits at a team
mean of 5 — K≈17, still ramping. So "is this player provisional" is not a well-formed question in
doubles; the predicate has to mirror the calculator's own mean rule, needs all four ratings read on the
request path to evaluate, and therefore keeps the reads while moving only the writes. A more expensive
predicate guarding a smaller saving.

**What was adopted (R22–R24).** Apply everything in the worker, keep the seed synchronous, and have the
worker read the match's current score rather than a snapshot. R25 records the one thing this gives up.

**The argument that decided it was not performance.** Inline application is not merely slow, it is
*unprotected*. `deps.db` is the bare Pool (`tournaments.ts:653`) and `score-service.ts` opens no
transaction, so a doubles settle is eight independent autocommitted statements across four players
(`ratings-service.ts:152-155`): fail after the third and two players keep movement the other two never
got, with the best-effort catch swallowing the error. `getFor` takes no lock and `upsert` writes an
absolute value, so two concurrent scores for one player lose an update outright. **Both are real
defects in Phases 3–4 as built**, not introduced by this change — filed as
[ISSUE-47](./UAT_ISSUES.md#issue-47) and [ISSUE-48](./UAT_ISSUES.md#issue-48), and due before
`feat/ratings-p13` merges. Moving to the worker is simply the
cheapest place to fix them, because a job owns the whole settle and can wrap it in one transaction with
`SELECT … FOR UPDATE`. ⚠ Async **widens** ISSUE-48 if concurrency is left unpinned, so the lock is part
of the move, not a follow-up.

**Deliberately not built: a `rating.updated` SSE event.** The panel does not live-update today — it
fetches once on mount (`Profile.tsx:57-84`) and the value renders nowhere else, so the person entering
a score never sees their rating in that flow. Staleness while sitting on `/profile` already exists
synchronously, since the *opponent* usually enters the score. A mount refetch gets fresh data, and the
only new gap is a mount that lands a beat ahead of the job. If it ever becomes worth building, use a
**player-scoped** stream (`/player/notifications/events`) — `sse-client.ts:28` is tournament-scoped and
a rating is cross-tournament.

### 3c. Why pairing stopped consuming the rating *(fourth pass, 2026-07-31)*

R20 shipped (Phase 8) and was overturned the next day by measurement, not argument. The reasoning in
R2 and R20 was sound; the simulations were not run until Step 5.3 forced the question *"how wrong is a
player who never sets a self-rating?"* — and answering it kept producing results that indicted the
consumer rather than the seed.

**What was simulated.** The real constants and formulas, R20's actual pairing algorithm, doubles team
means per `ratings-service.ts:147`. Caveats worth carrying: single RNG seed, 8–12 players, and true team
strength modelled as the mean of partners — which is *charitable*, since that is precisely what R10
assumes and real doubles is not mean-additive.

**Finding 1 — the seed matters less than expected, for a different reason than expected.** A cohort
starting together converges in *ordering* fast (79% correct after five rounds, 89% by twenty), and
ordering is all R20 consumed. Uniform miscalibration cancels. But a **newcomer joining an established
group** does not converge at all: a genuine 350 entering unseeded sat at 313 after forty matches with
three weaker players still rated above them. The seed's value was never calibration *speed* — it was
*entry point*, and only for the join-an-existing-group path.

**Finding 2 — R20 created the incentive R4 said did not exist.** R4 recorded sandbagging as "largely
defused because nobody else sees the number." R20 did not make the number visible; it made its
*consequence* visible. Sorting and pairing lo/hi means a lower rating deterministically buys a
higher-rated partner. Measured: a true 350 seeding at `RATING_MIN` ended with partners averaging 313
true skill against the honest seeder's 218 — a permanent ~95-point advantage — and was still 140 points
below true after forty matches. The gradient runs one way: over-stating is self-punishing (worse
partners, dragged down), under-stating is self-rewarding and persistent.

**Finding 3 — the one that decided it.** Given *perfect* ratings, R20 produces **one distinct partner
per player across ten tournaments**. Deterministic sort plus deterministic lo/hi pairing re-forms the
identical pairs every time. This needed no simulation to establish, only to notice.

**What was rejected along the way.** Clamping the self-seed to `>= SEED_DEFAULT` (upward-only) was the
proposed fix for Finding 2 and is a good fix — it removes the sandbagging incentive while keeping the
newcomer benefit, since downward error is self-accelerating and upward error is self-decelerating.
It is recorded here because it becomes the right answer again the moment anything consumes the rating.
Under R26/R27 it is unnecessary: nothing reads the number, so there is nothing to game.

**The honest summary:** P13 was justified by R1 (a private progress number) *and* R2 (fairer mixers).
R2 turned out to be false in the strong sense — the mechanism produced the opposite of its goal. What
remains is R1, plus R28's partner history, as an engagement feature. That is a deliberate narrowing.

## 4. Storage and DSR

**This is settled at grill time, not retrofitted** — the non-negotiable rule
`PERSONALIZATION_DESIGN.md` imposes on every new durable per-player data class.

```
player_ratings         (player_id, sport, format) → rating, matches_played, updated_at
player_rating_history  (player_id, sport, format) → delta, rating_after, match_id, created_at
```

**`player_rating_history` is append-only, and R17 depends on that.** A correction writes a *new* row
rather than mutating the old one — which is what makes "reverse the most recent delta for this match"
well-defined, and what keeps the correction itself auditable. ⚠ **Do not add a
`UNIQUE (player_id, match_id)` constraint**: it looks like the obvious way to stop double-application,
but it forces corrections to overwrite in place, destroying both the audit trail and R17's mechanism.
Idempotency comes from the reverse-latest rule plus the unchanged-score no-op, not from the schema.

**Erasure.** Add one step to `dsr-service.ts`'s `erase()` fan-out (the file is at
`packages/api/src/dsr-service.ts`, lines 81–84 — *not* `src/services/`), alongside the three existing
precedents in the same block — `playerSettingsRepo.deleteFor`, `availabilityRepo.deleteFor`, and most
directly **`standingsSnapshotRepo.deleteFor`**, which is per-player derived *competitive* data and is
deleted outright rather than anonymised:

```ts
await this.ratingsRepo.deleteFor(playerId)   // current + history
```

**Other players' ratings are left untouched.** Their number retains the points won or lost against
the erased player, but nothing identifying them: "276" contains no name or id, and is *their* data.
Recomputing others to remove the influence would mean **rewriting one player's record because another
left** — and is impossible anyway without replaying the matches you just erased.

`match_id` in history stays valid because matches already anonymise the leaver
(`anonymizeMatchLogSlotsFor`), so a rating remains explainable — which matters when a player says
"this looks wrong."

**Export** is a row dump of both tables for that player.

## 5. Display

`/profile` — the existing player-scoped page (density, quiet hours, availability).

```
YOUR RATING
  Tennis      singles  350  (provisional)
              doubles  350  (provisional)
  Pickleball  —  not yet played
```

Shown **immediately, labelled provisional** while the step size is still large. Honest — early on the
number *is* the player's own self-assessment — and the label doubles as an explanation for early
swings. No arbitrary match-count gate to justify.

The provisional label now carries a second, invisible meaning: per **R20** it is also the switch that
decides whether auto-pairing trusts the number. Worth knowing when writing the copy — the same flag
the player reads as *"this is still settling"* is what keeps an unproven rating out of pairing.

## 6. Open — deliberately not decided here

- **The constants.** The step-size schedule and the logistic divisor for a **100–500** scale must be
  *derived*, not guessed: standard Elo constants assume a ~400-point spread and do not transfer.
  R20 buys time here — nothing *consumes* the rating until a bucket leaves provisional, so the number
  can be wrong for a while without affecting pairing.
  ⚠ Both bounds break zero-sum, and R19's tails deepen it. This is stated in R18/R19 and accepted for
  a private, non-leaderboard number; it is **not** an oversight to re-raise.
- **The provisional threshold** — how many matches a bucket needs before R13 stops calling it
  provisional. Now load-bearing beyond display, because R20 gates pairing on it. Same constraint as
  the constants above: derive it, and note there is no real doubles data to derive it *from* yet.
- **Partner-quality weighting** (R10's known cost). Revisit only with real doubles volume; there are
  currently 290 doubles matches and all are synthetic, so there is nothing to tune against.
- **Partner chemistry stat** (R11) — a later, separate piece of work.
- **Backfill** — moot at launch: essentially all existing match data is e2e fixture data.
- ~~**When pairing starts consuming the rating** (R2)~~ — **closed by R20**: when the doubles bucket
  leaves provisional. What remains is only sequencing the change into `createGroupsForDoubles`.
- **Knockout matches.** Everything here is keyed on group matches. `knockout_matches` carries the same
  confirmation columns and has its own score route, but casual play is round-robin (`app.ts:253`), so
  under the current casual-unlisted scope this is moot. Revisit only if knockout reaches casual.

## 7. Relationship to other docs

- [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) — P13 is this doc; P11 trends feed the
  history display (§5). The DSR rule in its §1 is what §4 above discharges.
- [PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md) — groups are where the matches happen, and the
  anonymise-on-DSR precedent for shared competitive records comes from there.
- [MONETIZATION_DESIGN.md](./MONETIZATION_DESIGN.md) — §10c pause-instead-of-cancel is the seasonality
  evidence behind R14.
- [RATINGS_IMPLEMENTATION.md](./RATINGS_IMPLEMENTATION.md) — **written 2026-07-30, in progress.**
  Migration, the update service hooked to score **submission** (not confirmation — see R15), the
  correction path (R16/R17), the self-rating seed *(replay deleted by R21)*, the `/profile` panel, the
  `dsr-service.ts` line, and the R20 pairing gate. **Phases 0–8 built as of 2026-07-31.** Remaining
  there: **Phase 11** (R26 novelty pairing) → **Phase 12** (R29 batched transactional settle) →
  **Phase 13** (R28 partners panel) → **Phase 10** (test debt). ⚠ **Phase 9 was dropped and Step 5.3 is
  not being built** — both were casualties of R26/R27; the seed endpoint stays but has no UI, so every
  player holds `SEED_DEFAULT`, which is now harmless because nothing consumes the number.
