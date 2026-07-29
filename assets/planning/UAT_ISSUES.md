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

ISSUE-1–21 and the 2026-07-26/27 walkthrough batch (ISSUE-22–31) are all resolved; see
[the walkthrough-queue summary](COMPLETED_UAT_ISSUES.md#walkthrough-queue-2) for the ship order and
what each shipped. **Open: [ISSUE-32](#issue-32) and [ISSUE-33](#issue-33)**, both found on
2026-07-29 while verifying that batch — 32 is the user-visible symptom, 33 the data-model cause
underneath it. Both are implementable; 33 carries one narrow owner call, flagged in place. Number
new issues from 34.

| # | Status | Severity | Title | Area |
|---|---|---|---|---|
| [ISSUE-22](COMPLETED_UAT_ISSUES.md#issue-22) | ✅ Resolved | 🟡 | Login greets guests with "Welcome back."; page titles/descriptions end in full stops | frontend · copy |
| [ISSUE-23](COMPLETED_UAT_ISSUES.md#issue-23) | ✅ Resolved | 🟠 | Auth pages hardcode a 390×844 phone frame — clipped below 390, gutters above | frontend · layout |
| [ISSUE-24](COMPLETED_UAT_ISSUES.md#issue-24) | ✅ Resolved | 🟠 | An account with no linked player gets `TOKEN_INVALID` + "sign in again" — an unbreakable loop | api + frontend |
| [ISSUE-25](COMPLETED_UAT_ISSUES.md#issue-25) | ✅ Resolved | 🟡 | `seed-test-accounts.ts` creates accounts with no linked player — every seeded login hits ISSUE-24 | scripts · dev |
| [ISSUE-26](COMPLETED_UAT_ISSUES.md#issue-26) | ✅ Resolved | 🟠 | Bottom nav labels clip off-screen at every phone width (6 items don't fit under ~444px) | frontend · layout |
| [ISSUE-27](COMPLETED_UAT_ISSUES.md#issue-27) | ✅ Resolved | 🟡 | Dark entry vs light app is intentional — document the boundary; replace the emoji icons | frontend · design |
| [ISSUE-28](COMPLETED_UAT_ISSUES.md#issue-28) | ✅ Resolved | 🟠 | Nav: collapse Standings + Matches into one "Play" hub; four items | frontend + api |
| [ISSUE-29](COMPLETED_UAT_ISSUES.md#issue-29) | ✅ Resolved | 🟠 | Temporarily block public browse + public registration; keep both invite paths working | frontend + api |
| [ISSUE-30](COMPLETED_UAT_ISSUES.md#issue-30) | ✅ Resolved | 🔴 | `/tournament/:id` redirects to a **literal** unsubstituted path — group launch's payoff step is broken | frontend |
| [ISSUE-31](COMPLETED_UAT_ISSUES.md#issue-31) | ✅ Resolved | 🔴 | A group-launched casual tournament **never generates matches** — there is nothing to play | api |
| [ISSUE-32](#issue-32) | 🔲 Open | 🟠 | SSE `/tournaments/:id/events` 403s for registered accounts — live updates dead for participants | api |
| [ISSUE-33](#issue-33) | 🔲 Open | 🟠 | `tournaments.creator_id` is polymorphic — account id or player id by creation path | api · data |

---

## ISSUE-32 — SSE `/tournaments/:id/events` 403s for registered accounts 🟠 {#issue-32}

*Found 2026-07-29 while verifying the ISSUE-22→31 fixes. Promoted from a follow-up note after the
re-check it asked for came back positive.*

### Symptom

A registered account holder who **is a participant** in a tournament gets `403 FORBIDDEN` from the
tournament's SSE stream, so real-time updates are dead on every tournament page. Verified live
against a freshly launched group tournament in which the caller is one of the two registered players:

```
GET /tournaments/<id>/events?token=<account JWT>
  → 403  {"code":"FORBIDDEN","message":"Access denied"}
```

**This was previously logged as a follow-up with the note "may be a consequence of ISSUE-31 — no
groups exist, so there may be nothing to subscribe to. Re-check after ISSUE-31 lands."** ISSUE-31 has
landed, the tournament now has 1 group and 1 match and sits at `group_stage_active`, and the 403
persists. It is a defect in its own right.

### Root cause

`tournaments.ts:2603` (`router.get('/:id/events', …)`) **hand-rolls its own dual-auth** instead of
using the `resolveTournamentPlayer` helper that lives in the same file (`:175`). Its "Phase 2: verify
tournament membership" block is where it fails:

```ts
if (playerPayload) {
  assertPlayerInTournament(playerPayload, tournamentId)          // guest session → works
} else {
  assertOrganizerOwnsTournament(organizerPayload, tournament.creator_id)   // ← always throws
}
```

**The else-branch assumes an account JWT means "organizer".** A registered player has no
`playerPayload` (that is the guest-session shape), so they land in an *ownership* check they are not
the subject of. And it cannot pass even in principle:

| Value | Namespace | Source |
|---|---|---|
| `organizerPayload.sub` | **account** id (`account_…`) | the JWT subject |
| `tournament.creator_id` | **player** id (`player_…`) | `player-groups.ts:941`, `creatorId: session.playerId` |

`assertOrganizerOwnsTournament` is a plain inequality —
`if (organizerPayload.sub !== tournamentOrganizerId) throw` (`auth/middleware.ts:66-73`) — comparing
values from two different id spaces. **So even the player who launched the tournament cannot
subscribe to it**, which is how this was found.

Same registered-account-is-also-a-player gap as [ISSUE-1](COMPLETED_UAT_ISSUES.md#issue-1) and
[ISSUE-24](COMPLETED_UAT_ISSUES.md#issue-24). Missed by ISSUE-24 specifically **because this route
uses neither resolver** — that fix corrected `resolvePlayerId` and `resolveTournamentPlayer`, and
this handler calls neither.

This is exactly the case the follow-up list flags for `tournaments.ts` — "several routes still call
`requirePlayerSessionAuth` directly with no fallback… needs a case-by-case read". This is one of them,
now confirmed rather than suspected.

### Fix — TDD (CLAUDE.md §4, commit red separately per §11)

**Red:** integration tests covering **all three** identities on the events route, because the failure
mode is trading one for another:

| Caller | Expected |
|---|---|
| Guest magic-link session, registered | ✅ works today — must keep working |
| Registered **account**, registered participant | ❌ 403 today — **this is the fix** |
| Organizer who owns the tournament but is **not** registered | ✅ works today — must keep working (2,627 real rows) |
| Registered account, **not** a participant and not the owner | ❌ 403 — must stay denied |

The third row is the regression guard. Without it, the obvious fix passes its tests and silently
breaks organizers.

**Green:** replace the **exclusive `if/else`** with *try owner, then fall back to participant* —
exactly the shape at `:674`:

```ts
try {
  assertOrganizerOwnsTournament(orgPayload, tournament.creator_id)   // owner path
} catch {
  const resolved = await resolveTournamentPlayer(authHeader, tournamentId)  // participant path
  actingPlayerId = resolved.playerId
}
```

**⚠ Do NOT simply "route it through `resolveTournamentPlayer`" instead of its own chain** — an
earlier draft of this issue said exactly that and it is **wrong**. That helper *requires a
registration* (`findRegistration` → `ForbiddenError`, `:196-198`), and **2,627 organizer-created
tournaments have a creator who is not a registered participant** (measured 2026-07-29). Swapping the
chain for the helper would deny every one of those organizers access to their own tournament's
stream. The owner path must survive.

**Why `:674` works today even for group tournaments** — and this is worth understanding before
copying it: its owner check *fails* on a group-launched tournament (the [ISSUE-33](#issue-33) id
mismatch), and the fallback then succeeds because the launcher is registered. The correct outcome
emerges from a broken check plus a working fallback. `end-session` and `events` have no fallback, so
they simply fail. **You are restoring the fallback, not fixing the owner check** — that is
[ISSUE-33](#issue-33).

**Do NOT drop the participation check** to make the 403 go away — it is what stops a non-participant
subscribing to another tournament's live stream.

**Map the error codes deliberately.** `resolveTournamentPlayer` throws `PlayerNotLinkedError`
(→ `403 PLAYER_NOT_LINKED`, per ISSUE-24), `ForbiddenError` (→ 403), or rethrows the session error
(→ 401). The events route currently distinguishes 401 "Authentication required" from 403 "Access
denied"; preserve that distinction rather than collapsing everything to 403.

**Mind the connection-cap key.** The handler derives `userId` as
`playerPayload?.playerId ?? organizerPayload.sub` for the per-user SSE connection limit
(`sseMaxConnectionsPerUser`). Resolving through the helper should make that consistently a
`playerId`; check the cap still behaves rather than silently keying on a different identity.

### Verify

```bash
SCRATCH=/tmp
npm --workspace=packages/api exec -- jest \
  --findRelatedTests packages/api/src/routes/tournaments.ts --bail > "$SCRATCH/api.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/api.log" | head -40

npx playwright test real-time-updates --project=chromium --reporter=line --max-failures=1
```

Manual, and the reproduction that found it: launch a group casual tournament, sign in as one of the
participants with a **registered account** (not a guest magic link), open the tournament page and
confirm no 403 on `/tournaments/:id/events`.

**Why no test caught it — verified, not inferred.** `real-time-updates.spec.ts` authenticates with
`fx.playerToken` (`:59, :77`), a player-session token, so every one of its assertions runs down the
`assertPlayerInTournament` branch that works. The account-JWT branch has no coverage at all. **A new
test must use a registered account**, not the existing fixture token, or it will pass against the
broken code.

### Audit of the other call sites — done 2026-07-29, results below

All 17 `assertOrganizerOwnsTournament` sites were checked and the reachable ones tested live against
a real group-launched tournament, signed in as the player who launched it.

**The underlying defect is not the `if/else` shape — it is that `tournament.creator_id` is
polymorphic:**

| Creation path | `creator_id` holds | Set at |
|---|---|---|
| Organizer-created (`POST /tournaments`) | **account** id (`account_…`) | `tournaments.ts:259`, `creatorId: payload.sub` |
| Group-launched (poll → casual) | **player** id (`player_…`) | `player-groups.ts:941`, `creatorId: session.playerId` |

`assertOrganizerOwnsTournament` is `organizerPayload.sub !== tournamentOrganizerId` — an account id
compared to a column that sometimes holds a player id. **Every ownership check against a
group-launched tournament therefore fails, always.** It fails *closed* (denies), so this is a
functionality defect and not a security hole — but no amount of per-route patching fixes the column.

Compounding it: **`requireOrganizerAuth` does not check the role** (`auth/middleware.ts:~40` — it
verifies the JWT and the logout denylist, nothing more), so any registered account passes it and
reaches the ownership check. The name is misleading; it is effectively `requireAccountAuth`.

**Verified broken — same defect, fix together with the events route:**

| Route | Assert | Status |
|---|---|---|
| `GET /:id/events` | :2651 | **403** — user-visible, the symptom above |
| `POST /:id/end-session` | :1832 | **403** — and it is a *casual-only* route (`mode !== 'casual'` → error), so a group-launched tournament can **never** be ended. No UI caller yet, so latent |
| `GET /:id/groups` | :486 | **403** — not user-visible today; the frontend reads `/tournaments/:id/bundle` (`useTournament.ts:46`) instead |

**Verified correct — use it as the reference implementation:**
`PATCH /:id/matches/:matchId/score` (:674) is the one site that gets this right. It checks
`orgPayload.role === 'organizer'` *and* falls through to `resolveTournamentPlayer` when the ownership
assert throws. Tested live: returns `400 SCORE_INVALID` on a malformed score, i.e. **auth passed**.
Copy this shape.

**Not applicable to casual play** (organizer operations on organizer-created tournaments, left
alone): `:287` advance, `:346` pairing-preview, `:370` POST groups, `:840` bracket/generate, `:957`
PATCH bracket, `:1030` bracket/publish, `:1177` knockout score, `:1686` PATCH, `:1741` DELETE. Worth
a second look only if a group is ever given rename/delete over its own casual tournament.

**Scope call for the implementer:** fixing the three routes above by routing them through
`resolveTournamentPlayer` is correct and sufficient for this issue. **The polymorphic `creator_id`
column is the deeper problem and should be its own issue** — either split the column
(`creator_account_id` / `creator_player_id`) or make ownership checks resolve both id spaces. Do not
attempt that here.

---

## ISSUE-33 — `tournaments.creator_id` holds two different id types 🟠 {#issue-33}

*Found 2026-07-29 during the [ISSUE-32](#issue-32) audit. This is the root cause underneath it.*

### Symptom

One column, two id namespaces, depending on how the tournament was created:

| Creation path | `creator_id` holds | Set at |
|---|---|---|
| Organizer-created (`POST /tournaments`) | **account** id (`account_…`) | `tournaments.ts:259` |
| Group-launched (poll → casual) | **player** id (`player_…`) | `player-groups.ts:941` |

Any code comparing an authenticated identity against this column is therefore correct for one
creation path and wrong for the other. `assertOrganizerOwnsTournament`
(`auth/middleware.ts:66-73`) is a plain `!==`, so it silently denies every group-launched
tournament — see ISSUE-32 for three routes where that surfaces.

It fails **closed**, so this is a functionality defect rather than a security hole. The two id
spaces use distinct prefixes, so a false *match* is not possible.

### Why it is its own issue

ISSUE-32 fixes the three affected routes by resolving through `resolveTournamentPlayer`, which is
correct and sufficient there. But the column stays ambiguous, so the next ownership check written
against it inherits the same bug. **Fixing routes does not fix the column.**

### Fix — branch on `group_id`; no migration needed

**`group_id` already tells you which namespace `creator_id` is in.** Measured 2026-07-29 across all
3,836 rows — the correlation is total, with no exceptions to handle:

| kind | rows | with `group_id` |
|---|---|---|
| organizer-created (`creator_id` = account) | 2,627 | **0** |
| group-launched (`creator_id` = player) | 1,209 | **1,209** |

So `group_id IS NULL` ⟺ organizer-created ⟺ `creator_id` is an account id. **No migration, no
backfill, no new column** — the discriminator exists and is fully populated.

Ownership therefore branches:

```
group_id IS NULL      → organizer-owned. Compare organizerPayload.sub to creator_id.
                        (today's behaviour, and correct for these 2,627 rows)

group_id IS NOT NULL  → group-owned. Ownership is GROUP MEMBERSHIP, not creator identity.
                        Check the caller against the owning group.
```

**The second branch is also the conceptually right model**, which is the real argument for it: a
group's casual tournament belongs to *the group*, not to whoever happened to tap launch. Keying it to
`creator_id` means the tournament becomes unownable the moment that person leaves the group — a bug
waiting to happen that the current design has simply not hit yet.

*(Three earlier candidates — splitting the column, normalising on player id, or teaching the check to
accept either namespace — are all superseded by this. Normalising on player id would additionally
have depended on `MONETIZATION_DESIGN.md` §7.1 O4, which is not built.)*

**Owner decision 2026-07-29: any group member passes.** Not owners-only, not launcher-only — a casual
session is a small trust-based group, and the app already reserves owner-gating for the things that
genuinely need it (moderation, member management).

It is also the simplest check to write and the least to go wrong: one membership lookup, no role
comparison, no launcher identity to carry. Use the same helper the poll routes use —
`groupRepo.getMemberRole(db, groupId, playerId)`, treating any non-`null` as a pass
(`player-groups.ts:~854` is the existing precedent).

```
group_id IS NOT NULL  →  getMemberRole(db, tournament.group_id, callerPlayerId) !== null
```

*Consequence, accepted:* any member can end a casual session, including one others are mid-way
through. That is the trade for simplicity in a group where everyone already shares a chat.

**Do NOT re-derive the namespace from the id prefix** (`account_` vs `player_`) even though it works
today. `group_id` is a real, indexed column expressing the actual relationship; string-prefix
sniffing is an accident of the id format that will break the day id generation changes.

### Fix — TDD (CLAUDE.md §4, commit red separately per §11)

**Red:** an integration test matrix over the two creation paths, since the whole point is that one
column behaves differently in each:

| Tournament | Caller | Expected |
|---|---|---|
| organizer-created (`group_id IS NULL`) | its creator (account) | ✅ pass — must not regress |
| organizer-created | an unrelated account | ❌ deny |
| group-launched (`group_id` set) | a group member | ✅ pass — **impossible today** |
| group-launched | the launcher specifically | ✅ pass (a member by definition) |
| group-launched | a non-member account | ❌ deny |

The last row matters: widening to "any member" must not widen to "anyone".

**Green:** branch `assertOrganizerOwnsTournament`'s callers on `group_id` as above. Prefer changing
the **call sites' shared helper** over the assert itself — the assert is a pure two-string comparison
used correctly by the organizer path, and it has no DB access to look up membership with.

**Do NOT** widen the existing assert to "accept either namespace" — that was a rejected earlier
approach and it would let an account id match a player id column by coincidence of value rather than
by relationship.

### Verify

```bash
SCRATCH=/tmp
npm --workspace=packages/api exec -- jest \
  --findRelatedTests packages/api/src/routes/tournaments.ts packages/api/src/auth/middleware.ts \
  --bail > "$SCRATCH/api.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/api.log" | head -40
```

Expect a wide selection — §11 notes api specs import the express app, so touching an auth helper
pulls in most of the suite. That is the correct answer, not a slow one.

Manual, against a real group-launched tournament (the ISSUE-31 Verify block has the API sequence to
create one): as a group member who is **not** the launcher, confirm `POST /:id/end-session` succeeds
where it returns 403 today, and that a non-member still gets 403.

---
## Not yet triaged / follow-ups

- **`POST /api/analytics/events` returns 401 for a registered player** — confirmed live 2026-07-27,
  on every authenticated page. This is the `analytics.ts:23` dual-auth gap already listed below, now
  observed rather than inferred: it fires on each page view, so every authenticated session logs a
  401 and no analytics are recorded for account holders.
- **The app has no support destination.** No `mailto:`, no `support@`, no `/support` route anywhere
  (verified 2026-07-27). `ServiceUnavailable.tsx:14` already tells users to "contact support" with
  nowhere to go, and [ISSUE-24](COMPLETED_UAT_ISSUES.md#issue-24) had to drop the same phrase from its copy for this reason.
  Either add a real destination or stop promising one — small, but it is currently a dead end at
  exactly the moments a user is already stuck.
- **Auth page titles are not headings.** `Login.tsx:186` renders its title as a styled `<div>`,
  as do `ForgotPassword.tsx` and `ResetPassword.tsx`; `Signup.tsx:260` and `Landing.tsx:45` use a
  real `<h1>`. A screen reader gets no page heading on three of the five auth screens. Noticed
  while scoping ISSUE-22 and deliberately left out of it (§3 — surgical); needs its own issue, and
  the fix is a shared page-header component rather than five hand-rolled titles, which would also
  give ISSUE-22's convention something to enforce it structurally. ISSUE-23's `.auth-shell` is the
  natural home for it — if all three land, do this one last so it builds on that shell.
- **`pages/DesignSpec.tsx` is dead code** — imported by no route, test, or module; it hand-mirrors
  `Landing.tsx`'s hero copy and has to be kept in sync manually (ISSUE-22 does exactly that).
  Flagged, not deleted (§3). Decide whether it still earns its place.
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
- **Tournament lifecycle has no automatic status transitions** (surfaced by ISSUE-9) — **moved to
  `BACKLOG.md` § Deferred on 2026-07-27**, since its urgency came from stale tournaments lingering in
  Browse, and Browse is now blocked ([ISSUE-29](COMPLETED_UAT_ISSUES.md#issue-29)). Still a real correctness gap; the two
  notes below travel with it and must not be lost. Nothing moves a normal tournament off
  `registration_open` at its `registration_deadline`, or to `completed` when finished — the only
  auto-close sweep is for polls.
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
  - **⚠ `pkill -f "workspace=packages/api"` does not actually restart the server** — confirmed
    2026-07-28. `npm run dev --workspace=packages/api` spawns `tsx watch` as a grandchild process
    whose full command line is just `tsx watch src/server.ts`; the `npm`/`workspace=` string never
    appears in `ps`, so the pkill silently matches nothing and the "restarted" server is the same
    long-lived process with the same exhausted in-memory rate-limit counter. Over one long session
    this produced a stack of orphaned `tsx watch` processes, only one of which was ever actually
    bound to port 3001 and serving traffic. **Restart by killing whatever is actually bound to the
    port** — `fuser -k 3001/tcp`, or find the PID via `ss -ltnp | grep 3001` and `kill -9` it — then
    confirm the new process has a different PID before trusting a "fresh server" e2e run.
- Deliverability: UAT SES mail lands in Gmail **spam** (DMARC can't align from a
  `gmail.com` sender) — a known, owner-accepted trade-off, tracked in
  `UAT_PWA_LAUNCH.md` P0.6-SES, not a bug. The real fix is a verified domain (§2).
