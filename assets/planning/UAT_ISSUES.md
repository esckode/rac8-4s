# UAT Issues — found during the 2026-07-20/21 AWS deploy session

Running tracker for defects surfaced while standing up and testing the first UAT
deploy (CloudFront `d37ruxd1gf48ip.cloudfront.net`, since torn down). Each issue is
scoped for a Sonnet implementer: symptom → verified root cause (`file:line`) → fix →
verify. Follow `CLAUDE.md` throughout — TDD (§4), one logical change per commit and
branch-per-issue (§11), surgical edits (§3). **Read the referenced code before editing;
several fixes have a "do NOT" note because the obvious approach is wrong.**

Severity: 🔴 blocks a user-facing feature · 🟠 real defect, limited blast radius · 🟡 robustness.

**ISSUE-1 – ISSUE-21 are all resolved and have been moved, index and bodies, to
[`COMPLETED_UAT_ISSUES.md`](./COMPLETED_UAT_ISSUES.md)** (CLAUDE.md §12 — working the open queue
shouldn't cost a read of every closed issue). This file carries only open work. Number new issues
from where the archive ends.

| # | Status | Severity | Title | Area |
|---|---|---|---|---|
| [ISSUE-22](#issue-22) | 🔲 Open | 🟡 | Login greets guests with "Welcome back."; page titles/descriptions end in full stops | frontend · copy |
| [ISSUE-23](#issue-23) | 🔲 Open | 🟠 | Auth pages hardcode a 390×844 phone frame — clipped below 390, gutters above | frontend · layout |
| [ISSUE-24](#issue-24) | 🔲 Open | 🟡→🟠 | An account with no linked player gets `TOKEN_INVALID` + "sign in again" — an unbreakable loop (🟡 today, 🟠 once organizers can be created) | api + frontend |
| [ISSUE-25](#issue-25) | 🔲 Open | 🟡 | `seed-test-accounts.ts` creates accounts with no linked player — every seeded login hits ISSUE-24 | scripts · dev |
| [ISSUE-26](#issue-26) | 🔲 Open | 🟠 | Bottom nav labels clip off-screen at every phone width (6 items don't fit under ~444px) | frontend · layout |
| [ISSUE-27](#issue-27) | 🔲 Open | 🟡 | Dark entry vs light app is intentional — document the boundary; replace the emoji icons | frontend · design |
| [ISSUE-28](#issue-28) | 🔲 Open | 🟠 | Nav: collapse Standings + Matches into one "Play" hub; four items | frontend + api |
| [ISSUE-29](#issue-29) | 🔲 Open | 🟠 | Temporarily block public browse + public registration; keep both invite paths working | frontend + api |
| [ISSUE-30](#issue-30) | 🔲 Open | 🔴 | `/tournament/:id` redirects to a **literal** unsubstituted path — group launch's payoff step is broken | frontend |
| [ISSUE-31](#issue-31) | 🔲 Open | 🔴 | A group-launched casual tournament **never generates matches** — there is nothing to play | api |

---

## ISSUE-22 — Login greets guests with "Welcome back."; page titles/descriptions end in full stops 🟡 {#issue-22}

*Found during the 2026-07-26 local walkthrough.*

### Symptom

From Browse (signed out), the guest nav item **"Sign in / Register"**
(`packages/frontend/src/components/shared/ResponsiveLayout.tsx:188`) leads to `/login`, whose
headline reads **"Welcome back."** Two defects in one line:

1. **The greeting is wrong for half its audience.** That nav item renders *only* for signed-out
   users, and it is the app's single entry point to signup — the secondary CTA on the page is
   "Create an account" → `/signup` (`Login.tsx:498,511`). A first-time visitor is therefore
   greeted as a returning one. It also misreads for a guest who was already browsing the app: it
   implies they left and came back, when they never authenticated in the first place.
2. **The trailing full stop is off-convention.** Page titles and descriptions across the app are
   inconsistently punctuated — `Signup.tsx` has none ("Create account" / "Join the tournament"),
   every other auth page has them.

### Owner's decision (2026-07-26)

- Login headline becomes **"Sign in"** — it matches the nav item that leads there and the primary
  button on the page ("Sign In", `Login.tsx:459`), and gives the two auth pages one voice
  (Signup's headline is already the task name, not a greeting). The register half needs no
  headline support; the "Create an account" button already carries it.
- **Page titles and descriptions take no trailing full stop, app-wide, with no exceptions** —
  including the Landing hero tagline. A uniform rule beats a rule plus a remembered exception.
- Scope is *titles and descriptions only*. **Body paragraphs, error messages and toasts keep their
  sentence punctuation** — e.g. `OrganizerManage.tsx:24` `"That action isn't allowed from the
  current state."` is correct as-is and must not be swept.

### Root cause

No shared page-header component exists — every page hand-rolls its title as a styled `<div>` (or
`<h1>`), so there is nothing to enforce a convention and nothing that ever asserted one. Full
inventory of affected sites (verified 2026-07-26):

| File | Line | Current | Becomes |
|---|---|---|---|
| `pages/Login.tsx` | 196 | `Welcome back.` | `Sign in` |
| `pages/Login.tsx` | 199 | `Sign in to see your matches, standings, and tonight's tournaments.` | `See your matches, standings, and tonight's tournaments` |
| `pages/ForgotPassword.tsx` | 187 | `✓ Code sent.` | `✓ Code sent` |
| `pages/ForgotPassword.tsx` | 190 | `We've sent a 6-digit code to your email address.` | *(drop the period)* |
| `pages/ForgotPassword.tsx` | 347 | `Reset your password.` | `Reset your password` |
| `pages/ForgotPassword.tsx` | 350 | `Enter your email address and we'll send you a code to reset your password.` | *(drop the period)* |
| `pages/ResetPassword.tsx` | 314 | `Password updated.` | `Password updated` |
| `pages/ResetPassword.tsx` | 434 | `Reset your password.` | `Reset your password` |
| `pages/ResetPassword.tsx` | 437 | `Enter the code we sent to your email and choose a new password.` | *(drop the period)* |
| `pages/Landing.tsx` | 46 | `See you at the court.` | `See you at the court` |
| `pages/Landing.tsx` | 51 | `Find drop-in nights, …— all on the sideline.` | *(drop the period)* |
| `pages/Landing.tsx` | 74 | `New here? An account creates itself when you join your first night.` | *(drop the period; the internal `?` stays)* |
| `pages/DesignSpec.tsx` | 82, 85, 95 | mirrors Landing | mirror the Landing changes |

The Login subhead is also **reworded**, not just de-punctuated: with the headline now "Sign in",
"Sign in to see your matches…" repeats the verb.

**Do NOT change `ResetPassword.tsx:317`** — `"Your password has been successfully reset.
Redirecting to login..."` ends in an ellipsis, not a full stop, and its internal period separates
two real sentences. It is already compliant.

**`Signup.tsx` needs no edit** — "Create account" / "Join the tournament" are already clean. Read
it first; it is the reference for what the other pages should look like.

**`DesignSpec.tsx` is imported by nothing** (no route, no test, no other module). It is dead code
kept in sync with Landing by hand. Sweep it for consistency as decided above, but **do not delete
it** — see the follow-up below.

### Fix — TDD (CLAUDE.md §4, commit red separately per §11)

**Red commit — tests first, confirm they fail for the right reason:**

1. `packages/frontend/src/pages/__tests__/Landing.spec.tsx:33` and `:113` assert
   `screen.getByText('See you at the court.')` **verbatim, with the period**. Update both to the
   new string. These are the only existing assertions that break — nothing else in
   `packages/frontend/src/__tests__`, `packages/frontend/e2e`, or `docs/assistant-help.md`
   references any of this copy (verified by grep).
2. Add `packages/frontend/src/pages/__tests__/page-copy-convention.spec.tsx` — the durable guard,
   without which this silently regresses on the next page anyone writes. Render Login, Signup,
   ForgotPassword, ResetPassword and Landing; assert each rendered title and description does not
   match `/\.$/`. `Landing.spec.tsx` is the pattern to copy for the render harness
   (`BrowserRouter` wrapper + `jest.mock('../../hooks/useAuth')`).
   - **The two success-state strings are behind a state flag** — `ForgotPassword.tsx:187` renders
     only after a code is sent, `ResetPassword.tsx:314` only after a successful reset. Drive the
     component into that state in the test. **Do not quietly drop them from the spec** because the
     initial render doesn't show them; they are exactly the strings most likely to drift back.
3. Run and *read the failures* (§4): expect the two Landing assertions to fail on the string
   mismatch and every convention assertion to fail on the trailing `.` — not on a bad import or a
   suite that never ran.

**Green commit — apply the table above.** Pure string edits; no logic, no styling, no structural
changes.

### Verify

```bash
SCRATCH=/tmp   # or the session scratchpad
npm --workspace=packages/frontend exec -- jest \
  --findRelatedTests $(git diff --name-only main...HEAD -- 'packages/frontend/src/**') \
  --bail > "$SCRATCH/run.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/run.log" | head -40
```

- **No new e2e spec, and no new row in `e2e-scenarios.md`.** This is a deliberate, stated deviation
  from §4's "unit *and* e2e": no Playwright spec asserts any of this copy today, and a copy
  convention is fully exercised by the RTL render — a browser round-trip would add cost and no
  signal. The §11 e2e selection map yields nothing for a string-only change.
- **`docs/assistant-help.md` needs no update** (§9) — checked; it never quotes these headings, and
  punctuation on a page title is not behavior the assistant explains.
- Confirm visually at `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/` — the Login
  headline must not wrap: "Sign in" at `fontSize: 34` fits one line at a 400px viewport, which
  "Sign in or create an account" would not have.

---

## ISSUE-23 — Auth pages hardcode a 390×844 phone frame 🟠 {#issue-23}

*Found during the 2026-07-26 local walkthrough. All geometry below was **measured**, not inferred —
via `scripts/inspect-route.mjs` (see "Tooling" at the end).*

### Symptom

The sign-in page is visibly narrower than the rest of the app, with white borders down both sides.
At a 400px-wide window the page container measures **390px with 5px of white each side**, while
Landing/Browse fill the window. The white is the page background showing through — `<html>` and
`<body>` have no background of their own (computed `rgba(0, 0, 0, 0)`).

That is the mild end. Measured at other widths:

| Viewport | Container | Result |
|---|---|---|
| 360 × 740 | 390 wide at `margin: 0 -30px 0 0` | **30px hangs off the right and is clipped** — the logo is sliced in half, "Forgot password?" and the show-password toggle are cut. Not scrollable. |
| 400 × 760 | 390, 5px gutters | what the owner reported |
| 1024 × 900 | 390 centred, 317px gutters | a phone-shaped column in a white field; the gradient also stops dead at 844px, leaving a white strip below |

**The clipping is silent** because `responsive.css:241-244` sets `html, body { overflow-x: hidden }`
globally. That rule is correct on its own — but it converts this overflow into invisible clipping
rather than a horizontal scrollbar, so nothing surfaces the 30px the user can never reach.

### Root cause

Seven container blocks hardcode the iPhone 12/13/14 logical viewport, inline:

| File | Line | Size |
|---|---|---|
| `pages/Login.tsx` | 117 | 390 × 844 |
| `pages/Signup.tsx` | 199 | 390 × 844 |
| `pages/ForgotPassword.tsx` | 107, 269 | 390 × 844 (two states) |
| `pages/ResetPassword.tsx` | 225, 355 | 390 × 844 (two states) |
| `pages/DobScreen.tsx` | 61 | 390 wide, `minHeight: 400` (width bug only) |

This is a design-mockup frame that shipped — the same family of artifact as
[ISSUE-5](COMPLETED_UAT_ISSUES.md#issue-5) (the fake `9:41` iOS status bar), on the same pages.

**These pages are the only ones outside the responsive system.** `ResponsiveLayout` wraps every
authenticated route; the five auth routes (`App.tsx:57-60`) plus `Landing` (:51) and `PrivacyPolicy`
(:54) are unwrapped. Landing is fluid anyway because it uses Tailwind classes — which is exactly why
the seam is visible when you navigate from Browse into Login.

**Scope is confirmed closed — the other unwrapped routes are already correct** (measured 2026-07-26,
360px and 440px). `App.tsx` leaves eight routes outside `ResponsiveLayout`, but only the auth pages
carry the frame. `/privacy` (Tailwind `max-w-2xl`), `/tournament/:id/browse` (`maxWidth: 560`),
`/tournament/:id/join` (`maxWidth: 480`), `/tournament/:id/partner-invite` and `/groups/:id/invite`
(both `width: '100%'` + `maxWidth: 420`) all measured full-viewport width at x=0 with
`scrollWidth === viewport` — no gutters, no overflow. `/signout` redirects to `/` and renders nothing
of its own. **Do not widen this issue to those files.** Note that `InviteAcceptPage.tsx:102-103`
already uses `width: '100%'` + `maxWidth` — the pattern this issue prescribes — which is evidence the
390×844 frame is an anomaly on the auth pages rather than a house style. *(Caveat: the two invite
pages were measured in their error state, no valid token being available; the 420-capped card was
present in that state, so the shell is shared, but the success state is unmeasured.)*

**Why no test caught it — read this before writing the guard.** `e2e/mobile.spec.ts:18` declares
`const MOBILE = { width: 390, height: 844 }`. The suite tests at *precisely* the hardcoded frame, so
the bug cannot manifest. Worse, its overflow assertion (`mobile.spec.ts:142`) is
`expect(bodyWidth).toBeLessThanOrEqual(viewportWidth * 2)` reading `document.body.scrollWidth` —
which the global `overflow-x: hidden` clamps to the viewport, making that assertion close to
unfalsifiable for this bug class. **A guard that measures `body.scrollWidth` will pass on broken
code.** Measure the container's own `boundingBox()`.

### Owner's decisions (2026-07-26)

1. **Fluid, not measured.** A JS "detect the screen at startup and lock it" approach was considered
   and rejected: it reproduces this bug app-wide. If the viewport is stable, `width: 100%` computes
   to the identical pixels with no code; if it isn't, `width: 100%` is correct and a locked value is
   broken. There is no case where locking wins.
2. **No manifest or viewport-meta changes.** Locking `orientation: 'portrait'` was considered and
   rejected — it is a WCAG 2.1 AA failure (SC 1.3.4 Orientation), landscape is genuinely useful for
   brackets and standings, and it would not deliver stability anyway (keyboard, accessibility text
   scaling and device-to-device variation are untouched by it). `interactive-widget=` is likewise
   out of scope: test it on real devices *after* the layout is fluid, not blind.
3. **No pixel cap tuned to phone widths.** A `max-width: 448` constant was measured and rejected:
   the phone band keeps moving (375 → 390 → 414 → 430 → ~440 on iPhone 16 Pro Max) so any such
   constant has a shelf life. **Use the 640px breakpoint `responsive.css` already switches the nav
   at**, so "mobile" means one thing app-wide and any future phone stays below it.
4. **448 survives, demoted** — no longer "the width of a phone" but "how wide a form column should
   be on a large screen". It is the number the codebase already uses (`responsive.css:691`
   `.max-w-md`, and `.responsive-modal` above 640).
5. **The blob SVGs need a decision** (see below) — surfaced by the measurement, not pre-existing.

### Fix — what changes

**A CSS class, not seven edited style objects.** Inline React styles cannot express a media query,
and routing the contract through one stylesheet rule is the point — it gives "how wide is the app"
a single definition and finally puts these pages inside the same system as everything else.

Add to `packages/frontend/src/styles/responsive.css`:

```css
.auth-shell {
  width: 100%;
  min-height: 100dvh;
}

@media (min-width: 640px) {
  .auth-shell {
    max-width: 448px;
    margin: 0 auto;
  }
}
```

Apply `className="auth-shell"` to all seven containers and **delete `width` / `height` /
`margin: '0 auto'` from their inline style objects**. Inline styles beat a stylesheet rule on
specificity, so leaving them in place silently defeats the whole fix.

Measured with exactly this class on `Login.tsx`:

```
 360px → container  360px  gutter    0px      639px → container  639px  gutter    0px
 390px → container  390px  gutter    0px      640px → container  448px  gutter   96px
 412px → container  412px  gutter    0px      674px → container  448px  gutter  113px
 440px → container  440px  gutter    0px      768px → container  448px  gutter  160px
 500px → container  500px  gutter    0px     1024px → container  448px  gutter  288px
```

Height filled the viewport at every width; `scrollWidth` equalled the viewport everywhere. The
boundary is exact at 639/640. A foldable unfolded (~674) correctly gets the column.

**`overflow: hidden` stays.** It clips the decorative blobs, and measurement confirmed it does *not*
start eating content once the height is fluid — at 360×640, 360×740, 400×760 and 1024×900,
`scrollHeight === clientHeight` and the footer settled 32px above the bottom every time. The flex
column absorbs the height change on its own.

**Do NOT touch `responsive.css:241-244` (`html, body { overflow-x: hidden }`).** It is a correct
defensive rule; it only *masked* this bug. Removing it would trade silent clipping for a stray
horizontal scrollbar app-wide and fix nothing.

**The blob SVGs — `preserveAspectRatio="xMidYMid slice"`** *(settled 2026-07-27)*. Each container
holds a decorative `<svg viewBox="0 0 390 844" preserveAspectRatio="none">` authored to stretch to
the fixed frame; once the shell is fluid the circles smear into visible ellipses at the widest
full-bleed size (639px, screenshotted). Change the attribute in all seven blocks:

```diff
- preserveAspectRatio="none"
+ preserveAspectRatio="xMidYMid slice"
```

Circles then stay circular, scale to cover, and crop at whichever edge overflows. **Deliberately the
minimal fix** — CSS radial-gradients were considered and rejected for now because
[ISSUE-27](#issue-27) may redo this surface entirely, and rewriting decoration that might be
discarded is wasted work. The `viewBox` survives, but demoted: it describes the *artwork*, while
`.auth-shell` owns the *layout*. That separation is the actual requirement.

### Fix — TDD (CLAUDE.md §4, commit red separately per §11)

**The guard must be Playwright, not RTL — this is a deliberate, reasoned deviation.** §4 asks for
unit *and* e2e; here jsdom cannot contribute. It reports zero geometry for every element
(`getBoundingClientRect()` returns all-zeros, and it evaluates no media queries), so an RTL test can
only assert that a class name is present — which would pass against a broken stylesheet and is worse
than no test, because it looks like coverage. Playwright measures real layout in a real engine.

**Red commit:**

1. Add `packages/frontend/e2e/auth-layout.spec.ts` asserting, for `/login`, `/signup`,
   `/forgot-password` and `/reset-password`, via the shell's `boundingBox()` — **not**
   `body.scrollWidth`, per the root-cause note:
   - at **360×740**: container width `=== 360`, `x === 0` (today: 390 at x 0 with a -30px right
     margin → fails);
   - at **440×880**: container width `=== 440`, `x === 0` (today: 390 → fails);
   - at **1024×900**: container width `=== 448`, horizontally centred (today: 390 → fails);
   - at every width: no content clipped — assert the footer link ("Create an account" on Login) has
     a `boundingBox()` fully inside the viewport.
   The shell needs a stable hook; add `data-testid="auth-shell"` and register it in `e2e/config.ts`
   like the other 39 specs, rather than selecting on `.auth-shell`.
2. **Add the selection-map row in the same commit** (§8 — the map is worthless once it drifts):
   `| **Auth page layout (responsive shell)** | 4 | `auth-layout.spec.ts` | `npx playwright test auth-layout` |`
   in `e2e-scenarios.md` §"Test Organization".
3. Run it and *read the failures* (§4) — expect width mismatches (390 where 360/440/448 is
   asserted), not a missing testid or a spec that never ran.

**Green commit:** add the class, apply it to the seven containers, strip the inline dimensions,
resolve the SVG decision.

**Consider in the same branch (not required):** widen `mobile.spec.ts:18` off 390×844, or note there
that `auth-layout.spec.ts` now owns non-390 widths. Left as a judgement call so this issue does not
grow a second spec's worth of scope — but a suite that only ever tests the one size that hides the
bug is the reason this shipped.

### Verify

```bash
SCRATCH=/tmp   # or the session scratchpad
npx playwright test auth-layout --project=chromium --reporter=line --max-failures=1
npm --workspace=packages/frontend exec -- jest \
  --findRelatedTests $(git diff --name-only main...HEAD -- 'packages/frontend/src/**') \
  --bail > "$SCRATCH/run.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/run.log" | head -40
```

Also run `auth.spec.ts` and `login-rate-limit.spec.ts` (both drive these pages), and
`mobile.spec.ts` and `accessibility.spec.ts` (both make geometry assertions).

Visual check at `/login`, `/signup`, `/forgot-password`, `/reset-password` — 360 / 440 / 640 / 1024.

### Tooling

`scripts/inspect-route.mjs` (untracked, session-local — the generalised `diag-nav.mjs`) produced
every number above:

```bash
node scripts/inspect-route.mjs /login --width=440 --height=880 --depth=3
node scripts/inspect-route.mjs /login / --width=400 --shot=/tmp/login.png
```

It walks `body` → widest child at each level and dumps each box's width/x/margin/max-width, so the
element introducing a gutter is immediately obvious. Use it to re-measure rather than eyeballing
screenshots.

---

## ISSUE-24 — An account with no linked player gets `TOKEN_INVALID` + "sign in again" 🟠 {#issue-24}

*Found during the 2026-07-26 local walkthrough.*

### Symptom

Signed in with a valid account, every player-scoped page fails: `/standings` and `/matches` show
"Failed to load your tournaments", `/notifications` shows "Failed to load notifications", `/groups`
shows **"You need to sign in again."** with a Sign in button.

**Signing in again cannot fix it.** The token is valid and the session is real — measured against a
live login as `player@test.com`:

```
GET /api/auth/me        → 200   (token valid; body includes "playerId": null)
GET /player/tournaments → 401   {"code":"TOKEN_INVALID", ...}
GET /player/groups      → 401   {"code":"TOKEN_INVALID", ...}
```

So the user is told their session expired, sent to re-authenticate, and lands right back in the same
state — indefinitely.

### Root cause

`packages/api/src/routes/player.ts:16-30`, `resolvePlayerId()`. It tries the guest magic-link session
first, then falls back to the account JWT:

```ts
const session = await requirePlayerSessionAuth(authHeader, deps.tokenStore)  // throws for account JWTs
return session.playerId
// …fallback:
if (account.playerId) { return account.playerId }
```

When the account resolves but `account.playerId` is **null**, neither branch returns, and what
propagates is the *session* path's error — `TOKEN_INVALID`. The dual-auth shim itself is correct;
the failure mode is that "this account has no linked player identity" is reported using the error
code for "your token is bad." The frontend then renders its generic re-authentication prompt,
because that is the correct response to `TOKEN_INVALID` — it is being told the wrong thing.

**⚠ The same bug exists in a second resolver** (`tournaments.ts:175`, `resolveTournamentPlayer`) —
found 2026-07-27, and easy to miss because the issue originally named only `player.ts`:

```ts
if (!account.playerId) {
  throw sessionErr        // rethrows the SESSION error → TOKEN_INVALID
}
```

**Fix both resolvers.** Fixing only `player.ts` makes `/player/*` correct while every tournament-
scoped route keeps looping, and the tests would still pass.

**Two defects, fix both layers:** the wrong error code in the API, and a frontend prompt that offers
an action which provably cannot resolve the state.

**The frontend copy lives in five places**, not one — all must be handled, or the loop simply
reappears elsewhere:

| File | Line |
|---|---|
| `pages/MyGroups.tsx` | 152 |
| `pages/PartnerRequestConfirm.tsx` | 38 |
| `components/ScoreSubmitForm.tsx` | 84 |
| `components/PartnerFinder.tsx` | 86, 104 |

Each currently says some variant of "You need to sign in again". They are correct responses to a
genuine `TOKEN_INVALID`; they must stay correct for that case and only change behaviour for the new
code.

### Reachability — verify this FIRST, it sets the severity

In production the only account-creation path is signup (`auth.ts:168`), which links a durable player
immediately before it (`auth.ts:143-153`, `findOrCreatePlayerByEmail`). So a normally-signed-up
player cannot reach this. The other three `accountRepo.create` call sites are all scripts —
`seed-test-accounts.ts:35`, `seed-admin.ts:45`, `seed-tournaments.ts:105`.

**Resolved 2026-07-27 by the organizer-tier grill** (`MONETIZATION_DESIGN.md` §7.1). `auth.ts:168`
hardcodes role `'player'`, so organizers cannot be created through signup — and **no other
production path exists**, so today this is unreachable outside seed data. That makes it **🟡 in
practice right now**.

**But it becomes 🟠 the moment the organizer-grant route is built**, which the beta requires. An
organizer who signs in and taps Standings or Matches — both in the bottom nav for any authenticated
user — lands straight in this loop. `organizer@test.com` reproduces it today.

**Therefore: fix this before or alongside the organizer-grant route, never after.** The grill's O4
already commits to the shape that prevents it — every account is always a player, with organizer
layered on top rather than an exclusive role — so building the grant route on the current exclusive
`role` column would ship this defect deliberately.

*(Verified 2026-07-27: real signup does populate `playerId` — a live `POST /api/auth/signup` returned
one — confirming the null-`player_id` accounts come from seeding, not from any user-reachable flow.
See [ISSUE-25](#issue-25).)*

### Fix — TDD (CLAUDE.md §4, commit red separately per §11)

**Red:** an integration test in `packages/api/src/__tests__` asserting that an account JWT whose
`playerId` is null gets a **distinct, accurate** error from `/player/tournaments` — not
`TOKEN_INVALID`. Add a frontend test that this new code renders a message which does *not* offer
re-authentication as the remedy.

**Green:** give **both** `resolvePlayerId` (`player.ts:16-30`) and `resolveTournamentPlayer`
(`tournaments.ts:175`) an explicit branch for "authenticated, but no linked player", returning
**`403 PLAYER_NOT_LINKED`** — that is the decided code, not a suggestion. Map it in the frontend at
all five copy sites listed above.

**The copy — one shared constant, reused at all five sites** *(settled 2026-07-27)*:

> **This account isn't set up to play yet.**

Deliberately **no "contact support" clause**: verified 2026-07-27 that the app has *no* support
destination anywhere — no `mailto:`, no `support@`, no `/support` route — so the phrase would point
nowhere. (`ServiceUnavailable.tsx:14` already makes that empty promise; see the follow-up.)

One string, not five variants: all five sites describe the same underlying state, so per-context
wording would add words without adding information. Note this is a body/error message, so per
[ISSUE-22](#issue-22) it **keeps** its full stop — that convention covers titles and descriptions
only.

**Do NOT fix this by having either resolver auto-create a player record** — that silently mints
identities from any authenticated request and bypasses the age-attestation path in `auth.ts:143-153`.

**Do NOT change the existing `TOKEN_INVALID` copy for real token failures.** Those five messages are
correct when the token genuinely is invalid; only the new code gets new copy.

Per §9, any user-visible message change here must update `docs/assistant-help.md` in the same change.

### Verify

```bash
SCRATCH=/tmp   # or the session scratchpad
npm --workspace=packages/api exec -- jest \
  --findRelatedTests $(git diff --name-only main...HEAD -- 'packages/api/src/**') \
  --bail > "$SCRATCH/api.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/api.log" | head -40

npm --workspace=packages/frontend exec -- jest \
  --findRelatedTests $(git diff --name-only main...HEAD -- 'packages/frontend/src/**') \
  --bail > "$SCRATCH/fe.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/fe.log" | head -40
```

**Expect the api selection to be wide** — §11 warns that api specs import the express app, so
touching a route resolver pulls in most of the suite. That is the correct answer, not a slow one.

E2E, by the five copy sites (§11 — selection is by user-facing flow):
`npx playwright test partner-requests player-groups group-stage-singles-score --project=chromium --reporter=line --max-failures=1`

**Manual check that the loop is actually gone:** sign in as `organizer@test.com` / `testpass123`
(unlinked by construction, see [ISSUE-25](#issue-25)) and open `/groups` — it must explain the real
problem, not offer a Sign in button.

---

## ISSUE-25 — `seed-test-accounts.ts` creates accounts with no linked player 🟡 {#issue-25}

*Found during the 2026-07-26 local walkthrough.*

### Symptom

The documented dev credentials (`organizer@test.com` / `player@test.com`, both `testpass123`)
authenticate fine but cannot load a single player-scoped page — they hit
[ISSUE-24](#issue-24) on `/standings`, `/matches`, `/groups` and `/notifications`. Anyone doing a UAT
walkthrough with the seeded accounts sees four broken pages and reasonably concludes the pages
themselves are broken.

### Root cause

`packages/api/scripts/seed-test-accounts.ts:35` calls `accountRepo.create(...)` directly and never
creates or links a durable player. Real signup does both — `auth.ts:143-153` calls
`findOrCreatePlayerByEmail` *before* `accountRepo.create` at :168. The seed therefore produces an
account shape that the signup flow can never produce.

Confirmed in the dev DB: both seeded accounts exist and are `active`, and `/api/auth/me` reports
`"playerId": null` for them.

### Fix

Mirror the signup sequence in the seeder: `findOrCreatePlayerByEmail` first, then create the account
linked to that player. `seed-admin.ts:45` and `seed-tournaments.ts:105` have the same shape — check
whether they need it too (an admin may legitimately have no player identity; an organizer who is
expected to browse Standings does not).

**The seeder is idempotent by skipping accounts that already exist** (`seed-test-accounts.ts:27-30`),
so it will *not* repair the two accounts already in a developer's DB. Either delete them first or
give the script a repair path — otherwise the fix appears to do nothing on the machine that reported
the bug.

### Verify

```bash
npm run seed:accounts --workspace=packages/api
curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"player@test.com","password":"testpass123"}' | grep -o '"token":"[^"]*"' | head -c 40
# then, with that token:
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOK" \
  http://localhost:3001/player/tournaments     # must be 200, not 401
```

---

## ISSUE-26 — Bottom nav labels clip off-screen at every phone width 🟠 {#issue-26}

*Found during the 2026-07-26 local walkthrough. Geometry measured, not eyeballed.*

### Symptom

The bottom tab bar carries **six** items — Tournaments, Standings, Matches, Groups, Notifications,
More — and the first label is cut off the left edge of the screen on every phone. Measured on
`/standings` at three widths:

| Viewport | Cell width | "Tournaments" rendered box | Result |
|---|---|---|---|
| 360 | 60px | starts at **x = -7** | leading "T" off-screen |
| 400 | 67px | starts at **x = -4** | leading "T" off-screen |
| 430 | 72px | starts at **x = -1** | still clipping |

**Corrected 2026-07-26 — the first numbers here were too generous.** The table above measures the
*rendered, already-squeezed* label boxes. Measuring each label's **natural single-line width** in the
nav's own computed font gives the real requirement:

| Label | Natural width | Fits a 60px cell? |
|---|---|---|
| Tournaments | **99px** | no (+39) |
| Notifications | **98px** | no (+38) |
| Standings | 77px | no (+17) |
| Matches | 66px | no (+6) |
| Groups | 58px | yes |
| More | 40px | yes |

**The constraint:** six equal cells need ≥ 99px each, i.e. a **~594px viewport** — not the ~444px
first recorded here. **Four of the six labels overflow today, not two.** The practical consequence
changes with it: shortening one or two labels *cannot* rescue a six-item bar on any phone. The item
count has to come down, which is why the fix now lives in [ISSUE-28](#issue-28) — which, combined
with [ISSUE-29](#issue-29) removing Browse, lands on **four items at 90px cells against a 58px worst
case**. That is 32px of slack, so the geometry stops being marginal rather than merely passing.

It is invisible in CI for the same reason ISSUE-23 was — `e2e/mobile.spec.ts:18` pins the viewport to
390×844, and the clipped label is still *rendered*, just positioned off-screen, so no text assertion
notices.

### Root cause

`.responsive-bottom-nav-item` (`responsive.css:27`) divides the bar into equal cells with no
provision for a label wider than its cell. The labels are plain text with no truncation, wrapping, or
minimum-width handling, so they overflow and the global `html, body { overflow-x: hidden }`
(`responsive.css:241-244`) silently clips the overflow — the same masking mechanism as ISSUE-23.

### Fix

**The label geometry is fixed by [ISSUE-28](#issue-28)**, which takes the bar from six items to five
and renames the two overlong labels. Do not fix this one in isolation — at six items there is no
label set that fits, and truncating or shrinking the font only hides it. **Do not shrink the font
below the "Touch target sizes" rule at `responsive.css:234`.**

What stays here is the **guard**, which is worth landing regardless of how the bar ends up:

**Red:** extend the Playwright geometry spec from ISSUE-23 (or add alongside it) asserting, at 360 /
400 / 430, that every `.responsive-bottom-nav-item` label's `boundingBox()` sits fully inside its
item's box and inside the viewport (`x >= 0`). Today "Tournaments" fails at all three widths. **Assert
on `boundingBox()`, not on text presence** — the text is present, it is merely off-screen. That
distinction is the whole reason this shipped.

**Green:** ISSUE-28's nav. Add the spec's row to the `e2e-scenarios.md` selection map in the same
change (§8).

Coordinate with ISSUE-23: both want a Playwright geometry spec, and one `layout.spec.ts` covering
shell width *and* nav labels is better than two near-duplicate files. If ISSUE-23 lands first, extend
its spec rather than adding a second.

### Verify

```bash
npx playwright test layout --project=chromium --reporter=line --max-failures=1
```

Every `.responsive-bottom-nav-item` label must report `x >= 0` and a `boundingBox()` no wider than
its item's, at 360 / 400 / 430. **Assert geometry, never text presence** — the clipped label is
still in the DOM, which is exactly why this shipped.

Re-measure with the inspector rather than eyeballing a screenshot:

```bash
node scripts/inspect-route.mjs /standings --width=360 --depth=3
```

No jest specs cover the nav's geometry (jsdom reports zero-size boxes — see ISSUE-28's note on why
the guard must be Playwright), so `--findRelatedTests` on `ResponsiveLayout.tsx` is worth running for
regressions but will not prove this fix.

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

**Sequence after [ISSUE-28](#issue-28)**, which cuts the nav from six items to four and renames two.
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

## ISSUE-28 — Nav: collapse Standings + Matches into one "Play" hub; five items 🟠 {#issue-28}

*Specified 2026-07-26 from the walkthrough. This is the fix ISSUE-26 depends on.*

### Symptom

Six bottom-nav slots, two of which are the same screen, and none of which is "my tournaments".

- **`/standings` and `/matches` render the same component.** Both are `MyTournamentsHub`
  (`App.tsx:97,133`), and the only difference between them is two strings
  (`MyTournamentsHub.tsx:22-23` — the title and subtitle). Same fetch, same 0/1/2+ rule, same list.
- **Both lead to the same destination**, `/tournament/:id/:tab`, whose own tab bar already contains
  *both* of them plus Bracket (`TournamentDetail/index.tsx:77-79`). The top-level distinction is
  discarded one tap after it is used.
- **For a player in one tournament the hub never renders** — `MyTournamentsHub.tsx:61` redirects
  straight through. The two nav items reduce to "the same tournament, different sub-tab preselected".
- **Bracket is the tell.** It is a peer of Standings and Matches inside a tournament but gets no nav
  slot. There is no principle under which two of three siblings are promoted to global navigation.
- **"Tournaments" is not your tournaments** — it points at `/browse` (`ResponsiveLayout.tsx:139`),
  public discovery. `MyTournamentsHub` *is* the my-tournaments list, and it is shown twice under two
  other names while the thing it is never appears in the nav.
- **Neither tab answers its own question.** Both open with "Pick a tournament". The high-frequency
  question on opening the app is "when and where do I play next", which is currently two navigations
  deep.

### The nav (exact)

**Four items** for authenticated users — Browse is removed by [ISSUE-29](#issue-29), which blocks
public discovery. Widths are measured in the nav's own computed font; cells are **90px** at a 360px
viewport.

| # | Label | Width | Slack | Path | testId | Notes |
|---|---|---|---|---|---|---|
| 1 | **Play** | 32px | 58px | `/play` | `nav-play` | new hub, below |
| 2 | **Groups** | 58px | 32px | `/groups` | `nav-groups` | unchanged |
| 3 | **Alerts** | 44px | 46px | `/notifications` | `nav-notifications` | unchanged page, renamed from "Notifications" |
| 4 | **More** | 40px | 50px | overflow | — | unchanged |

Worst case is 58px in a 90px cell — 32px of slack. Today's worst case is 99px in a 60px cell.

**If ISSUE-29 is ever reversed**, Browse returns as a fifth item (58px in a 72px cell, 14px slack —
still fits). Keep `nav-browse` as the testId on the dormant entry; `ResponsiveLayout.guestNav.spec.tsx`
and the e2e specs select on it.

**Guest nav** collapses to Sign in / More once Browse is blocked — a signed-out user has no
destination other than login, so check whether the guest bar still earns its place at all
(ISSUE-7 built it specifically to stop guests hitting auth-gated dead ends).

**Rejected alternatives, measured:** `Discover` (67px) leaves only 5px of slack in a 72px cell —
inside the error bar for cross-platform font rendering, do not use it. `My Play` (57px), `Home`
(47px), `Find` (33px), `Inbox` (42px) all fit if the wording is revisited, but `Play` is the
recommendation.

**`/standings` and `/matches` must keep working as routes** — they are linked from emails,
notifications and `auth.spec.ts`. Redirect both to `/play` rather than deleting them.

### The Play hub (exact)

Replaces `MyTournamentsHub` as the nav destination. Renders, in order:

1. **Next match** — opponent, tournament, deadline. The headline element.
2. **Your tournaments** — the existing `MyTournamentsHub` list, each row linking to
   `/tournament/:id/standings` as it does today. Keep the 0/1/2+ rule *except* the 1-tournament
   auto-redirect at `MyTournamentsHub.tsx:61`, which must go — with a next-match card there is now
   something worth showing, and silently redirecting the nav's primary tab is what made the two old
   tabs indistinguishable.
3. **Recent results** — last few completed matches.

**Empty states — two, keyed on group membership** *(settled 2026-07-27)*. `MyTournamentsHub.tsx:122`
currently sends an empty hub to `/browse`, which [ISSUE-29](#issue-29) blocks, so this cannot be
carried over as-is. Entry is group-only, so the next action is always about groups:

| State | Message | Action |
|---|---|---|
| No groups | "Create a group to start playing" | reuse the existing `CreateGroupCta` (`MyGroups.tsx:61`) — do not build a second one |
| In a group, no tournaments | "No games yet — start a poll in your group" | link to the group |

"No groups" is genuinely reachable: signup is self-serve, and a new user has neither created nor
joined one yet. **Verified live 2026-07-27** that the whole chain works today — `POST /api/auth/signup`
(with `dob_attestation`) → `POST /player/groups` → `POST /:groupId/invites` → `POST /:groupId/polls`,
each returning success — so both states are real and the CTAs point at working flows.

**Carry the guest-upgrade CTA across.** `MyTournamentsHub.tsx:96-105` renders a
`data-testid="guest-upgrade-cta"` card ("Create a password to save your account" → `/signup`) gated
on `tab === 'matches'` — a tab this issue deletes. It is the only prompt a magic-link guest ever
gets to convert, and guests are otherwise free forever (`MONETIZATION_DESIGN.md:40`), so losing it
silently removes the upgrade path. Re-home it on the Play hub, still gated on `isGuest` and still
**non-blocking** — it must not become a wall.

**The data already exists. Do not write new queries.**
`packages/api/src/assistant/player-snapshot.ts` computes all three, cross-tournament, for the coach's
system prompt:

```ts
export interface PlayerSnapshotData {
  nextMatch: { opponentName: string; tournamentName: string; deadline: string | null } | null
  standingsRows: Array<{ tournamentName: string; rank: number; wins: number; losses: number; rankReason: string }>
  lastResults: Array<{ opponentName: string; score: string; won: boolean }>
}
```

`buildPlayerSnapshot()` (`:64`) already handles the registered + group-linked tournament union,
singles *and* doubles (`findMatchesByPlayerForDoubles` vs `findMatchesByPlayer`), opponent naming and
terminal-status filtering. It is exercised today through the coach.

**The one refactor needed:** `buildPlayerSnapshot` returns a *formatted string* for the LLM. Split
the gathering from the formatting — have it return `PlayerSnapshotData`, and leave the existing pure
`formatPlayerSnapshot(data)` (`:29`) composing the string for the coach exactly as now. Then add
`GET /player/snapshot` returning the data. **The coach's prompt output must not change** — the
formatter is already pure and separate, so this is a mechanical split; assert the coach's string is
byte-identical before and after.

**Watch the context type.** `buildPlayerSnapshot` takes an `AssistantToolContext` and reads
`ctx.groupLinkedTournamentIds`, which the route will have to construct. Check how `coach.ts` builds
it rather than inventing a second path.

### Fix — TDD (CLAUDE.md §4, commit red separately per §11)

**Red:**
1. API integration test: `GET /player/snapshot` returns `nextMatch`/`standingsRows`/`lastResults` for
   a player with a scheduled match; 401-equivalent behaviour matches the other `/player/*` routes.
2. Regression test pinning the coach's formatted snapshot string across the refactor.
3. Frontend test: `/play` renders the next-match card, and `/standings` + `/matches` redirect to it.
4. Playwright: the ISSUE-26 geometry assertions, which now pass at five items.
5. `e2e-scenarios.md` selection-map row in the same change (§8).

**Green:** the split, the endpoint, the hub, the nav.

Per §9, this changes user-visible behaviour and route structure — update `docs/assistant-help.md`
(the coach's help corpus describes the tabs) and the auth/route-protection tests in the same change.

### Verify

```bash
SCRATCH=/tmp
npm --workspace=packages/api exec -- jest \
  --findRelatedTests $(git diff --name-only main...HEAD -- 'packages/api/src/**') \
  --bail > "$SCRATCH/api.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/api.log" | head -40

npm --workspace=packages/frontend exec -- jest \
  --findRelatedTests $(git diff --name-only main...HEAD -- 'packages/frontend/src/**') \
  --bail > "$SCRATCH/fe.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/fe.log" | head -40
```

**The coach regression is the one that matters most** — the `buildPlayerSnapshot` split must leave
the coach's formatted prompt string byte-identical. Run `coach.spec.ts` and the assistant specs, and
remember they need `npm run dev:worker --workspace=packages/api` (§8) or they fail with confusing
errors rather than an obvious "not running":

```bash
npx playwright test coach assistant my-tournaments-hub auth --project=chromium --reporter=line --max-failures=1
```

`auth.spec.ts` is included because `/standings` and `/matches` become redirects, which is a route-
protection change (§9). `my-tournaments-hub.spec.ts` covers the pages being replaced — expect it to
need rewriting, not just re-running, and update its selection-map row in the same change.

Manually confirm the 1-tournament case: it must now render the Play hub, **not** auto-redirect
(`MyTournamentsHub.tsx:61` is deleted by this issue).

### Sequencing

Depends on **[ISSUE-24](#issue-24)/[ISSUE-25](#issue-25)** landing first — `/player/*` currently
401s for seeded accounts, so the hub cannot be exercised by hand until that is fixed. Blocks
**[ISSUE-26](#issue-26)**. Independent of ISSUE-23, but both want the same Playwright geometry spec —
whichever lands first should own one `layout.spec.ts`.

---

## ISSUE-29 — Temporarily block public browse + public registration 🟠 {#issue-29}

*Owner decision, 2026-07-27, during the organizer-monetization grill.*

### Decision

**The app is a social/casual racket-sport meetup product at heart.** Public tournament discovery is
switched off until group play has traction. Entry is by **invite only**.

- ❌ **Blocked:** browsing/discovering public tournaments, and public (stranger) registration.
- ✅ **Unchanged:** the invite path, via **both** mechanisms — magic-link guest sessions *and* full
  account registration. Someone invited must be able to arrive either way.
- ✅ **Unchanged:** group casual launches (poll → `unlisted` tournament), which is the product.

This is **temporary and reversible** — block the surface, do not delete the machinery. Four resolved
issues built this path (ISSUE-9, 10, 12, 13 in the archive) and it is expected to return.

### The invite model is group-only *(settled 2026-07-27 — read this before scoping)*

**There is no tournament-level invite, and none is being built.** You are invited to a *group*;
tournaments follow from group polls, which auto-register the In-voters. Nobody is ever invited to a
single event.

This is a bigger consequence than "discovery is off", because today there are exactly **two** ways
into a tournament and this removes one of them:

| Path | Status |
|---|---|
| Public registration — **starts** at `/tournament/:id/browse` | **blocked by this issue** |
| Group poll launch — auto-registers In-voters, no invite step | the only remaining path |

So blocking public browse also removes the only *tournament-level* front door. That is intended.

**The onboarding chain that replaces it already works — verified live 2026-07-27**, each call
returning success against a running API:

```
POST /api/auth/signup   (dob_attestation)  → account + linked playerId
POST /player/groups                        → group created, caller is owner
POST /:groupId/invites                     → email-bound single-use token
POST /:groupId/polls                       → poll (autoCloseAt/autoLaunch/minPlayers/format)
```

UI exists for all of it: `CreateGroupCta` (`MyGroups.tsx:61`) and `GroupDetail`'s Chat · Members ·
Invite tabs. **No new onboarding needs building** — this issue only removes the alternative.

**Consequence: `/tournament/:id/join` becomes dead code.** It is a token-verification interstitial
("Signing you in…" → redirect to `/matches`) reached only by someone who registered publicly and
received a magic link. With public registration blocked, nobody reaches it. **Flag it, do not delete
it** (§3) — it returns with public registration. Note its error branch links to
`/tournament/${id}/browse` ("Register again"), which is one of the six dead links below.

### Why this is close to a no-op today

Public tournaments effectively cannot exist in production already: `auth.ts:168` hardcodes
`role: 'player'` on signup, there is no admin promote route, and the only organizer-creating code is
seed scripts. So no account can create a public tournament. This issue makes the de-facto state
explicit and removes the dead surface rather than changing behaviour.

### Mechanism — `PUBLIC_DISCOVERY_ENABLED` *(settled 2026-07-27)*

Follows the **owner-approved `BILLING_ENABLED` pattern** (`MONETIZATION_DESIGN.md:51-64`): a single
**server-authoritative** env switch, read at boot, **default off**, surfaced to the frontend via a
config response — **never a build-time constant**, so flipping it needs no client redeploy.

```
PUBLIC_DISCOVERY_ENABLED (env, default off)
   → GET /api/config  { publicDiscoveryEnabled: boolean }
   → API routes gated server-side; UI reads the flag for nav, CTAs and redirects
```

**Why a runtime flag rather than static removal.** This issue's whole instruction is *block the
surface, keep the machinery*, and it tells you not to delete the three discovery e2e specs. A
runtime flag is the only option where those specs **still run** — turn the flag on in the test
environment and the suite keeps proving discovery works. Under static UI removal they cannot execute
at all, so the "kept" machinery rots unverified until someone tries to revive it months later.

**`GET /api/config` does not exist yet** — build it here. This is not scope creep: `BILLING_ENABLED`
already specifies surfacing "via an existing bootstrap/config response" that was never built, so
billing needs the same endpoint. It lands at its first use.

**Enforcement must be server-side, not UI-only.** The billing amendment's corollary — *do not build
dormant-but-reachable* — applies with more force here, because unlike billing these endpoints
already exist and work today. A UI-only gate leaves a live public registration endpoint reachable by
direct request.

**Two infra findings, both already verified — do not re-investigate:**
- **CloudFront needs no change.** `/api/*` is already a behavior (`infra/modules/frontend/main.tf:63`,
  `api_path_patterns`), so `/api/config` is covered by §9's rule automatically.
- **CloudFront will not cache it.** All API behaviors use `caching_disabled` (`main.tf:116`), so an
  env flip takes effect immediately rather than waiting out a TTL.
- ⚠ **The service worker must classify `/api/config` as `passthrough`** — never cached, never
  replay-queued — exactly as `/api/billing/*` does (`PWA_CACHING_DESIGN.md` D7). Otherwise an
  installed PWA keeps serving a stale flag and the "no redeploy" property is lost for exactly the
  users hardest to debug.

### Scope

1. **Remove the Browse nav entry and route surface.** `/browse` and `/tournament/:id/browse` are
   public (`App.tsx:65,72`). Gate them behind the flag above rather than deleting — the pages, tests
   and fixtures stay.

   **Blocked routes return 404** *(settled 2026-07-27)* — frontend renders a NotFound page, and
   `POST /tournaments/:id/register` returns `404` when the flag is off. Chosen over a silent
   redirect specifically because **a missed inbound link then fails loudly during implementation
   instead of bouncing somewhere plausible**; with six links to repoint (below), that feedback is
   worth more than the tidier UX of a redirect. Nobody should reach a 404 in normal use once those
   six are done.

   ⚠ **No NotFound page or catch-all route exists** — verified: `App.tsx` has no `path="*"`. Build a
   minimal one here. It is genuinely missing today (any typo'd URL renders a blank router outlet),
   so this is a gap being closed, not scope creep.
2. **Block public registration.** `POST /tournaments/:id/register` is the unauthenticated entry
   point (ISSUE-11 rate-limits it). It must reject when the tournament was not reached via an
   invite. **Do NOT delete the route** — the invite flow uses the same registration path.
3. **Verify both invite arrivals still work**, since this is the whole remaining front door:
   - magic-link guest session (`/tournament/:id/join`, `/tournament/:id/partner-invite`,
     `/groups/:groupId/invite`)
   - full account signup from an invite
4. **Browse's data source is unaffected** — `db.ts:~312` hard-filters `t.visibility = 'public'`, and
   group launches are always `unlisted`, so nothing group-related was ever in Browse.
5. **Repoint every inbound link to `/browse` — there are six, and two are redirects.** Removing the
   nav entry is not enough; these strand users on a blocked page:

   | File | What it is | Must become |
   |---|---|---|
   | `Signup.tsx:150` | `navigate('/browse')` **after account creation** | the Play hub |
   | `Login.tsx:92` | `navigate('/browse')` **after login** | the Play hub |
   | `Landing.tsx:69-71` | "Browse tournaments" CTA on the signed-out entry point | removed |
   | `Login.tsx` (secondary CTA) | "Browse tournaments" button | removed |
   | `MyTournamentsHub.tsx:122` | empty-state "browse" link | removed or repointed |
   | `TournamentJoin.tsx:69` | link to `/tournament/:id/browse` in the invite flow | removed |

   **The two redirects are the priority.** Post-signup and post-login both land on `/browse` today —
   that is the exact path an invited user walks, so blocking Browse without fixing these breaks the
   only remaining front door. Coordinate with [ISSUE-28](#issue-28): `/play` is the natural
   destination for both, so land ISSUE-28 first or repoint to `/matches` in the interim.

**Signed-out is a normal state, not an edge case** — `server.ts:139` sets `expiresInSeconds: 3600`,
`/signout` (`App.tsx:61`) returns the user to Landing, and any returning visit, second device or
expired invite lands there. Landing must therefore still make sense with no Browse CTA.

### Do NOT

- **Do not delete the discovery code, its specs, or its fixtures.** `browse-tournaments.spec.ts`,
  `tournament-public-registration.spec.ts` and `tournament-discovery-registration.spec.ts` should be
  skipped behind the same flag, not removed — deleting them means rebuilding the suite when this
  returns.
- **Do not change `visibility` semantics** or make the column mutable. The
  organizer-creates-public / group-creates-unlisted invariant stays (location design D1).
- **Do not remove the guest-session machinery.** Guests arrive by invite now; the mechanism is
  load-bearing, not part of the blocked feature.

### Verify

`auth.spec.ts` (route protection changed — §9 requires updating it in the same change), plus the
three discovery specs above confirming they skip cleanly. Confirm an invited user can complete
registration by *both* magic link and full signup.

---

## ISSUE-30 — `/tournament/:id` redirects to a literal, unsubstituted path 🔴 {#issue-30}

*Found 2026-07-27 while checking whether a NotFound page existed for ISSUE-29.*

### Symptom

Every bare tournament URL is broken. Verified live against a running app:

```
requested : /tournament/tournament_1784922484786_culgi2367d
landed on : /tournament/:tournamentId/standings        ← literal, unsubstituted
body      : "Failed to load tournament data"  {"code":"UNAUTHORIZED", …}
```

**This breaks the group-launch payoff step**, which is why it is 🔴 rather than 🟠.
`GroupChatPanel.tsx` navigates to the bare route in three places, all on the casual-launch path:

| Line | Context |
|---|---|
| 207 | after `POST /polls/:messageId/launch` (launch sheet) |
| 230 | after `POST /polls/:messageId/launch` (card launch sheet) |
| 292 | the deep link on the launch system message |

So a group votes, launches a casual tournament, gets sent to "their" tournament — and lands on an
error page. Under [ISSUE-29](#issue-29) group launch is *the* product, so this is the highest-value
defect in the queue.

### Root cause

`packages/frontend/src/App.tsx:126-131`:

```jsx
<Route
  path={ROUTES.TOURNAMENT_DETAIL}                                  // '/tournament/:tournamentId'
  element={<Navigate to={`/tournament/:tournamentId/standings`} replace />}
/>
```

A template literal with **no interpolation** — it is the literal string. `<Navigate>` does not
substitute route params, so the browser goes to a URL containing a real `:` character. That then
matches `TOURNAMENT_TAB` (`/tournament/:tournamentId/:tab`) with `tournamentId = ":tournamentId"`,
and the detail page requests a tournament whose id is literally `:tournamentId`.

The backtick makes it *look* interpolated, which is why it survived review.

### Fix — TDD (CLAUDE.md §4, commit red separately per §11)

**Red:** a routing test rendering `/tournament/<real-id>` and asserting the resolved location is
`/tournament/<real-id>/standings`. `route-protection.spec.tsx` is the existing harness for
router-level assertions. It must fail on the literal `:tournamentId` today.

**Green:** read the param and build the target, e.g. a tiny redirect component using
`useParams()` — `<Navigate to={`/tournament/${tournamentId}/standings`} replace />`. **Do not** hand-
roll a second path string; derive it from `ROUTES.TOURNAMENT_TAB` if practical so it cannot drift.

**Also add an e2e assertion on the launch flow itself**, since that is where users meet this:
`casual-tournament.spec.ts` already covers group launch — extend it to assert the post-launch
landing page renders tournament content rather than an error.

### Verify

```bash
SCRATCH=/tmp
npm --workspace=packages/frontend exec -- jest \
  --findRelatedTests packages/frontend/src/App.tsx --bail > "$SCRATCH/fe.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/fe.log" | head -40

npx playwright test casual-tournament player-groups --project=chromium --reporter=line --max-failures=1
```

Manual: launch a casual tournament from a group poll and confirm the redirect lands on real content.
`npm run dev:worker --workspace=packages/api` must be running (§8) or the launch path misbehaves for
unrelated reasons.

---

## ISSUE-31 — A group-launched casual tournament never generates matches 🔴 {#issue-31}

*Found 2026-07-27 by walking the casual flow end to end against a running app.*

### Symptom

A group votes on a poll, launches a casual tournament, and gets **a tournament with no games in it**.
Reproduced live — two real accounts, a real group, a real poll, both voting In:

```
POST /player/groups/:id/polls/:messageId/launch
  → {"tournamentId":"…","tournamentName":"Social Club — Jul 28",
     "registeredPlayerIds":["player_…","player_…"]}          ← 2 players registered

SELECT … FROM tournaments/groups/player_registrations:
  registrations | groups | status              | mode
  2             | 0      | registration_closed | casual
  matches: 0
```

The UI reflects it honestly: standings reads *"Waiting for registrations"* and matches reads *"No
matches scheduled"*, on a tournament that has two registered players. **This is the payoff step of
the entire group-first product**, and under [ISSUE-29](#issue-29) it is the only remaining path into
a tournament at all.

### Root cause

`createGroups` / `createGroupsForDoubles` is the only code that generates matches, and it has exactly
three callers:

| Caller | Reachable in production? |
|---|---|
| `app.ts:275` | ❌ test-only `/test/*` seeder ("seeds a group-linked casual round-robin session") |
| `app.ts:321` | ❌ test-only `/test/*` seeder |
| `tournaments.ts:431` | ✅ but **organizer-authed** `START_GROUP_STAGE` transition |

The group-launch path (`player-groups.ts`) registers the In-voters and sets status
`registration_closed` — and stops. Nothing calls the generator.

The state machine's next step is `REGISTRATION_CLOSED: ['START_GROUP_STAGE']`
(`core-logic/src/state-machine.ts:38`), and that transition runs through an organizer-authed route.
**A group has no organizer**, so a group-launched tournament can never leave `registration_closed`.

The round-robin generator itself **exists and works** (`db.ts:973`, "Generate round-robin: each
player plays every other player once"). Nothing in any group path calls it.

### Why no test caught it — read before writing one

`casual-tournament.spec.ts` looks like coverage and is not:

- *"Launching casual tournament from poll calls launch endpoint"* (`:128`) **intercepts the launch
  request** with `page.route(...)` and asserts `launchCalled === true`. It mocks the very call whose
  result is broken.
- *"Any registered participant can score any match in a casual tournament"* (`:184`) does **not use
  the group path at all** — it takes an organizer token, creates a tournament via `POST /tournaments`,
  runs `OPEN_REGISTRATION`, and registers players through **public registration**. It proves casual
  *scoring* works when an organizer sets it up, which cannot happen in the group-only model. It would
  also break under ISSUE-29, which blocks public registration.
- Its own comment at `:186` states: *"the casual tournament page (with openScoring MatchCards) **is
  not yet built**"*.

So the suite is green while the flow dead-ends.

### Fix — needs a decision first

**The question is who triggers generation for a group tournament**, given there is no organizer:

1. **Generate at launch**, inside the existing launch handler, right after registering the In-voters
   — the roster is already fixed at that moment (Q14: "the open poll window is the join window;
   roster locks at close"), so there is nothing to wait for.
2. **Generate on the auto-close/auto-launch worker path** too — `auto-close-processor.ts:98` launches
   without anyone pressing a button, so it needs the same treatment or auto-launched tournaments stay
   empty.
3. **A group-member-authed transition**, mirroring how launch itself is creator-authed.

**(1) + (2) is the obvious shape** — a fixed roster with no organizer has nothing to gate on — but
this is a real design decision, not a mechanical fix, so it is stated rather than assumed.

**Do NOT reuse the `/test/*` seeders' shape uncritically.** They call
`createGroups(tournament.id, 1, 1, playerIds)` — one group, one advancing — which may be right for a
casual session but was written for fixtures, not as a product decision.

**Whatever is chosen, replace the mocked assertion.** A test that intercepts the launch call cannot
catch this class of defect; the spec must assert that matches exist and are playable *after* a real
group launch.

### Verify

```bash
SCRATCH=/tmp
npm --workspace=packages/api exec -- jest \
  --findRelatedTests $(git diff --name-only main...HEAD -- 'packages/api/src/**') \
  --bail > "$SCRATCH/api.log" 2>&1
grep -E "Tests:|Suites:|✕" "$SCRATCH/api.log" | head -40

npx playwright test casual-tournament player-groups poll-cards --project=chromium --reporter=line --max-failures=1
```

`npm run dev:worker --workspace=packages/api` must be running (§8) — the auto-launch path in (2) goes
through the queue consumer.

**Manual, and this is the real gate:** create two accounts, a group, invite and accept, run a poll,
both vote In, launch — then confirm the tournament has matches and both players can open and score
one. That is the sequence this issue exists to make work.

---

## Not yet triaged / follow-ups

- **SSE `/tournaments/:id/events` returns 403 on every tournament page** — observed live 2026-07-27
  on a group-launched casual tournament while signed in as a registered participant. Real-time
  updates are therefore dead on those pages. Not yet triaged: it may be a consequence of
  [ISSUE-31](#issue-31) (no groups exist, so there may be nothing to subscribe to) rather than an
  auth defect in its own right. **Re-check after ISSUE-31 lands** before filing it separately.
- **`POST /api/analytics/events` returns 401 for a registered player** — confirmed live 2026-07-27,
  on every authenticated page. This is the `analytics.ts:23` dual-auth gap already listed below, now
  observed rather than inferred: it fires on each page view, so every authenticated session logs a
  401 and no analytics are recorded for account holders.
- **The app has no support destination.** No `mailto:`, no `support@`, no `/support` route anywhere
  (verified 2026-07-27). `ServiceUnavailable.tsx:14` already tells users to "contact support" with
  nowhere to go, and [ISSUE-24](#issue-24) had to drop the same phrase from its copy for this reason.
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
  Browse, and Browse is now blocked ([ISSUE-29](#issue-29)). Still a real correctness gap; the two
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
