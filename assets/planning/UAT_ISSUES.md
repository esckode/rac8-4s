# UAT Issues — found during the 2026-07-20/21 AWS deploy session

Running tracker for defects surfaced while standing up and testing the first UAT
deploy (CloudFront `d37ruxd1gf48ip.cloudfront.net`, since torn down). Each issue is
scoped for a Sonnet implementer: symptom → verified root cause (`file:line`) → fix →
verify. Follow `CLAUDE.md` throughout — TDD (§4), one logical change per commit and
branch-per-issue (§11), surgical edits (§3). **Read the referenced code before editing;
several fixes have a "do NOT" note because the obvious approach is wrong.**

Severity: 🔴 blocks a user-facing feature · 🟠 real defect, limited blast radius · 🟡 robustness.

## Before you start

**Only one issue remains open: 27.** ISSUE-22, 23, 24, 25, 26, 28, 29, 30 and 31 are resolved — see
[the walkthrough-queue summary](COMPLETED_UAT_ISSUES.md#walkthrough-queue-2) for the ship order and
what each shipped. **27 needs 28's final four-item tab set before drawing icons** — 28 is done, so
27 is unblocked.

**Servers.** API 3001, frontend 5173, Postgres/Redis via Docker, **plus
`npm run dev:worker --workspace=packages/api`** for anything touching assistant/coach/nudge or the
auto-launch path (§8). `node scripts/e2e-setup.js` checks all of it.

**Seeded accounts should now work out of the box.** `npm run seed:accounts` links a player correctly
(ISSUE-25, resolved), and an account that somehow still has no linked player gets a clear
`PLAYER_NOT_LINKED` message instead of an unbreakable re-auth loop (ISSUE-24, resolved). If
`organizer@test.com` / `player@test.com` still misbehave, the row predates both fixes — re-seed, or
**sign up a fresh account instead**; real signup always links a player. Signup needs
`dob_attestation: { dateOfBirth: 'YYYY-MM-DD', policyVersion: '1.0' }` or it 400s on the age gate.

**⚠ The full e2e sweep cannot pass as configured** — ~142 failures from `RATE_LIMITED`, documented in
the follow-ups below. **Do not treat it as your merge gate.** Per-spec runs with
`--project=chromium --reporter=line --max-failures=1` are the real signal; restarting the API clears
the in-memory limiter. **Restart by killing whatever is actually bound to port 3001** (`fuser -k
3001/tcp` or `ss -ltnp | grep 3001` to find the PID) — `pkill -f "workspace=packages/api"` does not
match the grandchild process `tsx watch` actually spawns, so it silently no-ops and the "restarted"
server is the same one with the same exhausted limiter.

**Coverage floors (§13) are raise-only and enforced per-workspace.** ISSUE-27 adds new files; run
`npm run test:coverage` for the workspace you touched, and if a floor drops because you deleted
well-covered code, **lower it explicitly and say why in the commit** — a silent drop reads as someone
editing the gate to hide a regression.

**Tooling.** `node scripts/inspect-route.mjs <route> --width=360 --depth=3` dumps the layout box
chain and is how every geometry number in 23/26/28 was measured. Re-measure with it rather than
eyeballing screenshots.

**ISSUE-1 – ISSUE-21, and now ISSUE-22, 23, 24, 25, 26, 28, 29, 30 and 31, are all resolved and have
been moved, index and bodies, to [`COMPLETED_UAT_ISSUES.md`](./COMPLETED_UAT_ISSUES.md)** (CLAUDE.md
§12 — working the open queue shouldn't cost a read of every closed issue). This file carries only
open work (ISSUE-27) plus the follow-ups below. Number new issues from where the archive ends.

| # | Status | Severity | Title | Area |
|---|---|---|---|---|
| [ISSUE-22](COMPLETED_UAT_ISSUES.md#issue-22) | ✅ Resolved | 🟡 | Login greets guests with "Welcome back."; page titles/descriptions end in full stops | frontend · copy |
| [ISSUE-23](COMPLETED_UAT_ISSUES.md#issue-23) | ✅ Resolved | 🟠 | Auth pages hardcode a 390×844 phone frame — clipped below 390, gutters above | frontend · layout |
| [ISSUE-24](COMPLETED_UAT_ISSUES.md#issue-24) | ✅ Resolved | 🟠 | An account with no linked player gets `TOKEN_INVALID` + "sign in again" — an unbreakable loop | api + frontend |
| [ISSUE-25](COMPLETED_UAT_ISSUES.md#issue-25) | ✅ Resolved | 🟡 | `seed-test-accounts.ts` creates accounts with no linked player — every seeded login hits ISSUE-24 | scripts · dev |
| [ISSUE-26](COMPLETED_UAT_ISSUES.md#issue-26) | ✅ Resolved | 🟠 | Bottom nav labels clip off-screen at every phone width (6 items don't fit under ~444px) | frontend · layout |
| [ISSUE-27](#issue-27) | 🔲 Open | 🟡 | Dark entry vs light app is intentional — document the boundary; replace the emoji icons | frontend · design |
| [ISSUE-28](COMPLETED_UAT_ISSUES.md#issue-28) | ✅ Resolved | 🟠 | Nav: collapse Standings + Matches into one "Play" hub; four items | frontend + api |
| [ISSUE-29](COMPLETED_UAT_ISSUES.md#issue-29) | ✅ Resolved | 🟠 | Temporarily block public browse + public registration; keep both invite paths working | frontend + api |
| [ISSUE-30](COMPLETED_UAT_ISSUES.md#issue-30) | ✅ Resolved | 🔴 | `/tournament/:id` redirects to a **literal** unsubstituted path — group launch's payoff step is broken | frontend |
| [ISSUE-31](COMPLETED_UAT_ISSUES.md#issue-31) | ✅ Resolved | 🔴 | A group-launched casual tournament **never generates matches** — there is nothing to play | api |

---

## ISSUE-27 — Dark entry vs light app: document the boundary, replace the emoji icons 🟡 {#issue-27}

*Raised during the 2026-07-26 local walkthrough — a design decision, not a defect.*

### Symptom

Navigating from Login into the app reads as moving between two products. The auth pages
(Login/Signup/ForgotPassword/ResetPassword) use a **dark navy gradient with glass-morphism panels**,
34px display headings and inline SVG ornament. The hub pages (`/standings`, `/matches`, `/groups`,
`/notifications`) are **flat and light** — `--ink-50` surfaces, plain bordered boxes, and **emoji tab
icons** (🏆 📊 🎾 👥 🔔) in the bottom nav.

### This is not a theming failure — verified

Both families use the same design tokens. Measured across all four hub pages: one font family
throughout (Plus Jakarta Sans), surface `rgb(240,243,248)` = `--ink-50`, text `rgb(15,27,46)` =
`--ink-900` and `rgb(69,83,105)` = `--ink-600`, accent `rgb(46,138,212)` = court blue. All four sit
correctly inside `.responsive-container` → `.responsive-main` with `.responsive-bottom-nav` present.
The absent header bar is also correct — `responsive.css:107-108` hides `.responsive-header` on mobile
by design and reveals it at the tablet breakpoint.

So the split is a deliberate-looking aesthetic difference between two generations of screens, not
drift in the token system. **Do not "fix" this by editing tokens.**

### Reframed 2026-07-27 — the split is intentional, and the real defect is smaller

**This issue was originally written as accidental drift. That was wrong.** Landing's computed
background is byte-identical to Login's:

```
Landing  linear-gradient(rgb(31, 45, 78) 0%, rgb(15, 27, 46) 100%)
Login    linear-gradient(rgb(31, 45, 78) 0%, rgb(15, 27, 46) 100%)
```

So the boundary is not "auth pages diverge from the app" — it is **the entire pre-login funnel
(Landing + all four auth pages) is dark, and the authenticated app is light**. A dark entry and a
light workspace is a deliberate, common pattern. **Owner confirmed 2026-07-27: intentional, keep it.**

Rejected: extending dark/glass into the app (every authenticated screen plus contrast work on dense
standings/bracket tables), and flattening the entry pages (discards the most finished-looking art in
the product, where distinctiveness pays most).

### Scope — two things

**1. Write the boundary down as a rule.** It currently exists only as a coincidence of which files
were built when. Record it where frontend work will actually meet it (§9 of `rac8-4s-HL.md` or the
design spec): *pre-login surfaces use the dark/glass treatment; authenticated surfaces use the flat
`--ink-*` palette.* Without this, the next new page picks a side at random and the pattern decays
into the drift this issue originally described.

**2. Replace the emoji icons with a real icon set** — the one genuinely dated element, and the only
actual defect here. Emoji are load-bearing UI in four places:

| Location | Emoji |
|---|---|
| Bottom nav (`ResponsiveLayout.tsx:139,142,143`, + inline Groups/Notifications) | 🏆 📊 🎾 👥 🔔 |
| "More" menu (`ResponsiveLayout.tsx:33-36`) | 👤 🏟️ ⚙️ ℹ️ |
| Guest sign-in entry | 🔑 |
| Tournament detail tabs (`TournamentDetail/index.tsx:77-79`) | 📊 🎾 🏆 |

Emoji render differently on every platform, cannot be recoloured to match the active/inactive
palette, and are the reason the nav reads as unfinished next to the auth pages.

**Approach — hand-rolled components, paths sourced from Lucide or Feather** *(settled 2026-07-27)*.
One small component per icon under `components/shared/icons/`, taking `size` and `color` props,
following `LogoMark.tsx`. Verified there is **no icon library installed**, and inline SVG is already
the house pattern — eight shared components hand-roll `<svg>`. Using `currentColor` gives the
active/inactive theming that emoji structurally cannot.

⚠ **Licensing: hand-rolled is not automatically licence-free.** Retyping a `d` attribute copied from
a commercial set does not change its licence. Source paths only from permissive sets — Lucide (ISC),
Feather / Heroicons / Phosphor (MIT), Material Symbols (Apache-2.0); none require attribution.
**Avoid Font Awesome** — its free tier is CC BY 4.0 and *does* require visible attribution, and Pro
is paid. `react-icons` is MIT as a wrapper but you inherit each bundled set's own licence.
*(Licences stated 2026-07-27; re-check at implementation time.)*

**Sequence after [ISSUE-28](COMPLETED_UAT_ISSUES.md#issue-28)**, which cuts the nav from six items to four and renames two.
Drawing icons for tabs that are about to be deleted is wasted work.

**No test risk:** §8's e2e convention already forbids selecting on emoji (`data-testid` and
`e2e/config.ts` constants only), so the specs should not notice this change. If one breaks, it was
violating that rule.

### Fix — TDD (CLAUDE.md §4)

Part 1 (the boundary rule) is documentation and has no test — say so rather than inventing one.

Part 2 (icons) is a component change, so it does:

**Red:** assert each nav item renders an accessible icon element (not a text node) and that the
active/inactive states are distinguishable by the icon's own colour, which is the thing emoji cannot
do. `ResponsiveLayout.guestNav.spec.tsx` is the existing harness to extend.

**Green:** swap the icons. Keep every `data-testid` and `aria-label` byte-identical — the emoji sit
inside `aria-hidden="true"` spans today (`ResponsiveLayout.tsx:~195`), and the accessible name comes
from the label text and `aria-label`, so the a11y surface must not move.

### Verify

```bash
SCRATCH=/tmp
npm --workspace=packages/frontend exec -- jest \
  --findRelatedTests packages/frontend/src/components/shared/ResponsiveLayout.tsx \
  --bail > "$SCRATCH/fe.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/fe.log" | head -40

npx playwright test accessibility mobile --project=chromium --reporter=line --max-failures=1
```

`accessibility.spec.ts` matters here specifically: replacing emoji with SVG is the change most likely
to drop an accessible name without any visual sign.

Visual check at 360 / 400 / 1024 via `node scripts/inspect-route.mjs`, and confirm the unread badges
on Groups and Notifications still position correctly — they are absolutely positioned against the
emoji span (`ResponsiveLayout.tsx:~197,~215`), so the replacement must preserve that anchor.

---

## Not yet triaged / follow-ups

- **SSE `/tournaments/:id/events` returns 403 on every tournament page** — observed live 2026-07-27
  on a group-launched casual tournament while signed in as a registered participant. Real-time
  updates are therefore dead on those pages. Not yet triaged: it may be a consequence of
  [ISSUE-31](COMPLETED_UAT_ISSUES.md#issue-31) (no groups exist, so there may be nothing to subscribe to) rather than an
  auth defect in its own right. **Re-check after ISSUE-31 lands** before filing it separately.
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
- Deliverability: UAT SES mail lands in Gmail **spam** (DMARC can't align from a
  `gmail.com` sender) — a known, owner-accepted trade-off, tracked in
  `UAT_PWA_LAUNCH.md` P0.6-SES, not a bug. The real fix is a verified domain (§2).
