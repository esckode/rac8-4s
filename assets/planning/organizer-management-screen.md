# Organizer Tournament Management Screen — TDD-first scope

**Goal:** Give a tournament's organizer a single screen to drive the tournament lifecycle:
**close registration → create groups (with the `pairUnpaired` toggle) → advance through the
remaining stages.** Today every one of these is an API-only action with no UI (see "Why" below).
**TDD-first is mandatory** (CLAUDE.md §4, §11): write/update scenario docs + unit + e2e tests, confirm
they fail for the right reason, commit the red tests separately, then implement to green. Branch off
`main`; run the suites before merging.

## Why this is needed
The organizer lifecycle layer exists only on the API. A frontend search confirms:
- No screen triggers a state transition — only status **labels** reference the states.
- `OrganizerDashboard.tsx` is a stub: tournament list is mocked (`// TODO: Replace with actual API
  call`) and its buttons navigate to `/tournament/:id/edit` and `/tournaments/create` — **routes not
  registered in `App.tsx`**.
- `api/client.ts` has `fetchOrganizerTournaments` but **no** `advanceTournament` / `createGroups`.

This is also the missing home for the Phase 5 `pairUnpaired` toggle (deferred in
`assets/planning/phase5-partner-requests.md` for exactly this reason).

---

## Backend contracts to build against (already implemented, on `main`)
All organizer-only: `requireOrganizerAuth` + `assertOrganizerOwnsTournament` (must be the **creator**).

### 1. Advance lifecycle — `POST /tournaments/:id/advance`
- Body: `{ action: TransitionAction, forceAdvance?: boolean }`
- `200 { status, previousStatus, message }`
- Errors: `400 VALIDATION_ERROR` (missing/!string action), `404 NOT_FOUND`, `403` (not owner),
  `409 INVALID_TRANSITION` (action illegal from current state), `409 GUARD_FAILED` (guard unmet).

`TransitionAction` and the legal transitions (`packages/core-logic/src/state-machine.ts`):

| From status | Action | To status | Guard (bypassed by `forceAdvance`) |
|---|---|---|---|
| `draft` | `OPEN_REGISTRATION` | `registration_open` | — |
| `registration_open` | `CLOSE_REGISTRATION` | `registration_closed` | — |
| `registration_closed` | `START_GROUP_STAGE` | `group_stage_active` | `playersRegistered` |
| `group_stage_active` | `COMPLETE_GROUP_STAGE` | `group_stage_complete` | `allScoresSubmitted` |
| `group_stage_complete` | `START_KNOCKOUT` | `knockout_active` | `standingsCalculated` && `bracketGenerated` |
| `knockout_active` | `COMPLETE_TOURNAMENT` | `tournament_complete` | `allKnockoutScoresSubmitted` |

### 2. Create groups — `POST /tournaments/:id/groups`
- **Requires `status === 'registration_closed'`** (else `409 INVALID_STATE`).
- Body: `{ numGroups: int>=1, advancingPerGroup: int>=1, pairUnpaired?: boolean }` (`pairUnpaired`
  defaults to `true`; `false` drops unpaired solo registrants — doubles only).
- Doubles guard: needs `playerIds.length >= numGroups * 4` else `400 VALIDATION_ERROR`.
- `201 { groups: [{ id, name, playerCount, advancingCount }] }`.
- **Side effect:** sets status to `group_stage_active`. So **group creation _is_ the
  `registration_closed → group_stage_active` transition** — the UI uses this form here, *not* the
  `START_GROUP_STAGE` advance action.

### 3. Supporting reads
- `GET /tournaments/organizer` → `fetchOrganizerTournaments(token, pagination)` (exists).
- `GET /tournaments/:id` → status, `createdBy` (creator_id), `match_format`; surfaced by the
  `useTournament` hook as `tournament.status`, `tournament.creatorId`, `tournament.matchFormat`.

### 4. Bracket (dependency of `START_KNOCKOUT`) — DECIDED: include (option a)
`START_KNOCKOUT` is guarded by `bracketGenerated`, a separate flow:
`POST /:id/bracket/generate` → `POST /:id/bracket/publish` (+ `PATCH /:id/bracket` for seeding, *not*
in scope). **Decision:** include a single **"Generate bracket"** action on the `group_stage_complete`
step (generate + publish) so the organizer can reach knockout; then "Start knockout" (advance) succeeds.
This is the only extra endpoint set beyond advance + groups.

---

## State → organizer action mapping (the screen's core logic)
Drive the visible action(s) off `tournament.status`:

| Status | Primary action shown |
|---|---|
| `draft` | **Open registration** (`advance OPEN_REGISTRATION`) |
| `registration_open` | **Close registration** (`advance CLOSE_REGISTRATION`) |
| `registration_closed` | **Create groups** form: `numGroups`, `advancingPerGroup`, and (doubles only) a `pairUnpaired` toggle → `POST /groups` |
| `group_stage_active` | **Complete group stage** (`advance COMPLETE_GROUP_STAGE`; offer `forceAdvance` if `GUARD_FAILED`) |
| `group_stage_complete` | **Generate bracket** then **Start knockout** (per decision above) |
| `knockout_active` | **Complete tournament** (`advance COMPLETE_TOURNAMENT`) |
| `tournament_complete` | Read-only "Tournament complete" |

`GUARD_FAILED` responses should surface the reason and offer an explicit **Force advance** confirm
(maps to `forceAdvance: true`), never auto-forcing.

---

## Existing frontend assets & gaps
- **Permissions:** `usePermissions(tournamentId).canManageGroups` is already `isCreator` (organizer
  role AND `user.id === tournament.creatorId`) — gate the whole screen on it; non-owners get a
  not-authorized state.
- **Auth:** organizer **account JWT** (not magic-link); `auth_token` in localStorage, mirror the
  `ScoreSubmitForm` token-read pattern.
- **Client:** add `advanceTournament` and `createGroups`; reuse `apiFetch` (`ApiError { code, message,
  status }`). `fetchOrganizerTournaments` already exists.
- **Routing:** add `ROUTES.ORGANIZER_MANAGE = '/tournament/:tournamentId/manage'` + a `ProtectedRoute`
  in `App.tsx`. (Decide whether to also wire `OrganizerDashboard`'s dead buttons to it — optional.)

---

## TDD workflow (REQUIRED — do not skip)
1. **Scenario docs first:** add an "Organizer Tournament Management" feature to `e2e-scenarios.md`
   (close registration; create groups + `pairUnpaired`; advance group stage; complete tournament;
   non-owner blocked; guard-failed + force).
2. **Write tests first (red):** the unit + e2e below; confirm they fail for the right reason
   (component/route/client absent); **commit the red tests as their own commit**.
3. **Implement to green:** client fns → component(s) → route/wiring. Commit green separately.
4. **Verify** (success criteria), then branch-merge per §11.

### Unit tests to write first (red)
Mock `../api/client` and the hooks; set `auth_token`.
- **OrganizerManage page** (new, `src/pages/__tests__/`): renders the right action per `status`
  (parametrize the table above); **close-registration** click calls `advanceTournament(id,
  'CLOSE_REGISTRATION', token)` → success/refetch; **non-owner** (`canManageGroups=false`) shows a
  not-authorized state and no action buttons; a `409 GUARD_FAILED` surfaces the message + a Force
  affordance that re-calls with `forceAdvance: true`.
- **CreateGroupsForm** (new component): inputs for `numGroups`/`advancingPerGroup`; `pairUnpaired`
  toggle rendered **only for doubles**; submit calls `createGroups(id, { numGroups, advancingPerGroup,
  pairUnpaired }, token)`; `409 INVALID_STATE` / `400 VALIDATION_ERROR` show friendly errors.
- **API client** (`src/__tests__/`): `advanceTournament` and `createGroups` hit the right path/method
  with the bearer token and return the parsed body; preserve `ApiError.code` on failure.

### E2E scenarios to write first (red)
New `packages/frontend/e2e/organizer-management.spec.ts` (chromium + firefox). Reuse fixtures:
`getOrganizerToken`, `createTournamentWithOpenRegistration`, `createTournamentWithClosedRegistration`,
and `createDoublesTournamentWithSoloRegistrants` (registration_open) for the `pairUnpaired` path.
Inject the **organizer** `auth_token`.
- **Close registration:** open tournament → organizer clicks Close → status flips to
  registration_closed (assert via UI state and/or `apiCall` GET).
- **Create groups (doubles) with `pairUnpaired`:** from registration_closed → fill the form, toggle
  `pairUnpaired`, submit → groups created and status → group_stage_active.
- **Advance group stage → complete** (use `forceAdvance` if needed).
- **Generate bracket → start knockout:** from `group_stage_complete` → Generate bracket → Start
  knockout → status `knockout_active`.
- **Non-owner blocked:** a different organizer (or a player token) cannot see/operate the controls.
- **Manage link:** the `canManageGroups`-gated "Manage" affordance routes the owner to the screen.

---

## Build tasks (green)
1. **Client:** `advanceTournament(tournamentId, action, token, forceAdvance?)`,
   `createGroups(tournamentId, { numGroups, advancingPerGroup, pairUnpaired? }, token)`.
2. **CreateGroupsForm** component (testids: `create-groups-form`, `num-groups-input`,
   `advancing-input`, `pair-unpaired-toggle`, `create-groups-submit`, `groups-error`).
3. **OrganizerManage** page — status-driven action panel; testids per action
   (`open-registration-button`, `close-registration-button`, `complete-group-stage-button`,
   `complete-tournament-button`, `force-advance-button`, `manage-error`, `not-authorized`).
4. **Route + constant** (`ORGANIZER_MANAGE = '/tournament/:tournamentId/manage'`) in `App.tsx`
   (ProtectedRoute) and `constants/routes.ts`, plus a `canManageGroups`-gated **"Manage"** link on the
   existing tournament view (entry-point decision a).
5. **Generate-bracket action** for the `group_stage_complete` step — client `generateBracket` +
   `publishBracket` (or one combined fn); testids `generate-bracket-button`, then `start-knockout-button`.
6. **Scenario docs + e2e + fixtures.** (Do **not** revive `OrganizerDashboard` here.)

---

## Success criteria (must all hold)
- [ ] Red committed first: unit + e2e observed failing for the right reason, in a separate commit.
- [ ] Each status shows the correct organizer action; transitions update the visible status.
- [ ] Close registration works end-to-end (registration_open → registration_closed).
- [ ] Create groups works, including the **doubles `pairUnpaired` toggle**, and moves the tournament
      to group_stage_active.
- [ ] Advancing later stages works; `GUARD_FAILED` surfaces a message and an explicit Force option.
- [ ] Generate-bracket action reaches `knockout_active` (generate + publish, then Start knockout).
- [ ] The `canManageGroups`-gated "Manage" link routes the owner to the screen.
- [ ] Non-owner (different organizer / player) cannot operate the controls.
- [ ] Error codes map to friendly messages (`INVALID_TRANSITION`, `GUARD_FAILED`, `INVALID_STATE`,
      `VALIDATION_ERROR`).
- [ ] **e2e `organizer-management.spec.ts` passes on chromium + firefox.**
- [ ] No regressions: `npm test` (frontend + api) green; **full `npx playwright test` green**;
      `tsc --noEmit` (frontend) exits 0.
- [ ] No new pollution: integration row counts unchanged (transactional harness).
- [ ] `e2e-scenarios.md` updated with the new feature + coverage row.

## Verification commands
- Frontend unit: `npm test --workspace=packages/frontend`
- API: `npm test --workspace=packages/api`
- Single e2e: `npx playwright test organizer-management` ; full: `npx playwright test`
- Typecheck: `cd packages/frontend && npx tsc --noEmit`

## Decisions (resolved)
1. **Bracket scope — DECIDED: include it (option a).** Add a minimal "Generate bracket"
   action on the `group_stage_complete` step (calls `POST /:id/bracket/generate` then
   `POST /:id/bracket/publish`; no seeding/`PATCH` UI) so the screen drives the lifecycle end-to-end
   through knockout. See §4.
2. **Entry point — DECIDED: route + link (option a).** Register `/tournament/:tournamentId/manage`
   and add a `canManageGroups`-gated **"Manage"** affordance on the existing tournament view; **do not**
   revive `OrganizerDashboard` in this piece. A proper organizer home (real list via
   `fetchOrganizerTournaments` + login redirect) is a separate follow-up.
3. **`START_GROUP_STAGE` action — DECIDED: don't expose it.** Group creation (`POST /groups`) is the
   real `registration_closed → group_stage_active` transition; leave `START_GROUP_STAGE` API-only.

## Out of scope (separate follow-up): dual-role / organizer-as-participant
Not part of this screen — captured here so the management screen doesn't accidentally pre-empt it.
**Full scope:** `assets/planning/dual-role-organizer-participant.md`. Summary of the conclusions:

- **No new role.** Do **not** add an `organizer_player` role — it conflates two orthogonal axes
  (authority vs. participation) and explodes combinatorially. `auth.accounts.role` stays a single
  authority value (`admin` | `organizer` | `player`).
- **Capabilities derive from existing columns.** The schema already supports dual capability:
  `auth.accounts.role` (authority) + `auth.accounts.player_id` (participant identity, migration 027,
  indexed by `idx_accounts_player_id`). Derive in the permission layer:
  - `canOrganize    = role IN ('organizer','admin')`
  - `canParticipate = player_id IS NOT NULL`
- **JWT carries atomic claims only** — `role` + `playerId` (the payload already supports an optional
  `playerId`; have **login** populate it as signup does). Do **not** store derived boolean permissions
  (`isPlayer`/`isOrganizer`/`isPlayerAndOrganizer`) in the token — they go stale and duplicate state.
- **No `canActAsBoth` flag.** The conjunction is a single `&&`; when/if a role toggle is built, gate it
  inline (`canOrganize && canParticipate`, named for intent at the call site, e.g. `showRoleToggle`).
  Don't add a standalone flag for a single, not-yet-existing consumer (YAGNI).
- **Missing flow (for the follow-up):** organizer accounts aren't given a `player_id` today (signup
  only links players). Organizer-as-participant needs a flow that claims/links the organizer's
  `player_id` when they register — a flow addition, **not** a schema change.
- **If multiple _authority_ roles per account are ever needed** (distinct from "organizer who plays"),
  that's the case for a proper `account_roles` join table — explicitly deferred.

For **this** screen: gate organizer affordances on `usePermissions().canManageGroups` (already
`isCreator`); no role toggle.

## Notes / gotchas
- The API dev server (`tsx --watch`) has been unstable across long sessions — restart
  `npm run dev --workspace=packages/api` and re-run on `ECONNREFUSED :3001`.
- Group creation requires `registration_closed` first — the screen must sequence Close → Create.
- Organizer auth is an **account JWT**; don't reuse the magic-link player-session pattern here.
