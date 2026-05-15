# User Activity Metrics & Analytics Design
## Feasibility Analysis for Task #19

**Date:** 2026-05-15  
**Status:** ✅ FEASIBLE — Detailed design provided

---

## Executive Summary

**Yes, it is absolutely possible** to collect user activity metrics from the UI. This document outlines:
1. **What metrics are collectible** (route navigation, time-on-screen, interactions)
2. **Architecture approaches** (client-side, server-side, hybrid)
3. **Implementation options** (lightweight vs. comprehensive)
4. **Privacy & performance considerations**
5. **Recommended approach** for Task #19

---

## Collectible Metrics

### 1. Navigation Metrics
**Route/Path Navigation**
- Which screens users visit (landing → browse → tournament detail → standings)
- Entry points (direct URL, login flow, deep links)
- Navigation breadcrumbs (which buttons lead where)
- Bounce points (where users drop off)
- Back/forward button usage

**Implementation:**
- Intercept route changes (page transitions)
- Track source → destination → timestamp
- Identify user flows (sequences of screens)

### 2. Time Metrics
**Session & Screen Duration**
- Time on each screen (seconds/minutes)
- Time to first interaction (page load → user action)
- Time waiting for data (API call → data received → UI renders)
- Session duration (login → logout)
- Idle time detection

**Implementation:**
- Measure page enter/leave timestamps
- Track data loading start/end times
- Compare API response times vs. user wait time

### 3. Interaction Metrics
**User Actions**
- Button clicks (which CTAs are used)
- Form interactions (fields filled, validation errors)
- Filtering/sorting (standings table column sorts)
- Scroll behavior (how far down pages users scroll)
- Search queries (tournament filters, player searches)

**Implementation:**
- Event tracking on interactive elements
- Form submit tracking
- Click tracking on buttons/links

### 4. Performance Metrics
**Load & Wait Times**
- API response time (JSON download)
- Time to interactive (UI renders)
- Bundle load time (if tracking JS resources)
- Data fetching delays (standings update latency, bracket load)

**Implementation:**
- Measure fetch() start/end
- Track component mount/render timing
- Monitor SSE event latency

### 5. Feature Usage Metrics
**Feature Adoption**
- Which phase are users in (registration/group/knockout/complete)
- Score submission rate (% of matches with submitted scores)
- Bracket view usage (vs. matches list)
- Real-time updates (SSE event reception)

**Implementation:**
- Track feature state changes
- Monitor SSE connection status
- Count completed actions

---

## Architecture Approaches

### Option 1: Client-Side Only (Simplest)
**Collect metrics in browser, send to backend**

**Pros:**
- No additional infrastructure needed
- Real-time data collection
- Easy to implement (localStorage or API posts)
- No third-party dependencies

**Cons:**
- Users can disable/modify (not authoritative)
- No data if user closes browser immediately
- Limited to client-side events
- Privacy concerns (tracking user behavior)

**Implementation:**
```typescript
// In frontend
const metrics = {
  timestamp: Date.now(),
  userId: currentPlayer.id,
  eventType: 'screen_view', // 'screen_view', 'click', 'time_waited', etc.
  screen: 'tournament_details',
  duration: 2340, // ms
  data: { tournamentId, phase }
}

// POST to /analytics endpoint
await fetch('/analytics/events', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify(metrics)
})
```

**Where to store:**
- Backend: Create table `user_analytics` or `user_events`
- Schema: `(id, userId, eventType, screen, timestamp, duration, metadata, createdAt)`

---

### Option 2: Server-Side Only (Most Authoritative)
**Backend infers user activity from API logs**

**Pros:**
- Single source of truth (server logs)
- Can't be spoofed or modified by client
- Automatic (no extra client code needed)
- Existing logging infrastructure can be enhanced

**Cons:**
- Can't track UI/routing without API calls
- Misses non-API interactions (clicks, scrolls)
- Need to correlate requests with sessions
- Harder to track time spent on non-data-fetching screens

**Implementation:**
```typescript
// In API routes (already have CLAUDE.md logging)
log.info('screen.viewed', {
  screen: 'tournament_details',
  userId: payload.sub,
  tournamentId: tournamentId,
  phase: tournament.phase,
  requestId: ctx.requestId, // Automatic via AsyncLocalStorage
})

// Later, query logs to reconstruct user journeys
// SELECT * FROM logs WHERE userId = ? ORDER BY timestamp
```

---

### Option 3: Hybrid (Recommended for Task #19)
**Client tracks navigation & UX metrics, server tracks data/business events**

**Pros:**
- Complete view of user journey (client + server)
- Lightweight (not over-instrumented)
- Privacy-conscious (only track what matters)
- Can correlate navigation with API performance
- Existing logging infrastructure used

**Cons:**
- Slightly more complex (two sources of data)
- Need to sync timestamps between client/server

**Implementation:**

**Client-Side (Lightweight):**
```typescript
// Route/Navigation tracking
type NavigationEvent = {
  timestamp: number
  fromScreen?: string
  toScreen: string
  userId: string
  duration: number // time on previous screen
}

// Time-to-interactive tracking
type TimeToDataEvent = {
  timestamp: number
  screen: string
  userId: string
  apiStartTime: number // when fetch() was called
  apiEndTime: number   // when response received
  renderTime: number   // when component mounted with data
  waitTime: number     // total wait experienced by user
}

// POST batch of events periodically or on page unload
const flushAnalytics = () => {
  if (pendingEvents.length === 0) return
  navigator.sendBeacon('/analytics/batch', JSON.stringify(pendingEvents))
}
window.addEventListener('beforeunload', flushAnalytics)
```

**Server-Side (Existing):**
```typescript
// Enhance CLAUDE.md logging to include timing
log.info('standings.fetched', {
  tournamentId,
  userId,
  duration: endTime - startTime, // How long it took to fetch
  recordCount: standings.length,
  requestId, // Automatic
})
```

**Query Example:**
```sql
-- User's navigation path
SELECT screen, timestamp, duration FROM user_navigation
WHERE userId = ? 
ORDER BY timestamp
LIMIT 20

-- Time users waited for standings update
SELECT avg(waitTime), max(waitTime) FROM user_events
WHERE eventType = 'time_to_data' AND screen = 'standings'

-- API performance impact on UX
SELECT 
  apiDuration, 
  waitTime,
  (waitTime - apiDuration) as uiRenderTime
FROM user_events
WHERE eventType = 'time_to_data'
ORDER BY waitTime DESC
LIMIT 100
```

---

## Implementation Options for Task #19

### Quick Win (1-2 hours)
**Add basic navigation & timing tracking**

1. Create `packages/frontend/src/analytics/tracker.ts`:
   ```typescript
   export class AnalyticsTracker {
     private events: any[] = []
     private currentScreen: string
     private screenEnterTime: number

     trackScreenView(screen: string) {
       if (this.currentScreen) {
         // Log time on previous screen
         const duration = Date.now() - this.screenEnterTime
         this.logEvent('screen_view', {
           screen: this.currentScreen,
           duration
         })
       }
       this.currentScreen = screen
       this.screenEnterTime = Date.now()
     }

     trackTimeToData(screen: string, apiTime: number, totalWaitTime: number) {
       this.logEvent('time_to_data', {
         screen,
         apiTime,
         totalWaitTime,
         uiRenderTime: totalWaitTime - apiTime
       })
     }

     private logEvent(eventType: string, data: any) {
       this.events.push({
         timestamp: Date.now(),
         eventType,
         ...data
       })

       // Flush periodically or on unmount
       if (this.events.length >= 10) {
         this.flush()
       }
     }

     async flush() {
       if (this.events.length === 0) return
       await fetch('/api/analytics/events', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ events: this.events })
       })
       this.events = []
     }
   }
   ```

2. Create backend `POST /api/analytics/events` endpoint:
   ```typescript
   router.post('/analytics/events', auth, async (ctx) => {
     const { events } = ctx.request.body
     // Store in user_events table
     await db.query(
       'INSERT INTO user_events (userId, eventType, screen, data, createdAt) VALUES (?, ?, ?, ?, NOW())',
       [ctx.state.userId, events.map(...)]
     )
     ctx.status = 204
   })
   ```

3. Create `user_events` table:
   ```sql
   CREATE TABLE user_events (
     id UUID PRIMARY KEY,
     userId UUID NOT NULL,
     eventType VARCHAR(50) NOT NULL, -- 'screen_view', 'time_to_data', 'click'
     screen VARCHAR(100),
     duration INT, -- milliseconds
     data JSONB, -- flexible schema for extra metadata
     createdAt TIMESTAMP DEFAULT NOW(),
     FOREIGN KEY (userId) REFERENCES players(id)
   )
   CREATE INDEX idx_user_events_userId_createdAt ON user_events(userId, createdAt)
   ```

**Result:** Can answer:
- ✅ Which routes do users take to get to a screen?
- ✅ How long did users wait to view results?
- ⚠️ (Limited) Why do users navigate (inferred from API calls)

---

### Comprehensive (4-6 hours)
**Add full interaction tracking + server-side correlation**

1. Track all of Option 1 (Quick Win)
2. Add click tracking on buttons, form interactions
3. Correlate client-side navigation with server-side API calls
4. Create analytics dashboard queries
5. Add privacy controls (opt-out)

**Additional tables:**
```sql
CREATE TABLE user_interaction_events (
  id UUID PRIMARY KEY,
  userId UUID NOT NULL,
  eventType VARCHAR(50), -- 'button_click', 'form_submit', 'filter_applied'
  component VARCHAR(100),
  action VARCHAR(100),
  metadata JSONB,
  createdAt TIMESTAMP DEFAULT NOW()
)

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  userId UUID NOT NULL,
  startTime TIMESTAMP,
  endTime TIMESTAMP,
  screenCount INT,
  eventCount INT,
  createdAt TIMESTAMP DEFAULT NOW()
)
```

---

### Privacy & Compliance Considerations

**What to collect:**
- ✅ Route navigation (necessary for UX understanding)
- ✅ Time metrics (performance analysis)
- ✅ Feature usage (business metrics)

**What NOT to collect:**
- ❌ Form field contents (PII risk)
- ❌ Search queries (if they contain player names)
- ❌ IP addresses (unless required)
- ❌ Browser fingerprints

**Implementation:**
```typescript
// Never log sensitive data
const BLOCKED_FIELDS = ['password', 'email', 'token', 'secret']

function sanitizeEventData(data: any) {
  const sanitized = { ...data }
  BLOCKED_FIELDS.forEach(field => {
    if (field in sanitized) delete sanitized[field]
  })
  return sanitized
}
```

**Disclosure:**
- Add privacy notice: "We collect anonymized usage metrics to improve performance"
- Add opt-out option (localStorage flag)
- Follow GDPR/CCPA guidelines

---

## Queries to Answer Key Questions

### "Which routes do users take to get to a screen?"
```sql
-- User's navigation path to standings screen
WITH user_path AS (
  SELECT userId, screen, timestamp, 
         ROW_NUMBER() OVER (PARTITION BY userId ORDER BY timestamp) as order
  FROM user_events
  WHERE eventType = 'screen_view'
    AND userId = ? 
  ORDER BY timestamp
)
SELECT * FROM user_path
WHERE order <= (SELECT order FROM user_path WHERE screen = 'standings' LIMIT 1)
```

### "How long did users wait to view results?"
```sql
SELECT 
  userId,
  screen,
  AVG(duration) as avg_wait_ms,
  MAX(duration) as max_wait_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) as p95_wait_ms
FROM user_events
WHERE eventType = 'time_to_data'
  AND screen = 'standings'
GROUP BY userId, screen
```

### "Which screens have the longest load times?"
```sql
SELECT 
  screen,
  COUNT(*) as loads,
  AVG(apiTime) as avg_api_time,
  AVG(uiRenderTime) as avg_render_time,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY totalWaitTime) as p95_total
FROM user_events
WHERE eventType = 'time_to_data'
GROUP BY screen
ORDER BY p95_total DESC
```

---

## Recommended Approach for Task #19

**Start with Quick Win (Option 1), expand to Comprehensive later:**

1. **Phase 0-3 (Now):** Implement basic navigation & timing tracking
2. **Phase 4-5:** Add button/form interaction tracking
3. **Phase 7 (Testing):** Add analytics validation tests
4. **Post-Phase 7:** Create analytics dashboard queries

**Why this approach:**
- Low initial complexity (doesn't block feature delivery)
- Provides immediate value (can identify slow screens)
- Easy to expand without refactoring
- Privacy-conscious from start

---

## Next Steps

Would you like me to:
1. **Create analytics tracker module** for Phase 2 hooks?
2. **Add backend `/api/analytics/events` endpoint** for Phase 1?
3. **Design database schema** for `user_events` table?
4. **Create sample queries** for common analytics questions?
5. **All of the above** as a separate task?

---

## Summary Table

| Metric | Collectible? | Effort | Privacy Risk |
|--------|-------------|--------|--------------|
| Route navigation | ✅ Yes | Low | Low |
| Time on screen | ✅ Yes | Low | Low |
| Time waiting for results | ✅ Yes | Low | Low |
| Feature usage | ✅ Yes | Low | Low |
| Button clicks | ✅ Yes | Medium | Low |
| Form interactions | ✅ Yes (sanitized) | Medium | Medium |
| User searches | ⚠️ Conditional | Low | Medium |
| Session duration | ✅ Yes | Low | Low |
| Performance metrics | ✅ Yes | Low | Low |
