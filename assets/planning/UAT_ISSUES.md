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

**No open issues.** Number the next one 39.

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
