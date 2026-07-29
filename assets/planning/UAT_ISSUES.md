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

**No open issues right now** — ISSUE-1–21, the 2026-07-26/27 walkthrough batch (ISSUE-22–31), and the
post-walkthrough audit (ISSUE-32–33) are all resolved; see
[the walkthrough-queue summary](COMPLETED_UAT_ISSUES.md#walkthrough-queue-2) and
[the post-walkthrough audit](COMPLETED_UAT_ISSUES.md#post-walkthrough-audit) for the ship order and
what each shipped. Number new issues from 34.

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
| [ISSUE-32](COMPLETED_UAT_ISSUES.md#issue-32) | ✅ Resolved | 🟠 | SSE `/tournaments/:id/events` 403s for registered accounts — live updates dead for participants | api |
| [ISSUE-33](COMPLETED_UAT_ISSUES.md#issue-33) | ✅ Resolved | 🟠 | `tournaments.creator_id` is polymorphic — account id or player id by creation path | api · data |
| [ISSUE-34](#issue-34) | 🔲 Open | 🟠 | e2e merge gate unusable — the register rate-limit override exists but is never set | scripts · test |
| [ISSUE-35](#issue-35) | 🔲 Open | 🟠 | `POST /api/analytics/events` 401s for registered accounts — no analytics for account holders | api |
| [ISSUE-36](#issue-36) | 🔲 Open | 🟠 | Three of four More-menu items are dead links; no About/Contact/Settings pages exist | frontend |
| [ISSUE-37](#issue-37) | 🔲 Open | 🟡 | Auth page titles are styled `<div>`s, not headings — no page heading for screen readers | frontend · a11y |
| [ISSUE-38](#issue-38) | 🔲 Open | 🟡 | `real-time-updates.spec.ts` reconnect test fails consistently; a second test is flaky | test |

---

## ISSUE-34 — e2e merge gate unusable: the rate-limit override is never set 🟠 {#issue-34}

### Symptom

`npm run test:e2e` produces ~142 failures / 267 passed, overwhelmingly `RATE_LIMITED` raised by the
fixtures' own `POST /:id/register` calls. A 427-test both-browser sweep from one IP exhausts
ISSUE-11's per-IP cap within the first few multi-player fixtures; everything after fails to seed.
**So CLAUDE.md §11's "full run before merging" is not a real gate**, and per-spec runs are the only
signal.

### Root cause

The knob **already exists** — `config.ts:686` reads
`APP_LIMITS_RATE_LIMIT_REGISTER_PER_IP_MAX_ATTEMPTS`, defaulting to 25 (`:534`). It is simply
**never set** for dev or e2e: not in `.env`, `.env.example`, `scripts/e2e-setup.js`, or
`playwright.config.ts` (verified 2026-07-29).

### Fix

Set the override for the e2e environment — **in `scripts/e2e-setup.js`**, so it cannot be forgotten
the way a `.env` line can when someone sets up a fresh checkout. Add it to `.env.example` with a
comment too.

**Do NOT raise the production default.** The 25/15min cap is ISSUE-11's defence against using public
registration as an email-bombing vector. This is a test-environment override only.

### Verify

```bash
node scripts/e2e-setup.js          # should report the override in effect
npm run test:e2e -- --reporter=line
```
The sweep should complete without `RATE_LIMITED`. Expect other pre-existing failures to remain —
notably [ISSUE-38](#issue-38); this issue is about removing the seeding wall, not turning the suite
green.

---

## ISSUE-35 — `POST /api/analytics/events` 401s for registered accounts 🟠 {#issue-35}

### Symptom

Every authenticated page view by an account holder logs a 401. Observed live 2026-07-29 on every
page during a walkthrough. **No analytics are recorded for registered users at all** — only guest
sessions get through.

This matters more than it looks: the beta exists to produce the field data the organizer pricing was
parked on (`MONETIZATION_DESIGN.md` §7.1 — players per event, events per organizer per year). That
data is being dropped for exactly the cohort that has accounts.

### Root cause

`analytics.ts:23` calls `requirePlayerSessionAuth` directly with no fallback, so an account JWT
throws. Identical shape to [ISSUE-24](COMPLETED_UAT_ISSUES.md#issue-24) and
[ISSUE-32](COMPLETED_UAT_ISSUES.md#issue-32), both of which are now shipped and can be copied.

### Fix — TDD (§4)

**Red:** an integration test asserting a registered account JWT is accepted by `POST /api/analytics/events`,
alongside the guest-session case so the fix does not trade one for the other.

**Green:** resolve the player through the same dual-auth path those two issues established, rather
than hand-rolling a third variant.

**Consider while here:** analytics ingestion is fire-and-forget from the client. Decide whether an
unauthenticated or unresolvable caller should 401 at all, or be silently dropped — a 401 on every
page view is noise in the logs even once the auth is fixed.

### Verify

`npm --workspace=packages/api exec -- jest --findRelatedTests packages/api/src/routes/analytics.ts --bail`,
then sign in with a **registered account**, load any authenticated page, and confirm no 401 on
`/api/analytics/events`.

---

## ISSUE-36 — Three of four More-menu items are dead links 🟠 {#issue-36}

### Symptom

Opening **More** and tapping **Account**, **Settings** or **About** lands on the NotFound page.
Only **Organizer Dashboard** resolves.

Verified 2026-07-29: `ResponsiveLayout.tsx:52,54,55` link to `/account`, `/settings` and `/about`,
and **none of those paths is registered in `App.tsx`**. `ROUTES` has no `ACCOUNT`, `SETTINGS` or
`ABOUT` constant either — the paths are hardcoded strings in the menu.

Newly *visible* because [ISSUE-29](COMPLETED_UAT_ISSUES.md#issue-29) added the `path="*"` catch-all;
before that they rendered a blank outlet, which is worse but less obvious.

### Fix — includes the support model

**`/profile` already exists and is registered.** "Account" almost certainly means it — repoint rather
than build a second page. Confirm before assuming.

**Build `/about`, and put Contact on it.** Owner decision 2026-07-29 — support is two-tier:

| Kind of problem | Goes to |
|---|---|
| **Technical / the webapp itself** | the Contact route on the About page |
| **Non-technical** (fixtures, membership, "can I join", scheduling) | **the group owners**, in the group |

This closes the two dangling "contact support" promises: `ServiceUnavailable.tsx:14`, and ISSUE-24's
`PLAYER_NOT_LINKED` copy, which had to drop the phrase because there was nowhere to send people.
Both should now link to the Contact route.

**`/settings`** — decide whether it is a real page or should be removed from the menu. `/profile`
already carries the personalization settings (`PERSONALIZATION_DESIGN.md`), so a separate Settings
entry may be redundant. **Removing a menu item is a valid fix** — do not build a page to justify a
link.

**Do NOT leave a hardcoded path in the menu.** Add `ROUTES` constants for whatever survives, so the
next dead link fails at the type level rather than at runtime.

### Verify

`npx playwright test mobile accessibility --project=chromium --reporter=line`, plus manually opening
every More-menu item and confirming each resolves. Add a test asserting every menu `path` matches a
registered route — that is the guard that stops this recurring.

---

## ISSUE-37 — Auth page titles are not headings 🟡 {#issue-37}

### Symptom

`Login.tsx` contains **zero** `<h1>` elements (verified 2026-07-29) — its 34px title is a styled
`<div>` (`:187`). `ForgotPassword.tsx` and `ResetPassword.tsx` are the same. `Signup.tsx` and
`Landing.tsx` use a real `<h1>`.

So a screen-reader user gets no page heading on three of the five auth screens, and heading
navigation skips them entirely.

### Fix

Promote the title to `<h1>` on the three pages, keeping the existing inline styles so nothing moves
visually. `Signup.tsx:260` is the reference — same visual weight, correct element.

**Do this via a shared page-header component if convenient** — five hand-rolled titles is what let
them drift apart, and it would give
[ISSUE-22](COMPLETED_UAT_ISSUES.md#issue-22)'s no-trailing-full-stop convention something structural
to enforce it. Not required; the three-element fix is legitimate on its own.

### Verify

`npx playwright test accessibility --project=chromium --reporter=line`, and
`npm --workspace=packages/frontend exec -- jest --findRelatedTests packages/frontend/src/pages/Login.tsx --bail`.
Assert exactly one `<h1>` per auth page.

---

## ISSUE-38 — `real-time-updates.spec.ts` reconnect test fails consistently 🟡 {#issue-38}

### Symptom

Reproduced 2026-07-29: **1 failed, 2 passed**.

- *"standings refresh on reconnect after an SSE disconnect"* (`:137`) fails on the initial attempt
  **and both retries** — `expect(wonCells(page)).toHaveCount(1, { timeout: 20000 })`.
- *"see synchronized standings"* (`:92`) errors then passes on retry — **flaky**, worth fixing at the
  same time.

**Pre-existing and not auth-related.** Confirmed on three independent grounds: the implementer of
ISSUE-32/33 reproduced it on `main` before their changes via `git stash`; the run logs **zero**
401/403 occurrences; and the test authenticates with `fx.playerToken`, the guest-session path that
already worked before ISSUE-32 touched only the account-JWT branch.

### Root cause — unknown, one lead

The test drops the network (`context.setOffline(true)`), submits a score out-of-band, restores the
network, and expects the reconnect to refetch the authoritative bundle.

*Lead, unverified:* `/tournaments/:id/bundle` is a **venue-read (network-first) pattern** in the
service worker (`sw-lib/routing.ts:4`), so a reconnect refetch could be served stale from cache.
**Check whether the service worker is even registered under Playwright before chasing this** — if it
is not, the lead is void and the cause is elsewhere (likely the hook's reconnect-refetch trigger).

### Fix

Diagnose first; the fix is not known. **Do not paper over it by raising the timeout** — it fails at
20s across three attempts, which is a behaviour failure, not a slow one.

### Verify

```bash
npx playwright test real-time-updates --project=chromium --reporter=line
```
All three tests green on the **first** attempt — a pass that only happens on retry means the flake at
`:92` is still there.

---

## Not yet triaged / follow-ups

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
