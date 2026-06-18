# Dual-Role: Organizer-as-Participant — TDD-first scope

> **STATUS: ✅ implemented & merged.** Backend: login/`/me` (and login/signup responses)
> carry the linked `playerId`; `resolveTournamentPlayer` (tournaments) and `resolvePlayerId`
> (player) accept any account JWT with a `playerId` + registration (not just role `player`);
> `POST /:id/register` links `account.player_id` when an authenticated account registers with its
> own email. Frontend: `useAuth` surfaces `playerId`; `usePermissions` exposes `canOrganize`
> /`canParticipate`. Tests: `packages/api/src/__tests__/integration/dual-role.spec.ts` +
> `usePermissions-capabilities.spec.ts`. **No frontend e2e** — see "E2E" note below.


**Goal:** Let a single registered account act as **both** an organizer and a participant — e.g. an
organizer who also plays in a tournament — without a new role value and without a schema change.
Capabilities are derived from the two columns that already exist. **TDD-first** (CLAUDE.md §4, §11):
scenario docs + unit + e2e tests written and red-committed before implementation.

> **Sequencing:** build this **after** #1 (Organizer Management screen,
> `assets/planning/organizer-management-screen.md`) and **before/with** #3 (organizer home). The role
> toggle this enables is a small follow-up edit to the management screen, not part of it.

> **Prerequisite check:** only start this if "an organizer who also plays" is a *real* requirement.
> If it's speculative, leave it parked (YAGNI).

---

## Decisions (already made — do not relitigate)
- **No `organizer_player` role.** `auth.accounts.role` stays a single authority value
  (`admin` | `organizer` | `player`). A combined role conflates authority with participation and
  explodes combinatorially.
- **Capabilities derive from existing columns** (no migration):
  - `canOrganize    = role IN ('organizer','admin')`
  - `canParticipate = player_id IS NOT NULL`
- **JWT carries atomic claims only** — `role` + `playerId`. No stored boolean permissions
  (`isPlayer`/`isOrganizer`/`isPlayerAndOrganizer`) — they go stale and duplicate state.
- **No `canActAsBoth` flag.** Inline `canOrganize && canParticipate` at the single call site (the
  toggle), named for intent there (e.g. `showRoleToggle`).
- **Multiple _authority_ roles per account** (distinct from organizer-who-plays) would need an
  `account_roles` join table — explicitly out of scope here.

## Current model (verified)
- `auth.accounts.role VARCHAR(50) CHECK (role IN ('admin','organizer','player'))` (migration 011).
- `auth.accounts.player_id TEXT REFERENCES public.players(id)` + `idx_accounts_player_id`
  (migration 027). Cross-schema FK; reading it is a column read (no join), and it can be carried as a
  JWT claim (no per-request DB hit).
- **Signup** (`routes/auth.ts`) creates accounts with role `'player'` and links `player_id`
  (`findOrCreatePlayerByEmail` + `accountRepo.linkPlayer`). **Organizers are provisioned separately and
  may have `player_id = NULL`.**
- **JWT minting** (`issueSessionToken({ sub, email, playerId? }, role)`) already supports an optional
  `playerId`; **signup sets it, login does not (confirm & fix).**
- `resolveTournamentPlayer` (tournaments routes) already accepts a player-role *or* account JWT with a
  `playerId` and verifies tournament registration — so participant endpoints work for an account JWT
  **once it carries `playerId`**.
- Frontend `usePermissions` derives `isPlayer`/`isOrganizer` from a single `role` (mutually exclusive
  today).

---

## What actually has to change (small, layered — no schema change)
1. **Login populates `playerId`** (`routes/auth.ts` login): include `account.player_id` in the issued
   JWT exactly as signup does, so an organizer who has a linked player can hit participant endpoints.
2. **Capability derivation** replaces single-role branching:
   - **Backend:** wherever permissions are computed/checked, derive `canOrganize` / `canParticipate`
     from `role` + `playerId` claim. Keep existing organizer-auth helpers (they gate on `role`); add
     participant capability via the `playerId` claim.
   - **Frontend `usePermissions`:** add `canOrganize` (role ∈ organizer/admin) and `canParticipate`
     (`playerId` present on the user). Keep `isPlayer`/`isOrganizer` as back-compat aliases or migrate
     call sites — decide during build (prefer adding capability flags, leaving existing flags intact to
     keep the diff surgical).
   - `useAuth.AuthUser` needs to expose `playerId` (from `/api/auth/me` and the player-session path)
     so the frontend can compute `canParticipate`. **Check `/api/auth/me` returns `player_id`** and add
     it if missing.
3. **Self-register flow (the missing piece):** allow an organizer (account JWT) to register *as a
   player* for a tournament. On registration, `findOrCreatePlayerByEmail(account.email)` and, if
   `account.player_id IS NULL`, `linkPlayer(account.id, player.id)`. Net effect: the organizer now has
   a participant identity and subsequent logins carry `playerId`. (Public `POST /:id/register` already
   creates/【claims】 players by email; the addition is **linking it back to the organizer account**.)
4. **(Optional) Role/mode toggle UI** — only when both capabilities hold. Gate inline:
   `showRoleToggle = canOrganize && canParticipate`. Switches which view set the user sees (organizer
   affordances vs. participant standings/matches). Pure client state; no new claim.

---

## TDD workflow (REQUIRED)
1. **Scenario docs first** — add a "Dual-role (organizer-as-participant)" feature to `e2e-scenarios.md`.
2. **Red tests** (below); confirm they fail for the right reason; **commit red separately.**
3. **Green**: login claim → capability derivation → self-register link → (optional) toggle.
4. **Verify** (success criteria), branch-merge per §11.

### Unit tests to write first (red)
- **Auth/login (api):** login for an account with a linked `player_id` issues a JWT whose decoded
  payload includes `playerId`; an account without one omits it. (Mirror existing `routes/auth.ts`
  tests.)
- **Capability derivation:** backend permission helper and frontend `usePermissions` return
  `canOrganize` / `canParticipate` correctly for (organizer+no player), (organizer+player),
  (player-only), (admin).
- **Self-register link (api):** an organizer account registering for a tournament results in
  `auth.accounts.player_id` being set (when previously NULL) and a `player_registrations` row; an
  already-linked account is unchanged.
- **`/api/auth/me`:** returns `player_id` (or null).

### E2E — intentionally omitted (justified)
No frontend e2e was added for dual-role:
- There is **no organizer-signup API**, so an e2e can't create an isolated organizer account; the only
  organizer credential available to e2e is the **shared seeded `organizer@test.com`**. Linking a
  `player_id` to it and registering it in tournaments would **permanently mutate the shared account**
  (the e2e DB is the real dev DB, not transactional) and could pollute every other spec.
- The capability is fundamentally backend/permission behaviour: it is proven end-to-end by the
  **integration tests** (isolated, transactional accounts) and the **usePermissions unit test**. There
  is no distinct dual-role *screen* to drive — the only frontend change is capability derivation.
- The optional toggle was **not built** (YAGNI — no consumer yet); when built it would gate inline on
  `canOrganize && canParticipate`.

---

## Build tasks (green)
1. **Login** carries `playerId` (api); `/api/auth/me` returns `player_id`.
2. **Capability flags** in backend permission helper + frontend `usePermissions`
   (`canOrganize`, `canParticipate`); `AuthUser.playerId` surfaced via `useAuth`.
3. **Self-register link**: organizer account registration links `account.player_id`.
4. **(Optional) toggle** in the management/tournament view, gated `canOrganize && canParticipate`.
5. Scenario docs + e2e.

## Success criteria
- [ ] Red committed first.
- [ ] Login JWT includes `playerId` when the account is linked; participant endpoints work for that JWT.
- [ ] `canOrganize` / `canParticipate` derive correctly for all four account shapes; **no
      `organizer_player` role, no schema migration, no stored boolean claims.**
- [ ] An organizer can register as a player; their account gets `player_id`; they then see both
      organizer and participant capabilities for that tournament.
- [ ] (If built) the toggle appears only when both capabilities hold and switches views.
- [ ] No regressions: `npm test` (frontend + api) + full `npx playwright test` green; `tsc --noEmit` 0.
- [ ] No new pollution (transactional harness); `e2e-scenarios.md` updated.

## Verification commands
- `npm test --workspace=packages/api` · `npm test --workspace=packages/frontend`
- `npx playwright test dual-role` ; full: `npx playwright test`
- `cd packages/frontend && npx tsc --noEmit`

## Notes / gotchas
- **Security-sensitive** (touches token claims + permission checks) — review carefully; never put
  secrets or PII beyond IDs in the token (CLAUDE.md §6).
- `player_id` is nullable on accounts — every derivation must handle the NULL (organizer-only) case.
- Don't reintroduce per-request joins to verify the link — the `playerId` claim (or the already-loaded
  account row) is sufficient; only join to `players` when you need player *data*.
