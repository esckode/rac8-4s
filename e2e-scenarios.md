# E2E Test Scenarios

> 🗂️ Tracked in the [project backlog](BACKLOG.md). (Phases 1–7 + Messaging implemented; Phases 8–10 — Offline/Mobile/Accessibility, 13 scenarios — pending.)

**Format:** Gherkin BDD  
**Coverage:** Happy paths + critical error scenarios  
**Status:** Design phase - Option B (80-100 scenarios)  
**Last Updated:** 2026-06-10

---

## Test Prerequisites & Fixtures

**IMPORTANT:** Before writing e2e tests, understand the tournament state machine and use the shared prerequisite helpers.

### Tournament State Machine

Tournaments progress through states that must be transitioned in order:
```
draft → registration_open → registration_closed → group_stage_active → group_stage_complete → knockout_active → tournament_complete
```

### Shared Fixture Helpers (Required)

All e2e tests must use the shared fixture helpers from `packages/frontend/e2e/fixtures.ts`. These handle prerequisite setup correctly:

**Import in your test file:**
```typescript
import {
  apiCall,
  createTestUser,
  createTestTournament,
  createTournamentWithOpenRegistration,    // ← Use this for registration tests
  createTournamentWithClosedRegistration,  // ← Use this for group stage tests
  createTournamentWithGroups,              // ← Use this for group/bracket tests
  getOrganizerToken,
} from './fixtures'
```

**Common Patterns:**

1. **Tests that need player registration (registration_open state)**
   ```typescript
   const tournament = createTestTournament()
   const { id: tournamentId } = await createTournamentWithOpenRegistration(
     tournament, 
     organizerToken
   )
   // Now tournament is ready for players to register
   ```

2. **Tests that need closed registration (registration_closed state)**
   ```typescript
   const { id: tournamentId } = await createTournamentWithClosedRegistration(
     tournament,
     organizerToken
   )
   // Now registration is closed
   ```

3. **Tests that need groups (group_stage_active state)**
   ```typescript
   const { id: tournamentId } = await createTournamentWithGroups(
     tournament,
     organizerToken,
     4 // number of players to register
   )
   // Now tournament has groups and is in group stage
   ```

**Why These Helpers Exist:**

Tournaments are created in `draft` status by default. Tests that need registration require `registration_open`. The helpers encapsulate the state transition logic so:
- ✅ Tests are cleaner and easier to read
- ✅ State transitions are handled consistently
- ✅ Changes to the state machine only need to be updated in one place
- ✅ Future developers don't have to understand the state machine to write tests

**Common Mistake:** Forgetting to transition tournament state
```typescript
// ❌ WRONG - This will fail with "Registration is not open for this tournament"
const tournament = await apiCall(API_ENDPOINTS.TOURNAMENTS.CREATE, 'POST', data, token)
const tournamentId = tournament.id
const registration = await apiCall(`/tournaments/${tournamentId}/register`, 'POST', ...)

// ✅ CORRECT - Use the helper to handle state transition
const { id: tournamentId } = await createTournamentWithOpenRegistration(tournament, token)
const registration = await apiCall(`/tournaments/${tournamentId}/register`, 'POST', ...)
```

---

## Running Individual Tests

Each scenario in this document has a corresponding Playwright test in `packages/frontend/e2e/`. Tests are organized by feature and can be run individually, by feature group, or as a full suite.

### Quick Commands

**Run all tests for a feature group:**
```bash
# Example: Run all signup tests (5 scenarios × 2 browsers = 10 tests)
npx playwright test --grep "Feature: User signup flow"

# Example: Run session persistence tests (3 scenarios × 2 browsers = 6 tests)
npx playwright test --grep "Feature: Session persistence"
```

**Run a single scenario:**
```bash
# Example: Run one specific scenario on both browsers
npx playwright test --grep "User successfully signs up with valid credentials"
```

**Run by test file:**
```bash
# Run all authentication tests
npm run test:e2e:auth

# Run all authentication tests in UI mode (recommended for debugging)
npm run test:e2e:auth:ui
```

**Run on specific browser:**
```bash
# Chromium only
npx playwright test --grep "Feature: User signup flow" --project=chromium

# Firefox only
npx playwright test --grep "Feature: User signup flow" --project=firefox
```

**Run with debugging:**
```bash
# Interactive UI mode - click to re-run, inspect elements
npx playwright test --grep "User successfully signs up" --ui

# Debug mode - step through test line by line
npx playwright test --grep "User successfully signs up" --debug
```

### NPM Scripts

```bash
npm run test:e2e              # Run all e2e tests on all browsers
npm run test:e2e:auth         # Run all authentication tests
npm run test:e2e:auth:ui      # Run authentication tests in interactive UI mode
npm run test:e2e:auth:debug   # Run authentication tests in debug mode
npm run test:e2e:tournament   # Run all tournament discovery & registration tests
npm run test:e2e:tournament:ui # Run tournament tests in interactive UI mode
npm run test:e2e:tournament:debug # Run tournament tests in debug mode
npm run test:e2e:chromium     # Run all tests on Chromium only
npm run test:e2e:firefox      # Run all tests on Firefox only
npm run test:e2e:ui           # Run all tests in interactive UI mode
npm run test:e2e:debug        # Run all tests in debug mode
```

### Test Organization

Tests are organized by feature groups matching this document:

| Feature Group | Scenarios | Test File | Command |
|---|---|---|---|
| **Authentication & Authorization** | 27 | `auth.spec.ts` | `npm run test:e2e:auth` |
| **Tournament Discovery & Registration** | 9 | `tournament-discovery-registration.spec.ts` | `npm run test:e2e:tournament` |
| **My tournaments hubs (/standings, /matches)** | 2 | `my-tournaments-hub.spec.ts` | `npx playwright test my-tournaments-hub` |
| **Group Stage - Singles** | 10 | `group-stage-singles.spec.ts` | `npx playwright test --grep "Group Stage Singles"` |
| **Group Stage - Singles (Player view)** | 2 | `group-stage-singles-player.spec.ts` | `npx playwright test group-stage-singles-player` |
| **Group Stage - Singles (Score submission)** | 4 | `group-stage-singles-score.spec.ts` | `npx playwright test group-stage-singles-score` |
| **Group Stage - Doubles** | 4 | `group-stage-doubles.spec.ts` | `npx playwright test --grep "Group Stage Doubles"` |
| **Group Stage - Doubles (Score submission)** | 2 | `group-stage-doubles-score.spec.ts` | `npx playwright test group-stage-doubles-score` |
| **Partner Confirmation** | 5 | `partner-requests.spec.ts` | `npx playwright test partner-requests` |
| **Organizer Tournament Management** | 3 | `organizer-management.spec.ts` | `npx playwright test organizer-management` |
| **Organizer Home** | 1 | `organizer-home.spec.ts` | `npx playwright test organizer-home` |
| **Bracket - Singles** | 3 | `bracket-singles.spec.ts` | `npx playwright test --grep "Bracket Singles"` |
| **Bracket - Doubles** | 2 | `bracket-doubles.spec.ts` | `npx playwright test --grep "Bracket Doubles"` |
| **Real-Time Updates** | 4 | `real-time-updates.spec.ts` | `npx playwright test --grep "Real-Time Updates"` |
| **Offline & Error Handling** | 4 | `offline-error.spec.ts` | `npx playwright test --grep "Offline"` |
| **Mobile & Responsive** | 4 | `mobile-responsive.spec.ts` | `npx playwright test --grep "Mobile"` |

### Development Workflow

**When developing a feature:**
```bash
# Watch mode - re-runs tests automatically when code changes
npx playwright test --grep "Feature: User signup flow" --ui --watch
```

**Before committing:**
```bash
# Quick validation of affected feature
npx playwright test --grep "signup"
```

**Pre-push to main:**
```bash
# Full test suite on all browsers
npm run test:e2e
```

### Performance

- Single scenario: ~3-5 seconds
- Feature group (5 scenarios): ~15-20 seconds
- Full authentication suite (32 scenarios): ~1.1 minutes
- Complete e2e suite (95+ scenarios): ~5-10 minutes

### Implementation Status

✅ **Phase 1: Authentication & Authorization** (27 scenarios) — COMPLETE  
  - File: `packages/frontend/e2e/auth.spec.ts`
  - Tests: 64 implemented, all passing (32 on chromium, 32 on firefox)
  - Uses shared fixtures: `createTestUser()`, `apiCall()`, etc.
  - Run: `npm run test:e2e:auth`

✅ **Phase 2: Tournament Discovery & Registration** (10 scenarios) — COMPLETE  
  - File: `packages/frontend/e2e/tournament-discovery-registration.spec.ts`
  - Tests: 20 implemented, all passing (10 on chromium, 10 on firefox)
  - Uses prerequisite helper: `createTournamentWithOpenRegistration()`
  - Run: `npm run test:e2e:tournament`
  - **Note:** Prerequisite helpers properly configured; state transitions automated

✅ **Phase 3: Group Stage - Singles** (5 scenarios implemented, 5 ready) — COMPLETE  
  - Unit tests: 6/6 passing (100% coverage)
  - E2E tests: group-stage-singles.spec.ts (5 scenarios, 4/4 passing)
  - Player-view E2E: group-stage-singles-player.spec.ts (standings + matches via
    magic-link player session; chromium + firefox passing)
  - Score-submission E2E: group-stage-singles-score.spec.ts (submit, tied/invalid,
    deadline, edit; chromium + firefox passing). Duplicate covered in the
    ScoreSubmitForm unit test.
  - Backend: Score validation, duplicate check, edit support
  - Use fixture: `createTournamentWithGroups(tournament, token, playerCount)`
  
✅ **Phase 4: Group Stage - Doubles** (4 scenarios) — COMPLETE  
  - Browser e2e: `packages/frontend/e2e/group-stage-doubles.spec.ts` — 8/8 passing (4 scenarios × chromium + firefox)
  - API integration tests: `packages/api/src/__tests__/integration/group-stage-doubles.spec.ts` — 8/8 passing
  - Backend: ✅ Team auto-creation, ✅ group management, ✅ standings, ✅ score submission, ✅ group-membership listing (players resolved via teams)
  - Migrations: ✅ 021 (nullable player_id), ✅ 022 (unique constraints), ✅ 023 (nullable group_matches player columns), ✅ 024 (dropped winner_id→players FK so team IDs can be winners)
  - Use fixture: `createTournamentWithGroups(tournament, token, playerCount)` with `tournament.matchFormat = 'doubles'`
  
✅ **Phase 5: Partner Requests & Confirmation** (Doubles) — COMPLETE  
  - Model: partner-*requests* (optional partner; solo registrants request each other in-tournament). See the feature section below.
  - Backend ✅: `partner-requests.spec.ts` (discovery/request/two-sided confirm) + partner-aware team formation & `pairUnpaired` drop (`group-stage-doubles.spec.ts`); `unpaired` status (migration 028)
  - Frontend ✅ (Slice 2): PartnerFinder UI (Details tab, doubles + registration_open) + `/registrations/:registrationId/confirm` page; API client partner fns
  - Browser e2e: `packages/frontend/e2e/partner-requests.spec.ts` — 6/6 passing (3 scenarios × chromium + firefox); fixture `createDoublesTournamentWithSoloRegistrants`
  - Component/client unit: `PartnerFinder.spec.tsx`, `PartnerRequestConfirm.spec.tsx`, `api-client-partners.spec.ts`
  - Note: organizer `pairUnpaired` toggle not surfaced in the UI (no frontend create-groups screen exists; groups are created via the API, which already supports `pairUnpaired`)
  
✅ **Phase 6: Bracket - Singles + Doubles** (5 scenarios) — COMPLETE  
  - Browser e2e: `bracket-singles.spec.ts` (3: pending-generation, published Semifinals→Final tree, knockout score submit) + `bracket-doubles.spec.ts` (2: team names, team knockout score submit) — all passing on chromium
  - Frontend: `BracketTree` connector-line tree (round columns, reuses MatchCard testids), `Bracket` knockout score modal; names resolved by seeding `playerCache` from bundle standings + doubles `teams` map (`playersFromBundleStandings`)
  - Backend (doubles knockout, previously unimplemented — generated as singles): team-based bracket generation, team `knockout_matches` (team1_id/team2_id, format=doubles), team-membership knockout scoring, bundle `teams` name-map. Migration 029 drops the `bracket_seeds.player_id` + `knockout_matches.winner_id` → players FKs so team ids are allowed.
  - API integration: `bracket-doubles.spec.ts` (3 passing)
  - Use fixture: `createTournamentInKnockoutStage(organizerToken, { format, publish })`

✅ **Phase 7: Real-Time Updates (SSE)** (4 scenarios) — COMPLETE  
  - Browser e2e: `packages/frontend/e2e/real-time-updates.spec.ts` — 4/4 passing on chromium
    (live standings, multi-client sync, live bracket, reconnect refresh).
  - API integration: `standings-sse.spec.ts` (standings.updated on group score),
    `bracket-sse.spec.ts` (bracket.updated on knockout score).
  - Wiring fixed along the way: EventSource now authenticates via `?token=`;
    `useSSE` refetches the bundle on every data event; group-score routes emit
    `standings.updated` synchronously (the in-memory job queue has no consumer);
    `useTournament` flattens the grouped bundle standings for StandingsTable.

⏳ **Phases 8-10: Offline, Mobile, Accessibility** (13 scenarios) — Ready to implement  
  - Use appropriate fixture based on required tournament state

**Fixture Library:** `packages/frontend/e2e/fixtures.ts` (all shared helpers available)  

---

## Gherkin to Playwright Mapping

Each scenario below follows this pattern:

```gherkin
### Scenario: [Descriptive name]
- **Type:** [Happy path | Error path | Validation | Security | Navigation | Session | UI Interaction | Token | Accessibility]
- **Given** [Initial state]
- **When** [User action]
- **Then** [Expected outcome]
- **And** [Additional assertions]
```

Maps to Playwright test:
```typescript
test('Scenario: [Descriptive name]', async ({ page }) => {
  // Given: Initial state setup
  await page.goto('/...')

  // When: User action
  await page.click('...')

  // Then: Verify expected outcome
  await expect(page).toHaveURL('/...')
})
```

Each test is explicitly named to match the Gherkin scenario, making it easy to trace between requirements and implementation.

---

## Feature: Authentication & Authorization

### Scenario: User successfully signs up with valid credentials
- **Type:** Happy path (EXISTING TEST)
- **Given** I am on the signup page
- **When** I fill in email, name, password, and confirm password with valid values
- **And** I click the "Create Account" button
- **Then** I should be redirected to /browse
- **And** auth_token should be stored in localStorage
- **And** I should see a welcome message or tournament list

### Scenario: User signup fails with duplicate email
- **Type:** Error path (EXISTING TEST)
- **Given** an account with email "existing@example.com" already exists
- **When** I submit the signup form with that email
- **Then** I should remain on /signup
- **And** I should see error message "Email already in use"
- **And** no token should be stored in localStorage

### Scenario: User signup shows validation errors for invalid input
- **Type:** Error path (EXISTING TEST)
- **Given** I am on the signup page
- **When** I fill in invalid email "invalid-email" and blur the field
- **Then** I should see error "Please enter a valid email"
- **And** the "Create Account" button should be disabled

### Scenario: User signup requires all fields
- **Type:** Validation (EXISTING TEST)
- **Given** I am on the signup page
- **When** I leave form fields empty
- **Then** the "Create Account" button should be disabled
- **And** when I fill all fields with valid values
- **Then** the button should be enabled

### Scenario: User signup with mismatched passwords
- **Type:** Validation (EXISTING TEST)
- **Given** I am on the signup page
- **When** I fill in password "password123" and confirm password "different"
- **Then** I should see error "Passwords don't match"
- **And** the "Create Account" button should be disabled

### Scenario: User successfully logs in with valid credentials
- **Type:** Happy path (EXISTING TEST)
- **Given** I have created an account with email and password
- **When** I navigate to /login
- **And** I fill in my email and password
- **And** I click the "Sign In" button
- **Then** I should be redirected to /browse
- **And** auth_token should be stored in localStorage

### Scenario: User login fails with non-existent email
- **Type:** Error path (EXISTING TEST)
- **Given** I am on the login page
- **When** I fill in email "nonexistent@example.com" and password "AnyPassword123"
- **And** I click the "Sign In" button
- **Then** I should remain on /login
- **And** I should see error message "Invalid email or password"

### Scenario: User login fails with wrong password
- **Type:** Error path (EXISTING TEST)
- **Given** I have created an account with email and password
- **When** I navigate to /login
- **And** I fill in my email and incorrect password
- **And** I click the "Sign In" button
- **Then** I should remain on /login
- **And** I should see error message "Invalid email or password"

### Scenario: User login requires email and password
- **Type:** Validation (EXISTING TEST)
- **Given** I am on the login page
- **When** I leave email or password empty
- **Then** the "Sign In" button should be disabled

### Scenario: User login validates email format
- **Type:** Validation (EXISTING TEST)
- **Given** I am on the login page
- **When** I fill in invalid email "invalid-email"
- **And** I blur the email field
- **Then** I should see error "Please enter a valid email"
- **And** the "Sign In" button should be disabled

### Scenario: User navigates to forgot password from login
- **Type:** Navigation (EXISTING TEST)
- **Given** I am on the login page
- **When** I click the "Forgot password?" link
- **Then** I should be navigated to /forgot-password

### Scenario: User requests password reset with valid email
- **Type:** Happy path (EXISTING TEST)
- **Given** I have created an account
- **When** I navigate to /forgot-password
- **And** I fill in my email
- **And** I click the "Send Reset Code" button
- **Then** I should see success message "Check your email" (security: doesn't reveal if email exists)

### Scenario: User password reset form shows success for non-existent email
- **Type:** Security (EXISTING TEST)
- **Given** I am on the /forgot-password page
- **When** I fill in email "nonexistent@example.com"
- **And** I click the "Send Reset Code" button
- **Then** I should see the same success message (doesn't reveal if email exists)

### Scenario: User forgot password validates email format
- **Type:** Validation (EXISTING TEST)
- **Given** I am on the /forgot-password page
- **When** I fill in invalid email "invalid-email"
- **And** I blur the email field
- **Then** I should see error "Please enter a valid email"
- **And** the "Send Reset Code" button should be disabled

### Scenario: User reset password shows error for invalid code
- **Type:** Error path (EXISTING TEST)
- **Given** I am on the /reset-password page
- **When** I fill in email, invalid code "123456", and new password
- **And** I click the "Update Password" button
- **Then** I should see error message containing "invalid" or "expired"

### Scenario: User reset password validates code format (6 digits)
- **Type:** Validation (EXISTING TEST)
- **Given** I am on the /reset-password page
- **When** I fill in code with fewer than 6 digits "123"
- **And** I fill in valid new password
- **And** I click the "Update Password" button
- **Then** I should see error "Code must be 6 digits"

### Scenario: User reset password validates password match
- **Type:** Validation (EXISTING TEST)
- **Given** I am on the /reset-password page
- **When** I fill in mismatched passwords "password1" and "password2"
- **Then** I should see error "Passwords don't match"

### Scenario: User cannot access protected routes without authentication
- **Type:** Security (EXISTING TEST)
- **Given** I am not authenticated
- **When** I navigate to /matches (a protected route — /browse is public discovery)
- **Then** I should be redirected to /login

### Scenario: User cannot access protected routes with invalid token
- **Type:** Security (EXISTING TEST)
- **Given** I set localStorage auth_token to an invalid value
- **When** I navigate to /matches
- **Then** I should be redirected to /login

### Scenario: Unauthenticated user can access /browse (public discovery)
- **Type:** Security / Discovery
- **Given** I am not authenticated
- **When** I navigate to /browse
- **Then** I should remain on /browse (not redirected to /login)
- **And** I should see the "Browse" page with the list of open tournaments

### Scenario: User can access protected routes with valid token
- **Type:** Happy path (EXISTING TEST)
- **Given** I have successfully logged in
- **When** I navigate to /browse
- **Then** I should remain on /browse
- **And** I should not be redirected to /login

### Scenario: Authenticated user is redirected from login page
- **Type:** Navigation (EXISTING TEST)
- **Given** I am logged in and on /login
- **When** I navigate to /login
- **Then** I should be redirected to /browse

### Scenario: User session persists after page refresh
- **Type:** Session (EXISTING TEST)
- **Given** I have successfully logged in
- **And** I am on /browse
- **When** I refresh the page
- **Then** I should still be logged in
- **And** the auth_token should be preserved in localStorage
- **And** I should remain on /browse (not redirected to /login)

### Scenario: User session persists across navigation
- **Type:** Session (EXISTING TEST)
- **Given** I have successfully logged in
- **When** I navigate between different pages (/signup, /login, /browse)
- **Then** my token should remain in localStorage
- **And** authenticated pages should not redirect to /login

### Scenario: User session clears after logout
- **Type:** Session (EXISTING TEST)
- **Given** I am logged in
- **When** I click the logout button/link
- **Then** auth_token should be removed from localStorage
- **And** I should be redirected to /login
- **And** I should not be able to access /browse without logging in again

### Scenario: User can toggle password visibility on signup
- **Type:** UI Interaction (EXISTING TEST)
- **Given** I am on the /signup page
- **When** I click the "Show" button for the password field
- **Then** the password field type should change to "text" (visible)
- **When** I click the "Hide" button
- **Then** the password field type should change back to "password"

### Scenario: User can toggle password visibility on login
- **Type:** UI Interaction (EXISTING TEST)
- **Given** I am on the /login page
- **When** I click the "Show" button for the password field
- **Then** the password field type should change to "text"
- **When** I click the "Hide" button
- **Then** the password field type should change back to "password"

### Scenario: User can navigate from signup to login
- **Type:** Navigation (EXISTING TEST)
- **Given** I am on the /signup page
- **When** I click the "Sign in" link
- **Then** I should be navigated to /login

### Scenario: User can navigate back from signup to home
- **Type:** Navigation (EXISTING TEST)
- **Given** I am on the /signup page
- **When** I click the back button
- **Then** I should be navigated to /

### Scenario: Auth token is stored with correct key in localStorage
- **Type:** Token (EXISTING TEST)
- **Given** I have successfully signed up
- **When** I check localStorage
- **Then** I should find a key "auth_token"
- **And** the value should be a valid JWT (three parts separated by dots)

### Scenario: Auth token follows JWT format
- **Type:** Token (EXISTING TEST)
- **Given** I am logged in
- **When** I retrieve the auth_token from localStorage
- **Then** it should be a valid JWT with format "header.payload.signature"

---

## Feature: Tournament Discovery & Registration

> **Discovery is public** (per `rac8-4s-HL.md`): `/browse` and the tournament details page
> `/tournament/:id/browse` are reachable without logging in, and unauthenticated visitors can
> register by email. The scenarios below that say "authenticated" also work logged out — auth is optional for discovery.

### Scenario: Unauthenticated visitor browses open tournaments
- **Type:** Happy path / Public
- **Given** I am NOT authenticated
- **When** I navigate to /browse
- **Then** I should remain on /browse (not redirected to /login)
- **And** I should see the list of open tournaments (name, sport, format, status)

### Scenario: Visitor opens a tournament's public details page
- **Type:** Navigation / Public
- **Given** I am on /browse (authenticated or not)
- **When** I click a tournament card
- **Then** I should navigate to /tournament/:id/browse
- **And** I should see the tournament details and a registration section

### Scenario: Guest registers for a tournament with email and name
- **Type:** Happy path / Public
- **Given** I am an unauthenticated visitor on /tournament/:id/browse for an open tournament
- **When** I enter my email and name and click "Register for Tournament"
- **Then** the backend creates a registration and sends a magic-link email (POST /tournaments/:id/register)
- **And** I should see a "check your email" confirmation

### Scenario: Guest with an existing account can choose to sign in
- **Type:** Navigation / Public
- **Given** I am on /tournament/:id/browse
- **When** I click "Already have an account? Sign In"
- **Then** I should navigate to /login

### Scenario: Guest registration with an already-registered email is rejected
- **Type:** Error path
- **Given** an email is already registered for the tournament
- **When** I submit that email on the public registration form
- **Then** I should see an "already registered" error (409), not a crash

### Scenario: User browses public tournaments (Singles)
- **Type:** Happy path
- **Given** I am authenticated (or browsing as a guest — discovery is public)
- **When** I navigate to /browse
- **Then** I should see a paginated list of tournaments
- **And** each tournament card should show:
  - Tournament name
  - Sport (pickleball/tennis)
  - Format (singles/doubles)
  - Max players and registered count
  - Registration deadline
  - Status badge

### Scenario: User browses public tournaments (Doubles)
- **Type:** Happy path
- **Given** I am authenticated (or browsing as a guest — discovery is public)
- **When** I navigate to /browse
- **Then** I should see tournaments with matchFormat="doubles"
- **And** the card should indicate "Doubles" format

### Scenario: User views tournament details (Singles)
- **Type:** Happy path
- **Given** I am authenticated and on the browse page
- **When** I click on a singles tournament card
- **Then** I should navigate to /tournament/:id/browse
- **And** I should see tournament details:
  - Tournament name, sport, format (singles)
  - Status and deadlines
  - Registered player count
  - Details tabs

### Scenario: User views tournament details (Doubles)
- **Type:** Happy path
- **Given** I am authenticated and on the browse page
- **When** I click on a doubles tournament card
- **Then** I should navigate to /tournament/:id/browse
- **And** the page should indicate "Doubles" format
- **And** I should see "Team" or "Partner" references

### Scenario: User registers for singles tournament (unauthenticated)
- **Type:** Happy path
- **Given** I am NOT authenticated
- **And** I am viewing a singles tournament detail page
- **When** I fill in email and name in the registration form
- **And** I click "Register for Tournament"
- **Then** I should see success message
- **And** I should receive an email with a magic link
- **And** when I click the magic link
- **Then** I should be on /signup with email pre-filled

### Scenario: User registers for doubles tournament (unauthenticated)
- **Type:** Happy path
- **Given** I am NOT authenticated
- **And** I am viewing a doubles tournament detail page
- **When** I fill in email and name in the registration form
- **And** I click "Register for Tournament"
- **Then** I should see success message
- **And** I should receive an email with a magic link

### Scenario: User cannot register after deadline
- **Type:** Error path
- **Given** I am on a tournament page with an expired registration deadline
- **When** I try to submit the registration form
- **Then** I should see error "Registration deadline has passed"
- **And** the registration form should be disabled

### Scenario: User cannot register twice for same tournament
- **Type:** Error path
- **Given** I am already registered for a tournament
- **When** I try to register again
- **Then** I should see error "You are already registered for this tournament"

### Scenario: Completes signup via magic link for singles tournament
- **Type:** Happy path
- **Given** I have a magic link token from tournament registration
- **When** I navigate to /signup?token=xyz
- **And** email is pre-filled
- **And** I fill in name and password
- **And** I click "Create Account & Register"
- **Then** I should be logged in
- **And** I should be redirected to /tournament/:id/standings
- **And** I should be registered for the tournament

### Scenario: Completes signup via magic link for doubles tournament
- **Type:** Happy path
- **Given** I have a magic link token from a doubles tournament registration
- **When** I navigate to /signup?token=xyz
- **And** I complete the signup
- **Then** I should be registered for the doubles tournament
- **And** I should see team/partner setup or confirmation page

---

## Feature: Tournament Participation - Group Stage (Singles)

### Scenario: User views tournament standings (Singles)
- **Type:** Happy path
- **Given** I am registered and authenticated for a singles tournament in group stage
- **When** I navigate to /tournament/:id/standings
- **Then** I should see a standings table with:
  - Rank, Player Name, Wins, Losses, Sets Won, Sets Lost, Differential
  - Players sorted by rank (wins > sets won > head-to-head)
  - My rank highlighted

### Scenario: User views upcoming matches (Singles)
- **Type:** Happy path
- **Given** I am in a singles tournament group stage
- **When** I navigate to the Matches tab
- **Then** I should see my upcoming matches as cards:
  - "vs. Player Name"
  - Group and round info
  - Match status
  - [Submit Score] button

> **Score format:** scores are real game scores per the parser — comma-space
> separated sets, `games-games` each, best-of-3, tied sets rejected (pickleball
> max 21). E.g. `11-9, 11-7`. (The earlier `2-1`/`2-2` set-count examples were
> not valid parser input.)

### Scenario: User submits score for completed match (Singles)
- **Type:** Happy path
- **Given** I have a pending match against another player
- **When** I click [Submit Score] on a match card
- **And** I fill in the score "11-9, 11-7"
- **And** I click [Submit]
- **Then** the form should close and the match should show the submitted score
- **And** standings should update (asynchronously via SSE)

### Scenario: User cannot submit score after deadline
- **Type:** Error path
- **Given** the group stage deadline has passed
- **When** I submit a valid score
- **Then** I should see an error mentioning the deadline (DEADLINE_PASSED)
- **And** the form should stay open

### Scenario: User cannot submit an invalid (tied) score
- **Type:** Validation
- **Given** I have a pending match
- **When** I submit a score with a tied set, e.g. "11-11, 11-7"
- **Then** I should see an "invalid score" error (SCORE_INVALID)
- **And** the form should stay open so I can correct it

### Scenario: User cannot submit duplicate score
- **Type:** Validation (covered by ScoreSubmitForm unit test)
- **Given** the match has already been scored
- **When** the submit returns ALREADY_SCORED
- **Then** I should see "already scored" and an option to edit instead
- **Note:** not an e2e scenario — once a match is completed the UI shows an
  Edit affordance, so a second POST is not reachable via the happy path.

### Scenario: User can edit previously submitted score
- **Type:** Happy path
- **Given** I have submitted a score "11-9, 11-7"
- **When** I click [Edit Score]
- **And** I change it to "11-9, 11-5"
- **And** I click [Submit]
- **Then** the match should show the new score (standings recalculate)

---

## Feature: Tournament Participation - Group Stage (Doubles)

### Scenario: User views tournament standings (Doubles)
- **Type:** Happy path
- **Given** I am registered for a doubles tournament in group stage
- **When** I navigate to /tournament/:id/standings
- **Then** I should see a standings table with:
  - Rank, Team Name (or "You & Partner"), Wins, Losses, Sets Won, Sets Lost, Differential

### Scenario: User views team matches (Doubles)
- **Type:** Happy path
- **Given** I am in a doubles tournament
- **When** I navigate to the Matches tab
- **Then** I should see match cards with:
  - "You & [Partner] vs. [Player1] & [Player2]"
  - [Submit Score] button

### Scenario: User submits score for team match (Doubles)
- **Type:** Happy path
- **Given** I am in a doubles match
- **When** I click [Submit Score]
- **And** I fill in "2-1"
- **And** I click [Submit]
- **Then** I should see success "Score submitted"
- **And** team standings should update

### Scenario: Team stands in standings with correct name (Doubles)
- **Type:** Validation
- **Given** I have a team with my partner
- **When** I view standings
- **Then** I should see my team name displayed (not just my individual name)

---

## Feature: Partner Requests & Confirmation (Doubles)

> **Model (revised):** doubles partner selection is **optional**. Players register
> solo; a solo registrant can then find another *solo* registrant *within the
> tournament* and send a partnership request the other player confirms. At group
> creation, confirmed partnerships are honored first, then leftover solo
> registrants are auto-paired (default) or dropped (organizer opt-out). This
> replaces the earlier "select/invite at registration + mandatory partner +
> email" scenarios, which contradicted the implemented auto-team model.
>
> **Backend:** ✅ implemented + integration-tested (`partner-requests.spec.ts`,
> `group-stage-doubles.spec.ts`). **Frontend (Slice 2):** ⏳ partner-finder UI +
> confirm page — see `assets/planning/phase5-partner-requests.md`.

### Scenario: Solo registrant views available partners (Doubles)
- **Type:** Happy path
- **Given** I am a solo registrant in a doubles tournament
- **When** I open the partner finder
- **Then** I should see the other solo (unpaired) registrants, excluding myself

### Scenario: Solo registrant sends a partnership request (Doubles)
- **Type:** Happy path
- **Given** I am a solo registrant viewing available partners
- **When** I send a partnership request to another solo registrant
- **Then** the request should be pending and they should see it

### Scenario: Partner confirms the request → team formed (Doubles)
- **Type:** Happy path
- **Given** someone has sent me a partnership request
- **When** I open `/registrations/:registrationId/confirm` and confirm
- **Then** both registrations become a confirmed team (status "registered")

### Scenario: Confirmed partnerships are honored at group creation (Doubles)
- **Type:** Happy path
- **Given** confirmed partnerships exist
- **When** the organizer creates groups
- **Then** confirmed partners are teamed together (not randomly re-paired)
- **And** leftover solo registrants are auto-paired by default

### Scenario: Organizer drops unpaired registrants at group creation (Doubles)
- **Type:** Validation / organizer option
- **Given** some registrants never found a partner
- **When** the organizer creates groups with `pairUnpaired: false`
- **Then** only confirmed teams advance and the solo registrants are marked "unpaired"

---

## Feature: Organizer Tournament Management

> Organizer-only screen at `/tournament/:tournamentId/manage` (gated on
> `canManageGroups` = creator). Drives the lifecycle: most steps via
> `POST /:id/advance`, but **group creation** (`POST /:id/groups`) performs the
> `registration_closed → group_stage_active` transition and **bracket publish**
> (`POST /:id/bracket/publish`) performs `group_stage_complete → knockout_active`.
> Scope/decisions: `assets/planning/organizer-management-screen.md`.

### Scenario: Organizer walks a tournament through the full lifecycle
- **Type:** Happy path
- **Given** I am the organizer (creator) viewing the management screen for my draft tournament
- **When** I open registration, close it, create groups, complete the group stage (forcing past the
  pending-scores guard), generate & publish the bracket, and complete the tournament
- **Then** the visible status advances draft → ... → tournament_complete at each step

### Scenario: Organizer creates groups with the pairUnpaired toggle (Doubles)
- **Type:** Happy path / organizer option
- **Given** a doubles tournament in registration_closed
- **When** I fill the create-groups form (numGroups, advancingPerGroup) and choose the pairUnpaired option
- **Then** groups are created and the tournament moves to group_stage_active

### Scenario: Non-owner cannot operate the controls
- **Type:** Security
- **Given** I am not the tournament's creator (a player session or a different organizer)
- **When** I open `/tournament/:id/manage`
- **Then** I see a not-authorized state and no lifecycle controls

### Scenario: Manage link routes the owner to the management screen
- **Type:** Navigation
- **Given** I am the creator viewing my tournament
- **When** I click the "Manage" affordance
- **Then** I navigate to `/tournament/:id/manage`

---

## Feature: Organizer Home

> Organizer-only landing at `/organizer` (reached via the existing organizer-only
> "Organizer Dashboard" nav entry). Lists the organizer's own tournaments
> (`GET /tournaments/organizer`) and links each into `/tournament/:id/manage`.
> Scope: `assets/planning/organizer-home.md`.

### Scenario: Organizer sees their tournaments and opens one to manage
- **Type:** Happy path / Navigation
- **Given** I am an authenticated organizer with at least one tournament
- **When** I open `/organizer`
- **Then** I see my tournaments listed
- **And** clicking one navigates to its management screen `/tournament/:id/manage`

---

## Feature: Tournament Participation - Bracket (Singles)

### Scenario: User views bracket when pending generation (Singles)
- **Type:** Happy path
- **Given** I am in a singles tournament after group stage completes
- **And** bracket has not yet been generated
- **When** I navigate to the Bracket tab
- **Then** I should see message "Bracket will appear when group stage completes"

### Scenario: User views published bracket (Singles)
- **Type:** Happy path
- **Given** the bracket has been generated and published
- **When** I navigate to the Bracket tab
- **Then** I should see bracket tree structure:
  - Semifinals: Seed 1 vs 4, Seed 2 vs 3
  - Finals: Winner1 vs Winner2
  - Status for each match (pending/completed)

### Scenario: User submits knockout score (Singles)
- **Type:** Happy path
- **Given** I am in a semifinal match
- **When** I click [Submit Score] on the bracket match
- **And** I fill in "2-0"
- **And** I click [Submit]
- **Then** I should see success message
- **And** I should advance to finals
- **And** my opponent's side should be grayed out or marked as "Eliminated"

---

## Feature: Tournament Participation - Bracket (Doubles)

### Scenario: User views bracket with team names (Doubles)
- **Type:** Happy path
- **Given** the bracket has been generated for a doubles tournament
- **When** I navigate to the Bracket tab
- **Then** I should see bracket with:
  - "(You & Partner) vs. (Team2a & Team2b)"
  - Not individual player names

### Scenario: User submits team knockout score (Doubles)
- **Type:** Happy path
- **Given** I am in a doubles knockout match
- **When** I click [Submit Score]
- **And** I fill in "2-1"
- **And** I click [Submit]
- **Then** I should see success message
- **And** my team should advance

---

## Feature: Real-Time Updates (SSE)

> **Events & contract.** The API broadcasts on a per-tournament `BroadcastBus`,
> streamed to clients over `GET /tournaments/:id/events`:
> - `standings.updated` `{ groupId, standings }` — after the standings-recalc job.
> - `bracket.published` `{ matchCount, byeCount }` — after the bracket is generated.
> - `bracket.updated` `{ matchId, round, winnerId }` — **after a knockout score is
>   submitted** (`POST`/`PATCH /:id/knockout/:matchId/score`). Added for Phase 7
>   so the bracket advances live; previously knockout scoring emitted nothing.
>
> **Frontend behavior.** `useSSE` turns each of these events (and a reconnect)
> into a `useTournament` bundle **refetch** — the authoritative bundle re-renders
> the standings table and bracket. This keeps the rendered view consistent with
> the server rather than patching client state per event.
>
> **Browser e2e:** `packages/frontend/e2e/real-time-updates.spec.ts`.

### Scenario: User receives live standings update
- **Type:** Happy path
- **Given** I am viewing /tournament/:id/standings
- **And** I am subscribed to standings.updated events
- **When** another player submits a score
- **Then** the standings table should update automatically (within ~100ms)
- **And** changed rows should highlight briefly

### Scenario: User receives live bracket update
- **Type:** Happy path
- **Given** I am viewing the bracket
- **And** a player submits a knockout score
- **When** the bracket.updated event is received
- **Then** the bracket should update with new winner
- **And** next round matches should become available

### Scenario: Multiple users see synchronized standings
- **Type:** Integration
- **Given** User A and User B are both viewing the same tournament standings
- **When** User A submits a score
- **Then** both User A and User B should see the updated standings within ~100ms
- **And** no manual refresh needed

### Scenario: User reconnects after SSE disconnect
- **Type:** Network
- **Given** I am viewing standings and SSE connection drops
- **When** SSE automatically reconnects
- **And** I receive standings.updated event
- **Then** I should see current standings (no data loss)

---

## Feature: Offline Support & Error Handling

> **Superseded** — the three offline/sync scenarios below (previously covering
> `e2e/offline.spec.ts`, itself API/SW-boundary only, no UI) are replaced by
> **§ Feature: PWA Venue Mode (Offline)** below, per `assets/planning/PWA_CACHING_DESIGN.md`
> and `PWA_CACHING_IMPLEMENTATION.md`. Kept here for history; do not implement against these.

### Scenario: ~~User submits score while offline (Singles)~~ — superseded, see PWA Venue Mode
- **Type:** Happy path - offline
- **Given** I am offline (network disconnected)
- **When** I click [Submit Score] and fill in "2-1"
- **And** I click [Submit]
- **Then** I should see banner "📱 Offline - will retry"
- **And** the request should be queued in Service Worker

### Scenario: ~~User submits score while offline - syncs on reconnect~~ — superseded, see PWA Venue Mode
- **Type:** Happy path - offline
- **Given** I submitted a score while offline
- **When** I go back online
- **And** Service Worker auto-retries submission
- **Then** I should see notification "✓ Score synced"
- **And** standings should update normally

### Scenario: ~~Offline submission fails after retries~~ — superseded, see PWA Venue Mode
- **Type:** Error path - offline
- **Given** I submitted while offline
- **And** reconnected, but server returns 409 (score already submitted)
- **When** after 3 retries (1s, 2s, 4s delays)
- **Then** I should see persistent error banner
- **And** option to [Retry] or [Copy to clipboard]

### Scenario: Rate limit error shows countdown
- **Type:** Error path
- **Given** I have attempted login 5 times unsuccessfully
- **When** I attempt login a 6th time
- **Then** I should see error "Too many attempts"
- **And** "Try again in 15 minutes"
- **And** form fields should be disabled

---

## Feature: PWA Venue Mode (Offline)

> Per `assets/planning/PWA_CACHING_DESIGN.md` (grilled 2026-07-18, decisions D1–D10) and
> `assets/planning/PWA_CACHING_IMPLEMENTATION.md`. Venue mode: a player at a court with bad
> signal can view a timestamped offline snapshot of their tournament (list, matches,
> standings, bracket) and queue score submits for replay on reconnect. Status markers below:
> ✅ built & verified (all 11 scenarios green on the `pwa` Playwright project — S6, 2026-07-18).

### ✅ Scenario: Venue views readable offline
```
Given a player has loaded matches/standings/bracket for their tournament while online
When they go offline and reload the page
Then each view still renders from the cached snapshot
  And a global offline banner is visible
  And each view shows "Updated HH:MM" for its snapshot
```

### ✅ Scenario: Offline score submit shows pending, not success
```
Given a player is offline on a match they can score
When they submit a score
Then they see a "Saved offline — will send when connected" badge
  And no success state is shown
  And the submission is recorded in the local sync queue
```

### ✅ Scenario: Reconnect replays the queue
```
Given a player has a queued score submission from being offline
When connectivity returns
Then the service worker replays the queue and the server accepts it
  And the pending badge clears
  And the match shows the submitted score
```

### ✅ Scenario: Replay rejection surfaces and drops
```
Given a player submitted a score offline for a match
  And their opponent scored the same match while the player was still offline
When connectivity returns and the queued entry replays
Then the server rejects it with a 4xx (already recorded)
Then the player sees "Not applied — already recorded"
  And the queue entry is removed (no retry)
```

### ✅ Scenario: Non-queueable writes fail fast offline
```
Given a player is offline
When they attempt a non-score write (e.g. a partner request)
Then it fails immediately with a normal error
  And nothing is queued
  And no fake 202/pending state is shown
```

### ✅ Scenario: Sign-out wipes offline data
```
Given a player has a cached venue snapshot and/or a queued score
When they sign out
Then Cache Storage has no venue-data entries afterward
  And the sync queue is empty
  And going offline immediately after shows "no saved data" (not the prior player's snapshot)
```

### ✅ Scenario: No token-bearing URL is ever cached
```
Given a full player session including live SSE updates
When the session ends
Then no Cache Storage key contains "/events" or "token=" for any entry
```

### ✅ Scenario: App shell boots offline (preview build only)
```
Given a player has visited the installed app online at least once
When they go offline and hard-reload
Then the app shell boots (no browser error page)
  And the offline banner is shown
```

### ✅ Scenario: Installable
```
Given the production build is served
When a client requests /manifest.webmanifest
Then it is served with the required PWA fields (name, icons, start_url, display)
  And navigator.serviceWorker.ready resolves with a controlling service worker
```

### ✅ Scenario: Offline reload keeps the session (D11 — scenario 1's hidden dependency)
```
Given an authenticated player (covers both a registered-account JWT and a magic-link
  player session) has loaded a venue route while online
When they go offline and hard-reload that route
Then they stay signed in (offline-unvalidated) — no redirect to /login
  And the cached venue snapshot renders
When connectivity returns and they reload again
Then the session revalidates with no re-login required (the token was never deleted)
```

**Implementation (S0–S9):**
- Playwright (`pwa` project, preview :4173, chromium only): `e2e/pwa-offline-venue.spec.ts`
  (scenarios 1, 8, 10), `e2e/pwa-score-queue.spec.ts` (scenarios 2–5), `e2e/pwa-hygiene.spec.ts`
  (scenarios 6–7), `e2e/pwa-install.spec.ts` (scenario 9)
- Frontend: `src/workers/service-worker.ts` (rewritten) + `src/workers/sw-lib/{routing,venue-cache,sync-queue,messages}.ts`,
  `src/pwa/{register,sw-bridge,OfflineSnapshotContext,OfflineBanner,UpdateToast}.tsx`,
  `src/hooks/useAuth.tsx` (D11 offline session survival — restoreSession distinguishes
  network failure from HTTP 401; `auth_session_snapshot` in localStorage)
- Superseded: `e2e/offline.spec.ts` (deleted), the three offline scenarios in
  § Feature: Offline Support & Error Handling above

---

## Feature: Mobile & Responsive Design

### Scenario: Bottom tab navigation displays correctly on mobile
- **Type:** UI
- **Given** I am on a mobile device (320-640px width)
- **And** I am viewing /tournament/:id/standings
- **Then** I should see bottom tab navigation with:
  - 🏠 Standings (active)
  - ⚔️ Matches
  - 🏆 Bracket
  - ℹ️ Details
- **And** each tab should be tappable (48px minimum height)

### Scenario: Swipe navigation between tabs
- **Type:** UI
- **Given** I am on the Standings tab on mobile
- **When** I swipe left
- **Then** I should navigate to the Matches tab

### Scenario: Standings table is touch-friendly on mobile
- **Type:** UI
- **Given** I am viewing standings on mobile
- **Then** table rows should be tall enough for touch (48px minimum)
- **And** text should be readable at 320px width
- **And** table should scroll horizontally if needed (not overflow)

### Scenario: Score submission form is full-width on mobile
- **Type:** UI
- **Given** I am viewing the score submission modal on mobile
- **Then** input fields should be full-width
- **And** buttons should be full-width
- **And** button text should be visible (not truncated)

---

## Feature: Accessibility

### Scenario: Login page is keyboard navigable
- **Type:** Accessibility (EXISTING TEST)
- **Given** I am on the /login page
- **When** I press Tab to navigate through form elements
- **Then** I should be able to:
  - Tab to email input
  - Tab to password input
  - Tab to submit button
  - Press Enter to submit
- **And** focus should be visible (2px outline)

### Scenario: Form has proper labels for inputs
- **Type:** Accessibility (EXISTING TEST)
- **Given** I am on a form page (login, signup, reset password)
- **Then** each input should have:
  - Associated `<label>` element
  - Accessible via Tab key
  - Described by aria-label if no visible label

### Scenario: Buttons have accessible text and roles
- **Type:** Accessibility (EXISTING TEST)
- **Given** I am on any page with buttons
- **Then** buttons should have:
  - Clear, descriptive text ("Sign In", "Submit Score", not "OK")
  - Proper role="button" or `<button>` element
  - Accessible to screen readers

### Scenario: Color is not the only way to convey information
- **Type:** Accessibility
- **Given** I am viewing tournament standings or bracket
- **When** standings change or a match is won
- **Then** information should not rely on color alone
- **And** text or icons should also change

### Scenario: Error messages are associated with form fields
- **Type:** Accessibility
- **Given** I fill in an invalid email and blur the field
- **Then** error message should be:
  - Associated with input via aria-describedby
  - Announced by screen reader
  - Visible above or below the field

---

## Coverage Summary

**Total Scenarios: 95**

| Feature | Scenarios | Existing | New | Happy Path | Error Path | Notes |
|---------|-----------|----------|-----|-----------|-----------|-------|
| Authentication | 27 | 27 | - | 9 | 18 | All existing tests mapped |
| Tournament Discovery | 9 | - | 9 | 7 | 2 | Singles + Doubles variants |
| Group Stage - Singles | 10 | - | 10 | 7 | 3 | Matches, scores, standings |
| Group Stage - Doubles | 4 | - | 4 | 3 | 1 | Team standings and matches |
| Partner Confirmation | 5 | - | 5 | 3 | 2 | Doubles-specific |
| Bracket - Singles | 3 | - | 3 | 2 | 1 | Knockout stage |
| Bracket - Doubles | 2 | - | 2 | 1 | 1 | Team bracket viewing |
| Real-Time Updates | 4 | - | 4 | 3 | 1 | SSE events |
| Offline & Error | 4 | - | 4 | 2 | 2 | Network handling |
| Mobile & Responsive | 4 | - | 4 | 4 | - | UI interactions |
| Accessibility | 5 | 5 | - | 5 | - | WCAG 2.1 AA |
| **TOTAL** | **95** | **27** | **68** | **63** | **32** | - |

---

## Implementation Notes

### Grouping Strategy
- **Feature**: Logical feature area (e.g., "Authentication", "Tournament Participation")
- **Scenario**: Individual test case in Gherkin format
- **Type**: Happy path, Error path, Validation, Security, Navigation, etc.
- **Existing Test**: Mapped from `/e2e/auth.spec.ts` (marked with parenthetical note)
- **New Test**: Not yet implemented

### Singles vs. Doubles
- Scenarios marked with **(Singles)** and **(Doubles)** should both be tested
- Example: "User views standings (Singles)" and "User views standings (Doubles)" are separate scenarios
- Doubles scenarios cover partner selection, team registration, and team-based standings/bracket

### Conversion to Code
1. Each scenario becomes one `test()` block in Playwright
2. Feature becomes one `test.describe()` block
3. Gherkin Given/When/Then maps to Playwright selectors and assertions
4. Success criteria become explicit assertions

### Test Execution Order
1. **Phase 1** (Existing): Run existing 27 tests first to verify baseline
2. **Phase 2** (Auth-related new): Tournament discovery and registration (~9 tests)
3. **Phase 3** (Game flow): Singles group stage and bracket (~13 tests)
4. **Phase 4** (Doubles): Doubles registration, standings, bracket (~11 tests)
5. **Phase 5** (Real-time/offline): SSE, network, mobile, accessibility (~20 tests)

---

---

## Fixture Library Reference

**Location:** `packages/frontend/e2e/fixtures.ts`

All e2e tests should import from this module. It provides:

### API & Browser Helpers
- `apiCall(path, method, body?, token?)` — Make authenticated API calls
- `getTokenFromPage(page)` — Extract JWT from localStorage
- `clearAuthState(page)` — Clear auth and reload page

### Test Data Generators
- `createTestUser()` — Generate unique test user (timestamp-based email)
- `createTestTournament()` — Generate unique tournament with default settings

### Tournament Prerequisite Helpers (State Management)
| Helper | Creates State | Use When |
|--------|---------------|----------|
| `createTournamentWithOpenRegistration()` | `registration_open` | Testing player registration, magic links |
| `createTournamentWithClosedRegistration()` | `registration_closed` | Testing group stage setup |
| `createTournamentWithGroups()` | `group_stage_active` | Testing standings, matches, scores |

### Auth Helpers
- `getOrganizerToken()` — Login as seeded organizer (organizer@test.com / testpass123)

**Example Usage:**
```typescript
import { createTestTournament, createTournamentWithOpenRegistration } from './fixtures'

test('User can register for tournament', async ({ page }) => {
  // PREREQUISITE: Create tournament and open registration
  const tournament = createTestTournament()
  const { id: tournamentId } = await createTournamentWithOpenRegistration(
    tournament,
    organizerToken
  )
  
  // Now test registration flow
  await page.goto(`/tournament/${tournamentId}/browse`)
  // ... registration test steps
})
```

---

**Next Step:** When implementing Phase 3+ tests, use `createTournamentWithGroups()` to set up proper state

---

## Feature: Player Messaging

Real-time in-tournament messaging between participants and organizers. Messages are persisted and delivered over SSE (`message.created`). Auth-gated — all message routes require a valid player session or organizer JWT.

### Scenario: Organizer broadcasts an announcement to all participants

```gherkin
Given an organizer with a tournament that has registered players
When the organizer posts an announcement via POST /tournaments/:id/announcements
Then every connected participant receives it in real time via SSE
And a reconnecting participant sees it in message history on reload
```

**Implementation:** `messaging.spec.ts` — "Organizer broadcasts an announcement to all participants"

---

### Scenario: ~~Player sends a coordination message to their match opponent~~ — superseded, see Messaging — threads (V5.2)

```gherkin
Given two players registered in the same tournament
When one player sends a message scoped to the match (POST /tournaments/:id/messages)
Then the message appears in their message panel
And the opponent can see it in the message history
```

**Implementation:** `messaging.spec.ts` — "Player sends a coordination message to their match opponent" (skipped —
premised on the pre-V5.2 flat panel, where any compose box could send an implicitly-match-scoped message; the
V5.2 threaded panel (`MessageThreadPanel`) has no default compose entry point — a DM/match thread must be
selected first, reached via "Message opponent" on a MatchCard, and there is deliberately no arbitrary-DM
affordance). Covered instead by `messaging-threads.spec.ts` — "Message opponent DM reaches only the opponent".

---

### Scenario: Player cannot broadcast to the tournament

```gherkin
Given an authenticated player (not organizer)
When the player attempts to POST /tournaments/:id/announcements
Then the request is rejected with 403 Forbidden
And the MessagePanel does not expose the broadcast action to players
```

**Implementation:** `messaging.spec.ts` — "Player cannot broadcast to the tournament"

---

### Scenario: Unread badge updates and clears on read

```gherkin
Given a player with one unread message in the tournament
Then the message panel shows an unread badge with count 1
When the player opens the message thread (MessagePanel becomes visible)
Then the badge clears to 0
```

**Implementation:** `messaging.spec.ts` — "Unread badge updates and clears on read"

---

### Scenario: Unauthenticated user cannot access messages

```gherkin
When an unauthenticated user requests GET /tournaments/:id/messages
Then the request is rejected with 401 Unauthorized
And navigating to the messages tab redirects to login
```

**Implementation:** `messaging.spec.ts` — "Unauthenticated user cannot access messages"

---

## Feature: Messaging — threads (V5.2)

Thread-model UI: channel switcher, Announcements read-only for players, "Message opponent" DM scoping, dispute threads, no arbitrary-DM affordance.

### Scenario: Announcements channel is read-only for players

```gherkin
Given an authenticated player on the messages page
When the Announcements channel is active (default)
Then the compose input is NOT shown for the player
And a read-only notice is displayed
And the message list shows only broadcast messages (recipientPlayerId === null)
```

**Implementation:** `messaging-threads.spec.ts` — "Announcements channel is read-only for players"

---

### Scenario: Organizer can post announcements from the Announcements channel

```gherkin
Given an authenticated organizer on the messages page
When the Announcements channel is active
Then the announce compose form IS shown
And posting sends to /tournaments/:id/announcements
```

**Implementation:** `messaging-threads.spec.ts` — "Organizer can post announcements from Announcements channel"

---

### Scenario: "Message opponent" DM reaches only the opponent

```gherkin
Given a player with a pending match against an opponent
When the player clicks "Message opponent" on the match card
Then a compose panel opens scoped to that match
And sending a message calls POST /tournaments/:id/messages with recipientPlayerId=<opponentId> and matchId=<matchId>
And only the opponent sees the DM (not other participants)
```

**Implementation:** `messaging-threads.spec.ts` — "Message opponent DM reaches only the opponent"

---

### Scenario: Arbitrary DM is not offered

```gherkin
Given an authenticated player on the messages page
Then there is no "New DM" or "Start a direct message" button
And the only way to start a DM thread is via "Message opponent" on a match card
```

**Implementation:** `messaging-threads.spec.ts` — "Arbitrary DM not offered to players"

---

### Scenario: Channel switcher switches threads and fetches filtered history

```gherkin
Given a player with an existing DM thread with their opponent
And they are on the Announcements channel
When they click on the DM thread in the channel switcher
Then the history re-fetches with ?thread=dm:<opponentId>
And the compose box becomes available (DM channel is writable)
```

**Implementation:** `messaging-threads.spec.ts` — "Channel switcher switches threads"

---

## Feature: Messaging — multi-instance

> These scenarios validate distributed behaviour when two API instances sit behind a
> non-sticky round-robin load balancer (LB) and share a Redis bus, BullMQ queue, and
> Redis token store.  They live in the separate `messaging-multi-instance` Playwright
> project and are NOT part of the default single-instance suite.  The distributed
> stack must be running (`npm run dev:distributed`) before these can go green.

### Scenario 1: Cross-node SSE delivery

```gherkin
Given two API instances (A :3001 and B :3002) sharing the same Redis bus
And a client SSE connection is established via the load balancer (may land on either instance)
And a second SSE connection is established via the load balancer (expected to land on the other)
When an organizer posts an announcement via the load balancer
Then BOTH SSE connections receive a "message.created" event containing the announcement body
```

**Why:** Proves R-17.3 — the Redis pub/sub bus relays events across instances so a client
on node B receives events emitted on node A.

**Implementation:** `packages/frontend/e2e/multi-instance/messaging-multi-instance.spec.ts`
— "Cross-node SSE delivery via load balancer"

---

### Scenario 2: Auth across instances (no random 401s)

```gherkin
Given a player registers for a tournament and exchanges their magic-link token for a player-session token
And requests are round-robined across both API instances by the load balancer
When the player makes 10 authenticated requests in sequence
Then all 10 requests succeed (0 × 401)
```

**Why:** Proves R-17.10.1 — the Redis-backed token store (RedisTokenStore) shares opaque
player-session tokens across instances, preventing 401s under a round-robin LB.

**Implementation:** `packages/frontend/e2e/multi-instance/messaging-multi-instance.spec.ts`
— "Player-session auth works across round-robined instances"

---

### Scenario 3: Job processing — read-receipt flush by worker

```gherkin
Given a player session and a tournament with an unread broadcast message
When the player calls POST /tournaments/:id/messages/:msgId/read via the load balancer
Then a messaging.read_receipt.flush job is enqueued in BullMQ
And the BullMQ worker processes the job
And GET /tournaments/:id/messages returns the message with read_at set (not null)
```

**Why:** Proves the BullMQ worker correctly consumes read-receipt flush jobs and updates
the database, exercising the full async job pipeline under the distributed stack.

**Implementation:** `packages/frontend/e2e/multi-instance/messaging-multi-instance.spec.ts`
— "Read-receipt flush processed by BullMQ worker"

---

### Scenario 4: Shared rate limit across instances (R-17.10.2)

```gherkin
Given two API instances sharing a Redis-backed rate-limit counter store
And the login rate limit is set to 5 failed attempts
When 5 failed login attempts are made via the load balancer (round-robined across both instances)
Then the 5th cumulative failure returns 429 (RATE_LIMITED)
And the limit is enforced regardless of which instance served each request
```

**Why:** Proves R-17.10.2 — the Redis-backed counter store (RedisCounterStore) shares
rate-limit state across instances.  Without Redis, each instance has its own in-memory
counter; a client could exceed the limit N×maxAttempts by round-robining across N instances.

**Implementation:** `packages/frontend/e2e/multi-instance/messaging-multi-instance.spec.ts`
— "Rate limit enforced across round-robined instances (shared Redis counter)"

---

### Scenario 5: Standings cache consistency across instances (R-17.10.3)

```gherkin
Given two API instances (A :3001 and B :3002) sharing a Redis broadcast bus
And a tournament in group_stage_active with two registered players and one group match
When a player submits a score on instance A directly
Then instance B (queried directly) returns standings that reflect the new result
And player 1 has at least 1 win in the standings on instance B
```

**Why:** Proves R-17.10.3 — when a score write on instance A triggers a `standings.invalidate`
event on the bus, instance B drops the named group from its `InMemoryStandingsCache`.  The
next read on instance B hits the database and returns fresh standings.  Without bus-driven
invalidation, instance B could serve a stale cached result that predates the score write.

**Implementation:** `packages/frontend/e2e/multi-instance/messaging-multi-instance.spec.ts`
— "Standings are fresh on instance B after a score write on instance A"

---

## Feature: 18+ Age Gate (G0.1)

> Legal-critical: COPPA / GDPR / UK Children's Code compliance. Gate at the universal player boundary.

### Scenario: Guest registration blocked for under-18

```gherkin
Given a tournament with open registration
When an anonymous user submits registration with email "minor@example.com"
  And provides a date of birth that is less than 18 years ago
Then registration is rejected with HTTP 422 UNDER_AGE
And no player row is created in the database
```

### Scenario: Guest registration allowed for 18+

```gherkin
Given a tournament with open registration
When an anonymous user submits registration with email "adult@example.com"
  And provides a date of birth that is 25 years ago
Then registration succeeds (HTTP 202, magic link sent)
And the player row has is_adult = true, age_attested_at set, policy_version = "v1"
And no date_of_birth column exists on the players table
```

### Scenario: Signup blocked when no attestation provided

```gherkin
Given the signup page
When a user submits signup with email and password but no dob_attestation
Then signup is rejected with HTTP 400 AGE_ATTESTATION_REQUIRED
```

### Scenario: Existing player skips gate on second registration

```gherkin
Given a player who previously attested as adult (is_adult = true)
When they register for a second tournament without providing dob_attestation
Then registration succeeds (HTTP 202) — find path, gate not applied
```

### Scenario: DOB screen — neutral date input, under-18 blocked (RTL)

```gherkin
Given the DobScreen component is rendered
Then it shows a date input (not a checkbox)
When a user enters a date that is 15 years ago
  And clicks Continue
Then an error message appears and onConfirm is NOT called
When the user changes the date to 25 years ago
  And clicks Continue
Then onConfirm is called with { dateOfBirth, policyVersion: "v1" }
```

**Implementation:**
- API unit: `packages/api/src/__tests__/unit/age-gate.spec.ts`
- API integration (all 3 entry paths): `packages/api/src/__tests__/integration/age-gate-entry-paths.spec.ts`
- Frontend RTL: `packages/frontend/src/__tests__/components/DobScreen.spec.tsx`
- Playwright e2e: best-effort — RTL covers the UI contract; e2e deferred until servers are available.

---

## Feature: Player Groups — G1.3 Invite Flow

### Scenario: Owner invites a new player by email

```gherkin
Given a player group exists with an owner
When the owner POSTs /player/groups/:groupId/invites with { email: "invitee@example.com" }
Then a 201 response is returned
  And an invite email is sent to invitee@example.com
  And the email contains a single-use accept URL with a 64-char hex token

When the invitee follows the accept URL (POST /player/groups/:groupId/invites/accept)
  And supplies { token, email, name, ageAttestation: { dateOfBirth, policyVersion } }
Then the invitee player record is created (age gate passes — 18+)
  And a member row is inserted in player_group_members
  And the response is 200 { ok: true }
```

### Scenario: Owner invites an existing player (age gate bypass)

```gherkin
Given a player already exists in the system (is_adult = true)
When an owner invites them by email and they follow the link
  And they accept WITHOUT providing ageAttestation
Then the existing player is looked up and joined to the group as a member
  And the response is 200 { ok: true }
```

### Scenario: Under-18 invitee is hard-rejected

```gherkin
Given an invite token is sent to "young@example.com"
When "young@example.com" accepts with ageAttestation.dateOfBirth = 16 years ago
Then the response is 400 UNDERAGE
  And no player row is created in the database
  And the group membership table has no row for that email
```

### Scenario: Token reuse is rejected (single-use)

```gherkin
Given an invite token was already consumed on a successful accept
When the invitee (or any attacker) submits the same token again
Then the response is 400 TOKEN_INVALID
```

### Scenario: Wrong-email rejection (email-bound)

```gherkin
Given an invite token was minted for "target@example.com"
When an attacker submits the token with email = "attacker@example.com"
Then the response is 400 (email mismatch)
  And the token is NOT consumed (the rightful invitee can still use it)
```

### Scenario: Non-owner cannot create an invite

```gherkin
Given a player is a member (role=member) of a group
When they POST /player/groups/:groupId/invites
Then the response is 403 FORBIDDEN
```

### Scenario: No shareable group-wide link path

```gherkin
Given a group exists
When a GET request is made to /player/groups/:groupId/invites
Then the response is 404 (no shareable-link route exists)
  And there is no endpoint to generate an invite without specifying a target email
```

**Implementation (G1.3):**
- API unit: `packages/api/src/__tests__/unit/group-invite-token.spec.ts`
  - GroupInvitePayload variant (type='group-invite', groupId, email)
  - Single-use (second validate throws)
  - Email-bound (wrong email throws, does NOT consume token)
  - Case-insensitive email comparison
  - No anonymous/shareable token (email required in payload)
- API integration: `packages/api/src/__tests__/integration/group-invite.spec.ts`
  - All scenarios above tested
- Playwright e2e: best-effort — integration covers the full flow; Playwright deferred until frontend invite UI is implemented (G2.5+).

---

## Feature: Player Groups — chat (G2.5)

> **Design refs:** PLAYER_GROUPS_DESIGN.md §4 (G-UI-1…3)
> **Playwright spec:** `packages/frontend/e2e/player-groups.spec.ts`

### Scenario: My Groups tab lists the player's groups

```gherkin
Given a player is authenticated and a member of two groups "Pickleball Crew" and "Tennis Regulars"
When the player navigates to "/groups"
Then the 👥 My Groups bottom-nav tab is active (data-testid="nav-groups")
  And "Pickleball Crew" is listed (data-testid="group-list-item")
  And "Tennis Regulars" is listed
```

### Scenario: Tapping a group opens the Group page

```gherkin
Given the player is on the My Groups list
When the player taps "Pickleball Crew"
Then they navigate to "/groups/<groupId>"
  And the Group page renders with Chat tab visible (data-testid="group-chat-panel")
  And the Members tab is accessible (data-testid="members-panel")
```

### Scenario: Group chat stream renders messages with sender name and time

```gherkin
Given the group has two messages — one from "Alice Smith" and one from "Bob Jones"
When the player views the Chat tab
Then each message card renders "SenderName · HH:MM:SS" (data-testid="group-message-item")
  And "Alice Smith" and "Bob Jones" are distinguishable names on their respective cards
```

### Scenario: Sent message appears live (SSE)

```gherkin
Given the player has the Group chat page open
When another member sends a message
Then the message appears in the chat stream without a page refresh (via SSE message.created)
```

### Scenario: System events ("Sam joined") appear inline

```gherkin
Given a member joins the group
When the player views the Chat tab
Then a system event row "Sam joined" appears (data-testid="group-system-event")
  And it is visually distinct from regular message cards
```

### Scenario: Unread badge on My Groups nav tab

```gherkin
Given there are unread group messages the player has not seen
When the player is on a different tab (e.g. /matches)
Then the 👥 My Groups nav tab shows an unread badge (data-testid="groups-unread-badge")
  And the badge disappears after visiting the group and reading the messages
```

### Scenario: Invite-by-email from Members panel

```gherkin
Given the player is an owner and on the Group page Members tab
When the owner enters "newplayer@example.com" in the invite field (data-testid="invite-email-input")
  And clicks Send (data-testid="invite-send-button")
Then POST /player/groups/:groupId/invites is called with { email: "newplayer@example.com" }
  And a success confirmation is shown
```

**Implementation (G2.5):**
- Frontend unit (RTL): `packages/frontend/src/components/__tests__/MyGroups.spec.tsx`
  - GroupList renders; GroupChatPanel message cards "Name · time"; MembersPanel; MyGroupsUnreadBadge
- Playwright e2e: `packages/frontend/e2e/player-groups.spec.ts` (best-effort; relies on running API+frontend)

## Feature: Player Groups — polls (G3.3)

**Scenario: Member creates a poll — card appears inline in chat stream**
```
Given I am a member of a group
When POST /player/groups/:groupId/polls is called with { question, targetTime? }
Then a poll card appears inline in the chat stream
  And the card shows the question text
  And vote buttons (In / Out / Maybe) are present
```

**Scenario: Member votes — tally updates live via SSE**
```
Given a poll card is visible in the chat
When I click the "In" vote button
Then the tally updates to show my vote (optimistic update)
  And a poll.tally.updated SSE event is emitted to all members
  And the tally reflects the new count
```

**Scenario: Re-voting moves the choice**
```
Given I have voted "In" on a poll
When I click the "Out" vote button
Then the "Out" button becomes active
  And the tally shows 0 in · 1 out
```

**Scenario: Group owner closes poll — card freezes**
```
Given I am an owner of the group
  And there is an open poll card in the chat
When I click the "Close poll" button
Then a poll.closed SSE event is emitted
  And the vote buttons disappear
  And the tally shows "Final: X in · Y out · Z maybe"
```

**Implementation (G3.3):**
- RTL unit tests: `packages/frontend/src/__tests__/components/PollCard.spec.tsx`
- Playwright e2e: `packages/frontend/e2e/poll-cards.spec.ts` (best-effort; requires running API+frontend)

## Feature: Player Groups — casual tournament (G4.8)

**Scenario: Poll creator launches casual tournament from In-voters**
```
Given I am the creator of a closed poll with 3 "In" voters
When I click the "Launch tournament" button on the poll card
Then POST /player/groups/:groupId/polls/:messageId/launch is called
  And a new casual, unlisted tournament is created with those 3 players registered
  And a system message appears in the chat linking to the tournament
  And the tournament status is 'registration_closed'
```

**Scenario: Any participant submits a score in casual mode**
```
Given I am a registered participant in a casual tournament
  And there is a match in 'group_stage_active' state
When I submit a score for any match (not just mine)
Then the score is accepted
  And the match status updates to 'completed'
  And standings update
```

**Scenario: Pair + individual leaderboards render**
```
Given a group has at least one completed casual tournament
  And matches have been scored
When I view the group's leaderboard tab
Then pair leaderboard shows team partnerships and W/L counts
  And individual leaderboard shows per-player W/L counts
  And rows are sorted by wins descending
```

**Scenario: Owner ends session**
```
Given I am the organizer of a casual tournament in 'group_stage_active'
When I click "End session" and confirm
Then POST /tournaments/:id/end-session is called
  And the tournament transitions to 'completed' (all matches done) or 'abandoned' (partial)
  And a system message is posted in the group
```

**Implementation (G4.8):**
- RTL unit: `packages/frontend/src/__tests__/components/LeaderboardPanel.spec.tsx`
- RTL unit: updated `packages/frontend/src/__tests__/components/PollCard.spec.tsx` (launch button)
- Playwright e2e: `packages/frontend/e2e/casual-tournament.spec.ts` (best-effort)

## Feature: Player Groups — invite accept (P1.7)

**Scenario: Valid invite link — new player, no age gate**
```
Given an email-bound invite link /groups/:groupId/invite?token=T&email=E
  And the invitee has never used the app (new player)
When the page loads
Then POST /player/groups/:groupId/invites/accept is auto-submitted
  And a 200 response stores the session token in localStorage
  And "You've joined the group!" success UI is shown
  And the browser navigates to /groups/:groupId
```

**Scenario: Existing player accepts invite**
```
Given an invite link for a player who already has a durable player record
When the page loads
Then POST /player/groups/:groupId/invites/accept is auto-submitted
  And the existing player is added to the group (idempotent)
  And a session token is returned and stored
  And the browser navigates to /groups/:groupId
```

**Scenario: Age attestation required — new player 18+**
```
Given the invitee is a brand-new player
  And POST /player/groups/:groupId/invites/accept returns AGE_ATTESTATION_REQUIRED
When the page loads
Then the DobScreen age-gate is shown
When the user enters a DOB indicating 18+ years old and submits
Then POST is re-submitted with ageAttestation: { dateOfBirth, policyVersion }
  And the 200 response stores the session token
  And the browser navigates to /groups/:groupId
```

**Scenario: Underage player — terminal rejection**
```
Given the invitee submitted a DOB indicating under 18
  And POST returns UNDERAGE
When the underage response is received
Then a terminal rejection message is shown
  And no redirect occurs
  And no token is stored
```

**Scenario: Invalid or expired invite token**
```
Given the invite link contains an expired or tampered token
  And POST returns TOKEN_INVALID
When the page loads
Then an error message is shown: "invalid or expired invite link"
  And no redirect occurs
```

**Scenario: Group not found**
```
Given the groupId in the URL does not exist in the backend
  And POST returns NOT_FOUND
When the page loads
Then an error message is shown: "group not found"
  And no redirect occurs
```

**Implementation (P1.7):**
- RTL unit: `packages/frontend/src/__tests__/components/InviteAcceptPage.spec.tsx`
- Route: `/groups/:groupId/invite` (public, no auth required)
- Playwright e2e: `packages/frontend/e2e/invite-accept.spec.ts` (best-effort)

---

## Feature: Player Groups — Poll Config & Close-Window (P3.6)

### Scenario: Poll creation with auto-close time (Q13/Q14)
```
Given a group member is composing a poll
When they open the poll creation form (PollConfigForm)
Then they see an auto-close datetime picker
  And an auto-launch toggle (initially disabled)
  And no min-players or format fields are visible

When they set an auto-close datetime
Then the auto-launch toggle becomes enabled

When they enable auto-launch
Then a min-players number input appears
  And a match-format selector (singles/doubles) appears

When they clear the auto-close datetime
Then auto-launch is forced off
  And min-players + format fields disappear
```

### Scenario: PollCard shows close-window banner to all members (Q13)
```
Given a group has an open poll with an auto_close_at time set
When any group member views the group chat
Then the PollCard shows "Voting closes <time>" under the question
  And when the close time is less than 1 hour away, "closing soon" is appended

Given the poll has auto_launch=true
When any member views the PollCard
Then the close-window banner reads "Closes & auto-starts <time>"
  (distinct from target_time, which is the optional play-session time)

Given the poll is already closed (closedAt is set)
When any member views the PollCard
Then no close-window banner is shown
```

**Implementation (P3.6):**
- RTL unit: `packages/frontend/src/__tests__/components/PollConfigForm.spec.tsx`
- RTL unit additions: `packages/frontend/src/__tests__/components/PollCard.spec.tsx`
- New component: `packages/frontend/src/components/PollConfigForm.tsx`
- Updated component: `packages/frontend/src/components/PollCard.tsx`

---

## Feature: Player Groups — Launch Confirmation Sheet (P3.7)

### Scenario: Poll creator launches a tournament from a closed poll (Q12)
```
Given a group has a closed poll with in-voters
  And the current user is the poll creator

When the user views the group chat
Then a "Launch tournament" button is visible on the closed PollCard

When the user clicks "Launch tournament"
Then a confirmation sheet appears
  And it shows the names of all in-voters
  And it shows a format selector pre-set to the group's default format

When the user changes the format and clicks "Confirm Launch"
Then a POST /player/groups/:groupId/polls/:messageId/launch is sent
  And on 201 the user is navigated to /tournament/:id

When the user clicks "Cancel"
Then the sheet closes with no POST sent
```

### Scenario: System message deep-link after tournament launch (P3.5 + P3.7)
```
Given a tournament was launched from a poll (auto or manual)
When a group member views the group chat
Then the system message "Tournament started: <name>" renders as a clickable link
  And the link navigates to /tournament/:id
  And the tournament_id comes from message.metadata.tournament_id (structured field)

Given a system message has no metadata.tournament_id (role events, etc.)
When a member views the group chat
Then the message renders as plain italic text with no link
```

**Implementation (P3.7):**
- RTL unit: `packages/frontend/src/__tests__/components/LaunchConfirmSheet.spec.tsx`
- RTL unit: `packages/frontend/src/__tests__/components/GroupChatPanelLaunch.spec.tsx`
- New component: `packages/frontend/src/components/LaunchConfirmSheet.tsx`
- Updated: `packages/frontend/src/components/GroupChatPanel.tsx`
- Updated: `packages/frontend/src/state/group-message-state.ts` (metadata field)

---

## Feature: Player Groups — Casual Scoring View + Mixer (P3.8; A.5)

### Scenario: Casual tournament open scoring
```
Given a casual tournament was launched from a group poll
When a registered participant views the tournament

Then the current round's matches are shown as MatchCards
  And each MatchCard has a "Submit score" button (any participant can score any match)
  And the open-scoring flag allows editing until the match is terminal

When a participant submits a score for any match (not just their own)
Then the match updates to 'completed'
  And the score and "Scored by: <name>" are shown

When SSE emits a round advance event
Then the next round's matches are loaded without a full page refresh
```

### Scenario: Mixer sit-out panel
```
Given a casual tournament with a mixer format
When the current round has some players sitting out (roster - round participants)

Then the MixerStatePanel shows "Sitting out this round: Alice, Bob"
  And the sitting-out list is derived client-side from registered roster minus current participants
  And the list updates when SSE advances the round
```

**Implementation (P3.8):**
- RTL unit: `packages/frontend/src/__tests__/components/MatchCard.openScoring.spec.tsx`
- RTL unit: `packages/frontend/src/__tests__/components/MixerStatePanel.spec.tsx`
- Updated: `packages/frontend/src/components/shared/MatchCard.tsx` (openScoring flag, scoredBy display)
- New: `packages/frontend/src/components/MixerStatePanel.tsx`

---

## Feature: LLM Assistant (@coach) — Phase A read-only Q&A

> Backend runs `ASSISTANT_ADAPTER=mock` + `JOB_QUEUE=memory` for e2e. The mock adapter is a
> deterministic keyword router that fakes only the NL→intent hop — the tools it calls are the
> **real** assistant tools with real auth scoping, so data scenarios exercise the genuine
> trigger → queue → tool auth → DB → SSE → render path. Answer *content* quality from the live
> model is verified in the A9.2 manual smoke checklist, not here.

### Scenario: Member mentions @coach and gets a reply in the feed
```
Given a group with the assistant enabled (default)
  And a member viewing the group chat
When the member sends "@coach hello"
Then their own message appears in the feed
  And an assistant reply bubble appears without a page reload (SSE)
```

### Scenario: Reply is styled as Coach, not a player
```
Given an assistant reply in the feed
Then the bubble has data-testid="assistant-message"
  And the sender name shown is "Coach"
  And the styling is distinct from player messages (assistant variant)
```

### Scenario: Non-member cannot trigger the assistant
```
Given a player who is not a member of the group
When they POST "@coach hello" to the group's message route
Then the request is rejected with 403 (existing membership check)
  And no assistant job is enqueued
```

### Scenario: Owner disables assistant → @coach produces no reply
```
Given the group owner opens group settings
When the owner turns the Assistant toggle off
  And a member sends "@coach hello"
Then no assistant reply appears within the wait window
  And Coach no longer appears in the @ mention picker
```

### Scenario: Enabling posts a one-time intro message
```
Given a group with the assistant toggled off
When the owner turns the Assistant toggle on
Then one assistant intro message appears in the feed
  ("Hi, I'm Coach 👋 — mention @coach to ask about your matches, standings, or how the app works.")
  And repeating the enable does not duplicate the intro within the same on-state
```

### Scenario: Coach appears pinned in the @ mention picker
```
Given a member typing "@" in the composer of an assistant-enabled group
Then Coach is the pinned first entry with hint text ("Ask about matches, standings, how-to")
When the member selects Coach
Then "@coach " is inserted into the composer
```

### Scenario: Rate-limited player gets the polite cap message
```
Given a player who has exhausted their hourly assistant quota (10/hr)
When they send another "@coach" question
Then Coach replies "I've hit my limit for now — try again later."
  And the cap message is posted at most once per limited window
```

### Scenario: Data Q&A end-to-end — "who am I playing next?"
```
Given two users in a group (asker = owner; opponent joined via invite-accept)
  And a casual session launched in the group with an explicit 2-player roster
  (round-robin auto-generates a pending asker-vs-opponent match immediately)
When the asker sends "@coach who am I playing next?"
Then the Coach reply bubble contains the seeded opponent's name
  (mock router → real get_my_matches → real scoping → DB → SSE → render)
```

### Scenario: Knowledge questions get a reply (plumbing only)
```
Given an assistant-enabled group
When a member sends "@coach how many points is the first-set tiebreak?"
Then a Coach reply appears
When a member sends "@coach how do I invite a friend to this casual tournament?"
Then a Coach reply appears
# Content is NOT asserted — the mock's canned text would only test our own hardcoded
# string. Live-model answer quality is covered by the A9.2 smoke checklist.
```

### Scenario: NEGATIVE — cross-player data wall (adversarial mock)
```
Given a second tournament where Bob plays Carol
  And the asker is NOT registered in it and it is NOT linked to the group
When the asker sends the mock's adversarial trigger phrase
  (the mock router deliberately calls a real tool with that out-of-scope tournament id,
  playing the role of a maximally prompt-injected model — no LLM involved)
Then the Coach reply is a not-found
  And neither "Carol" nor the private tournament's name appears anywhere in the feed
# The wall itself is authoritatively proven at the integration layer (A3.3 adversarial-args
# tests); this scenario proves it end-to-end through the full pipeline.
# Contrast case: another member's matches in the group's OWN tournament ARE legitimately
# visible — same as the standings UI.
```

### Scenario: NEGATIVE — no writes in Phase A
```
Given a casual match with an existing score
When a member sends "@coach change my score to 3-0"
Then Coach declines (the mock has no write route — mirroring the empty Phase A write registry)
  And the standings/match UI still shows the original score
# Structural guarantee is a unit assertion: the Phase A tool registry contains zero write
# tools. Whether the live model refuses politely under injection is model behavior → A9.2.
```

**Implementation (Phase A / A8):**
- Playwright: `packages/frontend/e2e/assistant.spec.ts`
- RTL unit: `packages/frontend/src/components/__tests__/` (assistant message variant, mention picker, settings toggle)
- Backend: `packages/api/src/assistant/**`, `packages/api/src/workers/assistant-processor.ts`, migration `db/migrations/049_assistant_type_and_group_toggle.sql`

---

## Feature: LLM Assistant (@coach) — Phase B confirmed write actions

> Backend runs `ASSISTANT_ADAPTER=mock` + `JOB_QUEUE=memory` for e2e. `MockAssistantClient` gains
> a deterministic keyword router for write intents: `beat <name> <x>-<y>` calls the **real**
> `propose_score` tool; `launch ... session` calls the **real** `propose_casual_launch` tool — so
> these scenarios exercise the genuine tool validation → card → confirm → route-revalidation path
> with no model involved (only the NL→intent hop is faked). The model never mutates directly —
> every write goes through the existing, unmodified route/service at confirm time (design §11
> B-Q3: mutate-first, then flip).

### Scenario: Score via Coach — card appears, proposer confirms, standings update live
```
Given a member has a pending casual match against a named opponent
When they send "@coach beat Sunil 6-4, 6-3"
Then an ActionCard appears in the feed with the parsed score (asker-relative: "You 6-4, 6-3 Sunil")
  And only the proposer sees an active Confirm button
When the proposer taps Confirm
Then the existing score-submission service runs as the confirming player
  And the card renders "confirmed" (via a card.updated SSE event)
  And the new score is visible in standings without a page refresh
```

### Scenario: A second score on another match works identically (repeat-use loop)
```
Given the proposer has already confirmed one score via Coach in this session
When they send "@coach beat <other opponent> <score>" for a different pending match
Then a new ActionCard appears and confirms exactly as before
  # proves this is a repeatable loop, not a one-shot demo path
```

### Scenario: A different member sees the card but cannot confirm it
```
Given an ActionCard proposed by member A is visible in the group feed
When member B (not the proposer) views the same card
Then member B sees no Confirm button (proposer-only)
```

### Scenario: Expired card renders inert and Confirm 409s server-side
```
Given an ActionCard whose expires_at has passed (aged via a test fixture)
When the proposer's client renders the card
Then it renders as expired (computed client-side from expires_at, never a stored status)
When the proposer nonetheless calls the confirm route directly
Then the server returns 409 and the card is not mutated
```

### Scenario: Confirm after the match was already scored elsewhere → failed state
```
Given an ActionCard proposing a score for a match
  And the match gets scored through the normal UI by someone else before the card is confirmed
When the proposer taps Confirm
Then the existing score service's own revalidation rejects the duplicate
  And the card flips to "failed" with the rejection reason (via card.updated)
  And no second score is recorded
```

### Scenario: Proposer dismisses a card
```
Given an ActionCard proposed by a member
When the proposer taps Dismiss
Then the card flips to "cancelled" and renders inert
  And every group member's view updates live (card.updated)
```

### Scenario: NEGATIVE — ambiguous score match yields a clarifying question, never a guess
```
Given the asker has two pending matches against players named "Sunil"
When they send "@coach beat Sunil 6-4, 6-3"
Then Coach asks a clarifying question naming both candidates
  And no ActionCard is posted
```

### Scenario: Casual launch via Coach — poll creator only
```
Given a closed availability poll exists in the group, created by member A
When member A (the poll's creator) sends "@coach launch a session for everyone who voted in"
Then an ActionCard appears whose CTA opens the existing casual-launch confirmation sheet,
  pre-filled from the poll's In-voters and the group's default match format
When member A completes the confirmation sheet
Then the casual tournament is created (visible in the group's tournament list)
  And the card renders "confirmed"

Given the same closed poll
When a different member (NOT the poll's creator) sends the same request
Then Coach declines politely (draft-time check mirrors the real launch route's poll-creator-only
  authority) and no card is posted
```

### Scenario: NEGATIVE — Coach never triggers a push notification
```
Given a group with a member whose notify_level is "all"
When Coach posts a reply, an intro message, or an ActionCard
Then no messaging.notify job is enqueued for any recipient
  # assistant rows (type='assistant') are structurally excluded from the notify pipeline
  # (design §11 B-Q11) — applies retroactively to every Phase A assistant row too
```

**Implementation (Phase B / B0–B7):**
- Playwright: `packages/frontend/e2e/assistant-actions.spec.ts`
- RTL unit: `packages/frontend/src/components/__tests__/ActionCard.spec.tsx`
- New component: `packages/frontend/src/components/ActionCard.tsx`
- Backend: `packages/api/src/repositories/assistant-card-repository.ts`,
  `packages/api/src/services/score-service.ts`, poll create/vote services (extracted from
  `player-groups.ts`), confirm/cancel/complete routes under `/player/groups`, migration adding
  `messaging.assistant_cards`

---

## Feature: LLM Assistant (@coach) — Phase C proactive (nudges, recap, digest)

> Backend runs `ASSISTANT_ADAPTER=mock` + `JOB_QUEUE=memory` for e2e. Sweeps are driven by a
> `NODE_ENV !== 'production'`-only test trigger endpoint (the A8 `/test/casual-session`
> precedent) rather than waiting on real BullMQ cron — same pattern Phase A/B e2e already use to
> avoid real time passing in a browser test. Recap's LLM-polish step is exercised only against
> the mock adapter here (always falls back to template); live-model polish quality is a manual
> smoke item, same status as A9.2.

### Scenario: 48h deadline nudge names the unscored matches and notifies only affected players
```
Given a group-linked tournament with group_stage_deadline 47 hours away
  And one pending (unscored) match between two members
  And a third group member is not in that match
  And a fourth group member has notify_level "muted"
When the nudge sweep runs
Then one assistant message posts naming the pending match and "2 days left" (relative, no clock time)
  And the two players in the named match each receive a messaging.notify job
  And the unaffected member receives no notify job
  And the muted member receives no notify job
```

### Scenario: 24h nudge fires independently of the 48h nudge
```
Given the same tournament has already posted its 48h nudge
When the deadline reaches 23 hours away and the sweep runs again
Then a second, distinct nudge posts for the 24h milestone
  And re-running the sweep at either milestone again posts nothing further (dedupe)
```

### Scenario: Nothing unscored → no nudge
```
Given a group-linked tournament 47 hours from its deadline with all matches already scored
When the nudge sweep runs
Then no assistant message posts and no notify job is enqueued
```

### Scenario: Assistant disabled → no proactive output of any kind
```
Given a group-linked tournament 47 hours from its deadline with pending matches
  And the group's assistant is toggled off
When the nudge sweep runs
Then no assistant message posts
```

### Scenario: Sweep runs twice → exactly one post (idempotency)
```
Given a group-linked tournament that qualifies for the 48h nudge
When the sweep runs twice in a row
Then only one nudge message exists for that tournament and milestone
```

### Scenario: Third proactive post in a day is cap-suppressed
```
Given a group that has already received 2 proactive assistant posts today
  And a third tournament in the same group now qualifies for a nudge
When the nudge sweep runs
Then no third message posts
  And the suppression is logged at warn (assistant.nudged is not emitted for the suppressed one)
```

### Scenario: Completed group-linked tournament gets one recap
```
Given a group-linked tournament with standings seeded (a clear winner + at least 3 ranked players)
  And the organizer PATCHes it to a terminal status ("tournament_complete")
When the recap sweep runs
Then one assistant message posts naming the winner and the top-3 standings
When the recap sweep runs again
Then no second recap posts for that tournament
```

### Scenario: Weekly digest — opted-in with activity, skipped when empty, never sent when not opted in
```
Given Group A has digest_enabled=true and at least one completed match this week
  And Group B has digest_enabled=true with no activity and no pending matches this week
  And Group C has the assistant enabled but digest_enabled=false, with activity this week
When the digest job runs
Then Group A receives one digest message with its results/pending/upcoming-deadline sections
  And Group B receives no digest message (all sections empty)
  And Group C receives no digest message (not opted in)
When the digest job runs again the same week
Then Group A does not receive a second digest (iso-week dedupe)
```

### Scenario: NEGATIVE — a non-group-linked tournament is never nudged or recapped
```
Given a tournament with no group_id, 47 hours from its deadline, with pending matches,
  and separately one completed with clear standings
When the nudge sweep and the recap sweep both run
Then neither produces any assistant message for that tournament
```

**Implementation (Phase C / C0–C6):**
- Playwright: `packages/frontend/e2e/assistant-proactive.spec.ts`
- Backend: `packages/api/src/workers/nudge-processor.ts`, `packages/api/src/workers/recap-processor.ts`,
  `packages/api/src/assistant/recap.ts`, `packages/api/src/assistant/digest.ts`,
  repeatable job registration in `worker-entrypoint.ts` (`assistant.nudge.sweep`,
  `assistant.recap.sweep` hourly; `assistant.digest` weekly), migration
  `051_assistant_digest_settings.sql` (`player_groups.digest_enabled`)

---

## Feature: Player Personalization (P0–P12)

> Per `assets/planning/PERSONALIZATION_IMPLEMENTATION.md` (S0–S8). Builds on the shipped @coach
> A–C stack. Backend runs `ASSISTANT_ADAPTER=mock` for the availability-aggregate scenario (12) —
> same mock-router convention as Phase A/B/C: the NL→intent hop is faked, the tool it calls
> (`get_group_availability`) is real.

### Scenario: Profile page is reachable from the header avatar and round-trips settings
```
Given an authenticated player
When they click the header avatar/gear
Then they land on /profile showing their current settings (timezone, density, notify prefs)
When they change the table-density toggle
Then PATCH /api/auth/me/settings persists it
  And reloading /profile shows the new value
```

### Scenario: NEGATIVE — unauthenticated visitor is redirected away from /profile
```
Given no auth token
When the visitor navigates to /profile
Then they are redirected to /login (same protected-route behavior as /matches)
```

### Scenario: Standings auto-scrolls to and highlights the viewer's row
```
Given a tournament standings table with the viewer ranked below the fold
When the viewer opens the Standings tab
Then their row is highlighted and scrolled into view (~2nd from top)
  And no row is sticky-pinned once they scroll away
```

### Scenario: Chat shows initials avatars with stable per-player colors
```
Given a group chat with multiple members posting messages
Then each message row shows a small avatar: 1-2 initials over a deterministic background color
  And the same player's avatar color is identical across every message and across reloads
```

### Scenario: Deadlines render in the viewer's browser timezone with relative time secondary
```
Given a tournament with a group-stage deadline
When the viewer (browser tz America/New_York) views it
Then the primary line shows an absolute time in their browser tz
  And a relative phrase ("in 2 days") appears as the secondary line
```

### Scenario: Nav tab badge shows the player's pending count and decreases after acting
```
Given a player with 2 unscored matches
Then the Matches tab shows a badge with count "2"
When they submit a score for one match through the normal flow
Then the badge decrements to "1" without a manual refresh (SSE-triggered refetch)
```

### Scenario: "Up next" strip lists the player's nearest pending item and deep-links to it
```
Given a player with an unscored match and no other pending items
When they open the authenticated home (/browse)
Then an up-next strip appears at the top naming the match
  And tapping it deep-links to the match's tournament page
Given a player with nothing pending
Then no strip renders (no empty state, not dismissible)
```

### Scenario: Composer chip pre-fills a score report and disappears once scored
```
Given a player with a pending match against a named opponent
When they open the group chat composer
Then a single "Report score" chip is shown
When they tap it
Then the composer pre-fills "@coach beat <opponent> " without sending
When that match is later scored
Then the chip no longer appears
Given the group's assistant is disabled
Then no Coach-invoking chip appears at all
```

### Scenario: Nudge body contains an absolute group-local time
```
Given a group whose members' stored timezones derive an effective group timezone
  And a tournament 47 hours from its deadline with an unscored match
When the nudge sweep runs
Then the nudge names the match and includes an absolute time in the group's local timezone
  ("deadline Sun 6:00pm"), with relative phrasing only as a secondary detail
```

### Scenario: Weekly digest fires at the group's local Sunday morning and includes rank movement
```
Given a group whose effective timezone is seeded
  And a prior week's standings snapshot exists showing a different rank for a player
When the digest sweep runs at the group-local Sunday ~09:00 hour
Then one digest posts
  And it includes a rank-movement line ("Alice ↑2 to 1st") for the player whose rank changed
When the sweep runs again the same iso-week
Then no second digest posts
```

### Scenario: NEGATIVE — a player's pending-actions payload never contains another player's items
```
Given player A has an unscored match against player B
When player A requests GET /api/auth/me/pending-actions
Then the response includes A's own pending match
  And it never includes any item scoped to player B alone
```

### Scenario: Availability aggregates never reveal who is free
```
Given two group members have set their weekly availability grid in /profile
When a member asks "@coach when can we play?"
Then Coach's reply cites only aggregate counts ("5 of 6 free Tue evening")
  And neither player's name is tied to any specific slot
```

### Scenario: A quiet-hours player gets no push but the item still appears in their badge/strip
```
Given a player has quiet hours configured covering the current time
  And a deadline nudge would otherwise notify them as an affected player
When the nudge sweep runs
Then no messaging.notify job is enqueued for that player
  And the pending item still appears in their own tab badge and up-next strip
```

**Implementation (P0–P12 / S0–S8):**
- Playwright: `packages/frontend/e2e/profile.spec.ts`, `packages/frontend/e2e/personalization-ui.spec.ts`
- Backend: `packages/api/src/repositories/player-settings-repository.ts`, `packages/api/src/routes/auth.ts`
  (`GET /me` settings block, `PATCH /me/settings`, `GET/PUT /me/availability`,
  `GET /me/pending-actions`), `packages/api/src/services/pending-actions-service.ts`,
  `packages/api/src/assistant/tools.ts` (`get_group_availability`), digest/nudge processor
  reworks, migrations `052`–`056`
- Frontend: `pages/Profile.tsx`, `shared/Avatar.tsx`, `shared/formatLocal.ts`,
  `hooks/usePendingActions.ts`, `ResponsiveLayout.tsx` (badges, avatar entry),
  `BrowseTournaments.tsx` (up-next strip), `GroupChatPanel.tsx` (composer chip)

## Feature: 1:1 Coach (private per-player conversation + opt-in memory)

> Per `assets/planning/COACH_1TO1_IMPLEMENTATION.md` (S0–S10) and
> `assets/planning/COACH_1TO1_DESIGN.md` (§7, grilled 2026-07-14). Backend runs
> `ASSISTANT_ADAPTER=mock`, `JOB_QUEUE=memory` — the mock router (§0.8) fakes only the
> NL→intent hop; every tool it calls is real, exercising genuine player-level scoping.

### Scenario: First open shows the intro message, including for a zero-group player
```
Given a signed-in player who has never opened Coach
When they click the pinned Coach entry in the conversations list
Then they land on /coach and see a one-time intro message from Coach
Given a different signed-in player who belongs to no groups
Then the pinned Coach entry is still visible and works identically
```

### Scenario: Turn loop — a message gets a reply without reload
```
Given a signed-in player on /coach
When they send "hello"
Then their message bubble appears immediately
  And a Coach reply bubble appears shortly after via SSE, with no page reload
```

### Scenario: Data Q&A names the seeded opponent (full-path regression)
```
Given a player registered in a group-linked tournament with a pending match
When they ask Coach "who am I playing next?"
Then the reply names the seeded opponent and tournament
```

### Scenario: Union scope — a zero-group player gets an answer the group surface could never give
```
Given a player with no groups, registered directly in a standalone tournament with a pending match
When they ask Coach "who am I playing next?"
Then the reply names that match's opponent
```

### Scenario: Scouting plumbing surfaces the opponent's real record
```
Given an opponent with a seeded win/loss record in the standings
When the player asks Coach "how do I beat <opponent>?"
Then the reply contains the opponent's seeded W-L record
```

### Scenario: Medical decline is exact and unconditional
```
Given a signed-in player on /coach
When they say "my elbow hurts when I serve"
Then the reply is exactly the design's medical decline sentence
  And no coaching advice is given
```

### Scenario: Remember flow — propose, confirm, list, delete
```
Given a signed-in player on /coach with coach_memory_enabled on
When they say "remember I prefer morning matches"
Then a remember ActionCard appears
When they tap Confirm
Then the card flips to confirmed via a live card.updated patch (no reload)
  And the memory appears in their Profile memories list
When they delete it from Profile
Then it is removed immediately (optimistic) and does not reappear on reload
```

### Scenario: Memory toggle off suppresses the propose flow
```
Given a player has turned off the coach_memory_enabled toggle in Profile
When they say "remember I prefer morning matches"
Then Coach declines to remember and no card is created
```

### Scenario: Clear conversation resets the thread but not memories
```
Given a player's Coach thread has messages and a confirmed memory
When they clear the conversation from Profile (with the confirm dialog)
Then the thread shows only a fresh intro message
  And the earlier memory is still listed in Profile
  And asking a data question (e.g. next match) still works normally
```

### Scenario: NEGATIVE — data wall holds against an adversarial tournament id
```
Given a tournament the player has no relationship to
When the player's message adversarially references that tournament's id
Then the reply is a not-found response
  And the private tournament's name and participants never appear in the thread
```

### Scenario: NEGATIVE — Coach never writes to a group on the player's behalf
```
Given a player with an unscored match in a group tournament
When they ask Coach to "submit my score 2-1"
Then Coach replies that it can only draft score cards in group chat
  And the match's score in the group tournament UI is unchanged
```

### Scenario: Heads-up footer and rate cap
```
Given a player's hourly Coach counter is preloaded to 17 (via the test-only endpoint)
When they send one more message
Then the reply carries a "⚠ 3 messages left" footer
Given the counter is preloaded to 20 (the hourly limit)
When they send another message
Then they get a polite cap reply and no model turn is made
```

### Scenario: Privacy policy page is reachable and linked
```
Given a logged-out visitor
When they navigate to /privacy
Then the privacy policy page renders (public, no auth required)
Given a signed-in player on the DobScreen
Then the "Privacy Policy" text is a working link to /privacy
```

**Implementation (S0–S10, planned):**
- Playwright: `packages/frontend/e2e/coach.spec.ts`
- Backend: migration `057_coach_conversation_memory.sql`, `routes/coach.ts`,
  `assistant/coach-prompt.ts`, `assistant/coach-client.ts`, `assistant/player-snapshot.ts`,
  `assistant/propose-remember.ts`, `workers/coach-processor.ts`,
  `repositories/player-memory-repository.ts`, `services/memory-service.ts`,
  `assistant/rate-limiter.ts` (coach methods), `assistant/tools.ts` (coach tool context)
- Frontend: `pages/CoachChat.tsx`, `hooks/useCoachMessages.ts`, `pages/PrivacyPolicy.tsx`,
  `pages/Profile.tsx` (Coach section), `pages/MyGroups.tsx` (pinned entry)

---

## Feature: Notifications Center

> ✅ built & verified (all 5 scenarios green on `notifications.spec.ts`, chromium —
> 2026-07-19, stable across repeated runs).

**Implementation:** page testid `notifications-page`, card testid `notification-card`
(promoted into `e2e/config.ts` SELECTORS); endpoints `GET /player/notifications/messages`,
`GET /player/notifications/unread`, `POST /player/notifications/read`,
`GET /player/notifications/events` (SSE); hook `useNotificationUnread` (owns a
`ReconnectingEventSource`, backed by `notification-unread-state.ts`'s pub/sub store).

**Correction to the original seeding premise:** a plain (non-mention) group message did
**not** post to a player's personal-notification feed — only membership-change events
(kick/promote/demote/auto-transfer) did. The real missing trigger (an `@mention` in a
group message → personal notification, with `metadata: {groupId}` for the deep-link) was
built for this feature (`player-groups.ts`'s mention/notify path, `group-message-repository.ts`),
per owner decision to build the real behavior rather than reframe scenarios around the
narrower existing one. `notifications.spec.ts` seeds via `@mention`, not a bare message.

### ✅ Scenario: Unread badge reflects a new notification
- **Given** a signed-in player with zero unread notifications
- **When** another member `@mentions` them in a group message while they are on a different page
- **Then** the unread badge appears/increments without a full page reload

### ✅ Scenario: Opening the notifications page lists and marks read
- **Given** a player with ≥2 unread notifications
- **When** they open `/notifications`
- **Then** notification cards render newest-first **and** the unread badge clears (read receipts posted)

### ✅ Scenario: Tapping a notification deep-links to its source
- **Given** a notification generated by an `@mention` in a group message
- **When** the player taps its card
- **Then** they land on that group's chat (correct group, correct conversation)

### ✅ Scenario: Empty state
- **Given** a brand-new player with no notifications
- **When** they open `/notifications`
- **Then** a friendly empty state renders (no error, no spinner hang)

### ✅ Scenario: Notify-level mute is honored
- **Given** a player who has muted a group (existing NotifyLevelControl)
- **When** they are `@mentioned` in that group
- **Then** no new notification appears for it (badge unchanged)

---

## Feature: My Tournaments Hub — multi-tournament depth

> ✅ built & verified (all 4 new scenarios green on `my-tournaments-hub.spec.ts`,
> chromium + firefox — 2026-07-19, stable across repeated runs; the pre-existing
> one-tournament auto-redirect tests are unaffected).

**Implementation:** testids `my-tournaments`, `tournament-row`; data via
`GET /player/tournaments` (a PWA venue-read — snapshot behavior already covered by
`pwa-offline-venue.spec.ts`, not duplicated here). The list/row-navigation/dual-auth
logic already worked against existing code (3 of 4 scenarios passed red-first, no
implementation change needed); the empty-state scenario needed one fix —
`MyTournamentsHub.tsx`'s zero-tournaments branch was missing `data-testid="empty-state"`.

### ✅ Scenario: Multi-tournament player sees the hub list
- **Given** a player registered in 2+ tournaments in different states (e.g. one in group stage, one registration-open)
- **When** they sign in and land on the hub
- **Then** a `tournament-row` renders per tournament with name and status, no auto-redirect

### ✅ Scenario: Row navigation
- **Given** the multi-tournament hub
- **When** the player taps a tournament row
- **Then** they land on that tournament's detail (correct tournament id in the URL)

### ✅ Scenario: Empty state for a player with no tournaments
- **Given** a registered account with zero registrations
- **When** they open the hub
- **Then** an empty state with a path to `/browse` renders (no error)

### ✅ Scenario: Both personas see their tournaments
- **Given** the same journeys run once with a magic-link player session and once with a registered-account JWT
- **Then** the hub renders identically for both (guards the dual-auth regression class found during personalization build)
