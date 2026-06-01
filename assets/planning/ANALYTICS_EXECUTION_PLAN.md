# Analytics Integration into Execution Plan
## Phase 2 Hooks + Phase 7 Backend Implementation

**Date:** 2026-05-15  
**Status:** ✅ INTEGRATED INTO TASK19_EXECUTION_PLAN.md

---

## Summary of Changes

Analytics metrics collection has been integrated into the task execution plan across two phases:

### Phase 2: Frontend Hooks (3 new tasks — 4 hours total)
- **Task 2.8:** Create useAnalytics hook (event buffering, batching)
- **Task 2.9:** Create usePageNavigation hook (screen_view tracking)
- **Task 2.10:** Integrate analytics into data hooks (time_to_data tracking)

### Phase 7: Backend Implementation (3 new tasks — 3 hours total)
- **Task 7.4a:** Create POST /api/analytics/events endpoint
- **Task 7.4b:** Create user_events database table
- **Task 7.4c:** Create analytics query examples & documentation

---

## What Metrics Will Be Collected

### Screen Navigation (Task 2.9)
```
Event Type: screen_view
Data: { screen, duration (ms) }
Collected By: usePageNavigation hook
Example: { screen: 'standings', duration: 2340 }
```

### Data Load Performance (Task 2.10)
```
Event Type: time_to_data
Data: { screen, apiDuration, renderDuration, totalDuration, recordCount }
Collected By: useStandingsStore, useMatchStore, useBracketStore hooks
Example: { 
  screen: 'standings', 
  apiDuration: 1200, 
  renderDuration: 1100, 
  totalDuration: 2300, 
  recordCount: 24 
}
```

### Real-Time Updates (Task 2.10)
```
Event Type: sse_update
Data: { eventType, latency }
Collected By: useSSE hook
Example: { eventType: 'standings.updated', latency: 450 }
```

---

## Implementation Timeline

### Phase 2 (Parallel with Phase 3)
```
Week 1: Phase 2.8-2.10 (analytics hooks development)
  ├─ 2.8: useAnalytics hook (1 hour)
  ├─ 2.9: usePageNavigation hook (1.5 hours)
  ├─ 2.10: Integrate into data hooks (1.5 hours)
  └─ No impact on Phase 3 (components don't see metrics code)

Week 2-4: Phase 3-4 UI Development (in parallel)
  └─ Components automatically collect metrics (no extra work)
```

### Phase 7 (After Phase 6 Testing)
```
Week 7: Phase 7.4a-7.4c (analytics backend)
  ├─ 7.4a: API endpoint (1.5 hours)
  ├─ 7.4b: Database table (0.5 hours)
  ├─ 7.4c: Query documentation (1 hour)
  └─ Flip switch: start persisting metrics (no app changes)
```

---

## File Changes in Execution Plan

### Phase 2 Section
- Added overview callout mentioning Tasks 2.8-2.10
- Explains why Phase 2 is the right place for analytics (metrics at hook layer)
- Notes zero impact on Phase 3-4 development

### New Tasks 2.8-2.10
```
Task 2.8: Create useAnalytics Hook (1 hour)
  └─ Event buffering, batching, flushing on unload
  
Task 2.9: Create usePageNavigation Hook (1.5 hours)
  └─ Track time on each screen, auto-log via useAnalytics
  
Task 2.10: Integrate Analytics into Data Hooks (1.5 hours)
  └─ Add time_to_data tracking to useStandingsStore, useMatchStore, useBracketStore
```

### Phase 7 Section
- Renamed Task 7.4 to 7.4a-c (split into 3 tasks)
- Task 7.4a: Create POST /api/analytics/events endpoint
- Task 7.4b: Create user_events database table
- Task 7.4c: Create analytics query examples & documentation
- Updated Task 7.5 to include analytics documentation

---

## Key Design Decisions

### 1. Hooks Layer is the Right Seam
✅ Metrics belong where data flows → hooks
✅ Zero coupling to components (UI devs don't see metrics code)
✅ Automatic collection (hooks handle it)

### 2. Phase 2, Not Phase 7
✅ Early performance visibility (know if screens are slow immediately)
✅ No rework needed (Phase 3-4 builds exactly as planned)
✅ Easy to toggle off (stub the hook if metrics not needed)
✅ Natural evolution (Phase 2 is already building hooks)

### 3. Client-Side Only (Phase 2-7)
✅ Simple implementation (3 hooks, 1 endpoint, 1 table)
✅ Zero infrastructure (no third-party analytics service)
✅ Full control (on-premise data)
✅ Easily extensible (add more metrics later)

### 4. Silent Failures
✅ If analytics flush fails, app continues (metrics don't break UX)
✅ Batch events to reduce network overhead
✅ Auto-flush on page unload (via sendBeacon)

---

## How It Works End-to-End

### User visits "Standings" screen
```
Phase 2 (Automatic):
  1. usePageNavigation logs time on previous screen
     → track('screen_view', { screen: 'tournament_list', duration: 3200 })
  2. User component mounts, useStandingsStore fetches data
     → Measures: API fetch, render time
     → track('time_to_data', { 
         screen: 'standings', 
         apiDuration: 1200, 
         totalDuration: 2300, 
         recordCount: 24 
       })
  3. Events batched in eventBuffer (module-level)
  4. Every 10 events (or on page unload), flush to backend
     → POST to /api/analytics/events

Phase 7 (Backend persistence):
  5. Endpoint receives events, validates, stores in user_events table
  6. log.info('analytics.batch_received', ...) for audit trail

Analyst/PM queries:
  7. SELECT * FROM user_events WHERE eventType = 'screen_view' 
       AND userId = ? ORDER BY createdAt
     → Can see: which screens user visited, how long on each
```

---

## Answers to Original Questions

### "Which routes do users take to get to a screen?"
```sql
-- Query from ANALYTICS_QUERIES.md
SELECT screen, duration, timestamp
FROM user_events
WHERE userId = ? AND eventType = 'screen_view'
ORDER BY timestamp

-- Result:
screen_1='landing', duration=5200, timestamp=1:02pm
screen_2='tournament_list', duration=3400, timestamp=1:07pm
screen_3='tournament_details', duration=2100, timestamp=1:10pm
screen_4='standings', duration=... (current)

-- Answer: User took path: Landing → Browse → Details → Standings
```

### "How long is the user waiting to view results?"
```sql
-- Query from ANALYTICS_QUERIES.md
SELECT screen, apiDuration, renderDuration, totalDuration
FROM user_events
WHERE eventType = 'time_to_data' AND screen = 'standings'
ORDER BY totalDuration DESC LIMIT 100

-- Result shows:
Slowest user wait: 4.2 seconds (API: 1.8s, Render: 2.4s)
Average wait: 2.1 seconds (API: 1.0s, Render: 1.1s)
P95 wait: 3.8 seconds

-- Answer: Most users wait ~2 seconds, slowest ~4 seconds
-- Breakdown: About half on API, half on rendering
```

---

## Dependencies & Prerequisites

### Phase 2.8-2.10 (Frontend Hooks)
- ✅ useAuth hook exists (to get userId)
- ✅ React hooks pattern established
- ✅ Phase 2.3 (useTournament) completed
- ✅ Animation tokens available

### Phase 7.4a (API Endpoint)
- ✅ Phase 2.8-2.10 completed (hooks sending events)
- ✅ API routing structure in place
- ✅ Authentication middleware configured

### Phase 7.4b (Database)
- ✅ Database schema and migration system set up
- ✅ Phase 7.4a will store events here

### Phase 7.4c (Documentation)
- ✅ Phase 7.4a and 7.4b completed
- ✅ Events flowing into database

---

## Testing Strategy

### Phase 2 Hook Tests (Same as other hooks)
- Unit tests for useAnalytics (batching, flushing, error handling)
- Unit tests for usePageNavigation (time tracking, cleanup)
- Integration tests for Task 2.10 (hooks + analytics together)

### Phase 7 Backend Tests
- Unit tests for POST /api/analytics/events endpoint
- Database tests for user_events table schema
- Integration tests for full flow (client → endpoint → table)

### Validation
- Verify metrics are collected without breaking app
- Verify no memory leaks (event buffer doesn't grow unbounded)
- Verify failed sends don't interrupt UX
- Verify data structure matches schema

---

## Privacy & Compliance

### What's Collected
✅ Route navigation (necessary for UX understanding)  
✅ Time metrics (performance analysis)  
✅ Feature usage (business metrics)  

### What's NOT Collected
❌ Form field contents (no PII)  
❌ Search queries (if they contain player names)  
❌ Browser fingerprints  
❌ IP addresses  

### Documentation
- Task 7.5 includes ANALYTICS.md with privacy notice
- Users can opt-out (localStorage flag)
- Follows GDPR/CCPA guidelines
- Sanitization of sensitive fields before logging

---

## Total Time Impact

### Phase 2: +4 hours
- 2.8: 1 hour (useAnalytics hook)
- 2.9: 1.5 hours (usePageNavigation hook)
- 2.10: 1.5 hours (integrate into data hooks)
- **Does NOT delay Phase 3** (parallel work)

### Phase 7: +3 hours
- 7.4a: 1.5 hours (API endpoint)
- 7.4b: 0.5 hours (database table)
- 7.4c: 1 hour (query documentation)

### Phase 3-4-5-6: ±0 hours
- Components don't know metrics exist
- Hooks automatically collect (transparent)
- No extra UI work needed

**Total: 7 additional hours for complete analytics implementation**  
**Value: Full visibility into user behavior, early performance detection**

---

## Next Steps

1. ✅ **Execution plan updated** with Tasks 2.8-2.10 and 7.4a-c
2. → **Start Phase 2** implementation (other Phase 2 tasks first)
3. → **Implement 2.8-2.10** when Phase 2.3+ stable
4. → **Run Phase 3-4** normally (metrics flow automatically)
5. → **Implement 7.4a-c** after Phase 6 testing
6. → **Flip switch** in Phase 7.5 to start persisting metrics

---

## Files Updated

1. **TASK19_EXECUTION_PLAN.md**
   - Phase 2 overview callout
   - Tasks 2.8, 2.9, 2.10 (detailed specifications)
   - Tasks 7.4a, 7.4b, 7.4c (analytics backend)
   - Task 7.5 updated (include analytics docs)

2. **ANALYTICS_INTEGRATION_STRATEGY.md** (reference)
   - Decision framework for integration approach
   - Code patterns and examples
   - Sample queries

3. **USER_ANALYTICS_DESIGN.md** (reference)
   - High-level metrics design
   - Architecture options (why Phase 2 chosen)
   - Privacy considerations

4. **ANALYTICS_EXECUTION_PLAN.md** (this file)
   - Summary of Phase 2 + Phase 7 tasks
   - Timeline and dependencies
   - End-to-end examples
