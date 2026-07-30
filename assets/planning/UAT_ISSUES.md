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

ISSUE-1–21, the 2026-07-26/27 walkthrough batch (ISSUE-22–31), the post-walkthrough audit
(ISSUE-32–33), and the 2026-07-29 actionable-follow-ups batch (ISSUE-34–38) are all resolved; see
[the walkthrough-queue summary](COMPLETED_UAT_ISSUES.md#walkthrough-queue-2),
[the post-walkthrough audit](COMPLETED_UAT_ISSUES.md#post-walkthrough-audit), and
[the actionable-follow-ups batch](COMPLETED_UAT_ISSUES.md#actionable-follow-ups-batch) for what each
shipped.

**8 issues filed 2026-07-30 (ISSUE-39–46)** — see the implementation-status note below: ISSUE-39–43 after checking
`REQUIREMENTS.md`'s "Audit Logging" section against the actual code, ISSUE-44 from a live UAT report
(invite/create-group buttons appeared to have no submit button). Number the next one 47.

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
| [ISSUE-34](COMPLETED_UAT_ISSUES.md#issue-34) | ✅ Resolved | 🟠 | e2e merge gate unusable — the register rate-limit override exists but is never set | scripts · test |
| [ISSUE-35](COMPLETED_UAT_ISSUES.md#issue-35) | ✅ Resolved | 🟠 | `POST /api/analytics/events` 401s for registered accounts — no analytics for account holders | api |
| [ISSUE-36](COMPLETED_UAT_ISSUES.md#issue-36) | ✅ Resolved | 🟠 | Three of four More-menu items are dead links; no About/Contact/Settings pages exist | frontend |
| [ISSUE-37](COMPLETED_UAT_ISSUES.md#issue-37) | ✅ Resolved | 🟡 | Auth page titles are styled `<div>`s, not headings — no page heading for screen readers | frontend · a11y |
| [ISSUE-38](COMPLETED_UAT_ISSUES.md#issue-38) | ✅ Resolved | 🟡 | `real-time-updates.spec.ts` reconnect test fails consistently; a second test is flaky | test |
| [ISSUE-39](#issue-39) | ✅ Resolved | 🟠 | Group-stage score override doesn't log the actor (knockout path does) | api |
| [ISSUE-40](#issue-40) | ✅ Resolved | 🟡 | Score-override audit log has no "reason" field — capability was never built | api + frontend |
| [ISSUE-41](#issue-41) | ✅ Resolved | 🟠 | Login/logout audit events never capture IP | api |
| [ISSUE-42](#issue-42) | ✅ Resolved | 🟡 | `login.success` logs a plaintext email, violating CLAUDE.md §6 | api |
| [ISSUE-43](#issue-43) | ⏸ Deferred | 🟡 | No audit log exists for player-email access — scoped, waiting on DSR cascade | api |
| [ISSUE-44](#issue-44) | 🔲 Open | 🔴 | App-wide: `-[--token]` Tailwind syntax emits invalid CSS — invisible buttons, dead spacing | frontend |
| ├ [44a](#issue-44a) | ✅ Resolved | 🔴 | Codemod the shared design-system primitives (self-verifying: specs pin the strings) | frontend |
| ├ [44b](#issue-44b) | ✅ Resolved | 🔴 | Codemod the remaining ~48 files (depends on 44a) | frontend |
| ├ [44c](#issue-44c) | ✅ Resolved | 🟠 | Add the lint guard so the broken form cannot regress | frontend · lint |
| └ [44d](#issue-44d) | 🔲 Open | 🟠 | Visual review of the app-wide layout shift (human, not an agent) | frontend · design |
| [ISSUE-45](#issue-45) | 🔲 Open | 🟠 | `seed-test-accounts.spec.ts` fails on a FK violation — test isolation is leaking | test · db |
| [ISSUE-46](#issue-46) | 🔲 Open | 🟠 | Organizer "Override" on a not-yet-played match posts as a submit and fails | frontend |

**Implementation status, 2026-07-30.** ISSUE-39/40/41/42 and 44a/44b/44c are implemented on branch
`fix/uat-issues-39-44`, each TDD (failing test committed before implementation). Verified: full
workspace suites green apart from one pre-existing failure ([ISSUE-45](#issue-45), reproduced
identically on the pre-work commit `7bee748`); no coverage floor breached; compiled CSS carries **zero**
invalid bare-token declarations traceable to app-rendered code (down from 133).

**ISSUE-44 stays open until [44d](#issue-44d) — the human visual review — is done.** 44a+44b made ~380
previously-dead spacing declarations start applying, so layout genuinely shifted app-wide. A green test
suite cannot tell you whether it now *looks* right. Do not archive ISSUE-44 to
`COMPLETED_UAT_ISSUES.md` on test results alone.

**All six were re-verified against current code on 2026-07-30 and the blocking product decisions are
recorded in each section.** Three corrections came out of that pass and change how the work is
sequenced:

- **ISSUE-41 is not blocked.** Its stated prerequisite (`trust proxy`) already shipped at
  `app.ts:157`; `PRODUCTION_READINESS.md` PR-1 is stale and should be closed with the fix.
- **ISSUE-44's root cause was wrong** in a way that broke its own verify step — the CSS rules are
  *not* empty, they carry an invalid bare-token value, so the documented "grep for empty rules" check
  gives a **false pass**. It also reaches spacing, not just colour, so **the fix visibly changes
  layout app-wide**.
- **ISSUE-43 is deferred, not unscoped** — direction is decided, build waits on the DSR cascade.

Suggested order: **ISSUE-44** (only 🔴, and self-contained) → **ISSUE-39 → ISSUE-40** (40 builds on
39's log line; do not reorder) → **ISSUE-41 + ISSUE-42** (same `auth.ts` object, one pass).

---

## ISSUE-39 — Group-stage score override doesn't log the actor 🟠 {#issue-39}

*Found 2026-07-30 while checking `REQUIREMENTS.md`'s "Audit Logging" section against the actual code.*

### Symptom

`REQUIREMENTS.md` §"Audit Logging" requires: *"Score overrides: Log when organizer changes a score
(who, what, when, reason note)."* Only one of the two score-override routes actually records "who."

### Root cause

Two nearly-identical routes both override a score and both fire a `score.overridden` log event, but
only one includes the actor:

- `PATCH /:id/knockout/:matchId/score` (`tournaments.ts:1239`):
  ```typescript
  log.info('score.overridden', { tournamentId, matchId, round: updated.round, score: req.body.score, winnerId, organizerId: payload.sub })
  ```
- `PATCH /:id/matches/:matchId/score` (group-stage, `tournaments.ts:776`):
  ```typescript
  log.info('score.overridden', { tournamentId, matchId, score: req.body.score, winnerId })
  ```
  No `organizerId`, no `playerId` — even though the acting identity is already resolved in scope a few
  lines earlier (`orgPayload` from `requireOrganizerAuth(...)`, `actingPlayerId` for the
  participant-edit branch, both set starting at `tournaments.ts:686`). The value exists; it's just not
  passed to the log call. This also violates CLAUDE.md §6's own rule ("Always include: … actor
  identity").

### Fix

Add the actor to both branches of the group-stage handler (`tournaments.ts:776-778`):
```typescript
if (isOrganizer) {
  log.info('score.overridden', { tournamentId, matchId, score: req.body.score, winnerId, organizerId: orgPayload?.sub })
} else {
  log.info('score.edited', { tournamentId, matchId, score: req.body.score, winnerId, playerId: actingPlayerId })
}
```

**Variable names confirmed 2026-07-30** against current code — no re-verification needed:
`orgPayload` is declared at `tournaments.ts:694` (`let orgPayload = null`, assigned from
`requireOrganizerAuth` in the try/catch immediately below) and `actingPlayerId` at
`tournaments.ts:687` (`let actingPlayerId: string | null = null`). Both are in scope at the log call
and `isOrganizer` (`tournaments.ts:686`) already selects the branch. This is a two-line change.

### Verify

```bash
npm --workspace=packages/api exec -- jest --findRelatedTests packages/api/src/routes/tournaments.ts --bail
```
Manual: override a group-stage score as organizer and as a participant; confirm both log lines carry
an actor id (`LOG_LEVEL=debug npm start | grep score.overridden`).

---

## ISSUE-40 — Score-override audit log has no "reason" field 🟡 {#issue-40}

*Found 2026-07-30 alongside ISSUE-39.*

### Symptom

`REQUIREMENTS.md` requires overrides to log "who, what, when, **reason note**." Neither override
endpoint (group-stage `tournaments.ts:667`, knockout `tournaments.ts:1195`) accepts a `reason` in its
request body, and neither `score.overridden` log call has a `reason` field. There's nothing to log
because the capability was never built.

### Decision *(owner, 2026-07-30)*

**`reason` is mandatory, and organizer overrides only.** Rationale: an optional audit field is
usually empty, so it cannot answer the question it exists for while still costing the API and UI
work. Requiring it on *both* paths is the opposite error — a participant entering their own score
isn't overriding anything, it's the normal path; mandatory justification there adds friction to the
most-used flow and reliably produces junk (`asdf`) that pollutes the trail. The codebase already
models these as two different acts (`score.overridden` vs `score.edited`, `tournaments.ts:776-778`),
so put the requirement where the privilege is.

### Requirements

**API — both override routes** (group-stage `tournaments.ts:667`, knockout `tournaments.ts:1195`):

1. Accept `reason` in the PATCH request body.
2. Validate **only on the organizer branch**, alongside the existing `score` check
   (`tournaments.ts:750-752`, which is the pattern to copy):
   ```typescript
   if (isOrganizer && (typeof req.body.reason !== 'string' || !req.body.reason.trim())) {
     return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'reason is required when an organizer overrides a score' })
   }
   ```
   The participant (`score.edited`) branch must keep working with no `reason` — do **not** hoist this
   into the shared path above the `isOrganizer` split.
3. Thread it into the `score.overridden` log call in both routes (combines with ISSUE-39's actor fix —
   land ISSUE-39 first, then this on top, so the group-stage log line ends up with both `organizerId`
   and `reason`).
4. Pick a max length and enforce it (suggest 500 chars) — this string is logged, so an unbounded body
   field becomes an unbounded log line.

**Frontend — two traps, both verified 2026-07-30. Read before editing:**

5. **There is no separate organizer override UI.** `ScoreSubmitForm.tsx` is the *single shared form*
   for both roles — it calls `editScore` (PATCH) for a completed match and `submitScore` (POST) for a
   pending one (`ScoreSubmitForm.tsx:93-94`). It currently has **no organizer awareness at all**: its
   props (`ScoreSubmitFormProps`, `ScoreSubmitForm.tsx:24`) carry no `isOrganizer`. So this change
   requires threading that flag in from the caller and conditionally rendering a required reason
   input — it is not "add a field to the override form", because that form does not exist.
6. **`editScore` must forward `reason` or offline overrides are silently destroyed.**
   `api/client.ts:205-211` hardcodes `body: { score }`. Score writes queue in the service worker for
   offline replay (`sw-lib/sync-queue.ts`, 202 `{code:'QUEUED'}`), and the queue stores the raw
   serialized `body` — so a `reason` omitted at queue time is gone forever. On replay the API will
   400, and `sync-queue.ts:167` **drops 4xx without retrying** ("Never blind-retry a 4xx"). The
   organizer sees a success toast, goes offline-online, and the override vanishes with no error.
   Add `reason` to the `editScore` signature and body.

### Tests (TDD — write these first, per CLAUDE.md §4)

- **API integration:** organizer override without `reason` → 400; with `reason` → 200 and the log
  line carries it; participant self-edit without `reason` → still 200 (this is the regression guard
  for requirement 2).
- **Frontend unit:** `ScoreSubmitForm` renders the reason input when `isOrganizer`, not otherwise;
  submit is blocked when it's empty and the organizer flag is set.
- **`api/client.spec.ts`:** `editScore` includes `reason` in the request body (guards requirement 6).

### Verify

```bash
npm --workspace=packages/api exec -- jest --findRelatedTests packages/api/src/routes/tournaments.ts --bail
npm --workspace=packages/frontend exec -- jest --findRelatedTests packages/frontend/src/components/ScoreSubmitForm.tsx packages/frontend/src/api/client.ts --bail
```
Manual: override a score as organizer with a reason, confirm it round-trips into the log line; confirm
the override is rejected (400) without one; confirm a participant self-edit still needs no reason.

---

## ISSUE-41 — Login/logout audit events never capture IP 🟠 {#issue-41}

*Found 2026-07-30 while checking `REQUIREMENTS.md`'s "Audit Logging" section against the actual code.*

### Symptom

`REQUIREMENTS.md` requires: *"Login/logout events: Track organizer login/logout with timestamp and
IP."* Timestamp is free (every log entry carries `ts`); IP is never captured.

### Root cause

`login.success` (`auth.ts:293`) and `logout` (`auth.ts:538`) log only `accountId` (plus `email` on
login — see ISSUE-42). Neither reads `req.ip` or any forwarded-for header.

### ⚠ The stated blocker no longer exists — verified 2026-07-30

This issue was filed as blocked on `PRODUCTION_READINESS.md`'s PR-1 (`trust proxy`), on the grounds
that `req.ip` would otherwise log the load balancer's address. **That fix has already landed.**
`app.ts:157` reads:

```typescript
// Trust exactly the two verified proxy hops (CloudFront -> ALB -> Node), not
// blanket `true` — that would also trust an attacker-supplied X-Forwarded-For
// on any hop count.
app.set('trust proxy', 2)
```

`PRODUCTION_READINESS.md:26` still asserts the app "does **not** call Express
`app.set('trust proxy', …)`" — that line is stale, and it is why this issue was filed as blocked on
work that was already done. **ISSUE-41 is unblocked and is now a two-line change.**

### Fix

1. Add `ip: req.ip` to `log.info('login.success', …)` (`auth.ts:293`) and `log.info('logout', …)`
   (`auth.ts:538`). Combines with ISSUE-42, which edits the same `login.success` object — do both in
   one pass over `auth.ts`.
2. **Mark `PRODUCTION_READINESS.md` PR-1 resolved in the same commit**, citing `app.ts:157`. Leaving
   it open is what caused this misfile; a stale doc costs more over time than the fix.

### Verify

```bash
npm --workspace=packages/api exec -- jest --findRelatedTests packages/api/src/routes/auth.ts --bail
```
Manual: `curl -H 'X-Forwarded-For: 203.0.113.9, 10.0.0.1' …` against a login, and confirm the logged
`ip` is the client's, not the proxy hop's. Note `trust proxy` is `2`, so the assertion is specifically
that the *correct hop* is selected — a test that only checks "some IP was logged" would pass even if
the hop count were wrong.

---

## ISSUE-42 — `login.success` logs a plaintext email, violating CLAUDE.md §6 🟡 {#issue-42}

*Found 2026-07-30 alongside ISSUE-41.*

### Symptom

`auth.ts:293`:
```typescript
log.info('login.success', {
  accountId: account.id,
  email: account.email,
})
```
CLAUDE.md §6 is explicit: *"Never include: tokens, passwords, full request bodies, or PII beyond
IDs."* `accountId` already identifies the actor; `email` is redundant PII on every login-success log
line.

### Fix

Drop `email` from the context object — `accountId` alone satisfies both this event and the
REQUIREMENTS.md audit item, which asks for the actor, not their email.

### Verify

```bash
npm --workspace=packages/api exec -- jest --findRelatedTests packages/api/src/routes/auth.ts --bail
```
Grep a fresh log for `login.success` and confirm no `email` key appears.

---

## ISSUE-43 — No audit log exists for player-email access 🟡 ⏸ Deferred {#issue-43}

*Found 2026-07-30 while checking `REQUIREMENTS.md`'s "Audit Logging" section against the actual code.*

### Symptom

`REQUIREMENTS.md` requires: *"Sensitive data access: Log when player emails or other sensitive data
is accessed."* Every existing `email.*` log event (`email.sent`, `email.service.sent`, etc.) is about
*sending* mail — none logs that a player's email was *read* (e.g. an organizer viewing a roster, or an
export).

### Decision *(owner, 2026-07-30)* — direction set, **build deliberately deferred**

Two calls, both made:

1. **"Access" means organizer-initiated reads of *other people's* emails** — roster views and
   exports. A player seeing their own email in their own session is not an access event, and logging
   every API response that happens to carry an `email` field is self-defeating: it fires on ordinary
   roster renders and drowns the signal it exists to create.
2. **It belongs in a dedicated audit table, not the `log.*` pipeline.** The requirement exists to
   answer *"who accessed this person's data?"* — a DSR question, and the compliance thread this joins
   (operator DSR cascade, already in scope per the player-groups design). The log stream cannot
   answer it: it rotates, it ships off-host, and it is not joinable to a subject. And per CLAUDE.md
   §6's "no PII beyond IDs" rule the log entry could not name the email anyway, so the log-pipeline
   version would record that *an* access happened with no durable way to query it — built once, then
   rebuilt as a table the first time anyone actually asks.

**Deferred, deliberately.** Unlike the rest of this batch nothing is broken today — nothing was ever
built, so there is no regression risk in waiting. This should be built **alongside the DSR cascade
work**, not bolted on ahead of it, so the table is shaped by the query it has to serve. Do not pick
this up as a quick win in isolation; a half-scoped audit table is harder to correct later than an
absent one.

**Do not re-raise as "unscoped"** — the scope is above. It is waiting on sequencing, not a decision.

### Verify

Not applicable until built.

---

## ISSUE-44 — App-wide: `-[--token]` Tailwind syntax emits invalid CSS 🔴 {#issue-44}

*Found 2026-07-30, starting from a live UAT report: "the input boxes for groups, email etc didn't
have a button to submit."*

### Symptom

Reproduced live (logged in as `player@test.com`, headless browser, actual dev server): on
`/groups/:id`'s Members tab, the "Invite" button next to the email input has computed
`background-color: rgba(0, 0, 0, 0)` (fully transparent) and `color: rgb(255, 255, 255)` (white) —
white text on a transparent background, invisible against the page. The element **is** in the DOM,
correctly labeled ("Invite"), positioned on-screen, and wired to the right click handler — it just
cannot be seen, which is indistinguishable from "no button" to a user. `/groups`' "Create" group
button uses the identical class shape and is affected the same way.

### Root cause

Both buttons (and, it turns out, most colored/bordered/tinted-text elements in the app) reference a
design-token CSS custom property via Tailwind's **bracket arbitrary-value syntax with a bare
`--token`**, e.g. `className="... bg-[--court-500] text-white ..."` (`GroupChatPanel.tsx:626`,
`MyGroups.tsx:125`). This project is on Tailwind v4.3 (`package.json`: `"tailwindcss": "^4.3.0"`).
Verified directly against the actual CSS compiled and served by the dev server:

```
.bg-\[--court-500\]     { }   ← empty — no declaration at all
.bg-\[--court-600\]     { }
.text-\[--ink-900\]     { }
.border-\[--court-500\] { }
```

v3.4's "shorthand custom property" behavior for `[--token]` does not carry over to v4's
arbitrary-value engine.

**⚠ Correction, 2026-07-30 — the rules are not empty, and this matters.** An earlier read of the
dev-server CSS recorded these as empty (`{ }`). Recompiling the real tree with the Tailwind v4 CLI
directly shows what is actually emitted: the declaration **is** present, with the bare token as its
value — which is invalid CSS, so the browser discards it at parse time.

```css
.bg-\[--court-500\]  { background-color: --court-500; }       ← emitted, invalid value, silently dropped
.mt-\[--s-3\]        { margin-top: --s-3; }                   ← same, on a spacing token
.bg-\(--court-500\)  { background-color: var(--court-500); }  ← the fix, compiles correctly
```

Measured on the current tree: **133 emitted declarations carry a bare `--token` value; zero rules are
empty.** The runtime effect is the same (the property never applies), but the consequence for this
issue is concrete — **the "grep compiled CSS for empty rules" check in the original Verify section
would have found nothing before *or* after the fix, i.e. a false pass.** See the corrected Verify
below.

Contrast with the plain, non-token classes sitting right next to them in the same `className` strings,
which compile correctly: `.bg-white { background-color: var(--color-white); }`,
`.rounded { border-radius: 0.25rem; }`.

Tokens are defined as plain custom properties in `:root` (`styles/tokens.css`), **not** in a v4
`@theme` block, and `globals.css` is a bare `@import 'tailwindcss'`. So Tailwind generates no
`bg-court-500`-style utilities for them, and referencing them through arbitrary-value syntax is
correct — the syntax was simply wrong.

### Scope — this is not two buttons, it's app-wide

```bash
grep -rohE "\b[a-z][a-z-]*-\[--[a-zA-Z0-9-]+\]" packages/frontend/src --include='*.tsx' --include='*.ts' | wc -l   # 1,069 occurrences
grep -rlE  "\b[a-z][a-z-]*-\[--[a-zA-Z0-9-]+\]" packages/frontend/src --include='*.tsx' --include='*.ts' | grep -v __tests__ | wc -l  # 51 files
```

117 distinct `<prefix>-[--token]` combinations. By occurrence count: `border-[--border]` (96),
`text-[--ink-900]` (80), `text-[--ink-500]` (68), `text-[--ink-600]` (64), `text-[--ink-700]` (62),
`bg-[--ink-50]` (29), `text-[--rose-700]` (28), `text-[--court-600]` (25), `bg-[--court-600]` (20),
`ring-[--court-400]` (19), plus 107 more — the grep above reproduces the exact full list on demand.

It reaches the **shared design-system primitives**, not just page-level code —
`components/shared/Button.tsx` (21 occurrences), `Modal.tsx` (19), `Badge.tsx` (13), `MatchCard.tsx`
(17), `TournamentCard.tsx` (19), `ErrorBanner.tsx`/`SuccessBanner.tsx` (9 each) — so this is most
colored, bordered, or custom-tinted-text UI in the app, not an isolated pair of buttons. Top individual
files by occurrence: `MyGroups.tsx` (100), `TournamentDetail/index.tsx` (72),
`TournamentDetail/Details.tsx` (69), `PlayHub.tsx` (52), `Profile.tsx` (47),
`OrganizerDashboard.tsx` (42), `TournamentDetail/Matches.tsx` (41), `GroupChatPanel.tsx` (39),
`StandingsTable.tsx` (35), `ScoreSubmitForm.tsx` (32) — the per-file breakdown for all 51 files is
reproducible by adding a per-file count to the grep above.

**⚠ It is not only colour — spacing is broken too.** The original write-up framed this as "colored,
bordered, or custom-tinted-text UI". Breaking the 1,069 occurrences down by utility family
(2026-07-30) shows roughly a third are neither:

| family | count | | family | count |
|---|---|---|---|---|
| `text-` | 399 | | `rounded-` (+`rounded-t`) | 73 |
| `bg-` | 163 | | `py-` `px-` `p-` `pb-` | 137 |
| `border-` (+`border-l`) | 126 | | `gap-` `space-y-` | 86 |
| `ring-` | 20 | | `mt-` `mb-` `ml-` | 45 |
| `accent-` `w-` `bottom-` | 6 | | `duration-` `ease-` | 14 |

So **padding, gaps, margins, radii and transition timing are silently collapsing app-wide**, not just
colour. The practical consequence for the implementer: **this fix is not visually neutral.** Landing
it makes ~380 previously-dead spacing declarations start applying at once, so layout will visibly
change on essentially every screen. That is the fix working correctly, but it means "spot-check a few
pages" is not sufficient review — expect real layout shifts and budget time to look at them.

**Why this wasn't caught sooner:** most occurrences are `text-` and `border-` utilities, which degrade
less visibly than a missing background — text without an explicit color falls back to the browser
default (usually black-ish), and a missing border just loses a hairline; both can look "close enough"
by accident on a light page. Missing padding reads as "tight" rather than "broken". The failure
becomes glaring only when a `bg-[--token]` (no fill) lands on the same element as an explicit
`text-white` — exactly the "Invite" / "Create" shape — producing a genuinely invisible control.
**28 lines across the tree match that `bg-[--*]` + `text-white` shape**, so there are more invisible
controls than the two reported; they have not been individually confirmed live.

### Decision *(owner, 2026-07-30)* — parens shorthand + a lint guard

**Syntax: `-(--token)`**, Tailwind v4's dedicated custom-property shorthand — not the equally-valid
`[var(--token)]` wrap. Reason is reviewability, not brevity: `[var(--x)]` is one character away from
the broken `[--x]`, so a missing `var(` is invisible in a 1,000-site diff and trivially reintroduced
by a future dev pattern-matching off neighbouring code. `-(--x)` is *visually distinct* from `-[--x]`,
so a regression stands out in review.

**Migrating `tokens.css` to a v4 `@theme` block is explicitly out of scope** — it is the better
long-term architecture (tokens become real utilities and the escape hatch disappears), but it must not
ride along with this fix. This change already shifts spacing on every screen; stacking a token-renaming
migration on top means a broken layout can't be attributed to one or the other. The parens form is a
correct, stable resting point that can stay indefinitely. Raise `@theme` separately if wanted.

### Fix — split into 44a / 44b / 44c *(2026-07-30)*

Mechanical but too large to land in one step: 1,069 sites across 55 files is not a reviewable diff,
and the lint rule needs judgement the codemod doesn't. Split so each piece has its own proof.

**The shared codemod, used by both 44a and 44b.** Pattern
`/(\b[a-z][a-z-]*)-\[(--[a-zA-Z0-9-]+)\]/g` → `'$1-($2)'`. It matches only this exact broken shape and
leaves legitimate arbitrary values (`min-h-[44px]`, `max-h-[600px]`) untouched — they don't start with
`--`. **Write it as a Node script and run it. Do not hand-edit files** — a hand-edited 1,000-site diff
will drift and is unreviewable. Scope to `packages/frontend/src`; do **not** run repo-wide, as
`tokens.css` / `responsive.css` already use correct `var(--token)` CSS syntax and must not be touched.

---

#### ISSUE-44a — codemod the shared design-system primitives {#issue-44a}

**Scope:** `packages/frontend/src/components/shared/**` only, **including its `__tests__`**.

Do the primitives first and alone: `Button.tsx` (21 occurrences), `Modal.tsx` (19), `Badge.tsx` (13),
`ErrorBanner.tsx`/`SuccessBanner.tsx` (9 each), `PaginationControls.tsx`. They fan out to every screen,
so a mistake here is the highest-leverage way to reintroduce the bug — and uniquely, **they already
have specs asserting the exact class strings**, which makes this slice self-verifying:

- `__tests__/Button.spec.tsx` — `toHaveClass('text-[--court-600]')`, `'px-[--s-3]'`,
  `'focus:ring-[--court-400]'`, `'duration-[--duration-normal]'`, …
- `__tests__/Modal.spec.tsx` — `toHaveClass('rounded-[--r-lg]')`, `classList.contains('gap-[--s-2]')`
- `__tests__/PaginationControls.spec.tsx` — `toHaveClass('bg-[--court-500]')`, …

These are pure class-string assertions, so the same codemod fixes them. **Run it over the specs in the
same pass** — otherwise they fail. That the suite is green afterwards *is* the proof the transform was
faithful: the specs pin the exact expected strings.

**Note on coverage:** this is a string substitution with no new executable logic, so it moves no
coverage number and no new tests are warranted. Proof is the existing specs passing plus the greps
below — do **not** invent tests to chase a percentage (CLAUDE.md §13).

#### ISSUE-44b — codemod the remaining ~48 files {#issue-44b}

**Scope:** the rest of `packages/frontend/src` (everything 44a didn't cover). Same script, same
pattern, run once. Largest files: `MyGroups.tsx` (100), `TournamentDetail/index.tsx` (72),
`TournamentDetail/Details.tsx` (69), `PlayHub.tsx` (52), `Profile.tsx` (47), `OrganizerDashboard.tsx`
(42), `TournamentDetail/Matches.tsx` (41), `GroupChatPanel.tsx` (39), `StandingsTable.tsx` (35),
`ScoreSubmitForm.tsx` (32).

**Depends on 44a being merged first** — if the primitives change under you, the diff is harder to
reason about. Same coverage note as 44a.

#### ISSUE-44c — add the lint guard so it cannot regress {#issue-44c}

**This is the part that makes the fix durable, and the part needing real judgement.** Do it last, once
the tree is clean.

`src/__tests__/lint/eslint-config.spec.ts:86` is not an assertion on app code — it encodes
`text-[--ink-900] bg-[--court-500]` as the **approved** token form for the `no-restricted-syntax` rule
that bans raw colour literals (`.eslintrc.json`). That is the root cause of the spread: the rule pushes
everyone toward design tokens, and the only blessed route was a syntax that silently produces invalid
CSS. Fixing 1,069 sites without fixing the rule buys time, not a solution.

- Update `CSS_VAR_CLASSNAME_FIXTURE` to the parens form.
- Add a `no-restricted-syntax` case making `<prefix>-[--token]` an **error**, message naming the fix
  (e.g. *"Use `-(--token)`; the `-[--token]` form emits invalid CSS in Tailwind v4"*).
- Add a fixture asserting the broken form now reports ≥1 error — **that test is the regression guard
  for this entire issue**, so write it first and watch it fail (CLAUDE.md §4).
- Keep `NON_COLOR_ARBITRARY_FIXTURE` (`min-h-[44px]`) passing — the rule must **not** fire on ordinary
  arbitrary values. This is the easy thing to get wrong: a pattern that catches `[--x]` but also
  catches `[44px]` will fail this and must not be "fixed" by deleting the fixture.

**⚠ Found 2026-07-30 during 44b verification — the docs and the rule message still teach the broken
form.** 44a+44b left the *code* clean, but a compiled-CSS check still showed 22 invalid declarations,
which traced back to these. This is the actual regression mechanism and is part of 44c:

- **`.eslintrc.json:77-82` — all 6 occurrences are inside the rule's own error message:**
  *"Use a color token from tokens.css (e.g. `text-[--ink-900]`); raw color literals are banned."*
  So the linter **instructs developers to write the broken syntax every time it fires** — a dev writes
  `#fff`, is told to use `text-[--ink-900]`, and dutifully produces invalid CSS. Fix all 6 messages.
- **`assets/planning/DESIGN_SYSTEM.md:32,76`** — documents the arbitrary-value utilities using the
  broken form as the canonical examples (`px-[--s-4]`, `text-[--ink-900]`, `rounded-[--r-lg]`,
  `border-[--border]`).
- **`assets/planning/DESIGN_SYSTEM_ENFORCEMENT.md:139,145`** — the "must pass" example and the quoted
  rule message.
- **`packages/frontend/src/components/ANIMATION_SPEC.md:91,100,171`** — component animation spec.

**Do NOT rewrite `assets/planning/UAT_ISSUES.md`** — its ~11 occurrences of the broken form are
deliberate: this document *describes* the bug and must keep quoting it verbatim.

`packages/frontend/coverage/` also matches, but it is a gitignored build artifact holding pre-fix
source snapshots; it regenerates and the classes it emits are dead. Leave it alone.

#### ISSUE-44d — visual review (human, not an agent) {#issue-44d}

Per the spacing finding above, ~380 dead spacing declarations start applying when 44a+44b land, so
**layout visibly changes on essentially every screen**. Spot-check Play / Groups / Tournament Detail
and the 28 `bg-[--*]` + `text-white` sites for newly-visible controls. This is a judgement call about
intended appearance, not something a green test suite can answer — do not mark ISSUE-44 resolved on
test results alone.

### Verify

```bash
# 1. Zero occurrences of the broken bracket form remain — INCLUDING tests (no `grep -v __tests__`)
grep -rlE "\b[a-z][a-z-]*-\[--[a-zA-Z0-9-]+\]" packages/frontend/src --include='*.tsx' --include='*.ts'

# 2. Zero invalid bare-token declarations survive in compiled CSS.
#    NOTE: do NOT grep for empty `{ }` rules — there are none, before or after the fix (see the
#    root-cause correction above). Grep for the bare-token *value*, which is the real defect:
npx @tailwindcss/cli@4 -i packages/frontend/src/styles/globals.css -o "$SCRATCH/out.css"
grep -cE '^\s+[a-z-]+: --[a-zA-Z0-9-]+;' "$SCRATCH/out.css"   # expect 0 (was 133)

# 3. The lint guard actually bites
npm --workspace=packages/frontend exec -- jest src/__tests__/lint/eslint-config.spec.ts --bail
```
Manual, the actual repro: `/groups/:id` → Members tab → confirm "Invite" is visibly filled (not
white-on-transparent). `/groups` with zero groups → confirm "Create" is visibly filled. Then walk the
28 `bg-[--*]` + `text-white` sites for other now-visible controls, and check the top-traffic pages for
spacing that has changed.

---

## ISSUE-45 — `seed-test-accounts.spec.ts` fails on a FK violation 🟠 {#issue-45}

*Found 2026-07-30 during the ISSUE-39–44 merge-gate run. **Pre-existing — not caused by that work.***

### Symptom

All 3 tests in `packages/api/src/__tests__/integration/seed-test-accounts.spec.ts` fail, both in a full
run and in isolation:

```
error: update or delete on table "players" violates foreign key constraint
       "player_groups_created_by_fkey" on table "player_groups"
```

### Confirmed pre-existing

Reproduced identically on `7bee748` — the commit immediately *before* any ISSUE-39–44 work — with the
same constraint name. Do not attribute it to the score-logging, audit or Tailwind changes.

### Likely root cause

Leftover `player_groups` rows in the shared dev database reference the seeded player, so the spec's
delete/recreate hits the FK. That points at a **test-isolation leak**, which CLAUDE.md §7 forbids
outright: *"Never autocommit or write directly to the shared DB in tests — a full run must leave row
counts unchanged."* Something is writing outside the transactional harness (`getTestPool()`), most
likely a group-creation path that commits.

Note this is a *different* failure mode from the two flaky specs recorded under "Still open" below
(`reset-password.spec.ts`, `partner-invite-by-email.spec.ts`) — those only fail under parallel load and
pass in isolation. This one fails in isolation too, so it is deterministic, not a race.

### Fix

Find the writer that escapes the harness rather than special-casing the spec. Starting points: whatever
creates `player_groups` rows during integration runs, and whether it uses `this.pool.connect()` +
`BEGIN/COMMIT` (translated to savepoints by the harness) or a raw autocommitting client. **Do not**
"fix" this by deleting rows in a `beforeAll` — that hides the leak and leaves the shared DB dirty for
every other suite.

### Verify

```bash
npm --workspace=packages/api exec -- jest src/__tests__/integration/seed-test-accounts.spec.ts --bail
```
Then confirm the isolation invariant holds: capture row counts before and after a full API run and
confirm they are unchanged.

---

## ISSUE-46 — Organizer "Override" on a not-yet-played match posts as a submit and fails 🟠 {#issue-46}

*Found 2026-07-30 while implementing [ISSUE-40](#issue-40), which is also what made it reachable.*

### Symptom

An organizer sees the **Override** button on *every* match, including `pending` ones that have no score
yet. Clicking it on a pending match opens the score form, but submitting fails — the request is sent to
the wrong endpoint and the organizer is not authorised for it.

### Root cause

Two independent conditions combine:

- `components/shared/MatchCard.tsx:73` — `const canOverride = userRole === 'organizer'`. **No match-status
  gate at all**, so Override renders on pending matches as readily as completed ones.
- `components/ScoreSubmitForm.tsx:60` — `const [isEdit, setIsEdit] = useState(match.status === 'completed')`.
  For a pending match `isEdit` is `false`, so line 103 routes to `submitScore` (**POST**) instead of
  `editScore` (**PATCH**). POST is the participant submit path, and an organizer is not a participant in
  the match, so it fails authorisation.

**This was latent until ISSUE-40.** Before that change `Matches.tsx`'s `handleOverride` was a dead
`// TODO: Task 4.6e` stub — the button rendered but did nothing, so the broken route was never taken.
ISSUE-40 wired the button to the real form (correctly — otherwise its new mandatory reason field would
have been unreachable), which made this path live. It is an incomplete feature now exposed, not a
regression in ISSUE-40's own logic.

### Fix — pick one, they are not equivalent

1. **Gate the button** — add a status condition to `canOverride` so Override only appears where there is
   a score to override. Smallest change; leaves organizers with no way to enter a score for a match that
   was never played.
2. **Route on role, not match status** — have `ScoreSubmitForm` choose PATCH vs POST from whether the
   actor is the organizer rather than from `match.status`. Larger, but it is the option that lets an
   organizer record a result for a match the players never submitted, which is plausibly the real
   requirement.

Decide which behaviour is wanted before coding — (1) and (2) ship different products.

### Verify

Reproduce first: as organizer, open a tournament with a `pending` match, click Override, submit. Confirm
the failure. Then confirm the chosen fix — for (1) the button is absent on pending matches; for (2) the
submission succeeds and logs `score.overridden` with `organizerId` and `reason`.

---

## Not yet triaged / follow-ups

**Decided, recorded so they are not re-raised:**

- **`pages/DesignSpec.tsx` — keep it** *(owner, 2026-07-29)*. It is unreferenced by any route or
  test, and has twice been flagged as dead code. It is retained deliberately as a design reference.
  **Do not delete it, and do not re-raise it.** ⚠ It hand-mirrors `Landing.tsx`'s hero, so a change
  to the Landing hero should be applied to both — that duplication is the real cost of keeping it.
- **Public-discovery features stay deferred** *(owner, 2026-07-29 — reaffirmed)*. The cluster lives
  in [`BACKLOG.md`](../../BACKLOG.md) § Deferred: the location/"Near me" design, the paid organizer
  tier, and the tournament lifecycle sweep. Shared trigger: public tournaments are re-enabled
  ([ISSUE-29](COMPLETED_UAT_ISSUES.md#issue-29)).

**Still open:**

- **`REQUIREMENTS.md`'s "2FA changes" audit item describes a feature that doesn't exist** — verified
  2026-07-30, no `2fa`/`mfa`/`otp`/`twoFactor` reference anywhere in `packages/api/src`. Not filed as a
  numbered issue since there is no code to fix; it's either a doc correction (strike the item) or a
  signal that 2FA itself was scoped and never built. Found alongside [ISSUE-39–43](#issue-39), the
  rest of the Audit Logging cross-check.

- **No technical support destination exists** — no email, form backend, or operator identity in the
  app (verified 2026-07-29). [ISSUE-36](COMPLETED_UAT_ISSUES.md#issue-36) deliberately ships the
  Support section *without* a technical-contact block rather than a placeholder. **Blocked on one
  owner input:** a publishable email address (a `mailto:`, zero build) or a contact form (a backend
  endpoint that does not exist). Until then `ServiceUnavailable.tsx:14` and ISSUE-24's
  `PLAYER_NOT_LINKED` copy keep promising support with nowhere to send people.

- **`coach.ts`'s SSE route (`GET /player/coach/events`) has the same unflushed-header gap ISSUE-38
  fixed on `tournaments.ts`'s route** — verified 2026-07-29 by reading the code, not yet reproduced
  live on this route specifically. `res.flushHeaders()` with no immediate body write, same as the
  tournaments route had: a client can sit in `EventSource` `readyState` `CONNECTING` indefinitely
  through Vite's dev proxy until the first real coach-conversation broadcast. Deliberately **not**
  fixed here — out of scope for ISSUE-38, which was about `real-time-updates.spec.ts`. Same fix
  applies: `res.write(': connected\n\n')` right after `flushHeaders()`.

- **Pre-existing e2e/jest flakiness, not yet triaged, none reproduced as caused by any change in this
  session:**
  - `coach.spec.ts` and `profile.spec.ts` failing on both chromium and firefox, and 10 failures under
    the `pwa` Playwright project — surfaced during ISSUE-34's first-ever clean (zero `RATE_LIMITED`)
    full e2e sweep, 2026-07-29. Not yet individually triaged.
  - Two distinct jest integration tests have been observed failing only under full-workspace
    parallel coverage runs, both passing 100% in isolation (`auth/reset-password.spec.ts` —
    `duplicate key value violates unique constraint "password_reset_codes_code_key"` — and
    `partner-invite-by-email.spec.ts` — a notification-count assertion off by one under load).
    Consistent with random collisions/timing under heavy parallel load, not a real defect; not
    pursued further.

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
