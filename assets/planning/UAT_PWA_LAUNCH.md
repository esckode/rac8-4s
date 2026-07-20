# UAT PWA Launch — phone testing on AWS

**Date:** 2026-07-19 (Phase 0 prerequisites added 2026-07-20; observability items
P0.7–P0.8 added 2026-07-20)
**Status:** 📋 Runbook — **solo/technical pass** (§4) needs **P0.7** first (without it
the deployed API emits no logs at all, so a failed pass leaves nothing to diagnose);
otherwise blocked only on AWS credentials. **Multi-user UAT** (inviting other testers)
additionally requires Phase 0 (§3) done first — see scope note below.
**Purpose:** Stand up the UAT stack, deploy the PWA (merged to `main` 2026-07-19,
`c150447..35c2c94`), and phone-test it on real devices. Executing §4–§6 also closes the
three DoD items deferred from the PWA merge
([PWA_CACHING_IMPLEMENTATION.md](./PWA_CACHING_IMPLEMENTATION.md) DoD items 4–5):
live `tofu plan/apply` of the SW/manifest no-cache behaviors, an install audit against
a deployed URL, and the iOS Add-to-Home-Screen check.

**Scope note:** a lone tester (you, on your own phone) can run §4 with only **P0.7**
done — none of P0.1–P0.6 affect a single-user pass. Those exist because opening the same
deployed stack to *other* people surfaces gaps that don't show up solo: a broken
login-lockout message, a poll that never auto-closes, an unread badge that never
updates. Do them before sending the URL to anyone else. **P0.7 is the exception** — it
is not about multi-user behavior at all, it's about being able to see anything the
deployed stack does, solo or not.

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

## 3. Prerequisites (TDD) — multi-user UAT, plus P0.7 for any pass

Nine items surfaced during the coverage-gap / backlog review (2026-07-19), the
email/notification readiness audit (2026-07-20), and the logging/monitoring readiness
audit (2026-07-20, → P0.7–P0.9). Each is
scoped and gated independently below; do them as separate branches/commits per
CLAUDE.md §11 (one logical change per commit), red test → confirm it fails for the
right reason → green implementation → verify, per CLAUDE.md §4. **P0.1+P0.2 are the
one pairing to always do together** — the rest are gated by what the UAT test script
actually exercises (see each item's "Required if" line). **P0.2 itself spans two
packages** (its backend `retryAfterSeconds` addition and its frontend `Login.tsx` UI)
— treat those as their own RED/GREEN commit pairs in sequence (backend first, since
the frontend e2e step needs the field to exist), not one mixed commit.

**TDD note for P0.7–P0.8** (P0.9 is ordinary code and gets a real red test)**:** both
are infrastructure-only changes (`.tf` / `.sh.tpl`)
and this repo has no Terraform test harness — there is no `.tftest.hcl`, and nothing in
`packages/api` can observe what systemd writes into an env file on an EC2 instance.
Following the P0.5 precedent, **these two have no red test**; their verification is a
live check against the deployed stack, spelled out per item. Do not invent a test that
greps the `.tpl` file for a string — that asserts the fix's own text, not its effect,
and CLAUDE.md §2 rules it out.

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

**Provider decision (owner, 2026-07-20): AWS SES only, from day 1. SendGrid is not being
enabled.** Rationale, after grilling the alternative: SES is $0.10/1,000 emails with no
monthly floor versus SendGrid's ~$20/mo once its 60-day trial lapses; SES needs **no
credential at all** (the EC2 instance role supplies them via the SDK's default chain, so
nothing to store, rotate, or keep out of Terraform state); and `infra/variables.tf:58-61`
**already permits `aws_ses`** while rejecting `sendgrid`. The counter-argument — that
this repo already has good secret management (SSM `SecureString` via
`infra/modules/secrets`, plus the out-of-band `github_token` pattern for human-supplied
secrets that must stay out of state) — is **correct and was weighed**; SES still wins on
cost, and a credential that doesn't exist beats one that's stored well. **Do not
reintroduce the SendGrid path** as part of this work; leave `SendGridEmailService` in
place, unused and untouched.

**➡️ The SES enablement sequence is P0.6-SES below.** It is a hard prerequisite for this
item — there is no point adding a `sendMagicLinkEmail` call to a stack with no working
provider. Do P0.6-SES first, then the RED/GREEN below.

**Also verified while investigating (context, not required for P0.6 itself):**
- Password reset (`routes/auth.ts`, via `email-adapter.ts:40-77`
  `sendPasswordResetEmail`) is wired correctly end-to-end and is **not** broken — just
  pointed at mock. `server.ts:53` resolves config via `getAppConfig()`, which respects
  the `EMAIL_SERVICE` env var. Once P0.6-SES lands, this path starts working with no
  further change, which makes it the **cheapest smoke test** of the SES integration
  (trigger a password reset before touching magic-link code).
- `infra/environments/uat.tfvars:20` currently sets `email_service = "mock"`. Today the
  stack can only select `mock` (doesn't send) or `aws_ses` (an unimplemented stub) —
  **neither deployable option can send an email at all.** That is what P0.6-SES fixes.
**P0.6's own steps (do these *after* P0.6-SES below):**

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
  stack (`email_service = "aws_ses"`, identity verified) delivers an actual email.

### P0.6-SES — Enable AWS SES as the day-1 UAT email provider

**Required:** with P0.6, before any external tester round. **Type:** ~4 code edits + 3
infra edits + 2 owner-run AWS account actions. **Sequence matters** — the account
actions have a lead time nothing else can compress, so start them first.

**Start these two immediately — they gate everything else (owner, AWS console):**
1. **Verify a sender identity.** `uat.tfvars:21` is `email_from_address =
   "noreply@uat.example.com"` — a placeholder domain you don't own, which SES will
   refuse. Either verify a single email address you control (fast, but sending *from* an
   `@gmail.com`-style address fails DMARC alignment and lands in testers' spam), or
   verify a real domain via DKIM records (correct, and §2 already wants a custom domain
   so installed PWAs survive a `destroy`/`apply` — **two reasons now point at buying one
   sooner**). Whichever you pick, `email_from_address` must be updated to match.
2. **Decide sandbox vs production access.** New SES accounts are sandboxed: send only to
   *verified* recipients, 200/day, 1/sec. Production access is a support request,
   typically ~24h but not guaranteed. **For a dozen known testers the sandbox is
   genuinely sufficient** — verify each tester's address individually (they click a
   confirmation link) and skip the wait entirely. Request production access only if the
   tester list is open-ended. Do this in **`us-east-2`** — SES identities and sandbox
   status are per-region, and verifying in the wrong region is the classic first failure.

**Code (4 edits):**
1. **Add `@aws-sdk/client-sesv2`** to `packages/api/package.json`. Not currently a
   dependency — the only `@aws`-ish entry is `@anthropic-ai/aws-sdk`, which is the
   assistant's Bedrock client and unrelated.
2. **Implement `AwsSesEmailService.send()`** (`services/email-service.ts:145-168`),
   replacing the placeholder whose own comment reads "logs success without actually
   sending". Mirror `SendGridEmailService.send`'s shape: validate, send, log outcome —
   but note the `log.info`/`log.error` calls at lines 155/161 are **already in P0.9's
   scope**, so write them with `service` only (no `recipient`, no `subject`) rather than
   copying the current shape and having P0.9 immediately rewrite them.
3. **🔴 Fix the factory's credential requirement** (`services/email-service.ts:198-210`).
   The `aws_ses` branch reads `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` and **throws**
   when they're absent. On an EC2 instance with an instance role that is exactly
   backwards — and the whole cost/credential argument for choosing SES collapses if the
   implementation keeps demanding static keys. Let the SDK's default credential chain
   supply them: drop the throw and the two positional key args from
   `AwsSesEmailService`'s constructor, keeping `region` and `fromAddress`. **This is the
   single easiest thing to get wrong here** — the existing signature actively points the
   wrong way.
4. **🔴 Fix `worker-entrypoint.ts:95`.** It builds its email service from
   `DEFAULT_APP_CONFIG.email.service`, hardcoded `'mock'` at `config.ts:497`, instead of
   `getAppConfig()` — so the worker's notify-email path ignores `EMAIL_SERVICE` entirely.
   **This was previously logged as "moot, since `uat.tfvars` is mock anyway" — that
   reasoning dies with this decision.** Going SES from day 1 makes it load-bearing: the
   API would send real mail while the worker silently kept using mock, so notification
   emails would vanish with no error. Switch it to `getAppConfig()`, matching
   `server.ts:53`.

**Infra (3 edits):**
5. **`uat.tfvars:20`** → `email_service = "aws_ses"`. No `variables.tf` change needed —
   `aws_ses` is already in the validation allow-list (`infra/variables.tf:58-61`).
6. **🔴 Add `AWS_REGION` to the `ENVFILE` heredoc** (`user_data.sh.tpl:35-46`):
   `AWS_REGION=${aws_region}`. The template already receives `aws_region`
   (`modules/api/main.tf:74-81`). **Without this the SES client silently targets
   `us-east-1`** — `email-service.ts:202` falls back to `'us-east-1'` when `AWS_REGION`
   is unset, while the whole stack is `us-east-2`, so sends would fail against a region
   where your identity isn't verified. (Secondary benefit: `assistant-client.ts:180`
   documents needing `AWS_REGION` too, so this closes a second latent gap.)
7. **SES identity in Terraform (optional, recommended).** No SES resource exists in
   `infra/` at all. Once the identity is chosen, an `aws_sesv2_email_identity` resource
   makes it reproducible rather than console-only drift. Skip if verifying a personal
   address by hand for a one-off round.

**No IAM change needed** — `infra/modules/api/main.tf:37-40` already grants
`ses:SendEmail` / `ses:SendRawEmail` on the instance role. **No SSM parameter and no
secret of any kind** — that is the point of choosing SES.

- **[RED]** `packages/api/src/__tests__/unit/email-service.spec.ts` already covers this
  service (it sets `AWS_REGION` at line 443), so extend it rather than adding a file:
  assert `AwsSesEmailService.send()` issues a real SESv2 send (mock the client) and that
  `createEmailService('aws_ses', …)` **succeeds with no static credentials in the
  environment**. Both fail today — the second is the guardrail against edit 3 regressing.
- **[GREEN]** Edits 1–7 above.
- **Verify:** unit suite green; then live, in order — (a) `tofu apply`, (b) trigger a
  **password reset** (the path that already works end-to-end, so it isolates SES from any
  magic-link bug) and confirm the mail arrives, (c) only then test registration per
  P0.6's own verify step. If (b) fails, check the region wiring from edit 6 before
  anything else.


### P0.7 — Deployed API emits zero logs (`LOG_LEVEL` never set on the instance)

**Required:** always — including the solo/technical pass (§4), unlike every other Phase
0 item. **Type:** one-line infra fix. **Do this first**; it costs minutes and every
other item on this list becomes easier to debug once it's in.

**Finding (verified 2026-07-20 by reading the files, not inferred):**
`packages/api/src/logger.ts:33-41` builds its transport list conditionally —

```typescript
const baselineStr = process.env.LOG_LEVEL?.toLowerCase()
const baseline = baselineStr && baselineStr in LEVEL_RANK ? (baselineStr as LogLevel) : null
...
if (baseline !== null) {
  transports.push(stdoutTransport)
}
```

With `LOG_LEVEL` unset the stdout transport is **never installed**, and `emit()` returns
early on `transports.length === 0` (line ~68). The env file written by
`infra/modules/api/user_data.sh.tpl:35-46` sets ten variables — `DATABASE_URL`,
`JWT_SECRET`, `NODE_ENV`, `EMAIL_SERVICE`, `EMAIL_FROM_ADDRESS`, `FRONTEND_URL`,
`REDIS_URL`, `TOKEN_STORE`, `JOB_QUEUE`, `PORT` — and **`LOG_LEVEL` is not among them**.
There is no `/uat/api/log_level` SSM parameter for `get_param` to read either. The
dotenv fallback (`packages/api/src/server.ts:6`, `worker-entrypoint.ts:14`) resolves
`packages/api/.env`, which is gitignored and therefore absent from the instance's
`git clone`. Net effect: on the deployed stack **both** systemd units run with no
`LOG_LEVEL`, so every `log.info('tournament.created', …)` that CLAUDE.md §6 mandates is
silently discarded. `journalctl -u tournament-api` shows systemd's own lifecycle lines
and nothing else.

**Fix it in infra, not in `logger.ts`.** Defaulting `baseline` to `'info'` when
`LOG_LEVEL` is unset would also "work" and is tempting, but it would make the entire
unit-test suite write JSON to stdout on every run — silence-by-default is almost
certainly why the conditional exists. The existing logger specs are deliberately
tolerant of either state (`logger.spec.ts:57` branches on
`process.env.LOG_LEVEL !== undefined`), so they would *not* catch the noise regression.
**Do not change `logger.ts`.**

- **[RED]** None — see the TDD note above.
- **[GREEN]** In `infra/modules/api/user_data.sh.tpl`, add one line inside the `ENVFILE`
  heredoc (lines 35–46), alongside the other literal-valued vars such as
  `TOKEN_STORE=redis` and `JOB_QUEUE=bullmq`:

  ```
  LOG_LEVEL=info
  ```

  Use a **literal**, not `$(get_param log_level)` — a new SSM parameter means touching
  `modules/secrets`, and the `get_param` retry loop `exit 1`s the whole refresh script
  if the parameter doesn't exist, which would brick boot for a value that has no reason
  to be secret or per-deploy. Because the line lands inside `tournament-refresh-env`,
  which every unit re-runs via `ExecStartPre`, both the API and the worker pick it up.

**Why `info` and not `debug`** (asked and resolved 2026-07-20): because the HTTP logger
is already **level-adaptive by outcome**, `info` is not the "less diagnostic" choice it
looks like. `app.ts:172-174`:

```typescript
if (res.statusCode >= 500) httpLog.error('request', ctx)
else if (res.statusCode >= 400) httpLog.warn('request', ctx)
else httpLog.debug('request', ctx)
```

At `info` you still get **every failing request** — 4xx as `warn`, 5xx as `error`, each
carrying its `requestId`. What `debug` adds is *successful* requests plus routine query
traces. So `info` = quiet on success, loud on failure, which is the posture a test round
wants. It also keeps the §6 state-change audit trail (`tournament.created`,
`score.submitted`, …), which a stricter `warn` would discard entirely — note that
`packages/api/SECURITY.md:601` still advises `warn`/`error` for production; that
guidance predates the structured-logging design and would silently delete the audit
trail. **Out of scope here — do not "fix" SECURITY.md as part of this item**; §6
closeout adds a BACKLOG.md row to reconcile the two docs before production.

**Getting more detail without flipping the global level.** `emit()`
(`logger.ts:62-66`) reads a **per-module override** from `LOG_<MODULE>`, the module name
uppercased with dashes → underscores: `LOG_TOURNAMENTS=debug`, `LOG_HTTP=debug`,
`LOG_DB=debug`. Prefer this over global `debug` when chasing a specific defect — it's
targeted, it's a fraction of the volume, and per P0.9 it limits how much PII you widen
exposure to. **Gotcha:** the override does *not* install the transport — only
`LOG_LEVEL` does, at module load (`logger.ts:39`). `LOG_TOURNAMENTS=debug` with
`LOG_LEVEL` unset is **still completely silent**. The override only sharpens an
already-enabled logger; it can't enable one. (This is also why the override, read
per-call inside `emit()` rather than at load, is the lever a test can pull at
runtime — see P0.9's RED step.)
- **Verify (live, after §4 step 2 applies):**
  ```bash
  ID=$(aws ssm send-command --instance-ids $(tofu -chdir=infra output -raw ec2_instance_id) \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=["grep LOG_LEVEL /etc/tournament-app/env","journalctl -u tournament-api -n 30 --no-pager"]' \
    --query Command.CommandId --output text)
  # send-command is async — poll for the output:
  aws ssm get-command-invocation --command-id "$ID" \
    --instance-id $(tofu -chdir=infra output -raw ec2_instance_id) \
    --query StandardOutputContent --output text
  ```
  Expect `LOG_LEVEL=info` in the env file and structured JSON lines (each carrying a
  `requestId`) in the journal. Seeing systemd lines but no JSON means the fix didn't
  take — check that the instance was actually *replaced*. `tournament-refresh-env` is
  itself written by `user_data`, so an edited template reaches a running box only via
  the replacement that `user_data_replace_on_change = true`
  (`modules/api/main.tf:82`) triggers; a plain `systemctl restart` re-runs the **old**
  script and rewrites the same ten-variable env file.

### P0.8 — Ship app logs off the instance (CloudWatch agent + log group)

**Required if:** you plan a multi-user round, or any round where you'd want to
reconstruct a defect *after* a redeploy. **Skip for** a single solo pass where
`journalctl`-over-`send-command` (P0.7's verify block) is enough. **Type:** infra,
~40–50 lines across four files. **Depends on P0.7** — shipping an empty log stream
accomplishes nothing, so do P0.7 first.

**Finding (verified 2026-07-20):** `grep -rn "cloudwatch\|log_group\|awslogs" infra/
--include=*.tf` returns **only variable declarations** — there is no CloudWatch
resource of any kind in the stack. Application logs exist solely in journald on the EC2
box. Because `user_data_replace_on_change = true` (`modules/api/main.tf:82`) makes
**instance replacement the deploy mechanism**, every deploy destroys all logs from the
version that preceded it — which is precisely the window you most want to read after a
tester reports something. AL2023 also ships journald with `Storage=auto` and no
`/var/log/journal` directory, so the journal is RAM-backed and capped at a fraction of
a `t2.micro`'s 1 GiB; expect a reboot to lose it too, and confirm on the instance with
`journalctl --disk-usage` if it matters.

**Dead config, adjacent — do not repurpose it:** `infra/variables.tf:105-116` declares
`enable_cloudtrail` and `enable_cloudwatch_logs`, and `environments/uat.tfvars:23-24`
sets them, but **no resource references either variable** (verified by grep across
`main.tf` and all modules). `enable_cloudwatch_logs` in particular is described as
"Send CloudTrail logs to CloudWatch" — a *different* feature from shipping application
logs. Do not wire this item's behavior to it; that would silently redefine a variable
whose name already promises something else. Leave both declarations alone per CLAUDE.md
§3 (don't delete pre-existing dead code) — §6 closeout adds a BACKLOG.md row for them
instead.

**Design constraint worth knowing before you start:** the CloudWatch agent tails
**files**; it has no journald input on Linux. So the units must write to files first.

- **[RED]** None — see the TDD note above.
- **[GREEN]** Four edits, one commit:

  1. **`infra/modules/api/user_data.sh.tpl` — make the units write files.** Add to the
     `[Service]` block of both `tournament-api.service` (heredoc at line 74) and
     `tournament-worker.service` (line 92), next to the existing `ExecStart=`:
     ```
     StandardOutput=append:/var/log/tournament-api.log
     StandardError=append:/var/log/tournament-api.log
     ```
     (`tournament-worker.log` for the worker unit.) Leave `tournament-seed.service`
     alone — it's a `oneshot` whose output is already captured by the seed's own run.
  2. **`infra/modules/api/user_data.sh.tpl` — install and start the agent.** Add
     `amazon-cloudwatch-agent` to the existing `dnf install -y` at line 13 (it's in the
     AL2023 repos; no extra repo config needed). After the `systemctl enable --now
     tournament-api tournament-worker` line, write a config JSON to
     `/opt/aws/amazon-cloudwatch-agent/etc/config.json` with a
     `logs.logs_collected.files.collect_list` entry per file, each setting
     `log_group_name` to the group from edit 3 and `log_stream_name` to something
     instance-scoped (`{instance_id}-api`, `{instance_id}-worker`), then activate with:
     ```bash
     /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
       -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json
     ```
     The group name must be passed into the template as a new `templatefile` variable
     (the `templatefile(...)` call is at `modules/api/main.tf:74-81`) — don't hardcode
     `/uat/...`, the module is environment-parameterized.
  3. **`infra/modules/api/main.tf` — the log group + IAM.** Add an
     `aws_cloudwatch_log_group` with `name = "/${var.environment}/api"` and
     `retention_in_days = var.log_retention_days`; add a matching
     `variable "log_retention_days"` to `modules/api/variables.tf` and pass
     `log_retention_days = var.log_retention_days` in the root `module "api"` block
     (`infra/main.tf:61-83`). That gives the root variable (`infra/variables.tf:123`,
     already set to `30` in `uat.tfvars:26`) its first real referent; amend its
     description from "Days to keep audit logs" to cover application logs too, since it
     now means both.
  4. **`infra/modules/api/main.tf` — IAM, narrowly.** Add a **third statement** to the
     existing inline `aws_iam_role_policy.api` (line 24, the one that already holds the
     `ssm:GetParameter` and `ses:SendEmail` statements) granting
     `logs:CreateLogStream`, `logs:PutLogEvents`, `logs:DescribeLogStreams`, with
     `Resource` scoped to the new group's ARN (plus `:*` for its streams).
     **Do not attach the `CloudWatchAgentServerPolicy` managed policy** even though
     it's a one-liner mirroring `ssm_core` at line 46 — it additionally grants
     `cloudwatch:PutMetricData` on `*` and `logs:CreateLogGroup`, neither of which this
     needs. `logs:CreateLogGroup` is deliberately excluded: Terraform owns the group, so
     the instance being unable to create one is a feature (it turns a misconfigured
     group name into a visible permission error rather than a silently-orphaned group).

- **Verify (live):** after `tofu apply` replaces the instance,
  ```bash
  aws logs describe-log-streams --log-group-name /uat/api
  aws logs tail /uat/api --since 10m
  ```
  Expect two streams (api + worker) and the same JSON lines P0.7's check found in the
  journal. Then confirm the actual point of this item: redeploy (any `user_data` change
  → instance replacement) and verify the **pre-replacement** lines are still queryable
  in the group afterward.
- **Cost:** ingestion is $0.50/GB and storage $0.03/GB-month in `us-east-2`; the agent
  itself and EC2→CloudWatch transfer are free. At `LOG_LEVEL=info` a UAT round is
  single-digit MB; even at `debug` with a dozen testers it's well under 1 GB/month, so
  expect **$0–1/month** — plausibly $0 under the 5 GB CloudWatch free tier, though
  accounts opened after mid-2025 fall under the newer credit-based free plan, so don't
  bank on it. `retention_in_days` is the only real cost lever; leaving it unset means
  "keep forever". Re-verify rates against AWS's pricing page before treating these
  numbers as a budget.
- **Out of scope (deliberately):** no metric filters, alarms, SNS topics, dashboards,
  RDS Performance Insights, or ALB/CloudFront access logs. This item buys *durable,
  greppable application logs* and nothing else. Alerting is a separate decision with its
  own recurring cost (~$0.10/alarm-month, plus $0.30/metric-month per metric filter) —
  add a BACKLOG.md row, don't scope-creep it here.

### P0.9 — No sensitive data in cloud logs (violates CLAUDE.md §6)

**Objective (owner, 2026-07-20):** no email addresses and no player names reach the
CloudWatch logs P0.8 creates. IDs only, per CLAUDE.md §6. Emails are the bulk of the
work; the name audit below came back almost clean.

**Required if:** you are doing P0.8 (durable log shipping) **and** the round involves
anyone other than you. Solo with journald-only, the blast radius is a RAM-backed buffer
on a box you own; with P0.8 it's tester PII sitting in CloudWatch for
`log_retention_days`. **Type:** code, 13 field deletions/substitutions across 8 files
plus one new spec — **logging only; no email delivery behavior changes and no change to
`MockEmailService`** (see "Blast radius" below), and no interface or signature changes
(see the design decision below).
**Unlike P0.7/P0.8 this one is properly testable** — write the red test.

**Finding (verified 2026-07-20 by reading every call site, not grepped-and-assumed):**
CLAUDE.md §6 says "Never include: tokens, passwords, full request bodies, **or PII
beyond IDs**." **Fourteen** call sites log a raw email address; **thirteen are in scope**
(one is deliberately excluded — see MockEmailService below). The important correction
to an earlier framing in this conversation: **this is not a `debug`-only problem** —
eleven of the thirteen are at `info` or `error`, i.e. they emit at exactly the level
P0.7 turns on.

*Emit at `LOG_LEVEL=info` (the P0.7 default) — these are the ones that matter:*
| Site | Event | Field |
|---|---|---|
| `routes/auth.ts:619` | `forgot_password.requested` | `email: normalizedEmail` |
| `routes/auth.ts:805` | `password.reset` | `email` — **and `accountId` is already there** |
| `email-adapter.ts:69` | `email.sent` | `recipient: email` |
| `email-adapter.ts:71` | `email.send_failed` | `recipient: email` |
| `email-service-adapter.ts:23` | `email.adapter.send_failed` | `recipient: to` |
| ~~`services/email-service.ts:36`~~ | `email.service.sent` (mock) | **EXCLUDED — leave intact, see below** |
| `services/email-service.ts:102` | `email.service.sent` (sendgrid) | `recipient: options.to` |
| `services/email-service.ts:108` | `email.service.failed` (sendgrid) | `recipient: options.to` |
| `services/email-service.ts:155` | `email.service.sent` (aws_ses) | `recipient: options.to` |
| `services/email-service.ts:161` | `email.service.failed` (aws_ses) | `recipient: options.to` |
| `routes/admin.ts:31` | `dsr.export.requested` | `email` |
| `routes/admin.ts:38` | `dsr.erase.requested` | `email` |

*Emit only under `debug` / a `LOG_<MODULE>` override — lower priority, same fix:*
`db.ts:1547` (`account.query`, `{ method: 'create', email }`) and
`routes/tournaments.ts:1359` (`magic_link.validated`, `{ tournamentId, email }`).

**The two worth understanding before you touch them:**
- `routes/admin.ts:31,38` are the sharpest: they durably record a subject's email
  *as part of servicing that subject's DSR export/erasure request*. An erasure that
  leaves the erased party's address in a 30-day-retention log store is arguably a defect
  in the erasure itself. Fix these first if you split the work.
- `routes/auth.ts:805` already logs `accountId` alongside the email — the email there is
  pure surplus. Deleting the field costs nothing diagnostically.

**The codebase already knows the rule** — `middleware/rate-limit.ts:134,141` masks its
identifier to `***` precisely because that key embeds an email. Follow that precedent.

**Decision (owner, 2026-07-20): no email address reaches the logs in any form — not
masked, not hashed, deleted.** Replace it with generic context: *what kind* of email,
and *which tournament/group/player ID* it concerned. An earlier draft of this item
recommended masking (`a***@e***.com`) in the transport layer; **that is overruled** —
implement deletion. Recorded here so the rationale below isn't re-litigated mid-build.

**This needs no interface change.** The natural reading of "log the email type and the
tournament" is to thread a context field through `EmailSendOptions` — **don't**. Each
layer already holds the right vocabulary; log at the layer that has it:

| Layer | Files | What it logs after the fix |
|---|---|---|
| **Transport** | `services/email-service.ts` (5 sites) | `service` + outcome **only** |
| **Adapter** | `email-adapter.ts:69,71` | `type` (e.g. `'password_reset'`) — already there |
| **Caller** | workers/routes | the IDs already in scope (`tournamentId`, `playerId`, `groupId`) |

`EmailSendOptions` (`email-service.ts:5-11`) is `{ to, subject, html, text?, from? }` —
no IDs, no type, and it has exactly **one** construction site
(`email-service-adapter.ts:16`). Adding a field to it would mean changing
`EmailAdapter.send(to, subject, body)`'s positional signature across four call sites
plus `InMemoryEmailAdapter` and the test doubles — a broad refactor to move information
that its callers already have. The transport layer's job is "is the provider up?"; it
does not need to know who the mail was for.

**⚠️ Also drop `subject` from the three `email.service.sent` sites, not just
`recipient`.** An earlier draft of this item called subjects "static template strings,
not user content" — **that was wrong, verified 2026-07-20.** `email-processor.ts:12-42`
builds them from job data: `Registration confirmed: ${data.tournamentName}`,
`Score reminder: ${data.matchDescription}`. Tournament names are user-authored, and
`matchDescription` plausibly names the players in a match. `playerName` stays in the
body only, so the exposure is narrower than it first looks — but "subject is safe" does
not hold, and this is precisely the door PII walks back in through after `recipient` is
closed.

**Per-site mapping:**
- `services/email-service.ts:102,108,155,161` — drop `recipient` **and** `subject`;
  keep `service` and, on the failure paths, `error`. That preserves the operational
  signal (which provider, failing how often) and nothing else. **Note the excluded line
  36** — these four are the SendGrid and SES paths only. Sanitize the SendGrid pair too
  even though P0.6-SES leaves that provider disabled: the class stays in the codebase,
  and leaving PII in a dormant path just arms it for whoever enables it later.
- **`services/email-service.ts:36` (`MockEmailService`) — do NOT touch.** An earlier
  draft included it; **that is reversed.** `MockEmailService.send()` is *implemented as*
  that log line (`email-service.ts:30-40`: validate the address, then log — that's the
  whole method), so stripping `recipient`/`subject` doesn't sanitize the mock, it
  **deletes the mock's only function**: showing a local developer what would have been
  sent. And it buys nothing toward this item's objective, which is about **cloud** logs —
  mock is local-only by design and must not be the provider on a deployed stack.
  Sanitize the paths that actually run in AWS; leave the local-dev tool whole.
- `email-adapter.ts:69,71` — drop `recipient`, keep `type: 'password_reset'`. This is
  already the exact shape the decision asks for.
- `email-service-adapter.ts:23` — drop `recipient`; keep `error`. This is the
  `EmailAdapter` → `IEmailService` bridge, and like the transport layer it holds no ID.
  Note it **re-throws** after logging (unlike `email-adapter.ts:71`, which deliberately
  swallows) — so its caller gets the failure regardless of what's logged here.
- `workers/email-processor.ts` — already correct at line 64
  (`{ recipientId, tournamentId }`); the send at line 72 has `player.id` and
  `tournamentId` in scope if you add an outcome log there.
- `routes/player-groups.ts:413`, `workers/notify-processor.ts:85` — if you add
  send-outcome logging, use `groupId` / `conversationId` + `playerId`, never the address.
- `routes/auth.ts:805` — delete the field; `accountId` is already logged beside it.
- `db.ts:1547` — use the `id` generated at `db.ts:1544` → `{ method: 'create', accountId: id }`.
- `routes/tournaments.ts:1359` — use `magicPayload.playerId` (in scope; it's returned in
  the response two lines below) → `{ tournamentId, playerId }`.

**Player names — audited 2026-07-20, effectively already clean.** No log call anywhere in
`packages/api/src` writes a player's name. The near-misses are all `res.json()` response
payloads, not logs — `routes/player-groups.ts:259` (`name: group.name`),
`routes/coach.ts:207` (`senderName`) — which are the API correctly answering an
authenticated client and are **not** in scope. `workers/email-processor.ts:69` passes
`player.name` into `generateEmailContent`, but that lands in the email *body*, which is
never logged. Two things to keep true rather than fix:
- **Don't add names when substituting IDs.** The temptation while editing these sites is
  to swap `email` for something human-readable. Use `playerId`/`accountId`.
- **The `subject` deletion already covers the one real leak path.** `score_reminder`'s
  `Score reminder: ${data.matchDescription}` (`email-processor.ts:30`) plausibly renders
  as player-vs-player text. Dropping `subject` from the transport logs closes it; this
  is a second, independent reason for that deletion beyond the tournament-name one.

**Judgement call — `routes/tournaments.ts:155` logs `name: tournament.name`** alongside
`tournamentId` and `organizerId`. That's an organizer-authored event title, not personal
data about an individual, and it makes the `tournament.created` audit line readable
without a DB lookup. **Recommend keeping it** — it is outside the stated objective
(emails and player names). Flagging rather than deciding, since it is the one remaining
piece of user-authored free text in the logs; say the word and it goes.

**Two sites have no ID to fall back on — log the event with no identifier at all:**
`routes/auth.ts:619` (`forgot_password.requested`) deliberately runs before any account
lookup is revealed ("Always return 202 — don't reveal if email exists", line 617), so
there may be no account; and `routes/admin.ts:31,38` take an email as the DSR *subject
key*. For all three, keep the event name and drop the identifying field entirely. This
costs less than it appears: **`requestId` is auto-injected into every entry**
(`logger.ts:78`), so a request-driven send stays correlatable to its own HTTP
request/response pair — you lose "which address", not "which request". Worker-driven
sends have no HTTP request and therefore no `requestId`, which is exactly why the
caller-layer IDs above matter more there.

**Blast radius — logging only, with one exception worth understanding.** Every edit in
this item removes a field from a `log.*()` context object. Delivery is untouched:
`SendGridEmailService.send` builds its recipient in the `fetch` body
(`email-service.ts:75-77`, `to: [{ email: options.to }]`) and its `log.info` sits
*after* both the `fetch` and the `response.ok` check — purely observational.
`emailAdapter.send(email, subject, html)` still receives the real address at every call
site. **Recipients, subjects, and bodies of actual emails are byte-for-byte unchanged.**

**`MockEmailService` is excluded entirely** (see the per-site mapping), so nothing about
local development changes either: the mock still logs recipient and subject, which is
the whole reason it exists. This item touches only the SendGrid/SES transport paths, the
two adapter layers, and the route/repository call sites — i.e. only code that runs, or
can run, on a deployed stack.

**The safety property this relies on:** mock must not be the selected provider in AWS.
Owner's stated intent (2026-07-20) is that mock is local-testing only. `uat.tfvars:20`
currently sets `email_service = "mock"` — P0.6 already requires flipping that to a real
provider before any external round, which is what makes the exclusion above safe. Note
that a *solo* pass on mock is not a PII problem regardless: the only address in those
logs would be your own, and P0.8 (the thing that makes logs durable) is itself gated on
a multi-user round.

Optional, not required: `workers/notify-processor.ts:85` and
`routes/player-groups.ts:413` have no send-outcome log at all. Adding one (`playerId` +
`tournamentId`/`groupId`, never the address) is a reasonable small improvement, but it
is **not** load-bearing here and can be left out to keep this commit tight.

- **[RED]** New `packages/api/src/__tests__/unit/log-pii.spec.ts`. Register a capturing
  transport via `addTransport()`, exercise the paths above, and assert **two** things —
  both are needed, the first alone is insufficient:
  1. **No captured `LogEntry` contains an `@`-bearing value** (walk the entry's own
     values; the shape is flat `Record<string, unknown>`). This catches `recipient`.
  2. **No `email.service.*` entry carries a `subject` key at all.** An `@`-check cannot
     catch `Registration confirmed: Summer Slam`, nor a `matchDescription` rendering as
     player-vs-player text — assert the field's *absence*, not its content, since the
     leak is user-authored text with no fixed shape.
  **The critical mechanic:** the capture only fires if the logger is enabled, and
  `LOG_LEVEL` is read once at module load (`logger.ts:29-41`) — a spec that just calls
  `addTransport` and asserts "no emails captured" will pass **vacuously** under a test
  runner with no `LOG_LEVEL`, i.e. green for entirely the wrong reason, which is the one
  outcome this item cannot afford. Set the **per-module override instead** —
  `process.env.LOG_EMAIL_SERVICE = 'debug'`, `LOG_AUTH`, `LOG_ADMIN`, `LOG_DB`,
  `LOG_TOURNAMENTS` — because `emit()` re-reads it on **every call** (`logger.ts:63-64`),
  so it works at runtime regardless of how the suite was invoked. Restore the env in a
  `finally`, matching `logger-initialization.spec.ts`'s existing pattern.
  **Before writing the assertions, prove the harness works:** confirm the transport
  captures a known-good entry first. A test that captures zero entries and a test that
  captures only clean entries look identical from the assertion side.
- **[GREEN]** Apply the deletions and ID substitutions per the per-site mapping above.
  No masking helper — the decision is deletion.
- **Verify:** new spec green; the full `packages/api` unit + integration suites
  unaffected (several email specs assert on adapter behavior, not log contents, but
  confirm rather than assume); re-run the new spec with the module overrides *removed*
  and confirm it now captures nothing — that proves the overrides, not luck, were
  driving the capture.

## 4. Runbook (solo/technical pass)

0. **P0.7 first** (§3) — a one-line change, but it must be in the template *before* the
   first `apply`, since the env file is only written at instance start. Applying without
   it means a stack that logs nothing until you replace the instance again.
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
script are done — at minimum P0.1+P0.2+P0.6+P0.8+P0.9 (P0.6 is the hard blocker: without
it, no external tester can complete registration at all; P0.8 is what lets you read back
what a tester hit after the redeploy that fixes it; P0.9 keeps P0.8 from durably storing
those testers' email addresses).

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
  it surfaced, since neither was previously tracked there. Add rows for the three
  observability gaps P0.7–P0.9 surfaced but did **not** fix: (a) the dead
  `enable_cloudtrail` / `enable_cloudwatch_logs` variables that no resource references,
  (b) no alarms/metrics/SNS anywhere in the stack, (c) `uat.tfvars:7-8` opening SSH
  to `0.0.0.0/0` on an instance that has no `key_name` — port 22 exposed with no key to
  use it, and (d) `packages/api/SECURITY.md:601` advising a production `LOG_LEVEL` of
  `warn`/`error`, which would discard the entire CLAUDE.md §6 state-change audit trail —
  the two docs need reconciling before production. BACKLOG.md currently has **no**
  monitoring/observability entries at all.
- Any defect found → red test → fix on a branch (not part of this runbook).
- **Teardown** per the established pattern once testing ends (confirm with owner
  first), or leave up for a longer testing window — remembering the §2 caveat that
  teardown invalidates installed apps.
