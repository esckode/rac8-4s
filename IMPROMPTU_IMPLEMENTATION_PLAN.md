# TDD Implementation Plan: Impromptu Tournaments

## Overview

This document outlines the prioritized implementation roadmap for impromptu tournament functionality, organized by development phases with explicit dependencies. All tasks follow Test-Driven Development (TDD) methodology as defined in TDD_STRATEGY.md.

**Important:** This plan contains **only additional tasks** needed for impromptu tournaments. It does NOT include structured tournament tasks (those are in IMPLEMENTATION_PLAN.md).

**Total scope:** 25 tasks across 5 phases, ~140 tests, 95%+ coverage on business logic

**Architecture:** Option A (monorepo, one API, two frontends, shared database)

---

## Task Template: Project Requirements Integration

**Every task MUST include a "Project Requirements Integration" section with four subsections:**

### Logging Requirements
**Format:** Specify each event to be logged:
```
- Event: `event.name` | Fields: `field1`, `field2`, ... | Log level: info/warn/error
- Event: `...`
- Standard fields (auto-included): `requestId` (via AsyncLocalStorage), `timestamp`
- Never log: passwords, tokens, full email, PII beyond IDs
```

**Reference:** See CLAUDE.md section "Logging Standards" and logs in existing routes (e.g., packages/api/src/routes/tournaments.ts)

### Analytics Requirements
**Format:** Specify metrics to track for business/product insights:
```
- **Metric:** `metric.name` | When: "describe trigger" | Track: `property1`, `property2`
- Format: `{ event, timestamp, key_id, properties: {...} }`
```

**Reference:** See ANALYTICS_STRATEGY.md for business metrics framework

### Coverage Requirements
**Format:** Specific coverage thresholds for this task:
```
- **Line coverage:** ≥X% (or 100% for critical logic)
- **Branch coverage:** Y% (100% for state machines, conditionals)
- Test specific branches: list key decision points
```

**Reference:** See COVERAGE_STRATEGY.md for target modules (standings, bracket, etc.)

### Security Checklist
**Format:** Specific security validations to test:
```
- ✅ Authentication: (what auth method, how verified)
- ✅ Authorization: (what permission check)
- ✅ Input validation: (what constraints, enum values, formats)
- ✅ Data integrity: (what immutability, locking)
- ✅ No information leakage: (error messages, visible fields)
- ✅ SQL injection: (parameterized queries)
- ✅ Concurrency: (race condition handling)
```

**Reference:** See SECURITY.md for vulnerability checklist

---

## Foundation Phase

### Task #1: Create shared locations and courts infrastructure
**Status:** Pending  
**Dependencies:** Structured tournaments foundation (Task #1 from IMPLEMENTATION_PLAN.md)  
**Blocks:** All Phase 1 impromptu tasks (#2-8), Phase 2 (#9-15), Phase 3+ (#16+)

**Description:**
Create locations and courts tables, repositories, and migrations. This infrastructure is shared between structured tournaments (optional location tracking for performance analysis) and impromptu tournaments (required for queue management, capacity tracking).

**Before starting:** `/compact`

**Key deliverables:**
- `db/migrations/005_create_locations.sql` — locations table with coordinates, sport, capacity
- `db/migrations/006_create_courts.sql` — courts table with availability status, linked to locations
- `LocationRepository` class with CRUD operations, capacity calculation
- `CourtRepository` class with availability tracking
- Test factories for locations and courts
- Coverage: 95%+ on repositories

**Test plan:**

*Unit Tests (LocationRepository):*
- Create location with valid coordinates, sport, total courts
- Retrieve location by id and by sport
- Update location details (name, restricted flag, entry conditions)
- Calculate current capacity (total courts - unavailable courts)
- List locations by sport, pagination
- Handle proximity detection (25m x 25m radius)
- Prevent duplicate courts within proximity radius
- Soft delete locations

*Unit Tests (CourtRepository):*
- Create court with status (available/unavailable)
- Update court status (available → unavailable → maintenance)
- Retrieve courts by location
- Calculate impact of court unavailability on location capacity
- Track court availability history (for analytics)

*Integration Tests:*
- Locations and courts work with database transactions
- Capacity calculation updates correctly when courts change status
- Proximity validation prevents duplicates

**Success criteria:** 
- 95%+ test coverage for both repositories
- All CRUD operations tested
- Capacity calculations verified
- Proximity detection working correctly

---

## Project Requirements Integration (Task #1)

### Logging Requirements
Log all location and court operations at `info` level:
- Event: `location.created` | Fields: `locationId`, `sport`, `coordinates`, `totalCourts`, `creatorId` (user who created)
- Event: `location.updated` | Fields: `locationId`, `fieldsChanged`, `userId`
- Event: `court.status_changed` | Fields: `courtId`, `locationId`, `fromStatus`, `toStatus`, `reason` (optional), `userId`
- Event: `capacity.recalculated` | Fields: `locationId`, `previousCapacity`, `newCapacity`, `trigger` (e.g., "court_unavailable")
- All events automatically include: `requestId` (via AsyncLocalStorage), `timestamp`
- No sensitive data: don't log player emails or full names (IDs only)

### Analytics Requirements
Track these metrics per location:
- **Metric:** `location.created` | When organizer/admin creates location | Track: `sport`, `coordinates`
- **Metric:** `location.court_count` | Aggregate: total courts across all locations by sport
- **Metric:** `location.capacity_changes` | When court becomes unavailable/available | Track: `change_type` (unavailable/available), `affected_registrations_count`
- **Metric:** `location.utilization_rate` | (courts_in_use / total_courts) | Daily average
- Use event format: `{ event, timestamp, location_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** ≥95% for LocationRepository and CourtRepository
- **Branch coverage:** 100% for capacity calculation logic (all conditions tested)
- **Integration coverage:** ≥90% for database transaction handling
- **Fail if:** Coverage drops below thresholds (enforce in CI/CD)

### Security Checklist
- ✅ SQL parameterization: all queries use prepared statements (no string concatenation)
- ✅ Input validation: coordinates must be valid lat/long, total_courts must be positive integer
- ✅ Authorization: only location admins can update court status (enforce at API layer)
- ✅ Data validation: proximity check uses precise 25m x 25m calculation (test with known coordinates)
- ✅ No secrets: no API keys, passwords, or tokens stored in location/court records
- ✅ Audit trail: track who created/modified locations and when (via logging above)

---

---

## Phase 1: Impromptu Core Business Logic (TDD-Heavy)

All Phase 1 tasks depend only on #1 and can be parallelized.

### Task #2: Implement impromptu state machine
**Status:** Pending  
**Dependencies:** #1  
**Blocks:** #9 (impromptu endpoints), #16 (impromptu integration tests)

**Description:**
Implement state machine for impromptu tournaments with states: OPEN → CLOSED → COMPLETED. Define state guards, valid transitions, and edge cases specific to impromptu (no registration phases, no group stage advancement logic).

**Before starting:** `/compact`

**Test plan:**

*State Transitions:*
- OPEN (initial state when created)
- CLOSED (when scheduled start time is reached)
- COMPLETED (optional, if tracking results)

*Valid Transitions:*
- OPEN → CLOSED (automatic at scheduled time, or manual close)
- CLOSED → OPEN (reopen request if no one checked in yet)
- CLOSED → COMPLETED (mark finished)

*Guards:*
- Can't create with past scheduled time
- Can't close request before scheduled start time (unless manual)
- Can't transition to COMPLETED until CLOSED

*Edge Cases:*
- Manual close override by requester
- Reopening closed request (only if no one checked in yet)
- No-show removal job triggers at 30 mins after scheduled time

**Success criteria:**
- 100% coverage of state machine
- All valid transitions tested
- All invalid transitions rejected
- Guards enforced correctly

---

## Project Requirements Integration (Task #2)

### Logging Requirements
Log impromptu state transitions at `info` level:
- Event: `impromptu.opened` | Fields: `impromptuId`, `groupId`, `locationId`, `scheduledStartTime`, `createrId`
- Event: `impromptu.closed` | Fields: `impromptuId`, `groupId`, `locationId`, `rsvpCount`, `closedBy` (system or user_id), `trigger` (scheduled_time or manual)
- Event: `impromptu.reopened` | Fields: `impromptuId`, `groupId`, `reopenedBy`
- Event: `impromptu_state_invalid_transition` | Fields: `impromptuId`, `fromState`, `attemptedState`, `reason` | Log at `warn` level
- All events include: `requestId`, `timestamp`

### Analytics Requirements
Track impromptu engagement:
- **Metric:** `impromptu.created` | Track: `groupId`, `locationId`, `sport`, `expectedPlayers` (estimated by time/location)
- **Metric:** `impromptu.state_transition` | Track: `state_from`, `state_to`, `trigger_type` (automatic/manual), `time_in_previous_state_ms`
- **Metric:** `impromptu.invalid_transition_attempt` | Track: `attempted_transition`, `block_reason`
- Format: `{ event, timestamp, impromptu_id, data: {...} }`

### Coverage Requirements
- **Line coverage:** 100% for state machine logic (all branches tested)
- **Branch coverage:** 100% (all valid/invalid transitions, all guards)
- **Condition coverage:** 100% (all boolean conditions for state validity)
- Specific branches to test:
  - OPEN → CLOSED (normal path)
  - OPEN → CLOSED (force close)
  - OPEN → REOPENED (if allowed)
  - CLOSED → COMPLETED
  - Invalid transitions (all 6 total)
  - Time-based guards (scheduled_time < now)
  - Logic guards (can't reopen if players checked in)

### Security Checklist
- ✅ State transitions use enum/constants (not strings, no injection)
- ✅ Scheduled time validation: must be >= current time when creating
- ✅ No state information leaked to unauthorized users (impromptu details only visible to group members)
- ✅ Concurrent transition handling: use database locks/transactions to prevent race conditions
- ✅ Invalid state guard: if impromptu in broken state, clear error message (no internal details)

---

---

### Task #3: Implement queue priority logic
**Status:** Pending  
**Dependencies:** #1  
**Blocks:** #10 (location queue management), #15 (check-in system)

**Description:**
Implement queue priority algorithm for location's interested queue: sort by RSVP priority (yes > tentative > no), then by expected arrival time. Implement no-show removal logic (remove after 30 mins past expected arrival time).

**Before starting:** `/compact`

**Test plan:**

*Queue Sorting:*
- Primary: RSVP status (yes RSVPs before tentative before no)
- Secondary: Expected arrival time (earlier arrivals before later)
- Tertiary: Check-in order (for active waitlist, overrides above)

*No-Show Detection:*
- Mark player as no-show if 30 mins past expected arrival time and not checked in
- Remove from location queue
- Log removal event for analytics

*Priority Calculation:*
- Player with yes RSVP at 6:30pm ranks above tentative at 6:00pm
- Two yes RSVPs sorted by arrival time
- Pre-arranged pairs counted as single queue entry

*Edge Cases:*
- All players have same arrival time (maintain RSVP priority)
- Empty queue
- Single player queue
- All players no-shows
- Early check-in (before expected arrival time)
- Late check-in (after expected arrival time)

**Success criteria:**
- 100% coverage of queue sorting algorithm
- No-show logic works correctly
- Queue ordering verified for all scenarios
- Early/late check-in handling correct

---

## Project Requirements Integration (Task #3)

### Logging Requirements
Log queue operations at `info` level:
- Event: `queue.sorted` | Fields: `locationId`, `impromptuId`, `queueCount`, `rsvpYesCount`, `rsvpTentativeCount`
- Event: `no_show.detected` | Fields: `locationId`, `playerId`, `expectedArrivalTime`, `currentTime`, `minutesLate`
- Event: `no_show.removed` | Fields: `locationId`, `impromptuId`, `playerId`, `reason` (no_show_timeout)
- Event: `queue.priority_recalculated` | Fields: `locationId`, `impromptuId`, `affectedPlayers`, `trigger` (new_rsvp, status_change, no_show)
- All events include: `requestId`, `timestamp`
- No PII: player names/emails not logged (IDs only)

### Analytics Requirements
Track queue behavior and no-shows:
- **Metric:** `queue.no_show_rate` | Calculate: (players_removed_as_no_show / total_rsvps) | Track per location, per date, per sport
- **Metric:** `queue.position_changes` | Track: how many times a player's position changed | Per impromptu
- **Metric:** `queue.rsvp_composition` | Track: % yes vs tentative vs no | Per impromptu
- **Metric:** `queue.sorting_accuracy` | Track: queue sorted correctly | Verify against expected sort order
- **Metric:** `no_show.lateness_distribution` | Histogram: how late were no-shows (5 mins, 10 mins, 15+ mins)
- Format: `{ event, timestamp, location_id, impromptu_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** 100% for queue sorting logic (all comparison branches)
- **Branch coverage:** 100% for:
  - RSVP status comparisons (yes > tentative > no)
  - Arrival time comparisons (earlier > later)
  - No-show detection (time delta calculations)
  - Edge cases (all players same time, all same status, empty queue)
- **Condition coverage:** 100% (all boolean conditions in sort comparator)
- Test specific scenarios:
  - Primary sort: yes RSVPs before tentative before no
  - Secondary sort: within yes, earlier arrivals first
  - No-show: exactly at 30-min threshold, before, after
  - Queue stability: same input produces same output

### Security Checklist
- ✅ No player manipulation: queue is read-only for players (can only modify own RSVP)
- ✅ No information leakage: players can't see others' arrival times (privacy)
- ✅ No timing attacks: no-show removal timing is consistent (always at 30 mins)
- ✅ Data integrity: queue sorting is deterministic (same input = same output)
- ✅ Concurrency: if multiple queue updates at same time, sorting still correct (use locks if needed)
- ✅ No injection: queue data comes from validated RSVP records (no user input)

---

---

### Task #4: Implement doubles pairing logic
**Status:** Pending  
**Dependencies:** #1  
**Blocks:** #11 (match assignment), #15 (check-in system)

**Description:**
Implement auto-matching algorithm for doubles players: given a list of active waitlist players, match them into pairs for 2v2 games. Prioritize pre-arranged pairs, then auto-match individuals looking for partners.

**Before starting:** `/compact`

**Test plan:**

*Pairing Scenarios:*
- 2 pre-arranged pairs → 1 match (pair vs pair)
- 4 individuals looking to pair → 2 pairs → 2 matches
- 1 pre-arranged pair + 2 individuals → 1 match (pair + auto-matched pair)
- 1 pre-arranged pair + 1 individual → can't form match (need 4 players)
- Singles game (match_format=singles) → 1 on 1

*Priority Ordering:*
- Highest priority: pre-arranged pair
- Next: individual looking for partner (matched with next individual)
- Match formation: take highest priority, take next, form match

*Match Assignment:*
- Assign match to available court
- Update queue: removed players marked as "playing"
- Remaining queue updated with new priorities

*Edge Cases:*
- Only 2 players available, location is doubles-only → both opt to play singles
- Only 3 players available → 2 play, 1 waits
- All players pre-arranged → skip auto-matching
- No individuals looking to pair → can't auto-match

**Success criteria:**
- 100% coverage of pairing algorithm
- All pairing scenarios tested
- Priority ordering verified
- Match assignments correct
- Edge cases handled

---

## Project Requirements Integration (Task #4)

### Logging Requirements
Log doubles pairing operations at `info` level:
- Event: `pairing.auto_matched` | Fields: `locationId`, `impromptuId`, `player1Id`, `player2Id`, `matchId`
- Event: `pairing.pre_arranged_confirmed` | Fields: `locationId`, `impromptuId`, `pair1_player1Id`, `pair1_player2Id`, `pair2_player1Id`, `pair2_player2Id`
- Event: `match.formed` | Fields: `locationId`, `impromptuId`, `matchId`, `players` (array of 4 IDs), `pairingType` (pre_arranged, auto_matched, mixed)
- Event: `pairing.insufficient_players` | Fields: `locationId`, `impromptuId`, `availableCount`, `required`, `matchFormat` | Log at `warn` level
- All events include: `requestId`, `timestamp`
- Never log: player names, emails, or relationship details

### Analytics Requirements
Track pairing success and player engagement:
- **Metric:** `pairing.auto_match_success_rate` | Calculate: (successful_auto_matches / attempted) | Per location, per date
- **Metric:** `pairing.pre_arranged_pair_count` | Track: how many pre-arranged pairs per impromptu | Measure group cohesion
- **Metric:** `match.formation_rate` | Calculate: (matches_formed / potential_matches) | Identify capacity bottlenecks
- **Metric:** `pairing.wait_time_to_match` | Track: time from check-in to match formation | Average and percentiles (p50, p95)
- **Metric:** `pairing.mixed_match_rate` | Track: % of matches with mixed pairing types (pre-arranged + auto-matched)
- Format: `{ event, timestamp, location_id, impromptu_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** 100% for pairing algorithm (all branches)
- **Branch coverage:** 100% for:
  - Pre-arranged pair detection (partner ID matching)
  - Singles looking for partner (availability flag)
  - Priority ordering (pre-arranged > singles by queue position)
  - Match formation (4-player grouping for doubles, 2-player for singles)
  - Insufficient player handling (queue and wait)
- **Condition coverage:** 100% (all boolean conditions for pair validity)
- Test all combinations:
  - 2 pre-arranged pairs → 1 match
  - 4 singles → 2 pairs → 1 match
  - 1 pre-arranged pair + 2 singles → 1 match
  - 1 pre-arranged pair + 1 single → can't match (wait)
  - 3 singles → can match 2, wait 1
  - All edge cases (exact powers of 2)

### Security Checklist
- ✅ Partnership verification: pre-arranged pair check validates both players agreed (both in same RSVP or confirmed partnership)
- ✅ No forced pairing: players choose if they want to pair or play singles
- ✅ Privacy: pairing data is player-owned (players see own pairing, not others unless in match)
- ✅ No injection: pairing algorithm only uses validated player IDs from RSVP records
- ✅ Concurrency: if multiple players check in simultaneously, pairing still valid (use queue locks)
- ✅ Data integrity: match record immutable once created (no changing after formation)
- ✅ No timing attacks: pairing logic has consistent runtime (doesn't leak information via timing)

---

---

### Task #5: Implement check-in to active waitlist logic
**Status:** Pending  
**Dependencies:** #1, #2, #3  
**Blocks:** #15 (check-in endpoint), #16 (integration)

**Description:**
Implement check-in logic: player arrives at court, checks in to active waitlist. System tracks check-in time, player preferences (singles/doubles), partnership preference. Automatic transition from location queue to active waitlist.

**Before starting:** `/compact`

**Test plan:**

*Check-in State:*
- Player can check in anytime (before, at, or after expected arrival time)
- Check-in records: timestamp, location, match format preference, pairing preference
- Remove from location queue, add to active waitlist
- Update queue priorities

*Player Preferences:*
- Match format: singles or doubles (inherited from impromptu tournament default)
- Pairing: pre-arranged (with partner ID) or looking to pair
- Expected arrival time: informational only after check-in

*Check-in Validation:*
- Player must be in location queue (RSVP'd)
- Can't check in to wrong location
- Can't check in after tournament CLOSED (but can if still open)

*Active Waitlist Management:*
- Track all checked-in players
- Sort by check-in time (first-come-first-served)
- Form matches when court becomes available
- Auto-match singles when 2 available (or 4 for doubles)

*Edge Cases:*
- Check-in before expected arrival time (allowed)
- Check-in long after expected arrival time (allowed)
- Player never arrives (no-show removal by job after 30 mins)
- Re-check-in (update check-in time? or error?)

**Success criteria:**
- 100% coverage of check-in logic
- State transitions correct (location queue → active waitlist)
- Player preferences captured
- Validation works
- Edge cases handled

---

## Project Requirements Integration (Task #5)

### Logging Requirements
Log check-in operations at `info` level:
- Event: `check_in.completed` | Fields: `locationId`, `impromptuId`, `playerId`, `checkInTime`, `expectedArrivalTime`, `matchFormat`, `pairingPreference`
- Event: `check_in.failed` | Fields: `locationId`, `impromptuId`, `playerId`, `reason` (not_rsvped, wrong_location, tournament_closed) | Log at `warn` level
- Event: `queue.transitioned` | Fields: `locationId`, `impromptuId`, `playerId`, `fromQueue` (location_queue), `toQueue` (active_waitlist), `newPosition`
- Event: `active_waitlist.updated` | Fields: `locationId`, `impromptuId`, `totalCheckedIn`, `readyToMatch`, `stillWaiting`
- All events include: `requestId`, `timestamp`
- Never log: player location details, contact info, or preferences beyond match format

### Analytics Requirements
Track check-in behavior and venue dynamics:
- **Metric:** `check_in.rate` | Calculate: (players_checked_in / total_rsvps) | Per impromptu, per location
- **Metric:** `check_in.timing_distribution` | Histogram: check-in relative to expected arrival (early, on-time, late)
- **Metric:** `check_in.match_format_preference` | Track: % singles vs doubles preference at check-in time
- **Metric:** `active_waitlist.size` | Track: how many players in active waitlist | Measure queue depth over time
- **Metric:** `active_waitlist.time_to_match` | Track: time from check-in to match formation | Average, p50, p95
- Format: `{ event, timestamp, location_id, impromptu_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** 100% for check-in state transition logic
- **Branch coverage:** 100% for:
  - RSVP validation (player in location queue)
  - Location validation (checking in to correct location)
  - Tournament state validation (still OPEN)
  - Match format preference inheritance (default vs override)
  - Pairing preference capture (pre-arranged vs looking)
  - Active waitlist addition (correct positioning)
- **Integration coverage:** ≥90% for database transaction (update RSVP, create waitlist entry, remove from location queue)
- Test scenarios:
  - Check-in before expected arrival time (allowed)
  - Check-in at expected arrival time (allowed)
  - Check-in after expected arrival time (allowed)
  - Check-in to wrong location (error)
  - Check-in without RSVP (error)
  - Duplicate check-in (prevent re-check-in)

### Security Checklist
- ✅ Authentication: player session token required
- ✅ Authorization: can only check in own RSVP (verify playerId from token == rsvp.playerId)
- ✅ Validation:
  - Location must exist
  - Impromptu must be OPEN
  - Player must be in location queue (RSVP'd)
  - Match format must be enum (singles/doubles)
  - Pairing preference must be enum or valid player ID
- ✅ Data integrity: check-in timestamp immutable (created_at not updateable)
- ✅ No information leakage: error messages don't reveal queue position (just "success" or "error")
- ✅ Concurrency: use database transaction to ensure atomic update (remove from location_queue + add to active_waitlist)
- ✅ No timing attacks: check-in processing time consistent regardless of input

---

---

### Task #6: Implement court availability impact on queue
**Status:** Pending  
**Dependencies:** #1, #3, #4  
**Blocks:** #10 (queue management endpoints), #15 (check-in system)

**Description:**
Implement logic to recalculate queue capacity when court availability changes: if a court becomes unavailable, location capacity decreases; if it comes back online, capacity increases. Queue might need to be rebalanced.

**Before starting:** `/compact`

**Test plan:**

*Capacity Impact:*
- Location has 4 courts, 4 players per court = 16 max
- 1 court goes unavailable → capacity = 12
- 1 court comes back → capacity = 16

*Queue Rebalancing:*
- If location at capacity and a court goes down, oldest waiting players notified
- If capacity increases and players are waiting, automatically advance queue

*Court Assignment:*
- When court becomes available, assign to next match in queue
- If court becomes unavailable, clear any pending assignments to that court

*Historical Tracking:*
- Track when courts went unavailable (for analytics)
- Impact on queue wait times

*Edge Cases:*
- All courts go down (location closed)
- Courts come back online in sequence
- Multiple court changes at same time
- Court change while matches in progress

**Success criteria:**
- 100% coverage of capacity recalculation
- Queue rebalancing works correctly
- Court assignments tracked
- No data loss on transitions

---

## Project Requirements Integration (Task #6)

### Logging Requirements
Log court availability impact on location capacity at `info` level:
- Event: `court.unavailable` | Fields: `locationId`, `courtId`, `reason`, `previousCapacity`, `newCapacity`, `affectedImpromptu` (count)
- Event: `court.available` | Fields: `locationId`, `courtId`, `downTimeMinutes`, `previousCapacity`, `newCapacity`, `playersAdvancedFromWaitlist` (count)
- Event: `location.capacity_reduced` | Fields: `locationId`, `sport`, `fromCapacity`, `toCapacity`, `affectedPlayers` (who can't play now), `notificationSent`
- Event: `location.capacity_increased` | Fields: `locationId`, `fromCapacity`, `toCapacity`, `playersReclassified` (from waiting to able_to_play)
- Event: `queue.rebalanced` | Fields: `locationId`, `impromptuId`, `playersMovedFromWaitlist`, `trigger` (court_became_available)
- All events include: `requestId`, `timestamp`

### Analytics Requirements
Track location availability and capacity impact:
- **Metric:** `court.availability` | Track per court: uptime %, downtime duration, frequency of downtime events
- **Metric:** `location.capacity_changes` | Track: when/why capacity changed, impact on queue size
- **Metric:** `location.effective_capacity_utilization` | Calculate: (players_in_matches + waiting) / current_capacity
- **Metric:** `location.downtime_impact` | Calculate: players unable to play due to court unavailability
- **Metric:** `queue.rebalance_frequency` | Track: how often queue rebalanced per impromptu (due to court changes)
- Format: `{ event, timestamp, location_id, court_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** 100% for capacity recalculation logic
- **Branch coverage:** 100% for:
  - Court status transitions (available → unavailable, unavailable → available, maintenance states)
  - Capacity impact calculation (total_courts - unavailable_courts)
  - Queue capacity check (current_queue_size <= new_capacity)
  - Overflow handling (players over capacity classification)
  - Rebalancing decision (should advance waiting players?)
- **Integration coverage:** ≥90% for database transactions (update court, update location capacity, update queue)
- Test scenarios:
  - 1 court down (capacity 4→3)
  - All courts down (capacity 4→0)
  - Rapid court status changes (up, down, up)
  - Court down while matches in progress (should allow current match to finish)
  - Court down when over capacity (who gets removed/moved?)

### Security Checklist
- ✅ Authorization: only location admins can change court status
- ✅ Validation:
  - Court must exist
  - Status must be enum (available/unavailable/maintenance)
  - Location must exist
- ✅ Data integrity:
  - Capacity change logged with before/after values
  - Queue rebalancing is atomic (all or nothing)
  - No players double-assigned to courts
- ✅ Audit trail: track who made capacity changes and when
- ✅ No information leakage: don't expose court maintenance schedule to players
- ✅ Concurrency: use locks when updating court + location capacity together
- ✅ Idempotency: marking court unavailable twice is safe (no side effects)

---

---

### Task #7: Implement structured tournament location support (optional tracking)
**Status:** Pending  
**Dependencies:** #1  
**Blocks:** #9 (tournament endpoints), #16 (integration)

**Description:**
Add optional location_id fields to structured tournaments and matches. Locations are informational only (for performance analysis), not required for tournament logic. Support two modes: organizer-fixed location for whole tournament, or team-chosen location for individual matches.

**Before starting:** `/compact`

**Test plan:**

*Organizer-Fixed Location:*
- Tournament can have location_id (optional)
- All matches inherit tournament location (unless overridden)
- Informational only (doesn't affect match logic)

*Team-Chosen Location:*
- Match can have location_id (optional)
- Players can set location when scheduling match (POST /matches/:id/location)
- Location must be valid (exists in database)

*Validation:*
- Location must exist (if provided)
- Location must support tournament sport (if validation needed)
- Multiple locations per tournament allowed

*Data Integrity:*
- No impact on standings, bracket, match logic
- Location changes don't affect match results
- Deletable without affecting tournament

*Edge Cases:*
- Tournament created without location, then location set
- Location set then deleted (cascade behavior)
- Location unavailable when match scheduled (informational, not blocking)

**Success criteria:**
- 100% coverage of location tracking for structured tournaments
- Optional behavior enforced (no required location fields)
- Data integrity maintained
- No breaking changes to structured tournament logic

---

## Project Requirements Integration (Task #7)

### Logging Requirements
Log optional location tracking for structured tournaments at `debug` level (informational):
- Event: `tournament.location_set` | Fields: `tournamentId`, `locationId`, `sport`, `organizerId`
- Event: `tournament.location_updated` | Fields: `tournamentId`, `oldLocationId`, `newLocationId`
- Event: `match.location_set` | Fields: `tournamentId`, `matchId`, `locationId`, `players` (player IDs), `setBy` (organizer_id or auto)
- Event: `location.tournament_reference` | Fields: `locationId`, `tournamentId`, `matchCount`
- All events include: `requestId`, `timestamp`
- Log level: `debug` (not critical, informational for analytics only)

### Analytics Requirements
Track location usage by structured tournaments (for performance analysis, not operational):
- **Metric:** `tournament.location_coverage` | Calculate: % of tournaments with location set | Track adoption
- **Metric:** `match.location_coverage` | Calculate: % of matches with location set | Track per tournament
- **Metric:** `location.tournament_usage` | Track: which tournaments use which locations | For organizer insights
- **Metric:** `match.location_distribution` | Track: distribution of matches across locations in multi-location tournaments
- Format: `{ event, timestamp, tournament_id, location_id, properties: {...} }` | All analytics at `debug` level

### Coverage Requirements
- **Line coverage:** ≥95% (optional feature, lower bar)
- **Branch coverage:** ≥90% for:
  - Location presence checks (locationId nullable)
  - Tournament-level location defaults
  - Match-level location overrides
  - Null handling (no location specified is valid)
- **Integration coverage:** ≥85% for database (optional foreign key, cascade delete handling)
- Test scenarios:
  - Tournament created without location (valid)
  - Tournament with location, match without (valid)
  - Tournament without location, match with (valid)
  - Location deleted (matches still valid, location_id becomes null)

### Security Checklist
- ✅ No breaking changes: location fields are optional (nullable, not required)
- ✅ Authorization: only organizer can set/update tournament location
- ✅ Validation: location must exist (if provided)
- ✅ Data integrity:
  - Location changes are logged
  - Deletions cascade or null (don't orphan matches)
  - No location data visible to players unless needed
- ✅ No new vulnerabilities: location tracking doesn't expose tournament details
- ✅ Backward compatibility: existing tournaments without location continue to work

---

---

### Task #8: Implement impromptu registration (RSVP) data model
**Status:** Pending  
**Dependencies:** #1, #2  
**Blocks:** #9 (impromptu endpoints), #10 (queue management)

**Description:**
Create impromptu_registrations table and repository to track player RSVPs to impromptu tournaments. Each registration includes: player, impromptu_tournament, RSVP status (yes/no/tentative), expected_arrival_time.

**Before starting:** `/compact`

**Test plan:**

*Registration CRUD:*
- Create registration (player + impromptu tournament)
- Read registration by id, by tournament, by player
- Update RSVP status and arrival time
- Delete registration (withdrawal)

*Validation:*
- Player must exist
- Impromptu tournament must exist and be OPEN
- Can't register same player twice to same tournament
- Can register only to own community group or direct show-up

*RSVP Status:*
- yes: player will play
- tentative: maybe player will play
- no: player won't play (still in queue but lowest priority)

*Expected Arrival Time:*
- Required field (part of registration)
- Can be updated (player changes estimated arrival)
- Used for queue sorting and no-show detection

*Withdrawal:*
- Player can withdraw before tournament CLOSES
- Remove from location queue and active waitlist
- Recalculate queue priorities

*Integration with Locations:*
- Registration adds to location's queue
- Queue sorted by RSVP + arrival time
- Join with locations table for capacity checks

**Success criteria:**
- 100% coverage of impromptu_registrations repository
- CRUD operations tested
- Validation working
- Integration with locations queue correct
- Withdrawal logic tested

---

## Project Requirements Integration (Task #8)

### Logging Requirements
Log impromptu registration operations at `info` level:
- Event: `registration.created` | Fields: `impromptuId`, `playerId`, `rsvpStatus`, `expectedArrivalTime`, `groupId` (if applicable)
- Event: `registration.updated` | Fields: `impromptuId`, `playerId`, `fieldChanged` (rsvp_status, arrival_time), `oldValue`, `newValue`
- Event: `registration.withdrawn` | Fields: `impromptuId`, `playerId`, `reason` (optional)
- Event: `registration.validation_failed` | Fields: `impromptuId`, `playerId`, `error` (duplicate, tournament_closed, invalid_arrival_time) | Log at `warn` level
- All events include: `requestId`, `timestamp`
- Never log: full player details, only IDs

### Analytics Requirements
Track registration engagement and validity:
- **Metric:** `registration.create_rate` | Track: registrations per impromptu over time | Per location, per group
- **Metric:** `registration.rsvp_status_distribution` | Track: yes vs tentative vs no percentages | Per impromptu
- **Metric:** `registration.withdrawal_rate` | Calculate: (withdrawals / total_registrations) | Identify if players uncommit
- **Metric:** `registration.invalid_attempts` | Track: how many failed registrations (duplicate, closed tournament, etc.)
- **Metric:** `arrival_time_spread` | Histogram: how spread out are expected arrivals (all within 10 mins, or 30 mins?)
- Format: `{ event, timestamp, impromptu_id, group_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** 100% for impromptu_registrations CRUD
- **Branch coverage:** 100% for:
  - Create: validation (player exists, impromptu exists, not duplicate, valid RSVP status, valid arrival time)
  - Update: validation (can update if tournament still OPEN, valid new values)
  - Delete/Withdrawal: allowed anytime (soft delete or flag)
  - Query: by impromptu, by player, by status
- **Integration coverage:** ≥95% with database and location queue
- All CRUD operations: create, read by id, read by impromptu, read by player, update, delete, list
- Validation tests: duplicate RSVP, invalid RSVP status, past arrival time, future arrival time, etc.

### Security Checklist
- ✅ Uniqueness: prevent duplicate registrations (player can't RSVP twice to same impromptu)
- ✅ Validation:
  - Player must exist
  - Impromptu must exist
  - RSVP status must be enum (yes/no/tentative)
  - Expected arrival time must be valid ISO datetime
  - Arrival time >= impromptu.scheduledStartTime
- ✅ Authorization: withdrawal only by own registration (enforce in endpoint layer)
- ✅ Data integrity: registration timestamp immutable (created_at not updateable)
- ✅ No information leakage: don't expose arrival times of other players
- ✅ Cascade handling: if impromptu deleted, registrations should be deleted/nullified
- ✅ Concurrency: use unique constraint at database level to prevent duplicate RSVP

---

---

## Phase 2: Community Groups and Impromptu Tournament Management

### Task #9: Implement community groups (social groups) and membership
**Status:** Pending  
**Dependencies:** #1, #2, #8  
**Blocks:** #10 (impromptu endpoints), #16 (integration)

**Description:**
Create community_groups and community_group_members tables with CRUD operations. Community groups are social groups separate from tournament groups. Features: invite-only membership, default sport and court, create impromptu tournament requests.

**Before starting:** `/compact`

**Test plan:**

*Community Group CRUD:*
- Create group (name, default sport, default location, restricted flag)
- Read group by id
- Update group details (name, default sport, default court)
- Delete group (soft delete)
- List groups by creator or member

*Membership Management:*
- Add member to group (by email or player id)
- Remove member from group
- List group members
- Track join date

*Invite-Only Access:*
- Non-members can't see group details
- Non-members can't RSVP to group's impromptu tournaments
- Organizer/creator can invite members
- Members can view group and create impromptu requests

*Default Values:*
- Group has default sport (e.g., "pickleball")
- Group has default location (home court)
- Impromptu requests inherit defaults (can override)

*Validation:*
- Group name must be unique (per creator or globally?)
- Default location must exist
- Default sport must be valid

*Group Statistics:*
- Member count
- Number of impromptu tournaments created
- Historical turnout rate (for analytics)

**Success criteria:**
- 95%+ coverage of community groups repository
- All CRUD operations tested
- Membership management working
- Invite-only enforcement verified
- Default value handling correct

---

## Project Requirements Integration (Task #9)

### Logging Requirements
Log community group operations at `info` level:
- Event: `group.created` | Fields: `groupId`, `groupName`, `creatorId`, `sport`, `defaultLocationId`, `restricted`
- Event: `group.updated` | Fields: `groupId`, `fieldChanged` (name, sport, location, restricted), `oldValue`, `newValue`, `updatedBy`
- Event: `group_member.added` | Fields: `groupId`, `playerId`, `addedBy` (creator or invited player), `invitationSent` (true/false)
- Event: `group_member.removed` | Fields: `groupId`, `playerId`, `removedBy`, `reason` (self_removal, admin_removal)
- Event: `group.deleted` | Fields: `groupId`, `deletedBy`, `memberCount`
- Event: `group.access_denied` | Fields: `groupId`, `playerId`, `reason` (not_member, invite_only) | Log at `warn` level
- All events include: `requestId`, `timestamp`

### Analytics Requirements
Track community group growth and engagement:
- **Metric:** `group.creation_rate` | Track: new groups created per week | Measure adoption
- **Metric:** `group.member_growth` | Track: members added per group over time
- **Metric:** `group.member_retention` | Calculate: % of members who participate in 2+ impromptu tournaments
- **Metric:** `group.impromptu_creation_rate` | Track: impromptu tournaments created per group | Measure activity
- **Metric:** `group.average_size` | Calculate: average member count per group
- **Metric:** `group.inactive_groups` | Identify: groups with no impromptu created in 30+ days
- Format: `{ event, timestamp, group_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** ≥95% for community groups CRUD
- **Branch coverage:** ≥90% for:
  - Create: validation (name unique per creator?, valid sport, valid location)
  - Read: by id, by creator, by member (authorization checks)
  - Update: only creator can update (authorization)
  - Delete: soft delete, cascade handling for members
  - Membership: add, remove, list, verify membership
  - Invite-only: enforce (only members can see group details)
- **Integration coverage:** ≥85% with community_group_members join table
- Test: CRUD, membership management, invite-only enforcement, default values

### Security Checklist
- ✅ Authentication: creator must be authenticated to create group
- ✅ Authorization:
  - Only group creator can update group
  - Only group creator can remove members
  - Only group members can view group details
  - Non-members get "not found" (don't leak existence)
- ✅ Validation:
  - Group name must be non-empty string
  - Sport must be valid enum
  - Default location must exist (if provided)
  - Restricted flag must be boolean
- ✅ Membership validation:
  - Member must exist (player.id must be valid)
  - No duplicate memberships (unique constraint)
- ✅ Data integrity:
  - Soft delete group (don't cascade delete members, keep history)
  - Track member join dates
- ✅ No information leakage: non-members see 404 not "access denied"
- ✅ Invite management: track invitation tokens/links if needed (future)

---

---

### Task #10: Implement impromptu request creation and RSVP endpoints
**Status:** Pending  
**Dependencies:** #1, #2, #3, #8, #9  
**Blocks:** #15 (check-in), #16 (integration)

**Description:**
Implement API endpoints for creating impromptu tournament requests and managing RSVPs. Endpoints: POST /impromptu (create request), GET /impromptu/:id/queue (view location queue), POST /impromptu/:id/rsvp (RSVP), PATCH /impromptu/:id/rsvp (update RSVP), DELETE /impromptu/:id/rsvp (withdraw).

**Before starting:** `/compact`

**Test plan:**

*POST /impromptu - Create Request:*
- Authenticated as community group member
- Specify: group, date, time (scheduled start), optional description
- Location and sport inherited from group (can override)
- Returns: impromptu tournament id, queue status
- Requester's arrival time stored with first RSVP
- Authorization: only group members can create
- Error: group doesn't exist, user not in group, location unavailable

*GET /impromptu/:id/queue - View Location Queue:*
- Show location queue sorted by priority (RSVP + arrival time)
- Include: player name, RSVP status, expected arrival time, current position
- Show: queue count, capacity, available spots
- Authorization: only group members can see queue
- Real-time queue order (recomputed on request)

*POST /impromptu/:id/rsvp - Create RSVP:*
- Player specifies: RSVP status (yes/no/tentative), expected arrival time
- Create registration, add to location queue
- Authorization: any player can RSVP to group request or direct show-up
- Validation: tournament still OPEN
- Error: tournament CLOSED, invalid RSVP status, duplicate RSVP

*PATCH /impromptu/:id/rsvp - Update RSVP:*
- Change RSVP status or expected arrival time
- Re-sort queue
- Authorization: only own RSVP can be updated
- Error: tournament CLOSED, invalid status

*DELETE /impromptu/:id/rsvp - Withdraw:*
- Remove from location queue and any active waitlist assignments
- Authorization: only own RSVP can be deleted
- Error: tournament CLOSED (can't withdraw after close time)

*Error Cases:*
- Tournament CLOSED (RSVP after scheduled start time)
- Location at capacity (still allow RSVP, put in queue)
- Invalid location or group
- Duplicate RSVPs

*Real-time Updates:*
- Queue changes trigger updates (WebSocket broadcast in Phase 4)
- No-show removal triggers queue recalculation

**Success criteria:**
- All endpoints return correct status codes
- Authorization enforced
- Queue calculations correct
- RSVP management working
- Error handling comprehensive

---

## Project Requirements Integration (Task #10)

### Logging Requirements
Log all impromptu RSVP operations at `info` level (per CLAUDE.md):
- Event: `rsvp.submitted` | Fields: `impromptuId`, `playerId`, `rsvpStatus` (yes/no/tentative), `expectedArrivalTime`, `groupId` (if applicable)
- Event: `rsvp.updated` | Fields: `impromptuId`, `playerId`, `oldStatus`, `newStatus`, `oldArrivalTime`, `newArrivalTime`
- Event: `rsvp.withdrawn` | Fields: `impromptuId`, `playerId`, `reason` (optional)
- Event: `queue.position_changed` | Fields: `impromptuId`, `playerId`, `oldPosition`, `newPosition`, `trigger` (new_rsvp, status_change, no_show_removed)
- Error event: `rsvp.rejected` | Fields: `impromptuId`, `playerId`, `errorCode`, `errorMessage` | Log at `warn` level
- All events include: `requestId` (auto-injected), `timestamp`
- Never log: player email, phone, or full registration details (IDs only)

### Analytics Requirements
Track RSVP behavior for impromptu response rate analysis:
- **Metric:** `rsvp.submitted` | Track: `impromptuId`, `rsvpStatus`, `timeToRsvp_minutes` (since impromptu created)
- **Metric:** `rsvp.response_rate` | Calculate: (yes + tentative) / (yes + no + tentative) | Per impromptu, per group, per location, per day
- **Metric:** `rsvp.withdrawal_rate` | Track: withdrawal count / total rsvps | Identify if players are withdrawing last-minute
- **Metric:** `queue.position` | Track: queue position when RSVP submitted (for wait time analysis)
- **Metric:** `expected_arrival_time_distribution` | Histogram: how spread out are players' expected arrival times
- Format for all: `{ event, timestamp, impromptu_id, group_id, properties: {...} }`

### Coverage Requirements
- **Endpoint coverage:** ≥95% (all happy paths, error paths, validation)
- **Authorization coverage:** 100% (group membership check, direct show-up check)
- **Validation coverage:** 100% (all input validation branches: invalid status, past deadline, duplicate RSVP, etc.)
- **Integration coverage:** ≥90% (database writes, queue recalculation)
- Test must verify:
  - POST /impromptu/:id/rsvp: 5+ tests (valid, invalid status, tournament closed, duplicate, unauthorized)
  - PATCH /impromptu/:id/rsvp: 4+ tests (update valid, tournament closed, unauthorized, not found)
  - DELETE /impromptu/:id/rsvp: 3+ tests (withdrawal valid, tournament closed, not found)
  - GET /impromptu/:id/queue: 3+ tests (permission, sorting, empty queue)

### Security Checklist
- ✅ Authentication: player session token required (verify JWT valid)
- ✅ Authorization: 
  - RSVP to group impromptu: verify player is group member
  - RSVP to direct show-up: no auth required, self-service
  - PATCH/DELETE own RSVP only: verify ownership (playerId from token == rsvp.playerId)
- ✅ Input validation:
  - rsvpStatus must be enum: 'yes' | 'no' | 'tentative' (no arbitrary strings)
  - expectedArrivalTime must be valid ISO datetime, >= impromptu.scheduledStartTime
  - playerId must be valid UUID
  - impromptuId must be valid UUID
- ✅ Data integrity: RSVP timestamp immutable (created_at not updateable)
- ✅ Rate limiting: Prevent RSVP spam (e.g., max 10 RSVP changes per user per impromptu)
- ✅ No information leakage: Error messages don't reveal whether impromptu exists (just "not found")
- ✅ SQL injection: all queries parameterized (no string building)
- ✅ Concurrency: use database row locks when updating queue positions

---

---

### Task #11: Implement direct show-up for non-group players
**Status:** Pending  
**Dependencies:** #1, #2, #3, #8, #10  
**Blocks:** #15 (check-in), #16 (integration)

**Description:**
Allow non-group members to directly show up at a location and join the interested queue. Direct show-ups are self-service (no approval needed) unless the location is restricted. They go into the same location queue as group members and can participate in impromptu tournaments.

**Before starting:** `/compact`

**Test plan:**

*Direct Show-Up RSVP:*
- POST /locations/:id/show-up
- Specify: expected arrival time, match format preference, pairing preference
- Create registration directly to location (no impromptu tournament reference)
- Authorization: any player (no group membership needed)
- Add to location's interested queue

*Restricted Location Handling:*
- If location restricted, check entry conditions
- Entry conditions are text description (informational, not enforced)
- Allow show-up but flag with warning
- Could add enforcement later

*Queue Integration:*
- Direct show-ups merge with group-based registrations
- Same queue (location queue, not impromptu_registrations)
- Sort by RSVP priority + arrival time

*Location Association:*
- Direct show-ups create registration but with null impromptu_tournament_id
- Can distinguish from impromptu tournament registrations

*Withdrawal:*
- Player can withdraw from location queue anytime before tournament CLOSES
- Error: location queue closed (after scheduled end time)

*Capacity Enforcement:*
- Show-ups allowed even if location at capacity
- Put in waiting queue
- Advance when court becomes available

*Edge Cases:*
- Show-up to restricted location without entry (allowed, flagged)
- Show-up to location with no active impromptu tournaments
- Multiple locations with same coordinates (proximity check prevents duplicates, but could have different sports)

**Success criteria:**
- Direct show-up endpoint working
- Merged queue calculations correct
- Restricted location handling correct
- No conflicts with group-based registrations
- Withdrawal logic correct

---

## Project Requirements Integration (Task #11)

### Logging Requirements
Log direct show-up operations at `info` level:
- Event: `show_up.request_submitted` | Fields: `locationId`, `playerId`, `expectedArrivalTime`, `matchFormat`, `pairingPreference` (if doubles)
- Event: `show_up.restricted_location_warning` | Fields: `locationId`, `restrictedFlag`, `entryConditions`, `playerId` | Log at `info` (allowed but flagged)
- Event: `show_up.merged_to_queue` | Fields: `locationId`, `playerId`, `position`, `queueType` (impromptu_tournament, direct_show_up)
- Event: `show_up.withdrawal` | Fields: `locationId`, `playerId`, `reason` (player_withdrawn)
- Event: `show_up.rejected` | Fields: `locationId`, `playerId`, `reason` (location_not_found, invalid_location) | Log at `warn` level
- All events include: `requestId`, `timestamp`
- Never log: personal details beyond IDs

### Analytics Requirements
Track direct show-up engagement and capacity impact:
- **Metric:** `show_up.submission_rate` | Track: direct show-ups per location per day | Measure non-group participation
- **Metric:** `show_up.show_up_rate` | Calculate: (players_checked_in / show_ups_submitted) | Measure commitment level
- **Metric:** `show_up.queue_percentage` | Calculate: % of location queue from direct show-ups vs impromptu tournaments
- **Metric:** `location.open_vs_group_ratio` | Track: direct show-ups vs group-based registrations | Per location
- **Metric:** `restricted_location_show_ups` | Track: show-ups to restricted locations (informational)
- Format: `{ event, timestamp, location_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** ≥95% for direct show-up endpoint
- **Branch coverage:** ≥90% for:
  - Location validation (must exist)
  - Restricted location handling (allow but flag)
  - RSVP creation (success path)
  - Queue merging (correct positioning relative to group registrations)
  - Error handling (invalid location, duplicate show-up?, etc.)
- **Integration coverage:** ≥90% with impromptu_registrations and location queue
- Test scenarios:
  - Show-up to valid location (success)
  - Show-up to non-existent location (error)
  - Show-up to restricted location (allowed, flagged)
  - Duplicate show-up (prevent or update?)
  - Show-up to location with no active impromptu (allowed, wait for any)

### Security Checklist
- ✅ No authentication required: direct show-ups are self-service (public)
- ✅ Validation:
  - Location must exist (if doesn't, reject)
  - Expected arrival time must be valid ISO datetime
  - Match format must be enum (singles/doubles)
  - Pairing preference must be enum or valid player ID
- ✅ Data collection: minimal (no email required, just ID if player account exists)
- ✅ No information leakage: don't expose who else is going
- ✅ Queue merging: show-ups sorted same as group registrations (RSVP status + arrival time)
- ✅ Concurrency: use database transaction to ensure atomic RSVP creation
- ✅ Restricted locations: allow show-up but don't enforce conditions (informational only)
- ✅ Rate limiting: prevent spam (e.g., max 10 show-ups per user per day)

---

---

### Task #12: Implement location queue management and updates
**Status:** Pending  
**Dependencies:** #1, #3, #6, #10, #11  
**Blocks:** #15 (check-in), #16 (integration)

**Description:**
Implement location queue as a computed view: real-time queue of all players interested in playing at a location (from both impromptu registrations and direct show-ups). Queue is sorted by priority and used for check-in and match assignment.

**Before starting:** `/compact`

**Test plan:**

*Queue Computation:*
- Fetch all registrations for location + date (impromptu_registrations + direct show-ups)
- Filter to OPEN impromptu tournaments only
- Sort by: RSVP status (yes > tentative > no), then expected arrival time
- Compute position in queue
- Calculate available spots (capacity - players already playing)

*Queue Representation:*
```typescript
interface LocationQueue {
  locationId: string
  date: string
  totalCapacity: number
  availableSpots: number
  queueCount: number
  entries: [{
    playerId: string
    playerName: string
    rsvpStatus: 'yes' | 'tentative' | 'no'
    expectedArrivalTime: string
    position: number
    checkedIn: boolean
    checkedInTime?: string
    matchFormat: 'singles' | 'doubles'
    pairingPreference?: 'pre-arranged' | 'looking'
  }]
}
```

*Real-Time Queue:*
- Queue is computed on-demand (not cached)
- Used for display and match assignment
- Reflects current state (no-shows removed, arrivals processed)

*No-Show Removal:*
- Job runs periodically to remove no-shows
- Player not checked in 30 mins after expected arrival → removed
- Triggers queue recomputation
- Remaining players advance in queue

*Queue Locking:*
- During match assignment, queue is "locked" (read-only for brief moment)
- Prevents concurrent assignments to same court
- Then "unlocked" with updated positions

*Edge Cases:*
- Empty queue (no players)
- All no's (no yes/tentative players)
- Capacity = 0 (all courts down)
- Multiple impromptu tournaments same location same time (all in same queue)

**Success criteria:**
- Queue computation correct for all scenarios
- Real-time updates working
- No-show removal integrated
- Edge cases handled
- Performance acceptable (queue computed quickly)

---

## Project Requirements Integration (Task #12)

### Logging Requirements
Log location queue operations at `debug` level (high frequency, informational):
- Event: `queue.computed` | Fields: `locationId`, `impromptuId`, `totalQueueSize`, `availableSpots`, `rsvpYes`, `rsvpTentative`, `rsvpNo`
- Event: `queue.no_show_detected` | Fields: `locationId`, `impromptuId`, `playerId`, `minutesLate`, `action` (removed)
- Event: `queue.recomputed` | Fields: `locationId`, `impromptuId`, `trigger` (no_show_removal, court_became_available, new_rsvp), `affectedPlayers`
- All events include: `requestId`, `timestamp`
- Log level: `debug` (not critical, high volume)

### Analytics Requirements
Track queue health and performance:
- **Metric:** `queue.size` | Track: queue length over time | Per location, per impromptu, per sport
- **Metric:** `queue.composition` | Track: RSVP status breakdown (% yes, tentative, no)
- **Metric:** `queue.turnaround_time` | Track: time from RSVP to check-in to match formation
- **Metric:** `queue.capacity_utilization` | Calculate: (queue_size) / (location_capacity) | Measure if always full
- **Metric:** `queue.empty_periods` | Track: impromptu tournaments with no RSVPs | Identify low-demand times
- Format: `{ event, timestamp, location_id, impromptu_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** ≥95% for queue computation logic
- **Branch coverage:** ≥90% for:
  - Queue filtering (only OPEN impromptu registrations)
  - Queue sorting (RSVP status > arrival time)
  - Capacity calculation (available spots logic)
  - No-show detection (30-min threshold)
  - Edge cases (empty queue, all same status, multiple impromptu at location)
- **Performance coverage:** queue computes in <100ms for 100 players
- Test scenarios:
  - Multiple impromptu tournaments at same location
  - Empty queue (no RSVPs)
  - All yes, all tentative, all no
  - Mixed sports at location
  - No-show removal during computation

### Security Checklist
- ✅ Authorization: players only see their own position (not full queue details if privacy concern)
- ✅ No information leakage: don't expose exact arrival times of other players (just relative order)
- ✅ Computation consistency: same input = same output (deterministic sort)
- ✅ Data integrity: queue is read-only computed view (no updates, no stale data)
- ✅ Concurrency: queue computation is read-only (safe for parallel access)
- ✅ Performance: queue computation doesn't timeout (lazy evaluation if queue large)
- ✅ No injection: queue data comes from validated RSVP records

---

---

### Task #13: Implement impromptu state machine job (close requests at scheduled time)
**Status:** Pending  
**Dependencies:** #1, #2, #9, #13 from IMPLEMENTATION_PLAN.md  
**Blocks:** #15 (check-in), #16 (integration)

**Description:**
Implement async job to close impromptu tournament requests when scheduled start time is reached. Job runs periodically (every minute), finds OPEN impromptu tournaments with scheduled time in past, marks them CLOSED.

**Before starting:** `/compact`

**Test plan:**

*Job Execution:*
- Find all OPEN impromptu tournaments with scheduled_start_time < NOW
- Mark them CLOSED
- Trigger no-show removal job for this location
- Log closed tournaments
- Idempotent (running twice doesn't double-close)

*Idempotency:*
- Same tournament closed by job multiple times → still CLOSED, no side effects
- No duplicate job failures

*No-Show Trigger:*
- When impromptu closes, trigger no-show removal job for location
- Removes players who didn't check in 30 mins past their expected arrival

*Timing:*
- Job should run every 1-5 minutes (configurable)
- Close happens within 5 minutes of scheduled time (acceptable delay)

*Edge Cases:*
- No impromptu tournaments to close
- Multiple tournaments closing at same time
- Scheduled time exactly at job run time (off-by-one handling)
- Tournament already CLOSED (idempotency check)

**Success criteria:**
- Job closes requests at correct time
- Idempotency verified
- No-show job triggered correctly
- All edge cases handled
- Logging adequate for debugging

---

## Project Requirements Integration (Task #13)

### Logging Requirements
Log async job operations at `info` level:
- Event: `job.impromptu_closer_started` | Fields: `jobId`, `impromptuCount`, `trigger` (scheduled)
- Event: `impromptu.closed_by_job` | Fields: `impromptuId`, `locationId`, `groupId`, `rsvpCount`, `checkInCount`
- Event: `job.no_show_removal_triggered` | Fields: `impromptuId`, `locationId`, `playersToCheck`
- Event: `job.impromptu_closer_completed` | Fields: `jobId`, `closedCount`, `durationMs`, `errors` (if any)
- Event: `job.impromptu_closer_failed` | Fields: `jobId`, `error`, `attemptNumber`, `willRetry` | Log at `error` level
- All events include: `requestId` (job-scoped), `timestamp`
- Never log: full player details

### Analytics Requirements
Track job execution and impromptu lifecycle:
- **Metric:** `job.execution_frequency` | Track: how often job runs (should be consistent)
- **Metric:** `impromptu.auto_close_latency` | Track: time between scheduledStartTime and actual close | Should be <5 mins
- **Metric:** `impromptu.close_trigger_type` | Track: scheduled auto-close vs manual close | Measure if players need early close
- **Metric:** `job.reliability` | Track: success rate, failure rate, retry rate | Alert if <99%
- **Metric:** `no_show.removal_volume` | Track: players removed as no-show per run | Measure flakiness
- Format: `{ event, timestamp, job_id, impromptu_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** ≥95% for job execution logic
- **Branch coverage:** ≥90% for:
  - Job start/scheduling
  - Impromptu query (find OPEN with scheduledStartTime <= now)
  - State transition (OPEN → CLOSED)
  - No-show job triggering
  - Idempotency check (don't double-close)
  - Error handling and retry
- **Mocking coverage:** 100% (mock BullMQ, database, don't use real job queue)
- Test scenarios:
  - No impromptu to close (safe to run with nothing)
  - Multiple impromptu to close (batch them)
  - Job runs exactly at scheduled time
  - Job runs late (impromptu already past time, still close)
  - Concurrent job runs (idempotent)
  - Job failure and retry

### Security Checklist
- ✅ Job scheduling: runs on schedule, can't be triggered by users
- ✅ Authorization: job runs as system (no auth context), changes state directly
- ✅ Idempotency: running job twice doesn't double-close impromptu
- ✅ Data integrity: state change is atomic (OPEN → CLOSED is all-or-nothing)
- ✅ Error handling: job failures logged, retried with backoff, eventually DLQ
- ✅ No information leakage: error messages don't expose internal details
- ✅ Timing: job execution time is consistent (no timing attacks)
- ✅ Concurrency: database locks prevent race conditions with manual closes

---

---

## Phase 3: Check-In and Match Assignment System

### Task #14: Implement check-in endpoint and active waitlist management
**Status:** Pending  
**Dependencies:** #1, #2, #3, #4, #5, #8, #10  
**Blocks:** #15 (match assignment), #16 (integration)

**Description:**
Implement POST /locations/:id/check-in endpoint for players to check in to active waitlist. Manage active waitlist state, form matches, assign courts. Real-time queue updates after each check-in.

**Before starting:** `/compact`

**Test plan:**

*POST /locations/:id/check-in:*
- Authenticated as player who RSVP'd to location
- Specify: match format preference (singles/doubles), pairing preference (if doubles)
- Create active waitlist entry (timestamp, location, preferences)
- Remove from location queue
- Return: position in active waitlist, wait estimate
- Authorization: player must be in location queue (RSVP'd)
- Error: player not RSVP'd, tournament not OPEN, location doesn't exist

*Active Waitlist State:*
- Track all checked-in players awaiting assignment
- Ordered by check-in time (first-come-first-served)
- Separate from location queue (location queue = all interested, active waitlist = checked in)

*Match Formation:*
- When players check in, attempt to form matches
- 2 singles players (or 1 pre-arranged pair) → assign to available court
- 4 doubles players (2 pairs, or 4 individuals) → assign to court
- Call match formation algorithm (Task #4 logic)

*Court Assignment:*
- Assign match to next available court at location
- Update court: mark as "in use" or track match in progress
- Remove players from active waitlist
- Broadcast match assignment (WebSocket in Phase 4)

*Wait Estimate:*
- Based on capacity and current queue
- "Your turn in 3 matches (~15 minutes)"
- Update in real-time as other players check in/finish

*Waiting Players:*
- Players not yet matched stay in active waitlist
- Not removed from queue (still first-come-first-served)
- Can cancel check-in (go back to location queue and withdraw?)

*Edge Cases:*
- Check-in with 0 available courts (all in use)
- Check-in and immediately form match (available court)
- Pre-arranged pair both check in at same time
- One player from pair checks in (other hasn't arrived)
- Players prefer singles but location is doubles-only → allow singles as fallback
- Early check-in (before expected arrival time)

**Success criteria:**
- Check-in endpoint working correctly
- Active waitlist managed correctly
- Match formation triggered at right time
- Court assignments correct
- Wait estimates reasonable
- Edge cases handled

---

## Project Requirements Integration (Task #14)

### Logging Requirements
Log check-in operations at `info` level:
- Event: `check_in.success` | Fields: `locationId`, `impromptuId`, `playerId`, `checkInTime`, `position` (in active waitlist), `waitEstimate`
- Event: `check_in.match_formation_triggered` | Fields: `locationId`, `impromptuId`, `matchFormationType` (singles, doubles, mixed)
- Event: `active_waitlist.player_added` | Fields: `locationId`, `impromptuId`, `playerId`, `matchFormat`, `pairingPreference`
- Event: `active_waitlist.updated` | Fields: `locationId`, `impromptuId`, `totalWaiting`, `readyToPlay`, `estimate_ms`
- Event: `check_in.failed` | Fields: `locationId`, `impromptuId`, `playerId`, `reason` (not_in_queue, tournament_closed) | Log at `warn` level
- All events include: `requestId`, `timestamp`

### Analytics Requirements
Track check-in flow and match formation:
- **Metric:** `check_in.volume` | Track: players checked in per impromptu | Per location, per sport
- **Metric:** `active_waitlist.depth` | Track: how many players waiting at any given time | Measure queue depth
- **Metric:** `match.formation_latency` | Track: time from check-in to match formation | Average, p50, p95
- **Metric:** `wait_time_estimate_accuracy` | Track: predicted wait vs actual wait | Measure if estimates correct
- **Metric:** `match_format_distribution` | Track: % singles vs doubles matches formed
- Format: `{ event, timestamp, location_id, impromptu_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** ≥95% for check-in endpoint
- **Branch coverage:** ≥90% for:
  - Player in queue validation
  - Tournament OPEN validation
  - Active waitlist creation
  - Location queue removal
  - Match formation triggering (can form? how many players available?)
  - Wait estimate calculation
  - Error cases (not in queue, tournament closed, etc.)
- **Integration coverage:** ≥90% (database transaction for queue update)
- Test scenarios:
  - Check-in when 2 players available (form singles match)
  - Check-in when 4 players available (form doubles match)
  - Check-in when 1 player available (wait, no match yet)
  - Check-in tournament already CLOSED (error)
  - Check-in not in location queue (error)
  - Multiple check-ins in sequence (positions update)

### Security Checklist
- ✅ Authentication: player session token required
- ✅ Authorization: can only check in own RSVP (verify playerId from token)
- ✅ Validation:
  - Location must exist
  - Impromptu must be OPEN
  - Player must be in location queue
  - Match format/pairing preferences must be valid enums
- ✅ Data integrity: active waitlist entry is immutable (created_at not updateable)
- ✅ Concurrency: use database transaction to ensure atomic update (remove from location_queue + add to active_waitlist)
- ✅ No information leakage: don't expose other players in active waitlist
- ✅ Wait estimates: don't expose exact match timing (rough estimates OK)
- ✅ Rate limiting: prevent check-in spam (already in queue, can't check in twice)

---

---

### Task #15: Implement match assignment and court occupation tracking
**Status:** Pending  
**Dependencies:** #1, #2, #4, #6, #14  
**Blocks:** #16 (integration), Phase 4 (frontend)

**Description:**
Implement match assignment: take players from active waitlist, form matches using pairing logic (Task #4), assign to available courts, track court occupation. Courts transition from available → in_use → available.

**Before starting:** `/compact`

**Test plan:**

*Match Formation Process:*
- Take top 2-4 players from active waitlist (based on match format)
- Respect pairing preferences (pre-arranged pairs together)
- Create match record (or reuse if possible, or new table?)
- Assign to next available court
- Mark court as occupied
- Update active waitlist: remove matched players
- Update location queue: advance remaining players

*Court Tracking:*
- Court status: available, in_use, unavailable (maintenance)
- When match starts: court.status = in_use, court.current_match_id = match_id
- When match ends: court.status = available, court.current_match_id = null
- Unavailable courts skipped (capacity already reduced)

*Match Duration:*
- Expected match duration (configurable by sport, default 30 mins)
- Time when court expected to be free
- Used for wait estimates

*Queue Advancement:*
- After match assigned, remaining queue players advance positions
- Real-time position updates (WebSocket broadcast)
- Recalculate wait times

*Multiple Courts:*
- Location with 4 courts → can run 4 matches in parallel
- Active waitlist advances 4 players at a time (or 8 for doubles)

*No Match Possible:*
- If <2 singles players or <4 doubles players waiting
- Wait until more players arrive or no-show removed

*Edge Cases:*
- All courts in use (queue waits)
- Court becomes available while match formation in progress (race condition)
- Player cancels after checked in (remove from active match? or error?)
- Incorrect player count for match type (validation)

**Success criteria:**
- Match assignment algorithm working correctly
- Court occupation tracked accurately
- Queue advancement correct
- No-match scenarios handled
- Race conditions prevented
- All edge cases tested

---

## Project Requirements Integration (Task #15)

### Logging Requirements
Log match assignment operations at `info` level:
- Event: `match.assigned` | Fields: `locationId`, `impromptuId`, `matchId`, `courtId`, `players` (array of 4 IDs for doubles, 2 for singles), `matchFormat`, `expectedDuration`
- Event: `court.occupied` | Fields: `locationId`, `courtId`, `matchId`, `startTime`, `expectedEndTime`
- Event: `court.freed` | Fields: `locationId`, `courtId`, `matchId`, `actualDuration`
- Event: `queue.advanced` | Fields: `locationId`, `impromptuId`, `playersAdvanced` (count), `newTopPlayers` (next 2 in queue)
- Event: `match.formation_skipped` | Fields: `locationId`, `impromptuId`, `reason` (insufficient_players) | Log at `debug` level
- All events include: `requestId`, `timestamp`

### Analytics Requirements
Track match assignment and court utilization:
- **Metric:** `match.assignment_volume` | Track: matches formed per location per day
- **Metric:** `court.utilization_rate` | Calculate: (time_in_use / available_time) per court
- **Metric:** `court.turnover_rate` | Track: how quickly courts cycle through matches | Measure efficiency
- **Metric:** `match.assignment_latency` | Track: time from check-in to match assignment | Should be <2 mins
- **Metric:** `queue.average_advancement_time` | Track: time spent in active waitlist before match
- Format: `{ event, timestamp, location_id, court_id, impromptu_id, properties: {...} }`

### Coverage Requirements
- **Line coverage:** ≥95% for match assignment logic
- **Branch coverage:** ≥90% for:
  - Court availability check (is court free?)
  - Player count validation (can form match?)
  - Pairing algorithm (use Task #4)
  - Court assignment (select next available court)
  - Active waitlist removal (update records)
  - Queue advancement (recalculate positions)
  - No match possible (wait scenario)
- **Integration coverage:** ≥90% (database transaction for match + court + queue updates)
- Test scenarios:
  - All courts available (assign to first)
  - All courts occupied (queue waits)
  - Court becomes available (immediately assign next match)
  - Rapid assignments (multiple matches in sequence)
  - Mixed match types (pre-arranged pairs, auto-matched singles)

### Security Checklist
- ✅ Authorization: system assigns matches (not player-initiated, so no auth required)
- ✅ Validation:
  - Court must exist
  - Players in match must be valid (from active waitlist)
  - Match format must be enum
  - Expected duration must be reasonable (>0, <180 mins)
- ✅ Data integrity:
  - Match record immutable once created
  - Court status updated atomically (occupied → available)
  - No player assigned to multiple matches simultaneously
- ✅ Concurrency: use database locks to prevent race conditions (two threads assigning same court)
- ✅ No information leakage: don't expose opponent details until match is assigned
- ✅ Fairness: queue processed first-come-first-served (no queue jumping)
- ✅ Idempotency: assigning match twice doesn't double-book court

---

---

### Task #16: Implement impromptu integration tests and test coverage
**Status:** Pending  
**Dependencies:** #1-15  
**Blocks:** Phase 4 (frontend)

**Description:**
Write comprehensive integration tests for impromptu feature across all components: locations, communities, impromptu tournaments, RSVPs, check-in, match assignment. Verify end-to-end workflows and data consistency.

**Before starting:** `/compact`

**Test plan:**

*Workflow 1: Group-Based Impromptu Request*
1. Community group created (pickleball, default location = Central Park)
2. Group member creates impromptu request (today 6:30pm, at Central Park)
3. Group members RSVP: Alice (yes, 6:30), Bob (tentative, 6:45), Charlie (yes, 6:30)
4. Location queue computed: Alice+Charlie (rank 1-2), Bob (rank 3)
5. Alice checks in at 6:25pm → active waitlist entry
6. Charlie checks in at 6:30pm → form match with Alice (2 singles or 1 pair depending on format)
7. Match assigned to Court 1, expected finish 7:00pm
8. Alice and Charlie play (no backend logic for this)
9. Match marked complete at 7:00pm, Court 1 becomes available
10. Bob still in queue, now rank 1 in active waitlist
11. No more players → Bob waits
12. Impromptu closes at 6:30pm (scheduled time) → Bob marked no-show if not checked in by 7:00pm
13. Remove Bob from queue

*Workflow 2: Direct Show-Up*
1. Player Dave (not in any group) goes to Central Park at 6:45pm
2. Dave does direct show-up RSVP (yes, 6:45pm, singles)
3. Dave added to location queue (position based on priority + arrival time)
4. Dave checks in → active waitlist
5. If court available and match can form → Dave plays
6. Otherwise → wait in queue

*Workflow 3: Doubles with Pairing*
1. Group creates impromptu (doubles format)
2. Alice RSVP (yes, with pre-arranged partner Bob, arrival 6:30pm)
3. Charlie RSVP (yes, looking for partner, arrival 6:30pm)
4. Dave RSVP (yes, looking for partner, arrival 6:45pm)
5. Location queue: Alice+Bob (pre-arranged pair, rank 1), Charlie (rank 2, looking), Dave (rank 3, looking)
6. Alice checks in, Bob checks in → pre-arranged pair in active waitlist
7. Charlie checks in → individual looking for partner
8. Auto-match Charlie + Dave when Dave checks in → 1 match (Alice+Bob vs Charlie+Dave)
9. Assign to Court 1

*Integration Checks:*
- Queue sorted correctly across all scenarios
- No-show removal works (job removes after 30 mins)
- Court capacity impacts queue (court down → capacity down)
- Direct show-ups merge with group registrations
- Match formation honors pairing preferences
- Real-time updates (queue positions change as players check in)
- Data consistency (no orphaned registrations, no double-assignments)

*Error Scenarios:*
- RSVP after tournament CLOSED (rejected)
- Check-in without RSVP (rejected)
- Duplicate RSVP (rejected)
- Invalid location (rejected)
- Insufficient players for match (queued)

**Success criteria:**
- All workflows tested end-to-end
- Data consistency verified across all components
- No regressions in other features
- Error handling tested
- 95%+ coverage for impromptu feature

---

## Project Requirements Integration (Task #16)

### Logging Requirements
Log integration test workflows at `info` level:
- Event: `test.workflow_started` | Fields: `workflowId`, `workflowName`, `description`
- Event: `test.data_consistency_verified` | Fields: `workflowId`, `checksPerformed` (array), `allPassed` (boolean)
- Event: `test.workflow_completed` | Fields: `workflowId`, `success`, `durationMs`, `assertionsCount`
- Event: `test.workflow_failed` | Fields: `workflowId`, `failurePoint`, `errorMessage` | Log at `error` level
- All events include: `requestId` (test-scoped), `timestamp`
- Note: test logging is for traceability; production logging comes from actual workflows

### Analytics Requirements
Track integration test coverage and data integrity:
- **Metric:** `test.coverage` | Track: % of workflows covered by integration tests
- **Metric:** `test.execution_time` | Track: how long integration tests take | Should be <5 mins for all
- **Metric:** `test.flakiness` | Track: if test passes/fails inconsistently | Alert if flaky
- **Metric:** `data_consistency.checks` | Track: what data consistency checks are performed
- Format: `{ event, timestamp, test_id, properties: {...} }`

### Coverage Requirements
- **Integration coverage:** ≥95% for all impromptu components together
  - Database: all tables, migrations, foreign keys
  - Repositories: all CRUD operations across components
  - Business logic: queue, pairing, state machine, capacity
  - Queue management: location queue computation
  - Check-in and match assignment
- **End-to-end coverage:** ✅ All 3 workflows (group-based, direct show-up, doubles)
- **Data integrity checks:** ✅ Verify no orphaned records, no double-assignments, queue consistency
- **Regression coverage:** ✅ Verify structured tournaments still work (no breaking changes)

### Security Checklist
- ✅ Test isolation: each workflow uses isolated test data (no shared state)
- ✅ Authorization coverage: test permission checks work correctly
- ✅ Validation coverage: test invalid inputs are rejected
- ✅ Database transactions: verify atomicity (commit/rollback work)
- ✅ No test data leakage: clean up test records after each test
- ✅ Concurrency testing: simulate concurrent requests (if relevant)
- ✅ Security regressions: verify no new vulnerabilities introduced

---

---

## Phase 4: Location Availability and Capacity Management (Optional Advanced)

### Task #17: Implement location court availability updates
**Status:** Pending  
**Dependencies:** #1, #6, #12  
**Blocks:** #18 (analytics), Phase 5 (frontend)

**Description:**
Implement endpoints to update court availability status (available → unavailable → maintenance). Update location capacity, recalculate queue, notify affected players.

**Before starting:** `/compact`

**Test plan:**

*PATCH /courts/:id/status - Update Court Status:*
- Authorized as location admin (or organizer of impromptu at location?)
- New status: available, unavailable, maintenance
- Update location capacity
- Log change with timestamp and reason (optional)

*Capacity Recalculation:*
- When court marked unavailable, reduce location capacity
- Check if location now over capacity (active waitlist > available spots)
- Notify affected players if queue affected

*Queue Impact:*
- If location over capacity after court unavailable:
  - Identify players who can't play (last in queue)
  - Remove from active waitlist (if not yet started match)
  - Move to location queue
  - Send notification

*Court Return:*
- When court marked available, increase capacity
- Move players from location queue to active waitlist (if waiting)
- Trigger match formation if now possible

*Analytics:*
- Track how long court was unavailable
- Impact on queue wait times
- Availability statistics

*Edge Cases:*
- Mark all courts unavailable (location closed)
- Mark court unavailable while match in progress (allow match to finish, then unavailable)
- Rapid status changes (multiple updates in quick succession)
- Court marked unavailable, then deleted (cascade?)

**Success criteria:**
- Court status updates working correctly
- Location capacity recalculated
- Queue rebalanced appropriately
- Affected players notified
- Edge cases handled

---

## Project Requirements Integration (Task #17)

### Logging Requirements
Log court availability endpoint operations at `info` level:
- Event: `court.status_update_requested` | Fields: `courtId`, `locationId`, `requestedStatus`, `reason`, `userId` (who requested)
- Event: `court.status_updated` | Fields: `courtId`, `locationId`, `fromStatus`, `toStatus`, `capacityImpact`, `updatedBy`
- Event: `location.capacity_notification_sent` | Fields: `locationId`, `fromCapacity`, `toCapacity`, `affectedImpromptu` (count), `notificationStatus` (sent/failed)
- Event: `queue.rebalanced_by_court_change` | Fields: `locationId`, `impromptuId`, `playersMovedFromWaiting`, `trigger` (court_available)
- All events include: `requestId`, `timestamp`

### Analytics Requirements
Track court status changes and impact:
- **Metric:** `court.status_changes` | Track: how often courts change status | Per location, per day
- **Metric:** `court.downtime_duration` | Track: how long courts are unavailable | Average downtime
- **Metric:** `court.downtime_frequency` | Track: how often courts go down | Maintenance patterns
- **Metric:** `capacity.reduction_impact` | Track: how many players can't play due to capacity reduction
- **Metric:** `queue.rebalance_frequency` | Track: how often queue rebalanced due to court changes
- Format: `{ event, timestamp, location_id, court_id, properties: {...} }`

### Coverage Requirements
- **Endpoint coverage:** ≥95% for PATCH /courts/:id/status
  - Valid status update (available → unavailable)
  - Invalid status (unknown status)
  - Authorization (only admin can update)
  - Location capacity recalculation
  - Queue rebalancing
- **Integration coverage:** ≥90% with location capacity, queue, notifications
- Test scenarios:
  - Update court to unavailable (capacity decreases)
  - Update court back to available (capacity increases)
  - Rapid status changes (up, down, up)
  - Court change while match in progress (should complete)
  - All courts down (location effectively closed)

### Security Checklist
- ✅ Authentication: request must have valid token
- ✅ Authorization: only location admins/organizers can update court status
- ✅ Validation:
  - Court must exist
  - Status must be enum (available, unavailable, maintenance)
  - Reason field optional but if provided, non-empty string
- ✅ Audit trail: log who updated court status and when
- ✅ Data integrity: capacity recalculation is atomic (don't leave inconsistent state)
- ✅ No information leakage: don't expose maintenance schedules to players
- ✅ Concurrency: use database locks to prevent race conditions (two admins updating same court)
- ✅ Idempotency: setting court to unavailable twice is safe (no side effects)

---

---

### Task #18: Implement impromptu tournament analytics and reporting
**Status:** Pending  
**Dependencies:** #1, #12, #14, #15  
**Blocks:** Phase 5 (frontend dashboard)

**Description:**
Implement analytics endpoints for impromptu tournaments: response rates, no-show rates, player engagement, location utilization, average wait times. Follow project's analytics strategy.

**Before starting:** `/compact`

**Test plan:**

*Response Rate Analytics:*
- For each impromptu tournament: yes/tentative/no percentages
- Average response rate by group
- Trend over time

*No-Show Analytics:*
- No-show percentage per location, per date
- Identify chronic no-show players (for engagement strategy)
- No-show rate by RSVP status (yes vs tentative)

*Player Engagement:*
- Active players (participated in X impromptu in last 30 days)
- Inactive players (created no requests, no shows in X days)
- Player retention metrics

*Location Utilization:*
- How often location is used
- Peak times (which hours/days)
- Court utilization rate (how many courts in use vs available)
- Capacity vs actual attendance

*Wait Times:*
- Average wait time from check-in to match assignment
- Percentile distribution (50th, 75th, 95th)
- Trend over time

*Match Duration:*
- Average actual match duration (when recorded)
- Compare to expected duration
- Vary by sport

*Logging:*
- All analytics events logged with structured logging (per project logging standards)
- Events: impromptu_created, rsvp_submitted, check_in, match_assigned, no_show_removed
- Include: timestamp, location, group (if applicable), player_id, event details

**Success criteria:**
- All analytics endpoints working
- Logging comprehensive and structured
- Data accuracy verified
- Performance acceptable (queries don't block)
- Reporting usable for insights

---

## Project Requirements Integration (Task #18)

### Logging Requirements
Log analytics operations at `debug` level (high frequency, informational):
- Event: `analytics.event_tracked` | Fields: `eventType`, `eventId`, `properties_count`, `timestamp`
- Event: `analytics.query_executed` | Fields: `queryType` (response_rate, no_show_rate, utilization), `locationId` (if applicable), `durationMs`
- Event: `analytics.report_generated` | Fields: `reportType` (daily, weekly), `metricsCount`, `generatedAt`
- Event: `analytics.data_accuracy_check` | Fields: `checkType`, `passed` (boolean), `discrepanciesFound` (if any) | Log at `warn` if failed
- All events include: `requestId`, `timestamp`
- Log level: `debug` (not critical)

### Analytics Requirements
Track impromptu analytics infrastructure:
- **Metric:** `analytics.event_volume` | Track: events tracked per day | Should be consistent
- **Metric:** `analytics.query_latency` | Track: how fast analytics queries complete | Should be <500ms
- **Metric:** `analytics.data_freshness` | Track: lag between event and availability in reports | Should be <1 min
- **Metric:** `analytics.accuracy` | Verify reported metrics match source data | Manual spot-checks
- Format: `{ event, timestamp, properties: {...} }`

### Coverage Requirements
- **Endpoint coverage:** ≥90% for all analytics endpoints
  - GET /analytics/impromptu/response-rate
  - GET /analytics/locations/utilization
  - GET /analytics/no-shows
  - GET /analytics/wait-times
  - GET /analytics/reports (daily, weekly)
- **Query coverage:** ≥85% for all analytics queries
  - Response rate calculation
  - No-show rate calculation
  - Location utilization calculation
  - Wait time percentiles (p50, p95)
  - Trend analysis (day-over-day, week-over-week)
- **Data accuracy coverage:** ≥95%
  - Spot-check: calculate metric manually, verify endpoint returns same value
  - Verify no double-counting of events
  - Verify date filters work correctly

### Security Checklist
- ✅ Authorization: only organizers/admins can access analytics
- ✅ Data exposure: don't expose individual player data (aggregated metrics only)
- ✅ Rate limiting: prevent analytics endpoint spam
- ✅ Query optimization: don't allow arbitrary queries (whitelist endpoints only)
- ✅ Data retention: define how long analytics data is kept (privacy)
- ✅ Audit trail: log who accessed what analytics and when
- ✅ SQL injection prevention: all queries parameterized
- ✅ No performance degradation: analytics queries don't lock operational tables

---

---

## Phase 5: Frontend Integration

### Task #19: Implement impromptu request creation UI
**Status:** Pending  
**Dependencies:** #10  
**Blocks:** #22 (location queue UI), Phase 5 (full frontend)

**Description:**
Build UI for community group members to create impromptu requests. Form: date (today only), time (start time), optional description, location override. Real-time validation.

**Before starting:** `/compact`

**Test plan:**

*Component: Create Impromptu Request Form*
- Input fields:
  - Group selector (groups user is member of)
  - Date: today only (no future dates for MVP)
  - Time: picker (dropdown or time input)
  - Description: text area (optional)
  - Location: inherited from group, clickable to override
  - Sport: inherited from group, selectable to override
- Validation:
  - Time must be in future (within today)
  - Location must exist
  - Description max length
- Submit: POST /impromptu, show success/error
- Error handling: network error, validation errors, authorization error

*State Management:*
- Form state (inputs, touched fields, validation errors)
- Loading state during submission
- Success state (show confirmation, redirect to queue view)

*Real-time Feedback:*
- Location capacity display (how many spots available)
- Time validation (warn if < 30 mins in future)
- Description character counter

**Success criteria:**
- Form renders correctly
- Validation working
- Submit creates impromptu tournament
- Success/error states handled
- Accessible (form labels, error messages, keyboard navigation)

---

## Project Requirements Integration (Task #19)

### Logging Requirements
Log frontend form interactions at `debug` level (client-side):
- Event: `form.impromptu_create.rendered` | Fields: `groupCount`, `defaultLocation`
- Event: `form.impromptu_create.submitted` | Fields: `groupId`, `time`, `description_length`, `locationOverridden`
- Event: `form.impromptu_create.success` | Fields: `impromptuId`, `groupId`, `submissionTimeMs`
- Event: `form.impromptu_create.error` | Fields: `errorCode`, `errorMessage` | Log at `warn` level
- All events include: `requestId`, `timestamp`
- Note: client-side logging, use structured logging library (e.g., winston, pino)

### Analytics Requirements
Track frontend form usage:
- **Metric:** `form.abandon_rate` | Calculate: (loaded / submitted) | Measure if form is confusing
- **Metric:** `form.error_rate` | Track: % of submissions that fail validation
- **Metric:** `form.location_override_rate` | Track: % of requests that override default location
- **Metric:** `feature_adoption` | Calculate: (users who created ≥1 impromptu) / (total users)
- Format: `{ event, timestamp, group_id, properties: {...} }` (client-side)

### Coverage Requirements
- **Component coverage:** ≥80% for form component
  - Form rendering with defaults
  - Form validation (all fields)
  - Submit success path
  - Submit error path
  - Location override functionality
- **Integration coverage:** ≥70% with API endpoint
  - Form submission → API call
  - Success response handling
  - Error response handling
  - Loading state
- Test scenarios:
  - Load form (all fields populated with defaults)
  - Edit time field
  - Override location
  - Submit valid form (success)
  - Submit with missing fields (error)
  - Network error during submit

### Security Checklist
- ✅ Input sanitization: description field sanitized (no XSS)
- ✅ CSRF protection: form includes CSRF token if needed
- ✅ Authorization: user must be group member (checked on submit)
- ✅ Validation:
  - Time must be in future (client-side warning + server validation)
  - Description max length
  - Group selection validated (selected group exists)
- ✅ Error handling: errors shown to user without internal details
- ✅ Rate limiting: prevent rapid-fire submissions (client-side debounce + server rate limit)
- ✅ No sensitive data logged: don't log description content if sensitive
- ✅ Accessibility: form labels, error messages, keyboard navigation all tested

---

---

### Task #20: Implement location queue viewing UI
**Status:** Pending  
**Dependencies:** #12, #19  
**Blocks:** #21 (check-in UI), Phase 5

**Description:**
Build UI to view location queue: list of all players interested in playing, sorted by priority, with RSVP status, expected arrival time, position in queue. Real-time updates.

**Before starting:** `/compact`

**Test plan:**

*Component: Location Queue View*
- Display: location name, sport, capacity info
- Table/list of queue entries:
  - Player name
  - RSVP status (icon: yes/tentative/no)
  - Expected arrival time
  - Position in queue
  - Time until likely match (estimate)
- Sorting: by position (primary), can't manually reorder
- Real-time updates: WebSocket updates position when other players RSVP/check-in/no-show

*Pagination/Scrolling:*
- Show first 20-50 in viewport
- Lazy load more if scrolled
- Or infinite scroll

*Filtering (optional):*
- Show only this impromptu tournament's RSVPs (if multiple tournaments at location)
- Show only group members vs all
- Show only waiting vs already playing

*Current Player Highlight:*
- Highlight user's own entry in queue
- Bold, different color

*Real-time Updates:*
- When new player RSVP → queue recalculated, positions update
- When player checks in → moved to active waitlist, queue recomputed
- When match assigned → queue refreshes, positions change
- Animations/transitions on position changes (smooth)

*No RSVP Fallback:*
- If user hasn't RSVP'd yet, show join button
- After RSVP, show in queue
- Show option to withdraw

**Success criteria:**
- Queue displays correctly
- Real-time updates working (WebSocket integration)
- Responsive design
- Accessible (table structure, screen reader friendly)
- Performance (doesn't lag with large queues)

---

## Project Requirements Integration (Task #20)

### Logging Requirements
Log location queue view interactions at `debug` level:
- Event: `queue_view.rendered` | Fields: `locationId`, `impromptuId`, `queueSize`, `userPosition`
- Event: `queue_view.updated_realtime` | Fields: `locationId`, `impromptuId`, `changeType` (new_rsvp, check_in, no_show), `newQueueSize`
- Event: `queue_view.join_rsvp_clicked` | Fields: `locationId`, `impromptuId`, `userId`
- Event: `queue_view.withdraw_clicked` | Fields: `locationId`, `impromptuId`, `userId` | Log at `debug` level
- All events include: `requestId`, `timestamp`

### Analytics Requirements
Track queue view usage:
- **Metric:** `queue_view.load_frequency` | Track: how often users view queue (per impromptu)
- **Metric:** `queue_view.engagement` | Track: average time spent on queue view
- **Metric:** `realtime_update_frequency` | Track: how many queue position changes per impromptu
- **Metric:** `queue_join_rate` | Calculate: (users who clicked "join" after viewing) / (users who viewed queue)
- Format: `{ event, timestamp, location_id, impromptu_id, properties: {...} }` (client-side)

### Coverage Requirements
- **Component coverage:** ≥80% for queue view component
  - Queue table rendering
  - Queue sorting correctness
  - User's own position highlighting
  - Real-time updates (WebSocket)
  - Join/withdraw buttons
  - No RSVP fallback (show join button)
- **Integration coverage:** ≥75% with WebSocket
  - Initial queue load
  - Real-time position changes
  - New RSVP additions
  - Player removal (no-show)
- **Performance coverage:** queue renders <500ms, updates <100ms
- Test scenarios:
  - Load queue (many players)
  - Real-time update arrives
  - User's position changes
  - New player RSVP'd
  - Player removed (no-show)
  - WebSocket disconnect/reconnect

### Security Checklist
- ✅ Authorization: only group members can see full queue (or view-only for non-members?)
- ✅ Data exposure: don't expose player personal data (IDs and names only)
- ✅ Rate limiting: prevent rapid refreshes of queue view (client-side polling cap)
- ✅ WebSocket auth: WebSocket connection must be authenticated
- ✅ XSS prevention: player names sanitized (no user-injected HTML)
- ✅ Information disclosure: don't reveal arrival times if privacy concern
- ✅ Performance: don't lag or timeout (DoS prevention)
- ✅ Accessibility: semantic HTML, ARIA labels, keyboard navigation

---

---

### Task #21: Implement check-in UI and active waitlist view
**Status:** Pending  
**Dependencies:** #14, #20  
**Blocks:** #22 (full workflow), Phase 5

**Description:**
Build check-in button and active waitlist view. Button to check in to location, specify preferences (match format, pairing). Show active waitlist after check-in, position, wait estimate.

**Before starting:** `/compact`

**Test plan:**

*Component: Check-In Button*
- Available when: user RSVP'd and impromptu tournament still OPEN
- Click to open modal/form
- Form fields:
  - Match format preference (inherited from tournament, selectable)
  - If doubles: pairing preference (pre-arranged with partner selection, or looking for partner)
  - Submit button
- On submit: POST /locations/:id/check-in
- Success: move to active waitlist view
- Error: show error message

*Component: Active Waitlist View*
- Show after check-in
- Display:
  - "You've checked in!"
  - Position in active waitlist
  - Wait estimate (estimated time until match)
  - Court availability
  - Refresh button to update position
- Real-time updates: position changes as other players check-in/matched
- Cancel check-in: can withdraw and go back to location queue

*Match Assignment Notification:*
- When user matched: show "Your match is ready!"
- Display: opponent names, court assignment, match type (singles/doubles)
- Link to match details
- Timer: time until match (if expected duration available)

*Edge Cases:*
- User already checked in (show active waitlist, not check-in form)
- Impromptu closed (hide check-in button)
- All courts unavailable (show wait message)
- User's position becomes #1 (highlight, maybe alert)

**Success criteria:**
- Check-in form works correctly
- Active waitlist displays with real-time updates
- Wait estimate reasonable
- Match assignment notification works
- Accessible (forms, buttons, modals)
- Mobile-friendly (important for real venue use)

---

## Project Requirements Integration (Task #21)

### Logging Requirements
Log check-in flow interactions at `info` level:
- Event: `check_in_form.opened` | Fields: `locationId`, `impromptuId`, `userId`, `userHasRsvp`
- Event: `check_in.submitted` | Fields: `locationId`, `impromptuId`, `userId`, `matchFormat`, `pairingPreference`
- Event: `check_in.success` | Fields: `locationId`, `impromptuId`, `userId`, `position` (in waitlist), `estimateMs`
- Event: `check_in.failed` | Fields: `locationId`, `impromptuId`, `userId`, `reason` (not_rsvped, closed, error) | Log at `warn` level
- Event: `match_assigned.notification` | Fields: `locationId`, `impromptuId`, `userId`, `matchId`, `courtId`, `opponents` (count)
- Event: `check_in.cancelled` | Fields: `locationId`, `impromptuId`, `userId`
- All events include: `requestId`, `timestamp`

### Analytics Requirements
Track check-in adoption and match assignment:
- **Metric:** `check_in.rate` | Calculate: (checked_in / rsvp'd) per impromptu
- **Metric:** `check_in.latency` | Track: time from impromptu created to first check-in
- **Metric:** `match_assignment.notification_effectiveness` | Track: % of players who acted on match notification
- **Metric:** `check_in.form_abandon_rate` | Track: (form_opened - form_submitted) | Measure friction
- **Metric:** `wait_estimate_accuracy` | Compare: predicted vs actual wait time
- Format: `{ event, timestamp, location_id, impromptu_id, properties: {...} }` (client-side)

### Coverage Requirements
- **Component coverage:** ≥80% for check-in form
  - Form rendering
  - Match format selection
  - Pairing preference selection (if doubles)
  - Form submission
  - Success state (active waitlist display)
  - Error state (form, tournament closed, etc.)
- **Integration coverage:** ≥75% with check-in endpoint + WebSocket
  - Form → API call
  - Success response handling
  - Error response handling
  - Real-time position updates
  - Match assignment notification
- **Mobile coverage:** ≥70%
  - Form touch-friendly (large buttons, spacing)
  - Modal responsive on small screens
  - Notification readable on mobile
- Test scenarios:
  - Check-in with default match format
  - Check-in override match format
  - Form submission success
  - Tournament closed error
  - Network error during submit
  - Match assigned notification
  - Real-time position updates while waiting

### Security Checklist
- ✅ Authentication: check-in requires player session token
- ✅ Authorization: can only check in own RSVP
- ✅ Validation:
  - Match format must be enum
  - Pairing preference must be valid
  - Location and impromptu must exist
- ✅ Rate limiting: prevent check-in spam (already in queue)
- ✅ Error handling: errors don't expose internal details
- ✅ WebSocket auth: real-time updates over authenticated connection
- ✅ XSS prevention: opponent names sanitized
- ✅ Accessibility: form labels, error messages, keyboard navigation
- ✅ Mobile security: secure on mobile browsers (no local storage of sensitive data)

---

---

### Task #22: Implement impromptu dashboard integration
**Status:** Pending  
**Dependencies:** #10, #19, #20, #21  
**Blocks:** #23 (E2E tests)

**Description:**
Integrate impromptu features into main dashboard: view group's impromptu tournaments, join new requests, see active check-ins, manage profile preferences (match format, pairing). Separate section from structured tournaments.

**Before starting:** `/compact`

**Test plan:**

*Dashboard Sections:*
- **My Groups:** List groups user is member of (with member count, recent activity)
- **Active Impromptu Requests:** For each group, show live impromptu tournaments
  - Create new request button
  - List recent requests (last 24 hours)
  - Quick join buttons
- **My Queue Position:** If user RSVP'd to something, show current queue status
- **Checked In:** If checked in, show active waitlist position and match assignment
- **Profile Preferences:** Match format preference (singles/doubles), pairing preference

*Real-time Updates:*
- Active requests list refreshes as new tournaments created
- Queue position updates as other players join/check-in
- Match assignments push notifications (WebSocket)

*Notifications:*
- New impromptu created in your group
- You're about to be matched (30 seconds notice)
- You've been matched (match details)
- You've been removed (no-show)

*Navigation:*
- Impromptu section separate from tournaments section
- Easy switching between "View Requests," "My Queue," "Checked In"
- Quick action buttons (Create Request, Check In, Withdraw)

*Mobile Optimization:*
- Touch-friendly buttons
- Simplified forms
- Clear queue position/match status
- Minimal typing needed

**Success criteria:**
- All components integrated and accessible
- Real-time updates working throughout
- Notifications functional
- Mobile-friendly design
- No conflicts with structured tournament dashboard
- User can complete impromptu flow without leaving dashboard

---

## Project Requirements Integration (Task #22)

### Logging Requirements
Log dashboard interactions at `debug` level:
- Event: `dashboard.impromptu_section.viewed` | Fields: `userId`, `sectionName` (my_groups, active_requests, my_queue, checked_in)
- Event: `dashboard.notification_clicked` | Fields: `userId`, `notificationType` (new_request, matched, removed), `actionTaken`
- Event: `dashboard.preferences_updated` | Fields: `userId`, `settingChanged` (match_format, pairing_pref), `oldValue`, `newValue`
- All events include: `requestId`, `timestamp`
- Log level: `debug` (high frequency)

### Analytics Requirements
Track dashboard feature usage:
- **Metric:** `dashboard.section_usage` | Track: % of users visiting each section
- **Metric:** `dashboard.impromptu_engagement` | Track: % of users creating/joining impromptu tournaments
- **Metric:** `dashboard.notification_interaction_rate` | Track: % of notifications clicked
- **Metric:** `dashboard.time_to_join` | Track: time from viewing request to clicking join
- Format: `{ event, timestamp, user_id, properties: {...} }` (client-side)

### Coverage Requirements
- **Integration coverage:** ≥80% across all impromptu dashboard components
  - My Groups section display
  - Active Impromptu Requests list
  - Create Request button
  - My Queue Position display
  - Checked In status display
  - Profile Preferences display
  - Real-time updates to all sections
- **Navigation coverage:** ≥75%
  - Tab switching between impromptu/tournaments
  - Quick action buttons (Create, Check In, Withdraw)
  - Links to individual request/queue details
- **Mobile coverage:** ≥70%
  - Touch-friendly layout
  - Collapsed sections for small screens
  - Bottom sheet for quick actions
- Test scenarios:
  - User has no impromptu tournaments (empty state)
  - User has active request (queue visible)
  - User checked in (active waitlist visible)
  - User receives notification (updates dashboard)
  - User switches tabs (state persists)

### Security Checklist
- ✅ Authorization: only see own groups and registrations
- ✅ Data exposure: don't expose other users' data
- ✅ Real-time updates: WebSocket authenticated
- ✅ Rate limiting: prevent dashboard refresh spam
- ✅ Notifications: don't expose opponent details until matched
- ✅ Preferences: secure user settings (no local storage of sensitive prefs)
- ✅ XSS prevention: all user-generated content sanitized
- ✅ Accessibility: semantic structure, ARIA labels, keyboard navigation

---

---

### Task #23: Implement community group management UI
**Status:** Pending  
**Dependencies:** #9, #19  
**Blocks:** #24 (E2E tests)

**Description:**
Build UI for creating and managing community groups: create group, invite members, set defaults (sport, location), view member list, manage group settings.

**Before starting:** `/compact`

**Test plan:**

*Component: Create Group Form*
- Fields:
  - Group name
  - Group description (optional)
  - Default sport (select: pickleball, tennis, badminton, etc.)
  - Default location (search/select)
- Submit: POST /groups
- Validation: name required, location exists
- Success: redirect to group page

*Component: Group Page*
- Group details (name, sport, location, member count, created date)
- Member list (name, join date, role if applicable)
- Invite member: 
  - Input: email or player search
  - Send invite (or add directly?)
  - Show pending invites
- Remove member: button per member
- Edit group: update name, sport, location
- Delete group: confirmation

*Invitations:*
- Invite via email
- Show invitation status (pending, accepted, declined)
- Accept/decline invitation (maybe in separate page or email link)

*Privacy/Permissions:*
- Show if group is public vs private/invite-only
- Only members can see group details
- Only creator/admin can manage members

*Activity:*
- Show recent impromptu tournaments created by group
- Member participation history (how many impromptu created/joined)

**Success criteria:**
- Group creation form works
- Invite/membership management functional
- Group page displays correctly
- Permissions enforced
- Mobile-friendly
- Accessible forms and navigation

---

## Project Requirements Integration (Task #23)

### Logging Requirements
Log community group management at `info` level:
- Event: `group.create_form.submitted` | Fields: `groupName`, `sport`, `defaultLocationId`, `userId`
- Event: `group.created` | Fields: `groupId`, `groupName`, `creatorId`
- Event: `group.invite_sent` | Fields: `groupId`, `inviteeEmail`, `sentBy`
- Event: `group.member_added` | Fields: `groupId`, `memberId`, `addedBy`
- Event: `group.member_removed` | Fields: `groupId`, `memberId`, `removedBy`
- Event: `group.settings_updated` | Fields: `groupId`, `settingChanged`, `updatedBy`
- Event: `group_management.access_denied` | Fields: `groupId`, `userId`, `reason` (not_member, not_creator) | Log at `warn` level
- All events include: `requestId`, `timestamp`

### Analytics Requirements
Track group management usage:
- **Metric:** `group.creation_rate` | Track: new groups created per user, per week
- **Metric:** `group.member_growth` | Track: members added per group
- **Metric:** `group.invitation_acceptance_rate` | Calculate: (accepted invites / sent invites)
- **Metric:** `group.settings_update_frequency` | Track: how often groups update settings
- **Metric:** `group.admin_retention` | Track: % of creators who maintain groups
- Format: `{ event, timestamp, group_id, properties: {...} }`

### Coverage Requirements
- **Component coverage:** ≥80% for group management UI
  - Create group form
  - Group page display
  - Member list display
  - Invite form
  - Remove member button
  - Edit settings button
  - Delete group button
- **Integration coverage:** ≥75% with group endpoints
  - Create group → API call
  - Invite member → email/notification
  - Accept invite (from email link)
  - Remove member → API call
  - Update settings → API call
- **Permission coverage:** ≥90%
  - Only creator can edit group
  - Only creator can remove members
  - Only members can see group
  - Non-members get 404
- Test scenarios:
  - Create new group
  - Add member (via invite)
  - Accept invitation
  - Remove member
  - Update group settings
  - Attempt unauthorized action (non-creator)

### Security Checklist
- ✅ Authentication: user must be logged in
- ✅ Authorization:
  - Only creator can update/delete group
  - Only creator can invite members
  - Only members can view group
  - Non-members see 404 (not "access denied")
- ✅ Validation:
  - Group name non-empty
  - Sport must be valid enum
  - Default location must exist
- ✅ Invitation security:
  - Invitation tokens are unique
  - Invitation expires (e.g., 7 days)
  - Can't accept invitation twice
- ✅ Data integrity:
  - Soft delete groups (keep history)
  - Track member join dates
  - No orphaned members if group deleted
- ✅ XSS prevention: group name, member names sanitized
- ✅ Spam prevention: rate limiting on invitations (max 10 per day?)
- ✅ Email security: invitation emails don't expose sensitive data

---

---

### Task #24: Implement impromptu E2E workflow tests
**Status:** Pending  
**Dependencies:** #19, #20, #21, #22, #23  
**Blocks:** None (final validation)

**Description:**
Write E2E tests for complete impromptu workflows: create request, RSVP, check-in, match formation, all from user perspective using browser automation.

**Before starting:** `/compact`

**Test scenarios:**

**Workflow 1: Group-Based Request (Happy Path)**
1. User A creates community group "Pickleball Crew" (sport: pickleball, location: Central Park)
2. User A invites User B (by email)
3. User B accepts invitation, joins group
4. User A creates impromptu request (today 6:30pm)
5. User B sees request in dashboard
6. User B RSVPs "yes" with arrival time 6:30pm
7. User A sees User B in queue
8. User A checks in (now active waitlist)
9. User B checks in (5 mins later)
10. System forms match (User A + User B singles match)
11. Match assigned to Court 1
12. User A sees "Your match is ready at Court 1"
13. User B sees same

**Workflow 2: Direct Show-Up**
1. New player User C (not in group) browses location page
2. Finds Central Park, sees active impromptu request
3. User C does direct show-up (yes, arrival 6:45pm)
4. User C added to queue
5. User C checks in
6. Queue now has User A+B (in match), User C waiting
7. User C waits for next match

**Workflow 3: Doubles with Pairing**
1. User D and E (partners) RSVP together to impromptu request (doubles format)
2. User F and G also want to play, RSVP looking for partners
3. All four check in
4. System auto-matches: (D+E) vs (F+G)
5. All see match assignment

**Edge Case Tests:**
1. **No-Show:** User H RSVPs but doesn't check in → removed after 30 mins
2. **Withdrawal:** User I RSVPs then withdraws before check-in
3. **Court Unavailable:** Court 1 marked unavailable during impromptu → capacity drops
4. **Impromptu Closes:** Request reaches scheduled time → marked CLOSED, no more RSVPs accepted
5. **Insufficient Players:** Only 1 player checks in, can't form match → waits

**Real-Time Updates:**
1. User A watching queue → User B RSVPs → sees position 2
2. User B watches → User A checks in → sees "1 player checked in"
3. Both see notification when match assigned

**Mobile Tests:**
1. Check-in from phone browser (buttons touch-friendly)
2. Queue view responsive on small screen
3. Form inputs work on mobile keyboard

**Error Scenarios:**
1. Try to RSVP after request closed (error)
2. Try to check-in without RSVP (error)
3. Network disconnection during check-in (error handling)
4. Session timeout (redirect to login)

**Success criteria:**
- All workflows complete end-to-end
- Real-time updates working throughout
- Error handling appropriate
- Mobile experience acceptable
- No critical bugs found
- Performance acceptable (no major delays)

---

## Project Requirements Integration (Task #24)

### Logging Requirements
Log E2E test workflows at `info` level (for debugging):
- Event: `test.e2e_scenario_started` | Fields: `scenarioName`, `testId`
- Event: `test.e2e_step_completed` | Fields: `scenarioName`, `stepNumber`, `stepDescription`, `durationMs`
- Event: `test.e2e_scenario_passed` | Fields: `scenarioName`, `totalDurationMs`, `stepsCompleted`
- Event: `test.e2e_scenario_failed` | Fields: `scenarioName`, `failedStep`, `errorMessage` | Log at `error` level
- Event: `test.real_time_update_verified` | Fields: `updateType`, `latencyMs`
- All events include: `requestId` (test-scoped), `timestamp`

### Analytics Requirements
Track E2E test coverage and system health:
- **Metric:** `e2e.pass_rate` | Track: % of E2E scenarios that pass
- **Metric:** `e2e.test_duration` | Track: how long E2E suite takes (should be <10 mins)
- **Metric:** `e2e.flakiness` | Track: tests that pass/fail inconsistently
- **Metric:** `real_time.latency` | Track: WebSocket update latency (should be <500ms)
- Format: `{ event, timestamp, test_id, properties: {...} }`

### Coverage Requirements
- **E2E workflow coverage:** 100%
  - ✅ Workflow 1: Group-Based Request (10 steps)
  - ✅ Workflow 2: Direct Show-Up (5 steps)
  - ✅ Workflow 3: Doubles with Pairing (6 steps)
- **System integration coverage:** 100%
  - API endpoints
  - Database
  - Async jobs
  - WebSocket real-time updates
  - Frontend UI
- **Error scenario coverage:** ≥90%
  - No-show handling
  - Withdrawal handling
  - Court unavailability
  - Request closure
  - Insufficient players
- **Performance targets:**
  - Full workflow completes in <5 mins
  - Real-time updates <500ms latency
  - No timeout errors
  - No resource leaks

### Security Checklist
- ✅ Test isolation: each scenario uses isolated test data (no shared state)
- ✅ Authorization testing: verify permission checks work end-to-end
- ✅ Validation testing: verify invalid inputs are rejected at all layers
- ✅ Authentication testing: verify tokens required and validated
- ✅ Data integrity: verify no orphaned records after tests
- ✅ No test data leakage: clean up test records after each scenario
- ✅ Concurrency testing: simulate real-world concurrent requests
- ✅ Security regression: verify no new vulnerabilities introduced

---

## Phase 5 (continued): Notifications and Real-Time Updates

### Task #25: Implement impromptu WebSocket broadcasts and notifications
**Status:** Pending  
**Dependencies:** #14, #15, #19, #20, #21  
**Blocks:** None (enhancement)

**Description:**
Implement WebSocket broadcasts for impromptu real-time updates: queue position changes, check-in events, match assignments, no-show removals. Send in-app and push notifications for key events.

**Before starting:** `/compact`

**Test plan:**

*WebSocket Events:*
- Queue position changed (user's position updated)
- New player RSVP (queue refreshes)
- Player checked in (queue recomputed)
- Match assigned (notification: "Your match is ready!")
- No-show removed (notification: "Player removed")
- Court status changed (capacity update)

*Event Payload:*
```typescript
{
  event: 'queue_position_updated' | 'match_assigned' | 'no_show_removed' | ...,
  location_id: string,
  data: {
    // Event-specific data
    position?: number,
    matchId?: string,
    court?: string,
    ...
  },
  timestamp: ISO string
}
```

*Broadcasting:*
- Send to all clients watching location queue
- Consolidate duplicate events (if multiple changes at once, send 1 batch update)
- Idempotent (resend doesn't cause double-updates)

*In-App Notifications:*
- Toast notification in UI
- Sound/vibration (optional, user can disable)
- Persist in notification center (last 24 hours)

*Push Notifications:*
- For critical events only (match assigned, removed)
- Send to player's device
- Click opens impromptu page/match details

*Logging:*
- All broadcast events logged (per project logging strategy)
- Track delivery (did client receive?)
- Track performance (latency between event and receipt)

*Edge Cases:*
- User closes tab → unsubscribe from updates
- User rejoins tab → resubscribe
- Network disconnect/reconnect → catch up on missed events
- Duplicate events (deduplication?)

**Success criteria:**
- WebSocket broadcasts working correctly
- Real-time updates accurate
- Notifications functional and helpful
- Logging comprehensive
- Performance acceptable (no lag)
- Error handling robust

---

## Project Requirements Integration (Task #25)

### Logging Requirements
Log WebSocket and notification operations at `info` level:
- Event: `websocket.connection_established` | Fields: `connectionId`, `userId`, `timestamp`
- Event: `websocket.broadcast_sent` | Fields: `eventType`, `recipientCount`, `broadcastId`
- Event: `websocket.delivery_confirmed` | Fields: `broadcastId`, `recipientId`, `deliveryTimeMs`
- Event: `notification.sent` | Fields: `notificationType` (in_app, push), `recipientId`, `message`
- Event: `notification.action_taken` | Fields: `notificationId`, `action` (clicked, dismissed), `actionTimeMs`
- Event: `websocket.connection_closed` | Fields: `connectionId`, `userId`, `reason` (disconnect, timeout, error)
- All events include: `requestId`, `timestamp`
- Log level: `info` (moderate frequency)

### Analytics Requirements
Track real-time system performance:
- **Metric:** `websocket.connection_count` | Track: active WebSocket connections
- **Metric:** `websocket.broadcast_latency` | Track: time from event to client delivery (should be <500ms)
- **Metric:** `notification.delivery_rate` | Calculate: (delivered / sent) | Measure reliability
- **Metric:** `notification.click_through_rate` | Calculate: (clicked / delivered) | Measure engagement
- **Metric:** `websocket.error_rate` | Track: failed deliveries, dropped messages
- **Metric:** `broadcast.consolidation_success_rate` | Track: % of duplicate events consolidated
- Format: `{ event, timestamp, connection_id, properties: {...} }`

### Coverage Requirements
- **WebSocket coverage:** ≥95% for broadcast logic
  - Connection establishment
  - Message formatting
  - Recipient filtering (only players in tournament/location)
  - Broadcast consolidation (duplicate prevention)
  - Error handling and retry
  - Connection cleanup
- **Notification coverage:** ≥90%
  - In-app notification generation
  - Push notification generation
  - Recipient targeting
  - Message content accuracy
  - Click tracking
- **Concurrency coverage:** ≥85%
  - Multiple concurrent broadcasts
  - Recipient list consistency (no race conditions)
  - Message ordering (events in correct sequence)
- **Performance targets:**
  - Broadcast latency <500ms (p95)
  - No message loss (delivery rate 100%)
  - WebSocket connection stability >99.5%

### Security Checklist
- ✅ Authentication: WebSocket connection requires valid token
- ✅ Authorization:
  - Player only receives broadcasts relevant to them
  - Can't subscribe to other players' data
  - Organizer/admin can see broader broadcasts
- ✅ Message validation: all broadcast data validated before sending
- ✅ Rate limiting: prevent broadcast spam (max events per second)
- ✅ Data exposure: don't send sensitive data in broadcasts (IDs only, not full details)
- ✅ Integrity: message ordering preserved (events in correct sequence)
- ✅ Reliability: delivery confirmation (know if message reached client)
- ✅ Error handling: dropped connections reconnect automatically
- ✅ Performance: broadcasts don't block operational requests
- ✅ Consolidation: duplicate events consolidated (prevent message explosion)

---

---

## Dependency Graph

```
#1 (Locations + Courts)
├─ #2 (Impromptu State Machine)
├─ #3 (Queue Priority) ────┬─ #10 (RSVP)
├─ #4 (Doubles Pairing) ───┤
├─ #5 (Check-In Logic) ────┤
├─ #6 (Court Availability) ┤
├─ #7 (Structured Tournament Location Support)
├─ #8 (Impromptu Registration) ─┬─ #9 (Community Groups)
│                               ├─ #11 (Direct Show-Up)
│                               └─ #12 (Queue Management)
│
├─ #9 (Community Groups) ────┬─ #13 (Close Job)
│                            ├─ #19 (Create Impromptu UI)
│                            └─ #23 (Group Mgmt UI)
│
├─ #10 (RSVP) ───────────────┬─ #12 (Queue Mgmt)
├─ #11 (Direct Show-Up) ─────┤
├─ #12 (Queue Mgmt) ──────┬──┤
│                         ├─ #14 (Check-In)
│                         └─ #17 (Court Availability)
│
├─ #14 (Check-In) ────────┬─ #15 (Match Assignment)
├─ #15 (Match Assignment) ├─ #16 (Integration Tests)
├─ #16 (Integration Tests) ├─ #21 (Check-In UI)
├─ #17 (Court Avail) ─────┤
├─ #18 (Analytics) ───────┤
│
├─ #19 (Create Request UI) ───┬─ #20 (Queue UI)
├─ #20 (Queue UI) ────────────┬─ #21 (Check-In UI)
├─ #21 (Check-In UI) ─────────┬─ #22 (Dashboard Integration)
├─ #22 (Dashboard) ────────────┬─ #24 (E2E Tests)
├─ #23 (Group Mgmt UI) ────────┤
├─ #24 (E2E Tests) ────────────┘
│
└─ #25 (WebSocket Broadcasts) (enhancement)
```

---

## Parallelization Opportunities

**Can run in parallel (no blocking dependencies):**
- Phase 0: Task #1 (foundation, blocks everything)
- Phase 1: Tasks #2, #3, #4, #5, #6, #7, #8 (after #1, can all run simultaneously)
- Phase 2: Tasks #9, #10, #11, #12, #13 (partially dependent, some can run early)
  - #9, #10, #11 can start once #8 done
  - #12 can start once #3, #10, #11 done
  - #13 can start once #9 done
- Phase 3: Tasks #14, #15 (can run together after #1-13 foundation)
- Phase 4: Tasks #17, #18 (can run in parallel after #1, #6, #12)
- Phase 5: Tasks #19-25 (can run once their dependencies met, many in parallel)

**Critical Path (longest dependency chain):**
```
#1 → #2 → #5 → #14 → #15 → #16 → #24
(Foundation → State → Logic → Check-In → Assignment → Integration → E2E)
```

---

## Implementation Strategy: Recommended Approach

### Week 1-2: Foundation & Core Logic
- Task #1: Locations + Courts (2 days)
- Tasks #2-8 in parallel (7 days, can overlap)
  - #2: State machine (2 days)
  - #3: Queue priority (2 days)
  - #4: Doubles pairing (2 days)
  - #5: Check-in logic (2 days)
  - #6: Court availability (1.5 days)
  - #7: Structured tournament locations (1 day, low priority)
  - #8: Registration data model (1.5 days)

### Week 3: Community Groups & RSVP
- Task #9: Community groups (2 days)
- Tasks #10, #11, #12 in parallel (3 days)
  - #10: RSVP endpoints (2 days)
  - #11: Direct show-up (1.5 days)
  - #12: Queue management (2 days)
- Task #13: Close request job (1 day)

### Week 4: Check-In & Assignment
- Tasks #14, #15 in sequence (3 days)
  - #14: Check-in endpoint (2 days)
  - #15: Match assignment (2 days)
- Task #16: Integration tests (2 days)
- Tasks #17, #18 in parallel (2 days)
  - #17: Court availability (1.5 days)
  - #18: Analytics (2 days)

### Week 5: Frontend
- Tasks #19-24 in sequence (best done sequentially to avoid rework)
  - #19: Create request UI (1.5 days)
  - #20: Queue view UI (1.5 days)
  - #21: Check-in UI (1.5 days)
  - #22: Dashboard (1.5 days)
  - #23: Group management (1.5 days)
  - #24: E2E tests (2 days)
- Task #25: WebSocket (1 day, optional enhancement)

**Total: ~5-6 weeks for 1 developer, or 2-3 weeks with parallelization**

---

## Project Requirements Integration

All tasks MUST follow project standards:

### Logging Strategy
- All API endpoints log at `info` level on state changes (per CLAUDE.md)
- Format: `event.name` (e.g., `impromptu.created`, `rsvp.submitted`, `check_in.completed`)
- Include: `locationId`, `groupId` (if applicable), `playerId`, `tournament_id` (if applicable)
- Request ID automatically injected via AsyncLocalStorage
- Verify: `LOG_LEVEL=debug npm start | grep '"impromptu"'`

### Coverage Strategy
- Business logic (state machine, queue, pairing): **100% coverage required**
- API endpoints: **95%+ coverage required**
- Frontend: **80%+ coverage for state logic, 70% for components**
- Overall: **95%+ coverage for critical paths**

### Analytics Strategy
- Track all impromptu events: creation, RSVP, check-in, no-show, match assignment
- Event format: `event`, `timestamp`, `location_id`, `player_id`, `group_id`, `metadata`
- Use for: response rates, engagement metrics, location utilization, wait time analysis
- (Details in Task #18)

### Security Strategy
- Auth: Player session tokens (reuse from structured tournaments)
- Validation: All user inputs validated (RSVP status, arrival time, etc.)
- Authorization: Group members can only create/RSVP to own group's impromptu
- Direct show-ups: Self-service, no auth needed (public locations)
- Sensitive data: Don't log player email, phone, or full names in events (only IDs)
- SQL: All queries parameterized (using database library)

---

## Before Starting Any Task

**ALWAYS DO:**
1. Run `/compact` to compress context
2. Read this task fully (understand scope, dependencies, test plan)
3. Check existing code for patterns to follow
4. Create test file first (TDD approach)
5. Write failing tests (RED phase)
6. Write implementation (GREEN phase)
7. Refactor (REFACTOR phase)
8. Verify all tests pass
9. Check coverage (`npm run test:coverage`)
10. Run security audit (eslint, npm audit)
11. Commit when all tests green and coverage targets met

---

## Commit Strategy

Each task should be a single git commit with:
- **Commit message:** Descriptive, imperative form (e.g., "Implement impromptu state machine with 100% test coverage")
- **Files included:** Only files changed for this task (no unrelated changes)
- **Coverage:** Verify 95%+ coverage for business logic before committing
- **Tests:** All tests passing before commit
- **Security:** eslint clean, no audit issues before commit

---

## Success Criteria (Project-Wide)

✅ All 25 tasks completed  
✅ 95%+ test coverage for impromptu feature  
✅ All tests passing (unit, integration, E2E)  
✅ Zero critical security issues (eslint clean, npm audit clean)  
✅ Logging comprehensive (all events logged per strategy)  
✅ Analytics events tracked (response rates, no-shows, wait times)  
✅ Frontend fully functional (create request, RSVP, check-in, view queue)  
✅ WebSocket real-time updates working  
✅ No breaking changes to structured tournament feature  
✅ Code follows project conventions (logging, error handling, auth, validation)  

---

## Notes

- This plan prioritizes **business logic correctness** (Phases 1-4) before **frontend polish** (Phase 5)
- **TDD discipline** is critical for impromptu feature (queue logic, pairing, state management are error-prone)
- **Integration testing** (Task #16) is essential — impromptu has many interacting components (queue, check-in, match assignment, no-shows)
- **WebSocket real-time updates** (Task #25) are nice-to-have but important for user experience (player sees queue position change in real-time)
- **Analytics** (Task #18) provide insights into whether impromptu feature is working (high no-show rate = problem, long wait times = capacity issue)
- Refer to **TDD_STRATEGY.md** for implementation patterns and testing best practices
- Refer to **CLAUDE.md** for logging standards and project conventions
- Refer to **SECURITY.md** for security guidelines

---

## Plan Completion Status

**✅ ALL TASKS NOW INCLUDE PROJECT REQUIREMENTS INTEGRATION**

All 25 tasks have been updated with detailed project requirements sections covering:

1. **Logging Requirements** — specific events to log, with field names and log levels
2. **Analytics Requirements** — specific metrics to track for business/product insights
3. **Coverage Requirements** — specific coverage thresholds (line, branch, condition, integration)
4. **Security Checklist** — specific authentication, authorization, validation, concurrency handling

**Completed tasks with full integration:**
- ✅ Task #1: Locations & Courts
- ✅ Task #2: Impromptu State Machine  
- ✅ Task #3: Queue Priority Logic
- ✅ Task #4: Doubles Pairing Logic
- ✅ Task #5: Check-In Logic
- ✅ Task #6: Court Availability Impact
- ✅ Task #7: Structured Tournament Location Support
- ✅ Task #8: Impromptu Registration Data Model
- ✅ Task #9: Community Groups & Membership
- ✅ Task #10: Impromptu RSVP Endpoints
- ✅ Task #11: Direct Show-Up for Non-Group Players
- ✅ Task #12: Location Queue Management
- ✅ Task #13: Impromptu State Machine Job
- ✅ Task #14: Check-In Endpoint & Active Waitlist
- ✅ Task #15: Match Assignment & Court Tracking
- ✅ Task #16: Impromptu Integration Tests
- ✅ Task #17: Location Court Availability Updates
- ✅ Task #18: Analytics & Reporting
- ✅ Task #19: Create Impromptu Request UI
- ✅ Task #20: Location Queue View UI
- ✅ Task #21: Check-In UI & Active Waitlist View
- ✅ Task #22: Impromptu Dashboard Integration
- ✅ Task #23: Community Group Management UI
- ✅ Task #24: E2E Workflow Tests
- ✅ Task #25: WebSocket Broadcasts & Notifications

**Pattern established:**
- **Logging:** Always include `requestId` (auto-injected), `timestamp`, never log secrets/PII
- **Analytics:** Event-based metrics tied to business goals (response rates, no-shows, utilization, wait times)
- **Coverage:** Thresholds specified (100% for critical logic, 95% for API, 90% for integration)
- **Security:** Task-specific checks (authentication, authorization, validation, concurrency, injection prevention)

---

## Status Tracking

All tasks are currently **pending**. Mark tasks as:
- **in_progress** when starting work (after `/compact`)
- **completed** when all tests written, passing, and coverage targets met
- **deleted** if scope changes make task unnecessary

Use `TaskUpdate` to change status and track progress.
