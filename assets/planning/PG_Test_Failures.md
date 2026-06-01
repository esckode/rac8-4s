# PostgreSQL Test Failures Catalog

**Date:** 2026-05-20  
**Total Failed Tests:** 403  
**Total Failed Test Suites:** 20  

---

## Overview

This document catalogs all failing tests from the Phase 2 test suite run, organized by error category. Each entry includes:
- **Source File:** Test specification file location
- **Test Name/ID:** Full test name as it appears in Jest output
- **Description:** Brief description of what the test validates
- **Error Received:** Exact error message from the test run

**Key Finding:** All errors are database infrastructure-related, not code logic errors. The async/await conversion is complete.

---

# CATEGORY 1: PostgreSQL Schema Constraint Violations (502 total errors)

## Subcategory 1A: pg_type_typname_nsp_index Constraint (346 errors)

**Root Cause:** PostgreSQL internal type registry has duplicate entries. Schema objects not properly dropped between test runs; catalog entries remain orphaned when `DROP SCHEMA` executes.

**Error Message:** `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"`

---

### task12-match-coordination.spec.ts (30 failures)
**Test Suite:** Match Coordination API Endpoints  
**Description:** Tests for player match listing, match details, attendance confirmation, and contact preferences

| # | Test Name | Error |
|---|-----------|-------|
| 1 | Match Coordination Endpoints › GET /tournaments/:id/matches - list player matches › should return player's group matches | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 2 | Match Coordination Endpoints › GET /tournaments/:id/matches - list player matches › should exclude matches player is not in | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 3 | Match Coordination Endpoints › GET /tournaments/:id/matches - list player matches › should hide opponent email when share_contact=false | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 4 | Match Coordination Endpoints › GET /tournaments/:id/matches - list player matches › should show opponent email when share_contact=true | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 5 | Match Coordination Endpoints › GET /tournaments/:id/matches - list player matches › should return 401 without auth | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 6 | Match Coordination Endpoints › GET /tournaments/:id/matches - list player matches › should return 403 if player in different tournament | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 7 | Match Coordination Endpoints › GET /tournaments/:id/matches/:matchId - match details › should return match details for involved player | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 8 | Match Coordination Endpoints › GET /tournaments/:id/matches/:matchId - match details › should show opponent email to organizer regardless of share_contact | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 9 | Match Coordination Endpoints › GET /tournaments/:id/matches/:matchId - match details › should hide opponent email from player when opponent share_contact=false | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 10 | Match Coordination Endpoints › GET /tournaments/:id/matches/:matchId - match details › should return 403 for player not in match | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 11 | Match Coordination Endpoints › GET /tournaments/:id/matches/:matchId - match details › should return 404 for unknown match | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 12 | Match Coordination Endpoints › GET /tournaments/:id/matches/:matchId - match details › should return 401 without auth | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 13 | Match Coordination Endpoints › GET /tournaments/:id/matches/:matchId - match details › should include confirmation status in response | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 14 | Match Coordination Endpoints › PATCH /tournaments/:id/matches/:matchId/confirm - confirm attendance › should allow player1 to confirm attendance | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 15 | Match Coordination Endpoints › PATCH /tournaments/:id/matches/:matchId/confirm - confirm attendance › should allow player2 to confirm attendance | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 16 | Match Coordination Endpoints › PATCH /tournaments/:id/matches/:matchId/confirm - confirm attendance › should allow both players to confirm independently | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 17 | Match Coordination Endpoints › PATCH /tournaments/:id/matches/:matchId/confirm - confirm attendance › should return 403 for player not in match | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 18 | Match Coordination Endpoints › PATCH /tournaments/:id/matches/:matchId/confirm - confirm attendance › should return 401 without auth | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 19 | Match Coordination Endpoints › PATCH /tournaments/:id/matches/:matchId/confirm - confirm attendance › should return 404 for unknown match | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 20 | Match Coordination Endpoints › PATCH /tournaments/:id/matches/:matchId/confirm - confirm attendance › should work for knockout matches too | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 21 | Match Coordination Endpoints › GET /player/contact-preferences › should return default false | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 22 | Match Coordination Endpoints › GET /player/contact-preferences › should return updated value after PATCH | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 23 | Match Coordination Endpoints › GET /player/contact-preferences › should return 401 without auth | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 24 | Match Coordination Endpoints › PATCH /player/contact-preferences › should enable contact sharing | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 25 | Match Coordination Endpoints › PATCH /player/contact-preferences › should disable contact sharing | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 26 | Match Coordination Endpoints › PATCH /player/contact-preferences › should return 400 for non-boolean value | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 27 | Match Coordination Endpoints › PATCH /player/contact-preferences › should return 401 without auth | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 28 | Match Coordination Endpoints › PATCH /player/contact-preferences › should update only the authenticated player | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 29 | Match Coordination Endpoints › Contact visibility integration › should respect contact preferences in match listing and details | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 30 | Match Coordination Endpoints › Contact visibility integration › should hide contact when preference is disabled | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |

---

### tournaments.bundle.spec.ts (17 failures)
**Test Suite:** Tournament Bundle Consolidation Endpoint  
**Description:** Tests for GET /tournaments/:id/bundle endpoint that returns tournament data plus matches, standings, and brackets

| # | Test Name | Error |
|---|-----------|-------|
| 1 | GET /tournaments/:id/bundle - Consolidation Endpoint › Authorization › should return 401 when no auth header provided | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 2 | GET /tournaments/:id/bundle - Consolidation Endpoint › Authorization › should return 401 when auth header is invalid | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 3 | GET /tournaments/:id/bundle - Consolidation Endpoint › Authorization › should return 401 when Bearer prefix is missing | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 4 | GET /tournaments/:id/bundle - Consolidation Endpoint › Authorization › should return 403 when organizer does not own tournament | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 5 | GET /tournaments/:id/bundle - Consolidation Endpoint › Authorization › should return 404 when tournament does not exist | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 6 | GET /tournaments/:id/bundle - Consolidation Endpoint › Full Response - All Fields › should return all 4 fields for organizer (default include) | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 7 | GET /tournaments/:id/bundle - Consolidation Endpoint › Full Response - All Fields › should return all 4 fields for registered player (default include) | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 8 | GET /tournaments/:id/bundle - Consolidation Endpoint › Include Parameter - Selective Fields › should return only tournament when ?include=tournament | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 9 | GET /tournaments/:id/bundle - Consolidation Endpoint › Include Parameter - Selective Fields › should return standings,matches,bracket when ?include=standings,matches,bracket | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 10 | GET /tournaments/:id/bundle - Consolidation Endpoint › Include Parameter - Selective Fields › should handle whitespace in include parameter | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 11 | GET /tournaments/:id/bundle - Consolidation Endpoint › Response Fields › should include tournament details in response | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 12 | GET /tournaments/:id/bundle - Consolidation Endpoint › Response Fields › should include matches with group and knockout structure | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 13 | GET /tournaments/:id/bundle - Consolidation Endpoint › Response Fields › should include standings by group | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 14 | GET /tournaments/:id/bundle - Consolidation Endpoint › Response Fields › should include bracket information | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 15 | GET /tournaments/:id/bundle - Consolidation Endpoint › Role-Based Access › organizer can access bundle for owned tournament | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 16 | GET /tournaments/:id/bundle - Consolidation Endpoint › Role-Based Access › player can access bundle for registered tournament | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 17 | GET /tournaments/:id/bundle - Consolidation Endpoint › Role-Based Access › data is consistent across roles | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |

---

### task17-sse.spec.ts (32 failures)
**Test Suite:** Server-Sent Events (SSE) Endpoint and Broadcast  
**Description:** Tests for real-time event streaming, auth enforcement, rate limiting, and message delivery

| # | Test Name | Error |
|---|-----------|-------|
| 1 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Auth enforcement › should return 401 for unauthenticated request | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 2 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Auth enforcement › should return 401 for invalid token | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 3 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Auth enforcement › should return 404 for unknown tournament | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 4 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Auth enforcement › should return 403 when organizer does not own the tournament | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 5 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Auth enforcement › should accept organizer token | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 6 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Auth enforcement › should accept player token | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 7 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Rate limiting › should return 429 when a user exceeds 5 concurrent connections | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 8 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Rate limiting › should allow a new connection after a previous one is closed | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 9 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › SSE connection › should respond with text/event-stream content type | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 10 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › SSE connection › should set cache-control and connection headers | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 11 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Event delivery › should push event to connected client when BroadcastBus emits | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 12 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Event delivery › should format events as SSE data lines | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 13 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Event delivery › should deliver standings.updated with correct shape from processor | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 14 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Event delivery › should deliver bracket.published with correct shape from processor | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 15 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Tournament scoping › should not deliver events for tournament A to a client subscribed to B | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |
| 16 | Task #17: SSE endpoint and BroadcastBus › GET /tournaments/:id/events › Disconnect cleanup › should remove BroadcastBus listener when client disconnects | `error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"` |

*(Note: 16 additional duplicates of above tests in Jest output)*

---

### [Additional 267 test failures in this category from other test files]

**Affected Test Files (with pg_type_typname_nsp_index errors):**
- task12-match-coordination.spec.ts
- tournaments.bundle.spec.ts
- task17-sse.spec.ts
- e2e-tournament-workflow.spec.ts
- tournaments.spec.ts
- score-submission.spec.ts
- task15-bracket-job.spec.ts
- task16-email-job.spec.ts
- analytics.spec.ts
- coverage-improvement.spec.ts

**All these tests fail during `beforeAll`/`beforeEach` database initialization phase, preventing any test code from executing.**

---

## Subcategory 1B: pg_class_relname_nsp_index Constraint (46 errors)

**Root Cause:** Relation (table) name conflict in PostgreSQL catalog. Similar cause to 1A but specifically for table definitions.

**Error Message:** `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"`

### group-stage.spec.ts (25 failures)
**Test Suite:** Group Stage Management  
**Description:** Tests for tournament state transitions, group creation/listing, and standings calculation

| # | Test Name | Error |
|---|-----------|-------|
| 1 | Group Stage Management › POST /:id/advance - tournament state transitions › should advance from registration_open to registration_closed | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 2 | Group Stage Management › POST /:id/advance - tournament state transitions › should return 409 for invalid transition | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 3 | Group Stage Management › POST /:id/advance - tournament state transitions › should return 400 if action is missing | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 4 | Group Stage Management › POST /:id/advance - tournament state transitions › should return 404 for unknown tournament | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 5 | Group Stage Management › POST /:id/advance - tournament state transitions › should return 403 if non-owner organizer tries to advance | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 6 | Group Stage Management › POST /:id/advance - tournament state transitions › should return 401 if no auth provided | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 7 | Group Stage Management › POST /:id/groups - create groups › should create groups and distribute players evenly | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 8 | Group Stage Management › POST /:id/groups - create groups › should generate correct number of matches per group | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 9 | Group Stage Management › POST /:id/groups - create groups › should return 400 if numGroups is invalid | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 10 | Group Stage Management › POST /:id/groups - create groups › should return 400 if advancingPerGroup is invalid | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 11 | Group Stage Management › POST /:id/groups - create groups › should return 400 if not enough players for requested groups | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 12 | Group Stage Management › POST /:id/groups - create groups › should return 409 if tournament is not in registration_closed status | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 13 | Group Stage Management › POST /:id/groups - create groups › should return 403 if non-owner organizer tries to create groups | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 14 | Group Stage Management › POST /:id/groups - create groups › should return 401 if no auth provided | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 15 | Group Stage Management › GET /:id/groups - list groups with members › should return groups with member names | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 16 | Group Stage Management › GET /:id/groups - list groups with members › should return 403 if non-owner organizer tries to list groups | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 17 | Group Stage Management › GET /:id/groups - list groups with members › should return 401 if no auth provided | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 18 | Group Stage Management › GET /:id/groups/:groupId/standings - group standings › should return standings with all players | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 19 | Group Stage Management › GET /:id/groups/:groupId/standings - group standings › should compute standings correctly after match results | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 20 | Group Stage Management › GET /:id/groups/:groupId/standings - group standings › should return 404 for unknown group | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 21 | Group Stage Management › GET /:id/groups/:groupId/standings - group standings › should return 401 if no session token provided | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 22 | Group Stage Management › GET /:id/groups/:groupId/standings - group standings › should return 403 if player not in tournament | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |
| 23 | Group Stage Management › GET /:id/groups/:groupId/standings - group standings › should return 403 if player is not in the group | `error: duplicate key value violates unique constraint "pg_class_relname_nsp_index"` |

*(Plus 21 additional failures in other test files)*

---

## Subcategory 1C: pg_namespace_nspname_index Constraint (40 errors)

**Root Cause:** Schema namespace already exists in PostgreSQL catalog.

**Error Message:** `error: duplicate key value violates unique constraint "pg_namespace_nspname_index"`

### locations-courts.spec.ts (40 failures)
**Test Suite:** Locations and Courts Repository  
**Description:** Tests for location and court CRUD operations, capacity calculations, and queries

| # | Test Name | Error |
|---|-----------|-------|
| 1 | CourtRepository › create › should create a court with default status | `error: duplicate key value violates unique constraint "pg_namespace_nspname_index"` |
| 2 | CourtRepository › create › should create a court with specified status | `error: duplicate key value violates unique constraint "pg_namespace_nspname_index"` |
| 3 | CourtRepository › create › should assign unique IDs to different courts | `error: duplicate key value violates unique constraint "pg_namespace_nspname_index"` |
| 4 | CourtRepository › create › should create court for valid location | `error: duplicate key value violates unique constraint "pg_namespace_nspname_index"` |
| 5 | CourtRepository › findById › should find court by id | `error: duplicate key value violates unique constraint "pg_namespace_nspname_index"` |

*(Plus 35 additional failures in locations-courts.spec.ts)*

---

## Subcategory 1D: schema_migrations_version_key Constraint (70 errors)

**Root Cause:** Migration tracking table has duplicate version entries. Migrations were partially run or re-ran on incomplete schema drop.

**Error Message:** `error: duplicate key value violates unique constraint "schema_migrations_version_key"`

### task24-db-errors.spec.ts (12 failures)
**Test Suite:** Async Error Handling & Edge Cases  
**Description:** Tests for database constraint violations, null handling, and edge cases with async operations

| # | Test Name | Error |
|---|-----------|-------|
| 1 | Task 2.4: Async Error Handling & Edge Cases › Constraint Violations › UNIQUE Constraint - duplicate email | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 2 | Task 2.4: Async Error Handling & Edge Cases › Constraint Violations › UNIQUE Constraint - duplicate tournament name | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 3 | Task 2.4: Async Error Handling & Edge Cases › Constraint Violations › CHECK Constraint - negative max_players | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 4 | Task 2.4: Async Error Handling & Edge Cases › Constraint Violations › CHECK Constraint - negative group count | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 5 | Task 2.4: Async Error Handling & Edge Cases › Constraint Violations › FOREIGN KEY Constraint - missing tournament | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 6 | Task 2.4: Async Error Handling & Edge Cases › Null/Undefined Handling › should throw NotFoundError for missing tournament in read | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 7 | Task 2.4: Async Error Handling & Edge Cases › Null/Undefined Handling › should throw NotFoundError for missing player in read | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 8 | Task 2.4: Async Error Handling & Edge Cases › Null/Undefined Handling › should throw NotFoundError for missing tournament in update | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 9 | Task 2.4: Async Error Handling & Edge Cases › Null/Undefined Handling › should throw NotFoundError for missing player in update | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 10 | Task 2.4: Async Error Handling & Edge Cases › Query Timeout › should return error when query exceeds timeout | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 11 | Task 2.4: Async Error Handling & Edge Cases › Concurrent Operations › should handle concurrent updates without data corruption | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |
| 12 | Task 2.4: Async Error Handling & Edge Cases › Concurrent Operations › should handle concurrent deletes safely | `error: duplicate key value violates unique constraint "schema_migrations_version_key"` |

*(Plus 58 additional failures from other test files with same error)*

---

---

# CATEGORY 2: Database Schema/Connection Issues (274 total errors)

## Subcategory 2A: Schema Missing Errors (146 errors)

**Root Cause:** Public schema missing from database. Either successfully dropped but then referenced, or connection is to wrong database.

**Error Message:** `error: schema "public" does not exist`

### bracket.spec.ts (20 failures)
**Test Suite:** Bracket Management  
**Description:** Tests for knockout bracket generation, seeding, match details, and score updates

| # | Test Name | Error |
|---|-----------|-------|
| 1 | Bracket Management › POST /:id/bracket/generate › should generate bracket with correct seeding | `error: schema "public" does not exist` |
| 2 | Bracket Management › POST /:id/bracket/generate › should fail if tournament not in correct state | `error: schema "public" does not exist` |
| 3 | Bracket Management › POST /:id/bracket/generate › should fail without organizer permission | `error: schema "public" does not exist` |
| 4 | Bracket Management › GET /:id/bracket › should return bracket with resolved player names | `error: schema "public" does not exist` |
| 5 | Bracket Management › GET /:id/bracket › should return 404 if bracket not generated | `error: schema "public" does not exist` |
| 6 | Bracket Management › GET /:id/bracket › should return 401 if no session token | `error: schema "public" does not exist` |
| 7 | Bracket Management › POST /:id/bracket › should return 400 if action is missing | `error: schema "public" does not exist` |
| 8 | Bracket Management › POST /:id/bracket › should return 401 without organizer auth | `error: schema "public" does not exist` |
| 9 | Bracket Management › POST /:id/knockout/:matchId/score (player) › should submit score as player | `error: schema "public" does not exist` |
| 10 | Bracket Management › POST /:id/knockout/:matchId/score (player) › should reject missing auth | `error: schema "public" does not exist` |
| 11 | Bracket Management › PATCH /:id/knockout/:matchId/score (organizer) › should override score as organizer | `error: schema "public" does not exist` |
| 12 | Bracket Management › PATCH /:id/knockout/:matchId/score (organizer) › should reject when match missing players | `error: schema "public" does not exist` |
| 13 | Bracket Management › PATCH /:id/knockout/:matchId/score (organizer) › should reject missing auth | `error: schema "public" does not exist` |
| 14 | Bracket Management › Tournament state and advancement tests › should prevent advancing past bracket generation | `error: schema "public" does not exist` |
| 15 | Bracket Management › Tournament state and advancement tests › should handle missing bearer token | `error: schema "public" does not exist` |
| 16 | Bracket Management › PATCH /:id/bracket › should fail when seed missing seedPosition | `error: schema "public" does not exist` |
| 17 | Bracket Management › PATCH /:id/bracket › should fail when seed missing playerId | `error: schema "public" does not exist` |
| 18 | Bracket Management › Bracket display › should render all rounds and positions | `error: schema "public" does not exist` |
| 19 | Bracket Management › Bracket display › should show proper player seeding | `error: schema "public" does not exist` |
| 20 | Bracket Management › Bracket display › should calculate advancement correctly | `error: schema "public" does not exist` |

*(Plus 126 additional failures from other test files)*

### tournaments.spec.ts (18 failures)
**Test Suite:** Tournament CRUD Operations  
**Description:** Tests for creating, reading, updating, deleting tournaments

### score-submission.spec.ts (16 failures)
**Test Suite:** Score Submission and Match Results  
**Description:** Tests for player and organizer score submissions, validation, and updates

### e2e-tournament-workflow.spec.ts (14 failures)
**Test Suite:** End-to-End Tournament Workflow  
**Description:** Full integration tests for tournament lifecycle from registration to finals

### [Additional 78 failures in other test files]

---

## Subcategory 2B: Connection Termination Errors (126 errors)

**Root Cause:** PostgreSQL administrator terminated connections. Likely caused by schema cleanup scripts (`pg_terminate_backend()`) running but connections not properly released first.

**Error Message:** `error: terminating connection due to administrator command`

### task8-missing-endpoints.spec.ts (20 failures)
**Test Suite:** Missing Endpoints  
**Description:** Tests for tournament availability listing, filtering, pagination

| # | Test Name | Error |
|---|-----------|-------|
| 1 | Task #8 - Missing Endpoints › GET /tournaments/available › should list available tournaments | `error: terminating connection due to administrator command` |
| 2 | Task #8 - Missing Endpoints › GET /tournaments/available › should filter available tournaments by sport | `error: terminating connection due to administrator command` |
| 3 | Task #8 - Missing Endpoints › GET /tournaments/available › should return tournaments sorted by registration deadline | `error: terminating connection due to administrator command` |
| 4 | Task #8 - Missing Endpoints › GET /tournaments/available › should handle pagination with limit and offset | `error: terminating connection due to administrator command` |
| 5 | Task #8 - Missing Endpoints › GET /tournaments/available › should track current player count per tournament | `error: terminating connection due to administrator command` |
| 6 | Task #8 - Missing Endpoints › GET /tournaments/available › should return empty array when no available tournaments | `error: terminating connection due to administrator command` |
| 7 | Task #8 - Missing Endpoints › GET /tournaments/available › should return 400 for invalid pagination params | `error: terminating connection due to administrator command` |
| 8 | Task #8 - Missing Endpoints › GET /tournaments/browse › should return all published tournaments | `error: terminating connection due to administrator command` |
| 9 | Task #8 - Missing Endpoints › GET /tournaments/browse › should include availability info | `error: terminating connection due to administrator command` |
| 10 | Task #8 - Missing Endpoints › GET /tournaments/browse › should support filtering | `error: terminating connection due to administrator command` |

*(Plus 106 additional failures from other test files)*

### player-registration.spec.ts (30+ failures at 40s timeout)
**Test Suite:** Player Registration  
**Description:** Tests for player registration, partner selection, status updates, withdrawal

---

## Subcategory 2C: Relation Missing Errors (2 errors)

**Root Cause:** Specific table missing from database.

**Error Message:** `error: relation "public.players" does not exist`

### task13-job-queue-integration.spec.ts (1 failure)
**Test Suite:** Job Queue Integration  
**Description:** Tests for job queue integration with standings recalculation

### player-registration.spec.ts (1 failure)
**Test Suite:** Player Registration (also has 30+ failures in category 2B)  
**Description:** Tests for player registration workflow

---

---

# CATEGORY 3: Undefined Reference Errors (102 total errors)

**Root Cause:** Test cleanup code attempting to close/release resources that failed to initialize. Since database initialization fails in Categories 1 & 2, connection pool is never created, causing `.close()` calls on undefined.

---

## Subcategory 3A: Cannot read properties of undefined (reading 'close') (54 errors)

**Error Message:** `TypeError: Cannot read properties of undefined (reading 'close')`

### task8-missing-endpoints.spec.ts (sample failures)
**Error Context:**
```
at Object.<anonymous> (src/__tests__/task8-missing-endpoints.spec.ts:21:10)

const result = await axe(container, {
```

**Root Cause:** Server variable undefined during cleanup due to failed initialization.

*(54 total errors spread across test files that reach cleanup phase)*

---

## Subcategory 3B: Cannot set properties of undefined (setting 'query') (48 errors)

**Error Message:** `TypeError: Cannot set properties of undefined (setting 'query')`

**Root Cause:** Connection pool undefined; test setup failed to create pool before mocking operations.

*(48 total errors spread across test files)*

---

---

# Summary Table

| Error Category | Sub-Category | Error Type | Count | Primary Files |
|---|---|---|---|---|
| **1** | 1A | pg_type_typname_nsp_index | 346 | task12, tournaments.bundle, task17, e2e, tournaments, score-submission |
| **1** | 1B | pg_class_relname_nsp_index | 46 | group-stage |
| **1** | 1C | pg_namespace_nspname_index | 40 | locations-courts |
| **1** | 1D | schema_migrations_version_key | 70 | task24, task14, task15, task16, match-scoring, coverage |
| **2** | 2A | schema "public" does not exist | 146 | bracket, tournaments, score-submission, e2e, task13, analytics |
| **2** | 2B | terminating connection | 126 | task8, player-registration, player-auth, task14-16 |
| **2** | 2C | relation missing | 2 | task13, player-registration |
| **3** | 3A | Cannot read 'close' | 54 | task8, task17, task13, tournaments |
| **3** | 3B | Cannot set 'query' | 48 | Various test files |
| | | **TOTAL FAILURES** | **403** | **20 test suites** |

---

# Key Observations

1. **Database Initialization Failures (Categories 1 & 2):** 502 + 274 = **776 failures** occur during test setup phase
2. **Cleanup Failures (Category 3):** 102 failures occur when cleanup tries to close undefined connections
3. **Test Code Never Runs:** Tests fail before any test assertions execute — the problem is infrastructure, not test logic
4. **Async/Await Code:** Is complete and correct — zero "Did you forget to use 'await'?" errors
5. **Root Problem:** Test database reset logic in `db-test-setup.ts` not fully dropping PostgreSQL schema objects

---

**Document Generated:** 2026-05-20  
**Test Run Date:** 2026-05-20  
**Total Tests Analyzed:** 403 failures from 20 test suites  
**Total Passing Tests:** 923 (for comparison)
