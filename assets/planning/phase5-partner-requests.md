# Phase 5 — Doubles Partner Requests (handoff)

**Model:** doubles partner is **optional**. Players register solo; a solo registrant finds another
*solo* registrant *within the same tournament* and sends a partnership request the other confirms.
At group creation, confirmed partnerships are honored first; leftover solo registrants are auto-paired
(default) or dropped (organizer opt-out). This replaced the original "select/invite at registration +
mandatory partner + invitation email" scenarios (they contradicted the implemented auto-team model and
its passing tests).

## ✅ Slice 1 — Backend (DONE, merged)
Endpoints (under `/tournaments`, in `routes/tournaments.ts`), participant-auth via `resolveTournamentPlayer`:
- `GET /:id/available-partners` → `{ players: [{id,name}] }` — solo unpaired registrants, excludes caller.
- `GET /:id/partner-requests` → `{ requests: [{registrationId, requesterId, requesterName}] }` — incoming for caller.
- `POST /:id/partner-requests { targetPlayerId }` → 201 — creates pending (validates doubles + registration_open + both registered + both unpaired + not self).
- Confirm reuses existing `PATCH /tournaments/registrations/:registrationId/confirm` (player session/account JWT); `confirmPartner` now links **both** registrations.
- Group creation: `createGroupsForDoubles(..., pairUnpaired=true)` honors confirmed pairs first, then auto-pairs or drops leftovers (`POST /:id/groups { pairUnpaired }`). New `unpaired` status (migration 028).
- Tests: `packages/api/src/__tests__/integration/partner-requests.spec.ts`; doubles formation in `group-stage-doubles.spec.ts`.

## ✅ Slice 2 — Frontend + e2e (DONE, merged)
Built TDD-first: API client partner fns; `PartnerFinder` (Details tab, doubles + registration_open);
`PartnerRequestConfirm` page at `/registrations/:registrationId/confirm`. Unit:
`api-client-partners.spec.ts`, `PartnerFinder.spec.tsx`, `PartnerRequestConfirm.spec.tsx`. E2E:
`partner-requests.spec.ts` (6/6, chromium+firefox) + `createDoublesTournamentWithSoloRegistrants` fixture.
Organizer `pairUnpaired` toggle deliberately not surfaced — no frontend create-groups UI exists (groups
are created via the API, which already supports the flag).

> **Original task list + success criteria:** `phase5-remaining-tasks.md` (repo root). The summary
> below is the original plan, now implemented.
Existing but **unwired** components: `PartnerSelection.tsx`, `PartnerDropdown.tsx`, `PartnerInviteInput.tsx`
(they target the old register-time model — adapt or replace for the request model).

Build (TDD-first):
1. **API client** (`api/client.ts`): `fetchAvailablePartners(tid, token)`, `fetchIncomingPartnerRequests(tid, token)`,
   `sendPartnerRequest(tid, targetPlayerId, token)`, `confirmPartner(registrationId, token)` (PATCH `/tournaments/registrations/:id/confirm`).
2. **Partner-finder UI** in the doubles player's tournament context (only when doubles + caller is solo):
   list available partners + "Request"; show "request pending" once sent.
3. **Incoming request affordance** + **confirm page/route** `/registrations/:registrationId/confirm`
   (App.tsx has no such route yet; `ROUTES` has no constant) → "Confirm Partnership" → calls confirm → success.
4. **Organizer** (optional): a `pairUnpaired` toggle on the create-groups action.
5. **e2e** (`partner-requests.spec.ts` under `e2e/`): solo A requests solo B → B confirms → team formed;
   available-partners excludes self; (optional) organizer drop-unpaired.

**Auth for the UI:** player session (magic-link) or account JWT both work — `resolveTournamentPlayer`
already accepts either. Inject `auth_token` in e2e like the other player specs.

**Verify:** `npm test` (frontend+api), full e2e (`npx playwright test`), no pollution.

## Deferred (out of scope unless requested)
- Invitation **email** to a not-yet-registered partner (no email-send infra; only magic-link tokens).
- Timeout/auto-dissolution of unconfirmed requests (not needed — unconfirmed solo players are simply
  auto-paired or dropped at group creation).
