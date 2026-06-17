# Phase 5 — Slice 2 (Frontend) Remaining Tasks

**Goal:** Build the doubles **partner-request UI** on top of the completed Slice 1 backend so a player
can, in the browser: find a solo partner within a tournament, send a request, and confirm an incoming
request — forming a team. **TDD-first is mandatory** (CLAUDE.md §4, §11): write the unit + e2e tests
*and* update the scenario docs **before** implementing; confirm they fail for the right reason; commit
the red tests separately; then implement to green. Branch off `main`; run the suites before merging.

---

## Context — the model (already decided)
Doubles partner is **optional**. Players register solo; a solo registrant finds another *solo*
registrant *within the same tournament* and sends a partnership request the other confirms. At group
creation, confirmed partnerships are honored first; leftovers are auto-paired (default) or dropped
(organizer opt-out). Full background: `assets/planning/phase5-partner-requests.md`. Scenarios:
`e2e-scenarios.md` → "Feature: Partner Requests & Confirmation (Doubles)".

## Context — Slice 1 backend (DONE, on `main`) — build against these
All under `/tournaments`; auth accepts **magic-link player session OR registered account JWT**
(`resolveTournamentPlayer`); the caller must be a registered participant of the tournament.

| Method & path | Body | Returns |
|---|---|---|
| `GET /tournaments/:id/available-partners` | — | `{ players: [{ id, name }] }` (solo/unpaired, excludes caller) |
| `GET /tournaments/:id/partner-requests` | — | `{ requests: [{ registrationId, requesterId, requesterName }] }` (incoming for caller) |
| `POST /tournaments/:id/partner-requests` | `{ targetPlayerId }` | `201 { registrationId, targetPlayerId, status: 'pending_partner_confirm' }` |
| `PATCH /tournaments/registrations/:registrationId/confirm` | — | `200 { registrationId, playerId, partnerId, partnerConfirmed, status, confirmedAt }` |

Error codes to surface: `400 VALIDATION_ERROR` (self/missing target, non-doubles), `404 NOT_FOUND`
(target/registration not found / not registered), `409 INVALID_STATE` (registration closed, already
paired, not pending), `403 FORBIDDEN` (only the partner can confirm).

## Context — existing frontend assets & gaps
- **Components exist but target the OLD register-time model — adapt or replace:**
  `src/components/PartnerSelection.tsx`, `PartnerDropdown.tsx`, `PartnerInviteInput.tsx`.
- **No confirm route/page:** `App.tsx` has no `/registrations/:registrationId/confirm` route and
  `src/constants/routes.ts` has no constant for it — both must be added.
- **API client:** `src/api/client.ts` uses `apiFetch` (throws `ApiError { code, message, status }`).
  No partner functions yet.
- **Auth/token:** single `auth_token` in `localStorage`; `useAuth` restores account (`/api/auth/me`)
  or magic-link session (`/player/session`). Pass the stored token to the new client calls (mirror
  `ScoreSubmitForm`, which reads `localStorage.getItem('auth_token')`).
- **Vite proxy** already covers `/tournaments`, `/player`, `/api` (`vite.config.ts`).
- **Where the partner-finder lives:** the doubles player's tournament context (e.g. a section/affordance
  on `TournamentDetail`, shown only when the tournament is doubles **and** the caller is currently solo).

---

## TDD workflow (REQUIRED — do not skip)
1. **Scenario docs first:** the Gherkin scenarios already exist in `e2e-scenarios.md`; keep them in sync
   if anything changes.
2. **Write tests first (red):** the unit tests *and* the e2e spec below — run them, confirm they fail
   for the right reason (component/route/client absent), then **commit the red tests as their own commit**.
3. **Implement to green:** client fns → components → routes/wiring. Commit green separately.
4. **Verify** (success criteria below), then branch-merge per §11.

### Unit tests to write first (red)
Create alongside the components (`src/components/__tests__/…`, `src/pages/__tests__/…`); mock
`../api/client` and `../hooks/useAuth`; set `localStorage` `auth_token`.
- **PartnerFinder** (new component): renders the list from `fetchAvailablePartners`; clicking "Request"
  on a row calls `sendPartnerRequest(tournamentId, targetId, token)`; on success shows a
  "request pending" / sent state; surfaces an error message on `409 INVALID_STATE` (already paired).
  Empty state when no available partners.
- **PartnerRequestConfirm page** (new): loads incoming requests via `fetchIncomingPartnerRequests` (or
  reads the registrationId from the route); "Confirm Partnership" calls
  `confirmPartner(registrationId, token)` → success state; `403/409` show a friendly message.
- **API client** unit tests (mirror `src/__tests__/api-client.spec.ts`): each new client fn calls the
  correct path/method with the bearer token and returns the parsed body.

### E2E scenarios to write first (red)
New spec `packages/frontend/e2e/partner-requests.spec.ts` (chromium + firefox). Seed via fixtures —
add a `createDoublesTournamentWithSoloRegistrants(organizerToken, count)` helper returning the
tournamentId plus **player session tokens for two solo registrants** (reuse the register→verify flow
from `createDoublesTournamentInGroupStage`, but stop at registration_open with N solo players).
- **Available partners:** authenticated solo player A opens the partner finder → sees solo player B,
  not themselves.
- **Request + confirm → team:** A sends a request to B → B (second context/token) opens
  `/registrations/:registrationId/confirm` → confirms → success; assert the team is reflected (e.g. A's
  finder now shows "paired"/no longer solo, or the confirm page shows confirmed).
- (Optional) **Self/duplicate guard:** requesting an already-paired player shows an error.

---

## Build tasks (green)
1. **API client** (`src/api/client.ts`): `fetchAvailablePartners`, `fetchIncomingPartnerRequests`,
   `sendPartnerRequest`, `confirmPartner` (PATCH `/tournaments/registrations/:id/confirm`) — all taking
   the token; map `ApiError.code` → friendly messages (reuse the `ScoreSubmitForm` mapping pattern).
2. **PartnerFinder component** — list available partners + Request; shown in the doubles player's
   tournament view only when the caller is solo. Add `data-testid`s (`partner-finder`, `partner-row`,
   `request-partner-button`, `partner-error`).
3. **Confirm page + route** — new `src/pages/PartnerRequestConfirm.tsx`; add
   `ROUTES.REGISTRATION_CONFIRM = '/registrations/:registrationId/confirm'` and a `ProtectedRoute` in
   `App.tsx`. Testids: `confirm-partnership-button`, `confirm-success`, `confirm-error`.
4. **(Optional) organizer `pairUnpaired` toggle** on the create-groups action.
5. **Fixtures + e2e** as above. Inject `auth_token` like the other player specs.

---

## Success criteria (specific, must all hold)
- [ ] Red committed first: the unit + e2e tests exist and were observed failing for the right reason,
      in a separate commit before implementation.
- [ ] A solo player sees only *other* solo registrants in the finder (never themselves; never
      already-paired players).
- [ ] Sending a request returns success in the UI; the target sees the incoming request and can
      confirm at `/registrations/:registrationId/confirm`.
- [ ] After confirm, both players are a team (the requester is no longer "solo" in the finder; the
      confirm page shows a confirmed/success state).
- [ ] Error cases surface friendly messages (already-paired → 409; only-partner-can-confirm → 403).
- [ ] **e2e `partner-requests.spec.ts` passes on chromium + firefox.**
- [ ] Component + client unit tests pass.
- [ ] No regressions: `npm test` (frontend + api) green; **full `npx playwright test` green**;
      `tsc --noEmit` (frontend) exits 0.
- [ ] No new pollution: integration row counts unchanged (transactional harness).
- [ ] `e2e-scenarios.md` coverage table updated with the new spec; Phase 5 status flipped to COMPLETE.

## Verification commands
- Frontend unit: `npm test --workspace=packages/frontend`
- API: `npm test --workspace=packages/api`
- Single e2e spec: `npx playwright test partner-requests`  ; full: `npx playwright test`
- Typecheck: `cd packages/frontend && npx tsc --noEmit`

## Notes / gotchas
- The API dev server (`tsx --watch`) has been unstable across long sessions — if e2e hits
  `ECONNREFUSED :3001`, restart it (`npm run dev --workspace=packages/api`) and re-run.
- The confirm endpoint path includes the `/tournaments` prefix: `/tournaments/registrations/:id/confirm`.
- Deferred (out of scope unless requested): partner **invitation email** (no email-send infra) and
  timeout/auto-dissolution (unneeded — unconfirmed solo players are auto-paired or dropped at group
  creation).
