# UAT PWA Launch — phone testing on AWS

**Date:** 2026-07-19 (Phase 0 prerequisites added 2026-07-20)
**Status:** 📋 Runbook — **solo/technical pass** (§4) ready to execute now, blocked only
on AWS credentials. **Multi-user UAT** (inviting other testers) additionally requires
Phase 0 (§3) done first — see scope note below.
**Purpose:** Stand up the UAT stack, deploy the PWA (merged to `main` 2026-07-19,
`c150447..35c2c94`), and phone-test it on real devices. Executing §4–§6 also closes the
three DoD items deferred from the PWA merge
([PWA_CACHING_IMPLEMENTATION.md](./PWA_CACHING_IMPLEMENTATION.md) DoD items 4–5):
live `tofu plan/apply` of the SW/manifest no-cache behaviors, an install audit against
a deployed URL, and the iOS Add-to-Home-Screen check.

**Scope note:** a lone tester (you, on your own phone) can run §4 today — nothing in
Phase 0 affects a single-user pass. Phase 0 exists because opening the same deployed
stack to *other* people surfaces gaps that don't show up solo: a broken login-lockout
message, a poll that never auto-closes, an unread badge that never updates. Do Phase 0
before sending the URL to anyone else.

---

## 1. Why AWS solves phone testing

PWAs require a **secure context** (HTTPS or localhost). Local phone testing needs
workarounds (`adb reverse`, tunnels, mkcert). On AWS none of that applies: the frontend
module uses CloudFront's default certificate (`infra/modules/frontend/main.tf` —
`cloudfront_default_certificate = true`, no aliases), so every deploy gets a free
`https://d<hash>.cloudfront.net` URL with a globally trusted cert. Any phone can open
it directly — no domain purchase, no client setup.

## 2. The install URL

**There is no separate download URL — a PWA installs from the app's own address.**
Visit the app root in the phone's browser; the browser offers installation because the
origin serves `manifest.webmanifest` + a registered `service-worker.js` over trusted
HTTPS (with the no-cache CloudFront behaviors added on the `pwa-caching` branch).

The URL exists only after `tofu apply`; retrieve it with:

```bash
tofu -chdir=infra output -raw cloudfront_url
```

**Origin stability caveat:** the `d<hash>` is minted per distribution. A
`destroy`→`apply` cycle produces a *new* origin — installed apps on phones die with
the old one (new install required; offline caches and queues don't carry over). Fine
for UAT rounds. Production will want a custom domain in front of CloudFront so
installed PWAs survive infrastructure changes — that is the point at which buying a
domain becomes worthwhile, and it needs an ACM cert + `aliases` in the frontend
module (not built; note for the production-launch grill).

## 3. Prerequisites for multi-user UAT (TDD)

Six items surfaced during the coverage-gap / backlog review (2026-07-19) and the
email/notification readiness audit (2026-07-20). Each is
scoped and gated independently below; do them as separate branches/commits per
CLAUDE.md §11 (one logical change per commit), red test → confirm it fails for the
right reason → green implementation → verify, per CLAUDE.md §4. **P0.1+P0.2 are the
one pairing to always do together** — the rest are gated by what the UAT test script
actually exercises (see each item's "Required if" line). **P0.2 itself spans two
packages** (its backend `retryAfterSeconds` addition and its frontend `Login.tsx` UI)
— treat those as their own RED/GREEN commit pairs in sequence (backend first, since
the frontend e2e step needs the field to exist), not one mixed commit.

### P0.1 — `trust proxy` behind the load balancer (BACKLOG.md PR-1)

**Required:** always, before any multi-user round. **Type:** correctness/observability
fix, small.

*Finding, corrected from an earlier claim in this conversation:* I previously said
missing `trust proxy` would cause rate-limit collisions across different testers. I
verified that's **not accurate** — the only limiter using `req.ip`
(`routes/auth.ts:226`, login) keys on `` `login:${email}:${req.ip}` ``, so distinct
testers with distinct emails don't collide even with a constant LB-relayed IP; the
other IP-adjacent limiter (`forgot-password`, `routes/auth.ts:552`) doesn't use IP at
all. So this is **not** the login-collision blocker I described — correcting that here
rather than carrying it forward. It's still worth fixing before multi-user UAT because:
(a) it's the backlog's own 🔴 "do first, platform-wide" item; (b) any IP-based audit
logging or future IP-only limiter silently inherits the bug otherwise; (c) with it
unset, the IP half of today's login key is dead weight (always the LB's address),
quietly weakening whatever defense-in-depth that key was meant to add.

**Topology (verified 2026-07-20, corrects an earlier "one ALB hop" assumption):**
production/UAT traffic is **client → CloudFront → ALB → Node**, i.e. **two** proxy
hops, not one. `infra/modules/frontend/main.tf` routes `api_path_patterns` to an
`alb-api` CloudFront origin using the `AllViewerExceptHostHeader` origin request
policy (`all_viewer_except_host`, line ~57) — CloudFront forwards the real client IP
to the ALB, which then adds its own hop. A `trust proxy` value of `1` would trust only
the ALB and misattribute `req.ip` to CloudFront's edge address, not the real client —
the same class of bug this item exists to fix, just with the wrong hop count.

- **[RED]** Extend the existing `packages/api/src/__tests__/unit/app.spec.ts`
  (pattern: `createApp(...)` + `supertest`, see its "Request ID middleware" describe
  block) with a case asserting `req.ip` resolves to the originating test-client address
  when the request carries a **two-entry** `X-Forwarded-For` chain (`<real-client>,
  <cloudfront-edge>`) — i.e. simulate the real topology, not a single-hop chain.
  Confirm it fails today (Express ignores `X-Forwarded-For` entirely without
  `trust proxy` set, so `req.ip` falls back to the immediate socket peer).
- **[GREEN]** `app.set('trust proxy', 2)` in `packages/api/src/app.ts:152` — the
  numeric-hops form, sized to the verified two-hop topology, not blanket `true`
  (blanket trust is itself a spoofing risk for any code that later keys purely on IP).
  If the red test's assertion and Express's actual `trust proxy` hop-counting direction
  disagree, trust the test (write it against Express's documented behavior — trusting
  N hops closest to the server, client IP is the first untrusted address from the
  left) over any specific number asserted here.
- **Verify:** the new test passes; existing login-limiter tests unaffected (key still
  includes email — see the P0.2 finding on why that matters).

### P0.2 — Login 429 rate-limit UI (BACKLOG.md FE-GAP-1)

**Required:** paired with P0.1 — without this, a legitimately-locked-out tester (5 bad
attempts, e.g. a mistyped magic-link password) sees a blank failure with no
explanation, not a functional collision, but still the most visible thing testers not
already fixed would hit. `Login.tsx` has zero handling of a 429; compare
`ResetPassword.tsx:178`, which already branches on `response.status === 429`.

**Test-doc note:** the Gherkin scenario already exists —
`e2e-scenarios.md`, "Feature: Offline Support & Error Handling" →
"Scenario: Rate limit error shows countdown" (kept; not part of the block marked
superseded above it). Its implementing spec lived in `e2e/offline.spec.ts`, which was
**deleted** during the PWA branch (superseded by `pwa-*.spec.ts`) — the scenario text
survived, the test did not. Re-author it as a new spec, do not assume it still exists.

**Backend gap (verified 2026-07-20 — this is the reason P0.2 is not frontend-only):**
the shared limiter's 429 body (`packages/api/src/middleware/rate-limit.ts`, the
`RATE_LIMITED` object built at line ~145) is `{ code: 'RATE_LIMITED', message: 'Too
many attempts. Try again later.' }` — **no time value at all**. The middleware already
computes `windowSeconds` (`Math.ceil(options.windowMs / 1000)`, line ~104) right above
that object literal, but doesn't include it. Without it, a client-side "countdown" has
nothing to count down from except a value it would have to duplicate/guess — the
Gherkin scenario's "Try again in 15 minutes" cannot be built honestly without this.
(Contrast `ResetPassword.tsx:178`, whose *separate*, inline 429 handlers in
`routes/auth.ts` — not this shared middleware — already send `attemptsRemaining`; that
pattern is a remaining-*attempts* count, not a time countdown, so it isn't a template
for the time value needed here.) Fix is two lines, shared by every route on this
middleware (login, forgot-password): add `retryAfterSeconds: windowSeconds` to the
429 body.

- **[RED] (backend)** Extend `packages/api/src/__tests__/` coverage of
  `middleware/rate-limit.ts` (or add a case to whichever existing spec exercises the
  429 path) asserting the response body includes `retryAfterSeconds` equal to the
  configured window in seconds. Confirm it fails today (field doesn't exist).
- **[GREEN] (backend)** Add `retryAfterSeconds: windowSeconds` to the object literal
  in `rate-limit.ts` (~line 148).
- **[RED] (frontend)** New `packages/frontend/e2e/login-rate-limit.spec.ts` (or add to
  `auth.spec.ts` if that reads more natural next to the other login scenarios):
  5 failed logins with a unique test email → 6th attempt asserts "Too many attempts"
  text, disabled form fields, and a visible/ticking retry countdown seeded from
  `retryAfterSeconds`, per the Gherkin scenario. Also a `Login.spec.tsx` unit case
  mirroring `ResetPassword.spec.tsx`'s 429 test shape. Confirm both fail (no such UI
  exists yet — `Login.tsx` currently has zero `status === 429` handling).
- **[GREEN] (frontend)** `packages/frontend/src/pages/Login.tsx`: branch on
  `status === 429` following the `ResetPassword.tsx:178` structural pattern (read the
  429 branch, don't copy its field names) — error message, disabled form fields, and a
  countdown timer initialized from `retryAfterSeconds` and ticking down client-side
  (re-enable the form at zero). No existing `data-testid`s on `Login.tsx`'s error UI —
  add new ones and register them in `e2e/config.ts` TESTIDS per CLAUDE.md §8, don't
  invent ad hoc selectors in the spec.
- **Verify:** backend + frontend unit + e2e all green; full auth e2e regression
  unaffected; `forgot-password`'s 429 (same shared middleware) gains the field too as
  a side effect — harmless, out of scope to build UI for it.

### P0.3 — Poll auto-close sweep has no production caller (BACKLOG.md BE-GAP-1)

**Required if:** the UAT test script includes availability polls or casual-tournament
launches (player-groups flows). Skip if UAT is scored purely on tournament +
PWA/offline behavior. `processAutoCloseSweep` (`workers/auto-close-processor.ts`) is
fully built and tested but nothing schedules it — polls testers create will simply
never auto-close.

- **[RED]** Extend `packages/api/src/__tests__/integration/auto-close-sweep.spec.ts`
  (or a new `sweep-scheduler.spec.ts` alongside `assistant/sweep-scheduler.ts`'s own
  tests) asserting a `registerAutoCloseSweepJob` exists and registers a BullMQ
  repeatable job. Confirm red (function doesn't exist).
- **[GREEN]** Add `registerAutoCloseSweepJob` following the exact pattern of
  `registerAssistantSweepJobs` (`assistant/sweep-scheduler.ts`) and wire it into
  `worker-entrypoint.ts` alongside the existing `registerPartitionJobs` /
  `registerAssistantSweepJobs` calls (~lines 74–84).
- **Verify:** new test green; `npm run dev:worker` boot log shows the job registered
  (same manual check pattern the assistant sweep jobs already use).

### P0.4 — Groups unread badge not SSE-driven (BACKLOG.md FE-GAP-2)

**Required if:** the UAT script includes group chat with testers switching between
tabs/pages — otherwise cosmetic (badge just doesn't update live; a manual refresh
fixes it). Test already exists and self-skips:
`e2e/player-groups.spec.ts:255` ("Unread badge appears on My Groups nav tab..."),
guarded by `test.skip()` at line 279 until the behavior ships — **this is already the
red test**; no new authoring needed.

- **[RED]** Remove the `test.skip()` guard at `player-groups.spec.ts:279`; confirm it
  fails for the right reason (badge count never increments).
- **[GREEN]** Wire a `message.created` SSE listener into the auth/groups context
  (`ResponsiveLayout.tsx` already has `MyGroupsUnreadBadge` + `groupsUnread` state per
  the backlog note) to increment the badge when the viewer isn't on that group's page,
  and reset on open. Keep it distinct from **P1.11** (history refetch-on-reconnect) —
  this is the nav badge only.
- **Verify:** un-skipped test green; no regression in the existing groups e2e suite.

### P0.5 — Age-gate e2e fixture rot (found during the PWA regression check)

**Required:** before treating *any* pre-UAT full-suite regression run as meaningful —
otherwise real regressions from P0.1–P0.4 (or anything else) can hide inside the
~116 already-red baseline. Root cause (verified 2026-07-20): registration now requires
`dob_attestation` (18+ age gate), but roughly half of `e2e/fixtures.ts`'s ~20 exported
helpers still build registration payloads without it — not one call site, a scattered
per-helper gap.

- **[RED]** Not new product behavior, so no new red test — instead, capture the
  baseline: `npx playwright test 2>&1 | tee /tmp/pre-p0.5-run.log`, record the failing
  count and which specs fail with an `AGE_ATTESTATION_REQUIRED`-shaped error.
- **[GREEN]** Audit `e2e/fixtures.ts`'s helpers lacking `dob_attestation` (`grep -L`
  against the ones that already have it) and add the same
  `{ dateOfBirth: '2000-01-01', policyVersion: 'v1' }` shape the working helpers use.
- **Verify:** re-run the full suite; the `AGE_ATTESTATION_REQUIRED` failures should
  drop to zero. Any *remaining* failures after this fix are the two other
  already-documented pre-existing causes (unrelated `dev:worker` not running, the
  documented SSE timing flake) — re-triage only if new failure signatures appear.

### P0.6 — Magic-link registration never sends an email (hard blocker for external testers)

**Required:** always, before opening the deployed URL to anyone who isn't you with
direct DB/API access. **Not required** for the solo/technical pass (§4) — you can pull
the token yourself. Found 2026-07-20 auditing email/notification readiness; verified
directly, not taken on report.

**Finding:** `packages/api/src/routes/tournaments.ts:1285-1297` generates the
magic-link token via `generateMagicLinkToken(...)` and returns it **in the JSON
response body** (`magicLinkToken: magicLink.token`) with a response `message` field
that reads `"Registration email sent to ${player.email}"` — **no email send call
exists anywhere in that handler.** The frontend believes the backend sends it too
(`TournamentBrowse.tsx` code comment: "the backend issues a magic-link email; on
success we tell...") and only ever shows a "check your email" success state — grepping
the entire frontend for `magicLinkToken` returns **zero matches**, so it doesn't even
auto-consume the token from the response as a fallback. Net effect: a real tester who
registers today sees a success screen and receives nothing, with no path forward.

**Do NOT remove `magicLinkToken` from the response** — `e2e/fixtures.ts` (~10 call
sites, e.g. lines 416–418, 456, 509–511) reads it directly to drive test registrations
without opening email, and that pattern is correct for tests. This fix is **additive**:
send a real email *alongside* the existing response field.

**Also verified while investigating (context, not required for P0.6 itself):**
- Password reset (`routes/auth.ts`, via `email-adapter.ts:40-77`
  `sendPasswordResetEmail`) already has a real, working SendGrid integration
  (`services/email-service.ts:48-116`, a genuine `fetch` to SendGrid's API) — this
  path is **not** broken, just pointed at mock. `server.ts:53` correctly resolves
  config via `getAppConfig()`, which respects the `EMAIL_SERVICE` env var.
- `infra/environments/uat.tfvars:20` currently sets `email_service = "mock"`. Getting
  *any* real email (magic-link or reset) in UAT also requires flipping this to
  `sendgrid` and providing `SENDGRID_API_KEY` — infra/env work, not code.
- AWS SES has no real implementation (`email-service.ts:153` — the code's own comment:
  "logs success without actually sending") and no SES resource exists in infra at all.
  SendGrid is the only real provider today; don't set `email_service = "aws_ses"`
  expecting it to work.
- A separate, narrower bug: `worker-entrypoint.ts:95` builds its email service from
  `DEFAULT_APP_CONFIG.email.service` (hardcoded `'mock'`) instead of `getAppConfig()`,
  so the background worker's notify-email path ignores `EMAIL_SERVICE` regardless of
  env. Doesn't affect registration or password reset (both go through `server.ts`,
  which is correct). Moot for this UAT round since `uat.tfvars` is mock anyway; worth
  its own small fix whenever someone actually turns email on for real.

- **[RED]** Extend the registration integration tests (wherever `POST
  /tournaments/:id/register` is already covered, e.g. near the existing
  registration specs in `packages/api/src/__tests__/integration/`) with a case
  asserting the email adapter's send method is called with the player's email and a
  link containing the magic-link token when a player registers. Confirm it fails
  today (no send call exists).
- **[GREEN]** Add a `sendMagicLinkEmail` function to `email-adapter.ts`, structurally
  mirroring the existing `sendPasswordResetEmail` (lines 40-77) — same adapter, same
  error handling shape, different template/subject — and call it from the register
  handler in `routes/tournaments.ts` (~line 1285), after `generateMagicLinkToken`,
  alongside (not instead of) the existing response body.
- **Verify:** new integration test green; full existing e2e regression unaffected
  (fixtures still read `magicLinkToken` from the response exactly as before); manually
  confirm in the phone-test round (§5) that a real registration on the deployed UAT
  stack (with `email_service = sendgrid` + a real key set) delivers an actual email.

## 4. Runbook (solo/technical pass)

1. **Credentials (user):** `aws configure` (region `us-east-2`) or SSO login; verify
   with `aws sts get-caller-identity`.
2. **Stand up UAT** per `IaC-implementation.md`: `tofu plan` — **confirm the two new
   `ordered_cache_behavior` blocks** (`/service-worker.js`, `/manifest.webmanifest`,
   CachingDisabled policy) appear in the diff (deferred S7 verification) — then
   `apply`.
3. **Deploy** per the `IaC-implementation.md` Step 7a runbook: clean
   `npm run build`, `aws s3 sync` the dist, then re-upload the two PWA files with
   `--cache-control "no-cache"`; deploy the API per the same doc.
4. **Get the URL** (see §2) and open it on the phones.

**Before inviting other testers:** confirm Phase 0 (§3) items required by your test
script are done — at minimum P0.1+P0.2+P0.6 (P0.6 is the hard blocker: without it, no
external tester can complete registration at all).

## 5. Phone test matrix

Per platform, at `https://<dist>.cloudfront.net/`:

**Android (Chrome)**
- [ ] Install prompt offered (or ⋮ → "Install app"); icon + name correct
- [ ] Launches standalone (no browser chrome)
- [ ] Open a tournament's matches online → airplane mode → relaunch from icon:
      shell boots, **stays signed in** (D11), offline banner + "Updated HH:MM" shown,
      matches/standings/bracket render from snapshot
- [ ] Submit a score offline → "Saved offline" pending badge (never success)
- [ ] Reconnect → queued score replays; badge clears; score visible

**iOS (Safari)**
- [ ] Share → Add to Home Screen: name + icon correct (`apple-touch-icon`)
- [ ] Launches standalone
- [ ] Same offline pass as Android. Expected platform difference: no Background
      Sync on iOS — replay fires on app foreground/online (by design, §2 of
      [PWA_CACHING_DESIGN.md](./PWA_CACHING_DESIGN.md))

**Deployed-origin checks (any machine)**
- [ ] `curl -I https://<dist>/service-worker.js` → `cache-control: no-cache`
      (same for `/manifest.webmanifest`)
- [ ] Lighthouse (or the S9-equivalent underlying checks) against the deployed URL
- [ ] Update flow: redeploy a trivially changed build → open installed app →
      "Update available — Refresh" toast appears; tapping applies it

## 6. Closeout

- Record results in the DoD header of
  [PWA_CACHING_IMPLEMENTATION.md](./PWA_CACHING_IMPLEMENTATION.md) (items 4–5).
- Update BACKLOG.md: mark whichever of PR-1/FE-GAP-1/BE-GAP-1/FE-GAP-2 were completed
  in Phase 0 as ✅ Built; note P0.5's before/after failure count in this doc; add a
  BACKLOG.md row for P0.6 (magic-link email) and the `worker-entrypoint.ts` config bug
  it surfaced, since neither was previously tracked there.
- Any defect found → red test → fix on a branch (not part of this runbook).
- **Teardown** per the established pattern once testing ends (confirm with owner
  first), or leave up for a longer testing window — remembering the §2 caveat that
  teardown invalidates installed apps.
