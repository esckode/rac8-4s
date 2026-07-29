# Completed UAT Issues — 2026-07-20/21 AWS deploy session

Resolved issues from the UAT deploy session, archived out of
[`UAT_ISSUES.md`](./UAT_ISSUES.md) once shipped (CLAUDE.md §12 — a reader working the
open queue should not pay for fourteen closed ones). The status table in that file is
still the index and links here; anchors are unchanged.

**All issues below are resolved and merged on branch `fix/uat-issues`.** Open work —
including follow-ups these issues surfaced — lives in `UAT_ISSUES.md`.

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
| [ISSUE-15](#issue-15) | 🟠 | Doubles partner: three competing mechanisms, the one wired to the UI is a no-op — consolidate on an email-based invite | api + frontend |
| [ISSUE-16](#issue-16) | 🟠 | Partner pairing is first-*inviter*-wins — an invite mutates the invitee's registration | api + frontend |
| [ISSUE-17](#issue-17) | 🟠 | Solo doubles registrants are auto-paired with a stranger without consent | api + frontend |
| [ISSUE-18](#issue-18) | 🔴 | Confirming a partner has no accept-time guard, and `confirmPartner` is not atomic | api · data |
| [ISSUE-19](#issue-19) | 🟠 | No notification fires when a doubles team is formed, by any path | api |
| [ISSUE-20](#issue-20) | 🟠 | Withdrawal never dissolves a team, and no query filters withdrawn registrations | api · data |
| [ISSUE-21](#issue-21) | 🔴 | An invite nobody answered becomes a real team at group creation | api · data |
| [ISSUE-22](#issue-22) | 🟡 | Login greets guests with "Welcome back."; page titles/descriptions end in full stops | frontend · copy |
| [ISSUE-23](#issue-23) | 🟠 | Auth pages hardcode a 390×844 phone frame — clipped below 390, gutters above | frontend · layout |
| [ISSUE-24](#issue-24) | 🟠 | An account with no linked player gets `TOKEN_INVALID` + "sign in again" — an unbreakable loop | api + frontend |
| [ISSUE-25](#issue-25) | 🟡 | `seed-test-accounts.ts` creates accounts with no linked player — every seeded login hits ISSUE-24 | scripts · dev |
| [ISSUE-26](#issue-26) | 🟠 | Bottom nav labels clip off-screen at every phone width (6 items don't fit under ~444px) | frontend · layout |
| [ISSUE-27](#issue-27) | 🟡 | Dark entry vs light app is intentional — document the boundary; replace the emoji icons | frontend · design |
| [ISSUE-28](#issue-28) | 🟠 | Nav: collapse Standings + Matches into one "Play" hub; four items | frontend + api |
| [ISSUE-29](#issue-29) | 🟠 | Temporarily block public browse + public registration; keep both invite paths working | frontend + api |
| [ISSUE-30](#issue-30) | 🔴 | `/tournament/:id` redirects to a literal unsubstituted path — group launch's payoff step is broken | frontend |
| [ISSUE-31](#issue-31) | 🔴 | A group-launched casual tournament never generates matches — there is nothing to play | api |
| [ISSUE-32](#issue-32) | 🟠 | SSE `/tournaments/:id/events` 403s for registered accounts — live updates dead for participants | api |
| [ISSUE-33](#issue-33) | 🟠 | `tournaments.creator_id` is polymorphic — account id or player id by creation path | api · data |

**The doubles-pairing cluster (ISSUE-16–21) is fully resolved.** Ship order, schema/migration notes,
and the grill outcomes behind it are in [the cluster section](#doubles-pairing-cluster).

---

## ISSUE-1 — Registered-account users locked out of Groups (dual-auth gap) 🔴 {#issue-1}

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): added a `resolvePlayerSession` dual-auth
shim to `player-groups.ts` (mirrors `routes/player.ts`'s `resolvePlayerId`), replacing all 24
direct `requirePlayerSessionAuth` call sites. Frontend: `useGroupList`/`MyGroups` now
distinguish a 401 (re-auth prompt) from a genuine load failure, and the empty-groups state
has a "Create your first group" CTA. Audit of other routes recorded under "Not yet triaged"
below (not fixed here, out of scope).

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): replaced the `state list | grep` guard
with an unconditional `tofu state rm ... 2>/dev/null || true`. Live verification on the next
real teardown is still recommended per the original note.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): capture `tofu state list` to a variable
once and match with a pipe-free `[[ ... ]]` test, matching the fix pattern in ISSUE-2.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): the build line now runs inside
`(cd "$REPO_ROOT" && npm run build ...)`, matching the adjacent `npm ci`.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): removed all six status-bar blocks from
Login/Signup/ForgotPassword/ResetPassword (both render branches on the latter two). Design-mockup
files (`DesignSpec.tsx`, `ui/section-*.jsx`) left untouched, as instructed.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): added `useBack(fallback)` (true
`navigate(-1)` with a parent fallback on a cold load) and wired it into the Login, Signup,
ForgotPassword (form state), and ResetPassword (both states) chevrons. ForgotPassword's
success-state chevron (resets local state, not a route) and ResetPassword's "Sign in now" CTA
were deliberately left as-is — neither is a back affordance.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): Option B implemented — `BottomNav` hides
Standings/Matches for a guest and shows a `nav-signin` item instead; the desktop `TopNav` gets
the same treatment for Groups/Standings/Matches.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): applied the trio together —
`viewport-fit=cover`, nav height/padding grow by `env(safe-area-inset-bottom)`, and
`.responsive-main`'s bottom padding grows to match. Verified via production build; final
confirmation on a real notched device/emulator remains, per the original note.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): added a shared `statusBadge(status,
registrationDeadline)` helper (never renders the raw enum; past-deadline `registration_open`
badges "Closed"), used on both the featured and list cards. Backend `publishedStatuses` now
includes `registration_closed`/`knockout_complete`, closing the discovery gap.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): `listPublic` now returns `registeredCount`
via a single-query subquery; `selectFeatured()` (client-side, option (a)) filters/sorts/caps at
3; section relabeled "Register soon"; featured ids excluded from "All Tournaments".

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): applied `createRateLimitMiddleware` twice
— per-email (3/15min, sharp) and per-IP (25/15min, generous), both env-overridable. Also added
`clearRateLimitStore()` isolation to `tournaments.spec.ts`, which reuses one literal email
across many unrelated tests.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): plain guest copy added; signed-in visitors
get a one-click register (no backend change needed — email/name come from `useAuth`'s `user`);
doubles tournaments get a partner-invite-by-email field (the "select existing partner" variant
is a follow-up, invite-by-email covers the primary gap); confirmation echoes the entered email
with a "Wrong email? Edit" path.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): `GET /tournaments/:id` now returns
`description` + `registeredCount`; `TournamentBrowse` restyled to the app's surface/card/Button
tokens, reuses the ISSUE-9 `statusBadge` helper, and renders description/deadline/capacity. Back
link now uses `useBack()` (ISSUE-6) instead of a fixed `Link`.

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

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): new public `/tournament/:tournamentId/join`
route exchanges the token via the existing `GET /:tournamentId/auth/verify`, stores the
`playerToken`, strips the token from the URL, and redirects to `/matches`. Emailed link repointed
from `/signup?token=` (relabeled "View your tournament"); `/signup?token=` still works unchanged
as an optional upgrade. Found + fixed a real React StrictMode double-invoke race against the
single-use verify token along the way (caught via live e2e, not just unit tests). The
optional-upgrade CTA ("Create a password to save your account") now renders on `/matches` for
guest sessions only, routing to the existing `/signup` flow.

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

## ISSUE-15 — Doubles partner: three competing mechanisms; the one wired to the UI is a no-op 🟠 {#issue-15}

**✅ Resolved** (2026-07-22, branch `fix/uat-issues`): consolidated onto one email-based entry
point on `POST /:tournamentId/register` (`body.partnerEmail`, replacing the old `partnerSelection
{type, value}` shape entirely). The backend resolves the email to one of three outcomes:
- **(A) belongs to a registered account** → in-app notification (`postPersonalNotification`)
  linking straight to the existing `/registrations/:id/confirm` page. `NotificationCard` gained a
  `metadata.registrationId` deep-link, mirroring its existing `metadata.groupId` convention.
- **(B) no account, but an existing player row** (registered as a guest before) → magic link via
  the existing `generateMagicLinkToken` + `sendMagicLinkEmail`, same as the ticket specified.
- **(C) a genuinely new email** → a new email-bound `partner-invite` token type (mirrors the
  existing `GroupInvitePayload`/`generateGroupInviteToken` pattern used for player-group invites)
  + a new public route `POST /:tournamentId/partner-invites/accept` + a new frontend page
  `PartnerInviteAcceptPage.tsx` (mirrors `InviteAcceptPage.tsx`'s 5-state machine). The invitee's
  own 18+ attestation is collected **at accept time**, not invite time — the requester can't
  attest on someone else's behalf, and the existing `findOrCreatePlayerByEmail` gate has no other
  path to create a player row.

Deleted the `select`/`invite` `partnerSelection` branches and their validation from `register`
entirely. Kept mechanism 3 (`available-partners` / `partner-requests` / `confirm`) as-is — branch
A/B acceptance reuses its existing `PATCH .../confirm` endpoint unmodified (beyond the deadline
exception below).

**Two mechanics the original decision didn't spell out, resolved during implementation:**
- **Capacity hold for a not-yet-existing partner (sub-decision 1).** A real
  `player_registrations` row can't be reserved for someone with no player id yet, so branch C
  instead marks the *requester's own* registration `pending_partner_confirm` with `partner_id`
  left `NULL` — a state combination that didn't exist before this change. A new
  `countPendingPartnerInviteHolds` query (matching exactly that combination) adds one virtual slot
  to the `/register` capacity check when doubles, so a solo registrant can't take the last spot
  out from under a pending invite. No schema change; the existing nullable `partner_id` and
  `status` enum already cover it.
- **Deadline exception (sub-decision 3)** lives on the *shared* `PATCH .../confirm` endpoint
  (used by both this issue's branch A/B and the pre-existing `partner-requests` flow): accepting
  past `registration_open` is now allowed when the registration's `registered_at` (bumped to
  invite-sent-time by `updateRegistrationWithPartner`) predates `registration_deadline`. This is a
  pure relaxation — never more restrictive than before — so mechanism 3 benefits too without any
  behavior change for the non-deadline case.

**Follow-up pass (2026-07-22, branch `fix/issue-15-followups`) — verification found three defects
in the above, all now fixed.** The first two were invisible to the original suite because its own
tests worked around them:
1. **Branch A didn't work end to end.** The notification deep-links to `/registrations/:id/confirm`,
   whose page sends `localStorage.auth_token` — for a registered account that is an **account JWT**,
   but `PATCH .../confirm` took `requirePlayerSessionAuth` (magic-link sessions only) and returned
   401. The integration test passed only because it minted a player session with
   `generatePlayerSession`, a token branch A's user never holds. `tournaments.ts:~1924` was already
   listed in UAT_ISSUES' untriaged dual-auth follow-ups; branch A had made it load-bearing. Now uses
   `resolveTournamentPlayer`, the repo's dual-auth helper (same shim as ISSUE-1).
2. **The capacity hold never expired**, so sub-decision 1 was only half implemented — the ticket
   said "holds a capacity slot, **with an expiry** … without the expiry, invites to dead addresses
   squat spots indefinitely." Verified: a hold 30 days old still returned `TOURNAMENT_FULL`. The
   hold now lapses with the invite token that reserves it (`magicLinkTtlSeconds`, 24h), and an
   expired invite no longer blocks the requester from re-inviting. Owner also asked for an explicit
   escape hatch, so `DELETE /registrations/:id/partner-invite` + `GET /:id/my-partner-invite` were
   added and surfaced in `PartnerFinder` ("waiting for …" + Cancel invite).
3. **The deadline exception was far broader than sub-decision 3.** Because
   `registered_at < registration_deadline` holds for essentially every legitimate registration, the
   `status !== 'registration_open'` guard was effectively neutralized — a confirm during
   `group_stage_active` returned 200, forming a team after the bracket existed. Narrowed via a
   shared `partnerConfirmWindowOpen` helper: the exception now applies only in
   `registration_closed`, where the ticket's "the requester acted in time" reasoning actually holds.

Left as designed (owner call, 2026-07-22): an invite to someone already registered solo still pulls
them into `pending_partner_confirm` rather than 409ing — sub-decision 4's "already-registered" would
have made the email entry point unable to reach solo registrants, which is the thing this issue set
out to unify.

**Known inconsistency, deferred to [ISSUE-16](UAT_ISSUES.md#issue-16) (owner call, 2026-07-23).**
This issue's three branches do not share one model of where a pending invite lives, so they disagree
about who wins a contested partner:

```
Branch B (partner has an existing player row):  first inviter 202, second inviter 409 INVALID_STATE
Branch C (partner is a brand-new email):        both 202; accept #1 200, accept #2 409
```

Branch C is the intended behaviour — A inviting X must not stop B inviting X, and whichever pairing
X accepts becomes final. Branches A/B instead mirror-write the pairing onto X's registration at
invite time (`tournaments.ts:1344-1351`), which makes the *first inviter* win rather than X's own
choice. ISSUE-16 also carries a 🔴 defect this verification surfaced in the **pre-existing**
`partner-requests` flow — `PATCH .../confirm` has no accept-time guard, so one player can confirm
two suitors and end up on two "confirmed" teams — which is reachable from the shipped `PartnerFinder`
UI and is not caused by this issue's changes. A **decline** path was considered here and is
deliberately not built: under ISSUE-16's model an ignored invite touches nothing of the invitee's,
which removes the need for it.

**Test coverage:** `partner-invite-by-email.spec.ts` (24 tests — three branches, capacity hold +
expiry, rate limit, deadline exception + its upper bound, dual-auth confirm, cancel, legacy-field
cleanup), frontend RTL (`PartnerFinder.spec.tsx`, `TournamentBrowseDetails.spec.tsx`,
`PartnerInviteAcceptPage.spec.tsx`, `NotificationCard.spec.tsx`), and a Playwright scenario in
`tournament-discovery-registration.spec.ts`. The `data-testid`s are now in `e2e/config.ts`, and the
dead `REGISTRATION.DEFAULT_PARTNER_TYPE_*` constants left behind by the `partnerSelection` removal
are gone.

*(Original ticket content below, preserved for context.)*

**🔲 Open** (raised 2026-07-22 while verifying ISSUE-12's "select existing partner" deferral —
the deferral turned out to be the smaller half of the problem.)

**Symptom:** on `/tournament/:id/browse` a doubles registrant types their partner's email into the
field ISSUE-12 added, gets no error, and **nothing happens** — no team, no pending state, no email
to the partner. Meanwhile a full partner request/accept subsystem already exists in the API and is
reachable from no UI at all.

**Root cause (verified by reading the code):** there are **three** partner mechanisms, and the
frontend is wired to the only one that does nothing.

1. **`register` → `partnerSelection: { type: 'invite' }` — a no-op stub.**
   `tournaments.ts:1291-1304`. Validates the email at `:1204-1210` (format + the "Cannot partner
   with yourself" guard), then the branch body **never uses `value`**: it registers the requester
   and logs `team.created`. The comment says it outright — *"Store invitation info (will be linked
   when partner signs up) / For now, we just create the registration."* No partner is stored, and
   the only mail sent is the magic link to the **requester** (`:1313-1320`).
   **This is what the UI calls** — `TournamentBrowse.tsx:83-84` always sends `{ type: 'invite',
   value: partnerEmail }`.
2. **`register` → `partnerSelection: { type: 'select' }` — works, unreachable.**
   `tournaments.ts:1258-1290`. Takes `value` = a **player ID**, creates paired registrations both
   directions via `updateRegistrationWithPartner`, which sets `status = 'pending_partner_confirm'`
   (`db.ts:588`). Nothing in the frontend ever sends `type: 'select'`.
3. **A dedicated partner-request subsystem — complete, unreachable.**
   - `GET  /:id/available-partners`  (`tournaments.ts:1750`) — roster of solo registrants, already
     auth-scoped via `resolveTournamentPlayer` (**not** public, so no anonymous-roster exposure)
   - `GET  /:id/partner-requests`    (`:1762`) — incoming requests for the caller
   - `POST /:id/partner-requests`    (`:1774`) — request a partner by `targetPlayerId`; requires
     doubles + `registration_open` + **both parties already registered** (`:1808-1810`) + neither
     already partnered (`:1811-1816`); sets `pending_partner_confirm`
   - `PATCH /registrations/:registrationId/confirm` (`:1829`) — the target accepts; `db.ts:601,615`
     flips `partner_confirmed` and links both sides
   - `DELETE /registrations/:registrationId` (`:1874`) — withdraw
   - `GET /:tournamentId/players` already returns `partnerConfirmed` (`:1733`), so "awaiting
     acceptance" is renderable **today** with no schema work.

**The schema already models the whole state machine** (`db.ts:114-116`) — don't add to it:
```ts
partner_id?: string
partner_confirmed: boolean
status: 'registered' | 'pending_partner_confirm' | 'withdrawn' | 'withdrawal_pending' | 'unpaired'
```

**Decision (owner, 2026-07-22): one email-based entry point, no picker.** The requester supplies the
partner's **email address** — email is already the durable player identity here
(`findOrCreatePlayerByEmail`, `tournaments.ts:1217`). The backend resolves it:
- **email belongs to a registered account** → in-app **notification to accept**
  (`postPersonalNotification`, used at `player-groups.ts:131`)
- **otherwise** → **magic link** emailed to the partner (`generateMagicLinkToken` +
  `sendMagicLinkEmail`, already used on this route)
- either way the requester sees **"awaiting acceptance"** until the partner confirms.

A picker is not required. `available-partners` may stay as a convenience, but it must not be the
only path — it can't reach a partner who hasn't registered yet.

**The four sub-decisions (owner-confirmed 2026-07-22):**
1. **A pending invite holds a capacity slot, with an expiry.** Otherwise the partner accepts and
   finds the tournament full, breaking a team both people believed was formed. Without the expiry,
   invites to dead addresses squat spots indefinitely.
2. **Rate-limit the partner address.** ISSUE-11's sharp per-email key is
   `register:email:${req.body.email}` (`tournaments.ts:1148-1151`) — the **requester's** address. A
   partner invite mails an arbitrary third party, so it would ride only the deliberately generous
   per-IP cap (25 / 15 min). Rotating requester emails then yields an unthrottled send path to any
   victim — **reopening exactly what ISSUE-11 closed.** The per-email limiter must cover the partner
   address too (or add a second limiter keyed on it).
3. **Accepting after the registration deadline is allowed** when the invite was sent before it — the
   requester acted in time. This is a deliberate exception: `POST /:id/partner-requests` currently
   requires `status === 'registration_open'` (`:1794`).
4. **Reuse the existing conflict guards** for an already-registered or already-partnered invitee
   (409, `:1811-1816`). Silently overwriting an existing partner is worse than refusing.

### Fix (TDD §4)

- **[RED]** Integration tests on the new entry point: (a) partner email = registered account →
  pending state + notification, no magic-link mail; (b) partner email = unknown → pending state +
  magic link sent to the partner; (c) requester sees `pending_partner_confirm` until
  `PATCH …/confirm`; (d) invite to an already-partnered player → 409; (e) partner-address rate limit
  trips (mirror the ISSUE-11 tests, use `clearRateLimitStore()`); (f) accept after deadline succeeds
  when the invite predates it. Frontend unit test: the doubles field shows "awaiting acceptance"
  after submit.
- **[GREEN]** Add the email→player resolution + the two delivery branches; wire
  `TournamentBrowse.tsx` to it; render pending/confirmed state from `partnerConfirmed`.
- **Cleanup (same branch, separate commit):** delete the `select` branch (`:1258-1290`) and the
  `invite` stub (`:1291-1304`) from `register`, and the now-dead validation at `:1193-1212`. Three
  partner mechanisms must not survive this change. Check `findAvailablePartners` /
  `findIncomingPartnerRequests` callers before removing anything else.
- **Docs:** `docs/assistant-help.md` (§9 — user-visible flow change); new `data-testid`s to
  `e2e/config.ts` (§8).
- **Verify:** a doubles guest invites a partner by email and sees "awaiting acceptance"; the partner
  gets a notification (account) or a magic link (new); accepting forms the team both directions; a
  burst of invites to different addresses from one IP is throttled.

---

## Doubles-pairing cluster (ISSUE-16 – ISSUE-21) {#doubles-pairing-cluster}

**All six resolved 2026-07-24, branch `fix-pairing`.** ISSUE-18 and ISSUE-19 were split out of
ISSUE-16 and ISSUE-17 on 2026-07-23 as independently-shippable prerequisites; ISSUE-20 and ISSUE-21
were raised the same day while grilling the split. Shipped in this order — each was small,
independently correct, and correct under both the pairing model then in place and the one that
replaced it, so none waited on the others beyond what's noted:

1. **ISSUE-18** — accept-time guard, partial unique index, and `confirmPartner` atomicity. 🔴 data
   corruption reachable from shipped UI. No dependencies.
2. **ISSUE-19** — notify on team formation, via the job queue. Made everything after it observable
   without a DB probe.
3. **ISSUE-21** — unconfirmed claims resolved at group creation. 🔴 live consent defect. Shipped
   after 19 so a cleared inviter is *told* their invite lapsed rather than silently re-paired.
4. **ISSUE-20** — dissolve a team on withdrawal; gave the codebase an "is this registration active"
   predicate it had lacked entirely.
5. **ISSUE-16** — the invite-is-a-claim rework. Depended on 18 (the accept-time guard) and 21 (the
   sweep).
6. **ISSUE-17** — the per-registration consent flag. Depended on 19 (formation notifications) and 21
   (the leftover pool's definition).

**No live data — migrations were schema-only.** The webapp was not deployed and there was no live
environment (per the IaC teardown) when this cluster shipped, so every backfill/duplicate-cleanup
step some of these issues originally called for was moot and cut. Migrations `058`–`060` only add
columns, recreate the `status` CHECK constraint, and add the partial unique index — against empty
tables. `058_confirmed_partner_unique_index.sql` (ISSUE-18),
`059_partner_claim_columns.sql` (ISSUE-16, adds `pending_partner_email`/`partner_claimed_at` and
drops `pending_partner_confirm` from the status CHECK), `060_auto_pair_consent.sql` (ISSUE-17).
ISSUE-20 and ISSUE-21 added no columns.

**Grill outcomes (2026-07-23) — decisions taken while stress-testing this cluster, before any of it
shipped:**

| # | Decision | Landed in |
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

**Four corrections to earlier drafts, kept visible so they aren't re-introduced elsewhere:**

- **ISSUE-19's stated reason was backwards.** It claimed a notification failure inside the group-
  creation transaction would roll back real teams. `postPersonalNotification` calls
  `this.pool.connect()` and opens its **own** transaction (`group-message-repository.ts:369`), so it
  never joins the caller's. The real failure is the opposite: its writes commit independently, so
  they *survive* a rollback and are *re-sent* by `retryOnDeadlock`. Integration tests could not catch
  this — per CLAUDE.md §7 the harness collapses both onto one connection and it looks atomic.
- **The job queue was the cheap option, not the expensive one.** An earlier draft called it "a new
  table, a new worker path, a new failure mode." `JobQueue` is a typed generic interface
  (`packages/worker/src/job-queue.ts:5-14`) with retry, DLQ and jobId dedupe, and there were already
  13 processors in `packages/api/src/workers/` before this cluster added a 14th.
- **No return-shape change was needed.** An earlier draft had `createGroupsForDoubles` return the
  formed teams so the route could notify. With a queue the payload is `{ tournamentId }` and the
  processor reads committed state — the teams are in the database, which is what committing them
  was for.
- **`confirmPartner` atomicity moved twice before landing.** It was not a pre-existing defect and not
  one ISSUE-16 introduced: ISSUE-18's index is what made the two-statement write half-committable.
  See the worked Gil/Eli/Fay race in the ISSUE-18 entry above.

---

## ISSUE-18 — Confirming a partner has no accept-time guard, and `confirmPartner` is not atomic 🔴 {#issue-18}

**✅ Resolved** (2026-07-24, branch `fix-pairing`): split out of
[ISSUE-16](UAT_ISSUES.md#issue-16) as a standalone 🔴 data-corruption fix that does not wait on that
rework — a player could confirm two suitors and end up "on a team" with two different people, the
last write silently winning. Fixed with three changes that are one unit, not three:

1. **Migration `058_confirmed_partner_unique_index.sql`** adds
   `CREATE UNIQUE INDEX uq_registrations_confirmed_partner ON player_registrations (tournament_id,
   partner_id) WHERE partner_confirmed = true` — the column ordering matters, since the corruption is
   two rows both pointing `partner_id` at the same player, not two rows for the same player.
2. **`confirmPartner` (`db.ts`) wrapped in one transaction** (`pool.connect()` +
   `BEGIN`/`COMMIT`/`ROLLBACK`, the `createGroupsForDoubles` pattern). Previously it linked both
   sides of a team in two un-transacted writes; once the index exists, a legitimate concurrent accept
   landing between them left a one-sided confirmed row that permanently squatted the other player's
   index slot. The transaction makes that impossible — either both writes land or neither does.
3. **Both accept-time routes** (`PATCH .../confirm` and `POST .../partner-invites/accept`) now 409
   `INVALID_STATE` when the accepting player already has a **confirmed** partner in that tournament —
   a merely *pending* claim does not block, which would reintroduce first-inviter-wins. The Postgres
   `23505` raised by a race that slips past the handler check is mapped to the same 409 body, not a
   generic 500.

**Test coverage:** `partner-confirm-atomicity.spec.ts` — the second-inviter race, the branch-C
double-accept, the confirmed-only accept guard, and the Gil/Eli/Fay half-commit scenario (force the
second write to fail and assert neither row changed, not just that the call rejected). Per
CLAUDE.md §7 the integration harness collapses both connections used by `confirmPartner`'s two writes
onto one, so the transaction-boundary test drives the race directly rather than relying on the
harness to expose it.

---

## ISSUE-19 — No notification fires when a doubles team is formed, by any path 🟠 {#issue-19}

**✅ Resolved** (2026-07-24, branch `fix-pairing`): split out of [ISSUE-17](UAT_ISSUES.md#issue-17)
so ISSUE-16/17/20/21's team-formation and un-pairing outcomes would be observable in UAT without a
DB probe. `postPersonalNotification` was called from exactly two places in the codebase, neither of
them team formation — `confirmPartner` and the auto-pair loop in `createGroupsForDoubles` both
linked/created rows and returned, silently.

Two delivery shapes, matching whether the caller already holds a transaction:

- **`confirmPartner` and `POST .../partner-invites/accept` are not in a transaction with anything
  else**, so they notify inline, best-effort, from the route — the same
  `notifyPartnerInvite(...).catch(...)` pattern already used for invite-sent notifications.
- **Group creation notifies via a new `teams.formed` job queue**, enqueued in the route *after*
  `createGroupsForDoubles` commits and the `group_stage_active` transition lands — payload is just
  `{ tournamentId }`. The enqueue is wrapped best-effort (`try`/`catch` + `log.warn`, never thrown):
  a Redis blip must not 500 an already-committed group creation, since the status guard means the
  organizer cannot retry group creation a second time. A new processor
  (`packages/api/src/workers/teams-formed-processor.ts`, the pattern of the other 13 processors)
  reads committed `teams` and `player_registrations` state, distinguishes a chosen/confirmed pair
  from an auto-pair by checking mutual confirmed `partner_id` on both rows (worded differently in the
  notification body — "confirmed" vs. "paired"), and notifies every `unpaired` leftover too.
  Registered in `worker-entrypoint.ts`'s `workers` array; `teams.formed` added to
  `packages/worker/src/types.ts`'s `JobName`/`JobPayload`.

  Posting from inside `createGroupsForDoubles`'s own transaction was considered and rejected:
  `postPersonalNotification` opens its **own** `pool.connect()` + `BEGIN` (it cannot join a caller's
  transaction), so its writes would commit independently of the surrounding transaction — surviving a
  `ROLLBACK` and getting re-sent by `retryOnDeadlock`. Per CLAUDE.md §7 the integration test harness
  collapses both onto one connection, so this failure mode is invisible in jest; the RED test for it
  (case f) asserts on the queue directly — a group creation that throws deep inside the transaction
  enqueues nothing — rather than relying on the harness to expose a rollback surviving.

**One operational cost accepted, not introduced:** this repo's dev/e2e default is
`JOB_QUEUE=bullmq` (CLAUDE.md §8), so any e2e spec that creates doubles groups now needs
`npm run dev:worker --workspace=packages/api` running, same prerequisite as the assistant/coach
specs. Noted in `scripts/e2e-setup.js`'s worker-check messaging.

**Test coverage:** `teams-formed-notify.spec.ts` (6 integration tests — inline notify on confirm and
on emailed-invite accept, the processor distinguishing chosen from auto-paired, a leftover notified
as unpaired, and enqueue-only-after-commit in both directions). Frontend e2e:
`partner-requests.spec.ts` gained two tests — the inline confirm-notify path (no worker required) and
the queue-based auto-pair path (worker required); both verified passing against live servers
(chromium). Docs: `docs/assistant-help.md` §9, `e2e-scenarios.md` (two new scenarios under "Partner
Requests & Confirmation (Doubles)"; the `partner-requests.spec.ts` selection-map row count bumped
3 → 5). The "leftover unpaired" notification wording is integration-tested only — no distinct e2e UI
surface beyond the notifications page already covered by "Feature: Notifications Center".

---

## ISSUE-21 — An invite nobody answered becomes a real team at group creation 🔴 {#issue-21}

**✅ Resolved** (2026-07-24, branch `fix-pairing`): raised while grilling [ISSUE-16](UAT_ISSUES.md#issue-16)
— branches A/B of `POST /:tournamentId/register` mirror-write a pending invite onto **both** the
requester's and the invitee's registration (`partner_id` set mutually, `status =
'pending_partner_confirm'`), and `createGroupsForDoubles`'s mutuality check only required a mutual
`partner_id` — it never checked `partner_confirmed`. An invite nobody ever opened still became a
real team at group creation.

Fixed with two changes inside `createGroupsForDoubles`'s existing transaction:

1. **A sweep runs first, before any pairing is planned:** `UPDATE player_registrations SET
   partner_id = NULL, status = 'registered' WHERE tournament_id = $1 AND partner_confirmed = false
   AND status = 'pending_partner_confirm'`. Both sides of a mirror-written claim are cleared in one
   statement (there being only one `player_registrations` row per player). The status filter
   deliberately excludes `withdrawn`/`withdrawal_pending` rows, which can also have
   `partner_confirmed = false` — those must not be silently reset to `registered`.
2. **The mutuality check is tightened** to also require `partner_confirmed = true` on both sides
   (`db.ts`'s doubles-pairing query now selects `partner_confirmed` and the pairing loop checks it),
   as a backstop independent of the sweep — belt-and-suspenders against any future write that leaves
   a mutual-but-unconfirmed link in place.

Swept players re-enter the leftover pool exactly like an ordinary solo registrant and are notified
by the existing [ISSUE-19](#issue-19) `teams.formed` pipeline (auto-paired or left-unpaired wording)
— no bespoke "your invite lapsed" copy was needed, since the doc's own RED test list didn't require
distinguishing that wording and the generic auto-pair/unpaired notification already tells the player
their status changed.

**Test coverage:** `partner-claim-sweep.spec.ts` (6 integration tests) — the headline regression (an
unanswered invite is not honored as a team), the backstop mutuality check exercised independently of
the sweep (a mutual link crafted with `status = 'registered'` so the sweep's own filter can't be
what stops it), swept players landing in the leftover pool and getting auto-paired, a confirmed team
surviving the sweep untouched, the ISSUE-15 sub-decision-3 deadline exception still working right up
until group creation, and an aborted group creation (`teamIds.length < numGroups`) rolling the sweep
back along with everything else. 3 of 6 failed before the fix: the stale claim was honored as a team
instead of being cleared, and the abort case never fired because the stale claim silently supplied
the one team needed to clear `teamIds.length < numGroups`.

---

## ISSUE-20 — Withdrawal never dissolves a team, and no query filters withdrawn registrations 🟠 {#issue-20}

**✅ Resolved** (2026-07-24, branch `fix-pairing`): raised while grilling
[ISSUE-16/17](UAT_ISSUES.md#issue-16) — `withdrawRegistration` wrote only `status` and
`withdrawal_requested_at`, never touching `partner_id`/`partner_confirmed` on either row. After a
confirmed team's one half withdrew, the other stayed "on a team" with someone who had left —
stranded, since [ISSUE-16](UAT_ISSUES.md#issue-16) requirement (3) and
[ISSUE-18](#issue-18) both refuse a new invite/confirm to a player who already has a *confirmed*
partner, and ISSUE-18's unique index made the stale confirmed row a permanent squat on that
`partner_id` slot. Separately, `countRegistrationsForTournament` and the group-creation player
query never looked at `status` at all, so withdrawn players held capacity forever and could still
be auto-paired into the bracket.

Fixed with two independent changes:

1. **`withdrawRegistration` wraps the dissolve in a transaction** (the
   `createGroupsForDoubles`/`confirmPartner` pattern) so a half-dissolve is impossible. Only a
   genuine `'withdrawn'` departure dissolves a confirmed team — `'withdrawal_pending'` is a
   post-deadline *request* awaiting the organizer, not a departure, so the team holds until it
   resolves. When it dissolves, `partner_id`/`partner_confirmed` are cleared on **both** rows (not
   just the partner's) — clearing the withdrawing player's own row too is what frees the confirmed-
   partner index slot ISSUE-18 added, since a stale `partner_confirmed = true` row would otherwise
   permanently block anyone from ever confirming a team with the freed partner again. The freed
   partner is notified inline, best-effort, from the withdraw route — this isn't a group-creation
   path, so it does not enqueue `teams.formed`.
2. **Two named predicates**, added in a new `packages/api/src/registration-status.ts` (home chosen
   because the group-creation player list is an inline query in the route, not a repo method, so
   both `db.ts` and `routes/tournaments.ts` need to import from somewhere neutral):
   ```ts
   export const COUNTS_FOR_CAPACITY = `status <> 'withdrawn'`
   export const PLAYS_IN_BRACKET    = `status NOT IN ('withdrawn', 'withdrawal_pending')`
   ```
   Capacity excludes only `withdrawn` (a pending request hasn't been granted, and only becomes
   possible after the deadline, when the seat can't be resold anyway); the bracket excludes both.
   Wired into `countRegistrationsForTournament` and the group-creation player query respectively —
   the latter also serves as the population for [ISSUE-17](UAT_ISSUES.md#issue-17)'s not-yet-built
   organizer preview.

**Test coverage:** `withdrawal-dissolve.spec.ts` (6 integration tests) — the dissolve + notification
on a pre-deadline withdrawal, a post-deadline request leaving the team intact, capacity counting
correctly both ways, exclusion from the group-creation player list (and confirmation that a
withdrawn/pending registration is left completely untouched by group creation, never even entering
the leftover pool), and the freed player immediately inviting someone else. 4 of 6 failed before the
fix: the dissolve never happened, capacity still counted a withdrawn registration, the group-creation
player list still included withdrawn/pending players, and the freed partner couldn't invite anyone
new because their row still looked confirmed.

**Frontend:** no UI surface exists for withdrawal at all — `DELETE /registrations/:registrationId`
has no caller anywhere in `packages/frontend/src` — so this is integration-tested only; noted in
`e2e-scenarios.md` rather than left silently uncovered.

---

## ISSUE-16 — Partner pairing is first-*inviter*-wins: an invite mutates the invitee's registration 🟠 {#issue-16}

**✅ Resolved** (2026-07-24, branch `fix-pairing`): raised while verifying [ISSUE-15](#issue-15) —
branches A/B of `POST /:tournamentId/register` mirror-wrote the pairing onto **both** the
requester's and the invitee's registration and auto-created the invitee's row if absent, so the
invite-time 409 refused the *second* inviter rather than letting whoever the invitee actually chose
win. Branch C (a brand-new email) already had this right — the invite lived only in the emailed
token, nothing was written to the invitee. **Owner decision:** A inviting X must never stop B
inviting X; whichever pairing X accepts becomes final, the rest fail at accept time. Depended on
[ISSUE-18](#issue-18) (the accept-time guard and its unique index) and [ISSUE-21](#issue-21) (the
group-creation sweep), both shipped first.

**Schema** — migration `059_partner_claim_columns.sql` adds `pending_partner_email` (branch C's
claim, since the invitee has no player row to hold a `partner_id` yet) and `partner_claimed_at`
(replaces `registered_at`, which used to be overwritten to mean "invite sent at" — `registered_at`
is now write-once, set only at INSERT), and drops `pending_partner_confirm` from the `status` CHECK
constraint. A claim keeps `status = 'registered'` throughout; the on-row record of a claim is
`partner_id` (invitee has a row) XOR `pending_partner_email` (they don't).

**db.ts rewrites:**
- `updateRegistrationWithPartner`/`markPendingPartnerInvite` no longer touch `status`/`registered_at`
  — one rewrite each fixes the requester side of branches A/B, `partner-requests`, and the branch-C
  accept conversion (which also needed a new `clearPendingPartnerEmail`, since converting an
  email-claim to an id-claim must drop the now-redundant email trace).
- `countPendingPartnerInviteHolds` deleted — capacity holds are reversed from ISSUE-15 sub-decision
  1. Concurrent invites over-reserved (A and B both inviting X held two slots for one future
  person), and a hold never protected anyone's ability to *play*, only a preference to play with
  someone specific. The governing rule: count people who will play, not people who might not exist.
- `cancelPartnerInvite` drops the cross-row release branch — a claim lives on exactly one row now,
  so cancelling one must never touch a different player's claim that happens to name the same
  person.
- `findAvailablePartners`/`findIncomingPartnerRequests` gate on `partner_confirmed` instead of
  `partner_id`/`status` — receiving claims is unlimited, so a player with their own live outgoing
  claim must remain invitable and visible to others until they're actually paired. Getting this
  wrong (relaxing only the status check) makes the requirement a no-op that still passes a
  status-only test.
- `confirmPartner` creates the accepting player's registration if absent (capacity-checked against
  `COUNTS_FOR_CAPACITY`) instead of silently forming a one-sided team, and voids every other
  unconfirmed claim naming the accepting player — in **both** forms, since a `partner_id`-only void
  misses the branch-C email-form regression — returning who was voided so the route notifies them
  (the [ISSUE-19](#issue-19) infrastructure). The [ISSUE-21](#issue-21) sweep in
  `createGroupsForDoubles` was updated for the new schema: it now clears
  `pending_partner_email`/`partner_claimed_at` too and is no longer scoped to the deleted status
  value — the "mutually linked but unconfirmed" scenario it was originally written against can no
  longer arise from an invite at all (this issue's requirement 1 is the durable closure), but the
  sweep still matters: `createTeam` never touches `player_registrations`, so a stale outgoing claim
  would otherwise linger on a registration group creation auto-pairs with someone else.

**tournaments.ts rewrites:** branches A/B stop mirror-writing/auto-creating the invitee's row; the
invite-time 409 narrows to *confirmed* pairings only; the register route's capacity check drops the
pending-invite virtual slot. Five sites that read the deleted status were rewritten to check claim
presence or `partner_confirmed` instead: `my-partner-invite`, `partner-invites/accept`'s pending
check, the confirm route's already-confirmed check, and the cancel route.

**A genuine chicken-and-egg bug found by running the tests, not named in the original design:** the
confirm route's dual-auth helper (`resolveTournamentPlayer`) required an existing registration to
authenticate an account-JWT holder — fine when an invite auto-created that registration, broken once
it doesn't, since branch A's whole point is an account holder confirming *before* they have one. New
`resolveConfirmingPlayer` drops that requirement for this one caller; the confirm route's own
`registration.partner_id === accountPlayerId` check right after is a strictly stronger scoping proof
than "some registration exists" ever was, so nothing is weakened. The account-JWT regression test in
`partner-invite-by-email.spec.ts` caught this immediately (403 instead of 200).

**Test coverage:** `partner-claim-model.spec.ts` (7 new integration tests — concurrent invites to
the same player, capacity ignoring pending invites, a live outgoing claim not hiding a player,
cancelling never crossing rows, the email-form voiding regression, and the partner-requests-GET
regression). `partner-invite-by-email.spec.ts` (22 tests, several assertions rewritten — a test
asserting the invitee's row went `pending_partner_confirm` at invite time was asserting the bug; the
capacity-hold describe block was inverted to assert the reversed decision). `partner-confirm-
atomicity.spec.ts` and `partner-claim-sweep.spec.ts` updated for the schema change.

**Local dev DB note:** this branch's migration recreates the `status` CHECK constraint without
`pending_partner_confirm`. A long-lived local dev/test database accumulates rows in that status from
earlier manual and e2e runs, which the new constraint then rejects — exactly the "no live data"
cluster note's premise for a deployed environment, but locally the fix is a one-time
`UPDATE player_registrations SET status = 'registered' WHERE status = 'pending_partner_confirm'`
before the migration runs, not a code change.

---

## ISSUE-17 — Solo doubles registrants are auto-paired with a stranger without consent 🟠 {#issue-17}

**✅ Resolved** (2026-07-24, branch `fix-pairing`): raised while grilling ISSUE-16 — solo
registrants left over at group creation were shuffled into a partnership with a stranger by default
(`pairUnpaired` defaults true), with no way to opt out. **Owner decision: prospective consent,
auto-pairing retained.** Consent is collected at registration, not at pairing time — registration is
closed by group creation, so a player who declines then has no path to find a partner and the only
outcome would be exclusion, not consent. Removing auto-pairing entirely was considered and rejected:
the social-mixer format's per-round re-pairing can't lose it, organizers would be stranded by
`createGroupsForDoubles`'s `teamIds.length < numGroups` guard, and it would break the capacity model
(solo registrants only correctly count toward `max_players` because they get auto-paired). Depended
on [ISSUE-19](#issue-19) (formation notifications) and [ISSUE-21](#issue-21) (the leftover pool's
definition), both shipped first.

**Migration `060_auto_pair_consent.sql`** adds `auto_pair_consent BOOLEAN DEFAULT true` — default on
preserves today's behaviour for every existing row and every client that omits the field.

**Wiring:**
- `createRegistration` takes a third `autoPairConsent` arg (default `true`). Only the register
  route's solo-registration branch reads it from the request body
  (`req.body.autoPairConsent !== false`) — every other call site (the auto-create when inviting a
  partner, `partner-invites/accept`, `confirmPartner`'s new create) keeps the default, since only
  the person registering chooses their own consent, never an inviter or a confirm acting on their
  behalf.
- `createGroupsForDoubles`'s auto-pair loop filters leftovers to consenting players before
  shuffling; the organizer's `pairUnpaired` became a ceiling on top of individual consent, not the
  sole decision. Everyone still unteamed afterward — opted out, the odd one out among consenting
  leftovers, or every leftover when `pairUnpaired` is false — is marked `unpaired` through the same
  single code path, so the "left unpaired" notification (ISSUE-19's `teams.formed` processor)
  reaches them with **no new notification code needed** — requirement 3 fell out of requirement 2
  for free.
- New `getPairingPreview` (organizer visibility before closing registration, `GET
  /:tournamentId/pairing-preview?pairUnpaired=true`) deliberately **re-derives leftovers/teamed
  independently from `createGroupsForDoubles`** rather than sharing code — decided safe once
  ISSUE-18's `confirmPartner` transaction and ISSUE-21's sweep both shipped, since "teamed" and
  "mutually confirmed" now describe the same set. A hand-written preview sharing code with group
  creation would give the organizer's only pre-close warning nothing to independently disagree
  about. `unpairedCount` handles the parity trap: `optedOut.length + consentingLeftovers.length % 2`
  when `pairUnpaired` is true, **not** `leftovers.length % 2` over everyone — that formula is only
  wrong once someone opts out, so it silently passes every test written before the flag has
  adoption.
- Frontend: `TournamentBrowse.tsx`'s doubles registration form (both the one-click and guest paths)
  gained a checkbox defaulting checked, sending `autoPairConsent` in the register body.

**Test coverage:** `auto-pair-consent.spec.ts` (9 integration tests — opt-out excluded from
auto-pairing regardless of the organizer's `pairUnpaired`, opt-in and default-absent behaving as
today, the left-unpaired notification, and five organizer-preview cases including the parity trap
and independence from group creation). Frontend: `TournamentBrowseDetails.spec.tsx` (existing suite,
unaffected) plus a new e2e scenario in `tournament-discovery-registration.spec.ts` verifying the
checkbox defaults checked and that unchecking it shows up in the organizer's preview — verified
live against real servers. That e2e pass also surfaced (and fixed) two pre-existing, unrelated bugs
in the same spec file: a `text=${regex}|text=success` locator that produces invalid selector syntax
whenever the interpolated value is a `RegExp` (as `UI_TEXT.SUCCESS.REGISTERED` is), and that pattern
not actually matching this page's real success copy ("Check your email to confirm.") regardless.

**This closes the doubles-pairing cluster** — see
[the cluster summary](#doubles-pairing-cluster) above for the full ISSUE-16–21 ship order and grill
outcomes.

---

## 2026-07-26/27 local walkthrough queue (ISSUE-22 – ISSUE-31) {#walkthrough-queue-2}

**All ten resolved 2026-07-28/29, branch-per-issue, fast-forwarded to `main` in the prescribed
order** from `UAT_ISSUES.md`'s "Before you start" table: **31 → 30 → {22, 25} → 28 → 26 → 23 → 29 →
24 → 27**. `UAT_ISSUES.md` now carries no open work from this queue. 31 and 30 shipped first because
group launch is the product and its payoff step was broken; 28 unblocked 26 (its geometry guard
asserts 28's four-item nav) and 29 (`/play` is where 29's two broken redirects point); 24 shipped
any time before an organizer-grant route, per its own severity note; 27 shipped last since it needed
28's final four-item tab set before drawing icons.

## ISSUE-22 — Login greets guests with "Welcome back."; page titles/descriptions end in full stops 🟡 {#issue-22}

**✅ Resolved** (2026-07-28, `aa4fbfc`/`a43641f`): Login's headline became "Sign in" and its subhead
dropped the now-repeated "Sign in to…" opener. Every page title/description across `Login`,
`ForgotPassword`, `ResetPassword`, `Landing` and `DesignSpec` lost its trailing full stop per the
owner's app-wide, no-exceptions rule — including the two state-gated success strings ("Code sent",
"Password updated"), which only render after an action and are the ones most likely to drift back.
Added `page-copy-convention.spec.tsx` as a durable RTL guard (renders all five pages, asserts no
title/description matches `/\.$/`), and fixed two now-stale assertions in `AuthStatusBar.spec.tsx`
and `AuthBackButton.spec.tsx` that still expected `/password updated\./i`. No e2e spec added — the
issue's own stated deviation, since a copy-only convention has no browser-only signal.

---

## ISSUE-23 — Auth pages hardcode a 390×844 phone frame 🟠 {#issue-23}

**✅ Resolved** (2026-07-28, `284edb4`): auth pages (`Login`, `Signup`, `ForgotPassword`,
`ResetPassword`, `DobScreen`) traded the hardcoded 390×844 frame for a new `.auth-shell` class
(`responsive.css`) — fluid full-width below 390px, capped and centered above it — plus
`data-testid="auth-shell"` for the geometry guard. Fixed the blob decoration SVGs'
`preserveAspectRatio` so they scale with the fluid shell instead of stretching. `layout.spec.ts`
(shared with ISSUE-26, per that issue's own coordination note) gained an "Auth page shell geometry"
describe block asserting no overflow at 360/400/430/900px.

Verification surfaced one unrelated bug, fixed in the same change: `Signup.tsx`'s "Sign in" footer
button lost focus mid-click under Playwright's coordinate-based click — a validation error appearing
mid-interaction shifted the DOM between `mousedown` and `mouseup`, so they landed on different
elements. Fixed with `onMouseDown={(e) => e.preventDefault()}`.

---

## ISSUE-24 — An account with no linked player gets `TOKEN_INVALID` + "sign in again" 🟠 {#issue-24}

**✅ Resolved** (2026-07-29, `57f1449`/`c1ac844`): a new `PlayerNotLinkedError` (403
`PLAYER_NOT_LINKED`) replaces the reused `TOKEN_INVALID` in all four dual-auth resolvers that fall
back from a magic-link session to an account JWT and then check for a linked `playerId` —
`resolvePlayerId` (`player.ts`) and `resolveTournamentPlayer` (`tournaments.ts`), both named in the
original report, plus two the report missed: `resolveConfirmingPlayer` (`tournaments.ts`, backing
the partner-confirm route) and `resolvePlayerSession` (`player-groups.ts`, backing `/player/groups` —
the exact `/groups` symptom the report's own repro described). All four share the identical
`if (!account.playerId) { throw sessionErr }` shape; fixing only the two named resolvers would have
left the confirm-partner and groups pages still looping.

Frontend: a shared `PLAYER_NOT_LINKED_MESSAGE` constant ("This account isn't set up to play yet.")
reused at all five copy sites (`MyGroups`, `PartnerRequestConfirm`, `ScoreSubmitForm`,
`PartnerFinder` ×2) instead of five near-duplicate strings, deliberately without a "sign in again"
action. `useGroupList` gained a `playerNotLinked` flag alongside its existing `unauthorized` one,
since a 403 here doesn't hit its old `res.status === 401` check. Manual verification via the seeded
`organizer@test.com` account (as the issue specified) turned out moot — ISSUE-25's fix plus a reseed
had already linked that account by the time this shipped, which is itself confirmation ISSUE-25
landed; the unlinked-account path is instead covered deterministically by an integration spec minting
a JWT with no `playerId`.

---

## ISSUE-25 — `seed-test-accounts.ts` creates accounts with no linked player 🟡 {#issue-25}

**✅ Resolved** (2026-07-28, `f114b1d`/`21685dc`): `seed-test-accounts.ts` and `seed-tournaments.ts`
now mirror the real signup sequence — `findOrCreatePlayerByEmail` before `accountRepo.create` — so
seeded accounts link a durable player exactly as a real signup would. Added a repair path, since the
seeder's own idempotency (skip if the account already exists) would otherwise leave a developer's
already-broken local DB unrepaired by the very script that fixes the bug. New
`seed-test-accounts.spec.ts` asserts against `auth.accounts` (not `public.accounts` — CLAUDE.md §7's
two-schema split) that the seeded account's `playerId` is non-null.

---

## ISSUE-26 — Bottom nav labels clip off-screen at every phone width 🟠 {#issue-26}

**✅ Resolved** (2026-07-28, `3281b1b`, alongside ISSUE-28): the geometry guard this issue specified
— Playwright asserting every `.responsive-bottom-nav-item` label's `boundingBox()` sits inside its
cell and inside the viewport (`x >= 0`), never text presence, since the clipped label was always
present in the DOM — landed as a new `layout.spec.ts` "Bottom nav label geometry" describe block.
Verified against a temporary git-content revert of the pre-28 six-item `ResponsiveLayout.tsx`, to
confirm the guard actually fails on the old geometry before confirming it passes on the new
four-item bar (58px worst case in a 90px cell — 32px of slack, versus 99px in a 60px cell before).
The actual fix, as the issue specified, was ISSUE-28's item-count reduction — no fix landed here in
isolation.

---

## ISSUE-27 — Dark entry vs light app: document the boundary, replace the emoji icons 🟡 {#issue-27}

**✅ Resolved** (2026-07-29, two-part): **Part 1** (`f3f5bf3`) — the dark-entry-vs-light-app split was
written down in `DESIGN_SYSTEM.md` §2.5 as a deliberate, owner-confirmed pattern with a rule for new
pages, rather than existing only as a coincidence of build order. Documentation only, no test, as the
issue specified.

**Part 2** (`2578e46`/`cd50357`) — a 12-icon set (`components/shared/icons/`, 24x24 stroke grammar
matching Feather/Lucide's visual style, `currentColor`, following the `LogoMark.tsx` hand-rolled-SVG
pattern) replaces the emoji in the bottom nav, the More sheet, and the tournament detail tabs.
`stroke="currentColor"` means each nav item's existing active/inactive `color` CSS rule drives the
icon for free — verified live via screenshot that the active tab renders its icon in court-blue and
inactive ones in ink-600, the one thing emoji structurally cannot do. Two more locations needed
icons than the issue's own table named — Sign out in the More sheet, and Details/Messages in the
tournament detail tabs — found by reading the components being touched rather than trusting the
enumerated list, the same gap-finding pattern that recurred across this whole queue (ISSUE-24,
ISSUE-29). Licensing: these are original path data, not retyped from Lucide/Feather, sidestepping
the issue's own "hand-rolled is not automatically licence-free" warning entirely.

---

## ISSUE-28 — Nav: collapse Standings + Matches into one "Play" hub; four items 🟠 {#issue-28}

**✅ Resolved** (2026-07-28, `ef3f8c3`/`c367c02`): nav collapsed from six items to four
(Play/Groups/Alerts/More); `/standings` and `/matches` now redirect to `/play` instead of rendering
`MyTournamentsHub`, which is deleted. The new Play hub renders a next-match card, the existing
my-tournaments list (minus its 1-tournament auto-redirect — there is now something worth showing
even with one tournament), and recent results, plus the two group-membership-keyed empty states and
the carried-over guest-upgrade CTA specified in the issue.

Backend: `buildPlayerSnapshot` (`assistant/player-snapshot.ts`) split into pure data-gathering
(returns `PlayerSnapshotData`) and the existing `formatPlayerSnapshot` string formatter, which stays
byte-identical for the coach — verified by a regression test pinning the formatted string across the
refactor. New `GET /player/snapshot` exposes the data to the hub. `docs/assistant-help.md` and
`e2e-scenarios.md` updated in the same change per §8/§9; `play-hub.spec.ts` replaces the deleted
`my-tournaments-hub.spec.ts`.

---

## ISSUE-29 — Temporarily block public browse + public registration 🟠 {#issue-29}

**✅ Resolved** (2026-07-28, `b667c16`/`7583e2e`): `publicDiscoveryEnabled` added to `AppConfig` (env
`PUBLIC_DISCOVERY_ENABLED`, default off), surfaced via new `GET /api/config` and consumed on the
frontend through `AppConfigProvider`/`useAppConfig`, exactly per the `BILLING_ENABLED`-pattern
mechanism the issue specified. `POST /:tournamentId/register` 404s when the flag is off;
`/browse` and `/tournament/:id/browse` render through a `DiscoveryGate` that falls back to a new
`NotFound` page — none existed before this, so any typo'd URL previously rendered a blank router
outlet, a pre-existing gap this closed as a side effect. The nav's Browse tab is conditional on the
flag.

All six inbound `/browse` links from the issue's own table were repointed to `/play` or removed, plus
two more surfaced only by actually running the e2e suite rather than relying on that table:
`PublicRoute.tsx`'s post-login redirect, and a stale `waitForURL`/`toHaveURL` assertion in
`tournament-discovery-registration.spec.ts` expecting the pre-flag `/browse` landing. The "six links"
count undercounted by two — worth flagging since the same gap-finding pattern (spec-table vs. actual
run) will recur on future scope-table issues.

Verified both directions live: flag on runs all 26 e2e tests across the three discovery specs; flag
off skips all 26 cleanly via a new `skipIfPublicDiscoveryDisabled()` fixture helper, and
`POST /register` returns 404 (confirmed by direct `curl`, not just the spec). The 15 pre-existing
integration specs whose fixtures registered through the now-gated route were each given an explicit
`{ config: { publicDiscoveryEnabled: true } }` override to `createTestApp` — the blast radius the
issue's default-off choice implied but did not enumerate.

**Known pre-existing, out-of-scope failure surfaced during verification, not fixed here:**
`tournament-public-registration.spec.ts` has 2 tests failing because `TournamentBrowse.tsx` renders
the abbreviated badge "Reg Open" while the tests search for `text=/registration open/i`. Confirmed
via `git diff`/`git log` that this predates this change (last touched by the unrelated, already-
closed ISSUE-17) — flagged for whoever picks it up next, not silently left unfixed.

---

## ISSUE-30 — `/tournament/:id` redirects to a literal, unsubstituted path 🔴 {#issue-30}

**✅ Resolved** (2026-07-28, `f324cc4`/`4de026c`): `App.tsx`'s bare `/tournament/:id` route redirected
to the literal, uninterpolated string `` `/tournament/:tournamentId/standings` `` — a template
literal with no `${}` inside it — so every group-launch payoff landed on an `UNAUTHORIZED` error
page instead of the tournament. Fixed with an exported `TournamentDetailRedirect` component that
reads `useParams()` and substitutes the real id via `ROUTES.TOURNAMENT_TAB`, so the target path
cannot drift from the route table again. Covered by a new `route-protection.spec.tsx` describe block
and verified live against the real group-launch flow, since that is the payoff step this broke.

---

## ISSUE-31 — A group-launched casual tournament never generates matches 🔴 {#issue-31}

**✅ Resolved** (2026-07-28, `97760ef`/`3d1ee25`): a group-launched casual tournament registered its
In-voters, set `registration_closed`, and stopped — nothing called the round-robin/doubles-group
generator, because its only reachable path (`START_GROUP_STAGE`) is organizer-authed and a group has
no organizer. Per the settled framing — "a state transition with no decision behind it," not "social
tournaments need an organizer" — the launch handler (`player-groups.ts`) and the auto-close processor
(`auto-close-processor.ts`) now call group/match creation directly once at least 2 In-voters exist,
skipping the ceremonial organizer transition entirely: the roster and format were already locked at
poll close, so there is nothing left for an organizer to decide by the time the tournament exists.

New integration coverage (`group-launch.spec.ts`, `auto-launch-hook.spec.ts`) plus a rewritten
`casual-tournament.spec.ts` e2e scenario asserting real matches exist post-launch, replacing a
version that intercepted the launch request with `page.route(...)` and asserted only that the call
was made — which is why the original suite stayed green while this flow dead-ended in production.

---

## Post-walkthrough audit (ISSUE-32 – ISSUE-33) {#post-walkthrough-audit}

**Both resolved 2026-07-29, branch-per-issue, fast-forwarded to `main` in the prescribed order: 32 →
33** (33 supersedes the workaround 32 applies, so it had to land second). Found while verifying the
2026-07-26/27 walkthrough batch above — group launch (ISSUE-31) was the first time a registered
account's own tournament actually got exercised end-to-end, and it surfaced a dual-auth gap none of
ISSUE-1's or ISSUE-24's fixes had reached.

## ISSUE-32 — SSE `/tournaments/:id/events` 403s for registered accounts 🟠 {#issue-32}

**✅ Resolved** (2026-07-29, `c7a38c2`/`852a527`): `GET /:id/events`, `POST /:id/end-session`, and
`GET /:id/groups` each hand-rolled their own dual-auth and ran `assertOrganizerOwnsTournament`
against *any* account JWT — `requireOrganizerAuth` doesn't check role, so a registered player's
account JWT reached the ownership check too, and always failed it. Each route now checks
`payload.role === 'organizer'` first, exactly like the score-submission route (`:674`) already did
correctly: organizer-role tokens are still held to ownership (2,627 organizer-created tournaments
unaffected), anything else falls back to `resolveTournamentPlayer`'s registered-participant check.
Explicitly **not** routed through `resolveTournamentPlayer` alone, which requires a registration and
would have denied every organizer who isn't also a registered participant in their own tournament.

The events route additionally maps `PlayerNotLinkedError` to its own `403 PLAYER_NOT_LINKED`
(ISSUE-24) instead of collapsing it into a generic `FORBIDDEN`, and keys its per-user SSE
connection cap on the resolved `playerId` rather than the account id when falling back to the
participant path. New `OrganizerFactory.playerRoleToken` test helper — `issueOrganizerToken`
hardcodes `role: 'organizer'` and so cannot represent a real registered player's account JWT, the
exact shape this bug needed. The events route's success-path tests use a raw `http.get` against a
real listening server rather than supertest, since the route never ends its response on success (an
open SSE stream) and a normal request/response round-trip would hang forever.

Does not touch `tournament.creator_id` itself, which still holds an account id for organizer-created
tournaments and a player id for group-launched ones — that column-level fix is ISSUE-33.

---

## ISSUE-33 — `tournaments.creator_id` holds two different id types 🟠 {#issue-33}

> **⚠ The shipped fix is deliberately interim.** Ownership branches on `group_id` because
> `MONETIZATION_DESIGN.md` §7.1 **O4** (every account is always a player) is not built — measured
> 2026-07-29, only 1 of 2,866 organizer accounts had a linked `player_id`, so there was nothing to
> normalise `creator_id` onto. **When O4 lands, delete the branch**: `creator_id` becomes uniformly a
> player id and the polymorphism this issue works around ceases to exist. The reminder also lives on
> O4's own row in `MONETIZATION_DESIGN.md`, which is where it will actually be seen.

**✅ Resolved** (2026-07-29, `1fe498c`/`9398e04`): `group_id IS NULL` and `group_id IS NOT NULL`
fully discriminate the two creation paths (measured across all 3,836 rows at decision time, no
exceptions), so no migration or new column was needed. A new `assertTournamentAccess` helper
replaces the direct `assertOrganizerOwnsTournament` calls on the three routes ISSUE-32 touched:
when a tournament's `group_id` is set, ownership is **group membership** (via the player-groups
repository's `getMemberRole`, imported into `tournaments.ts` under a `PlayerGroupRepository` alias to
avoid colliding with `db.ts`'s unrelated tournament-groups `GroupRepository` of the same name) rather
than creator identity — **any group member passes**, not just owners or the original launcher,
per the owner's "casual session is a small trust-based group" framing. This check runs *before* the
organizer-role/participant branching ISSUE-32 added, since membership grants access regardless of
role or of holding a registration — the genuinely new capability here: a group member who joined
*after* the tournament launched, and so was never auto-registered, can now still act on it (e.g. end
the session), which ISSUE-32's registration-based fallback alone could never grant.

`assertOrganizerOwnsTournament` itself is unchanged — still a plain two-string comparison, still used
exactly as before whenever `group_id IS NULL`. The new branching lives entirely in the call sites'
shared helper, which is the only place with a database connection to look up membership with.

