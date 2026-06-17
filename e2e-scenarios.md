# E2E Test Scenarios

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
| **My Tournaments hub (/standings)** | 1 | `my-tournaments-hub.spec.ts` | `npx playwright test my-tournaments-hub` |
| **Group Stage - Singles** | 10 | `group-stage-singles.spec.ts` | `npx playwright test --grep "Group Stage Singles"` |
| **Group Stage - Singles (Player view)** | 2 | `group-stage-singles-player.spec.ts` | `npx playwright test group-stage-singles-player` |
| **Group Stage - Singles (Score submission)** | 4 | `group-stage-singles-score.spec.ts` | `npx playwright test group-stage-singles-score` |
| **Group Stage - Doubles** | 4 | `group-stage-doubles.spec.ts` | `npx playwright test --grep "Group Stage Doubles"` |
| **Group Stage - Doubles (Score submission)** | 2 | `group-stage-doubles-score.spec.ts` | `npx playwright test group-stage-doubles-score` |
| **Partner Confirmation** | 5 | `partner-confirmation.spec.ts` | `npx playwright test --grep "Partner Confirmation"` |
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
  
⏳ **Phase 5: Partner Confirmation** (5 scenarios) — Ready to implement  
  - Use fixture: `createTournamentWithOpenRegistration()`
  
⏳ **Phases 6-10: Bracket, Real-Time, Offline, Mobile, Accessibility** (22 scenarios) — Ready to implement  
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

## Feature: Partner Selection & Confirmation (Doubles)

### Scenario: User selects existing partner during doubles registration
- **Type:** Happy path
- **Given** I am registering for a doubles tournament
- **When** I fill in my email and name
- **And** I see partner selection options
- **And** I select "Select from existing players"
- **And** I choose a partner from the dropdown
- **And** I click [Register]
- **Then** I should see success message

### Scenario: User invites new partner via email during doubles registration
- **Type:** Happy path
- **Given** I am registering for a doubles tournament
- **When** I fill in my email and name
- **And** I select "Invite by email"
- **And** I fill in partner email "partner@example.com"
- **And** I click [Register]
- **Then** I should see success message
- **And** partner should receive invitation email

### Scenario: Partner confirms team registration (Doubles)
- **Type:** Happy path
- **Given** my partner has been invited to team
- **And** they receive confirmation email with link
- **When** they click the confirmation link
- **And** they navigate to /registrations/:registrationId/confirm
- **And** they click [Confirm Partnership]
- **Then** their status should change from "pending_partner_confirm" to "registered"
- **And** we should both see the team in tournament standings

### Scenario: Partner confirmation times out (Doubles)
- **Type:** Error path
- **Given** my partner has not confirmed after X days
- **When** the tournament advances to group stage
- **Then** the team should be dissolved or marked as incomplete
- **And** we should see error message

### Scenario: User cannot register for doubles without partner (Doubles)
- **Type:** Validation
- **Given** I am registering for a doubles tournament
- **When** I try to submit registration without selecting/inviting a partner
- **Then** I should see error "Partner selection required"
- **And** the [Register] button should be disabled

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

### Scenario: User submits score while offline (Singles)
- **Type:** Happy path - offline
- **Given** I am offline (network disconnected)
- **When** I click [Submit Score] and fill in "2-1"
- **And** I click [Submit]
- **Then** I should see banner "📱 Offline - will retry"
- **And** the request should be queued in Service Worker

### Scenario: User submits score while offline - syncs on reconnect
- **Type:** Happy path - offline
- **Given** I submitted a score while offline
- **When** I go back online
- **And** Service Worker auto-retries submission
- **Then** I should see notification "✓ Score synced"
- **And** standings should update normally

### Scenario: Offline submission fails after retries
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
