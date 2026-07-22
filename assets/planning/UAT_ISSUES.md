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

| # | Status | Severity | Title | Area |
|---|---|---|---|---|
| [ISSUE-1](COMPLETED_UAT_ISSUES.md#issue-1) | ✅ Resolved | 🔴 | Registered-account users locked out of Groups (dual-auth gap) | api + frontend |
| [ISSUE-2](COMPLETED_UAT_ISSUES.md#issue-2) | ✅ Resolved | 🟠 | `teardown-uat.sh` silently deletes the SES sender identity | scripts |
| [ISSUE-3](COMPLETED_UAT_ISSUES.md#issue-3) | ✅ Resolved | 🟡 | `deploy-uat.sh` SES re-adopt guard uses the same fragile pattern | scripts |
| [ISSUE-4](COMPLETED_UAT_ISSUES.md#issue-4) | ✅ Resolved | 🟡 | `deploy-uat.sh` frontend build runs from the wrong cwd | scripts |
| [ISSUE-5](COMPLETED_UAT_ISSUES.md#issue-5) | ✅ Resolved | 🟠 | Fake iOS status bar (hardcoded `9:41` + fake signal/wifi/battery) shipped on the auth pages | frontend |
| [ISSUE-6](COMPLETED_UAT_ISSUES.md#issue-6) | ✅ Resolved | 🟠 | Auth "back" buttons hardcode `navigate('/')` instead of true history-back | frontend |
| [ISSUE-7](COMPLETED_UAT_ISSUES.md#issue-7) | ✅ Resolved | 🟠 | Guest bottom nav leaks auth-gated Standings/Matches tabs (dead-end → login) | frontend |
| [ISSUE-8](COMPLETED_UAT_ISSUES.md#issue-8) | ✅ Resolved | 🟠 | Bottom nav has no safe-area-inset handling; viewport lacks `viewport-fit=cover` | frontend |
| [ISSUE-9](COMPLETED_UAT_ISSUES.md#issue-9) | ✅ Resolved | 🟠 | Browse (discovery board) shows raw status enums + lists expired-`registration_open` as "Reg Open" | frontend + api |
| [ISSUE-10](COMPLETED_UAT_ISSUES.md#issue-10) | ✅ Resolved | 🟡 | Featured is positional `[0]`, not curated — make it a "Register soon" set (open + has-spots, most-registered, max 3) | frontend + api |
| [ISSUE-11](COMPLETED_UAT_ISSUES.md#issue-11) | ✅ Resolved | 🟠 | `POST /:id/register` is a public, unauthenticated, **unthrottled** email-send trigger (email-bombing / SES-reputation vector) | api · security |
| [ISSUE-12](COMPLETED_UAT_ISSUES.md#issue-12) | ✅ Resolved | 🟠 | Guest-registration UX: ambiguous app-vs-tournament framing, no auth-aware one-click, doubles partner unsurfaced, email-typo safety | frontend + api |
| [ISSUE-13](COMPLETED_UAT_ISSUES.md#issue-13) | ✅ Resolved | 🟠 | Tournament detail page (`TournamentBrowse`) — no design parity + missing description/deadline/capacity | frontend + api |
| [ISSUE-14](COMPLETED_UAT_ISSUES.md#issue-14) | ✅ Resolved | 🟠 | Emailed magic link forces account creation — wire it to the existing guest-session exchange ("continue as guest") | frontend + api |
| [ISSUE-15](#issue-15) | 🔲 Open | 🟠 | Doubles partner: three competing mechanisms, the one wired to the UI is a no-op — consolidate on an email-based invite | api + frontend |

---

## ISSUE-15 — Doubles partner: three competing mechanisms; the one wired to the UI is a no-op 🟠 {#issue-15}

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

## Not yet triaged / follow-ups

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
- **Tournament lifecycle has no automatic status transitions** (surfaced by ISSUE-9): nothing
  moves a normal tournament off `registration_open` at its `registration_deadline`, or to
  `completed` when finished — the only auto-close sweep is for polls. So tournaments linger in
  `registration_open` indefinitely and stale-open ones keep appearing in Browse (ISSUE-9 only
  fixes the *label*). Durable fix = a deadline/lifecycle sweep or organizer-driven transition;
  needs its own design + issue.
- Deliverability: UAT SES mail lands in Gmail **spam** (DMARC can't align from a
  `gmail.com` sender) — a known, owner-accepted trade-off, tracked in
  `UAT_PWA_LAUNCH.md` P0.6-SES, not a bug. The real fix is a verified domain (§2).
