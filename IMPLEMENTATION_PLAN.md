# TDD Implementation Plan

## Overview

This document outlines the prioritized implementation roadmap for the tournament management webapp, organized by development phases with explicit dependencies. All tasks follow Test-Driven Development (TDD) methodology as defined in TDD_STRATEGY.md.

**Total scope:** 20 tasks across 4 phases, ~106 tests, 95%+ coverage on business logic

---

## Foundation

### Task #1: Set up test infrastructure and monorepo structure
**Status:** Pending  
**Dependencies:** None (foundation task)  
**Blocks:** All Phase 1 tasks (#2-5), Phase 2 auth (#6)

**Description:**
Initialize monorepo with workspace configuration, Jest setup, TypeScript, and test utilities. Create the directory structure for packages (core-logic, api, worker, frontend, shared, db). Install dependencies: Jest, Supertest, SQLite for testing, jest-mock-extended, fast-check, nock.

**Key deliverables:**
- Monorepo structure (packages/core-logic, packages/api, packages/worker, packages/frontend, shared/, db/)
- Jest configuration with coverage thresholds (95%+ for business logic)
- TypeScript configuration
- Test utilities and factories
- CI/CD pipeline for test execution

---

## Phase 1: Core Business Logic (TDD-Heavy)

All Phase 1 tasks are independent of each other (only depend on #1). Can be parallelized.

### Task #2: Implement standings calculation algorithm
**Status:** Pending  
**Dependencies:** #1  
**Blocks:** #9 (group endpoints), #13 (job infrastructure), #14 (standings job)

**Description:**
Write 100% test coverage for standings calculation including: primary ranking by wins, tiebreaker 1 (sets won), tiebreaker 2 (head-to-head), tiebreaker 3 (coin flip).

**Tests to write:**
- Happy path: players ranked by wins descending
- Tiebreaker scenarios: all four tiebreaker levels in isolation
- Edge cases: single player, all players tied, multiple ties at different ranking levels
- Property-based tests: ranking consistency (if A > B and B > C, then A > C)

**Success criteria:** 100% line/branch/condition coverage, zero bugs on tournament correctness

---

### Task #3: Implement bracket generation algorithm
**Status:** Pending  
**Dependencies:** #1  
**Blocks:** #11 (bracket endpoints), #13 (job infrastructure), #15 (bracket job)

**Description:**
Write 100% test coverage for single-elimination bracket generation including: seeding based on group standings, bye assignment for non-power-of-2 player counts, bracket structure validation.

**Tests to write:**
- Bracket for all player counts: 4, 5, 6, 7, 8, 16, 32, etc.
- Seeding correctness: top seed vs lowest seed in correct positions
- Bye assignment: byes distributed evenly, top seeds avoid byes when possible
- Edge cases: 2 players (1 match), 3 players (1 match + 1 bye), bracket balance verification

**Success criteria:** 100% coverage, bracket matches tournament fairness rules exactly

---

### Task #4: Implement score parsing and validation
**Status:** Pending  
**Dependencies:** #1  
**Blocks:** #10 (score submission endpoint), #13 (job infrastructure)

**Description:**
Write 100% test coverage for score parsing including: valid formats (e.g., "6-4, 6-3"), invalid format rejection with clear errors, edge cases (tiebreaks, different set counts).

**Tests to write:**
- Valid formats: standard tennis/pickleball/badminton set formats
- Invalid formats: missing commas, non-numeric, backwards scores
- Edge cases: tiebreak sets (7-6), super-tiebreaks, single-set matches
- Error messages: descriptive feedback for parsing failures

**Success criteria:** 100% coverage, no parsing bugs, clear error messages

---

### Task #5: Implement tournament state machine
**Status:** Pending  
**Dependencies:** #1  
**Blocks:** #13 (job infrastructure)

**Description:**
Write 100% test coverage for tournament state machine including: valid state transitions, invalid transition rejection, state guards, phase advancement logic.

**Tests to write:**
- All valid transitions: Registration Open → Closed → Group Stage → Knockout → Complete
- Invalid transitions: can't skip phases, can't go backwards
- State guards: can't advance groups without all scores, can't create bracket without standings
- Manual override: organizer can force-advance phases
- Edge cases: edge transitions (registration reopening restrictions, etc.)

**Success criteria:** 100% coverage, state machine enforces all rules

---

## Phase 2: API Endpoints (TDD + Integration)

Phase 2 tasks have mixed dependencies. Critical path:
1. #6 (auth) must come first
2. #7, #8, #12 can start once #6 is done
3. #9 depends on #2 (standings) being done
4. #10 depends on #4 (score parsing) being done
5. #11 depends on #3 (brackets) and #9 (groups) being done

### Task #6: API authentication and middleware setup
**Status:** Pending  
**Dependencies:** #1  
**Blocks:** #7, #8, #9, #10, #11, #12, #13

**Description:**
Implement and test API authentication including: organizer email/password login with JWT tokens, player magic link authentication, middleware for token validation, authorization checks.

**Tests to write:**
- Organizer login: valid credentials, invalid password, user not found
- Player magic links: token generation, token validation, expiry enforcement
- Middleware: valid tokens accepted, invalid tokens rejected, missing tokens return 401
- Authorization: players see only their own data, organizers see only their tournaments
- Session management: token refresh, logout invalidation

**Success criteria:** All auth flows tested, no authorization bypasses

---

### Task #7: Tournament CRUD endpoints
**Status:** Pending  
**Dependencies:** #1, #6  
**Blocks:** #18 (frontend state logic), #20 (E2E tests)

**Description:**
Implement and test tournament creation, reading, updating, and publishing with integration tests against real database.

**Tests to write:**
- POST /tournaments: valid creation, invalid inputs (missing fields, invalid dates), authorization
- GET /tournaments: listing for organizer (all owned), listing for player (available), pagination
- PATCH /tournaments/:id: update tournament details, only creator can edit, status validation
- DELETE /tournaments/:id: soft delete, authorization
- Error cases: duplicate names, invalid date ranges, state validation

**Success criteria:** All CRUD operations tested, authorization enforced, database consistency verified

---

### Task #8: Player registration and discovery endpoints
**Status:** ✅ Complete  
**Dependencies:** #1, #6  
**Blocks:** #18 (frontend state logic), #20 (E2E tests)

**Description:**
Implement and test player tournament discovery and registration including: browsing available tournaments, registering for tournament (singles and doubles), partner confirmation flow.

**Tests to write:**
- GET /tournaments/available: public listing, filtering by sport/status
- POST /tournaments/:id/register: singles registration, doubles registration with partner email
- GET /tournaments/:id/players: list registered players, only authorized users see contact info
- PATCH /registrations/:id/confirm: partner confirmation, deadline enforcement
- Withdrawal: player can withdraw before deadline, not after
- Error cases: duplicate registration, partner deadline missed, invalid email

**Success criteria:** Registration flow tested, partner confirmation deadlines enforced, data accuracy verified

---

### Task #9: Group stage management endpoints
**Status:** Pending  
**Dependencies:** #1, #2, #6  
**Blocks:** #11 (bracket endpoints), #18 (frontend state logic), #20 (E2E tests)

**Description:**
Implement and test group creation, player distribution, and standings retrieval with integration against standings logic from Phase 1.

**Tests to write:**
- POST /tournaments/:id/groups: create groups, organizer-specified group count, random distribution
- GET /tournaments/:id/groups/:id/standings: retrieve standings, standings match Phase 1 calculation exactly
- Round-robin match generation: verify all players play each other once
- Advancement criteria: top N players advance based on organizer config
- Player visibility: only group members see their group standings
- Error cases: invalid group count, player distribution edge cases

**Success criteria:** Standings integrity verified, all matches generated correctly, authorization enforced

---

### Task #10: Score submission endpoints
**Status:** Pending  
**Dependencies:** #1, #4, #6  
**Blocks:** #18 (frontend state logic), #20 (E2E tests)

**Description:**
Implement and test score submission and editing with deadline validation and conflict handling.

**Tests to write:**
- POST /tournaments/:id/matches/:id/submit-score: valid score format (Phase 1 dependency), authorization (only involved players)
- Deadline enforcement: accept before deadline, reject after deadline
- Conflict handling: different submissions logged, last submission wins
- PATCH /matches/:id/score: edit before deadline, reject after deadline
- Organizer override: organizer can edit scores after player deadline
- Validation: invalid formats rejected with clear error codes
- Job queueing: score submission triggers async standings recalculation (job not run yet)

**Success criteria:** Score validation correct, deadlines enforced, conflict handling tested, async job triggered correctly

---

### Task #11: Bracket generation and management endpoints
**Status:** Pending  
**Dependencies:** #1, #3, #6, #9  
**Blocks:** #18 (frontend state logic), #20 (E2E tests)

**Description:**
Implement and test bracket generation from group standings and knockout stage management with integration against bracket logic from Phase 1.

**Tests to write:**
- POST /tournaments/:id/bracket/generate: bracket generated from standings (Phase 1 algorithm), seeding verified, organizer can review before publish
- PATCH /tournaments/:id/bracket: organizer can override seeding
- GET /tournaments/:id/bracket: display bracket, players see only their matches initially
- Bracket publication: marks transition to knockout phase, generates matches
- Score submission in knockout: same rules as group stage
- Error cases: generate bracket without completed group stage, publish before groups done

**Success criteria:** Bracket accuracy verified against Phase 1 algorithm, seeding correct, authorization enforced

---

### Task #12: Match coordination endpoints
**Status:** Pending  
**Dependencies:** #1, #6  
**Blocks:** #18 (frontend state logic), #20 (E2E tests)

**Description:**
Implement and test match listing, coordination, and player contact information with consent rules.

**Tests to write:**
- GET /tournaments/:id/matches: list player's upcoming matches, only involved players see
- GET /matches/:id: match details with opponent info
- PATCH /matches/:id/confirm: player confirms attendance, track no-shows
- Player contact visibility: only visible if opponent consents (or organizer)
- Contact preferences: players can opt in/out of sharing info
- Error cases: accessing matches player not in, invalid state transitions

**Success criteria:** Authorization enforced, contact preferences respected, match visibility correct

---

## Phase 3: Async Jobs (TDD + Mocking)

All Phase 3 tasks depend on #13 (job infrastructure). Tasks #14-17 can run in parallel once #13 is done.

### Task #13: Job queue infrastructure and consolidation
**Status:** ✅ Complete  
**Dependencies:** #1, #2, #3, #4, #5, #6  
**Blocks:** #14, #15, #16

**Description:**
Set up `InMemoryJobQueue` job queue infrastructure (v1) and implement job consolidation logic to prevent duplicate expensive operations. Job types are: `standings.recalculate`, `bracket.generate`, `email.send`. The `websocket.broadcast` job type is removed — real-time updates are handled by SSE via `BroadcastBus` (see Task #17).

`InMemoryJobQueue` provides in-process async execution with job consolidation. Jobs are not persisted — on server restart, pending jobs are lost (acceptable for v1). **v2 migration path:** Replace with `BullMQJobQueue` (already implemented, see Migration Notes below) for Redis-backed persistence and multi-process distribution.

**Tests to write:**
- Job creation and queuing: jobs added to queue correctly
- Job deduplication: same group standings recalc job IDs prevent duplicates
- Job consolidation: multiple score submissions for same group = 1 job, not 5
- Idempotency verification: running job twice produces same result
- Job retry logic: failed jobs retry with exponential backoff (2^attempt * 1000ms)
- Dead-letter queue: failed jobs after max attempts (3) moved to DLQ
- Retry state: `attemptsMade` incremented on each retry
- In-memory implementation: no external dependencies, single-process only

**Success criteria:** Job consolidation prevents duplicate work, idempotency verified, retry logic working, DLQ tracking failed jobs, all tests pass with InMemoryJobQueue

---

### Task #14: Standings recalculation job
**Status:** ✅ Complete  
**Dependencies:** #2, #13  
**Blocks:** #20 (E2E tests)

**Description:**
Implement async job for standings recalculation triggered by score submissions, using Phase 1 algorithm. Executed via `InMemoryJobQueue` with job consolidation.

**Tests to write:**
- Job execution: standings recalculated using Phase 1 algorithm
- Result consistency: job produces identical result to Phase 1 function
- Idempotent execution: running twice = same result, no side effects
- Consolidation: concurrent score submissions = 1 job execution
- Error handling: failures logged, retried with backoff, eventually moved to DLQ
- Retry behavior: job retries on transient failures (e.g., database lock)
- SSE broadcast trigger: after recalc, emit `standings.updated` event to `BroadcastBus` (Task #17) with `{ groupId, standings }` — no job enqueued

**Success criteria:** Standings accuracy verified, job consolidation working, retry logic working, SSE event emitted, tests pass

---

### Task #15: Bracket generation job
**Status:** ✅ Complete  
**Dependencies:** #3, #13  
**Blocks:** #20 (E2E tests)

**Description:**
Implement async job for bracket generation when tournament advances to knockout stage. Executed via `InMemoryJobQueue` with job consolidation.

**Tests to write:**
- Job execution: bracket generated using Phase 1 algorithm
- Result consistency: matches Phase 1 exactly (same seeding, same byes)
- Match creation: all knockout matches created with correct pairings
- Idempotent execution: running twice = same bracket, no duplicate matches
- Error handling: invalid state (groups not complete) rejected gracefully, retried
- Retry behavior: job retries on transient failures, eventually moved to DLQ if unrecoverable
- Timing: bracket only generated after group stage complete
- SSE broadcast trigger: after generation, emit `bracket.published` event to `BroadcastBus` (Task #17) with `{ matchCount, byeCount }` — no job enqueued

**Success criteria:** Bracket accuracy verified, matches generated correctly, retry logic working, error handling robust, SSE event emitted, tests pass

---

### Task #16: Email notification job
**Status:** ✅ Complete  
**Dependencies:** #13  
**Blocks:** #20 (E2E tests)

**Description:**
Implement async job for email notifications triggered by tournament events. Executed via `InMemoryJobQueue` with job consolidation.

**Tests to write:**
- Email generation: correct data in templates
- Partner confirmation: partner receives confirmation email with link
- Score reminders: players reminded of pending scores before deadline
- Bracket publication: players notified when bracket published
- Tournament results: all players notified when tournament complete
- Recipient validation: correct players receive correct emails
- Error handling: failed sends logged, retried with backoff, eventually moved to DLQ
- Retry behavior: job retries on transient failures (e.g., SMTP timeout)
- No duplicates: same event = 1 email sent, not 5

**Success criteria:** Email content accurate, recipients correct, no duplicates, retry logic working, error handling tested, tests pass

---

### Task #17: SSE endpoint and BroadcastBus
**Status:** Pending  
**Dependencies:** #6  
**Blocks:** #14, #15, #18, #20 (E2E tests)

**Description:**
Implement server-sent events (SSE) for real-time client updates. This replaces the planned `websocket.broadcast` job entirely. The architecture is:

1. **`BroadcastBus`** — a thin in-process `EventEmitter` wrapper added to `AppDependencies`. Workers emit to it directly (no job enqueued).
2. **`GET /tournaments/:id/events`** — authenticated SSE endpoint. Subscribes to `BroadcastBus` for the given `tournamentId`, streams events to the client, and cleans up on disconnect.
3. **Remove `websocket.broadcast`** from `packages/worker/src/types.ts` job types.

**Code changes required:**
- `packages/worker/src/types.ts` — remove `websocket.broadcast` from `JobName` and `JobPayload`
- `packages/api/src/app.ts` — add `broadcastBus: BroadcastBus` to `AppDependencies`
- `packages/api/src/routes/tournaments.ts` — add `GET /:id/events` SSE route
- `packages/api/src/workers/standings-processor.ts` — replace `jobQueue.add('websocket.broadcast', ...)` with `broadcastBus.emit(...)`
- `packages/api/src/workers/bracket-processor.ts` — same replacement

**Tests to write:**
- SSE connection: client connects, receives `text/event-stream` response, stays open
- Event delivery: emitting to `BroadcastBus` pushes event to connected client with correct `data:` payload
- Tournament scoping: events for tournament A don't reach clients subscribed to tournament B
- Disconnect cleanup: `BroadcastBus` listener removed when client disconnects (no leak)
- Auth enforcement: unauthenticated request to `/events` returns 401
- Standings event: `standings.updated` arrives with `{ groupId, standings }`
- Bracket event: `bracket.published` arrives with `{ matchCount, byeCount }`

**Success criteria:** SSE streams correct events per tournament, auth enforced, no listener leaks on disconnect, `websocket.broadcast` job type fully removed

---

## Phase 4: Frontend Integration (Mostly E2E)

### Task #18: Frontend state and data logic
**Status:** Pending  
**Dependencies:** #7, #9, #10, #11, #12  
**Blocks:** #19, #20

**Description:**
Implement and test frontend data management and state logic, verifying consistency with API responses.

**Tests to write:**
- Tournament state display: rendering current phase correctly
- Standings calculations: display logic matches backend (mirrored)
- Match list filtering: upcoming, completed, by player, by round
- Player information management: caching, refresh logic
- SSE event handling: connect to `GET /tournaments/:id/events` via `EventSource`, handle `standings.updated` and `bracket.published` events
- Real-time updates: SSE events trigger state updates without polling
- Reconnection: `EventSource` auto-reconnects on drop; state re-fetched on reconnect
- Error states: API errors handled gracefully, retry logic
- Data consistency: frontend state never diverges from backend

**Success criteria:** State accuracy verified, WebSocket integration tested, error handling robust

---

### Task #19: Frontend components (dashboard, standings, brackets)
**Status:** Pending  
**Dependencies:** #18  
**Blocks:** #20

**Description:**
Implement and test frontend UI components for tournament dashboards, standings tables, bracket visualization.

**Tests to write:**
- Component rendering: correct data displayed
- State changes: re-renders triggered by state updates
- User interactions: clicks, form submissions handled
- Loading states: spinners/skeletons while loading
- Error states: error messages displayed appropriately
- Responsive layout: mobile, tablet, desktop layouts work
- Accessibility: aria labels, keyboard navigation, screen reader support
- Real-time updates: SSE events reflected immediately in UI (standings table refreshes, bracket renders on publish)

**Success criteria:** All components render correctly, interactions work, responsive design verified, accessible

---

### Task #20: E2E tests: Complete tournament workflows
**Status:** Pending  
**Dependencies:** #18, #19, #14, #15, #16, #17  
**Blocks:** None (final validation)

**Description:**
Write E2E tests for full tournament workflows from organizer creation through final results.

**Test scenarios:**
1. **Organizer creates tournament:** name, sport, match format (singles/doubles)
2. **Players register:** individual registration, partner confirmation (doubles)
3. **Organizer creates groups:** specifies group count, system distributes players
4. **Group stage:** players see matches, submit scores, standings update in real-time
5. **Standings verification:** verify final standings match Phase 1 calculation exactly
6. **Organizer generates bracket:** review seeding, publish bracket
7. **Knockout stage:** matches displayed, scores submitted, bracket progresses
8. **Final results:** all matches complete, tournament marked complete
9. **Real-time verification:** SSE events (`standings.updated`, `bracket.published`) trigger UI updates
10. **Email verification:** emails sent at each phase transition
11. **Error scenarios:** deadline enforcement, authorization, invalid state transitions

**Success criteria:** Complete tournament flow works end-to-end, all systems (API, jobs, frontend) integrated correctly, real-time updates working, no critical bugs

---

## Dependency Graph

```
#1 (Infrastructure)
├─ #2 (Standings) ──┬─ #9 (Groups) ──┬─ #11 (Bracket)
├─ #3 (Bracket) ────┤               └─ #18 (Frontend State)
├─ #4 (Parsing) ─┬─ #10 (Scores) ───┤
├─ #5 (StateMachine)  └─ #18─────────┘
│
├─ #6 (Auth) ────────┬─ #7 (CRUD) ────┬─ #18
│                    ├─ #8 (Registration)
│                    ├─ #12 (Matches) ─┤
│                    ├─ #13 (Jobs) ────┼─ #14 (Standings Job) ─┐
│                    │                 ├─ #15 (Bracket Job) ────┼─ #20 (E2E)
│                    │                 └─ #16 (Email) ──────────┘
│                    └─ #17 (SSE/BroadcastBus) ──┬─ #14 (emits to bus)
│                                                ├─ #15 (emits to bus)
│                                                └─ #18 (EventSource client)
│
└─ #18 (Frontend State) ─┬─ #19 (Components)
                         └─ #20 (E2E) ◄─── #14, #15, #16, #17
```

---

## Parallelization Opportunities

**Can run in parallel (no blocking dependencies between them):**
- Phase 1: Tasks #2, #3, #4, #5 (all depend only on #1)
- Early Phase 2: Tasks #7, #8, #12 (all depend only on #6, which must complete first)
- Phase 3: Tasks #14, #15, #16 (all depend on #13); Task #17 (SSE) depends only on #6 and can run in parallel with #13

**Must complete before next phase:**
- All Phase 1 tasks (#2-5) before Phase 2 can fully start
- Phase 2 auth (#6) before any other Phase 2 tasks
- Full Phase 2 before Phase 3 jobs
- Phase 3 jobs and Phase 2 API before Phase 4 E2E tests

---

## Critical Path (Longest dependency chain)

If executed optimally with 1 developer working strictly sequentially:

```
#1 → #6 → #11 → #18 → #19 → #20
(Total critical path: 6 tasks in sequence)
```

This path represents the longest chain of blocking dependencies. Other tasks can run in parallel with this path.

---

## Status Tracking

All tasks are currently **pending**. Mark tasks as:
- **in_progress** when starting work
- **completed** when all tests written and passing
- **deleted** if scope changes make task unnecessary

Use `TaskUpdate` to change status and track progress through the implementation.

---

## Migration Notes: v1 → v2

**v1 (Current):** Uses `InMemoryJobQueue` for Phase 3 async jobs.
- ✅ Single-process, no external dependencies
- ✅ Job consolidation and deduplication
- ✅ Job retry logic with exponential backoff
- ✅ Dead-letter queue for failed jobs
- ✅ Suitable for initial launch and single-server deployments
- ❌ Jobs lost on server restart (acceptable for v1)
- ❌ No multi-process distribution

**v2 (Future):** Replace with `BullMQJobQueue` for production scale.
- ✅ Redis-backed job persistence (jobs survive restarts)
- ✅ Multi-process worker distribution
- ✅ Job retry logic with exponential backoff (same as v1)
- ✅ Dead-letter queue for failed jobs (same as v1)
- ✅ Same `JobQueue` interface (zero code changes to job logic)

**Key difference:** v2 adds persistence and distributed workers; retry logic is identical.

**Migration effort:** ~30 minutes (config only)
1. Install `bullmq` and Redis
2. Replace `new InMemoryJobQueue()` with `new BullMQJobQueue({ host, port })`
3. Configure worker process to consume from Redis queues
4. No changes to job implementations or tests — interface is identical

**Already implemented:** `BullMQJobQueue` class exists at `packages/worker/src/bullmq-queue.ts`, ready for v2.

---

## Security Audit Checklist

**REQUIRED before committing any code:**

Every task must complete these checks before marking as done:

```bash
# 1. Run ESLint security scanner
npm run lint              # Check for security issues
npm run lint:fix          # Auto-fix where possible

# 2. Check dependencies
npm audit --production    # Find vulnerable packages

# 3. Run all tests
npm test                  # Ensure no regressions

# 4. Code review
# ✅ No hardcoded secrets/credentials
# ✅ No eval() or Function() calls
# ✅ Input validation is comprehensive
# ✅ Authorization checks are present
# ✅ No sensitive data in logs
# ✅ SQL/queries are parameterized
# ✅ No XSS vulnerabilities (frontend)
# ✅ No CSRF vulnerabilities
```

**Reference:** See `SECURITY.md` for detailed guidelines and `ESLINT_SETUP.md` for ESLint usage.

## Notes

- This plan prioritizes **business logic correctness** first (Phase 1), ensuring the foundation is solid before building APIs
- **Integration testing** is emphasized in Phase 2, verifying that API calls correctly use Phase 1 logic
- **Async job isolation** (Phase 3) ensures real-time updates don't block API responses
- **Frontend testing** (Phase 4) relies on all backend systems being stable and tested
- **Security-first approach** — all tasks include security audits before commit
- **No timelines assumed** — adjust based on your actual development velocity
- Refer to TDD_STRATEGY.md for implementation guidance, testing patterns, and best practices
- Refer to SECURITY.md for security guidelines and best practices
- Refer to ESLINT_SETUP.md for ESLint setup and usage
