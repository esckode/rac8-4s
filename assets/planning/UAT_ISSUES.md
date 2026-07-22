# UAT Issues — found during the 2026-07-20/21 AWS deploy session

Running tracker for defects surfaced while standing up and testing the first UAT
deploy (CloudFront `d37ruxd1gf48ip.cloudfront.net`, since torn down). Each issue is
scoped for a Sonnet implementer: symptom → verified root cause (`file:line`) → fix →
verify. Follow `CLAUDE.md` throughout — TDD (§4), one logical change per commit and
branch-per-issue (§11), surgical edits (§3). **Read the referenced code before editing;
several fixes have a "do NOT" note because the obvious approach is wrong.**

Severity: 🔴 blocks a user-facing feature · 🟠 real defect, limited blast radius · 🟡 robustness.

| # | Severity | Title | Area |
|---|---|---|---|
| [ISSUE-1](#issue-1) | 🔴 | Registered-account users locked out of Groups (dual-auth gap) | api + frontend |
| [ISSUE-2](#issue-2) | 🟠 | `teardown-uat.sh` silently deletes the SES sender identity | scripts |
| [ISSUE-3](#issue-3) | 🟡 | `deploy-uat.sh` SES re-adopt guard uses the same fragile pattern | scripts |
| [ISSUE-4](#issue-4) | 🟡 | `deploy-uat.sh` frontend build runs from the wrong cwd | scripts |
| [ISSUE-5](#issue-5) | 🟠 | Fake iOS status bar (hardcoded `9:41` + fake signal/wifi/battery) shipped on the auth pages | frontend |
| [ISSUE-6](#issue-6) | 🟠 | Auth "back" buttons hardcode `navigate('/')` instead of true history-back | frontend |
| [ISSUE-7](#issue-7) | 🟠 | Guest bottom nav leaks auth-gated Standings/Matches tabs (dead-end → login) | frontend |
| [ISSUE-8](#issue-8) | 🟠 | Bottom nav has no safe-area-inset handling; viewport lacks `viewport-fit=cover` | frontend |
| [ISSUE-9](#issue-9) | 🟠 | Browse (discovery board) shows raw status enums + lists expired-`registration_open` as "Reg Open" | frontend + api |
| [ISSUE-10](#issue-10) | 🟡 | Featured is positional `[0]`, not curated — make it a "Register soon" set (open + has-spots, most-registered, max 3) | frontend + api |
| [ISSUE-11](#issue-11) | 🟠 | `POST /:id/register` is a public, unauthenticated, **unthrottled** email-send trigger (email-bombing / SES-reputation vector) | api · security |
| [ISSUE-12](#issue-12) | 🟠 | Guest-registration UX: ambiguous app-vs-tournament framing, no auth-aware one-click, doubles partner unsurfaced, email-typo safety | frontend + api |
| [ISSUE-13](#issue-13) | 🟠 | Tournament detail page (`TournamentBrowse`) — no design parity + missing description/deadline/capacity | frontend + api |
| [ISSUE-14](#issue-14) | 🟠 | Emailed magic link forces account creation — wire it to the existing guest-session exchange ("continue as guest") | frontend + api |

---

## ISSUE-1 — Registered-account users locked out of Groups (dual-auth gap) 🔴 {#issue-1}

**Symptom (found in the deployed UAT app):** the Groups view shows a coach button and,
below it, **"Failed to load groups."** Reproduced from CloudWatch (`/uat/api` log group):
`GET /player/groups` returns **401 `TOKEN_INVALID`** ("Token is invalid or has expired")
for a signed-in user — while, in the *same session at the same time*, `POST
/player/notifications/read` succeeds with a valid `playerId`. So it is not "no groups"
(that should be an empty list) and not a logged-out user — one player token is accepted
by one player route and rejected by another.

**Root cause (verified by reading the code):**
- The working notifications route resolves identity through a **dual-auth shim**,
  `resolvePlayerId` in `packages/api/src/routes/player.ts:16-35`:
  ```ts
  try { return (await requirePlayerSessionAuth(authHeader, deps.tokenStore)).playerId }  // guest magic-link session
  catch (sessionErr) {
    let account
    try { account = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore) }  // registered-account JWT
    catch { throw sessionErr }
    if (account.playerId) return account.playerId   // dual-role: account carries a linked playerId
    throw sessionErr
  }
  ```
- **`packages/api/src/routes/player-groups.ts` never adopted this.** It calls
  `requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)` **directly at 25
  sites** (first one `player-groups.ts:117`, the `GET /` list handler). That function only
  accepts a guest player-session token, so a **registered-account JWT is rejected** →
  401 → "Failed to load groups."
- The user is signed in with a **registered-account JWT** (has a linked `playerId` — that
  is why `notifications.read` worked via the shim). Account JWTs legitimately carry a
  linked player: `OrganizerPayload.playerId` (`packages/api/src/auth/tokens.ts:9-12` —
  *"a player account's token carries the linked playerId so it can act on player-scoped
  endpoints"*).

**Blast radius:** all 25 group operations (list, create, join, members, messages, polls,
SSE) use the strict auth, so **every registered-account user is fully locked out of
Groups**, not just the list. This is the same class of dual-auth bug the personalization
work fixed elsewhere ("applied proactively thereafter") — player-groups was missed.

**Scoping facts (already gathered — don't re-derive):**
- All 25 `requirePlayerSessionAuth` sites use only **`session.playerId`** (54 references).
  The lone **`session.token`** use is `player-groups.ts:370`, inside the *invite-accept*
  handler where a session is freshly **minted** (`generatePlayerSession`) — that is a
  different `session` variable and is **NOT** one of the 25 auth sites. **Leave it alone.**
- `AppDependencies` exposes both `jwtConfig` (`app.ts:95`) and `tokenStore` (`app.ts:96`),
  so the router already has what `requireOrganizerAuth(authHeader, deps.jwtConfig,
  deps.tokenStore)` needs.
- `../auth` re-exports both functions (`player.ts:4` does
  `import { requirePlayerSessionAuth, requireOrganizerAuth } from '../auth'`).

### Fix

**Backend (the blocker):**
- **[RED]** Add an integration test asserting a **registered-account JWT with a linked
  playerId** can list groups. Mint it with
  `issueOrganizerToken({ sub, email, playerId: player.id }, jwtConfig)`
  (`packages/api/src/auth/tokens.ts:28` — it accepts `playerId` and forces
  `role:'organizer'`, which is fine: the shim keys on `account.playerId`, not role).
  Create the linked `player` row, then `GET /player/groups` with
  `Authorization: Bearer <accessToken>` → **expect 200 `{ groups: [] }`**. Confirm it
  **fails today with 401**. Mirror the setup in
  `packages/api/src/__tests__/integration/groups.spec.ts` (uses `createTestApp`,
  `InMemoryTokenStore`; guest tokens via `generatePlayerSession`). Put the test where the
  `/player/groups` list is naturally covered (e.g. alongside `group-launch.spec.ts`) or a
  new `player-groups-auth.spec.ts`.
- **[GREEN]** In `player-groups.ts`:
  1. Change the import to `import { requirePlayerSessionAuth, requireOrganizerAuth } from '../auth'`.
  2. Add a dual-auth helper **inside the router factory** (so it closes over `deps`),
     structurally identical to `resolvePlayerId` but returning **`{ playerId }`** (an
     object) so the 54 `session.playerId` call sites need no change:
     ```ts
     async function resolvePlayerSession(authHeader: string | undefined): Promise<{ playerId: string }> {
       try {
         const session = await requirePlayerSessionAuth(authHeader, deps.tokenStore)
         return { playerId: session.playerId }
       } catch (sessionErr) {
         let account
         try { account = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore) }
         catch { throw sessionErr }
         if (account.playerId) return { playerId: account.playerId }
         throw sessionErr
       }
     }
     ```
  3. Replace the 25 `const session = await requirePlayerSessionAuth(<arg>, deps.tokenStore)`
     calls with `const session = await resolvePlayerSession(<arg>)`. Preserve each call's
     existing `<arg>` (mostly `req.headers.authorization`; one is `authHeader`). Do this
     **after** the helper exists, and **verify the count**: `grep -c
     requirePlayerSessionAuth player-groups.ts` should end at **1** (only inside the
     helper). The `session.token` line (370) must remain untouched.
  - **⚠️ Do NOT** change `auth.ts`/`middleware.ts` or `requirePlayerSessionAuth` itself —
    other callers depend on its strict behavior. The fix is local to the groups router.
- **Verify:** new test green; the full `player-groups` integration suite
  (`group-*.spec.ts`, `groups.spec.ts`, `player-group-membership.spec.ts`) still green —
  guest player-session tokens must keep working (the shim tries them first).

**Frontend (the empty-state UX — the second, real issue the reporter raised):**
- `packages/frontend/src/hooks/useGroupList.ts:44,53` collapses **every** non-ok response
  into `setError('Failed to load groups')`. Even once auth is fixed, an empty list should
  invite creating a group, and a 401 shouldn't read like a load failure.
- The view is `packages/frontend/src/pages/MyGroups.tsx` (read it for the exact render).
  Two changes: (a) a successful-but-empty list shows a **"Create your first group"**
  empty state / CTA rather than only the error text; (b) distinguish `res.status === 401`
  (session problem → prompt re-auth) from a genuine load failure. Add a unit test
  (`MyGroups` / `useGroupList`) for the empty and 401 branches. Add any new `data-testid`s
  to `e2e/config.ts` per §8 if an e2e is added.

**Audit (prevent the next occurrence):** grep every route file for `requirePlayerSessionAuth`
used **directly** where dual-auth is intended (registered accounts should have access):
```
grep -rn "requirePlayerSessionAuth" packages/api/src/routes/
```
Compare against routes that use a dual-auth resolver. Likely suspects: `coach.ts`,
player-settings routes. File a follow-up issue here for any found — **do not fix them in
this commit** (keep ISSUE-1 to groups).

---

## ISSUE-2 — `teardown-uat.sh` silently deletes the SES sender identity 🟠 {#issue-2}

**Symptom (confirmed on the live teardown 2026-07-21):** the SES **sender** identity
(the address in the git-ignored `infra/secrets.auto.tfvars` → `email_from_address`) was
**deleted** during teardown (`get-email-identity` → `NotFoundException`), despite the
script's stated "SES identity PRESERVED" behavior. The
teardown log shows **no** `==> removing SES identity from state` line, and then
`aws_sesv2_email_identity.sender[0]: Destruction complete` — i.e. the preserve step was
skipped and `tofu destroy` deleted the identity. (The two tester identities survived —
they were never in tofu state.)

**Root cause:** the preserve guard in `scripts/teardown-uat.sh`
```bash
if tofu -chdir="$INFRA" state list 2>/dev/null | grep -q "sesv2_email_identity.sender"; then
  echo "==> removing SES identity from state (kept alive in AWS)"
  tofu -chdir="$INFRA" state rm "$SES_RESOURCE"
fi
```
evaluated **false** at teardown time even though the identity *was* in state (destroy
found it seconds later). **The exact trigger was not reproduced** — a `set -o pipefail` +
`grep -q` early-exit race was hypothesized and **disproved** (it reproduces as working,
`PIPESTATUS [0 0]`). The most likely remaining explanation is `tofu state list`
transiently returning empty/non-zero (swallowed by `2>/dev/null`) so `grep` matched
nothing. Rather than depend on pinning it, **remove the fragile read entirely.**

**Fix (defensive — cannot silently skip):** replace the whole `if … state list | grep …`
block with an **unconditional** state removal:
```bash
# Preserve the verified SES sender: remove from state (if present) so destroy leaves it
# in AWS. Unconditional + tolerant — no fragile state-list/grep guard (see UAT_ISSUES.md
# ISSUE-2: the guard once skipped and destroy deleted the identity).
echo "==> preserving SES identity (removing from state if managed)"
tofu -chdir="$INFRA" state rm "$SES_RESOURCE" 2>/dev/null || true
```
`state rm` on a present resource removes it (preserved); on an absent one it exits
non-zero with a harmless "No matching objects" that `|| true` swallows.

- **[Test]** Shell, so no unit harness. Verify by reasoning + a dry check: after the edit,
  `bash -n scripts/teardown-uat.sh` passes, and on the *next* real teardown the log shows
  the `==> preserving SES identity` line and `get-email-identity` on the sender still
  returns after destroy. Note in the commit that live verification is deferred to the next
  teardown.
- **Also:** the stale reassurance line `echo "==> teardown complete. SES identity
  retained — no re-verification needed next deploy."` is now only true if this fix works;
  keep it, it's accurate post-fix.

**Immediate recovery (independent of the script fix):** the sender must be re-created +
re-verified once. Either run `aws sesv2 create-email-identity --email-identity
"$(sed -nE 's/.*email_from_address[^"]*"([^"]+)".*/\1/p' infra/secrets.auto.tfvars)"
--region us-east-2` (owner clicks the link), or let the next `deploy-uat.sh` recreate it
via the `aws_sesv2_email_identity.sender` resource (also sends a verify link). One click,
once.

---

## ISSUE-3 — `deploy-uat.sh` SES re-adopt guard uses the same fragile pattern 🟡 {#issue-3}

**Context:** `scripts/deploy-uat.sh` re-adopts the SES identity with the same
read-and-guard shape that failed in ISSUE-2:
```bash
if [ -n "$FROM_ADDR" ] && ! tofu -chdir="$INFRA" state list 2>/dev/null | grep -q "sesv2_email_identity.sender"; then
  ... tofu import ...
fi
```
It **happened to work** on the real deploy (state was small — only data sources + the
identity — so the read was reliable), but it shares the ISSUE-2 fragility and would
misfire on a larger/slower state (a false "not in state" → attempt `import` of an
already-managed resource → error → failed deploy).

**Fix:** capture the state list to a variable once and match with a **pipe-free** bash
test, so there is no `state list | grep` in a control-flow condition:
```bash
STATE_LIST="$(tofu -chdir="$INFRA" state list 2>/dev/null || true)"
if [ "$EMAIL_SVC" = "aws_ses" ] && [ -n "$FROM_ADDR" ] && [[ "$STATE_LIST" != *"sesv2_email_identity.sender"* ]]; then
  if aws sesv2 get-email-identity --email-identity "$FROM_ADDR" --region "$REGION" >/dev/null 2>&1; then
    echo "==> re-adopting existing SES identity $FROM_ADDR into state"
    tofu -chdir="$INFRA" import -var-file="$VAR_FILE" "$SES_RESOURCE" "$FROM_ADDR"
  fi
fi
```
- **Verify:** `bash -n` passes; a dry run (`printf 'n\n' | AWS_PROFILE=… deploy-uat.sh`)
  reaches the plan gate without erroring whether or not the identity is already in state.

---

## ISSUE-4 — `deploy-uat.sh` frontend build runs from the wrong cwd 🟡 {#issue-4}

**Context:** `scripts/deploy-uat.sh:78` runs `npm run build --workspace=packages/frontend`
from whatever the caller's cwd is. The adjacent `npm ci` at line 76 correctly wraps in
`(cd "$REPO_ROOT" && npm ci)`, but the build does not. It works when the script is invoked
from the repo root (as it was), but breaks if run from elsewhere.

**Fix:** run the build from the repo root, matching line 76:
```bash
(cd "$REPO_ROOT" && npm run build --workspace=packages/frontend)
```
The subsequent `aws s3 sync "$REPO_ROOT/packages/frontend/dist/" …` already uses an
absolute path, so only the build line needs the cwd fix.
- **Verify:** `bash -n` passes; running `scripts/deploy-uat.sh` from a subdirectory (dry
  run to the plan gate is enough) no longer depends on cwd for the build.

---

## ISSUE-5 — Fake iOS status bar shipped on the auth pages 🟠 {#issue-5}

*(Found 2026-07-21 during a local manual walkthrough — clicking **Continue with email** →
the "Welcome back." Login screen.)*

**Symptom (visible in the running app):** at the very top of the auth screens there is a
mock mobile **status bar** — a time reading **`9:41`** plus small cellular-signal, wifi,
and battery glyphs. It looks broken because (a) the time is wrong — it never matches the
real clock — and (b) in any real browser (desktop, or a phone where the OS already draws
the real status bar) the user sees a *second, fake* status bar with a frozen battery/wifi.
It is purely decorative chrome with no function in a web app.

**Root cause (verified by reading the code):** `9:41` is a hardcoded string — Apple's
standard marketing/demo time — and the icons are static inline SVGs (or emoji), not real
device state. This was copied out of the Figma-style **design-mockup** files (which
legitimately render a phone-with-status-bar preview) into the **real, shipped** auth pages.
There is no shared component; the block is copy-pasted inline **six times across four
pages**:

| File | Block (match by the comment + the `9:41` span, not the line #s — they drift) | Icon style |
|---|---|---|
| `packages/frontend/src/pages/Login.tsx` | `{/* Status bar */}` + its `<div>` (≈ lines **135–161**) | inline SVG |
| `packages/frontend/src/pages/Signup.tsx` | `{/* Status Bar Simulation */}` + its `<div>` (≈ lines **208–225**) | emoji `📶` `🔋` |
| `packages/frontend/src/pages/ForgotPassword.tsx` | **two** blocks: `{/* Status bar */}` at ≈ **125–151** and ≈ **315–341** | inline SVG |
| `packages/frontend/src/pages/ResetPassword.tsx` | **two** blocks: `{/* Status bar */}` at ≈ **243–269** and ≈ **400–426** | inline SVG |

Each block is the self-contained `<div style={{ … height: 44 … }}>…9:41… <signal/wifi/battery> …</div>`
immediately followed by the `{/* Header with back button and logo */}` sibling (in
`Signup.tsx` the following sibling is `{/* Back Button */}`). ForgotPassword/ResetPassword
have two because each renders a status bar in **both** render branches (form state **and**
the success/confirmation state) — remove it from both.

**⚠️ Do NOT touch the design-mockup files** — the fake status bar is intentional there as a
device preview and must stay:
`packages/frontend/src/pages/DesignSpec.tsx`,
`packages/frontend/src/ui/section-auth.jsx`,
`packages/frontend/src/ui/section-mobile.jsx`,
`packages/frontend/src/ui/section-foundation.jsx`.
(`grep -rn "9:41" packages/frontend/src` lists all ten occurrences — the four files above
are the ones to leave alone; the four `pages/{Login,Signup,ForgotPassword,ResetPassword}`
files are the ones to fix.)

**Scoping facts (already gathered — don't re-derive):**
- **No test or e2e asserts the fake bar** (`grep -rn "9:41" packages/frontend/src/**/__tests__ packages/frontend/e2e`
  is empty) — removal breaks nothing existing.
- The blocks use only inline SVG/emoji, so **no imports become unused** after removal.
- The CSS var `--auth-glass-text` is used elsewhere on these pages — **do not** remove it.

### Fix (frontend only)

- **[RED]** Add a unit test (React Testing Library, alongside the existing auth page tests —
  see how `Login`/`Signup` are already rendered in `packages/frontend/src/pages/__tests__/`)
  asserting each of the four pages renders **no** fake status bar: e.g. `queryByText('9:41')`
  is `null` on `Login`, `Signup`, `ForgotPassword`, `ResetPassword` (for ForgotPassword /
  ResetPassword, also exercise the success/confirmation branch so both blocks are covered).
  Confirm it **fails today** (the text is present).
- **[GREEN]** Delete all six status-bar blocks listed above (comment line through the
  closing `</div>`). Leave every sibling and the page container intact.
- **Spacing check:** the status-bar `<div>` was 44px tall and sat above the header
  (`padding: '12px 24px 0'`). After removal the header/back-button becomes the first child.
  Verify the top of each auth card doesn't look cramped; if it does, add a **modest**
  top padding to the container/header that respects `env(safe-area-inset-top)` (the design
  foundation calls for this — `ui/section-foundation.jsx:454`). Keep it minimal and
  consistent across the four pages; don't restyle anything else (§3 surgical).
- **Verify:** new tests green; existing auth unit tests
  (`Login`/`Signup`/`route-protection.spec.tsx`) and `e2e/auth.spec.ts` still green;
  manual: the four auth screens no longer show a status bar and content starts cleanly at
  the header. One logical change, its own branch/commit (§11), TDD (§4).

---

## ISSUE-6 — Auth "back" buttons hardcode `navigate('/')` instead of true history-back 🟠 {#issue-6}

*(Found 2026-07-21 during the manual walkthrough, discussing back-navigation on a PWA.)*

**Symptom:** the top-left "back" chevron on the auth screens is not a real back button — it
always jumps to a **fixed** destination regardless of where the user came from. From Login,
"back" always lands on the Landing page (`/`), even if you arrived at Login from elsewhere.

**Root cause (verified):** each auth page rolls its own chevron with a hardcoded
`navigate(<literal>)` (react-router `useNavigate`), and there is **no shared BackButton
component** (`grep -ril BackButton packages/frontend/src/components` → none):
- `packages/frontend/src/pages/Login.tsx:175` → `navigate('/')`
- `packages/frontend/src/pages/Signup.tsx:229` → `navigate('/')`
- `packages/frontend/src/pages/ForgotPassword.tsx:355` → `navigate('/')`
- `packages/frontend/src/pages/ResetPassword.tsx:283,349,440` → `navigate('/login')` (same
  anti-pattern; the target happens to be a sensible parent, but it's still a fixed jump, not back)

**Design context (why it matters — this is a PWA):** the app manifest declares
`"display":"standalone"` (`packages/frontend/dist/manifest.webmanifest`). In a **browser**
and on **Android standalone** the OS/browser provides back; but an **iOS standalone PWA has
no back button and no edge-swipe-back**, so an in-app back on *pushed* screens is the only
way back there. The correct model is **root vs. pushed**, not "phone vs. app":
- **Root screens = bottom-tab destinations** (`/browse`, `/standings`, `/matches`,
  `/groups`): **no back button.** The tab bar is the navigation. **`/browse` correctly has
  no back today — do NOT add one** (this was explicitly checked during the walkthrough).
- **Pushed screens** (Login, Signup, Forgot/Reset, tournament detail, sub-pages): keep a
  back/"up" affordance, and make it a **true** back.

**Decision (owner, 2026-07-21): Approach A — universal true-back on pushed screens.** Do
**not** gate the button on OS/standalone detection (UA sniffing is brittle; `navigator.userAgentData`
can't even see iOS). One shared component, correct in all three contexts.

### Fix (frontend only)

- **[RED]** Unit test (RTL, alongside the auth page tests in
  `packages/frontend/src/pages/__tests__/`): render Login with a non-trivial history entry,
  click the back control, assert it calls **history-back** (e.g. mock `useNavigate` and
  assert `navigate(-1)`), and with **no** in-app history it falls back to the parent. Confirm
  it fails today (it calls `navigate('/')`).
- **[GREEN]** Add a shared `BackButton` (and/or `useBack()` hook) under
  `packages/frontend/src/components/shared/`:
  ```ts
  // canGoBack: react-router v6 sets location.key === 'default' on a cold first load
  // (nothing pushed within the router) → nothing to pop → use the parent fallback.
  const location = useLocation()
  const navigate = useNavigate()
  const back = (fallback = '/') =>
    location.key !== 'default' ? navigate(-1) : navigate(fallback)
  ```
  Replace the hardcoded chevrons on Login/Signup/ForgotPassword/ResetPassword with it, passing
  each screen's logical parent as the fallback (auth pages → `/`; ResetPassword → `/login`).
- **⚠️ Do NOT** add a back button to any **root** tab screen (`/browse`, `/standings`,
  `/matches`, `/groups`). Roots stay back-less by design.
- **Verify:** new tests green; existing auth tests + `e2e/auth.spec.ts` still green; manual:
  from Login reached via a link, back returns to that link's page (not always `/`); a
  cold-loaded `/login` still has a working back (→ `/`). One logical change, own branch/commit
  (§11), TDD (§4).

---

## ISSUE-7 — Guest bottom nav leaks auth-gated Standings/Matches tabs 🟠 {#issue-7}

*(Found 2026-07-21 during the manual walkthrough, as an unauthenticated user on `/browse`.)*

**Symptom:** an **unauthenticated** user on `/browse` sees a bottom nav with **Tournaments ·
Standings · Matches**. Tapping **Standings** or **Matches** bounces them to `/login` (a
dead-end), and even after signing in the destination is empty (see below).

**Root cause (verified):** `BottomNav` in
`packages/frontend/src/components/shared/ResponsiveLayout.tsx` is auth-aware and already
hides **Groups** (`:164`), **Notifications** (`:183`), and **More** (`:206`) behind
`isAuthenticated`. But the base `tabs` array (`:138-142`) — Tournaments/Standings/Matches —
renders **unconditionally**, so the two auth-gated tabs were simply missed. Both routes are
protected and both render the **same personal hub**:
- `App.tsx:87-95` `/matches` → `<ProtectedRoute><MyTournamentsHub tab="matches" /></ProtectedRoute>`
- `App.tsx:122-131` `/standings` → `<ProtectedRoute><MyTournamentsHub tab="standings" /></ProtectedRoute>`
- `ProtectedRoute` (`components/ProtectedRoute.tsx:29-31`) does a **bare** `<Navigate
  to="/login" replace />` — no context, no return-to.

So these are **"My Tournaments"** (player-scoped) views, not global data a guest could
preview — empty for a brand-new user until they've joined a tournament. That's why "show them
and route to login" is a poor fit here (weak teaser + context-free bounce + empty payoff).

**Decision (owner, 2026-07-21): Option B — reduced guest nav + a sign-in affordance.** For a
guest, hide Standings/Matches (guard them like the other gated tabs) **and** add a single
**"Sign in / Register"** nav item in their place, so the bar isn't a lonely one-tab stub and
the guest has an obvious next step.

### Fix (frontend only)

- **[RED]** Unit test `BottomNav` (mock `useAuth`) for both states:
  - **guest** (`isAuthenticated:false`) → renders `nav-browse` and a new `nav-signin`; does
    **not** render `nav-standings` / `nav-matches` / `nav-groups` / `nav-notifications`.
  - **authenticated** → renders the full set unchanged (`nav-browse/standings/matches/groups/notifications` + More).
  Confirm the guest case fails today (Standings/Matches present).
- **[GREEN]** In `ResponsiveLayout.tsx`:
  1. Keep `/browse` always; render the `/standings` and `/matches` tabs only when
     `isAuthenticated` (split the array or add an `authOnly` flag + filter — match the style of
     the existing `isAuthenticated && (...)` guards).
  2. When `!isAuthenticated`, render a **"Sign in / Register"** item (`data-testid="nav-signin"`,
     e.g. 🔑) linking to `/login`. Add the testid to `e2e/config.ts` (§8).
  3. **Apply the same treatment to the desktop `TopNav`** (`ResponsiveLayout.tsx:224-245`,
     which lists Tournament/Groups/Standings/Matches/Bracket/More) — verify/handle its guest
     state so the leak isn't just moved to desktop.
- **Verify:** new tests green; existing ResponsiveLayout tests still green
  (`components/shared/__tests__/`); e2e: a guest on `/browse` sees no `nav-standings`/`nav-matches`
  and does see `nav-signin`. TDD (§4), own branch/commit (§11).
- **Note (not a bug):** the "no navbar on `/browse`" observed during the walkthrough was a
  **Playwright headed-viewport artifact** (a forced 844px viewport in a shorter window pushed
  the `position:fixed` bar off-screen). The nav renders correctly on real devices — do not
  chase it. (Related device concern tracked separately in ISSUE-8.)

---

## ISSUE-8 — Bottom nav has no safe-area-inset handling; viewport lacks `viewport-fit=cover` 🟠 {#issue-8}

*(Found 2026-07-21 during the manual walkthrough, investigating fixed-bottom-nav behavior on phones.)*

**Symptom (real devices, not the test harness):** on notched iPhones (X+) and gesture-nav
Android — **especially the installed standalone PWA** — the bottom ~34px is the system
home-indicator / gesture zone. The fixed 72px tab bar has **no safe-area padding**, so its
bottom row of icons/labels can be crowded under the home indicator (reduced tap target /
overlap).

**Root cause (verified):**
- `packages/frontend/src/styles/responsive.css:12-24` — `.responsive-bottom-nav { position:
  fixed; bottom: 0; height: 72px; … }` with **no** `env(safe-area-inset-bottom)`.
- `responsive.css:158-166` — `.responsive-main { padding-bottom: 88px; }` clears the 72px nav
  but has no safe-area addition.
- `packages/frontend/index.html:7` — `<meta name="viewport" content="width=device-width,
  initial-scale=1.0">` — **no `viewport-fit=cover`**, so `env(safe-area-inset-*)` currently
  evaluates to 0 ("safe by accident": content is kept within the safe area, but you can't go
  edge-to-edge, and adding `viewport-fit=cover` later *without* the padding would break it).
- Safe-area handling **is** applied to the More drawer (`ResponsiveLayout.tsx:74`,
  `paddingBottom: env(safe-area-inset-bottom)`) but was **missed on the nav bar and main
  content** — and the design spec explicitly requires it (`ui/section-foundation.jsx:454`:
  *"Respect `env(safe-area-inset-*)` … Tab bar bottom padding = 28px (home indicator)"*). So
  this is a consistency gap, not an unknown.
- Manifest is `"display":"standalone"` (`dist/manifest.webmanifest`) → the installed PWA is
  the primary at-risk surface.

### Fix (frontend only — CSS + one meta tag)

The standard trio (do all three together — they're coupled):
1. `index.html:7` viewport meta → append `, viewport-fit=cover`.
2. `.responsive-bottom-nav` → add `padding-bottom: env(safe-area-inset-bottom)` and make the
   total height `calc(72px + env(safe-area-inset-bottom))`.
3. `.responsive-main` bottom padding → `calc(88px + env(safe-area-inset-bottom))` so content
   still clears the now-taller nav.
- **Optional / low-priority (note, don't block):** `min-height: 100vh` → `100dvh` on
  `.responsive-container` (`responsive.css:171`) and the `100vh` page containers
  (`BrowseTournaments.tsx:89`, `responsive.css:679`) for robustness against mobile toolbar
  show/hide. Not required here since the nav is `position: fixed`.
- **[Test/verify]** No unit harness for pure CSS; verify in a device emulator with a home
  indicator (DevTools device toolbar / responsive mode with safe-area, or a real notched
  device): the tab bar clears the home indicator, content clears the taller nav, and no
  double-counted gap on non-notched devices (where the inset is 0). Note in the commit that
  final confirmation is on a real device/emulator.
- **⚠️ Do NOT** confuse this with the walkthrough's off-screen-nav observation — that was a
  Playwright headed-viewport artifact (see ISSUE-7 note), not a device safe-area problem.

---

## ISSUE-9 — Browse discovery board shows raw status enums + lists expired tournaments as "Reg Open" 🟠 {#issue-9}

*(Found 2026-07-21 during the manual walkthrough, asking whether Browse is "ongoing" vs
"available to register".)*

**Product intent (confirmed, `rac8-4s-HL.md:255`):** Browse is a **discovery board** — a list
of public tournaments spanning multiple lifecycle states, each carrying a **status badge**
(`draft, open, closed, active, complete`) so the user can tell "register now" from "already
underway". Registration is a per-tournament action on `/tournament/:id/browse`, allowed only
when open and before the deadline (`rac8-4s-HL.md:286` — "Check deadline not passed (409)").

**Decision (owner, 2026-07-21): keep the discovery board.** Do **NOT** repoint Browse at the
registration-only query — it must keep showing in-progress tournaments (for spectating). The
work is to make the board *read* correctly.

**Symptom:** the board doesn't deliver on that intent:
1. **Raw enum badges.** Only `registration_open` gets a friendly label; every other status
   renders the raw DB enum — an in-progress tournament shows a badge reading
   **"Group_stage_active"** (underscores, first-letter-capitalized), not "In Progress".
2. **Featured card has no status badge at all** — inconsistent with the list cards.
3. **Expired tournaments read as open.** A `registration_open` tournament whose
   `registration_deadline` has passed still shows the green **"Reg Open"** badge; a guest taps
   it, tries to register, and is rejected with `DEADLINE_PASSED`.

**Root cause (verified):**
- **Badge label:** `packages/frontend/src/pages/BrowseTournaments.tsx:210` (list cards) —
  `{tournament.status === 'registration_open' ? 'Reg Open' : tournament.status}` — the fallback
  emits the raw status. The **featured card** (`BrowseTournaments.tsx:170-184`) renders sport +
  `matchFormat` badges but **no status badge**.
- **No date filter / no deadline transition:** `db.ts:284-314` `listPublic` filters by status
  only (`publishedStatuses` at `db.ts:289` = `registration_open, group_stage_active,
  group_stage_complete, knockout_active`; full status set at `db.ts:385`), with **no**
  `registration_deadline` check. Nothing auto-transitions `registration_open →
  registration_closed` at the deadline — the only auto-close sweep in the codebase is for
  **polls** (`workers/auto-close-*`), and `registration_closed` is set solely in the
  group-launch flow (`routes/player-groups.ts:930`). So a past-deadline tournament stays
  `registration_open` indefinitely and keeps showing as open.
- **Inclusion asymmetry:** `group_stage_complete` is included but `registration_closed` and
  `knockout_complete` are not, so a tournament briefly **vanishes** from Browse between
  registration closing and the group stage starting. Looks accidental.

### Fix

**Frontend (the primary fix — display layer):**
- **[RED]** Unit test (`BrowseTournaments`): assert each status maps to a **friendly** badge
  and **no badge ever contains an underscore / raw enum**; assert a `registration_open`
  tournament with a **past** `registrationDeadline` badges as **"Closed"** (not "Reg Open");
  assert the **featured** card renders a status badge. Confirm failing today.
- **[GREEN]**
  1. Add a shared `statusBadge(status, registrationDeadline)` helper mapping **all** shown
     statuses to friendly copy (e.g. `registration_open`+future → "Reg Open";
     `registration_open`+past-deadline → "Closed"; `group_stage_active` /
     `group_stage_complete` / `knockout_active` → "In Progress"; and labels for
     `registration_closed` / `knockout_complete` if included below). **Never render the raw
     enum.**
  2. Use it on **both** the list cards (`:210`) and the **featured** card (`:170-184`) —
     factor the card badge row so they don't drift again.
- **⚠️ Do NOT** switch Browse to `listAvailable` (`db.ts:316`, registration-only) — that's the
  rejected "registration list" direction; it would drop in-progress tournaments.

**Backend (small, decide inclusion):**
- Reconcile `publishedStatuses` (`db.ts:289`) so the lifecycle has no discovery gap: add
  `registration_closed` (and likely `knockout_complete`) so a tournament doesn't disappear
  mid-lifecycle, and badge them via the helper above. Terminal states
  (`tournament_complete`/`completed`/`abandoned`/`draft`) stay excluded — completed/past
  tournaments must **not** appear.
- **Do NOT** add a `registration_deadline > now()` filter that *removes* expired-open
  tournaments — the discovery board keeps showing them, just badged "Closed" (handled in the
  frontend helper). (This differs from the earlier draft, which assumed the registration-list
  direction.)

**Verify:** new unit tests green; existing Browse tests still green; manual — an in-progress
tournament badges "In Progress", a past-deadline open one badges "Closed", the featured card
shows a badge, and no card shows a raw `snake_case` status. TDD (§4), own branch/commit (§11).

**Related follow-up (out of scope here — file below if pursued):** there is **no lifecycle
job** that ever moves a normal tournament to `registration_closed`/`completed`, so a
tournament can sit in `registration_open` forever. This fix makes it *read* "Closed", but a
stale open tournament still lingers in Browse indefinitely — the durable fix is an
organizer/lifecycle transition (deadline sweep or organizer action), tracked separately.

---

## ISSUE-10 — Featured section: replace positional `[0]` with a curated "Register soon" set 🟡 {#issue-10}

*(Found 2026-07-21 during the manual walkthrough — asking how Featured tournaments are chosen;
owner then specified the desired behavior. Enhancement, not a bug — the current code "works",
it just isn't curated. Pairs with ISSUE-9: same page + `listPublic`.)*

**Current behavior (verified):** the "FEATURED" section is not curated at all — it renders
`filteredTournaments[0]` (`BrowseTournaments.tsx:170`) and "All Tournaments" renders
`.slice(1)` (`:197`), both off one `created_at DESC` list. So Featured = the single
newest-created tournament. No popularity, no urgency, no spots logic.

**Decision (owner, 2026-07-21): make Featured a curated "Register soon" set.**
- **Label:** "Register soon" (replaces "FEATURED").
- **Eligibility (all must hold):** `status = 'registration_open'` **AND** `registration_deadline
  > now()` (still open) **AND** `registered_count < max_players` (has spots available).
- **Sort:** `registered_count DESC` (most-registered first), **tiebreak by soonest
  `registration_deadline`** (ascending) — honoring the "soonest-closing / Register soon" framing
  alongside the most-registered sort *(owner-confirmed 2026-07-21)*.
- **Limit:** max **3** entries.
- The ≤3 Featured tournaments are **excluded** from the "All Tournaments" list below (no
  duplicate cards — matches today's `slice` behavior) *(owner-confirmed 2026-07-21)*. "All
  Tournaments" stays the ISSUE-9 discovery board (open + in-progress, badged).

**Data gap (must fix — blocks both "most-registered" and "has spots"):** `listPublic`
(`db.ts:284-314`) returns **no** registered count (route mapping `tournaments.ts:1120-1128`).
Add `registered_count` per tournament via a **single-query subquery**, not N+1 —
`(SELECT COUNT(*) FROM public.player_registrations pr WHERE pr.tournament_id = t.id) AS
registered_count`. (A per-tournament counter already exists —
`countRegistrationsForTournament`, `db.ts:502` — and `tournaments.ts:1502` already does this
pattern in another listing; do **not** loop it per row.)

### Fix

**Where to compute — pick one (recommend the simpler unless scale says otherwise):**
- **(a) Client-side (simplest, recommended at current scale):** extend `listPublic` to include
  `registered_count`; compute Featured in `BrowseTournaments` (filter → sort → `slice(0,3)`),
  which also naturally respects the active **format filter** (All/Singles/Doubles) the page
  already applies. **Caveat:** the page fetches only the first page (`limit=10`), so Featured
  is drawn from page 1 — fine while the public list is small; revisit if it grows.
- **(b) Server-side (correct at scale):** a dedicated selection (e.g. `/tournaments/featured`
  or a `featured=true` param) applying eligibility+sort+limit in SQL. Correct beyond page 1 and
  cleanly testable, but the format filter must then be passed through as a query param.

**TDD:**
- **[RED]** Assert the Featured set: includes only open + future-deadline + has-spots
  tournaments; **excludes** full (`registered_count >= max_players`), expired-deadline, and
  in-progress ones; ordered most-registered desc (tiebreak deadline asc); capped at 3; and the
  featured ids don't duplicate into "All Tournaments". For (a), unit-test the selection helper;
  for (b), integration-test the query/endpoint. Confirm failing today (Featured is `[0]`).
- **[GREEN]** Add `registered_count` to the query; implement the selection; relabel the section
  "Register soon"; render up to 3 cards; exclude them from "All Tournaments".
- **Verify:** new tests green; existing Browse tests green; manual — a nearly-full open
  tournament features above a sparsely-registered one, a full one never features, an
  expired-open one never features (ties into ISSUE-9), and no card appears twice.

**Coordinate with ISSUE-9:** both touch `BrowseTournaments.tsx` + `listPublic`. ISSUE-9 adds
the status-badge helper + expired-open labeling on the discovery board; ISSUE-10 adds
`registered_count` + the Featured selection. Sensible to do on one branch, **separate commits**
(§11). Note the Featured `deadline > now()` filter means expired-open tournaments are excluded
from Featured automatically.

---

## ISSUE-11 — `POST /:id/register` is a public, unthrottled email-send trigger 🟠 {#issue-11}

*(Found 2026-07-21 during the manual walkthrough, examining the guest-registration flow.)*

**Decision (owner, 2026-07-21): keep open, self-service guest registration** (matches "discovery
is public"). This issue does **not** gate the endpoint — it **rate-limits** it.

**Symptom (security):** `POST /tournaments/:id/register` is **public + unauthenticated** (per
`CLAUDE.md §9`) and **has no rate limiting**. Any anonymous caller can make the server send a
magic-link email to **any address** (`sendMagicLinkEmail`), repeatedly — an **email-bombing /
spam / SES-reputation** vector. Login and forgot-password are throttled; this parallel
email-send path is not.

**Root cause (verified):** the handler (`tournaments.ts:1139`) validates `email`/`name` and
proceeds straight to registration + email send — **no limiter middleware**. Contrast the
existing, reusable pattern already used by two other email-send routes:
- `routes/auth.ts:225` (login) and `routes/auth.ts:552` (forgot-password) apply
  **`createRateLimitMiddleware(keyGenerator, opts)`** (`middleware/rate-limit.ts`), backed by a
  pluggable **Redis-capable** store (`selectRateLimitStore`, multi-instance safe), with
  config-driven limits (`config.ts:474-478`, both **5 / 15 min**, env-overridable) and a test
  hook `clearRateLimitStore()`.

So the fix is applying an existing, merged pattern — no new infrastructure.

### Fix (api only)

- **[RED]** Integration test: hammer `POST /:id/register` past the limit → **429**; assert an
  under-limit request still succeeds; use `clearRateLimitStore()` for isolation (copy the
  login/forgot rate-limit tests).
- **[GREEN]**
  1. Add limits to `config.ts` `limits.rateLimit` (env-overridable, mirroring login/forgot):
     `registerPerEmailMaxAttempts` / `registerPerEmailWindowMs` **and**
     `registerPerIpMaxAttempts` / `registerPerIpWindowMs`.
  2. Apply **two** limiter keys on the register route (one combined key is not enough — see
     below):
     - **per-email** `register:email:${email.trim().toLowerCase()}` — the sharp anti-bombing
       defense (a legit user registers an address ~once). **Recommend ~3 / 15 min.**
     - **per-IP** `register:ip:${req.ip}` — bounds a runaway cannon from one source.
       **Recommend a *generous* ~20–30 / 15 min**, env-tunable.
  3. `keyGenerator` must **normalize** email (trim+lowercase) and **tolerate a missing/malformed
     `email`** (fall back to IP-only) so a bad body can't crash the limiter — the handler's own
     400 still fires afterward.
- **⚠️ Why not just clone login's key** (`login:${email}:${ip}`, *combined*): distinct emails
  from one IP produce distinct keys, so an attacker rotating victim addresses from a single IP
  is **not** stopped. The per-IP-alone key is what caps a cannon; the per-email-alone key is
  what protects a single victim. Need both.
- **⚠️ Venue / shared-IP caveat (why per-IP stays generous):** at a tournament venue, many
  legitimate registrations come from **one NAT'd public IP** (venue Wi-Fi), and a captain may
  register several people (incl. self + doubles partner) from **one phone**. A tight per-IP cap
  would false-positive there. Keep per-IP generous + env-tunable; let the **per-email** cap do
  the precise work.
- **Verify:** new test green; login/forgot rate-limit tests still green; manual — repeated
  registers to one email 429 quickly, while a burst of *different* emails from one IP stays
  under a generous cap.

---

## ISSUE-12 — Guest-registration UX: ambiguous framing, no auth-aware one-click, doubles partner unsurfaced, email-typo safety 🟠 {#issue-12}

*(Found 2026-07-21 during the manual walkthrough of the guest-registration flow. Access model =
open self-service, kept — see ISSUE-11. This is about making that flow clear + complete.)*

**Symptom:** on `/tournament/:id/browse` the registration section reads ambiguously — a heading
**"Register for this tournament"** sits above an **email + name** form with *"Already have an
account? Sign In"* — so a guest can't tell whether they're **creating an app account** or
**registering for the tournament**. It's actually lightweight guest registration (email+name →
magic link, **no password**), but nothing says so. Four concrete gaps:

1. **Ambiguous copy** (`TournamentBrowse.tsx:147-152`). Fix: say it plainly — e.g. *"Register as
   a guest — we'll email you a link to confirm. No account or password needed."* — and visually
   separate the "Sign In" path from the guest form.
2. **No auth-aware one-click Register.** The page has **no `useAuth`** — it shows *everyone* the
   guest email+name form, so a **signed-in** user is asked to re-type their email instead of
   getting a one-click "Register". Fix: branch on auth — authed → one-click register; guest →
   the email+name form. **Backend note:** `POST /:id/register` currently *requires* `email`+`name`
   in the body (`tournaments.ts:1143-1148`); a one-click authed flow needs the endpoint to derive
   identity from the token instead (check whether an authed register path already exists via
   `resolveTournamentPlayer` before adding one).
3. **Doubles partner not surfaced.** The backend supports
   `partnerSelection: { type: 'select' | 'invite' }` (`tournaments.ts:1167-1184`, incl. the
   "Cannot partner with yourself" guard `:1180`), but the form is **only email+name** — no
   partner field. A person can't register a doubles team / invite a partner from the page even
   though the API supports it. Fix: surface partner selection for doubles tournaments (invite by
   email / select existing). *(Also feeds ISSUE-11's venue/"self + partner from one phone"
   rate-limit caveat.)*
4. **Email-typo safety.** A mistyped email sends the magic link to the wrong address and the user
   silently gets nothing. **Recommend:** echo the entered email on the "check your email"
   confirmation (`TournamentBrowse.tsx:81`) with an edit/resend path, plus the existing
   `type="email"` inline validation. **Skip a second confirm-email box** (weak evidence, hurts
   completion). *(Owner-preferenced direction 2026-07-21 — adjust if desired.)*

**Related (now decided — see ISSUE-14):** the magic link currently lands on **`/signup?token=…`**
(full account creation *with a password*), so even the "guest" path funnels into app-account
signup today. The owner decided (2026-07-21) to build the lightweight **"continue as guest, no
password"** landing — scoped in **ISSUE-14** (wire the emailed link to the existing `/auth/verify`
guest-session exchange). This issue's copy/UX fixes stand alongside it; coordinate the "create a
password later" upgrade CTA with ISSUE-14.

**Fix (TDD):** unit-test authed-vs-guest rendering (one-click button vs. form), guest copy
present, doubles shows a partner field, confirmation echoes the email. Update
`docs/assistant-help.md` if user-visible behavior changes (§9); add new `data-testid`s to
`e2e/config.ts` (§8). Pairs with ISSUE-13 (same page) — likely one branch, separate commits.

---

## ISSUE-13 — Tournament detail page has no design parity + missing description/deadline/capacity 🟠 {#issue-13}

*(Found 2026-07-21 during the manual walkthrough — the detail page reads as unstyled black-and-white
next to the browse list.)*

**Symptom:** `/tournament/:id/browse` looks like a placeholder — plain text, **default unstyled**
form controls, no colors/icons/cards — unlike the browse list and the rest of the app; and it
**omits key tournament info** (no description, deadline not shown, no registered/capacity count).

**Root cause (verified):**
- **Not wrapped in `ResponsiveLayout`** (`App.tsx:71-73`, `element={<TournamentBrowse />}`) — no
  shared header/nav, unlike `/browse`.
- **Bare styling** (`TournamentBrowse.tsx`): default `<input>` (`padding:8`) and the browser
  **default gray** `<button>` (no background/color/radius); no cover colors, cards, badges, or
  icons. (A few tokens are used — `--ink-500`, `--border-soft` — but none of the app's visual
  language.)
- **Missing data:**
  - **Description:** the public `GET /tournaments/:id` (`tournaments.ts:1629-1637`) **omits
    `description`** even though the table has it (`findById` returns the full row). → **backend +
    frontend.**
  - **Deadline:** the endpoint **does** return `registrationDeadline` (`:1635`) but the page
    **never renders it**. → **frontend-only.**
  - **Registered / capacity count:** not returned, not shown (HL doc:269 "Registered: 12/16"). →
    **backend** (same `registered_count` subquery as ISSUE-10) **+ frontend.**
  - **Rules / Venue / Contact** tabs (HL doc:280) — absent; lower priority, note per HL.

**Fix (TDD):**
- **Backend:** add `description` (and `registered_count`) to `GET /tournaments/:id`.
- **Frontend:** restyle `TournamentBrowse` to the app's visual language (wrap in the shared
  layout and/or apply the token/card/button styles the browse cards use); render description,
  deadline (already available in the payload), and registered/capacity.
- Tests + verify against the HL doc's detail-page spec (`rac8-4s-HL.md:263-281`).

**Coordinate:** the `registered_count` addition here and in **ISSUE-10** (`listPublic`) are the
same subquery pattern — align them. **ISSUE-12** touches the same page — do 12/13 on one branch,
separate commits (§11).

---

## ISSUE-14 — Emailed magic link forces account creation; wire it to the existing guest-session exchange 🟠 {#issue-14}

*(Found 2026-07-21 during the manual walkthrough. Owner decided 2026-07-21 to honor the original
intent: click link → guest session → your tournament, with account creation as an **optional
upgrade**, not a requirement.)*

**Symptom:** a guest who registers by email is forced to **create a full account (choose a
password)** to proceed. The emailed magic link points at **`/signup?token=…`** ("Complete
registration") — the only frontend route that consumes the token — so there is no passwordless
"click link → you're in as a guest" path, even though guest (magic-link) sessions are a
first-class auth mode in the app.

**Key finding — the hard part already exists (backend):**
`GET /tournaments/:tournamentId/auth/verify?token=` (`tournaments.ts:1313-1349`) already
validates the magic-link token, asserts tournament membership, mints a guest session via
`generatePlayerSession(...)`, and returns:
```json
{ "playerToken": "<session>", "expiresIn": <ttl>, "playerId": "...", "tournamentId": "..." }
```
The frontend simply never calls it (confirmed: `grep -r playerToken packages/frontend/src` → **0
matches**), and `useAuth` already accepts + persists magic-link player sessions
(`useAuth.tsx:115,165`). **This is wiring, not new machinery.**

### Fix (frontend + a one-line backend edit)

- **[RED]** Frontend test: a guest-landing route, given a valid token, calls `/auth/verify`,
  stores the returned `playerToken` as the session, and redirects into the tournament; an
  invalid/expired token shows an error with a way to re-request the link. (`/auth/verify` itself
  is already backend-covered — don't rebuild it.)
- **[GREEN]**
  1. **New public guest-landing route** (e.g. `/tournament/:tournamentId/join`) that reads
     `?token=`, calls `GET /tournaments/:tournamentId/auth/verify?token=`, hands `playerToken` to
     `useAuth`'s session persistence, and redirects to the tournament view (e.g. `/matches`). No
     `ProtectedRoute`.
  2. **Repoint the email** (`email-adapter.ts:100`) from `/signup?token=` to that route; relabel
     the button "Complete registration" → e.g. "View your tournament". **Include `tournamentId` in
     the link** — the sender already has it (`sendMagicLinkEmail(..., tournamentId, ...)`) — so the
     route can call the tournament-scoped verify directly. *(Alternative, if not changing the URL
     shape: the route first calls `GET /tournaments/auth/magic-link?token=` to read `tournamentId`
     from the payload — the pattern `Signup.tsx:34` already uses — then calls verify.)*
  3. **Optional-upgrade CTA:** on the tournament/profile view, offer "Create a password to save
     your account" routing to the existing `/signup` flow. **Keep `/signup?token=` working** for
     anyone who wants an account immediately — this issue *adds* the guest path, it does not remove
     account creation.
- **Minor decisions (sensible defaults — no grill):** guest session TTL is already
  `config.auth.sessionTtlSeconds`; the exact home of the upgrade CTA (tournament header vs.
  profile) is implementer's choice.
- **⚠️ Security:** the verify link carries a token in the URL — it must **not** be cached or
  logged (consistent with the PWA "SSE token-in-URL must never be cached" rule). The guest-landing
  route should strip the token from the URL after exchange (replace the history entry) so it isn't
  left in history/referrer.
- **Docs to update (do these in the same change):**
  - `docs/assistant-help.md` (§9) — the changed guest flow (click link → guest session, no
    password; account creation optional).
  - **`BACKLOG.md`** — the SES-thread note is now **stale** and must be corrected. In the
    "🗒️ Open design threads" SES bullet, the "**Also found but out of scope for P0.6:**" sentence
    currently reads that the magic link "pre-fills email for full account signup, not a lightweight
    'continue as guest' path; **a guest wanting to view their tournament without creating a password
    still has no route**" and that "grep for `playerToken` in `packages/frontend/src` returns zero
    matches." Both become false once this ships — revise it to state the guest-landing route now
    exists (built via ISSUE-14, consuming `/auth/verify`'s `playerToken`), with account creation as
    an optional upgrade.
- **Verify:** register as a guest, pull the emailed link, click → land signed-in **as a guest**
  inside the tournament with **no password prompt**; the "create a password" upgrade is present but
  optional. TDD (§4), own branch/commit (§11).

**Supersedes** ISSUE-12's "open sub-decision" and the `BACKLOG.md` SES-thread mention noted above —
that route is this issue.

---

## Not yet triaged / follow-ups

- Any routes ISSUE-1's audit turns up with the same strict-auth-where-dual-intended gap
  (add rows here, fix separately).
- **Tournament lifecycle has no automatic status transitions** (surfaced by ISSUE-9): nothing
  moves a normal tournament off `registration_open` at its `registration_deadline`, or to
  `completed` when finished — the only auto-close sweep is for polls. So tournaments linger in
  `registration_open` indefinitely and stale-open ones keep appearing in Browse (ISSUE-9 only
  fixes the *label*). Durable fix = a deadline/lifecycle sweep or organizer-driven transition;
  needs its own design + issue.
- Deliverability: UAT SES mail lands in Gmail **spam** (DMARC can't align from a
  `gmail.com` sender) — a known, owner-accepted trade-off, tracked in
  `UAT_PWA_LAUNCH.md` P0.6-SES, not a bug. The real fix is a verified domain (§2).
