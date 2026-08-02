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
(invite/create-group buttons appeared to have no submit button).

**2 issues filed 2026-07-31 (ISSUE-47–48), both resolved 2026-08-02** — both found by reading the P13
ratings write path while designing its move to the worker (`RATINGS_DESIGN.md` §3b). Neither was
introduced by that design work: both were in Phase 3/4 as built. ⚠ **Unlike every other issue in this
file, these were never shipped defects** — the ratings code exists only on `feat/ratings-p13` and is
absent from `main`. They were filed rather than fixed silently because they were real and easy to lose;
ISSUE-47 closed with Phase 12, ISSUE-48 needed Phase 12 plus P13 Task 14.1 for the first-match gap Phase
12 alone left open. See each issue's section for commit refs.

**4 issues filed 2026-07-31 (ISSUE-49–52)** — from a sweep of the DB operations on daily player hot
paths, done against a "tens of thousands of users" question. Most of that sweep's findings are
**volume-dependent** and are recorded in [`BACKLOG.md`](../../BACKLOG.md) § 🔍 Hot-path DB gaps instead:
they are correct today and cannot be reproduced at current data levels, so they fail this file's
reproduce-first bar. These four are the ones that are **defects right now**, independent of scale.
**Number the next one 53.**

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
| [ISSUE-45](#issue-45) | ✅ Resolved | 🟠 | `seed-test-accounts.spec.ts` fails on a FK violation — e2e debris vs. a destructively re-seeded fixed identity | test · db |
| [ISSUE-46](#issue-46) | ⏸ Tabled | 🔴 | Organizer score override only partially built — Standings button is a placebo | frontend |
| [ISSUE-47](#issue-47) | ✅ Resolved | 🟠 | Rating application is not transactional — a failed doubles settle moves two of four players | api · data |
| [ISSUE-48](#issue-48) | ✅ Resolved | 🟡 | Rating read-modify-write takes no lock — concurrent scores silently lose an update | api · data |
| [ISSUE-49](#issue-49) | 🔲 Open | 🟡 | The whole `config.database` block is dead — four settable env vars do nothing | api · config |
| [ISSUE-50](#issue-50) | 🔲 Open | 🟠 | `StandingsCache` is never read or populated — only invalidated | api · perf |
| [ISSUE-51](#issue-51) | 🔲 Open | 🟡 | Bracket generation recomputes each group's standings once per advancing rank | api · perf |
| [ISSUE-52](#issue-52) | 🔲 Open | 🟠 | Coach SSE route ignores `sseMaxConnectionsPerUser` — unbounded streams per user | api |

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

**Suggested order — re-prioritized 2026-08-02**, after ISSUE-39/40/41/42/44a/44b/44c/47/48 closed. The
previous ordering (44 → 39 → 40 → 41+42) is spent; every issue it named is resolved.

1. ~~**ISSUE-45**~~ — ✅ **done 2026-08-02** (`cebb7b4` red, `55fa8f7` green). It was the merge gate, and
   the API workspace now runs fully green for the first time: 183 suites, 2666 passed, 0 failed, with
   per-table row counts identical before and after the run. ⚠ **Correction:** this list first claimed it
   was the tractable instance of the flaky trio and that one leak explained all four. It does not — see
   its [verified root cause](#issue-45). Different mechanism, no shared fix; **the trio stays untriaged.**
2. **ISSUE-52** — small, and mirrors a check that already exists on the tournament route. **Bundle the
   unnumbered `coach.ts` `flushHeaders()` gap** (under "Still open") into the same pass: same route, same
   handler, one change instead of two.
3. **ISSUE-50** — real defect on the hottest read path. Needs the most care of the four: the
   `include`/`matches` interaction flagged in its Fix section is where a naive cache hit breaks it.
4. **ISSUE-51** — mechanical hoist with a hard assertable invariant (seed array byte-identical). Cheap.
5. **ISSUE-49** — cheap config wiring; natural to fold into whatever next touches pool sizing.

**[ISSUE-44d](#issue-44d) runs in parallel and is not agent work.** It is the only thing between
ISSUE-44 — the sole live 🔴 — and archival, and it is explicitly a human judgement call.

**Not in the queue:** [ISSUE-46](#issue-46) (tabled, owner 2026-07-30) and [ISSUE-43](#issue-43)
(deferred, waiting on the DSR cascade). Do not pick either up.

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

### ~~Likely root cause~~ — superseded 2026-08-02, see below

> *Original hypothesis, kept because it shaped the first fix direction:* leftover `player_groups` rows
> reference the seeded player, pointing at an integration test writing outside `getTestPool()` in
> violation of CLAUDE.md §7. **Right about the leftover rows, wrong about who wrote them** — and that
> difference changes the fix entirely.

### Verified root cause *(2026-08-02, confirmed against the live dev DB)*

**The spec is correctly isolated and is not at fault.** It uses the harness properly
(`seed-test-accounts.spec.ts:25-26` — `getTestPool()` then `beginTransaction`), and `seedTestAccounts`
takes an **injected** pool (`scripts/seed-test-accounts.ts:23`), so under test it runs entirely on the
suite connection. No integration test is escaping the harness. There is no §7 violation here.

The blocking row is **committed data created by e2e runs**:

```
player_groups: acd982cb-3bba-4791-a12c-cd50843de03a  "Pickleball Fundays"
  created_by = player_1785279941972_tq7i6jkv2i  (= player@test.com)   2026-07-30 16:16:40+00
```

`player@test.com` is a **fixed seed identity** (`seed-test-accounts.ts:16`). The destructive actor is the
spec's own clean-slate `beforeEach`, which ran `DELETE FROM public.players WHERE email = ANY(...)`
(`seed-test-accounts.spec.ts:40`) — **not** anything in `seed-test-accounts.ts`, which contains no
`DELETE` at all and is already non-destructive. That delete hits `player_groups_created_by_fkey` against
a row that is *committed* — visible to the suite transaction, but impossible for it to roll back or
affect. Hence deterministic, in isolation, permanently, until that row is dealt with.

Playwright drives the real API on :3001, which commits by design — e2e **cannot** use the transactional
harness, so this is not a leak in the §7 sense. The defect is that a durable fixed identity is reachable
as an actor in e2e, combined with a seed script that assumes it may freely delete and recreate that
identity. Confirmed at scale: 3,593 committed `player_groups` rows, `created_by` overwhelmingly random
`test-<ts>-<n>-<rand>@example.com` e2e players.

⚠ **This is NOT the same failure as the flaky trio** under "Still open" (`reset-password.spec.ts`,
`partner-invite-by-email.spec.ts`, `assistant-anthropic-client.spec.ts`). Those are parallel-load races
within a run; this is committed cross-run debris. **Fixing this will not fix those** — an earlier note
in this file suggested a shared cause, which the evidence above rules out.

### Fix *(shipped 2026-08-02 — `cebb7b4` red, `55fa8f7` green)*

Removed the `DELETE FROM public.players` from the spec's `beforeEach`. Clearing the **account** is the
entire precondition these tests need: every one of them asserts on account state, and the seeder's
`findOrCreatePlayerByEmail` adopts a pre-existing player rather than duplicating it. Deleting the player
too was unnecessary *and* wrong — players are durable identities other tables reference.

The red commit also made the bug reproduce **deterministically**: `beforeAll` now creates a group owned
by the seed player inside the suite transaction, so the spec fails for the real reason on a clean
database too. Without that, **this bug is invisible on a fresh DB** and a future regression would only
resurface on someone's dirty dev machine.

Rejected: hunting for a harness-escaping writer (there isn't one), and deleting the debris rows — that
hides the problem, leaves the shared DB dirty for every other suite, and breaks again next e2e run.

**Separate, larger, do not fold in:** the dev DB holds 198,782 players / 13,365 accounts / 3,593 groups
of uncleaned e2e debris (361 MB). That is a real problem and it is why this one bites, but it is not
this issue.

### Verify

```bash
npm --workspace=packages/api exec -- jest src/__tests__/integration/seed-test-accounts.spec.ts --bail
```
Then confirm the isolation invariant holds: capture row counts before and after a full API run and
confirm they are unchanged.

---

## ISSUE-46 — Organizer score override is only partially built 🔴 {#issue-46}

*Found 2026-07-30 while implementing [ISSUE-40](#issue-40). **Scope corrected the same day** — first
filed as a narrow routing bug on one entry point, which understated it: the feature has two entry
points and neither is finished.*

### Symptom

Score override is a **documented organizer capability** (`REQUIREMENTS.md` § Audit Logging assumes it,
and [ISSUE-40](#issue-40) just made a `reason` mandatory on it), but it does not actually work end to
end from either place an organizer would reach for it.

**Entry point A — Standings tab: the button is a placebo.** `StandingsTable.tsx:206` renders an
**Override** button for organizers, wired through `onOverride` to `Standings.tsx:37`:
```typescript
const handleOverride = (playerId: string) => {
  setOverrideInProgress(true)
  // TODO: Implement score override modal (Task 4.6e)
  setTimeout(() => setOverrideInProgress(false), 500)
}
```
It sets a flag, waits 500 ms, clears it. The organizer sees a spinner and **nothing happens** — no
modal, no request, no error. This is the same failure class as the report that opened
[ISSUE-44](#issue-44): a visible, correctly-labelled control that does nothing, which is
indistinguishable from a broken app to the user.

**Entry point B — Matches tab: works, except on unplayed matches.** `MatchCard.tsx:73` is
`const canOverride = userRole === 'organizer'` with **no match-status condition**, so Override renders
on `pending` matches too. But `ScoreSubmitForm.tsx:60` derives `const [isEdit] = useState(match.status
=== 'completed')`, so for a pending match `isEdit` is `false` and line 103 routes to `submitScore`
(**POST**, the participant submit path) instead of `editScore` (**PATCH**). An organizer is not a
participant, so it fails authorisation.

### Why this surfaced now

Both entry points were dead `// TODO: Task 4.6e` stubs. [ISSUE-40](#issue-40) wired **B** to the real
form — correctly, since otherwise its new mandatory `reason` field would have been unreachable and the
ticket's own manual-verification step impossible. That made B mostly work and exposed its pending-match
hole. **A was not touched and remains a stub.** So ISSUE-40's logic is not at fault; it revealed that
the feature underneath it was never finished.

### Fix

**A — build the Standings override path.** Route it to the same `ScoreSubmitForm` modal that B now uses,
so there is one override implementation rather than two. Note A's handler currently receives a
`playerId`, not a `matchId` — a standings row is a player, and an override needs a specific match, so
this needs a match-selection step or the button belongs on the match, not the row. **Resolve that before
coding; it may be the reason the stub was never finished.**

⚠ **Ratings interaction, added 2026-07-30.** Option 2 below has a consequence outside this issue: the
skill-ratings hook (`RATINGS_IMPLEMENTATION.md` Phase 4) applies a rating on *submission* and only
*corrects* on edit. An organizer PATCHing a never-played match would therefore record a result that
never moves anyone's rating, silently. Choosing option 2 means extending that hook in the same change;
option 1 avoids it entirely.

**B — decide the pending-match behaviour.** Two options that ship different products:
1. **Gate the button** — add a status condition to `canOverride` so Override only appears where a score
   exists. Smallest change; leaves organizers unable to record a result for a match players never
   submitted.
2. **Route on role, not match status** — have `ScoreSubmitForm` pick PATCH vs POST from whether the actor
   is the organizer. Larger, but it is what enables an organizer to enter a result for an unplayed match,
   which is plausibly the actual requirement.

### Verify

Reproduce both first. **A:** as organizer on the Standings tab, click Override — confirm the spinner and
that nothing else happens. **B:** as organizer, click Override on a `pending` match and submit — confirm
the failure. Then confirm the chosen fixes, including that a successful override logs `score.overridden`
with `organizerId` and `reason` (per [ISSUE-39](#issue-39) and [ISSUE-40](#issue-40)).

### Verify

Reproduce first: as organizer, open a tournament with a `pending` match, click Override, submit. Confirm
the failure. Then confirm the chosen fix — for (1) the button is absent on pending matches; for (2) the
submission succeeds and logs `score.overridden` with `organizerId` and `reason`.

---

## ISSUE-47 — Rating application is not transactional 🟠 {#issue-47}

*Found 2026-07-31 while designing P13's move to the worker (`RATINGS_DESIGN.md` §3b). Not introduced by
that design work — present in Phase 3 as built. **Unmerged**: lives on `feat/ratings-p13`, not `main`,
so fix it before that branch lands.*

**✅ Resolved 2026-08-02** — `RATINGS_IMPLEMENTATION.md` Phase 12 (`6ff510d` → `d5f87e1`, then
`3381875` → `6bf7d7c`) wraps the whole settle in one transaction, taking `SELECT … FOR UPDATE` on every
participant before writing, exactly as the Fix section below specifies. Verified by
`ratings-settle-transaction.spec.ts`'s "a settle that throws partway leaves no partial movement" case.

### Symptom

A doubles rating application that fails partway leaves **two of four players moved and two not**. The
score is fine; the ratings are permanently inconsistent, and nothing surfaces — the user sees a
successful score submission.

Worse, it compounds. A later score edit on that match reaches `correctRatingForMatch`, which finds
history rows for the two players that landed and none for the two that did not, and throws
`no prior rating history` (`ratings-service.ts:86`) for the latter — also swallowed.

### Root cause

There is no transaction anywhere in the path. `deps.db` is the bare Pool passed straight through
(`tournaments.ts:653`) and `score-service.ts` opens no `BEGIN`, so every statement autocommits on its
own. `applyDoublesRating` settles four players in sequence (`ratings-service.ts:152-155`), and each
`settlePlayerRating` issues **two** writes (`upsert` then `appendHistory`) — eight independent commits.

The best-effort wrap at `score-service.ts:272` then catches whatever threw and logs
`rating.apply.failed`, by which point the earlier commits are already durable. That wrap is correct in
intent (a rating must never fail a score write) but it converts a partial write into a silent one.

### Fix

Wrap the whole settle in a single transaction — plain `this.pool.connect()` + `BEGIN/COMMIT/ROLLBACK`
per CLAUDE.md §7, so the test harness can rewrite it to savepoints.

⚠ **Do NOT extend the score write's transaction to cover the ratings.** The obvious approach — one
transaction for the whole request — makes a rating failure roll back the *score*, which inverts the
rule that wrap exists to enforce (design R15/§3b: the score is the user's data, the rating is derived).
The ratings settle needs its **own** transaction so it can roll back alone.
⚠ Do **not** add test-only branching to `db.ts` to make the harness cooperate (CLAUDE.md §7).

**`RATINGS_IMPLEMENTATION.md` Phase 12** does this. *(It was Phase 9's Step 9.2 until 2026-07-31, when
Phase 9 was dropped — the fix is unchanged, it just no longer arrives alongside a queue.)* Phase 12 also
batches the settle from 14 statements to ~3, which falls out of the same transaction.

### Verify

Reproduce first: force a throw between the second and third `settlePlayerRating` call in a doubles
apply. Before the fix, two players have moved and two history rows exist. After, no player has moved
and `rating_history` has no rows for that `match_id`.

---

## ISSUE-48 — Rating read-modify-write takes no lock 🟡 {#issue-48}

*Found 2026-07-31 alongside [ISSUE-47](#issue-47), same read-through. Also unmerged — same branch, same
"fix before it lands" window.*

**✅ Resolved 2026-08-02, in two parts:**
- Phase 12 (`6ff510d` → `d5f87e1`, then `3381875` → `6bf7d7c`) added the `SELECT … FOR UPDATE` this
  issue's Fix section asks for — closing it for any player who already had a `player_ratings` row.
- That left a first-match gap: `FOR UPDATE` locks only rows that already exist, so a player's *first*
  match in a (sport, format) was still computed from an unlocked read — this issue's exact shape,
  narrowed to first matches. **P13 Task 14.1** (`95d8463`) closed it by seeding a row for every
  participant (`ON CONFLICT DO NOTHING`) inside the same transaction, before the lock. Verified by
  `ratings-settle-transaction.spec.ts`'s seed-before-lock and mixed seeded/unseeded cases.

### Symptom

Two scores committed near-simultaneously for matches sharing a player leave that player's rating
reflecting only **one** of the two, with `matches_played` short by one.

The detectable signature is that `player_rating_history` and `player_ratings` disagree: both history
rows are written, but the current rating equals the baseline plus only one delta — so the player has
history for more *matches* than their `matches_played` admits.

### Root cause

Classic unserialized read-modify-write. `getFor` (`ratings-repository.ts:41`) is a plain `SELECT` with
no `FOR UPDATE`, and `upsert` (`ratings-repository.ts:79`) writes an **absolute** value — `rating = $4`,
`matches_played = $5` — rather than an increment. Under READ COMMITTED both transactions read the same
baseline and the second write silently overwrites the first. No constraint is violated, so nothing
errors.

Blast radius is narrow **today**: it needs genuine overlap, and in round-robin a player is usually in
one match at a time. It is not impossible, though — casual lets any participant score any match
(`score-service.ts:97`), so two people entering two of one player's matches at once is a real path.

⚠ *Superseded note (2026-07-31):* this previously warned that P13 Phase 9 would widen the race via
concurrent queue workers. **Phase 9 was dropped** (R29 — application stays synchronous), so the window
stays as narrow as it is today. The fix is still required, now in
`RATINGS_IMPLEMENTATION.md` **Phase 12**; it is simply no longer urgent for that reason.

### Fix

Take `SELECT … FOR UPDATE` on every participant's `player_ratings` row before computing deltas, inside
the transaction ISSUE-47 introduces. Lock in a deterministic order — sort the participant ids — or two
doubles matches sharing two players will deadlock instead of racing.

Pinning worker concurrency to 1 also masks it, but is **not** a substitute: it is a deployment setting
that a future scale-out silently removes.

### Verify

Reproduce first: submit two scores concurrently for matches sharing one player and assert the failure —
that player's `matches_played` advances by 1, not 2. After the fix it advances by 2 and the rating
equals the baseline with both deltas applied.

Standing check, useful against real data:
```sql
-- expect: no rows
SELECT h.player_id, h.sport, h.format,
       COUNT(DISTINCT h.match_id) AS rated_matches, r.matches_played
FROM public.player_rating_history h
JOIN public.player_ratings r USING (player_id, sport, format)
GROUP BY h.player_id, h.sport, h.format, r.matches_played
HAVING COUNT(DISTINCT h.match_id) > r.matches_played;
```
⚠ **`COUNT(DISTINCT h.match_id)`, not `COUNT(*)`.** A correction appends a history row *without*
incrementing `matches_played` (Phase 3 Step 3.2, deliberately — the match was already counted), so a
raw row count exceeds `matches_played` on every edited score and the check would be all false
positives.

---

## ISSUE-49 — The whole `config.database` block is dead 🟡 {#issue-49}

*Found 2026-07-31 during the hot-path DB sweep, while checking whether pool size was tunable in prod.*

### Symptom

`APP_DATABASE_CONNECTION_TIMEOUT_MS` is a documented, settable environment variable that does nothing.
Someone tuning a prod incident sets it, redeploys, and observes no change — with nothing in logs or
config output to indicate why.

The documented value is also wrong. `config.ts:521` says the pool acquisition timeout is 5 seconds; the
pool actually uses **2 seconds** (`db-connections.ts:26`).

### Root cause

`config.ts:517-522` defines a full `database` config block — `queryTimeoutMs`, `retryMaxAttempts`,
`retryBackoffBaseMs`, `connectionTimeoutMs` — each with doc comments and env overrides wired in
(`config.ts:635-636`). **Nothing outside `config.ts` reads any of the four.** Verified by grep for each
field name across `packages/api/src` excluding tests: zero consumers.

Meanwhile `initializeDb()` constructs the Pool from hardcoded literals and never consults the config at
all (`db-connections.ts:22-27`): `min: 2`, `max: 10`, `idleTimeoutMillis: 30000`,
`connectionTimeoutMillis: 2000`.

### Fix

Wire the block through, or delete it. Wiring is preferable — pool sizing genuinely needs to be tunable
without a redeploy, and `max: 10` is currently a code change (see
[`BACKLOG.md`](../../BACKLOG.md) § 🔍 Hot-path DB gaps, which covers why the number itself matters).

Pass `getAppConfig().database` into `initializeDb()` and use it for `connectionTimeoutMillis` and the
query timeout. Add `max`/`min` to the config block at the same time, since that is the field anyone
reaching for this actually wants.

⚠ **Do NOT just change the literal 2000 to 5000 to make the comment true.** That leaves the env var
still dead, which is the actual defect — the wrong number is only how it was noticed.

### Verify

Reproduce first: set `APP_DATABASE_CONNECTION_TIMEOUT_MS=9999`, start the API, and confirm the pool
still times out acquisition at 2s. After the fix, the configured value takes effect and
`getAppConfig().database` has at least one consumer outside `config.ts`.

---

## ISSUE-50 — `StandingsCache` is never read or populated 🟠 {#issue-50}

*Found 2026-07-31 during the hot-path DB sweep. Same placebo shape as [ISSUE-46](#issue-46) — wired-up
machinery that cannot do its job.*

### Symptom

`GET /tournaments/:id/bundle` recomputes standings from scratch on every request — two queries per
group plus a `calculateStandings` pass — even though a cache exists specifically to prevent that. Every
player viewing the same tournament recomputes identical standings independently.

### Root cause

The cache is fully built and fully wired, except for the two methods that would make it a cache.

`StandingsCache` declares `get`/`set`/`clear` and `InMemoryStandingsCache` implements all three
(`standings-cache.ts:4-24`). It is constructed at `server.ts:64`, subscribed to cross-instance
invalidations at `server.ts:65`, and passed into app deps (`server.ts:142`, `app.ts:100`). The standings
processor publishes `standings.invalidate` on the bus and calls `clear(groupId)` on every score
(`standings-processor.ts:29-30`).

**Only `clear` is ever called.** Grep for `standingsCache` across `packages/api/src` excluding tests
returns the class, the type import, the wiring, and that one `clear` — no `get`, no `set`. `routes/
tournaments.ts` never references it. So the invalidation channel faithfully maintains an empty Map, and
the bundle endpoint (`tournaments.ts:2870-2898`) never consults it.

### Fix

Read from the cache before the per-group fetch in the bundle's Phase 2, and `set` the computed result.
Keyed by `groupId`, which is what `clear` already uses, so the existing invalidation works unchanged.

⚠ **Check the `include` parameter interaction.** The bundle computes standings only when
`fields.has('standings')` (`tournaments.ts:2871`), and the per-group fetch is shared with the `matches`
field — so a cache hit must not skip work that `matches` still needs.

### Verify

Reproduce first: request the same bundle twice with no score in between and confirm both requests issue
the per-group member/match queries (log at `debug`, or count with `LOG_LEVEL=debug | grep`). After the
fix the second request issues none, and submitting a score makes the next request issue them again.

---

## ISSUE-51 — Bracket generation recomputes each group's standings once per advancing rank 🟡 {#issue-51}

*Found 2026-07-31 during the hot-path DB sweep.*

### Symptom

Publishing a bracket does `Σ(advancing_count) × 2` database queries and that many `calculateStandings`
passes, where `groups.length × 2` and one pass per group would do. A tournament with 4 groups advancing
4 players each does 32 queries instead of 8, computing the identical standings four times per group.

### Root cause

`bracket-processor.ts:47-63` nests the seed walk outside the group walk:

```
for (let rank = 0; rank < maxAdvancing; rank++) {
  for (const group of groups) {
    const members = await deps.groupRepo.findMembersByGroup(group.id)
    const matches = await deps.groupRepo.findMatchesByGroup(group.id)
    const standings = calculateStandings(participants, matchData)
    if (standings[rank]) { seeds.push(...) }
```

A group's standings do not change between rank iterations — each pass recomputes the same array and
reads a different index out of it. The rank-major ordering is **deliberate and must be preserved**: it
is what interleaves seeds across groups (all 1st-place finishers, then all 2nd, …).

### Fix

Hoist the fetch and the computation above the rank loop — build a `Map<groupId, Standing[]>` once, then
index it inside the existing nested walk. The seed ordering is unchanged because only the data source
moves, not the loop structure.

### Verify

Reproduce first: publish a bracket for a tournament with ≥2 groups and ≥2 advancing each, counting
`findMembersByGroup` calls. Before the fix the count is `Σ(advancing_count)`; after, it equals
`groups.length`. The resulting `seeds` array must be byte-identical either way — assert on seed order,
not just seed membership.

---

## ISSUE-52 — Coach SSE route ignores `sseMaxConnectionsPerUser` 🟠 {#issue-52}

*Found 2026-07-31 during the hot-path DB sweep, while sizing SSE connection load.*

### Symptom

A single user can hold unlimited concurrent `GET /player/coach/events` streams. The per-user cap that
exists to prevent exactly this is enforced on the tournament stream and not on the coach stream, so the
protection is bypassed by using the other route.

### Root cause

`tournaments.ts:2764-2771` counts live streams per user in `sseConnectionCount` and returns **429** once
`deps.config.limits.sseMaxConnectionsPerUser` (default 5, `config.ts:526`) is reached.

`coach.ts:234-256` has no equivalent. It goes straight from `resolveCoachConversation` to
`flushHeaders()` and `broadcastBus.subscribe(...)` with no counter, no cap, and no 429 path.

### Fix

Mirror the tournament route's check, keyed on the resolved `playerId`, incrementing before
`flushHeaders()` and decrementing in the existing `req.on('close')` handler alongside `unsubscribe()`.

⚠ **The counter is per-process, not global.** `sseConnectionCount` is an in-memory Map, so the cap is
per-instance and a user spread across instances gets N× the limit. That is a known property of the
existing tournament-route implementation, not something to fix here — it belongs with the
multi-instance work (`PRODUCTION_READINESS.md` PR-3). Match the existing behaviour; do not invent a
distributed counter in this issue.

### Verify

Reproduce first: open 10 concurrent `EventSource` connections to `/player/coach/events` as one player
and confirm all 10 connect. After the fix the 6th returns 429, and closing one frees a slot. Confirm the
tournament route's behaviour is unchanged.

---

## Not yet triaged / follow-ups

**Decided, recorded so they are not re-raised:**

- **Scope is casual *unlisted* tournaments only; organizer features are tabled** *(owner,
  2026-07-30)*. Concretely `mode='casual'` + `visibility='unlisted'` (migration
  `044_casual_mode_schema.sql`) — group-launched, hidden from browse, reachable only by direct URL or
  invite link. **[ISSUE-46](#issue-46) is tabled under this**, not fixed: the Standings Override button
  stays a placebo, so do not pick it up. Consequences worth knowing before anyone re-triages:
  - Casual scoring does not involve an organizer at all. `score-service.ts:97` — *"Casual mode: any
    tournament participant may score any match"* — so the participant path (`score.edited`,
    `actingPlayerId`) **is** the casual flow.
  - [ISSUE-40](#issue-40)'s mandatory override `reason` therefore does **not** burden casual users: it
    is gated on `isOrganizer`, with a named regression test guarding participant self-edits.
  - [ISSUE-39](#issue-39)'s fix to `score.edited` (adding `playerId`) is the audit trail casual
    actually relies on — that one matters here, unlike its `score.overridden` sibling.

- **`pages/DesignSpec.tsx` — keep it** *(owner, 2026-07-29)*. It is unreferenced by any route or
  test, and has twice been flagged as dead code. It is retained deliberately as a design reference.
  **Do not delete it, and do not re-raise it.** ⚠ It hand-mirrors `Landing.tsx`'s hero, so a change
  to the Landing hero should be applied to both — that duplication is the real cost of keeping it.
- **Public-discovery features stay deferred** *(owner, 2026-07-29 — reaffirmed)*. The cluster lives
  in [`BACKLOG.md`](../../BACKLOG.md) § Deferred: the location/"Near me" design, the paid organizer
  tier, and the tournament lifecycle sweep. Shared trigger: public tournaments are re-enabled
  ([ISSUE-29](COMPLETED_UAT_ISSUES.md#issue-29)).

**Still open:**

- **`Matches.tsx:60` — `// TODO: Open MatchDetails modal (Task 4.6e)`** is still a dead stub, found
  2026-07-30 alongside [ISSUE-46](#issue-46). Not filed as a numbered issue because, unlike ISSUE-46's
  Override button, it is **not** wired to a rendered control that promises the user something — the
  match-click handler simply does nothing extra. Verify that before building: if some path does surface
  it, it becomes the same placebo-control defect as ISSUE-46 and should be filed.

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
  - **A third instance, 2026-07-31:** `unit/assistant-anthropic-client.spec.ts` failed in a full
    `test:coverage` run on branch `feat/ratings-p13`, and passes 12/12 in isolation. That branch
    changes no assistant or Anthropic-client file, so it is the same parallel-load pattern, not a
    regression. Three specs now show this behaviour — enough that the shared-state cause is worth
    finding rather than re-confirming case by case. ⚠ **Correction 2026-08-02: this is NOT related to
    [ISSUE-45](#issue-45)**, as previously claimed here. ISSUE-45 was committed cross-run e2e debris
    colliding with a destructive `DELETE`; these three are parallel-load races within a run. Fixing
    ISSUE-45 did not address them and they remain untriaged. (All three passed in the green full run of
    2026-08-02, which is consistent with a race, not evidence they are fixed.)

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
