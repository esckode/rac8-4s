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
4. **Widen the capacity hold.** `countPendingPartnerInviteHolds` (`db.ts:616`) currently matches
   `status = 'pending_partner_confirm' AND partner_id IS NULL`. Under (1) an A/B pending pair has
   `partner_id` set but no row for X, so the hold must match "pending, unconfirmed, and the partner
   has no registration in this tournament". Keep the existing TTL clause — the 24h expiry is what
   cleans up the invites X never accepted.
5. **Losing invites need no explicit cleanup.** They lapse via the hold TTL. Notifying the losing
   requesters is desirable but optional; if added, reuse `postPersonalNotification` (the same helper
   the invite notification uses).

### Do NOT

- **Do not add a schema column or an `invites` table.** The requester's row and the invite token
  already carry everything; a third store is how this got inconsistent in the first place.
- **Do not reintroduce a write to X's registration to "reserve" them.** That is the bug.
- **Do not revert the ISSUE-15 follow-up fixes** in the same files: the dual-auth
  `resolveTournamentPlayer` on confirm, the `partnerConfirmWindowOpen` helper, the hold TTL, and the
  `DELETE /registrations/:id/partner-invite` cancel route all stay.
- **Do not "fix" defect (1) by making `confirmPartner` clear the loser's row.** The loser's
  registration must stay valid and solo; only their claim on X goes away.

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
- Deliverability: UAT SES mail lands in Gmail **spam** (DMARC can't align from a
  `gmail.com` sender) — a known, owner-accepted trade-off, tracked in
  `UAT_PWA_LAUNCH.md` P0.6-SES, not a bug. The real fix is a verified domain (§2).
