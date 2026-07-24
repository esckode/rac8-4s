# UAT Issues — found during the 2026-07-20/21 AWS deploy session

Running tracker for defects surfaced while standing up and testing the first UAT
deploy (CloudFront `d37ruxd1gf48ip.cloudfront.net`, since torn down). Each issue is
scoped for a Sonnet implementer: symptom → verified root cause (`file:line`) → fix →
verify. Follow `CLAUDE.md` throughout — TDD (§4), one logical change per commit and
branch-per-issue (§11), surgical edits (§3). **Read the referenced code before editing;
several fixes have a "do NOT" note because the obvious approach is wrong.**

Severity: 🔴 blocks a user-facing feature · 🟠 real defect, limited blast radius · 🟡 robustness.

**Resolved issues are archived in [`COMPLETED_UAT_ISSUES.md`](./COMPLETED_UAT_ISSUES.md)** (CLAUDE.md
§12 — working the open queue shouldn't cost a read of every closed issue). The table below stays the
full index: resolved rows link into the archive, open rows link to a section in this file.

| # | Status | Severity | Title | Area |
|---|---|---|---|---|
| [ISSUE-1](COMPLETED_UAT_ISSUES.md#issue-1) | ✅ Resolved | 🔴 | Registered-account users locked out of Groups (dual-auth gap) | api + frontend |
| [ISSUE-2](COMPLETED_UAT_ISSUES.md#issue-2) | ✅ Resolved | 🟠 | `teardown-uat.sh` silently deletes the SES sender identity | scripts |
| [ISSUE-3](COMPLETED_UAT_ISSUES.md#issue-3) | ✅ Resolved | 🟡 | `deploy-uat.sh` SES re-adopt guard uses the same fragile pattern | scripts |
| [ISSUE-4](COMPLETED_UAT_ISSUES.md#issue-4) | ✅ Resolved | 🟡 | `deploy-uat.sh` frontend build runs from the wrong cwd | scripts |
| [ISSUE-5](COMPLETED_UAT_ISSUES.md#issue-5) | ✅ Resolved | 🟠 | Fake iOS status bar (hardcoded `9:41` + fake signal/wifi/battery) shipped on the auth pages | frontend |
| [ISSUE-6](COMPLETED_UAT_ISSUES.md#issue-6) | ✅ Resolved | 🟠 | Auth "back" buttons hardcode `navigate('/')` instead of true history-back | frontend |
| [ISSUE-7](COMPLETED_UAT_ISSUES.md#issue-7) | ✅ Resolved | 🟠 | Guest bottom nav leaks auth-gated Standings/Matches tabs (dead-end → login) | frontend |
| [ISSUE-8](COMPLETED_UAT_ISSUES.md#issue-8) | ✅ Resolved | 🟠 | Bottom nav has no safe-area-inset handling; viewport lacks `viewport-fit=cover` | frontend |
| [ISSUE-9](COMPLETED_UAT_ISSUES.md#issue-9) | ✅ Resolved | 🟠 | Browse (discovery board) shows raw status enums + lists expired-`registration_open` as "Reg Open" | frontend + api |
| [ISSUE-10](COMPLETED_UAT_ISSUES.md#issue-10) | ✅ Resolved | 🟡 | Featured is positional `[0]`, not curated — make it a "Register soon" set (open + has-spots, most-registered, max 3) | frontend + api |
| [ISSUE-11](COMPLETED_UAT_ISSUES.md#issue-11) | ✅ Resolved | 🟠 | `POST /:id/register` is a public, unauthenticated, **unthrottled** email-send trigger (email-bombing / SES-reputation vector) | api · security |
| [ISSUE-12](COMPLETED_UAT_ISSUES.md#issue-12) | ✅ Resolved | 🟠 | Guest-registration UX: ambiguous app-vs-tournament framing, no auth-aware one-click, doubles partner unsurfaced, email-typo safety | frontend + api |
| [ISSUE-13](COMPLETED_UAT_ISSUES.md#issue-13) | ✅ Resolved | 🟠 | Tournament detail page (`TournamentBrowse`) — no design parity + missing description/deadline/capacity | frontend + api |
| [ISSUE-14](COMPLETED_UAT_ISSUES.md#issue-14) | ✅ Resolved | 🟠 | Emailed magic link forces account creation — wire it to the existing guest-session exchange ("continue as guest") | frontend + api |
| [ISSUE-15](COMPLETED_UAT_ISSUES.md#issue-15) | ✅ Resolved | 🟠 | Doubles partner: three competing mechanisms, the one wired to the UI is a no-op — consolidate on an email-based invite | api + frontend |
| [ISSUE-16](#issue-16) | 🔲 Open | 🟠 | Partner pairing is first-*inviter*-wins — an invite mutates the invitee's registration | api + frontend |
| [ISSUE-17](#issue-17) | 🔲 Open | 🟠 | Solo doubles registrants are auto-paired with a stranger without consent | api + frontend |
| [ISSUE-18](COMPLETED_UAT_ISSUES.md#issue-18) | ✅ Resolved | 🔴 | Confirming a partner has no accept-time guard, and `confirmPartner` is not atomic | api · data |
| [ISSUE-19](COMPLETED_UAT_ISSUES.md#issue-19) | ✅ Resolved | 🟠 | No notification fires when a doubles team is formed, by any path | api |
| [ISSUE-20](#issue-20) | 🔲 Open | 🟠 | Withdrawal never dissolves a team, and no query filters withdrawn registrations | api · data |
| [ISSUE-21](COMPLETED_UAT_ISSUES.md#issue-21) | ✅ Resolved | 🔴 | An invite nobody answered becomes a real team at group creation | api · data |

**Sequencing (doubles-pairing cluster).** ISSUE-18 and ISSUE-19 were split out of 16 and 17 on
2026-07-23; ISSUE-20 and ISSUE-21 were raised the same day while grilling the split (see
"Grill outcomes" below). Each is small, independently correct, and correct under *both* the current
and the proposed pairing model — none should wait on a design. Ship in this order:

1. **ISSUE-18** — accept-time guard, partial unique index, and `confirmPartner` atomicity. 🔴 data
   corruption reachable from shipped UI today. No dependencies. **The three are one change** — the
   index is what turns a non-atomic two-statement write into a half-committed one.
2. **ISSUE-19** — notify on team formation, via the job queue. No schema change, makes everything
   after it observable without a DB probe.
3. **ISSUE-21** — unconfirmed claims are resolved at group creation. 🔴 live consent defect. After
   19 so a cleared inviter is *told* their invite lapsed rather than silently re-paired.
4. **ISSUE-20** — dissolve a team on withdrawal, and give the codebase an "is this registration
   active" predicate it currently lacks entirely.
5. **ISSUE-16** — the invite-is-a-claim rework. **Depends on 18** (accept-time guard assumed
   present) and **21** (the sweep is assumed to exist).
6. **ISSUE-17** — the per-registration consent flag. **Depends on 19** (formation notifications) and
   **21** (which defines the leftover pool the flag decides the fate of), and interacts with 16 §4 —
   see the cross-reference there.

### No live data — migrations are schema-only (2026-07-23)

The webapp is **not deployed and there is no live environment** (per the IaC teardown). Every
"Backfill" / duplicate-cleanup / preserve-existing-rows step in this cluster is therefore moot and
has been cut. Dev and e2e databases are recreated from `db/migrations/` on demand, so the new
migrations only need to **add columns, recreate the `status` CHECK constraint, and add the partial
unique index** — against empty tables. Any stale local row that would violate the new index is fixed
by re-running migrations on a fresh DB, not by a cleanup script.

- **`status` is a CHECK constraint, not a Postgres ENUM.** "Delete `pending_partner_confirm` from the
  enum" means recreating the constraint without it — see
  `db/migrations/028_add_unpaired_registration_status.sql` for the exact `DROP CONSTRAINT … ADD
  CONSTRAINT … CHECK (status IN (…))` pattern.
- **Migration numbering:** the highest existing migration is `058`
  (`058_confirmed_partner_unique_index.sql`, [ISSUE-18](COMPLETED_UAT_ISSUES.md#issue-18), shipped).
  Assign new numbers in ship order — the two-column migration (ISSUE-16) is `059`, then the consent
  column (ISSUE-17) is `060`. ISSUE-20 and ISSUE-21 add no columns.

### Grill outcomes (2026-07-23) — decisions taken while stress-testing this cluster

Recorded because several reverse or sharpen what the issues said an hour earlier, and because two
came from questioning the analysis rather than from it.

| # | Decision | Lands in |
|---|---|---|
| 1 | Branch-C claims move to a `pending_partner_email` column; `pending_partner_confirm` is **deleted** from the status enum | 16 |
| 2 | Add `partner_claimed_at`; `registered_at` becomes immutable | 16 |
| 3 | Withdrawal dissolves a confirmed team | 20 |
| 4 | Two named predicates for "counts for capacity" vs "plays in the bracket" | 20 |
| 5 | **One outgoing claim per player per tournament** — settled by the row model, not policy | 16 |
| 6 | Voiding matches *both* claim forms, and losers are notified (was "optional") | 16 |
| 7 | Formation notifications are **queued**, not posted inline — payload `{ tournamentId }` | 19 |
| 8 | Unconfirmed claims are swept **at group creation**, not on a TTL and not at the deadline | 21 |
| 9 | Sweep + tightened mutuality check ship together as their own issue | 21 |
| 10 | `confirmPartner` atomicity belongs with the index that exposes it | 18 |

**Four corrections to earlier drafts, kept visible so they aren't re-introduced:**

- **ISSUE-19's stated reason was backwards.** It claimed a notification failure inside the group-
  creation transaction would roll back real teams. `postPersonalNotification` calls
  `this.pool.connect()` and opens its **own** transaction (`group-message-repository.ts:369`), so it
  never joins the caller's. The real failure is the opposite: its writes commit independently, so
  they *survive* a rollback and are *re-sent* by `retryOnDeadlock`. **Integration tests cannot catch
  this** — per CLAUDE.md §7 the harness collapses both onto one connection and it looks atomic.
- **The job queue is the cheap option, not the expensive one.** An earlier draft called it "a new
  table, a new worker path, a new failure mode." `JobQueue` is a typed generic interface
  (`packages/worker/src/job-queue.ts:5-14`) with retry, DLQ and jobId dedupe, and there are already
  **13 processors** in `packages/api/src/workers/`.
- **No return-shape change is needed.** An earlier draft had `createGroupsForDoubles` return the
  formed teams so the route could notify. With a queue the payload is `{ tournamentId }` and the
  processor reads committed state — the teams are in the database, which is what committing them
  was for.
- **`confirmPartner` atomicity moved twice before landing.** It is not a pre-existing defect and not
  one ISSUE-16 introduces: **ISSUE-18's index is what makes the two-statement write half-
  committable.** See the worked race in ISSUE-18.

---

## ISSUE-16 — Partner pairing is first-*inviter*-wins: an invite mutates the invitee's registration 🟠 {#issue-16}

**🔲 Open** (raised 2026-07-23 while verifying ISSUE-15; owner decision below taken the same day.
Re-scoped the same day: the accept-time guard split out to [ISSUE-18](COMPLETED_UAT_ISSUES.md#issue-18) and the
group-creation sweep to [ISSUE-21](COMPLETED_UAT_ISSUES.md#issue-21). This issue **depends on both and assumes they are
already shipped**.)

**Root problem: no single place decides who X's partner is, and an invite writes to X's row.**

**Inconsistent invite semantics across the three branches** of `POST /:tournamentId/register`:

```
Branch B (X has an existing player row):  first inviter 202, second inviter 409 INVALID_STATE
Branch C (X is a brand-new email):        both 202; accept #1 200, accept #2 409
```

Branch C is right; branch B refuses the second inviter outright, so the winner is whoever asked
first rather than whoever X chose.

**Owner decision (2026-07-23):** *A inviting X must never stop B inviting X. Whichever pairing X
accepts becomes final; the rest fail at accept time.* Invite/decline spam is explicitly **out of
scope** — under the model below an invite X ignores costs X nothing, so there is nothing to abuse.

### Root cause (verified by reading the code)

The three mechanisms disagree about where a pending invite lives:

- **Branch C** (`tournaments.ts:1354-1372`) keeps the invite entirely in the emailed token and
  writes **nothing** to X. Correct — this is the target model.
- **Mechanism 3** (`POST /:id/partner-requests`, `tournaments.ts:1950`) writes only the
  **requester's** row. Also correct, and it already permits concurrent pending requests.
- **Branches A/B** (`tournaments.ts:1344-1351`) mirror-write the pairing onto **X's** registration
  (`updateRegistrationWithPartner` on both rows) and auto-create X's registration at `:1347` if they
  had none. That occupies `X.partner_id` at invite time, so the guard at `:1344` refuses the next
  inviter.

**The deeper problem is ownership, not the race.** Under branches A/B a stranger's invite creates a
registration in a tournament X never chose and moves X's row to `pending_partner_confirm` — a state X
can only leave by confirming or withdrawing entirely. The invariant this issue establishes is:
**only X, or X's own accept, ever writes X's registration row.** That is also what makes a decline
endpoint unnecessary (see "Knock-on" below).

### Schema — two columns, decided 2026-07-23

An earlier draft claimed "the schema needs no change." **That was wrong**, and the reason is worth
keeping because it is the trap in this issue:

For branches A/B the claim is recorded in `partner_id`. **For branch C there is no `partner_id`** —
the invitee has no player row — so `markPendingPartnerInvite` (`db.ts:599`) writes *only*
`status = 'pending_partner_confirm'`. That status **is** the entire on-row record that a branch-C
claim exists. Requirement (6) below stops claims from changing `status`, which for branch C deletes
the only trace of the invite and makes every emailed invite unredeemable.

```sql
ALTER TABLE public.player_registrations
  ADD COLUMN pending_partner_email TEXT,
  ADD COLUMN partner_claimed_at    TIMESTAMPTZ;   -- TIMESTAMPTZ, per migration 031
```

A claim is now **uniform across all four paths**: `partner_id` set (the invitee has a player row)
XOR `pending_partner_email` set (they don't), with `status` staying `'registered'` for both until
someone confirms. **`pending_partner_confirm` is deleted from the status enum** (`db.ts:116`,
`db.ts:730`).

`partner_claimed_at` exists because `registered_at` is currently overwritten to mean "invite sent
at" (`db.ts:586`, `db.ts:603`) so the post-deadline confirm grace can be computed. Once a claim no
longer changes `status`, nothing on the row explains why an ordinary registrant's registration time
silently moved — and it is read as a real registration time by the organizer roster
(`ORDER BY registered_at DESC`, `db.ts:573`) and returned to clients as `registeredAt`
(`tournaments.ts:1833`). **`registered_at` becomes write-once, at INSERT.** `partnerConfirmWindowOpen`
and the branch-C expiry read `partner_claimed_at ?? registered_at`, so existing rows behave as today.

### Required behaviour

> **Requirement (1) below also fixes the live defect behind [ISSUE-21](COMPLETED_UAT_ISSUES.md#issue-21)** — the mirror-
> write is the only thing that produces a *mutually linked but unconfirmed* pair, which group
> creation happily turns into a real team. That was never stated as a reason for (1) and is the
> strongest one. 21 ships first and fixes it directly, so (1) becomes the durable closure rather
> than the fix.

1. **An invite writes only the requester's row.** Branches A/B must stop calling
   `updateRegistrationWithPartner` on X's registration and must stop auto-creating one
   (`:1347`, `:1351`). X's registration is created at accept time, as branch C already does.
2. **First accept wins — enforced at accept time by [ISSUE-18](COMPLETED_UAT_ISSUES.md#issue-18), which ships first.**
   Nothing to build here; the guard and its unique index are a precondition of this issue, not part
   of it. If 18 is not yet merged, stop and do it first — the rework below removes the invite-time
   mirror-write that currently *masks* how easily two accepts collide.
3. **Narrow the invite-time 409** at `:1344` to *confirmed* pairings only. Refusing to invite
   someone already on a team stays correct; refusing because someone else invited them first does
   not.
4. **Remove capacity holds entirely — this reverses sub-decision 1.** Delete
   `countPendingPartnerInviteHolds` (`db.ts:616`), its TTL clause, and the virtual slot it adds to
   the `/register` check. **This is a deliberate reversal of an owner decision taken 2026-07-22**
   ("a pending invite holds a capacity slot, with an expiry"), re-decided 2026-07-23 for two
   reasons:
   - Concurrent invites over-reserve. A and B both inviting X creates two holds for one future
     person, so on a `max_players = 4` tournament a legitimate fourth registrant is refused
     `TOURNAMENT_FULL` for a seat that never existed. That rejection is silent and unrecoverable,
     and it does not self-heal — by the time X accepts A and B's hold drops, the rejected player is
     already gone. It cannot be deduplicated for branch C, whose invited address lives only inside
     the token.
   - The hold was never protecting anyone's ability to *play*. Leftover solos are auto-paired at
     group creation (`db.ts:912-922`, `pairUnpaired` defaults true), so A plays regardless. The
     hold protected A's ability to play **with X specifically** — a preference, not a participation
     right. Spending a real seat and wrongly refusing a real player to protect a preference is the
     wrong trade.

   The governing rule is: **count people who will play; do not count people who might not exist.**
   A registered solo counts. A pending invitee with no registration does not.

   **Amended 2026-07-23 for ISSUE-17.** The second bullet's premise is now "**a solo registrant who
   opted in to auto-pairing** always plays" — [ISSUE-17](#issue-17) makes auto-pairing a
   per-registration choice, so a player who opts out and is never accepted does not play. This does
   **not** revive holds: an opted-out solo still occupies a real seat and is still counted, and a
   hold would not have secured them a partner either. It only narrows the sentence, and the rule
   above is unchanged. See ISSUE-17 §"Interaction with ISSUE-16".
5. **Accepting actively voids every other claim on the accepting player — in *both* forms.** When X
   accepts, every other unconfirmed claim naming X is cleared. **A claim names X two different ways
   now, and matching only the first is a live bug:**

   ```sql
   UPDATE public.player_registrations
      SET partner_id = NULL, pending_partner_email = NULL, partner_claimed_at = NULL
    WHERE tournament_id = $1
      AND partner_confirmed = false
      AND id <> $winningRegistrationId
      AND (partner_id = $acceptingPlayerId
           OR lower(pending_partner_email) = $acceptedEmail)   -- emails are lowercase, migration 026
   ```

   Without the second disjunct: A and B both invite the same brand-new address, X accepts A's token,
   and B's claim survives — `partner_id` is NULL on it, so nothing matches. B's UI reads "awaiting
   acceptance" forever against a token that will now always 409, while B's single permitted outgoing
   claim (see 6) stays consumed.

   The loser keeps a valid solo registration and is immediately free to invite someone else. **It
   also voids X's own outgoing claim**, since X can no longer pair with anyone else. **Notifying each
   voided claimant is required, not optional** — [ISSUE-19](COMPLETED_UAT_ISSUES.md#issue-19) ships two slots earlier, so
   the infrastructure exists, and the alternative is a cluster that notifies you for being
   auto-paired and for being left unpaired but not for having your invite silently killed.

   Note `status → registered` from the earlier draft is now a **no-op** — under (6) the claimant's
   status never left `registered`. Do not write it; it reads as though something changes.
6. **A claim does not change the claimant's status, and does not hide them from other inviters.**
   The requester's row stays `status = 'registered'` with `partner_id` set and
   `partner_confirmed = false` until someone confirms. A player with an outstanding *outgoing*
   invite must remain invitable by others until they are actually paired.

   **Two filters gate this, not one — the status filter is the lesser of them.**
   `findAvailablePartners` (`db.ts:693`) filters `pr.status = 'registered'` **and
   `pr.partner_id IS NULL`**. An outgoing claim is precisely what sets `partner_id`, so relaxing
   only the status check changes nothing: the claimant still vanishes from everyone's list. The
   `partner_id IS NULL` clause must become **`pr.partner_confirmed = false`**. Verify against the
   real query before editing — getting this wrong makes the whole requirement a no-op that still
   passes a status-only test.

   **Five sites read the deleted status. Change all of them:**

   | Site | Today | Becomes |
   |---|---|---|
   | `db.ts:693` `findAvailablePartners` | `partner_id IS NULL` | `partner_confirmed = false` |
   | `db.ts:718` `findIncomingPartnerRequests` | `status = 'pending_partner_confirm'` | `partner_id = $2 AND partner_confirmed = false` |
   | `tournaments.ts:1857` `my-partner-invite` | `status !== 'pending_partner_confirm'` | no claim in either form |
   | `tournaments.ts:2050` `partner-invites/accept` | `status !== 'pending_partner_confirm'` | `!pending_partner_email` |
   | `tournaments.ts:2147` cancel route | same | same |

   Plus the re-invite guard in `/register` (`:1328`). **`findIncomingPartnerRequests` is the one
   that fails quietly** — it returns an empty list rather than erroring, so `PartnerFinder`'s whole
   confirm flow dies with no stack trace pointing at it.

   **A player holds at most ONE outgoing claim per tournament.** This closes the "may one player
   hold two outgoing invites?" open question, and it is **not a policy choice** — it follows from
   the row being the invite record, since a row has one `partner_id` and one
   `pending_partner_email`. Multiple outgoing claims require a `partner_claims` table and a
   different design; **do not add one as a small improvement.** Both existing guards stay
   (`tournaments.ts:1328`, `:1943`).

   The resulting asymmetry is intentional and should be stated in any UI copy: **receiving claims is
   unlimited, sending is capped at one.** Receiving is passive and costs you nothing — which is
   exactly what the owner decision means by "an invite X ignores costs X nothing." Sending is an
   action, and it is cancellable. The cap is per *tournament*, so a stale claim in one tournament
   never blocks a player in another.
7. **`confirm` must create the accepting player's registration if absent, and capacity-check it.**
   Two traps here, both consequences of (1) and (4):
   - `confirmPartner` (`db.ts`) links the partner side with `const partnerReg = await
     this.findRegistration(...); if (partnerReg) { UPDATE ... }` — **no `else`**. Today X always has
     a row so this is safe. Once invites stop creating X's row, confirm will **silently succeed
     with the team formed one-sided**: the requester confirmed and partnered, X with no registration
     at all. Branch C's accept route already creates the row; `confirmPartner` must too.
   - Because confirming now adds a registration, `PATCH .../confirm` needs a capacity check it does
     not currently have (it checks existence, caller identity, pending status, and the confirm
     window — nothing else). Without it, "don't count pending invites" becomes "capacity is
     unenforceable." Use `COUNTS_FOR_CAPACITY` from [ISSUE-20](#issue-20), not a raw count.
8. **`cancelPartnerInvite` must stop releasing the invitee's row — requirement (1) turns that from
   necessary cleanup into a destructive write.** `cancelPartnerInvite` (`db.ts:635`) currently
   clears `partner_id`/`status` on the *partner's* registration as well as the requester's. That is
   correct today only because the mirror-write put A's claim there. Once X's row is independent, X
   may hold **their own outgoing claim on a third player** — and A cancelling their claim on X would
   wipe it. Delete the `if (registration.partner_id) { … }` release branch; a claim now lives on
   exactly one row, so cancelling it is a single-row update.

   This is the same class of bug as the one being fixed, in the opposite direction: A must not write
   X's row to *release* them any more than to *reserve* them.

### Write-method rewrites (concrete — the CHECK-constraint landmine)

Requirements (1) and (6) say a claim keeps `status = 'registered'`, but **three shipped write paths
literally write `status = 'pending_partner_confirm'`** — the value this issue removes from the CHECK
constraint. Left unchanged, every partner-claim write throws `23514 check_violation` and the whole
feature is dead on the first invite. Rewrite the two repository writers and the branch-C accept
conversion explicitly — do not leave this to be inferred from the end-state description above:

- **`updateRegistrationWithPartner(regId, partnerId)` (`db.ts:582`)** — today
  `SET partner_id, status = 'pending_partner_confirm', registered_at = now`. Becomes
  `SET partner_id = $1, partner_claimed_at = now`. **Drop the `status` and `registered_at` writes**
  (status stays `registered`; `registered_at` is write-once per the schema section). One edit fixes
  the requester side of branches A/B, `partner-requests` (`:1950`), and the accept conversion.
- **`markPendingPartnerInvite(regId)` (`db.ts:599`)** — today
  `SET status = 'pending_partner_confirm', registered_at = now`. Becomes
  `markPendingPartnerInvite(regId, invitedEmail)` → `SET pending_partner_email = lower($2),
  partner_claimed_at = now`. Update its one caller (`tournaments.ts:1377`) to pass `partnerEmail`.
- **Branch-C accept (`tournaments.ts:2100-2103`)** — converting an email-claim to an id-claim must
  also **clear `pending_partner_email`** on the winning row (it is now a `partner_id` claim); since
  `updateRegistrationWithPartner` no longer touches that column, set `pending_partner_email = NULL`
  in the same update. The guard at `:2050` changes per the requirement-(6) table
  (`!requesterReg.pending_partner_email`, not the removed status). `confirmPartner` then proceeds as
  today (wrapped in ISSUE-18's transaction).
- **Comment/capacity cleanup in the accept route (`:2091-2096`):** it references
  `countPendingPartnerInviteHolds` (deleted by requirement (4)) and uses a raw
  `countRegistrationsForTournament`; switch the count to `COUNTS_FOR_CAPACITY`
  ([ISSUE-20](#issue-20)) and drop the hold comment.

**RED for this section:** assert that an invite leaves the *requester's* row `status = 'registered'`
with the claim recorded (`partner_id` or `pending_partner_email`) — the `23514` regression, which a
test that only checks the response code silently passes.

### Do NOT

- **Do not reintroduce a write to X's registration to "reserve" them.** That is the bug.
- **Do not reintroduce capacity holds** in any form — see (4), including its 2026-07-23 amendment.
- **Do not revert the ISSUE-15 follow-up fixes** in the same files: the dual-auth
  `resolveTournamentPlayer` on confirm, the `partnerConfirmWindowOpen` helper, and the
  `DELETE /registrations/:id/partner-invite` cancel route all stay. (The hold TTL goes, per (4);
  the cancel route's *cross-row release* goes, per (8) — the route itself stays.)
- **Do not read (5) as "leave the loser's row untouched."** Clearing the *claim* is required;
  what must not happen is withdrawing, deleting, or unregistering them.
- **Do not add mutual-invite auto-pairing.** Cut 2026-07-23 — see "Deferred" below. It is the only
  rule that would form a team without an explicit accept.

### Deferred — mutual invites do NOT auto-pair (cut 2026-07-23)

An earlier draft said: if the invitee already holds a pending claim on the inviter, confirm both
immediately. **Cut.** It is the only proposed rule that creates a confirmed team with nobody having
pressed accept, and it forces `confirm` to become idempotent (its own stated consequence) because
the first invite's notification and magic link go stale the moment it fires — i.e. it adds a
second, subtler success-path to a route this cluster exists to make single-writer.

What it buys is one click in an uncommon case: if A invited X and X invited A, X accepting A's
invite already works, unchanged. Requirement (5) then voids X's own outgoing claim, so the state
lands in the same place. Revisit only if telemetry shows mutual invites are common.

Consequence: **`confirm` keeps its current 409 `INVALID_STATE` when the caller is already
partnered** (per ISSUE-18). There is no idempotent-success case to build.

### Open questions — all resolved 2026-07-23

Kept rather than deleted: each names a fork an implementer will hit, and the reasoning matters more
than the answer.

- ~~**Atomicity.**~~ **[ISSUE-18](COMPLETED_UAT_ISSUES.md#issue-18)**, which lands the partial unique index this issue
  relies on. The earlier draft named the wrong columns
  (`(tournament_id, player_id) WHERE partner_confirmed`); `db/migrations/002_create_players.sql:16`
  already declares `UNIQUE(player_id, tournament_id)`, so that index would have been a strict no-op.
  The correct one is on **`(tournament_id, partner_id)`**.
- ~~**Store the invited email on the requester's row?**~~ **Yes — required, not a nicety.** It is
  the only representation a branch-C claim has once (6) stops using `status`. See "Schema" above.
- ~~**Do branch A/B claims expire at all?**~~ **No timer.** A claim does not survive into team
  formation — [ISSUE-21](COMPLETED_UAT_ISSUES.md#issue-21) sweeps every unconfirmed claim at group creation. Deliberately
  *not* at the registration deadline: `partnerConfirmWindowOpen` (`tournaments.ts:128-131`) keeps
  confirms open through `registration_closed`, so sweeping at the deadline would destroy ISSUE-15
  sub-decision 3. During registration the manual cancel route remains the exit.
- ~~**May one player hold two outgoing invites at once?**~~ **No — capped at one**, settled by the
  row model rather than by policy. See (6).
- ~~**Split defect (1) into its own issue?**~~ **Yes — [ISSUE-18](COMPLETED_UAT_ISSUES.md#issue-18)**, ships first.

### Fix (TDD §4)

- **[RED]** Integration: (a) A and B both invite the same existing player → both 202; (b) X confirms
  A → 200, X confirms B → 409, and A's row is untouched and still confirmed; (c) same for two
  branch-C invites where X accepts the second token first; (d) X's registration is *not* created or
  modified by an invite they haven't accepted; (e) two pending invites against one remaining slot
  hold capacity correctly; (f) an invite to a player with a **confirmed** partner still 409s;
  (g) **A, holding an outgoing claim on X, is still returned by `GET /:id/available-partners` for
  a third player** — the requirement-(6) regression, and the one a status-only fix would pass;
  (h) **X cancels their own outgoing claim on C after A has claimed X → X's claim on C is cleared
  and A's claim on X is untouched**, and the reverse (A cancels, X's claim on C survives) — the
  requirement-(8) regression;
  (i) **A and B both invite the same brand-new address; X accepts A's token → B's claim is voided
  and B is notified** — the requirement-(5) email-form regression, which a `partner_id`-only void
  silently passes;
  (j) `GET /:id/partner-requests` still returns incoming claims after the status enum change — the
  `findIncomingPartnerRequests` regression, which fails by returning `[]` rather than erroring.
  Frontend: `PartnerFinder` still lists X as available while invites on X are outstanding.
- **[GREEN]** Apply the required behaviours above (1, 3–8; (2) arrives with ISSUE-18).
- **Migration (schema-only — no backfill, see the cluster "No live data" note):** one migration adds
  `pending_partner_email` and `partner_claimed_at`, and recreates the `status` CHECK constraint
  without `pending_partner_confirm` (pattern: `db/migrations/028_add_unpaired_registration_status.sql`
  — `DROP CONSTRAINT player_registrations_status_check … ADD CONSTRAINT … CHECK (status IN (…))`).
  There are no rows to migrate.
- **Regression:** `partner-invite-by-email.spec.ts` (24 tests) asserts the current branch-A/B
  mirror-write in several places — those assertions change shape. Read them before editing; a test
  that asserts X's row went `pending_partner_confirm` at invite time is asserting the bug.
- **Docs:** `docs/assistant-help.md` (§9 — "you can be invited by more than one person; whoever you
  accept is your team"), `e2e-scenarios.md` scenario + selection-map row (§8).

### Knock-on: this makes a decline path optional

The reason a decline endpoint looked necessary was that branches A/B mutate X's registration, so an
unwanted invite left X in `pending_partner_confirm` — or registered in a tournament they never chose
— with only "confirm" or "withdraw entirely" as exits. Under requirement (1) an ignored invite
touches nothing of X's, so **decline becomes UX only** (dismiss the notification), and the
"was this registration created by the invite?" question that needed a schema decision disappears.
Do not build a decline endpoint as part of this issue.

**Related, needed by the same users:** `DELETE /registrations/:registrationId`
(`tournaments.ts:2168`) still uses `requirePlayerSessionAuth` directly, so a registered-account
holder cannot withdraw at all — the same dual-auth gap ISSUE-1 and the ISSUE-15 follow-up fixed
elsewhere. It is already on the untriaged list below. Fixing it here is in scope if convenient;
the pattern is `resolveTournamentPlayer(authHeader, registration.tournament_id)`.

### Verify

- Two players invite the same third player by email; both succeed, both see "awaiting acceptance".
- The invitee accepts one; that team forms both directions, and the other requester's registration
  is still a valid solo registration.
- The invitee cannot then accept the second invite (409), and their own registration points at
  exactly one partner.
- A player who was never invited-and-accepted has no registration row they didn't create.

---

## ISSUE-17 — Solo doubles registrants are auto-paired with a stranger without consent 🟠 {#issue-17}

**🔲 Open** (raised 2026-07-23 while grilling ISSUE-16; owner decision below taken the same day.
Re-scoped the same day: the "silently" half — notifying on team formation — split out to
[ISSUE-19](COMPLETED_UAT_ISSUES.md#issue-19), and the leftover pool's definition to [ISSUE-21](COMPLETED_UAT_ISSUES.md#issue-21). This issue
**depends on both and assumes they are already shipped**.)

**Symptom:** a player registers alone for a doubles tournament. At group creation they are shuffled
into a partnership with someone they never agreed to play with, and **nothing tells them** — they
find out by looking at the bracket. In an in-person sport, being assigned an unfamiliar partner at a
venue is a materially different thing from being assigned an unfamiliar opponent.

**Verified root cause:** `createGroupsForDoubles` (`db.ts:912-922`) shuffles leftover solos and teams
them:

```ts
// 2) Handle solo registrants: auto-pair (default) or drop as 'unpaired'.
const leftovers = playerIds.filter(p => !teamed.has(p))
if (pairUnpaired) {
  const shuffled = [...leftovers].sort(() => Math.random() - 0.5)
  for (let i = 0; i < shuffled.length - 1; i += 2) await createTeam(shuffled[i], shuffled[i + 1])
```

`pairUnpaired` defaults true (`tournaments.ts:337` — `req.body.pairUnpaired !== false`). The
silence half of this symptom is [ISSUE-19](COMPLETED_UAT_ISSUES.md#issue-19): no notification fires when a team is created,
by any path. **This issue owns the consent half only** — the flag, its effect on group creation, and
the organizer's pre-close visibility.

**Owner decision (2026-07-23): prospective consent, auto-pairing retained.** Consent is collected at
registration, not at pairing time. Auto-pairing is *not* removed.

**Why not just ask at group creation:** registration is closed by then, so a player who declines
cannot go find a partner — the only remaining outcome is exclusion. "Accept this stranger or don't
play" is a formality, not consent. It would also make group creation block on N players responding,
possibly the night before the event.

**Why not remove auto-pairing entirely** (considered and rejected 2026-07-23):
- The **social-mixer format cannot lose it**. `generateRoundPairings` (`mixer-scheduler.ts:55-80`,
  used at `tournaments.ts:1675`) re-pairs everyone every round, deliberately avoiding prior
  partners. Per-round consent is incoherent in a format whose premise is rotating partners. That is
  a separate code path and is **out of scope for this issue** — do not touch it.
- Organizers would be stranded: `createGroupsForDoubles` ends with
  `if (teamIds.length < numGroups) throw`, so a tournament where too few players paired fails group
  creation at the moment registration is already closed.
- It would break the capacity model. Counting solo registrants toward `max_players` is only correct
  *because* they get auto-paired; without it a tournament could fill with unpaired solos and produce
  zero teams.
- It would reopen ISSUE-16's decision to remove capacity holds, which rests on "a solo registrant
  always plays".

### Required behaviour

1. **A per-registration consent flag**, captured at registration: *"If nobody partners with you,
   pair me with another solo player."* **Default on**, preserving today's behaviour for everyone who
   does not engage with it. Per-registration, not a global player setting — it is a per-tournament
   choice.
2. **`createGroupsForDoubles` honours the flag per player**, not the organizer's blanket
   `pairUnpaired`. A player who opted out is marked `unpaired` and excluded; a player who opted in is
   auto-paired as today. The organizer switch becomes a ceiling, not the decision.
3. **Notify on team formation — built by [ISSUE-19](COMPLETED_UAT_ISSUES.md#issue-19), which ships first.** Nothing to
   build here beyond one addition: ISSUE-19 covers the three *formation* paths; this issue adds the
   **"you were left unpaired" notification** for a player the flag excludes, since that state only
   becomes reachable by choice here. If 19 is not yet merged, stop and do it first — an opt-out
   whose outcome is never communicated is a worse experience than today's default-on auto-pair.
4. **Organizer visibility before closing registration** — a count of registrants who will not be
   teamed (opted out, or opted in with no available match), so the stranding in
   `if (teamIds.length < numGroups) throw` is visible while it is still fixable.

   **The preview re-derives with its own query — it does not share code with group creation.**
   Decided 2026-07-23 after weighing the opposite. The case for sharing was that a hand-written
   preview would naturally test `partner_confirmed = true` while group creation tests *mutuality*
   (`db.ts:907`), and those disagree on a one-sided confirmed row — leaving the organizer's only
   pre-close warning silent exactly when something is wrong. That divergence is closed at the source
   instead: [ISSUE-21](COMPLETED_UAT_ISSUES.md#issue-21)'s sweep means "teamed" and "mutually confirmed" describe the same
   set, and [ISSUE-18](COMPLETED_UAT_ISSUES.md#issue-18)'s `confirmPartner` transaction removes the only remaining way to
   produce a one-sided row. With both shipped, re-deriving is safe and avoids restructuring a
   130-line transactional method (CLAUDE.md §3).

   **Two consequences of that choice, both mandatory:**
   - **RED test (e) must assert the rules, not the agreement.** "The preview matches what group
     creation does" passes once and enforces nothing between two hand-written copies. Assert
     explicit cases instead — see below.
   - **Use `PLAYS_IN_BRACKET`** from [ISSUE-20](#issue-20) as the population, so at minimum the two
     agree on *who is eligible* even where they compute independently.

   Two traps for whoever writes the query:
   - **Parity is over consenting leftovers only.** Unpaired = opted-out **plus**
     `consentingLeftovers % 2`. Computing `leftovers % 2` over all leftovers is the natural
     mistake, and it is only wrong once someone opts out — so it passes every test written before
     the flag has adoption. With 3 leftovers of whom 1 opted out: 1 unpaired, not 2.
   - **`pairUnpaired` is not knowable at preview time.** It is a request-body param on group
     creation (`tournaments.ts:337`), never stored. Take it as a query param and default it to
     `true`; do not silently assume.

   One honest limit to surface in the UI: **which** player is the odd one out is not predictable —
   the auto-pair shuffle is `Math.random()` (`db.ts:915`). The preview can promise a *count* and the
   deterministic opted-out *list*, never the identity of the leftover.

### Schema & wiring (concrete)

- **Migration (schema-only):** `ALTER TABLE public.player_registrations ADD COLUMN auto_pair_consent
  BOOLEAN DEFAULT true;` (numbering per the cluster note — after ISSUE-16's). Default `true` preserves
  today's behaviour for every existing row and every client that omits the field.
- **Write path:** `createRegistration` (`db.ts:494`) takes only `(playerId, tournamentId)` today — add
  a third arg `autoPairConsent = true` and INSERT it. The register route reads
  `req.body.autoPairConsent !== false` (default on, same shape as `pairUnpaired` at `tournaments.ts:338`)
  and passes it for the registrant's own solo registration. **Every other `createRegistration` call
  site passes the default** — the auto-create at `tournaments.ts:1317`, the `/partner-invites/accept`
  route, and `confirmPartner`'s new create (ISSUE-16 req 7) — because only the person registering
  chooses their own consent, never an inviter on their behalf.
- **Group creation:** `createGroupsForDoubles` selects `player_id, partner_id` at `db.ts:896` — add
  `auto_pair_consent` to that SELECT, and in the auto-pair loop (`db.ts:914`) filter `leftovers` to
  consenting players before shuffling; the opted-out go straight to `markUnpaired` (which already
  exists, `db.ts:888`).
- **Organizer preview endpoint:** `GET /:tournamentId/pairing-preview?pairUnpaired=true` (organizer
  auth), **registered before the parameterized `/:id` routes** (CLAUDE.md §10). Response
  `{ unpairedCount: number, optedOut: [{ playerId, name }] }`. Population is `PLAYS_IN_BRACKET`
  ([ISSUE-20](#issue-20)). **Leftovers** = `PLAYS_IN_BRACKET` registrants not in a confirmed mutual
  pair; `optedOut` = leftovers with `auto_pair_consent = false`; `consentingLeftovers` = the rest.
  `unpairedCount = optedOut.length + (consentingLeftovers % 2)` — the parity trap in requirement (4);
  with `pairUnpaired=false`, every leftover is unpaired.
- **Frontend:** the doubles registration form in `pages/TournamentBrowse.tsx` (the `partnerEmail`
  input, ~line 235 — and its duplicate at ~line 294) renders a checkbox defaulting **checked** that
  sets `body.autoPairConsent`. Add a `data-testid` and its `e2e/config.ts` constant (§8).
  `PartnerFinder.tsx` is unaffected.

### Interaction with ISSUE-16 — the capacity-hold reasoning, narrowed not reversed

[ISSUE-16](#issue-16) §4 removes capacity holds partly on the grounds that "a solo registrant always
plays, because leftovers are auto-paired." Requirement (1) here makes that conditional, and
ISSUE-16's own Do-NOT says to revisit holds "if a future change makes solo registrants unable to
play." **This is that change, and the answer is still: no holds.** Recorded here so it is not
rediscovered as a contradiction:

- An opted-out solo **still occupies a real seat** and is still counted against `max_players`. The
  capacity model is unaffected — that rule was about *pending invitees with no registration*, which
  is a different population.
- A hold would not have helped them anyway. Holds reserved a slot for an invitee who might accept;
  they never secured anyone a *partner*. An opted-out player who is never accepted does not play,
  with or without holds.
- The change is to one sentence of ISSUE-16 §4, already amended there: the premise is now "a solo
  registrant **who opted in** always plays."

**Do not treat requirement (1) as grounds to reopen holds.** If it ever seems to be, the thing that
actually changed is auto-pairing being removed *wholesale* — which this issue explicitly rejects.

**Related consent gap, opposite direction:** `pairUnpaired: false` today lets an *organizer* silently
mark registrants `unpaired` and exclude them from play. Someone who registered, expected to play,
and did nothing wrong gets no game and no notice. Requirement (2) turns that into the player's own
decision; requirement (3) means they are told either way.

### Fix (TDD §4)

- **[RED]** Integration: (a) a registration with consent off is marked `unpaired` and never teamed;
  (b) consent on behaves exactly as today; (c) the default is on when the field is absent (existing
  rows and existing clients); (d) a player the flag excludes is notified that they were left
  unpaired (the formation notifications themselves are ISSUE-19's tests); (e) the preview reports
  the right unpaired count for **explicit cases** — 3 leftovers with 1 opted out → 1; 4 leftovers
  with 0 opted out → 0; 4 leftovers with 1 opted out → 2; `pairUnpaired: false` → all leftovers.
  **Do not write (e) as "preview equals group creation"** — see requirement (4).
  Frontend: the registration form renders the toggle and defaults it on.
- **Docs:** `docs/assistant-help.md` (§9 — user-visible), `e2e-scenarios.md` scenario +
  selection-map row (§8).

### Verify

- Register solo with consent on → get auto-paired → receive a notification naming the partner
  (the notification itself comes from ISSUE-19; here it must name an auto-paired partner).
- Register solo with consent off → stay unpaired → excluded from groups, and told so.
- A mixer tournament is unaffected end to end.

---

## ISSUE-20 — Withdrawal never dissolves a team, and no query filters withdrawn registrations 🟠 {#issue-20}

**🔲 Open** (raised 2026-07-23 while grilling ISSUE-16/17. Pre-existing, but this cluster makes it
worse in two specific ways, below.)

**All four sibling issues treat a team as write-once.** Every requirement in them is about *forming*
one. Nothing dissolves one, and `withdrawRegistration` (`db.ts:744-755`) writes **only** `status`
and `withdrawal_requested_at` — it never touches `partner_id` or `partner_confirmed`, on either row.

After A ↔ X is confirmed and X withdraws:

```
X: status='withdrawn'   partner_id=A  partner_confirmed=true
A: status='registered'  partner_id=X  partner_confirmed=true   ← still "on a team"
```

**A is stranded with no exit.** ISSUE-16 requirement (3) refuses A a new invite because A has a
*confirmed* partner; `cancelPartnerInvite` refuses confirmed teams (`db.ts:632` — *"Confirmed teams
are not cancellable here; that is what withdrawal is for"*). A's only remedy is to withdraw from a
tournament they still want to play.

**ISSUE-18's index makes it permanent.** `(tournament_id, partner_id) WHERE partner_confirmed` means
A's stale row owns the only confirmed claim on X *forever*. It will not block the migration (one
stale row is not a duplicate), but if X re-registers, nobody can ever confirm a team with them.

### Second defect, same root: nothing anywhere asks "is this registration active"

Two queries decide participation and **neither looks at `status`**:

| Query | Site | Consequence |
|---|---|---|
| `countRegistrationsForTournament` | `db.ts:517-523` | Withdrawn players hold seats forever; `TOURNAMENT_FULL` fires for capacity that does not exist |
| group-creation player list | `tournaments.ts:300` | `withdrawn` and `withdrawal_pending` players are auto-paired and put on the bracket |

This contradicts ISSUE-16 §4's own governing rule — *"count people who will play"* — which the issue
applies to pending invitees while withdrawn players sit uncounted-against in the same tally.

### Required behaviour

1. **Dissolve on withdrawal.** When a registration goes to `withdrawn` **and** it is
   `partner_confirmed`, clear `partner_id` / `partner_confirmed` on **both** rows and return the
   remaining partner to a plain solo `registered`. Notify them ([ISSUE-19](COMPLETED_UAT_ISSUES.md#issue-19), shipped by
   now) — being silently un-teamed is the same defect ISSUE-17 exists to fix, from the other side.
   The method is `withdrawRegistration` (`db.ts:744`), which today writes **one** row un-transacted;
   the two-row clear must run in a `pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK` transaction (the
   `createGroupsForDoubles` pattern, `db.ts:857`) so a half-dissolve is impossible. Notify the freed
   partner **inline, best-effort** from the withdraw route (the `confirmPartner` notify pattern,
   `tournaments.ts:1354`) — this is not a group-creation path, so it does **not** enqueue
   `teams.formed`.
2. **`withdrawal_pending` does NOT dissolve.** It is a post-deadline *request* awaiting the
   organizer (`tournaments.ts:2190`), not a departure. The team holds until it resolves.
3. **Two named predicates, exported from one place**, so the intentional difference between them is
   visible instead of implied by two omissions:

   ```ts
   export const COUNTS_FOR_CAPACITY = `status <> 'withdrawn'`
   export const PLAYS_IN_BRACKET    = `status NOT IN ('withdrawn','withdrawal_pending')`
   ```

   **Capacity excludes `withdrawn` only.** A pending request has not been granted, and it can only
   happen after the deadline — when the seat cannot be resold anyway. Freeing it early lets a
   replacement register, after which the organizer can no longer refuse the request without
   over-filling.

   **The bracket excludes both.** Someone who has asked to leave should not be auto-paired with a
   stranger and scheduled into matches.

   **Home:** a new `packages/api/src/registration-status.ts` exporting both constants — the
   group-creation player list is an **inline query in the route** (`tournaments.ts:301`,
   `SELECT DISTINCT pr.player_id …`), *not* a repo method, so the predicates must live somewhere both
   `db.ts` and `routes/tournaments.ts` can import.

   Consumers: `countRegistrationsForTournament` (`db.ts:517`) → `COUNTS_FOR_CAPACITY`; the
   group-creation player query (`tournaments.ts:301`) and ISSUE-17's organizer preview →
   `PLAYS_IN_BRACKET`.

### Backfill

None — no live data (see the cluster "No live data" note). There is no schema change in this issue
at all: the two predicates are code, and the dissolve is behaviour. Nothing to migrate.

### Do NOT

- **Do not dissolve on `withdrawal_pending`** — see (2).
- **Do not delete or unregister the withdrawing player's row.** Withdrawal is a status change; the
  row is the audit trail.
- **Do not inline the two predicates at their call sites.** The whole point is that the difference
  between them is deliberate and reviewable in one place.

### Fix (TDD §4)

- **[RED]** Integration: (a) X withdraws from a confirmed team → both rows cleared, A is solo
  `registered`, A is notified; (b) X requests withdrawal *after* the deadline → team intact;
  (c) a withdrawn registration does not count toward `max_players`; (d) a `withdrawal_pending`
  registration **does**; (e) neither appears in the group-creation player list; (f) A, freed by (a),
  can immediately invite someone else.
- **Docs:** `docs/assistant-help.md` (§9 — "if your partner withdraws you'll be told, and you can
  find a new one"), `e2e-scenarios.md` scenario + selection-map row (§8).

### Verify

- Confirmed team, one player withdraws before the deadline → the other is told and can re-partner.
- A full tournament frees a seat when someone withdraws; a post-deadline request does not.
- Group creation ignores withdrawn players entirely.

---

## Not yet triaged / follow-ups

- Any routes ISSUE-1's audit turns up with the same strict-auth-where-dual-intended gap
  (add rows here, fix separately).
  - **`analytics.ts:23`** (`POST /events`) — direct `requirePlayerSessionAuth`, no
    dual-auth fallback. Same class as ISSUE-1: a registered-account JWT with a linked
    playerId would 401 here today. Low severity (analytics ingestion, not user-facing
    blocking UX) but same root cause — needs the same `resolvePlayerId`-style shim.
  - **`messages.ts`** — mixed: several routes already call both
    `requirePlayerSessionAuth` *and* `requireOrganizerAuth` (lines ~44/53, 127/136,
    173/182, 329/338), suggesting dual-auth was hand-rolled per-route rather than via a
    shared helper — worth confirming each actually falls back correctly (not just
    calls both for different purposes). Two bare `requirePlayerSessionAuth` calls with
    no organizer fallback at lines ~217, 234 — needs a closer read to tell whether
    those are intentionally guest-only.
  - **`tournaments.ts`** — has its own dual-auth helper (`resolveTournamentPlayer`,
    ~line 100) used in most player-scoped routes, but several routes still call
    `requirePlayerSessionAuth` directly with no fallback (lines ~367, 930, 1800, 1845,
    1924, 2015). Needs a case-by-case read: some may be intentionally guest-session-only
    (e.g. a magic-link-specific verify step), others may be the same missed-adoption gap.
  - `player.ts` and `auth.ts` already have their own dual-auth resolvers — no gap found.
- **Tournament lifecycle has no automatic status transitions** (surfaced by ISSUE-9): nothing
  moves a normal tournament off `registration_open` at its `registration_deadline`, or to
  `completed` when finished — the only auto-close sweep is for polls. So tournaments linger in
  `registration_open` indefinitely and stale-open ones keep appearing in Browse (ISSUE-9 only
  fixes the *label*). Durable fix = a deadline/lifecycle sweep or organizer-driven transition;
  needs its own design + issue.
  - **If you build this, it must NOT clear pending partner claims** when it closes registration.
    That looks like an obvious thing to fold in and it silently destroys ISSUE-15 sub-decision 3 —
    a partner's right to accept, during `registration_closed`, an invite that was sent before the
    deadline (`partnerConfirmWindowOpen`, `tournaments.ts:128-131`). Claims are swept at group
    creation instead; see [ISSUE-21](COMPLETED_UAT_ISSUES.md#issue-21).
  - It is **orthogonal to ISSUE-21**, not a prerequisite: closing registration does not trigger
    group creation, so a lifecycle sweep would not resolve any claim. ISSUE-21 does not wait on it.
- **The full e2e sweep (§11's merge gate) cannot pass as configured** — observed 2026-07-23:
  `npm run test:e2e` produced **142 failures / 267 passed**, overwhelmingly
  `RATE_LIMITED` raised by the fixtures' own `POST /:id/register` calls. ISSUE-11's
  per-IP cap is 25 registrations / 15 min (`registerPerIpMaxAttempts`), and a 427-test
  both-browser sweep from one IP blows through it within the first few multi-player
  fixtures; everything after that fails to seed, which also explains the
  `action-card` / `assistant-message` "element not found" failures downstream. Confirmed
  environmental, not a code defect: with the API restarted (in-memory limiter cleared),
  `partner-requests.spec.ts` passes 3/3 and `tournament-discovery-registration.spec.ts`
  13/13, while re-running a batch large enough to exhaust the cap fails again. No
  override exists anywhere — not in `.env`, `.env.example`, `scripts/e2e-setup.js`, or
  `playwright.config.ts`. Fix is a test-environment override (e.g.
  `APP_LIMITS_RATE_LIMIT_REGISTER_PER_IP_MAX_ATTEMPTS` raised for dev/e2e, ideally set by
  `e2e-setup.js` so it can't be forgotten) — **not** loosening the production default,
  which is the ISSUE-11 defence. Until then §11's "full run before merging" is not a
  meaningful gate and per-spec runs are the real signal.
- Deliverability: UAT SES mail lands in Gmail **spam** (DMARC can't align from a
  `gmail.com` sender) — a known, owner-accepted trade-off, tracked in
  `UAT_PWA_LAUNCH.md` P0.6-SES, not a bug. The real fix is a verified domain (§2).
