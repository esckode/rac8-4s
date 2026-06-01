# Shared Tasks: Structured Tournaments + Impromptu Tournaments

## Summary

**YES! There are 3 shared foundation tasks that can be started immediately** (they don't depend on other tasks completing first).

These tasks are **critical blockers** for both the structured tournament system (already in progress) and impromptu tournaments (new feature).

---

## Shared Foundation Tasks (Can Start NOW)

### 1️⃣ IMPLEMENTATION_PLAN.md Task #1 + IMPROMPTU_IMPLEMENTATION_PLAN.md Task #1

**Status:** These are NOT separate tasks — they are a **single shared task with two dimensions**

**Combined Task: Set Up Monorepo + Create Locations & Courts Infrastructure**

**Current Status:** 
- Monorepo structure DONE (already set up in existing codebase)
- Jest/test infrastructure: PARTIALLY DONE (tests exist for structured tournaments)
- Locations table: **NOT YET STARTED** ⚠️
- Courts table: **NOT YET STARTED** ⚠️

**Work Remaining (Priority: HIGH):**

1. **Create migrations:**
   - `db/migrations/005_create_locations.sql` — shared locations table
   - `db/migrations/006_create_courts.sql` — shared courts table

2. **Create repositories:**
   - `packages/api/src/repositories/LocationRepository.ts`
   - `packages/api/src/repositories/CourtRepository.ts`

3. **Integrate into db.ts:**
   - Export `LocationRepository` and `CourtRepository` from `openDatabase()`

4. **Write tests:**
   - ≥95% coverage for both repositories

**Project Requirements:**
- **Logging:** location.created, location.updated, court.status_changed, capacity.recalculated
- **Analytics:** location creation rate, court utilization, capacity changes
- **Coverage:** 95% line/branch
- **Security:** SQL parameterization, proximity validation (25m x 25m), audit trail

**Why It's Shared:**
- Structured tournaments: optional location tracking for performance analysis
- Impromptu tournaments: **required** for queue management and capacity tracking
- Both need identical schema and repositories

**Timeline:** 2-3 days (can start immediately)

---

## Dependency Mapping: What Blocks What

```
SHARED FOUNDATION
├─ Monorepo + Test Infrastructure (DONE ✅)
└─ Locations + Courts Shared Infrastructure (NOT STARTED ⚠️) 
   ├─ Blocks: All Impromptu Phase 1-5 tasks (#2-25)
   ├─ Blocks: Structured Tournament location tracking (Task #7 in IMPROMPTU_IMPLEMENTATION_PLAN.md)
   └─ Needed by: Both apps simultaneously

STRUCTURED TOURNAMENTS (from IMPLEMENTATION_PLAN.md)
├─ Task #1: Monorepo (✅ DONE)
└─ Tasks #2-5: Core business logic (can work in parallel)
   ├─ #2: Standings calculation
   ├─ #3: Bracket generation  
   ├─ #4: Score parsing
   └─ #5: Tournament state machine

IMPROMPTU TOURNAMENTS (from IMPROMPTU_IMPLEMENTATION_PLAN.md)
├─ Shared Task #1: Locations + Courts (BLOCKING ⚠️)
└─ Once #1 done, Phase 1 tasks can start (#2-8 in parallel)
   ├─ #2: Impromptu state machine
   ├─ #3: Queue priority logic
   ├─ #4: Doubles pairing
   ├─ #5: Check-in logic
   ├─ #6: Court availability
   ├─ #7: Structured tournament location support
   └─ #8: Impromptu registration
```

---

## Critical Path Analysis

**Currently:**
- Structured tournament tasks #2-5 can progress independently
- Impromptu tasks CANNOT start until shared locations/courts task is complete

**Optimal Execution Order:**

**Week 1 (NOW):**
1. ✅ Task #1 (Shared): Locations + Courts infrastructure (2-3 days)
   - High priority: blocks everything downstream
   - Can work in parallel with structured tournament tasks #2-5

**Weeks 2-4 (Parallel tracks):**

**Track A - Structured Tournaments (already in progress):**
- Tasks #2-5: Core logic (standings, bracket, score parsing, state machine)
- Tasks #6-12: API endpoints & integration
- Tasks #13-17: Async jobs
- Tasks #18-20: Frontend + E2E

**Track B - Impromptu Tournaments (can start immediately after shared task #1):**
- Tasks #2-8: Core logic (parallel)
- Tasks #9-13: RSVP + community groups
- Tasks #14-18: Check-in + match assignment + analytics
- Tasks #19-25: Frontend + E2E + WebSocket

**Weeks 5-6:**
- Both tracks converge on frontend integration
- E2E tests verify both systems work together

---

## Shared Task Details: Locations + Courts

### What to Build

**Schema (505_create_locations.sql):**
```sql
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL, -- pickleball, tennis, badminton, etc.
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  total_courts INTEGER NOT NULL,
  restricted BOOLEAN DEFAULT FALSE,
  entry_conditions TEXT, -- optional text description
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_locations_sport ON locations(sport);
CREATE INDEX idx_locations_coordinates ON locations(latitude, longitude);
CREATE INDEX idx_locations_created ON locations(created_at DESC);
```

**Schema (006_create_courts.sql):**
```sql
CREATE TABLE courts (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'unavailable', 'maintenance')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_courts_location ON courts(location_id);
CREATE INDEX idx_courts_status ON courts(location_id, status);
```

### Test Coverage Checklist

**LocationRepository (≥95% coverage):**
- ✅ Create location with valid data
- ✅ Retrieve by id, by sport, by created date
- ✅ Update location details
- ✅ Calculate current capacity (total - unavailable)
- ✅ Proximity detection (25m x 25m radius)
- ✅ Prevent duplicate courts near each other
- ✅ Soft delete
- ✅ Pagination on list queries

**CourtRepository (≥95% coverage):**
- ✅ Create court
- ✅ Update status (available ↔ unavailable)
- ✅ Retrieve by location
- ✅ Calculate location capacity impact
- ✅ Track availability history

**Integration Tests (≥90%):**
- ✅ Database transactions work
- ✅ Capacity recalculates correctly when courts change
- ✅ Proximity validation prevents duplicates
- ✅ Foreign key constraints enforced

### Project Requirements

**Logging:**
```
location.created | locationId, sport, coordinates, totalCourts, creatorId
location.updated | locationId, fieldsChanged, userId
court.status_changed | courtId, locationId, fromStatus, toStatus, reason, userId
capacity.recalculated | locationId, previousCapacity, newCapacity, trigger
```

**Analytics:**
```
location.created | sport, coordinates
location.court_count | Aggregate by sport
location.capacity_changes | change_type, affected_registrations_count
location.utilization_rate | (courts_in_use / total_courts) daily average
```

**Coverage:**
- Line: ≥95%
- Branch: 100% for capacity calculation
- Integration: ≥90% for database

**Security:**
- ✅ SQL parameterization
- ✅ Input validation (valid lat/long, positive integers)
- ✅ Authorization (only location admins can update court status)
- ✅ Proximity calculation precise (25m x 25m verified with test coordinates)
- ✅ Audit trail (log who created/modified)

---

## Recommendation: Start NOW

### Task to Create in TaskList:

**New Task: Implement Shared Locations & Courts Infrastructure**

- **Description:** Create locations and courts tables/repositories. This is the critical foundation for both structured tournament location tracking (optional) and impromptu tournament queue management (required).
- **Status:** Not yet started
- **Priority:** CRITICAL (blocks impromptu feature entirely)
- **Timeline:** 2-3 days
- **Blocks:** All impromptu Phase 1-5 tasks, structured tournament optional location tracking
- **Dependencies:** None (can start immediately)

### Why Start This Now:

1. **Zero dependencies** — can be done in parallel with structured tournament work
2. **Blocks impromptu entirely** — can't start impromptu tasks #2-25 without it
3. **Quick win** — 2-3 days to unblock 25 tasks
4. **Shared code** — both systems benefit from same infrastructure
5. **Foundation** — location/court data is used by both structured tournaments and impromptu

---

## Summary: Shared vs. Separate

| Task | Type | Status | Can Start Now? |
|------|------|--------|---|
| Monorepo + test infrastructure | Shared | ✅ DONE | N/A |
| Locations + Courts infrastructure | Shared | ⚠️ NOT STARTED | **YES - PRIORITY** |
| Structured tournament core logic (#2-5) | Separate | In Progress | YES |
| Impromptu core logic (#2-8) | Separate | Blocked on shared task | After shared task |
| Structured tournament API (#6-12) | Separate | In Progress | YES |
| Impromptu API (#9-15) | Separate | Blocked on shared task | After shared task |
| Structured tournament frontend (#18-20) | Separate | Can start | YES |
| Impromptu frontend (#19-25) | Separate | Blocked on shared task | After shared task |

---

## Next Steps

1. **Create task:** "Implement Shared Locations & Courts Infrastructure"
2. **Start immediately:** No blockers
3. **Estimated duration:** 2-3 days
4. **Deliverables:**
   - 2 migrations (locations, courts)
   - 2 repositories (LocationRepository, CourtRepository)
   - Tests with ≥95% coverage
   - Logging, analytics, security checklist completed

Once this is done, **all 25 impromptu tasks can begin** (many in parallel with structured tournament work).
