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
| **R2** | **Also used internally for balanced auto-pairing** | `auto_pair_consent` + `pairUnpaired` already exist ([ISSUE-17](./COMPLETED_UAT_ISSUES.md#issue-17)); a hidden rating makes mixers fairer with no number on screen |
| **R3** | ~~Scale 0–500~~ → **Scale 100–500** (narrowed by **R18**), shaped like NTRP ×100 | Instantly interpretable to racket players. ⚠ **Do not claim NTRP equivalence in copy** — NTRP is a skill-descriptor system, not outcome-derived, so a 350 here is *not* a USTA 3.5 |
| **R4** | **Seed from an optional self-rating; default 270** | Mirrors how NTRP and UTR both start. Sandbagging, the usual objection, is largely defused because **nobody else sees the number** |
| **R5** | ~~at first confirmed match~~ → **Ask lazily, per sport, at first *scored* match** — seeds both formats, skippable. Answering it **replays** the player's matches so far from the new baseline (see R17) | Zero signup friction on a deliberately minimal flow; asked in context, one question per sport rather than four. **Rewritten in the second pass:** confirmation is no longer the trigger (R15), so the original wording pointed at an event that no longer exists |
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
| **R20** | **Auto-pairing consumes the *doubles* rating only, and only once that bucket is out of provisional** | Pairing is doubles-only by construction — `createGroups` (singles) takes no `pairUnpaired` argument; only `createGroupsForDoubles` pairs, and only *leftovers* who registered without a partner. So R2 spends the **least** trustworthy number in the design: R5 seeds it from a single self-assessment, R10 concedes carried players gain what they did not earn, and §6 notes all 290 existing doubles matches are synthetic. Gating on R13's existing per-bucket provisional flag costs no new schema and switches itself on as real volume arrives |

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
- [RATINGS_IMPLEMENTATION.md](./RATINGS_IMPLEMENTATION.md) — **written 2026-07-30.** Migration, the
  update service hooked to score **submission** (not confirmation — see R15), the correction path
  (R16/R17), the self-rating prompt and replay, the `/profile` panel, the `dsr-service.ts` line, and
  the R20 pairing gate. Phase 0 (constants) needs owner sign-off before Phase 2 can start.
