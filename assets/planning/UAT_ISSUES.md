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

**3 issues filed 2026-08-03 (ISSUE-53–55)** — ISSUE-53 found during the [ISSUE-44d](#issue-44d) visual review: the
Browse tab was present in the nav under review, which the shipped configuration does not have. ISSUE-54 found during frontend testing: creating a second group is impossible from the UI. ISSUE-55 found during group invite testing: pending invites are only visible via email magic links, not in the app.

**ISSUE-56–60 filed 2026-08-03, then verified and re-scoped in an owner grill the same day.**
The verification pass corrected three of the five: ISSUE-56's premise (chat activity *is* badged —
on the Groups tab, not Alerts), ISSUE-58's cost (no display-name endpoint exists at all), and
ISSUE-60's root cause (players are **not** unrated, and the self-rating endpoint is already built).
The grill split ISSUE-56's accumulated scope into **ISSUE-61–63** and spun ISSUE-58's guest-session
defect out as **ISSUE-64**. Decisions are recorded inline in each issue under *Owner decisions*.
**Number the next one 65.**

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
| [ISSUE-52](#issue-52) | ✅ Resolved | 🟠 | Coach SSE route ignores `sseMaxConnectionsPerUser` — unbounded streams per user | api |
| [ISSUE-53](#issue-53) | 🔲 Open | 🟠 | `PUBLIC_DISCOVERY_ENABLED` differs per environment and is never set explicitly — local review validates an app that doesn't ship | config · dev-env |
| [ISSUE-54](#issue-54) | ✅ Resolved | 🔴 | Creating a second group is impossible — "Create your first group" button only appears when groups are empty | frontend |
| [ISSUE-55](#issue-55) | ✅ Resolved | 🔴 | Pending group invites are invisible in the app — users can only accept via email magic links | frontend |
| [ISSUE-56](#issue-56) | 🔲 Open | 🟠 | Group unread is per-device and invisible per group — no way to tell *which* group has new messages | frontend · api |
| [ISSUE-57](#issue-57) | 🔲 Open | 🟡 | Accepting a group invite from Alerts doesn't navigate to the group | frontend · navigation |
| [ISSUE-58](#issue-58) | 🔲 Open | 🟠 | Profile page missing Account section — can't view email or edit display name | frontend · api |
| [ISSUE-59](#issue-59) | ✅ Resolved | 🟡 | Create dedicated Ratings page; move ratings/partners out of Profile; fix bottom nav at 5 tabs | frontend · navigation |
| [ISSUE-60](#issue-60) | 🔲 Open | 🟠 | Self-rating seed prompt never built — `PUT /player/ratings/seed` is unreachable from the UI | frontend · onboarding |
| [ISSUE-61](#issue-61) | ✅ Resolved | 🟠 | Group-chat SSE route ignores `sseMaxConnectionsPerUser` — same hole as ISSUE-52 | api |
| [ISSUE-62](#issue-62) | 🔲 Open | 🟡 | Badges never update live — no SSE push for notification/group unread (blocked on 52 + 61) | frontend · api |
| [ISSUE-63](#issue-63) | 🔲 Open | 🟠 | Opening Alerts marks un-actioned group invites read — badge stops nudging while the invite is still pending | frontend · api |
| [ISSUE-64](#issue-64) | 🔲 Open | 🟠 | Profile shows fake defaults and silently discards saves for guest (magic-link) sessions | frontend |

### Implementation sequence for ISSUE-56–64

**Do not pick these off in numeric order.** One hard dependency and three file collisions decide the
order; ignoring them means rewriting the same regions two or three times.

| # | Do | Why here |
|---|---|---|
| 1 | [ISSUE-61](#issue-61) **+** [ISSUE-52](#issue-52) together | One shared cap helper applied to both unguarded SSE routes. A limit enforced on one route and not the other buys nothing, so they are one change. Unblocks 62. |
| 2 | [ISSUE-56](#issue-56) **backend only** — migration 062, `unread_count`, `PATCH /:groupId/read` | Pure API + schema, collides with nothing. Lets the frontend work land against a real endpoint. |
| 3 | [ISSUE-59](#issue-59) | Restructures the bottom nav into a 5-item array **with badge slots**, and deletes the ratings/partners sections from `Profile.tsx`. Doing this first means steps 4 and 6 land into the new structure instead of being rewritten by it. |
| 4 | [ISSUE-56](#issue-56) **frontend** | Plugs groups-with-unread into the nav array from step 3 and adds the per-row badges. |
| 5 | [ISSUE-64](#issue-64) | Adds the `res.ok` guards and the guest branch to `Profile.tsx` — structural, so it precedes anything that adds new sections. |
| 6 | [ISSUE-58](#issue-58) | Adds the Account section into the now-reduced, now-guarded Profile. |
| 7 | [ISSUE-57](#issue-57) | Small, self-contained `NotificationCard.tsx` change. |
| 8 | [ISSUE-63](#issue-63) | Also edits `NotificationCard.tsx` (clear the row on successful accept) — adjacent to 7 deliberately. |
| 9 | [ISSUE-60](#issue-60) | Independent of everything above; slot it anywhere after step 1. |
| 10 | [ISSUE-62](#issue-62) | **Blocked on 1**, and wants 4 done so it pushes the final badge semantics rather than the interim ones. The 38 `networkidle` rewrites make it the largest and last. |

**The three collisions, stated explicitly** — if the order above is changed, these are what break:

- **`components/shared/ResponsiveLayout.tsx`** — [ISSUE-59](#issue-59) rewrites the nav wholesale
  (`:220-275` hardcoded JSX → array); [ISSUE-56](#issue-56) changes what the Groups badge counts
  (`:160,231-233`). 59 before 56.
- **`pages/Profile.tsx`** — three issues touch it: [ISSUE-59](#issue-59) removes two sections,
  [ISSUE-64](#issue-64) wraps the form in a guest/account branch, [ISSUE-58](#issue-58) adds a
  section. Remove → restructure → add.
- **`components/NotificationCard.tsx`** — [ISSUE-57](#issue-57) adds navigation,
  [ISSUE-63](#issue-63) adds read-state clearing on accept. Both edit `handleAccept`.

**Per §11**: each of these is its own branch off `main` and its own TDD pair of commits (failing
tests, then implementation). Steps 1 and 2 are backend-only and can proceed in parallel with nothing
else; everything from step 3 on is a chain.

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

### Status — 2026-08-03

**✅ Resolved, landed together with [ISSUE-61](#issue-61)** — see that issue's Status block for the
branch, commits, and verification detail (one shared `sse-connection-limiter.ts` helper, applied to
both routes in the same change).

---

## ISSUE-53 — `PUBLIC_DISCOVERY_ENABLED` differs per environment and is never set explicitly 🟠 {#issue-53}

*Found 2026-08-03 at the start of the [ISSUE-44d](#issue-44d) visual review — the nav under review had a
Browse tab, which the shipped configuration does not have. Verified live against the running dev stack.*

### Symptom

The same build presents a **different navigation and a different route set** depending on which
environment it runs in, and no environment states which it wants:

- **Local dev/e2e:** `GET /api/config` returns `{"publicDiscoveryEnabled":true}` — the bottom nav
  carries a fifth tab (Browse), `/browse` and `/tournament/:id/browse` render, and
  `POST /tournaments/:id/register` is open.
- **Deployed (UAT/prod):** the flag is off — four tabs, both browse routes render `NotFound`, and the
  register route 404s.

So any manual walkthrough, screenshot, or design review done locally is validating an app that does not
ship. That is exactly how this was found: the 44d review opened on a nav with one tab too many.

### Root cause

Three separate places, each individually defensible, that together mean **no environment declares its
intent**:

1. **`.env.example:87` ships `PUBLIC_DISCOVERY_ENABLED=true`.** Every dev who bootstraps from the
   example gets discovery on. ⚠ **This is deliberate and the comment above it explains why**
   (`.env.example:82-86`): it keeps `browse-tournaments.spec.ts`,
   `tournament-public-registration.spec.ts` and `tournament-discovery-registration.spec.ts` exercising
   the blocked machinery. **Do not treat this as a typo to flip** — see the Decision below.
2. **The deployed env file never sets it at all.** `infra/modules/api/user_data.sh.tpl:35-47` writes
   `/etc/tournament-app/env` with `NODE_ENV`, `LOG_LEVEL`, `JOB_QUEUE` etc. and no
   `PUBLIC_DISCOVERY_ENABLED`. Deployed environments are correct **only by omission** — `config.ts:785`
   is `process.env.PUBLIC_DISCOVERY_ENABLED === 'true'`, so an unset var falls to `false`. Nothing in
   that template records that this is a decision, so the next person adding env vars has no signal, and
   a single well-meaning line ships public discovery.
3. **`scripts/e2e-setup.js` does not check it.** It checks Postgres, the API, the frontend, the worker
   and the register rate-limit override — but not the one flag that changes which specs run.

### Decision *(owner, 2026-08-03)* — correct in **every** environment, explicitly

Set it explicitly everywhere, to the shipped value, rather than relying on defaults or omission:

| Environment | File | Value |
|---|---|---|
| Local dev | `packages/api/.env` | `false` |
| Example / bootstrap | `.env.example` | `false`, with the rewritten comment below |
| UAT / prod | `infra/modules/api/user_data.sh.tpl` | `false`, written explicitly into the env file |
| CI / e2e default | inherits local | `false` |

**The cost is real and must be handled, not ignored.** With the flag off, the three discovery specs
self-skip via `skipIfPublicDiscoveryDisabled()` (`fixtures.ts:47-52`), as does one case in
`auth.spec.ts:448`. That guard exists precisely so this is a clean skip rather than a failure — but a
permanently-skipped spec is a spec nobody notices rotting. The fix therefore includes an **opt-in
override** so the machinery still gets exercised on purpose:

```bash
PUBLIC_DISCOVERY_ENABLED=true npm run dev --workspace=packages/api
```

Document that one line in `.env.example`'s comment and in `packages/frontend/e2e/README.md`, replacing
the current "set true here" rationale. The default becomes *fidelity to the shipped app*; exercising
blocked machinery becomes a deliberate act.

**Do NOT delete the three specs or the skip guard.** ISSUE-29 is explicitly reversible and this is the
machinery that comes back with one flag flip.

### Fix

1. `packages/api/.env` → `PUBLIC_DISCOVERY_ENABLED=false`.
2. `.env.example:82-87` → flip to `false` and rewrite the comment: state that this mirrors the shipped
   default, and give the inline-override command for running the discovery specs.
3. `infra/modules/api/user_data.sh.tpl` → add `PUBLIC_DISCOVERY_ENABLED=false` to the `ENVFILE`
   heredoc (`:35-47`), next to `LOG_LEVEL`, with a one-line comment naming ISSUE-29. Explicit beats
   correct-by-omission: it is the only thing that makes the decision visible where env vars are edited.
4. `scripts/e2e-setup.js` → add a check that reads `GET /api/config` and **reports** the flag's value
   alongside the existing rate-limit-override line. Report, don't enforce — both values are legitimate;
   the defect is not knowing which one you're running.
5. `packages/frontend/e2e/README.md` → document the override next to the existing conventions.

### Verify

Reproduce first: with the current tree, `curl -s localhost:3001/api/config` returns
`publicDiscoveryEnabled: true` and the bottom nav shows five tabs including Browse.

After the fix:
- `curl -s localhost:3001/api/config` → `{"publicDiscoveryEnabled":false}`; nav shows four tabs; `/browse`
  renders NotFound.
- `node scripts/e2e-setup.js` prints the flag's current value.
- `npx playwright test browse-tournaments.spec.ts --project=chromium --reporter=line` → **skipped, not
  failed**.
- Same spec with `PUBLIC_DISCOVERY_ENABLED=true` on the API → runs and passes, proving the override works
  and the machinery is intact.
- `cd infra && tofu validate` (and `fmt`) after the template edit.

### Note

This does **not** change product scope. Public discovery stays blocked per
[ISSUE-29](COMPLETED_UAT_ISSUES.md#issue-29); Browse could not show first-release tournaments anyway —
`db.ts:312` filters `t.visibility = 'public'` while every group-launched casual tournament is created
`visibility: 'unlisted'` (`player-groups.ts:943`, `app.ts:278`/`323`, `auto-close-processor.ts:99`).
With discovery on, Browse renders an empty list plus a registration path ISSUE-29 deliberately closed.

---

## ISSUE-54 — Creating a second group is impossible 🔴 {#issue-54}

*Found 2026-08-03 during frontend testing on the Groups page.*

### Symptom

A user with one group (e.g., "Pickleball Fundays") cannot create a second group. The **"Create your first group"** button that appears when the groups list is empty vanishes once a group is created, leaving no visible way to add another group. The API supports group creation (`POST /player/groups`) but the UI only exposes it on the empty-list state.

### Root cause

`CreateGroupCta` has exactly two call sites and **both are gated on an empty state**
(`grep -rn CreateGroupCta packages/frontend/src` → the definition at `MyGroups.tsx:62` plus these two):

`packages/frontend/src/pages/MyGroups.tsx:188` — renders only when `groups.length === 0`:

```typescript
{groups.length === 0 && (
  <div className="text-center pt-2 space-y-2">
    <p data-testid="group-list-empty" className="text-(--ink-500)">
      No groups yet. Ask a group owner to invite you, or start your own.
    </p>
    <CreateGroupCta onCreated={refetch} />
  </div>
)}
```

`packages/frontend/src/pages/PlayHub.tsx:116` — the only other usage, gated on
`tournaments.length === 0 && !groupsLoading && !hasGroups`. Also unreachable once a group exists,
so it is not a fallback path.

Net: once a user owns one group, `POST /player/groups` has no reachable caller anywhere in the UI.

### Requirement gaps

| Question | Decision |
|---|---|
| Where does the persistent control live? | Header of My Groups, on the same row as `<h1>My Groups</h1>` (`MyGroups.tsx:184`). Above the fold regardless of list length; no scroll past N groups. |
| Does `PlayHub.tsx` change? | **No.** Its CTA is scoped to its own empty state and two specs pin it there — `PlayHub.spec.tsx:112` and `play-hub.spec.ts:246` (asserts it *inside* `SELECTORS.EMPTY_STATE`). Leave that call site alone. |
| Keep the `create-group-cta` testid? | **Yes.** `MyGroups.spec.tsx:197,213-214` and `PlayHub.spec.tsx:112` select by it. Renaming breaks three specs for no gain. |
| Button label | "Create your first group" (`MyGroups.tsx:103`) is empty-state copy and wrong for a control that is always present. Use **"New group"** — reads correctly in both places (PlayHub's empty state already carries the heading "Create a group to start playing" above it). No trailing full stop. |
| Does the open/closed form state need lifting? | No. `CreateGroupCta` owns `open` internally (`MyGroups.tsx:63`) and already resets it on success (`:88`). |
| Keep the empty-state paragraph? | Yes — leave `group-list-empty` gated on `groups.length === 0`. Only the CTA moves. |

### Fix

`packages/frontend/src/pages/MyGroups.tsx` only:

1. Move `<CreateGroupCta onCreated={refetch} />` out of the `groups.length === 0` block into the
   header row next to the `<h1>` (`:184`), so it renders unconditionally.
2. Change the button label at `:103` to `New group`.
3. Keep the `group-list-empty` paragraph inside its existing conditional.

The component is already reusable and self-contained — no props or state changes are needed.

Per §9, this is user-visible behaviour: update `docs/assistant-help.md` in the same change so @coach
can answer "how do I create another group".

### Tests first (TDD — §4, §11)

Red before implementation, committed separately:

- `packages/frontend/src/components/__tests__/MyGroups.spec.tsx` — new case: **CTA is present when
  the list already has ≥1 group.** Only the empty-state case is covered today (`:188`), which is why
  this shipped. This is the test that must fail first.
- Same spec: create-a-second-group flow — click `create-group-cta`, type into
  `create-group-name-input`, submit, assert `POST /player/groups` fired and the list refetched.
- E2E `packages/frontend/e2e/player-groups.spec.ts` (selection-map row "Player groups",
  `e2e-scenarios.md:201`): seed a player who already owns a group, load `/groups`, create a second,
  assert both render. Bump that row's scenario count in the same change (§8).
- Regression check, do not break: `PlayHub.spec.tsx:112`, `play-hub.spec.ts:246`.

Selection for the pre-merge run: `npx jest --findRelatedTests packages/frontend/src/pages/MyGroups.tsx --bail`
in `packages/frontend`, plus `npx playwright test player-groups --project=chromium --reporter=line --max-failures=1`.

### Verify (manual)

1. Log in with an account that owns no groups → CTA visible on the empty state.
2. Create a group → CTA still visible in the header after the list renders.
3. Create a second group → it appears in the list.
4. PlayHub with no tournaments and no groups → empty-state CTA still there.

---

## ISSUE-55 — Pending group invites are invisible in the app 🔴 {#issue-55}

*Found 2026-08-03 during group invite testing. Companion to ISSUE-54 (missing create button).*

### Symptom

A user invited to join a group via email has no way to see or accept that invite from within the app. The **Alerts** page (`/notifications`) exists and shows notifications, but pending group invites never appear there — they only exist in the email link. If the user never leaves the app to check email, they will never know they have an invitation.

### Root cause

Deeper than "not routed to the notification stream" — **no persisted invite record exists at all**:

- `POST /player/groups/:groupId/invites` (`packages/api/src/routes/player-groups.ts:402`) mints a
  token with `generateGroupInviteToken(...)` into `deps.tokenStore` and emails the link. Nothing is
  written to Postgres.
- `TokenStore` (`packages/api/src/auth/token-store.ts:6`) is a key-value interface — `set`/`get`/`del`
  by token key. It **cannot be queried by email or by group**.
- There is no invites table: `db/migrations` ends at `061_player_ratings.sql`, and
  `grep -rn invite db/migrations` returns nothing.
- `/player/notifications/messages` (`packages/api/src/routes/player.ts:271-296`) is a plain SELECT
  over `messaging.group_messages` in the player's `personal` conversation. It can only ever show rows
  that were *written* at some point.

So a pending invite exists solely as (a) a KV entry keyed by the token and (b) an email in someone's
inbox. There is nothing to list. **Any in-app surface requires persisting something at send time** —
this is a write-path change, not a read-path one.

### Requirement gaps

1. **Durable record vs notification row — pick one.**
   - **(A) Post a notification at invite-send time — recommended.** In the send handler, look up
     `playerRepo.findByEmail(...)` (`packages/api/src/db.ts:491`); if a player exists, call
     `groupMsgRepo.postPersonalNotification(...)` (`group-message-repository.ts:365`). No migration,
     no new endpoint, and it inherits the existing feed, unread badge, and SSE broadcast for free.
   - **(B) New `player_group_invites` table** (migration `062_*`) + `GET /player/groups/invites/pending`.
     Durable, revocable, listable by the owner — but it is a schema + endpoint + repository + a
     client-side merge of two feeds.
   - **Decision: (A).** Nothing currently filed asks for invite revocation or an owner-side "pending
     invites" view, which is the only thing (B) buys. Revisit if that gets requested.

2. **Invitees with no account are out of scope for the in-app path.** `findByEmail` returns nothing
   for an email the system has never seen, so there is no player to attach a notification to. Email
   stays the only channel for those, and the existing email send must be left untouched. The verify
   steps below use an existing account (`bob@test.com`), which is exactly the covered case.

3. **`postPersonalNotification` hardcodes the message type.** It inserts the literal `'system'`
   (`group-message-repository.ts:396`), so the notification **cannot** carry `type: 'group_invite'`
   as this issue originally assumed. Branch on `metadata` instead of adding a type parameter — that
   matches how `NotificationCard` already distinguishes deep-links today (`metadata.groupId` vs
   `metadata.registrationId`, `NotificationCard.tsx:23-24`).

4. **The frontend has no session email — carry it in the metadata.** `localStorage` holds only
   `auth_token` (`useGroupList.ts:45` and every other hook), and there is no `/player/profile`
   endpoint returning an email. Since the send handler already knows the invited address, put both
   `inviteEmail` and `groupInviteToken` in the notification metadata; the accept call then has
   everything it needs and **no backend accept-endpoint change is required**. (The original
   "derive email from JWT" step is therefore unnecessary — skip it.) Security note: this puts a
   single-use, email-bound token in `group_messages.metadata`, readable only through that player's
   own notification feed — equivalent exposure to the email already sent.

5. **Accept returns a fresh session token — the in-app caller must ignore it.**
   `POST /:groupId/invites/accept` ends by minting a *player session* and returning `{ token }`
   (`player-groups.ts:373-393`). The magic-link page stores it; an already-logged-in **account**
   holder must not, or they are silently downgraded to a guest player session. This is the same
   dual-auth clobber class found during the personalization work — treat it as a hard requirement on
   the frontend handler, and assert it in the test.

6. **No age gate on the in-app path** — correcting this issue's original text. The gate lives in
   `findOrCreatePlayerByEmail` and only fires for *new* players (`player-groups.ts:343-352`,
   `db.ts:437`). A logged-in player has already attested, so there is no `DobScreen` step. Keep
   `DobScreen` on the magic-link `InviteAcceptPage`, where a brand-new player can land.

7. **Group name is not on `GroupRepository`.** The accept handler already does raw SQL against
   `public.player_groups` (`player-groups.ts:335`), so `SELECT name FROM public.player_groups WHERE id = $1`
   in the send handler matches local style. Don't add a repository method for one field.

8. **Duplicate and expired invites.** Re-inviting the same email posts a second notification while
   the older token stays valid until its 7-day TTL. Accepting is idempotent (membership insert is
   `ON CONFLICT DO NOTHING`, `player-groups.ts:365`), so the worst case is a stale card whose Accept
   returns `TOKEN_INVALID` (single-use). **Accepted for v1:** the card surfaces that error inline and
   stays dismissible — it must not fail silently. No dedupe logic.

### Fix (design A)

**Backend** — `packages/api/src/routes/player-groups.ts`, send handler at `:402`, after the email send:

1. `SELECT name FROM public.player_groups WHERE id = $1` for the group name.
2. `const existing = await playerRepo.findByEmail(email.trim().toLowerCase())`.
3. If found, fire-and-forget (same pattern as `postSystemEvent` at `:387`, `.catch` → `log.warn`):
   ```typescript
   groupMsgRepo.postPersonalNotification(
     existing.id,
     `You've been invited to join ${groupName}`,
     { groupId, groupName, groupInviteToken: token, inviteEmail: email.trim().toLowerCase() }
   )
   ```
4. Log `group.invite.notified` next to the existing `group.invite.sent` (§6: `noun.verb` past tense,
   include `groupId` + actor).

**Frontend**

5. `NotificationCard.tsx` — widen `NotificationMessage['metadata']` with `groupName?`,
   `groupInviteToken?`, `inviteEmail?`. When `groupInviteToken` is present, render the body plus an
   inline **Accept** button (`data-testid="notification-invite-accept"`) instead of the plain
   deep-link `<Link>`.
6. On click: `POST /player/groups/${metadata.groupId}/invites/accept` with
   `{ token: metadata.groupInviteToken, email: metadata.inviteEmail }` and the `Authorization` header.
   **Discard `token` from the response** (gap 5). On success, refetch; on `TOKEN_INVALID`, show
   "This invite is no longer valid" inline and keep the card dismissible.
7. `Notifications.tsx` — thread a refetch callback down to `NotificationCard` so an accepted card
   disappears.

Per §9, update `docs/assistant-help.md` in the same change (how a player finds and accepts an invite
without leaving the app).

### Tests first (TDD — §4, §11)

Red before implementation, committed separately:

- `packages/api/src/__tests__/integration/group-invite.spec.ts` — invite to an email that **already
  has a player** writes a personal notification carrying `groupInviteToken` + `inviteEmail`; invite
  to an **unknown** email writes none and still sends the email.
- Same spec: accepting with the metadata token adds membership and is idempotent on a second call.
- `packages/frontend/src/components/__tests__/NotificationCard.spec.tsx` — renders an Accept button
  when `metadata.groupInviteToken` is present; posts token + email; **does not write the response
  `token` to `localStorage`** (gap 5); renders the inline error on `TOKEN_INVALID`.
- `packages/frontend/src/__tests__/components/Notifications.spec.tsx` — card disappears after accept.
- E2E: `packages/frontend/e2e/invite-accept.spec.ts` (selection-map row at `e2e-scenarios.md:204`) —
  owner invites an existing account, invitee opens **Alerts**, accepts in-app, lands as a member.
  `notifications.spec.ts` (row at `:197`) covers the feed rendering. Bump both scenario counts (§8).

Selection for the pre-merge run: `npx jest --findRelatedTests` on the touched API + frontend files
per workspace (expect the API side to be wide — the integration specs import the express app), plus
`npx playwright test invite-accept --project=chromium --reporter=line --max-failures=1`.

### Verify (manual)

1. As a group owner, invite a second existing test account (e.g. `bob@test.com`).
2. Log in as that account.
3. Open the **Alerts** tab (🔔, bottom navigation).
4. Confirm a card shows the group name and an **Accept** button.
5. Click **Accept** → card disappears, group appears on My Groups.
6. Confirm you are still signed in as the same account afterwards (gap 5 — no session downgrade).
7. Invite an email with no account → no in-app card, email still delivered, magic link still works.
8. Accept the same invite twice → second attempt shows the inline "no longer valid" message.

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

- **Ratings page v2 — trend, head-to-head, W/L by format** *(owner, 2026-08-03, deliberately not
  numbered)*. Cut from [ISSUE-59](#issue-59), whose v1 ships only what has data behind it. Each needs
  a new endpoint: rating history (`public.player_rating_history` is populated but nothing exposes
  it), per-partner head-to-head (`GET /player/partners` returns names and `lastPartneredAt` only),
  and a global W/L by format (W/L exists per *group* via the leaderboard routes, never per player
  across tournaments). They share one unresolved design question — what a player's record even means
  across tournaments and casual play — so they wait on the **P13 ratings grill** rather than being
  filed as work.

---

## ISSUE-56 — Group unread is per-device and invisible per group 🟠 {#issue-56}

*Filed 2026-08-03 as "Alert badge only shows for group invites"; re-scoped the same day after
verification disproved the premise. Original text preserved under "As originally filed" below.*

### Symptom

A user with several groups can see that *something* is unread but not *where*. The Groups tab shows
one aggregate number across all groups; the My Groups list rows show only name, member count, and an
Owner tag. Finding the new messages means opening groups one at a time.

Separately, the count is wrong on any device but the one that read the messages: a second device, a
cleared cache, or a fresh PWA install reports **every message in every group as unread**.

### Root cause

Group unread is computed entirely client-side. `getLastSeenCount` / `markGroupSeen`
(`packages/frontend/src/state/group-unread-state.ts:24-36`) store the last-seen message count in a
`localStorage` key per group (`group-last-seen:<groupId>`), and `useGroupUnread` diffs that against
`messageCount` from `GET /player/groups`. There is no server-side read state for group chat —
`messaging.group_message_recipients` rows are written only by `postPersonalNotification`
(`group-message-repository.ts:405`), i.e. for the personal notification thread, never for group
messages. So on a device that has never opened a group, `getLastSeenCount` returns 0 and the whole
history reads as unread.

The per-group data already exists in memory (`groupUnreadStore` keeps a `Map<groupId, count>`) but
the store only exposes `total()`, and `MyGroups.tsx:201-216` renders no badge.

**Not a defect, verified:** `messageCount` excludes system messages (`group-repository.ts:302-303`)
and `markGroupSeen` records the same non-system count, so those two agree — the badge does clear
correctly on the device that read them.

### Owner decisions (grill, 2026-08-03)

| Question | Decision |
|---|---|
| Should chat/polls go to the Alerts badge? | **No.** Two badges, two meanings: Groups = "activity in your groups", Alerts = "something targeted you". The @mention-only scope of the Notifications Center is deliberate (`player-groups.ts:700-704`) and stays. |
| Client-side or server-side read state? | **Server-side.** No live data, so no backfill concern — but the column still ships as a numbered migration, because the runner records applied filenames in `public.schema_migrations` and skips them (`migrations.ts:29,48`); editing `039` in place would silently never apply. |
| What does the Groups tab badge count? | **Number of groups with unread**, not total messages. |
| What do the list rows show? | **Per-group unread count, capped at `99+`.** |
| Live updates? | Out of scope here — [ISSUE-62](#issue-62), blocked on the SSE cap fixes. |

### Fix

**Backend**

1. Migration `062_group_last_read.sql`:
   ```sql
   ALTER TABLE public.player_group_members
     ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT now();
   ```
   `NOT NULL DEFAULT now()` mirrors the existing `joined_at` column (`039_create_player_groups.sql:36`)
   and settles two things at once: existing dev rows are stamped on migrate, and every future join
   defaults to "caught up" — so no NULL branch is needed anywhere, and no application-level seeding
   at join.
2. `GroupRepository.getGroupsForPlayer` (`group-repository.ts:295-318`) already runs a per-group
   correlated subquery for `message_count`; add a sibling `unread_count` over the same join with
   `AND gm.created_at > m.last_read_at AND gm.player_id IS DISTINCT FROM $1` — the second clause
   keeps the player's own messages out of their own unread count, which matters once another device
   can post. Return it on the row.
3. New route — `PATCH /player/groups/:groupId/read`, setting `last_read_at = now()` for the caller's
   membership row. Idempotent; 403 for non-members. §6: log `group.read` at `info` with `groupId` +
   `playerId`.

**Frontend**

5. `useGroupList.ts:9-16` — add `unreadCount: number` to `GroupSummary` (the API already sends
   `messageCount`; this adds the new field alongside it).
6. `group-unread-state.ts` — delete `getLastSeenCount` / `markGroupSeen` and the
   `group-last-seen:` keys. `groupUnreadStore` stays but becomes a cache of the server number plus
   optimistic clear-on-open. **The subscriber contract changes**: today `Subscriber` is
   `(total: number) => void` and `notify()` pushes `total()`. The Groups badge now needs a *count of
   groups*, so change the callback to `() => void` and let each consumer read what it wants via
   `total()` / a new `groupsWithUnread()` / a per-group getter. Adding `groupsWithUnread()` alone is
   not enough — the value never reaches a subscriber.
7. `useGroupUnread.ts` — stop diffing; read `unreadCount` per group into the store. **The hook's
   return value changes meaning**, from total unread messages to number of groups with unread; rename
   it (e.g. `useGroupsWithUnread`) so the change is not silent at the call site.
8. `ResponsiveLayout.tsx:160,231-233` — the Groups badge renders that count.
9. `useGroupMessages.ts:188-194` — this effect currently depends on `[active, groupId, messages]`,
   so it re-marks on **every message change while the panel is open**. A PATCH there would fire one
   request per arriving message. Instead: fire the PATCH once when `active` flips true and once on
   unmount/`active` flips false, and keep `clearGroupUnread(groupId)` on every message change for the
   instant local response. The local clear is free; only the network call needs the narrower trigger.
10. `MyGroups.tsx:201-216` — render a per-row badge, `data-testid="group-unread-badge"`, showing
    `unreadCount > 99 ? '99+' : unreadCount`, omitted entirely at 0.

### Tests first (TDD — §4, §11)

Note this feature has **zero test coverage today** — nothing in `src` or `e2e` references
`markGroupSeen`, `getLastSeenCount`, `group-last-seen`, or `groupUnreadStore`. The replacement gets
the coverage the original never had.

- `packages/api/src/__tests__/integration/` — `getGroupsForPlayer` returns `unreadCount` excluding
  system messages and messages older than `last_read_at`; the PATCH stamps it; a fresh member joins
  with nothing unread.
- `packages/frontend/src/components/__tests__/MyGroups.spec.tsx` — badge renders for a group with
  unread, is absent at 0, and shows `99+` above 99.
- `ResponsiveLayout` spec — Groups badge counts *groups*, not messages (3 groups with 40 unread each
  shows `3`).
- E2E `player-groups.spec.ts` (selection map, `e2e-scenarios.md:201`) — second member posts, first
  member's list shows the count, opening the group clears it. Bump the row's scenario count (§8).

### Verify

1. Two accounts in two groups; B posts 3 messages in one group.
2. A's Groups tab shows `1` (one group has unread), that group's row shows `3`.
3. A opens the group → both clear.
4. A signs in on a second browser → still clear (this is the case that fails today).
5. A group with >99 unread shows `99+`.

### Status — 2026-08-03, backend only (step 2 of the sequence)

**Backend ✅ done and merged to `main`. Frontend (Fix steps 5-10) is step 4 of the sequence — not
started yet; do not mark this issue Resolved until that lands too.**

- Branch: `fix/issue-56-backend-group-unread` (off `main`, merged back after this step).
- Red: `test(groups): [RED] server-side per-group read state (ISSUE-56 backend)` (`c1daf98`) — new
  `packages/api/src/__tests__/integration/group-unread.spec.ts`, 6 cases covering `unreadCount`
  (excludes system messages, excludes the caller's own messages, fresh-member-is-caught-up),
  `PATCH /:groupId/read` (stamps, idempotent, 403 non-member).
- Green: `feat(groups): [GREEN] server-side per-group read state (ISSUE-56 backend)` (`beddd68`) —
  migration `062_group_last_read.sql`; `GroupRepository.getGroupsForPlayer`'s new `unread_count`
  subquery; `GroupRepository.markGroupRead`; `PATCH /player/groups/:groupId/read` route.
- **Trap worth recording**: the whole jest suite runs inside one outer transaction
  (`getTestPool()`'s harness), so Postgres `now()` is frozen to that transaction's start for its
  entire run — a member row inserted with `DEFAULT now()` and a message inserted moments "later" in
  wall-clock time land on the *identical* timestamp. Tests asserting "unread since I joined" had to
  explicitly backdate `last_read_at` via `now() - interval '1 hour'` rather than relying on insert
  order. Anyone writing a future test against `created_at`/`last_read_at`-style ordering in this repo
  will hit the same thing.
- Verified: new spec green (6/6); `assistant-toggle.spec.ts`, `assistant-digest-toggle.spec.ts`,
  `group-invite.spec.ts`, `repositories/group-repository.spec.ts`, `groups.spec.ts`
  regression-checked, unaffected; `--findRelatedTests` on the 4 touched files green apart from the
  pre-existing `notify-prefs.spec.ts` failure (unrelated `wip(profile)` commit, already flagged
  there).
- Left open for step 4 (frontend): `useGroupList.ts` doesn't read `unreadCount` yet;
  `group-unread-state.ts`'s `getLastSeenCount`/`markGroupSeen`/`group-last-seen:` keys are still
  live (client-side shadow state, now redundant but not yet removed); `groupUnreadStore`'s
  `Subscriber` signature hasn't changed; `useGroupUnread.ts` still diffs client-side;
  `ResponsiveLayout.tsx`'s Groups badge is untouched; `MyGroups.tsx` has no per-row badge;
  `useGroupMessages.ts`'s mark-read effect doesn't call the new PATCH.

### As originally filed

The original text claimed the Alerts badge should increment for all group messages and polls. The
mechanism it described is accurate — `notifyPlayer` fires only for `eventType === 'mentions'`
(`player-groups.ts:707`), and polls only enqueue `messaging.notify` push/email jobs
(`poll-service.ts:118-133`) — but the conclusion was wrong: group activity **is** badged, on the
Groups tab, via `useGroupUnread`. Routing it to Alerts as well would double-count against that badge
and, per the P9 comment at `player-groups.ts:681-690`, the "all" tier has no personal toggle
(no `notify_messages` column), so it would bypass quiet hours.

---

## ISSUE-57 — Accepting a group invite doesn't navigate to the group 🟡 {#issue-57}

*Found 2026-08-03 during frontend testing of group invite acceptance flow. Verified 2026-08-03;
severity lowered 🔴 → 🟡 — the accept succeeds and membership is correct, only the landing is wrong.*

### Symptom

Clicking "Accept" on a group invite in the Alerts feed accepts the invite and removes the card, but
leaves the user sitting on the Alerts page instead of taking them to the group they just joined.

### Root cause

`handleAccept` (`packages/frontend/src/components/NotificationCard.tsx:53-79`) calls `onAccepted?.()`
and stops. Since the invite card renders as a `<div>` rather than the `<Link>` used for other
notification types, nothing else provides navigation either.

The email path does navigate: `InviteAcceptPage.tsx:61` calls
`window.location.replace('/groups/${groupId}')`.

### Owner decisions (grill, 2026-08-03)

- **Navigate to the group chat on success**, so the in-app and email paths land identically.
- **Use `useNavigate()`, not `window.location.href`** — a full reload discards SPA state and
  refetches everything. `GroupDetail` calls `useGroupList()` which fetches on mount, so the freshly
  joined group is present with no cache invalidation.

### Fix

`NotificationCard.tsx` — take `useNavigate()` and, after a successful accept:

```typescript
onAccepted?.()
navigate(`/groups/${groupId}`)
```

⚠️ **Hooks-rules trap:** `handleAccept` is declared *inside* `if (groupInviteToken && groupId) {`
(`:52`). `useNavigate()` must be called at the top level of `NotificationCard`, above that
conditional — calling it inside throws "Rendered more hooks than during the previous render" the
moment a non-invite notification renders.

Keep discarding the `token` from the accept response (ISSUE-55 gap 5) — navigating must not become
an excuse to store the guest session it mints.

### Tests first (TDD — §4, §11)

- `NotificationCard.spec.tsx` — on a successful accept, `useNavigate`'s spy is called with
  `/groups/<id>`; on `TOKEN_INVALID`, it is **not** called and the inline error renders.
- E2E `invite-accept.spec.ts` (selection map, `e2e-scenarios.md:204`) — accepting from Alerts lands
  on the group chat.

### Verify

1. Player A invites Player B to a group.
2. B opens Alerts, clicks Accept.
3. The app navigates to `/groups/{groupId}` and the chat renders.
4. B is a member (members list, can post).
5. B is still signed in as the same account — no session downgrade.

---

## ISSUE-58 — Profile has no Account section: email invisible, name uneditable 🟠 {#issue-58}

*Found 2026-08-03 during user testing of Profile page features.*

### Symptom

The Profile page (`/profile`) has sections for Display, Notifications, Availability, and Coach settings, but no Account section. Users cannot view or edit their personal account information like email address, display name, or password.

### Root cause

`Profile.tsx` renders six sections — Display (`:214`), Notifications (`:264`), Availability (`:331`),
Coach (`:377`), Your Rating (`:427`), Recent Partners (`:468`) — and no Account section.

It **already fetches** `/api/auth/me` at `:77`, which returns `id`, `email`, and `role`
(`auth.ts:341-344`). So displaying the email needs no new request, only rendering.

Two costs the original filing missed:

- **There is no endpoint to change a display name.** No `UPDATE public.players SET name` exists
  outside tests, and the auth router exposes only `signup`, `PATCH /me/settings`,
  `PUT /me/availability`, `logout`, `forgot-password`, `reset-password`.
- **Names are how `@mentions` resolve.** `parseMentions` extracts the raw string and
  `player-groups.ts:687-690` matches it case-insensitively against member names, so a rename changes
  who `@OldName` reaches. Past messages are unaffected — they carry `sender_name_snapshot`, which is
  the intended behaviour.

### Owner decisions (grill, 2026-08-03)

| Question | Decision |
|---|---|
| Section contents | **Email (read-only) + editable display name + a password-change button.** |
| Password change | **Reuse the existing emailed-code flow** (`POST /api/auth/forgot-password` → `/reset-password`). No new authenticated change-password endpoint — the email round-trip is the safer pattern and avoids securing a new surface. |
| Rename ripple | Accepted. Reuse the existing `isReservedDisplayName` guard; historical `sender_name_snapshot` values stay as they were. |
| Guest (magic-link) sessions | Out of scope here — the whole `/api/auth/me` family is account-gated. Split out as [ISSUE-64](#issue-64). |

### Fix

**Backend**

1. `PATCH /player/name` — updates `public.players.name` for the caller. Use `/player`, not
   `/api/auth/me`: it resolves via `resolvePlayerId`, which is the player-scoped auth used by the
   rest of the player router, and it needs no new CloudFront behavior (§9) since `/player` is already
   a mounted prefix. Validation: trim; reject empty; reject > 50 chars (the longest name the group
   member list renders without wrapping); reject reserved names via `isReservedDisplayName`
   (`assistant/trigger.ts`). §6: log `player.renamed` at `info` with `playerId`.

**Frontend**

2. `Profile.tsx` — add an **Account** section as the first section, above Display:
   - email, read-only, from the `/api/auth/me` response already in hand;
   - display name with an inline edit control calling the new PATCH;
   - a "Change password" button that POSTs `/api/auth/forgot-password` for the signed-in email and
     confirms "Check your email for a reset code".

Per §9, update `docs/assistant-help.md` in the same change — @coach should be able to answer "how do
I change my name or password".

### Tests first (TDD — §4, §11)

- API integration — rename succeeds and is reflected in `GET /player/groups` member lists; reserved
  names are rejected; an empty/whitespace name is rejected.
- `Profile.spec.tsx` — the Account section renders the email from `/api/auth/me`; submitting a new
  name calls the PATCH; the password button posts to `forgot-password` and shows the confirmation.

### Verify

1. `/profile` shows an Account section at the top with the signed-in email.
2. Change the display name → persists across reload.
3. The new name appears in group member lists; **older chat messages keep the old name** (snapshot —
   expected, not a bug).
4. "Change password" sends the reset email and the emailed code works.

---

## ISSUE-59 — Ratings has no home; bottom nav must fix at 5 tabs 🟡 {#issue-59}

*Found 2026-08-03 during frontend testing; user feedback on information architecture.*

### Symptom

Player ratings and partner information are not prominently displayed in the Profile page. The bottom navigation bar currently shows: Browse (when enabled), Play, Groups, Alerts, More — in that order. Ratings would be better served as a dedicated page with its own nav tab.

### Requirement

1. **Create new Ratings page** (`/ratings` or `/player/ratings`):
   - Display player's current rating (per sport/format)
   - Show rating history / trend over time
   - Display recent partner pairings and head-to-head records
   - Show W/L record breakdown by match format

2. **Add star icon to bottom nav** for the Ratings page

3. **Reorder bottom nav to**: Groups, Play, Ratings, Alerts, More
   - Keeps social/group features first (Groups)
   - Match/play features second (Play)
   - Personal stats third (Ratings)
   - Notifications fourth (Alerts)
   - Overflow (More)

4. **Remove ratings/partners from Profile page** — Profile should focus on account settings and preferences, not statistics

### What actually exists

Verified 2026-08-03 — only two of the five requested elements have data behind them:

| Element | Status |
|---|---|
| Current rating per sport/format | ✅ `GET /player/ratings` returns rating, `matchesPlayed`, `provisional`, plus `min`/`max`/`seedDefault` |
| Recent partners | ⚠️ `GET /player/partners` returns `playerId`, `name`, `lastPartneredAt` **only** (`player.ts:247-256`) |
| Rating trend / history | ❌ `player_rating_history` is populated but no endpoint exposes it |
| Head-to-head records | ❌ nothing computes them |
| W/L by format | ❌ W/L exists per *group* (leaderboard routes), not globally per player |

### Owner decisions (grill, 2026-08-03)

| Question | Decision |
|---|---|
| Page scope | **Ship what exists** — current ratings (with the provisional flag) + the recent-partners list. |
| The three missing features | Recorded under *Not yet triaged / follow-ups*, **not numbered** — P13 ratings hasn't been grilled, so what the page should show may still change. |
| Nav slots | **Fix the bottom nav at 5 tabs: Groups, Play, Ratings, Alerts, More.** Browse moves into the More sheet when `PUBLIC_DISCOVERY_ENABLED` is on, instead of claiming a 6th slot. The nav stops changing shape based on an env var, which also removes the [ISSUE-53](#issue-53) surprise. |

Note: paths in the original filing were slightly off — the file is
`packages/frontend/src/components/shared/ResponsiveLayout.tsx`, and Profile's ratings/partners state
is at `:70-71`. Groups/Alerts/More are **not** in the tab array at `:171-174`; they are hardcoded
JSX at `:220-275`, so the reorder is more than editing one array.

### Fix

1. Create `packages/frontend/src/pages/Ratings.tsx` — current rating per sport/format from
   `GET /player/ratings` (show the `provisional` state explicitly, since a seeded player sits at
   `seedDefault` until 10 matches), plus the recent-partners list from `GET /player/partners`.
2. Add a star icon to the nav icon set in `components/shared/ResponsiveLayout.tsx`.
3. Restructure the bottom nav to a single 5-item array in the order Groups, Play, Ratings, Alerts,
   More — folding in the currently-hardcoded Groups/Alerts/More JSX (`:220-275`) — and move the
   conditional Browse entry into `MORE_ITEMS` (`:55-58`).
   **Preserve these testids exactly**, all four are asserted by existing specs: `nav-groups`
   (`:225`), `nav-notifications` (`:244`), `nav-more` (`:267`), and `notification-unread-badge`
   (`:253`) — plus `nav-play` and `nav-browse`, which already come from the array. The array entries
   therefore need an optional badge slot, since two of the five carry one (`MyGroupsUnreadBadge` at
   `:233`, the notification badge at `:253`) and the Alerts item also carries a dynamic
   `aria-label` (`:247`). Give the new tab `nav-ratings`.
4. Wire `/ratings` in `App.tsx` behind auth.
5. Remove the ratings/partners state, fetches, and both sections from `Profile.tsx`
   (`:70-71`, `:98-104`, `:426-491`).

Per §9, update `docs/assistant-help.md` in the same change.

### Tests first (TDD — §4, §11)

- `Ratings.spec.tsx` — renders a rating per sport/format, marks provisional ratings, renders the
  partner list, and shows empty states for both.
- `ResponsiveLayout` spec — exactly 5 tabs in the decided order; Browse never appears as a tab and
  **does** appear in the More sheet when discovery is enabled.
- `Profile.spec.tsx` — the ratings and partners sections are gone.
- E2E: the Browse-tab assertions in the specs touched by [ISSUE-53](#issue-53) need updating in the
  same change, plus `auth.spec.ts` if any nav-based route assertions move (§9).

### Verify

1. Bottom nav reads Groups, Play, Ratings, Alerts, More.
2. Flip `PUBLIC_DISCOVERY_ENABLED` on → still 5 tabs, Browse now in the More sheet.
3. Ratings tab loads current ratings and partners; a never-played account shows the seeded
   provisional rating rather than an empty page.
4. Profile no longer shows ratings or partners.

### Status — 2026-08-03 (step 3 of the sequence)

**✅ Resolved.**

- Branch: `fix/issue-59-ratings-page-nav-restructure` (off `main`, merged back after this step).
- Red: `test(nav): [RED] Ratings page + bottom nav fixed at 5 tabs (ISSUE-59)` (`4eee310`) — new
  `Ratings.spec.tsx` (ported from Profile's rating/partner cases); new `ResponsiveLayout.spec.tsx`
  cases for the 5-tab count/order + `nav-ratings`; new `ResponsiveLayout.guestNav.spec.tsx` cases
  for "authenticated, flag on → no Browse tab, Browse in the More sheet"; `Profile.spec.tsx`
  updated to assert the sections are gone.
- Green: `feat(nav): [GREEN] Ratings page + bottom nav fixed at 5 tabs (ISSUE-59)` (`63ffb5c`) — new
  `pages/Ratings.tsx` + `/ratings` route (`ProtectedRoute`); new `StarIcon`; `ResponsiveLayout.tsx`'s
  `BottomNav` authenticated path rebuilt as one 5-item array (`authItems`, optional `renderBadge`/
  `ariaLabel` per entry) replacing the old conditional-tab + hardcoded-JSX mix; `MORE_ITEMS` gained
  a `discoveryOnly` flag (mirrors `organizerOnly`) so Browse renders inside the More sheet instead
  of a 6th tab. `Profile.tsx`'s ratings/partners state, fetches, and sections removed.
- **Guest nav scope decision (not explicit in the original fix text, applied here):** guests have no
  More sheet today (`nav-more` is `isAuthenticated`-gated), so relocating Browse into `MORE_ITEMS`
  would make it unreachable for a guest with discovery on. Read "bottom nav must fix at 5 tabs" as
  scoped to the *authenticated* nav (the one actually being fixed at 5) and left the guest path
  (Browse-as-a-tab alongside sign-in) untouched. Flag if this reading is wrong.
- Also updated (needed for the route move, not itself in the issue's fix list):
  `e2e/ratings.spec.ts` (`/profile` → `/ratings`, testids unchanged), `e2e/layout.spec.ts`'s stale
  "ISSUE-29 will land on four" comment (now fixed at five, not shrinking further).
- docs/assistant-help.md: new "Ratings" section + nav-order bullet, per §9.
- Verified: 44/45 new/changed jest cases green (the 1 failure is the pre-existing, already-flagged
  `wip(profile)` quiet-hours bug — unrelated); wide `--findRelatedTests` on the 10 touched files:
  224/227 green, the 3 failures are that same pre-existing bug plus the pre-existing, already-flagged
  `wip(chat)` `GroupChatPanel` message-label regression — neither caused by this change.
- e2e: `ratings` spec — 9/13 passed; **4 failed on `POST /tournaments/:id/register` → 404**, which is
  already-tracked **ISSUE-53** (`PUBLIC_DISCOVERY_ENABLED=false` on the currently-running dev API),
  not a regression from the route move (registration is unrelated to nav/routing). `layout` spec:
  3/3 passed (geometry guard, count-agnostic by design).
- Nothing left open for this issue.

---

## ISSUE-60 — Self-rating seed prompt was never built 🟠 {#issue-60}

*Filed 2026-08-03 as "Signup flow never asks for initial self-rating"; re-scoped the same day after
verification found the premise wrong and the backend already built. Original text preserved below.*

### Symptom

`PUT /player/ratings/seed` is implemented, tested, and **unreachable** — no frontend code calls it
(zero hits across `packages/frontend/src` and `packages/frontend/e2e`). A player therefore has no way
to tell the system how good they are, and everyone stays at the default seed until matches accumulate.

### Root cause

The endpoint exists at `packages/api/src/routes/player.ts:197` with its design recorded in the
docblock (P13 Phase 5 / R21): it takes **one self-rating per sport**, seeds **both** formats from it,
is **skippable by design**, and returns `409 RATING_ALREADY_SCORED` once either format has a scored
match, because seeding is only legal before the first score. R21 fires it **at tournament
registration**. That registration-time prompt was never implemented on the frontend.

### Corrections to the original filing

- **New players are not unrated.** `SEED_DEFAULT = 270`, with `PROVISIONAL_MATCHES = 10` and
  `K_PROVISIONAL = 24` (`services/ratings-constants.ts`) — unseeded players converge quickly by
  design, so "matchmaking cannot pair them fairly" overstates the harm.
- **`POST /api/auth/me/ratings` does not exist.** The endpoint is `PUT /player/ratings/seed`.
- **Per-format prompting contradicts the design.** One value seeds singles *and* doubles.
- **Signup is the wrong trigger point.** The endpoint requires a `sport`, and signup has no sport
  context. `tournaments.sport` is `NOT NULL` (`001_create_tournaments.sql:4`), so registration knows
  it; signup would have to ask "which sports do you play?" and seed sports the player may never enter.

### Owner decisions (grill, 2026-08-03)

- **Honour the endpoint's existing contract** — one value per sport, seeding both formats, skippable.
- Signup-time collection is **not** pursued.
- **Prompt on poll launch, not at registration.** R21 says "at tournament registration", but that
  step does not exist in the flow that is actually used: casual tournaments enrol the poll's "In"
  voters directly (`player-groups.ts:938-944`), and the `POST /register` call lives in
  `TournamentBrowse.tsx` — the public-discovery path, disabled by default ([ISSUE-29](COMPLETED_UAT_ISSUES.md#issue-29),
  [ISSUE-53](#issue-53)) and outside the casual-only scope. Poll launch is the real enrolment moment,
  and the sport is known there from the tournament being created. **This supersedes R21's stated
  trigger point; the endpoint contract is unchanged.**

### Fix

1. When a poll launch creates a casual tournament, any "In" voter with no existing rating for that
   tournament's sport is prompted — skippable — with "How would you rate yourself at {sport}?",
   before their first match is playable.
2. Present the scale from `min` / `max` / `seedDefault` as returned by `GET /player/ratings`, rather
   than hardcoding numbers in the UI.
3. Submit `PUT /player/ratings/seed` with `{ sport, rating }`. On `409 RATING_ALREADY_SCORED`,
   suppress the prompt silently — the player has already played this sport, which is a normal state,
   not an error.
4. Skipping leaves the player at `SEED_DEFAULT`; **never block the launch or the tournament on it**.
   The launch already succeeded server-side by the time this shows.
5. The prompt component should be reusable — [ISSUE-59](#issue-59)'s Ratings page is the natural
   second home for it if a self-serve entry point is wanted later (see follow-ups).

Per §9, update `docs/assistant-help.md` in the same change.

### Tests first (TDD — §4, §11)

- Component spec — the prompt renders for a player with no rating in that sport, submits
  `{ sport, rating }`, is skippable, and is suppressed on a 409.
- API integration — already covered for the endpoint itself; add the case that a player seeded via
  this path reads back at that rating from `GET /player/ratings` with `provisional: true`.
- E2E: launch a casual tournament from a poll with an unrated "In" voter → prompt appears; skip →
  player sits at `seedDefault`; relaunch in the same sport after a scored match → no prompt.
  Add the row to the selection map (§8).

### As originally filed

The original text asked for a per-sport *and* per-format rating screen during signup, submitted to
`POST /api/auth/me/ratings`, on the premise that new players have no rating at all. All four
specifics were wrong; see *Corrections* above. The underlying observation — that no self-rating is
ever collected — was correct and is what this issue now tracks.

---

## ISSUE-61 — Group-chat SSE route ignores `sseMaxConnectionsPerUser` 🟠 {#issue-61}

*Found 2026-08-03 while grilling [ISSUE-56](#issue-56). Companion to [ISSUE-52](#issue-52) — same
hole, different route.*

### Symptom

A single user can hold unbounded concurrent group-chat SSE streams. The configured limit
(`sseMaxConnectionsPerUser`, default 5 — `config.ts:526`) is never consulted.

### Root cause

Only the tournament events route enforces the cap (`tournaments.ts:2765`). The group-chat stream
(`player-groups.ts:588`) sets the SSE headers and subscribes to the broadcast bus with no connection
accounting at all. [ISSUE-52](#issue-52) records the identical defect on the coach route
(`coach.ts:250`), so **two of the three SSE routes are unguarded**.

This matters more than it did: the broadcast bus is single-instance, so every held stream pins a
subscriber to one process, and [ISSUE-62](#issue-62) proposes adding a fourth always-on stream.

### Fix

Extract the counting logic used at `tournaments.ts:2765` into a shared helper and apply it to both
unguarded routes — this issue covers the group-chat route, [ISSUE-52](#issue-52) the coach route.
They should land together, since a limit enforced on one route and not the others buys nothing.

### Tests first (TDD — §4, §11)

- API integration — opening `sseMaxConnectionsPerUser + 1` group-chat streams as one player rejects
  the last with the same status the tournament route uses; closing one frees a slot.

### Verify

Open more than the configured number of group chats as one user across tabs; the surplus connection
is refused rather than accepted.

### Status — 2026-08-03

**✅ Resolved, landed with [ISSUE-52](#issue-52) as planned (one shared cap, both routes).**

- Branch: `fix/issue-61-52-sse-connection-cap` (off `main`).
- Red: `test(sse): [RED] cap concurrent group-chat + coach streams per user` (`fee052b`) — new
  `packages/api/src/__tests__/integration/group-events-sse-cap.spec.ts` +
  `coach-events-sse-cap.spec.ts`. Raw `http.get` against a real `app.listen(0)` server (supertest
  hangs on a successful SSE response, per the existing `tournament-events-auth.spec.ts` precedent
  — it never calls `res.end()`).
- Green: `feat(sse): [GREEN] cap concurrent group-chat + coach streams per user` (`59671cb`) — new
  `packages/api/src/sse-connection-limiter.ts` (`createSseConnectionLimiter`, extracted from
  `tournaments.ts:2764-2771`'s inline Map), wired into `player-groups.ts`'s `/:groupId/events`
  (keyed on `session.playerId`) and `coach.ts`'s `/events` (keyed on the resolved account
  `playerId`). Per-process only, matching the tournament route's existing behavior — no
  distributed counter, as the issue explicitly scoped out.
- Verified: both new specs green; `tournament-events-auth.spec.ts`, `tournament-events-flush.spec.ts`,
  `coach-routes.spec.ts`, `group-invite.spec.ts` regression-checked, unaffected;
  `--findRelatedTests` on the 5 touched files green.
- Nothing left open. `coach.ts`'s route did already have `flushHeaders()` — the older
  "bundle the flushHeaders() gap" note elsewhere in this doc predates this issue's actual text and
  doesn't apply; not touched.

---

## ISSUE-62 — Badges never update live 🟡 {#issue-62}

*Filed 2026-08-03 from the [ISSUE-56](#issue-56) grill. **Blocked on [ISSUE-52](#issue-52) +
[ISSUE-61](#issue-61)** — do not start before the SSE connection cap is enforced everywhere.*

### Symptom

The Alerts and Groups badges only refresh on mount and on window refocus. A user sitting on any page
sees no badge change when a message, invite, or poll arrives — the count appears only after they
navigate or leave and return to the tab.

### Root cause

Deliberate, and documented: `useNotificationUnread.ts` and `useGroupUnread.ts` both fetch on mount +
`focus` and explicitly avoid a persistent app-wide SSE connection, because that broke Playwright's
`networkidle` wait on every authenticated route (see the docblocks in both hooks and
`group-unread-state.ts:12-16`).

The push side is nearly built: the broadcast bus is keyed by `conversationId`, personal notifications
already live in a conversation that has one, and `postPersonalNotification`
(`group-message-repository.ts:365-415`) already returns `conversationId` *specifically so the event
can be broadcast* — no caller ever broadcasts it.

### Owner decision (grill, 2026-08-03)

Do it, **after** the connection cap is enforced on all three SSE routes. Adding a fourth always-on
stream to a system whose limit is unenforced on two of three routes fails as resource exhaustion
rather than a clean rejection.

### Fix

1. Broadcast on personal-notification write, using the `conversationId`
   `postPersonalNotification` already returns.
2. Add a per-player notification stream and subscribe the app-wide badge hooks to it; push group
   unread changes the same way.
3. **Rewrite the 38 `networkidle` waits across 10 e2e spec files** to explicit locator assertions.
   `networkidle` is discouraged by Playwright itself and will never fire with a persistent stream
   open — this is the bulk of the work and the main flake risk.

### Verify

With two browsers side by side, a message/invite sent in one increments the other's badge without
navigation or refocus; the full e2e suite passes on both browser projects (§8).

---

## ISSUE-63 — Opening Alerts marks un-actioned invites read 🟠 {#issue-63}

*Found 2026-08-03 while grilling [ISSUE-56](#issue-56); created by the [ISSUE-55](#issue-55) work
that put invites into the notifications feed.*

### Symptom

Opening `/notifications` clears the badge for **everything**, including a group invite the user
scrolled past but did not accept. The invite stays actionable for its 7-day TTL, but nothing ever
nudges the user about it again.

### Root cause

`Notifications.tsx:31` fires `POST /player/notifications/read` immediately on load, fire-and-forget,
and the handler (`player.ts:302-320`) stamps `read_at` on every unread recipient row in the player's
personal conversation. There is no notion of an item that is *seen* but still *owed a response*.

### Owner decision (grill, 2026-08-03)

**Actionable notifications stay unread until they are actioned.** The badge should mean "you still
owe someone a response" — that is what makes it worth looking at.

### Fix

1. Mark a notification actionable — the cleanest signal is its metadata already carrying an
   unresolved action (`groupInviteToken` today; partner confirms are the obvious next case).
2. Exclude those rows from the mark-all-read `UPDATE`, so the badge survives a visit to Alerts.
3. Clear the individual row when the action completes — on successful invite accept, alongside the
   existing `onAccepted()` refresh.

### Tests first (TDD — §4, §11)

- API integration — mark-all-read clears ordinary notifications and leaves one carrying a pending
  invite; accepting the invite then clears it.
- `Notifications.spec.tsx` — the badge does not drop to zero when the feed contains a pending invite.

### Verify

1. Receive an invite plus an ordinary notification.
2. Open Alerts, do not accept, navigate away → badge shows 1, not 0.
3. Accept the invite → badge clears.

---

## ISSUE-64 — Profile lies to guest (magic-link) sessions 🟠 {#issue-64}

*Found 2026-08-03 while grilling [ISSUE-58](#issue-58).*

### Symptom

A player holding a magic-link session (not a registered account) can open `/profile` and see a fully
rendered settings page — theme, timezone, notification toggles, quiet hours, coach memory — showing
values that are not theirs. Every change appears to save and is silently discarded.

### Root cause

`/api/auth/me`, `/api/auth/me/settings`, and `/api/auth/me/availability` are all gated by
`requireOrganizerAuth`, i.e. an account JWT. A guest player session gets 401 from all three.

`Profile.tsx` never checks the response:

- `:77-79` calls `.then(res => res.json())` with no `res.ok` guard, so the 401 body lands in
  `setSettings(...)` as `undefined` — while its three sibling fetches in the same effect *do* guard.
- Every field then renders through `settings?.x ?? <default>` (`:222-383`), so the page looks
  populated and correct.
- The save at `:111` is an unchecked `await fetch(...)` — the 401 is discarded silently.

### Owner decision (grill, 2026-08-03)

Profile stays **account-only**. Guests get an honest state, not fake defaults — the Account section
from [ISSUE-58](#issue-58) is inherently account-scoped (email, password, account identity), so
extending the `/me` endpoints to accept player sessions would not make it meaningful anyway.

### Fix

1. Add `res.ok` checks to the `/api/auth/me` GET and the settings PATCH, matching the sibling
   fetches' existing pattern.
2. On 401, render a "Sign up to save your preferences" state with a link to signup, instead of the
   settings form.
3. Surface a visible error if a save fails for any other reason.

### Tests first (TDD — §4, §11)

- `Profile.spec.tsx` — with a 401 from `/api/auth/me`, the settings form is absent and the signup
  prompt renders; a failing PATCH surfaces an error rather than appearing to succeed.

### Verify

1. Sign in via a magic link (guest session), open `/profile`.
2. No settings form; a signup prompt instead.
3. As a registered account, Profile behaves exactly as before.
