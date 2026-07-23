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
| [ISSUE-16](#issue-16) | 🔲 Open | 🔴 | Partner pairing is first-*inviter*-wins and has no accept-time guard — one player can hold two confirmed teams | api + frontend |
| [ISSUE-17](#issue-17) | 🔲 Open | 🟠 | Solo doubles registrants are auto-paired with a stranger, silently and without consent | api + frontend |

---

## ISSUE-16 — Partner pairing is first-*inviter*-wins, and confirming has no accept-time guard 🔴 {#issue-16}

**🔲 Open** (raised 2026-07-23 while verifying ISSUE-15; owner decision below taken the same day.)

**Two defects with one root cause: no single place decides who X's partner is.**

**(1) Data corruption — a player can end up on two confirmed teams.** Verified by probe against the
running API:

```
A requests X = 201,  B requests X = 201        (both pending, correctly allowed)
X confirms A = 200,  X confirms B = 200        ← both succeed
final:  A.partner_id = X,  partner_confirmed = true
final:  B.partner_id = X,  partner_confirmed = true
final:  X.partner_id = B                       ← last write wins
```

A believes they have a confirmed team with X. X points at B. Nothing reconciles them, and group/team
generation reads these rows. **This is reachable today from the shipped `PartnerFinder` UI** via the
pre-existing `partner-requests` flow — it does not require any ISSUE-15 code path.

**(2) Inconsistent invite semantics across the three branches** of `POST /:tournamentId/register`:

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
  **requester's** row. Also correct, and it already permits concurrent pending requests — which is
  exactly how defect (1) becomes reachable, because nothing then guards the *accept*.
- **Branches A/B** (`tournaments.ts:1344-1351`) mirror-write the pairing onto **X's** registration
  (`updateRegistrationWithPartner` on both rows) and auto-create X's registration at `:1347` if they
  had none. That occupies `X.partner_id` at invite time, so the guard at `:1344` refuses the next
  inviter.
- **`PATCH /registrations/:id/confirm`** (`tournaments.ts:1926`) checks that the caller is the
  registration's `partner_id` and that the row is still pending — but **never checks whether the
  caller is already partnered**. That single missing check is defect (1).

The schema needs no change: `partner_id` + `partner_confirmed` + `status` already model this. The
requester's own row is the invite record; the token is the invite record for a brand-new email.

### Required behaviour

1. **An invite writes only the requester's row.** Branches A/B must stop calling
   `updateRegistrationWithPartner` on X's registration and must stop auto-creating one
   (`:1347`, `:1351`). X's registration is created at accept time, as branch C already does.
2. **First accept wins — enforce it at accept time.** Both `PATCH .../confirm` and
   `POST /:tournamentId/partner-invites/accept` must refuse when the accepting player already has a
   confirmed partner in that tournament (409 `INVALID_STATE`). **This is the fix for defect (1) and
   is required whether or not the rest of this issue is done.**
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
5. **Accepting actively voids every other claim on the accepting player.** When X accepts, all other
   pending unconfirmed claims naming X (`partner_id = X`, `partner_confirmed = false`) are cleared:
   `partner_id → NULL`, `status → registered`. The loser keeps a valid solo registration and is
   immediately free to invite someone else. **It also voids X's own outgoing claim**, since X can no
   longer pair with anyone else. Notifying the losers is desirable but optional; if added, reuse
   `postPersonalNotification`.
6. **A claim does not change the claimant's status.** The requester's row stays `status =
   'registered'` with `partner_id` set and `partner_confirmed = false` until someone confirms.
   `findAvailablePartners` filters on `status = 'registered'`, and a player with an outstanding
   outgoing invite must remain invitable by others until they are actually paired. This changes the
   shape of `GET /:id/my-partner-invite` (today it keys off `status === 'pending_partner_confirm'`)
   and the re-invite guard in `/register`.
7. **Mutual invites auto-pair.** If the player being invited already holds a pending claim on the
   inviter, confirm both immediately instead of creating a second claim — least friction, and the
   intent is unambiguous. Consequence: the first invite's notification or magic link is now stale,
   so **`confirm` must be idempotent when the caller is already partnered with that same person**
   (return success, not the current 409 `INVALID_STATE`, which reads as failure for something that
   succeeded).
8. **`confirm` must create the accepting player's registration if absent, and capacity-check it.**
   Two traps here, both consequences of (1) and (4):
   - `confirmPartner` (`db.ts`) links the partner side with `const partnerReg = await
     this.findRegistration(...); if (partnerReg) { UPDATE ... }` — **no `else`**. Today X always has
     a row so this is safe. Once invites stop creating X's row, confirm will **silently succeed
     with the team formed one-sided**: the requester confirmed and partnered, X with no registration
     at all. Branch C's accept route already creates the row; `confirmPartner` must too.
   - Because confirming now adds a registration, `PATCH .../confirm` needs a capacity check it does
     not currently have (it checks existence, caller identity, pending status, and the confirm
     window — nothing else). Without it, "don't count pending invites" becomes "capacity is
     unenforceable."

### Do NOT

- **Do not reintroduce a write to X's registration to "reserve" them.** That is the bug.
- **Do not reintroduce capacity holds** in any form — see (4). If a future change makes solo
  registrants unable to play (i.e. auto-pairing is removed), revisit this, because the reasoning
  depends on auto-pairing existing.
- **Do not revert the ISSUE-15 follow-up fixes** in the same files: the dual-auth
  `resolveTournamentPlayer` on confirm, the `partnerConfirmWindowOpen` helper, and the
  `DELETE /registrations/:id/partner-invite` cancel route all stay. (The hold TTL goes, per (4).)
- **Do not read (5) as "leave the loser's row untouched."** Clearing the *claim* is required;
  what must not happen is withdrawing, deleting, or unregistering them.

### Open questions — resolve before implementing

- **Atomicity.** Requirement (2) is a read-then-write with no transaction, in an issue that exists
  because of a race: two simultaneous accepts can both pass "is X already partnered". Needs either a
  transaction or a partial unique index on `(tournament_id, player_id) WHERE partner_confirmed`.
  **This is the weakest point in the design as written.**
- **Store the invited email on the requester's row?** No longer needed for capacity (holds are
  gone), but it is the only way to name the invitee in the requester's UI ("Waiting for your
  invited partner" is vague because the address exists only in the token) and the only way to notify
  a loser whose invite was to a brand-new email.
- **Do branch A/B claims expire at all?** Their notification and magic link never expire. With holds
  gone this costs no capacity, but a stale claim still blocks the claimant from re-inviting unless
  multiple outgoing invites are allowed (below) — the manual cancel route is the only exit today.
- **May one player hold two outgoing invites at once?** Requirement (6) lets a player *receive* any
  number while unpaired. The mirror — inviting two people and taking whoever answers — is currently
  blocked by the `/register` guard. Symmetry argues for allowing it; spam control argues against.
- **Split defect (1) into its own issue?** The accept-time guard is ~5 lines, is correct under both
  the current and proposed models, and is 🔴 data corruption. It should not wait on this design.

### Fix (TDD §4)

- **[RED]** Integration: (a) A and B both invite the same existing player → both 202; (b) X confirms
  A → 200, X confirms B → 409, and A's row is untouched and still confirmed; (c) same for two
  branch-C invites where X accepts the second token first; (d) X's registration is *not* created or
  modified by an invite they haven't accepted; (e) two pending invites against one remaining slot
  hold capacity correctly; (f) an invite to a player with a **confirmed** partner still 409s.
  Frontend: `PartnerFinder` still lists X as available while invites on X are outstanding.
- **[GREEN]** Apply the five required behaviours above.
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

## ISSUE-17 — Solo doubles registrants are auto-paired with a stranger, silently and without consent 🟠 {#issue-17}

**🔲 Open** (raised 2026-07-23 while grilling ISSUE-16; owner decision below taken the same day.)

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

`pairUnpaired` defaults true (`tournaments.ts:337` — `req.body.pairUnpaired !== false`). And
`postPersonalNotification` is called in exactly two places in the codebase
(`player-groups.ts:131`, `tournaments.ts:112`) — **neither is team formation**. No notification of
any kind fires when a team is created, however it formed.

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
3. **Notify on team formation, however the team formed** — chosen partner, accepted invite, or
   auto-pair. Reuse `postPersonalNotification`; this is the piece that exists nowhere today.
4. **Organizer visibility before closing registration** — a count of registrants who will not be
   teamed (opted out, or opted in with no available match), so the stranding in
   `if (teamIds.length < numGroups) throw` is visible while it is still fixable.

**Related consent gap, opposite direction:** `pairUnpaired: false` today lets an *organizer* silently
mark registrants `unpaired` and exclude them from play. Someone who registered, expected to play,
and did nothing wrong gets no game and no notice. Requirement (2) turns that into the player's own
decision; requirement (3) means they are told either way.

### Fix (TDD §4)

- **[RED]** Integration: (a) a registration with consent off is marked `unpaired` and never teamed;
  (b) consent on behaves exactly as today; (c) the default is on when the field is absent (existing
  rows and existing clients); (d) team formation posts a notification to both players for all three
  formation paths; (e) the organizer's unpaired count matches what group creation will actually do.
  Frontend: the registration form renders the toggle and defaults it on.
- **Docs:** `docs/assistant-help.md` (§9 — user-visible), `e2e-scenarios.md` scenario +
  selection-map row (§8).

### Verify

- Register solo with consent on → get auto-paired → receive a notification naming the partner.
- Register solo with consent off → stay unpaired → excluded from groups, and told so.
- A mixer tournament is unaffected end to end.

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
