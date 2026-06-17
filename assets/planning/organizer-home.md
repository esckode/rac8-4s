# Organizer Home (revive OrganizerDashboard) — TDD-first scope

**Goal:** Give organizers a real landing page that lists **their** tournaments and links each into the
management screen — replacing the current dead stub. **TDD-first** (CLAUDE.md §4, §11): scenario docs +
unit + e2e written and red-committed before implementation.

> **Sequencing:** build **after** #1 (Organizer Management screen) so there's a `/tournament/:id/manage`
> route to link rows into. `assets/planning/organizer-management-screen.md` is the dependency.

---

## Current state (verified)
- `src/pages/OrganizerDashboard.tsx` exists but is an **orphan**: not imported/routed in `App.tsx`,
  its tournament list is **mocked** (`// TODO: Replace with actual API call to fetch organizer's
  tournaments`), and its buttons navigate to `/tournament/:id/edit` and `/tournaments/create` — **routes
  that don't exist**.
- After login, **everyone lands on `/browse`** — there is no organizer-specific home or redirect.
- `api/client.ts` already has `fetchOrganizerTournaments(token, pagination)` →
  `OrganizerTournamentListResponse` (backed by `GET /tournaments/organizer`, organizer-auth).
- `usePermissions().organizerRole` / `useAuth().user.role` distinguish organizers.

## Scope decisions (proposed — confirm at build)
1. **Route:** `ROUTES.ORGANIZE = '/organize'` (protected, organizer-only). Wrap in `ResponsiveLayout`.
2. **Login redirect:** organizers land on `/organize` instead of `/browse`. (Confirm — alternative: keep
   `/browse` for all and reach `/organize` via nav. Recommended: redirect organizers.)
3. **Row action:** each tournament links to `/tournament/:id/manage` (the #1 screen).
4. **Create-tournament:** the dead "Create" button — wire to a real create flow **only if that screen
   exists**; otherwise hide it (don't link to a missing route). Tournament *creation* UI is its own
   separate piece if needed; out of scope here unless trivially present.

---

## What to build (green)
1. **Replace mock with real data:** `OrganizerDashboard` calls `fetchOrganizerTournaments(token,
   pagination)`; render loading / empty / error states (mirror `BrowseTournaments` patterns).
2. **Row → manage:** clicking a tournament navigates to `/tournament/:id/manage`; each row shows
   name, status badge, format, registered count (from the list response shape).
3. **Route + redirect:** register `/organize` (ProtectedRoute, organizer-only — redirect non-organizers
   appropriately); on login, route organizers to `/organize`.
4. **Remove dead targets:** drop or correctly wire the `/tournament/:id/edit` and `/tournaments/create`
   buttons so nothing points at unregistered routes.

## TDD workflow (REQUIRED)
1. **Scenario docs first** — add an "Organizer Home" feature to `e2e-scenarios.md`.
2. **Red tests** (below); confirm red; **commit separately.**
3. **Green**: data wiring → route/redirect → row links.
4. **Verify**; branch-merge per §11.

### Unit tests to write first (red)
Mock `../api/client` and hooks; set `auth_token`.
- **OrganizerDashboard:** renders the list from `fetchOrganizerTournaments` (not mock data); loading,
  empty ("no tournaments yet"), and error states; a row click navigates to `/tournament/:id/manage`.
- **Route protection:** `/organize` redirects an unauthenticated user to `/login`; a player role is
  handled per the redirect decision.
- **Login redirect (if implemented):** an organizer login lands on `/organize`.

### E2E scenarios to write first (red)
New `packages/frontend/e2e/organizer-home.spec.ts` (chromium + firefox), organizer `auth_token`:
- Organizer with ≥1 created tournament sees them listed on `/organize`; clicking one lands on its
  manage screen.
- (If redirect) organizer login lands on `/organize`.

## Build tasks
1. `ROUTES.ORGANIZE` + route in `App.tsx` (ProtectedRoute, `ResponsiveLayout`).
2. `OrganizerDashboard`: real `fetchOrganizerTournaments` + loading/empty/error; testids
   (`organizer-tournament-list`, `organizer-tournament-row`, `organizer-empty`).
3. Row → `/tournament/:id/manage`; remove/replace dead buttons.
4. Login redirect for organizers (if chosen).
5. Scenario docs + e2e.

## Success criteria
- [ ] Red committed first.
- [ ] `/organize` lists the organizer's real tournaments (no mock); loading/empty/error handled.
- [ ] A row links into `/tournament/:id/manage`.
- [ ] No route points at a non-existent path (dead buttons fixed/removed).
- [ ] (If chosen) organizers land on `/organize` after login.
- [ ] No regressions: `npm test` (frontend + api) + full `npx playwright test` green; `tsc --noEmit` 0.
- [ ] `e2e-scenarios.md` updated.

## Verification commands
- `npm test --workspace=packages/frontend` · `npm test --workspace=packages/api`
- `npx playwright test organizer-home` ; full: `npx playwright test`
- `cd packages/frontend && npx tsc --noEmit`

## Notes / gotchas
- Depends on the #1 manage route existing — don't build until `/tournament/:id/manage` is merged.
- `GET /tournaments/organizer` is organizer-auth (account JWT) — not the magic-link player session.
- Keep changes surgical: this revives an existing component; don't redesign `BrowseTournaments`.
