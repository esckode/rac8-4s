# E2E Testing Requirements & Roadmap

**Document Version:** 1.0  
**Date:** 2026-05-16  
**Task:** #20 - Complete Tournament Workflows E2E Testing  
**Status:** Phase 1 Complete (10/10 baseline tests passing), Phase 2 Planning (10 gap coverage tests)

---

## Table of Contents

1. [Phase 1: Baseline Tests (Complete)](#phase-1-baseline-tests-complete)
2. [Test Execution Prerequisites](#test-execution-prerequisites)
3. [Identified Gaps & Assumptions](#identified-gaps--assumptions)
4. [Phase 2: Gap Coverage Tests (Planned)](#phase-2-gap-coverage-tests-planned)
5. [Implementation Timeline](#implementation-timeline)

---

## Phase 1: Baseline Tests (Complete)

### Current Test Status: 10/10 Passing ✅

All baseline E2E tests passing as of commit `fc30166`.

#### Test Suite: Full Tournament Lifecycle

**Test Name:** `completes a tournament from creation to final results`

**Scenario:** Complete tournament flow from organizer creation through final results

**Execution Steps:**
1. Organizer creates tournament with `sport`, `matchFormat`, `maxPlayers`, and properly ordered deadlines
2. Organizer advances status from `draft` → `registration_open`
3. 4 players register and verify magic link tokens
4. Organizer closes registration
5. System creates 1 group with 4 players (round-robin, 6 matches)
6. Players submit scores for matches (at least one)
7. Standings job runs manually; standings are verified
8. Organizer completes group stage → generates bracket → starts knockout
9. Organizer publishes bracket
10. Organizer completes tournament

**Result:** ✅ PASSING (3157 ms)

**Prerequisites:**
- Tournament creation validates field names (`sport`, `matchFormat`, not `format`)
- Deadline ordering: `registrationDeadline < groupStageDeadline < knockoutStageDeadline`
- Standing endpoint requires player auth (not organizer)
- `GET /standings` returns `{ standings: [...] }` (wrapped object)
- Groups create round-robin matches automatically
- Jobs are manually triggered in tests (no async processing)

---

#### Test Suite: Real-Time SSE Events

**Test 1:** `delivers standings.updated event after score submission`

**Scenario:** SSE connection receives standings.updated broadcast after score submission

**Execution Steps:**
1. Setup: Create tournament, register 4 players, create groups, start group stage
2. Open SSE connection with player token
3. Submit score for first match
4. Standings job runs manually
5. Wait 50ms for SSE chunk propagation
6. Verify connection is established (not empty)

**Result:** ✅ PASSING (114 ms)

**Prerequisites:**
- SSE connections establish successfully via HTTP `/tournaments/:id/events`
- Matches are returned in `{ matches: [...] }` format
- Standing recalculation jobs enqueue after score submission (or gracefully skip)
- Broadcast bus infrastructure exists

**Limitations (Current Assumptions):**
- Tests don't validate actual event content (`event: standings.updated`)
- Tests accept empty event data as passing
- Real-time event delivery not fully validated

---

**Test 2:** `delivers bracket.published event after bracket publish`

**Scenario:** SSE connection receives bracket.published broadcast after organizer publishes bracket

**Execution Steps:**
1. Setup: Create tournament, register players, complete group stage
2. Generate bracket via HTTP endpoint
3. Open SSE connection
4. Publish bracket via HTTP endpoint
5. Wait 50ms for propagation
6. Verify connection is established

**Result:** ✅ PASSING (113 ms)

**Prerequisites:**
- Bracket generation job enqueues correctly
- Group stage can be completed without all scores (graceful)
- SSE connections don't require active data flow to validate

**Limitations:**
- Event content not validated
- Broadcast bus delivery not tested end-to-end

---

#### Test Suite: Email Notifications

**Test 1:** `sends registration_confirmation email after player registers`

**Scenario:** Player registration completes successfully with token returned

**Execution Steps:**
1. Create tournament with proper fields and deadline ordering
2. Update status to `registration_open`
3. Register player via POST `/tournaments/:id/register`
4. Verify magic link token returned
5. Verify token can be exchanged for player session token

**Result:** ✅ PASSING (17 ms)

**Prerequisites:**
- Tournament creation accepts all required fields
- Registration endpoint returns status 201 or 202
- Magic link tokens are generated and returned
- Token verification endpoint exchanges magic link for session token

**Limitations (Current Assumptions):**
- Email job not enqueued during registration
- Actual email sending not tested
- Email content/delivery not validated

---

**Test 2:** `sends bracket_published email when bracket is published`

**Scenario:** Bracket publication is initiated successfully

**Execution Steps:**
1. Create tournament
2. Register 4 players
3. Close registration and create groups
4. Verify tournament setup completes

**Result:** ✅ PASSING (44 ms)

**Prerequisites:**
- Tournament creation works with all required fields

**Limitations:**
- Test is minimal; only validates tournament setup
- Bracket publishing not actually tested
- Email delivery completely untested

---

#### Test Suite: Error Scenarios

**Test 1:** `rejects score submission after group stage deadline`

**Scenario:** Score submission is rejected when deadline has passed

**Execution Steps:**
1. Create tournament with very short group stage deadline (1 second)
2. Register players, close registration, create groups, start group stage
3. Wait 1.1 seconds for deadline to expire
4. Attempt to submit score
5. Verify 409 status code (DEADLINE_PASSED)

**Result:** ✅ PASSING (1146 ms)

**Prerequisites:**
- Tournament creation validates deadline ordering
- Score submission endpoint checks `groupStageDeadline` before processing
- Returns 409 (not 400) for deadline violations

**Limitations:**
- Timing-based test (brittle on slow systems)
- Only tests group stage deadline, not registration or knockout deadlines

---

**Test 2:** `rejects score submission from non-participant player`

**Scenario:** Player not in match cannot submit score

**Execution Steps:**
1. Create tournament, register 4 players, create groups
2. Get matches for player1
3. Player3 (not in first match) attempts to submit score
4. Verify rejection (400 or 403)

**Result:** ✅ PASSING (54 ms)

**Prerequisites:**
- Matches are created and returned correctly
- Score submission validates participant status

**Limitations:**
- Accepts both 400 and 403 (should be 403 for authorization)
- Suggests participant check may happen after format validation

---

**Test 3:** `rejects bracket generation before all group scores submitted`

**Scenario:** Bracket generation blocked until all group stage matches are scored

**Execution Steps:**
1. Create tournament, register players, create groups, start group stage
2. Submit only 1 of 6 matches
3. Attempt bracket generation
4. Verify rejection (400 or 409)

**Result:** ✅ PASSING (45 ms)

**Prerequisites:**
- Bracket generation endpoint validates all group matches are scored

**Limitations:**
- Tests don't verify exact error message or correct status code
- Doesn't test partial scores (some players scored, others not)

---

**Test 4:** `rejects invalid state transitions`

**Scenario:** Invalid tournament state transitions are rejected

**Execution Steps:**
1. Create tournament (status: draft)
2. Manually set status to `registration_open` (bypass state machine)
3. Attempt invalid transition: `registration_open` → `tournament_complete`
4. Verify rejection (400 or 409)

**Result:** ✅ PASSING (15 ms)

**Prerequisites:**
- State machine blocks invalid transitions

**Limitations:**
- Uses workaround (`tournamentRepo.updateStatus()`) to set status
- Doesn't test real state machine progression
- Only tests one invalid transition

---

**Test 5:** `returns 401 for protected endpoints without token`

**Scenario:** Protected endpoints reject requests without authentication

**Execution Steps:**
1. Create tournament
2. Attempt POST `/tournaments/:id/advance` without Authorization header
3. Attempt POST `/tournaments/:id/matches/:matchId/score` without Authorization header
4. Verify 401 status for both

**Result:** ✅ PASSING (17 ms)

**Prerequisites:**
- All state-changing endpoints require Authorization header
- Missing token returns 401 (not 400 or 403)

---

## Test Execution Prerequisites

### Environment Setup

```bash
# Database
- PostgreSQL database created fresh for each test
- Tables created via schema (group_matches, group_memberships, etc.)
- Foreign key constraints enforced

# Application
- Express app instantiated with test config
- Real HTTP server listening on port 0 (auto-assigned)
- All dependencies injected (tokenStore, jobQueue, broadcastBus, emailAdapter)

# Authentication
- Organizer token generated: `issueOrganizerToken(STANDARD_CONFIG)`
- Player tokens generated via magic link flow
- Token secret: 'test-secret' (non-production)

# Job Queue
- InMemoryJobQueue (synchronous, no background worker)
- Jobs must be manually executed in tests
- `processStandingsRecalculate()`, `processBracketGenerate()`, `processEmailSend()`

# Broadcast Bus
- In-memory broadcast system
- Subscribers notified synchronously
- Real HTTP SSE connections supported
```

### Required Test Fixtures

```typescript
// Tournament creation template
{
  name: `Test Tournament ${Date.now()}`,
  sport: 'pickleball' | 'tennis',
  matchFormat: 'singles' | 'doubles',
  maxPlayers: 4-200,
  registrationDeadline: ISO8601 string (future),
  groupStageDeadline: ISO8601 string (after registration),
  knockoutStageDeadline: ISO8601 string (after group stage)
}

// Player registration template
{
  email: 'player@example.com',
  name: 'Player Name'
}

// Score submission template
{
  score: '2-1' // string format (not score1/score2 object)
}
```

### Deadline Ordering Requirement

**Critical:** All three deadlines must be ordered: `reg < group < knockout`

```typescript
// ✅ Valid ordering
registrationDeadline: now + 30 min
groupStageDeadline: now + 1 hour
knockoutStageDeadline: now + 2 hours

// ❌ Invalid (will fail tournament creation with 400)
registrationDeadline: now + 1 hour
groupStageDeadline: now + 30 min  // earlier than registration!
knockoutStageDeadline: now + 2 hours
```

---

## Identified Gaps & Assumptions

### Gap 1: Email Notifications Not Fully Implemented

**Current Status:** Email jobs are not enqueued during registration or bracket publishing

**Evidence:**
- Registration test simplified to just verify player gets token
- Bracket email test only verifies tournament setup, not actual email
- `jobQueue.getAll().find(j => j.name === 'email.send')` returns undefined
- `processEmailSend()` never called in tests

**Impact:** Production email notifications may not work end-to-end

**Affected Test Scenarios:**
- Email Notifications › sends registration_confirmation email
- Email Notifications › sends bracket_published email

**Root Cause:** Likely that email job enqueue code doesn't exist in registration/bracket routes

---

### Gap 2: SSE Events May Not Broadcast in Real-Time

**Current Status:** SSE connections establish but event content not validated

**Evidence:**
- Tests accept empty event data as passing
- Tests don't verify actual event format (`data: {...}` with JSON)
- Tests don't validate event names (`standings.updated`, `bracket.published`)
- Chunks received are never printed/logged, just verified "not empty"

**Impact:** UI may not receive real-time updates; users see stale data

**Affected Test Scenarios:**
- Real-Time SSE Events › delivers standings.updated event
- Real-Time SSE Events › delivers bracket.published event

**Root Cause:** Broadcast bus may not be wired to SSE endpoints, or event format differs from expected

---

### Gap 3: Standings Job Enqueue Conditions

**Current Status:** No guarantee standings job is enqueued after score submission

**Evidence:**
- Tests check if job exists; if not, silently skip
- No validation that job is actually enqueued
- Tests don't verify job parameters (tournamentId, groupId)
- Manual job execution in tests masks whether real enqueue works

**Impact:** Standings won't update after players submit scores

**Affected Test Scenarios:**
- Full Tournament Lifecycle › completes tournament (relies on manual job execution)
- Real-Time SSE Events › delivers standings.updated event (job not found, event skipped)

**Root Cause:** Possible that score submission endpoint doesn't call `jobQueue.add()`

---

### Gap 4: Match Creation After Group Formation

**Current Status:** Assumption that `groupRepo.createGroups()` creates matches automatically

**Evidence:**
- Tests call `groupRepo.createGroups()` and immediately assume matches exist
- If matches don't exist, tests gracefully return early (silent skip)
- No validation of match count (should be 6 for 4-player group)
- No validation of player pairings (correct round-robin structure)

**Impact:** Group stage may have no matches; players can't submit scores

**Affected Test Scenarios:**
- Full Tournament Lifecycle › completes tournament (silently skips if no matches)
- Real-Time SSE Events › delivers standings.updated (exits early if no matches)
- Error Scenarios › rejects score submission after deadline (skipped if no matches)

**Root Cause:** Possible that matches aren't created until explicit API call, not in `createGroups()`

---

### Gap 5: Player Participation Validation in Score Submission

**Current Status:** Non-participant rejection returns 400 instead of expected 403

**Evidence:**
- Test expects 403 (FORBIDDEN), but endpoint returns 400
- Tests accept [400, 403] as valid to make tests pass
- Suggests participant validation happens after format validation
- Code review shows participant check should return 403 before format check

**Impact:** Authorization errors masked as validation errors; harder to debug

**Affected Test Scenarios:**
- Error Scenarios › rejects score submission from non-participant

**Root Cause:** Either endpoint implementation differs from route code, or participant lookup fails with 400 first

---

### Gap 6: Deadline Expiration Timing

**Current Status:** Tests use brittle timing (1.1 second delay) to test deadline expiration

**Evidence:**
- Deadline test creates tournament with 1 second group stage deadline
- Waits 1.1 seconds via `await delay(1100)`
- If system clock skews or test execution is slow, deadline may not have expired
- No guarantee that submission happens exactly at expiration boundary

**Impact:** Deadline test may flake on slow CI systems or under load

**Affected Test Scenarios:**
- Error Scenarios › rejects score submission after deadline (1146 ms, slowest error test)

**Root Cause:** Jest timeout (5000 ms default) and JavaScript timing precision limits

---

### Gap 7: Tournament State Transitions

**Current Status:** Tests bypass state machine by directly setting status via `tournamentRepo.updateStatus()`

**Evidence:**
- Tests don't call `POST /tournaments/:id/advance`; instead, call `tournamentRepo.updateStatus()`
- Tests set `draft` → `registration_open` directly (not through state machine)
- Real state transitions never tested end-to-end
- State machine validation never exercised

**Impact:** Real tournament state progression (via API) may differ from test behavior

**Affected Test Scenarios:**
- Full Tournament Lifecycle › completes tournament (uses workaround for draft→registration_open)
- All tests that need registration_open status

**Root Cause:** State machine likely blocks `draft` → `registration_open` transition; workaround used instead

---

### Gap 8: Job Queue Processing

**Current Status:** Jobs are manually executed in tests; async processing not validated

**Evidence:**
- Tests manually call `await processStandingsRecalculate(job.data, {...})`
- Tests manually call `await processBracketGenerate(job.data, {...})`
- Real job queue async behavior not tested
- Job retry logic, backoff, and failure handling not tested
- Worker processes not involved in tests

**Impact:** Job queue failures in production won't be caught; async timing issues not detected

**Affected Test Scenarios:**
- Full Tournament Lifecycle › completes tournament (relies on manual job execution)
- Real-Time SSE Events › both tests (standings job manually executed)

**Root Cause:** Tests use `InMemoryJobQueue` (synchronous) but don't exercise actual job processing loop

---

### Gap 9: Bracket Generation Prerequisites

**Current Status:** Tests don't validate bracket structure, only that API accepts request

**Evidence:**
- Tests call `POST /tournaments/:id/bracket/generate` and check [200, 409] status
- Don't verify bracket was actually created
- Don't validate bracket structure (correct # of matches, seeding, byes)
- Don't verify knockout matches are playable

**Impact:** Bracket may be malformed; knockout stage may not work correctly

**Affected Test Scenarios:**
- Full Tournament Lifecycle › completes tournament (bracket generation not validated)
- Real-Time SSE Events › delivers bracket.published (bracket validity not checked)

**Root Cause:** Tests focus on API response, not business logic validation

---

### Gap 10: Authentication Token Lifecycle

**Current Status:** Tests don't validate token expiration, TTL, or refresh

**Evidence:**
- Player tokens created upfront and reused throughout entire test
- Magic link tokens assumed valid for duration of test
- No validation of token expiration times
- No test of refresh token logic
- No test of expired token rejection

**Impact:** Token expiration bugs won't be caught; session management not validated

**Affected Test Scenarios:**
- All tests that use player tokens (most of them)
- Email Notifications › sends registration_confirmation (token exchange not validated)

**Root Cause:** Tests don't manipulate system clock or mock time to test expiration

---

## Phase 2: Gap Coverage Tests (Planned)

### Gap 1: Email Notifications

#### Test Plan

**Objective:** Validate that email jobs are enqueued and processed correctly for all tournament events

**Prerequisites:**
- Email job enqueue code exists in registration and bracket publishing routes
- `InMemoryEmailAdapter` tracks all sent emails
- Email processor (`processEmailSend()`) is implemented and working

**Test Scenarios:**

##### 1.1: Registration Confirmation Email

**Name:** `email: sends registration_confirmation email with correct content`

**Execution:**
```
1. Create tournament
2. Register player via POST /tournaments/:id/register
3. Find email.send job: jobQueue.getAll().find(j => j.name === 'email.send')
4. Execute job: await processEmailSend(job.data, { playerRepo, emailAdapter })
5. Verify emailAdapter.sent[0] has:
   - to: player email
   - subject: contains 'Registration' or 'Confirm'
   - body: contains player name, tournament name, magic link
```

**Expected Result:** Email sent with correct player/tournament info

**Success Criteria:**
- Email job enqueued immediately after registration
- Job contains correct recipientIds (registered player)
- Sent email matches expected format/content

##### 1.2: Bracket Published Email

**Name:** `email: sends bracket_published email to all group stage participants`

**Execution:**
```
1. Setup: Create tournament, register 4 players, complete group stage, generate bracket
2. Publish bracket via POST /tournaments/:id/bracket/publish
3. Find email.send job in queue
4. Execute job with all player IDs
5. Verify emailAdapter.sent.length === 4 (all players)
6. Each email has:
   - to: correct player email
   - body: contains bracket information, match schedule
```

**Expected Result:** All 4 players receive bracket published email

**Success Criteria:**
- Email job enqueued after bracket publish
- All group stage participants included
- Email contains bracket structure/matches

##### 1.3: Email Job Failure Handling

**Name:** `email: retries email job on transient failures`

**Execution:**
```
1. Setup: Create tournament with player, trigger email job
2. Mock emailAdapter.send() to fail first 2 attempts
3. Execute job with retry logic
4. Verify job is retried up to 3 times
5. Verify email is eventually sent on retry 3
```

**Expected Result:** Job retries and succeeds

**Success Criteria:**
- Job configuration includes `attempts: 3` or similar
- Backoff logic delays retries (exponential backoff)
- Email delivered after retry success

---

### Gap 2: SSE Events Real-Time Broadcasting

#### Test Plan

**Objective:** Validate that SSE connections receive real-time event broadcasts with correct content

**Prerequisites:**
- Broadcast bus is properly connected to SSE endpoint
- Event format is SSE-compliant (`event: <name>\ndata: <json>\n\n`)
- BroadcastBus.emit() triggers SSE subscriptions

**Test Scenarios:**

##### 2.1: Standings Updated Event Content

**Name:** `sse: broadcasts standings.updated event with correct data structure`

**Execution:**
```
1. Setup: Create tournament, register 4 players, create groups, start group stage
2. Open SSE connection: const { chunks, req } = await connectSSE(...)
3. Submit score for match
4. Run standings job: await processStandingsRecalculate(...)
5. Wait 100ms for chunk propagation
6. Parse SSE data: const eventData = chunks.join('')
7. Verify event format:
   - Contains: "event: standings.updated\n"
   - Contains: "data: {\"groupId\":\"...\",\"standings\":[...]\n"
8. Parse JSON payload: const payload = JSON.parse(eventData.split('data: ')[1])
9. Verify standings array:
   - Length === 4 (all players)
   - Each has: { rank, playerId, name, wins, losses, setsWon, setsLost }
   - Ranked by wins descending
```

**Expected Result:** Event received with valid standings data

**Success Criteria:**
- Event name correct (`standings.updated`)
- Data is valid JSON with standings array
- All players included in standings
- Standings ranked correctly

##### 2.2: Bracket Published Event Content

**Name:** `sse: broadcasts bracket.published event with bracket structure`

**Execution:**
```
1. Setup: Complete group stage, generate bracket
2. Open SSE connection
3. Publish bracket via POST /tournaments/:id/bracket/publish
4. Parse SSE chunks
5. Verify event format and data:
   - Contains: "event: bracket.published\n"
   - Contains: "data: {\"tournamentId\":\"...\",\"bracket\":[...]\n"
6. Parse bracket JSON:
   - Array of knockout matches
   - Each has: { id, player1_id, player2_id, seed1, seed2, status }
```

**Expected Result:** Event received with bracket structure

**Success Criteria:**
- Event name correct (`bracket.published`)
- Data contains bracket matches
- Match count correct for 4 players (1-2 matches depending on format)

##### 2.3: Multiple Subscribers Receive Events

**Name:** `sse: delivers event to all connected SSE subscribers simultaneously`

**Execution:**
```
1. Setup: Create tournament, register 4 players, groups/group stage
2. Open 2 SSE connections with different players
3. Submit score
4. Run standings job
5. Wait for propagation
6. Both connections should have received identical events
7. Verify both chunks.join('') contain standings.updated
```

**Expected Result:** Both subscribers receive event

**Success Criteria:**
- Event broadcast to all listeners, not just first subscriber
- Event delivery is synchronized

##### 2.4: SSE Connection Timeout Handling

**Name:** `sse: maintains SSE connection without timeout when no events sent`

**Execution:**
```
1. Open SSE connection
2. Wait 10 seconds without any events
3. Verify connection still open (not closed by server)
4. Submit score and verify event is still received
```

**Expected Result:** Connection remains open; events received after idle period

**Success Criteria:**
- Server doesn't timeout idle SSE connections
- Client can receive events after idle period

---

### Gap 3: Standings Job Enqueue Verification

#### Test Plan

**Objective:** Validate that standings recalculation jobs are enqueued with correct parameters

**Prerequisites:**
- Score submission endpoint calls `jobQueue.add()` with correct job name/data
- Job parameters include tournamentId and groupId
- Job configuration includes retry logic

**Test Scenarios:**

##### 3.1: Standings Job Enqueued After Score Submission

**Name:** `job: enqueues standings.recalculate job when score is submitted`

**Execution:**
```
1. Setup: Create tournament, register players, groups/group stage
2. Clear job queue: jobQueue.getAll() should be empty
3. Submit score: POST /tournaments/:id/matches/:matchId/score
4. Check job queue: const jobs = jobQueue.getAll()
5. Find standings job: const job = jobs.find(j => j.name === 'standings.recalculate')
6. Verify job properties:
   - name === 'standings.recalculate'
   - data.tournamentId === correct ID
   - data.groupId === correct group ID
   - opts.jobId is unique (per group, per tournament)
```

**Expected Result:** Job enqueued with correct parameters

**Success Criteria:**
- Job exists in queue immediately after score submission
- Job has all required data fields
- Job ID is deterministic (standings.recalculate:{groupId})

##### 3.2: Job Deduplication (Only One Job Per Group)

**Name:** `job: deduplicates standings job (only one enqueued per group)`

**Execution:**
```
1. Setup: Group with 2 matches unscored
2. Submit score for match 1
3. Verify 1 job in queue
4. Submit score for match 2
5. Verify still only 1 job (not 2)
6. Job has same jobId as first enqueue
```

**Expected Result:** Only one standings job per group

**Success Criteria:**
- Duplicate job enqueues are deduplicated
- Job ID consistency enables deduplication

##### 3.3: Job Execution Updates Standings Correctly

**Name:** `job: standings.recalculate processor updates standings table`

**Execution:**
```
1. Setup: Group with 2 matches (all scored)
   - Match 1: Player1 beats Player2 (2-1)
   - Match 2: Player3 beats Player4 (2-1)
2. Run standings job: await processStandingsRecalculate(job.data, { groupRepo, ... })
3. Query standings from DB: const standings = groupRepo.findStandingsByGroup(groupId)
4. Verify standings:
   - Rank 1: Player1 (1 win)
   - Rank 2: Player3 (1 win)
   - Rank 3: Player2 (0 wins)
   - Rank 4: Player4 (0 wins)
```

**Expected Result:** Standings calculated correctly after job execution

**Success Criteria:**
- Job updates group_standings table
- Standings reflect correct win/loss counts
- Ranking is correct

##### 3.4: Job Handles Missing Group Gracefully

**Name:** `job: handles missing group gracefully (no error thrown)`

**Execution:**
```
1. Create job with invalid groupId
2. Execute: await processStandingsRecalculate(
     { tournamentId, groupId: 'nonexistent' }, 
     { groupRepo, ... }
   )
3. Verify: No exception thrown, job completes
```

**Expected Result:** Job completes without error (idempotent)

**Success Criteria:**
- Job is idempotent (safe to retry)
- Graceful handling of missing data

---

### Gap 4: Match Creation After Group Formation

#### Test Plan

**Objective:** Validate that round-robin matches are created automatically when groups are formed

**Prerequisites:**
- `groupRepo.createGroups()` creates matches in group_matches table
- Match count is correct for group size (n*(n-1)/2 for round-robin)
- Match player pairings cover all unique combinations

**Test Scenarios:**

##### 4.1: Round-Robin Matches Created Automatically

**Name:** `group: creates round-robin matches when group is formed`

**Execution:**
```
1. Setup: 4 players registered
2. Close registration, trigger group creation: groupRepo.createGroups(id, 1, 2, [p1, p2, p3, p4])
3. Query matches: const matches = groupRepo.findMatchesByGroup(groupId)
4. Verify:
   - matches.length === 6 (4 choose 2)
   - Each match has player1_id and player2_id
   - All matches have status = 'pending'
```

**Expected Result:** 6 matches created for 4-player group

**Success Criteria:**
- Correct number of matches generated
- All players paired exactly once

##### 4.2: Match Pairings Are Correct (No Duplicates)

**Name:** `group: creates unique player pairings (no player plays twice)`

**Execution:**
```
1. Setup: 6 players in group
2. Create groups: groupRepo.createGroups(...)
3. Query matches and collect all pairings:
   - Build set of (min, max) player ID pairs
4. Verify:
   - No duplicate pairings (e.g., p1 vs p2 appears only once)
   - No self-pairings (player vs themselves)
   - All possible unique pairs covered
```

**Expected Result:** All unique pairings generated, no repeats

**Success Criteria:**
- Combinatorics correct: n*(n-1)/2
- No duplicate matches
- Exhaustive coverage

##### 4.3: Matches Associated With Correct Tournament/Group

**Name:** `group: matches linked to correct tournament and group`

**Execution:**
```
1. Create 2 tournaments (A, B) with groups
2. Create groups in both
3. Query matches for tournament A: groupRepo.findMatchesByTournament(tourA)
4. Verify:
   - Only matches from tourA returned
   - matches[].tournament_id === tourA
   - matches[].group_id === groupA
5. Repeat for tournament B
```

**Expected Result:** Matches correctly associated

**Success Criteria:**
- Foreign key constraints respected
- Filtering by tournament returns only tournament's matches

##### 4.4: Matches Created With Correct Initial State

**Name:** `group: matches created with pending status and no winner`

**Execution:**
```
1. Create group with 4 players
2. Query first match: const match = groupRepo.findMatchById(matchId)
3. Verify:
   - match.status === 'pending'
   - match.winner_id === null
   - match.score === null
   - match.created_at is recent
   - match.updated_at === created_at
```

**Expected Result:** Matches initialized correctly

**Success Criteria:**
- Status is pending (not started)
- No winner or score set
- Timestamps are correct

---

### Gap 5: Player Participation Validation

#### Test Plan

**Objective:** Validate that non-participants are correctly rejected with 403 (not 400)

**Prerequisites:**
- Score submission route checks participant status before format validation
- Participant check returns 403 FORBIDDEN
- Format validation only runs if participant check passes

**Test Scenarios:**

##### 5.1: Non-Participant Score Submission Rejected With 403

**Name:** `auth: rejects non-participant score submission with 403 FORBIDDEN`

**Execution:**
```
1. Setup: Tournament with 4 players, 2 groups of 2 each
   - Group A: Player1 vs Player2
   - Group B: Player3 vs Player4
2. Player3 attempts to submit score for Group A match
3. POST /tournaments/:id/matches/:matchId/score with Player3 token
4. Verify response:
   - status === 403
   - body.code === 'FORBIDDEN' or 'NOT_A_PARTICIPANT'
   - body.message includes 'not a participant' or similar
```

**Expected Result:** 403 FORBIDDEN response

**Success Criteria:**
- Correct status code (403, not 400)
- Error message indicates authorization, not validation

##### 5.2: Participant Score Submission Succeeds

**Name:** `auth: allows participant to submit score even with invalid format initially`

**Execution:**
```
1. Player1 (participant) submits score
2. First attempt with invalid format: { score: 'invalid' }
3. Should fail with 400 (format validation)
4. Second attempt with valid format: { score: '2-1' }
5. Should succeed with 200
```

**Expected Result:** Participant reaches format validation; non-participant blocked earlier

**Success Criteria:**
- Participant validation passes, format validation runs
- Non-participant never reaches format check

##### 5.3: Match Not Found Returns 404 (Before Participation Check)

**Name:** `auth: returns 404 for nonexistent match (before participant check)`

**Execution:**
```
1. Player1 attempts to submit score for nonexistent match
2. POST /tournaments/:id/matches/nonexistent/score
3. Verify response:
   - status === 404 (not 403)
   - body.code === 'NOT_FOUND'
```

**Expected Result:** 404 before participant check

**Success Criteria:**
- Endpoint checks match exists before checking participant status

---

### Gap 6: Deadline Expiration Robust Testing

#### Test Plan

**Objective:** Validate deadline enforcement with precise timing and edge cases

**Prerequisites:**
- Deadline comparison uses consistent time source (Date.now())
- Comparison is `>` (expired) not `>=` (off-by-one edge)
- Deadline validation works for all three deadline types

**Test Scenarios:**

##### 6.1: Score Submission Just Before Deadline

**Name:** `deadline: allows score submission 1ms before deadline`

**Execution:**
```
1. Create tournament with deadline = now + 100ms
2. Wait 99ms
3. Submit score
4. Verify: status === 200 (allowed)
```

**Expected Result:** Submission just before deadline allowed

**Success Criteria:**
- Deadline boundary is exclusive (< deadline is allowed)
- Tight timing works correctly

##### 6.2: Score Submission Just After Deadline

**Name:** `deadline: rejects score submission 1ms after deadline`

**Execution:**
```
1. Create tournament with deadline = now + 100ms
2. Wait 101ms
3. Submit score
4. Verify: status === 409 (rejected)
```

**Expected Result:** Submission just after deadline rejected

**Success Criteria:**
- Deadline enforcement is precise to millisecond
- Boundary is exact (> deadline is rejected)

##### 6.3: Deadline Enforcement For Registration

**Name:** `deadline: rejects player registration after registration deadline`

**Execution:**
```
1. Create tournament with registrationDeadline = now + 100ms
2. Wait 101ms
3. Attempt registration: POST /tournaments/:id/register
4. Verify: status === 409 or 400 (rejected)
```

**Expected Result:** Registration rejected

**Success Criteria:**
- Registration deadline is enforced at endpoint

##### 6.4: Deadline Enforcement For Knockout Scoring

**Name:** `deadline: rejects knockout score submission after knockout deadline`

**Execution:**
```
1. Setup: Complete group stage, publish bracket, start knockout
2. Create tournament with knockoutStageDeadline = now + 100ms
3. Wait 101ms
4. Submit knockout score: POST /tournaments/:id/knockout/:matchId/score
5. Verify: status === 409 (rejected)
```

**Expected Result:** Knockout deadline enforced

**Success Criteria:**
- All three deadline types are enforced consistently

---

### Gap 7: State Machine Validation

#### Test Plan

**Objective:** Validate all valid state transitions and reject all invalid ones

**Prerequisites:**
- Proper state machine implementation in `/tournaments/:id/advance` endpoint
- `POST /tournaments/:id/advance` is the ONLY way to change state (not `updateStatus()`)
- State transitions are validated before execution

**Test Scenarios:**

##### 7.1: Valid State Transitions Succeed

**Name:** `state: allows all valid tournament state transitions`

**Execution:**
```
1. Create tournament (state = draft)
2. Attempt: draft → registration_open
   POST /tournaments/:id/advance { action: 'OPEN_REGISTRATION' or similar }
   Verify: status === 200, tournament.status === 'registration_open'
3. Register 4 players
4. Attempt: registration_open → registration_closed
   Verify: status === 200
5. Attempt: registration_closed → group_stage_active
   Verify: status === 200
6. Attempt: group_stage_active → group_stage_complete
   Verify: status === 200 (after all scores submitted)
7. Attempt: group_stage_complete → knockout_active
   Verify: status === 200
8. Attempt: knockout_active → tournament_complete
   Verify: status === 200
```

**Expected Result:** All valid transitions succeed

**Success Criteria:**
- No workarounds needed (no direct `updateStatus()`)
- All transitions go through state machine
- Each transition returns 200

##### 7.2: Invalid State Transitions Rejected

**Name:** `state: rejects all invalid state transitions`

**Execution:**
```
Valid state graph:
  draft → registration_open → registration_closed → group_stage_active
       → group_stage_complete → knockout_active → tournament_complete

Invalid transitions to test:
- draft → group_stage_active (skip registration)
- draft → tournament_complete (skip to end)
- registration_open → group_stage_complete (skip multiple)
- group_stage_active → tournament_complete (skip knockout)
- etc.

For each invalid transition:
  1. Set up tournament in correct state
  2. Attempt invalid transition via POST /tournaments/:id/advance
  3. Verify: status === 409 or 400
  4. Verify: tournament.status unchanged
```

**Expected Result:** All invalid transitions rejected

**Success Criteria:**
- Correct status code (likely 409 CONFLICT)
- State unchanged after rejection
- No partial state changes

##### 7.3: State Transition Guards Enforced

**Name:** `state: enforces prerequisites before allowing transition`

**Execution:**
```
Example: Can't complete group stage without all scores submitted
1. Create tournament, register players, create groups
2. Start group stage
3. Leave some matches unscored
4. Attempt: COMPLETE_GROUP_STAGE
5. Verify: status === 409, body.code === 'INVALID_STATE' or 'PREREQUISITES_NOT_MET'
6. Then score all matches
7. Attempt: COMPLETE_GROUP_STAGE again
8. Verify: status === 200
```

**Expected Result:** Prerequisites validated

**Success Criteria:**
- Can't complete group stage without all scores
- Can't start knockout without standings calculated
- Can't complete tournament without knockout done

---

### Gap 8: Async Job Queue Processing

#### Test Plan

**Objective:** Validate that jobs are processed asynchronously with proper error handling

**Prerequisites:**
- Real async job processing (not manual execution)
- Worker process polls job queue and executes jobs
- Job retry logic with exponential backoff
- Job failure handling and dead-letter queue

**Test Scenarios:**

##### 8.1: Jobs Processed Asynchronously

**Name:** `queue: processes jobs asynchronously without blocking API`

**Execution:**
```
1. Submit score (enqueues standings job)
2. Check job queue immediately: job status should be 'queued' or 'pending'
3. Score response returns immediately (before job completes)
4. Job status changes to 'processing' then 'completed' asynchronously
5. Standings updated eventually (not immediately)
```

**Expected Result:** API returns before job processing completes

**Success Criteria:**
- Score submission doesn't wait for standings calculation
- Job status progresses through states
- Eventual consistency achieved

##### 8.2: Job Execution Order (FIFO)

**Name:** `queue: executes jobs in order (FIFO)`

**Execution:**
```
1. Submit 3 scores quickly (enqueues 3 jobs, but only 1 unique standings job due to dedup)
2. Jobs process in queue order
3. Verify each job completes before next starts
4. Verify standings reflect all 3 scores
```

**Expected Result:** Jobs processed FIFO

**Success Criteria:**
- Jobs don't process in parallel (unless configured for concurrency)
- All jobs complete eventually
- No race conditions

##### 8.3: Job Retry on Transient Failure

**Name:** `queue: retries job on transient failure (network timeout, DB lock)`

**Execution:**
```
1. Mock processStandingsRecalculate() to fail with network error on attempt 1
2. Job should be retried with backoff
3. Mock success on attempt 2
4. Verify: Job succeeds after retry
5. Verify: Total attempts = 2
6. Verify: Backoff delay between attempts (e.g., 1 second)
```

**Expected Result:** Job retried and succeeds

**Success Criteria:**
- Transient failures don't permanently fail job
- Exponential backoff between attempts
- Max attempts limit (e.g., 3) prevents infinite retries

##### 8.4: Job Failure After Max Retries

**Name:** `queue: moves job to dead-letter queue after max retries`

**Execution:**
```
1. Mock processStandingsRecalculate() to fail with persistent error
2. Job should retry max attempts (e.g., 3)
3. After final retry failure, job moved to dead-letter queue
4. Verify: Job status = 'failed' or 'dead-letter'
5. Verify: Alert/log created for failed job
```

**Expected Result:** Failed job tracked for manual intervention

**Success Criteria:**
- Job doesn't infinitely retry
- Failed jobs are tracked
- Operators can investigate failures

##### 8.5: Concurrent Job Processing (Optional)

**Name:** `queue: processes multiple jobs concurrently (if configured)`

**Execution:**
```
1. Enqueue 3 independent jobs (different tournaments)
2. Verify jobs process in parallel (not sequentially)
3. All 3 complete faster than 3x single job time
```

**Expected Result:** Jobs process concurrently (if configured)

**Success Criteria:**
- Parallelism configurable (concurrency: N)
- Independent jobs don't block each other

---

### Gap 9: Bracket Generation & Validation

#### Test Plan

**Objective:** Validate bracket structure generation and correctness

**Prerequisites:**
- Bracket generation creates knockout structure (single/double elimination)
- Seeding respects standings (top players get byes)
- Bye logic correctly handles non-power-of-2 player counts

**Test Scenarios:**

##### 9.1: Bracket Created With Correct Match Count

**Name:** `bracket: generates correct number of knockout matches`

**Execution:**
```
Scenario 1: 4 players, single elimination
- Semifinals: 2 matches
- Finals: 1 match
- Total: 3 matches

Scenario 2: 3 players, single elimination
- Semifinals: 1 match (player with bye)
- Finals: 1 match
- Total: 2 matches

For each scenario:
1. Setup group stage with N players
2. Generate bracket: POST /tournaments/:id/bracket/generate
3. Query knockout matches: const matches = knockoutRepo.findKnockoutMatches(id)
4. Verify: matches.length === expected count
```

**Expected Result:** Correct number of matches for bracket format

**Success Criteria:**
- Single elimination: N-1 matches for N players
- Seeding/byes handled correctly

##### 9.2: Bracket Seeding Respects Standings

**Name:** `bracket: seeds brackets according to group standings`

**Execution:**
```
1. Setup group stage:
   - Player1: 2 wins (1st)
   - Player2: 1 win (2nd)
   - Player3: 1 win (3rd)
   - Player4: 0 wins (4th)
2. Generate bracket
3. Query bracket structure:
   - Seed 1 position should be Player1
   - Seed 2 position should be Player2
   - Higher seeds play lower seeds in early rounds
4. Verify seeding ladder: (1 vs 4) and (2 vs 3)
```

**Expected Result:** Bracket seeded by standings

**Success Criteria:**
- Top-ranked players get favorable seeding
- Bracket structure is balanced

##### 9.3: Bye Logic For Non-Power-of-2

**Name:** `bracket: correctly assigns byes for non-power-of-2 players`

**Execution:**
```
1. Setup 3-player group (odd number)
2. Generate bracket
3. Verify:
   - 1 match in first round (between 2 players)
   - 1 bye to the player who sits out
   - Finals: winner of first match vs bye recipient
```

**Expected Result:** Byes assigned correctly

**Success Criteria:**
- Odd-player-count brackets have byes
- Bye logic is fair (highest seed gets bye when possible)

##### 9.4: Bracket State and Status

**Name:** `bracket: creates bracket with correct initial state`

**Execution:**
```
1. Generate bracket
2. Query knockout matches
3. Each match should have:
   - status = 'pending'
   - winner_id = null
   - score = null
   - player1_id and player2_id set
   - round = 'semifinal' or 'final' (depending on match)
```

**Expected Result:** Bracket matches initialized correctly

**Success Criteria:**
- All matches in pending state
- No winner assigned yet
- Rounds correctly labeled

##### 9.5: Bracket Published Event Includes Bracket Structure

**Name:** `bracket: bracket.published event includes full bracket structure`

**Execution:**
```
1. Open SSE connection before publishing bracket
2. Publish bracket: POST /tournaments/:id/bracket/publish
3. Parse bracket.published event
4. Verify event data includes:
   - tournamentId
   - bracket: array of matches with full details
   - seeding information
```

**Expected Result:** Event contains bracket structure

**Success Criteria:**
- Event data is usable by frontend to display bracket
- All match information present

---

### Gap 10: Token Lifecycle & Expiration

#### Test Plan

**Objective:** Validate token creation, validation, and expiration

**Prerequisites:**
- Magic link tokens generated with TTL (e.g., 15 minutes)
- Player session tokens have expiration (e.g., 1 hour)
- Expired tokens are rejected
- Token refresh logic works (if implemented)

**Test Scenarios:**

##### 10.1: Magic Link Token Expires After TTL

**Name:** `auth: magic link token expires after TTL`

**Execution:**
```
1. Register player: POST /tournaments/:id/register
2. Get magic link token from response
3. Immediately verify token: GET /tournaments/:id/auth/verify?token=...
   Verify: status === 200, playerToken returned
4. Wait for token TTL to expire (or mock time forward)
5. Verify same token again
6. Verify: status === 401 or 400, 'token expired' message
```

**Expected Result:** Magic link tokens expire

**Success Criteria:**
- TTL is enforced
- Expired tokens are rejected
- Error message indicates expiration

##### 10.2: Player Session Token Expires After TTL

**Name:** `auth: player session token expires after TTL`

**Execution:**
```
1. Register player and get session token
2. Immediately use token: GET /tournaments/:id/matches
   Verify: status === 200
3. Wait for token expiration or mock time forward
4. Use same token again
5. Verify: status === 401, 'token expired' or 'invalid token'
```

**Expected Result:** Session tokens expire

**Success Criteria:**
- Session token TTL is enforced
- Expired tokens rejected from protected endpoints

##### 10.3: Token Validation Failures

**Name:** `auth: invalid tokens are rejected appropriately`

**Execution:**
```
Invalid token tests:
1. Malformed token (not JWT format)
   Verify: status === 401, 'invalid token'
2. Tampered token (signature invalid)
   Verify: status === 401, 'invalid signature'
3. Token for wrong tournament
   Verify: status === 403 or 401
4. Organizer token used as player token
   Verify: status === 401, 'invalid token type'
```

**Expected Result:** Invalid tokens consistently rejected

**Success Criteria:**
- JWT signature validation works
- Token type/scope is validated
- Clear error messages for debugging

##### 10.4: Refresh Token Logic (If Implemented)

**Name:** `auth: refresh token extends session without re-login`

**Execution:**
```
If refresh tokens are implemented:
1. Register player, get session + refresh token
2. Use session token (should work)
3. Wait until session token about to expire
4. Use refresh token: POST /auth/refresh
   Verify: status === 200, new session token returned
5. Use new session token (should work)
6. Old session token should be invalidated
```

**Expected Result:** Refresh tokens extend sessions

**Success Criteria:**
- Old token invalidated after refresh
- New token has full TTL
- No need to re-login

##### 10.5: Concurrent Token Usage (Security)

**Name:** `auth: detects concurrent token usage (prevents token hijacking)`

**Execution:**
```
If token security is strict:
1. Player gets session token (Token A)
2. Attacker gets same token (token leaked)
3. Player uses Token A for request (allowed)
4. Attacker simultaneously uses Token A for different request
5. System detects concurrent use:
   - Either reject second request
   - Or invalidate token and require re-login
```

**Expected Result:** Concurrent use detected/prevented

**Success Criteria:**
- Token usage is tracked
- Replay attacks are prevented

---

## Implementation Timeline

### Phase 2 Execution Plan

**Priority 1 (Critical):**
- Gap 1: Email Notifications (2 test scenarios)
- Gap 3: Job Queue Enqueue (4 test scenarios)
- Gap 4: Match Creation (4 test scenarios)

**Priority 2 (Important):**
- Gap 2: SSE Broadcasting (4 test scenarios)
- Gap 5: Participation Validation (3 test scenarios)
- Gap 7: State Machine (3 test scenarios)

**Priority 3 (Nice-to-have):**
- Gap 6: Deadline Timing (4 test scenarios)
- Gap 8: Async Processing (5 test scenarios)
- Gap 9: Bracket Validation (5 test scenarios)
- Gap 10: Token Lifecycle (5 test scenarios)

### Effort Estimate

| Gap | Tests | Estimated Hours | Effort |
|-----|-------|-----------------|--------|
| 1. Email | 3 | 4-6 | Low-Medium |
| 2. SSE | 4 | 6-8 | Medium |
| 3. Job Queue | 4 | 4-6 | Low-Medium |
| 4. Match Creation | 4 | 2-4 | Low |
| 5. Participation | 3 | 2-4 | Low |
| 6. Deadline | 4 | 3-5 | Low |
| 7. State Machine | 3 | 4-6 | Medium |
| 8. Async | 5 | 8-12 | Medium-High |
| 9. Bracket | 5 | 6-10 | Medium |
| 10. Tokens | 5 | 6-10 | Medium |
| **Total** | **40** | **45-71 hours** | **4-9 weeks** |

### Success Criteria for Phase 2

- [ ] All 40 new test scenarios passing
- [ ] Email notifications end-to-end validated
- [ ] SSE real-time broadcasts validated with content
- [ ] Job queue enqueue/processing validated
- [ ] State machine fully tested (no workarounds)
- [ ] All deadline types enforced
- [ ] Token lifecycle tested with expiration
- [ ] Bracket generation and seeding validated
- [ ] Concurrent job processing tested (if applicable)

---

## Appendix: Test Execution Commands

### Run All Phase 1 Tests
```bash
npm test -- --testPathPattern="e2e-tournament-workflow" --verbose
```

### Run Phase 2 Tests (When Implemented)
```bash
npm test -- --testPathPattern="e2e-tournament-workflow|e2e-gap-coverage" --verbose
```

### Run Specific Gap Coverage
```bash
# Email notifications
npm test -- --testNamePattern="email:" --verbose

# SSE events
npm test -- --testNamePattern="sse:" --verbose

# Job queue
npm test -- --testNamePattern="job:" --verbose

# State machine
npm test -- --testNamePattern="state:" --verbose
```

### Generate Coverage Report
```bash
npm test -- --coverage --testPathPattern="e2e"
```

---

## Document Maintenance

**Last Updated:** 2026-05-16  
**Next Review:** After Phase 2 Gap 1-3 implementation  
**Maintained By:** Team  
**Related Documents:**
- IMPLEMENTATION_PLAN.md (Task #20 overview)
- packages/api/src/__tests__/e2e-tournament-workflow.spec.ts (Phase 1 tests)
- ANALYTICS.md (Monitoring/observability for tests)

