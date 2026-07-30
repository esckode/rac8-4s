# Skill Ratings (P13) — Design

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md). Implements
> [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) **P13**.

**Date:** 2026-07-30 — **grilled to resolution 2026-07-30, see §3 (R1–R14).**
**Status:** 📐 **Design (grilled)** — no implementation plan yet.

---

## 1. The model in one paragraph

Every player carries a **private** skill rating per **sport × format** on a **0–500** scale, seeded
from an optional self-assessment (default **270**) and updated **when a score is confirmed** by an
amount **scaled to the rating gap** — beating someone stronger moves you more. It is shown **only to
its owner**, on `/profile`, and is used internally to balance auto-paired doubles. Doubles teams are
averaged and both partners move equally. Casual group play counts in full, because after
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
| **R3** | **Scale 0–500**, shaped like NTRP ×100 | Instantly interpretable to racket players. ⚠ **Do not claim NTRP equivalence in copy** — NTRP is a skill-descriptor system, not outcome-derived, so a 350 here is *not* a USTA 3.5 |
| **R4** | **Seed from an optional self-rating; default 270** | Mirrors how NTRP and UTR both start. Sandbagging, the usual objection, is largely defused because **nobody else sees the number** |
| **R5** | **Ask lazily, per sport, at first confirmed match** — seeds both formats, skippable | Zero signup friction on a deliberately minimal flow; asked in context, one question per sport rather than four |
| **R6** | **Keyed per `(player, sport, format)`** | Data supports it: `tournaments.sport` (pickleball + tennis both in use) and `group_matches.format` |
| **R7** | **Portable across groups** | `player_id` is already durable cross-tournament. ⚠ Ratings are only strictly comparable *within* a group that shares opponents — tolerable precisely because R1 makes it private |
| **R8** | **Updated on score confirmation, not submission** | `player1_confirmed` / `player2_confirmed` already exist on `group_matches`, so a disputed or unilateral score cannot move anyone's rating — trust property for free |
| **R9** | **Movement scaled by the rating gap** | Without it the rating is a *win counter*, and the fastest way up is to only play weaker opponents — the exact opposite of the product's purpose |
| **R10** | **Doubles: team rating = mean of partners; both move equally** | Reuses the singles maths on the same scale; works with per-tournament `teams` and constant partner reshuffling. Known cost: a weak player carried by a strong partner gains what they did not earn — self-correcting across varied partners, which a mixer supplies |
| **R11** | **Partner chemistry is a *stat*, not a rating** ("you and Ben: 7–2") | A pair rating is not *yours*, is undefined for a new partner, and fragments N(N−1)/2 ways. Critically, **auto-pairing needs a rating for players who have never partnered** — exactly when a pair rating does not exist. `LeaderboardPanel` already has an unused `pairs` track for this |
| **R12** | **Casual counts in full** | Post-ISSUE-29 every group launch is `mode: 'casual'` and public discovery is off, so casual is ~100% of real play. Anything less than full weight is a rating that never moves |
| **R13** | **Provisional period** — larger step early, decaying with matches played | Self-assessment is noisy; a wrong seed must correct in a few sessions, not a season. Per bucket, so each `(sport, format)` starts provisional |
| **R14** | **No inactivity decay** — the rating simply persists | Racket sport is seasonal (the reason pause-instead-of-cancel was adopted in `MONETIZATION_DESIGN.md` §10c). Demoting someone for not playing punishes the off-season and discourages returning |

## 4. Storage and DSR

**This is settled at grill time, not retrofitted** — the non-negotiable rule
`PERSONALIZATION_DESIGN.md` imposes on every new durable per-player data class.

```
player_ratings         (player_id, sport, format) → rating, matches_played, updated_at
player_rating_history  (player_id, sport, format) → delta, rating_after, match_id, created_at
```

**Erasure.** Add one step to `dsr-service.ts`'s `erase()` fan-out, alongside the three existing
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

## 6. Open — deliberately not decided here

- **The constants.** The step-size schedule and the logistic divisor for a 0–500 scale must be
  *derived*, not guessed: standard Elo constants assume a ~400-point spread and do not transfer.
  ⚠ Note the **500 cap breaks zero-sum** — at the ceiling a win gains nothing while the opponent
  still loses — which is acceptable for a private number but should be stated, not discovered.
- **Partner-quality weighting** (R10's known cost). Revisit only with real doubles volume; there are
  currently 290 doubles matches and all are synthetic, so there is nothing to tune against.
- **Partner chemistry stat** (R11) — a later, separate piece of work.
- **Backfill** — moot at launch: essentially all existing match data is e2e fixture data.
- **When pairing starts consuming the rating** (R2) — sequencing against the pairing code.

## 7. Relationship to other docs

- [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) — P13 is this doc; P11 trends feed the
  history display (§5). The DSR rule in its §1 is what §4 above discharges.
- [PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md) — groups are where the matches happen, and the
  anonymise-on-DSR precedent for shared competitive records comes from there.
- [MONETIZATION_DESIGN.md](./MONETIZATION_DESIGN.md) — §10c pause-instead-of-cancel is the seasonality
  evidence behind R14.
- Next: `RATINGS_IMPLEMENTATION.md` — migration, the update service hooked to score confirmation, the
  self-rating prompt, the `/profile` panel, and the `dsr-service.ts` line.
