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
| [ISSUE-16](COMPLETED_UAT_ISSUES.md#issue-16) | ✅ Resolved | 🟠 | Partner pairing is first-*inviter*-wins — an invite mutates the invitee's registration | api + frontend |
| [ISSUE-17](#issue-17) | 🔲 Open | 🟠 | Solo doubles registrants are auto-paired with a stranger without consent | api + frontend |
| [ISSUE-18](COMPLETED_UAT_ISSUES.md#issue-18) | ✅ Resolved | 🔴 | Confirming a partner has no accept-time guard, and `confirmPartner` is not atomic | api · data |
| [ISSUE-19](COMPLETED_UAT_ISSUES.md#issue-19) | ✅ Resolved | 🟠 | No notification fires when a doubles team is formed, by any path | api |
| [ISSUE-20](COMPLETED_UAT_ISSUES.md#issue-20) | ✅ Resolved | 🟠 | Withdrawal never dissolves a team, and no query filters withdrawn registrations | api · data |
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
- **Migration numbering:** the highest existing migration is `059`
  (`059_partner_claim_columns.sql`, [ISSUE-16](COMPLETED_UAT_ISSUES.md#issue-16), shipped). The
  consent column (ISSUE-17) is `060`. ISSUE-20 and ISSUE-21 added no columns.

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
   - **Use `PLAYS_IN_BRACKET`** from [ISSUE-20](COMPLETED_UAT_ISSUES.md#issue-20) as the population, so at minimum the two
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
  ([ISSUE-20](COMPLETED_UAT_ISSUES.md#issue-20)). **Leftovers** = `PLAYS_IN_BRACKET` registrants not in a confirmed mutual
  pair; `optedOut` = leftovers with `auto_pair_consent = false`; `consentingLeftovers` = the rest.
  `unpairedCount = optedOut.length + (consentingLeftovers % 2)` — the parity trap in requirement (4);
  with `pairUnpaired=false`, every leftover is unpaired.
- **Frontend:** the doubles registration form in `pages/TournamentBrowse.tsx` (the `partnerEmail`
  input, ~line 235 — and its duplicate at ~line 294) renders a checkbox defaulting **checked** that
  sets `body.autoPairConsent`. Add a `data-testid` and its `e2e/config.ts` constant (§8).
  `PartnerFinder.tsx` is unaffected.

### Interaction with ISSUE-16 — the capacity-hold reasoning, narrowed not reversed

[ISSUE-16](COMPLETED_UAT_ISSUES.md#issue-16) §4 removes capacity holds partly on the grounds that "a solo registrant always
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
