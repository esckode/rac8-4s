# Pending Implementation — Handoff

**Goal:** Close the **Phase 3 (Group Stage – Singles) browser e2e gap** — the 7 documented player
scenarios in `e2e-scenarios.md` have **no Playwright coverage** (they're only covered at the API
integration layer). The 4 existing tests in `group-stage-singles.spec.ts` are fixture/infra checks,
not player scenarios.

**Baseline:** branch `main` @ `dcf1997`, clean. Full jest 2374/2374; full e2e 126/126.
Dev servers: API `:3001` (`npm run dev --workspace=packages/api`), frontend `:5173`
(`npm run dev --workspace=packages/frontend`). Both require PostgreSQL.

**Method:** TDD-first is mandatory (CLAUDE.md §4, §11): write unit + e2e tests AND scenario docs
first (red), commit the red tests, implement to green, commit. Branch off `main`; run the suite
before merging.

---

## CRITICAL SHARED CONTEXT (read before either activity)

### Auth model — the crux of why the player flow is broken
Two token types exist:
- **Account JWT** — organizers and signed-up players; validated by `GET /api/auth/me`. This is what
  `useAuth` (`packages/frontend/src/hooks/useAuth.tsx`) checks to set `isAuthenticated`.
- **Player-session token** — issued from a magic link; validated server-side via the token store
  (`requirePlayerSessionAuth`). **Required by the player data/score endpoints.**

Player-facing endpoints and their auth:
- `GET /tournaments/:id/bundle` — standings + matches + bracket. Accepts **organizer JWT (owner) OR
  player session**. (`packages/api/src/routes/tournaments.ts`, ~line 1850.)
- `POST /tournaments/:id/matches/:matchId/score` — **player session** (participant). (~line 422.)
- `PATCH /tournaments/:id/matches/:matchId/score` — organizer-owner (403 if not owner) OR player
  participant. (~line 512.)
- `GET /tournaments/:id/groups/:groupId/standings` — player session + must be a group member.

### How to mint a player session over HTTP (for the e2e fixture)
1. `POST /tournaments/:id/register { email, name }` → **202**; response body includes
   **`magicLinkToken`** (`tournaments.ts` ~line 1191 — yes, the token is returned, not just emailed).
2. `GET /tournaments/:id/auth/verify?token=<magicLinkToken>` → `{ playerToken, playerId, tournamentId }`
   (~line 1199).
3. Use `Authorization: Bearer <playerToken>` for the player endpoints above.

### Known defects blocking the player browser flow
1. **`useTournament` passes the wrong token.** `packages/frontend/src/hooks/useTournament.ts:77`
   calls `fetchTournamentBundle(tournamentId, authState.user.id)` — it sends **`user.id` as the
   Bearer token**. Must send the real auth/player token.
2. **`useAuth` only recognizes account JWTs** (`GET /api/auth/me`). A player-session token fails
   `/me`, so the token is cleared and the player is treated as unauthenticated → `ProtectedRoute`
   redirects to `/login`. Needs to accept player sessions (see decision below).
3. **`ScoreSubmissionForm` is an orphaned prototype** (`packages/frontend/src/components/ScoreSubmissionForm.tsx`),
   **never rendered** anywhere (only in its own unit test). Three defects:
   - POSTs to `/api/tournaments/.../score`, but the Vite `/api` proxy has **no rewrite**
     (`packages/frontend/vite.config.ts`) → backend 404 (real route is `/tournaments/...`; the
     `/tournaments` proxy entry is correct).
   - Sends **no `Authorization` header** → 401.
   - Submits **set counts** (`"2-1"`); the backend `parseScore` (`@core/score-parser`) expects a
     real tennis score (`"6-4, 6-3"`). Wrong format.
4. **Score-submission UI not built.** Both Matches pages have `// TODO: Open score submission form
   (Task 4.6e)` — `packages/frontend/src/pages/TournamentDetail/Matches.tsx:57` and
   `packages/frontend/src/pages/Matches.tsx:48`. So submitting a score in the browser is an
   **unbuilt feature**, not a wiring fix.

### ⚠️ Open design decision (resolve before Activity 1 "green")
How should the frontend hold/use the player-session token?
- **Option A (simpler):** store `playerToken` as `auth_token`; teach `useAuth` to accept player
  sessions. There is **no player `/me` endpoint** today, so you'd need a validation path — e.g., add
  a lightweight player-session validate endpoint, or treat token presence + a successful `bundle`
  fetch as "authenticated player."
- **Option B:** dual-token — keep account JWT for app/`ProtectedRoute` auth, use a separate
  `playerToken` only for the player data/score calls. More moving parts.

Recommend deciding this first; it shapes both the fixture (what to inject into the browser) and the
`useAuth`/`useTournament` changes.

### E2E conventions (CLAUDE.md §8 + `packages/frontend/e2e/README.md`)
Seed your own data via fixtures (`getOrganizerToken`, `createTournamentWithOpenRegistration`,
`createTestUser`); use `data-testid` + `e2e/config.ts` constants; unique data; authenticate before
protected routes; `TEMPLATE.spec.ts` is excluded via `testIgnore`.

---

## ACTIVITY 1 (Cycle 1) — Read scenarios + wiring fixes  [achievable]

**Scenarios:** "User views tournament standings (Singles)", "User views upcoming matches (Singles)".

1. **Fixture** (add to `packages/frontend/e2e/fixtures.ts`): e.g.
   `createSinglesTournamentInGroupStage(organizerToken, playerCount = 2)` →
   `{ tournamentId, name, playerToken, playerId }`. Steps: create open tournament (singles) →
   register the focus player (capture `magicLinkToken` from the 202 body) → register the other
   player(s) → `advance CLOSE_REGISTRATION` → `POST /groups` (this moves it to
   `group_stage_active` with a pending match) → `GET /:id/auth/verify` for the `playerToken`.
   With `playerCount = 2` the focus player is in a 1-group / 1-match setup as a participant.
2. **e2e tests (red)** — new spec (e.g. `group-stage-singles-player.spec.ts`): a player
   authenticated via `playerToken` navigates to the standings + matches views and sees the data.
   (Inject the token per the chosen auth option; assert with `data-testid` / `config.ts` constants.)
3. **Green:**
   - Fix `useTournament` to send the real token (not `user.id`).
   - Make `useAuth` accept player sessions (per the decision above) so the player isn't bounced to
     `/login`.
   - Confirm the Standings/Matches pages render from `GET /tournaments/:id/bundle`.
4. **Verify:** the 2 e2e scenarios green; `npm test` still 2374/2374; full e2e green; row counts
   unchanged (no pollution).

---

## ACTIVITY 2 (Cycle 2) — Build score submission (Task 4.6e) + 5 scenarios  [feature build]

**Scenarios:** submit score; cannot submit after deadline; cannot submit tied score; cannot submit
duplicate; edit previously submitted score.

1. **Unit tests** for a corrected score-submission component (posts to
   `/tournaments/:id/matches/:id/score` with the player token, real tennis-score format, success +
   error handling).
2. **e2e tests (red)** for the 5 scenarios.
3. **Build/fix:**
   - Fix `ScoreSubmissionForm`: correct URL (`/tournaments/...`, or add an `/api` rewrite in
     `vite.config.ts`); add the `Authorization: Bearer <playerToken>` header; use the real score
     format accepted by `@core/score-parser` (`parseScore(score, sport)`), not set counts.
   - **Mount it** in the Matches page (replace the Task 4.6e TODO) — open on match click for a
     participant; PATCH for edits.
   - Surface backend errors: tied/invalid → `SCORE_INVALID` (400); duplicate → `ALREADY_SCORED`
     (409); past deadline → `DEADLINE_PASSED` (409). Score POST returns
     `{ match: { id, score, winnerId, status } }`.
4. **Deadline scenario:** seed a tournament whose `group_stage_deadline` is in the past (override in
   `createTestTournament`/the factory) to exercise `DEADLINE_PASSED`.
5. **Verify:** green; no regressions; no pollution.

---

## Verification commands
- API jest: `npm test --workspace=packages/api`
- Full jest (all packages): `npm test`  (expect 2374 passing as the pre-work baseline)
- E2E single spec: `npx playwright test <spec>.spec.ts` ; full: `npx playwright test`
- Pollution check: compare `SELECT count(*)` on `public.group_matches`, `public.tournaments`,
  `public.players` before vs after a run — must be unchanged (transactional harness).

## References
- Scenarios: `e2e-scenarios.md` → "Feature: Tournament Participation - Group Stage (Singles)"
- Source of truth for behavior/route access: `rac8-4s-HL.md`
- Guardrails: `CLAUDE.md` §4 (TDD), §7 (test isolation), §8 (e2e), §9 (routing/access), §11 (commits)
- Score parsing: `@core/score-parser` (`packages/core-logic/src/score-parser.ts`)
