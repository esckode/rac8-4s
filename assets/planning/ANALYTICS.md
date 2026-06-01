# Analytics & Metrics Documentation

Complete guide to the analytics system: what metrics are collected, how they're collected, privacy considerations, and how to query results.

## Overview

The application collects real-time user behavior and performance metrics to understand:
- How users navigate the application
- Which features are most used
- Performance bottlenecks
- User engagement patterns
- Device and network characteristics

**Key Principle:** Analytics are collected to improve the user experience, not for tracking purposes. All data is anonymized (user IDs only, no PII).

## Collected Metrics

### Event Types

#### 1. Screen View Events
**What:** User navigates to a screen  
**When:** URL changes (via React Router)  
**Data:**
```json
{
  "eventType": "screen_view",
  "screen": "standings|matches|bracket|details",
  "duration": 1500,
  "timestamp": 1716057600000,
  "userId": "player_abc123"
}
```
**Usage:** Understand user navigation patterns, which screens are most visited

#### 2. Time-to-Data Events
**What:** API request completes and page is rendered  
**When:** Tournament data loaded from API  
**Data:**
```json
{
  "eventType": "time_to_data",
  "screen": "standings",
  "duration": 450,
  "data": {
    "apiDuration": 250,
    "renderDuration": 200
  },
  "timestamp": 1716057600000,
  "userId": "player_abc123"
}
```
**Usage:** Identify slow screens, API bottlenecks, rendering issues

#### 3. SSE Update Events
**What:** Real-time update received from server  
**When:** Standings or bracket updates pushed via EventSource  
**Data:**
```json
{
  "eventType": "sse_update",
  "screen": "standings",
  "duration": 145,
  "timestamp": 1716057600000,
  "userId": "player_abc123"
}
```
**Usage:** Monitor real-time update latency, connection stability

#### 4. Performance Events
**What:** Core Web Vitals metrics  
**When:** Page load completes  
**Data:**
```json
{
  "eventType": "performance",
  "data": {
    "fcp": 1240,
    "tti": 2480,
    "lcp": 1890,
    "cls": 0.05
  },
  "timestamp": 1716057600000,
  "userId": "player_abc123"
}
```
**Usage:** Track First Contentful Paint, Time to Interactive, Largest Contentful Paint

#### 5. Custom Events
**What:** Application-specific events  
**Examples:** "score_submitted", "bracket_published", "offline_sync_completed"  
**Data:**
```json
{
  "eventType": "score_submitted",
  "data": {
    "matchId": "match_123",
    "attempts": 2,
    "duration": 4500
  },
  "timestamp": 1716057600000,
  "userId": "player_abc123"
}
```
**Usage:** Track feature usage, error recovery, user actions

## How Analytics Are Collected

### Collection Points

**Frontend Hooks:**
```typescript
// useAnalytics - Central event buffer and submission
const { track } = useAnalytics()

// usePageNavigation - Triggers screen_view on URL change
// Automatically called, no integration needed

// useImageLazyLoad - Tracks image load times
// Automatically tracked in images component
```

**Service Worker:**
- Logs offline/online state transitions
- Queues failed requests for background sync
- Tracks sync retry attempts

**Manual Tracking:**
```typescript
// In your component
const { track } = useAnalytics()

track({
  eventType: 'score_submitted',
  data: { matchId: 'match_123', attempts: 2 },
  duration: 4500
})
```

### Batching Strategy

Events are collected in a buffer and submitted in batches:

```
Event collected
  ↓
Added to buffer (useAnalytics)
  ↓
Is buffer full (10 events)? → YES: Submit batch
            ↓ NO
Timeout? (30 seconds) → YES: Submit batch
            ↓ NO
User leaves page → Submit remaining events via sendBeacon()
```

**Benefits:**
- Reduces network requests (batch 10 events in 1 POST)
- Handles network failures gracefully (offline queue)
- Low overhead (non-blocking, async)

### Submission Endpoint

**POST /api/analytics/events**

**Request:**
```json
{
  "events": [
    { "eventType": "screen_view", "screen": "standings", ... },
    { "eventType": "time_to_data", "screen": "standings", ... },
    ...
  ]
}
```

**Response:**
```
204 No Content
```

**Retry Logic:**
- Offline: Service Worker queues request
- Network error: Retry up to 3× with backoff (1s, 2s, 4s)
- Failures: Silent (never blocks user experience)

## Privacy & Data Protection

### What We Don't Collect

❌ **No PII (Personally Identifiable Information)**
- No names, emails, phone numbers
- No IP addresses
- No device IDs (IMEI, IDFA)
- No cookies or tracking pixels

❌ **No Sensitive Data**
- No match scores (just event type)
- No user preferences
- No search queries
- No full request/response bodies

### What We Collect

✅ **Anonymized Data**
- User ID (UUID, not identifiable)
- Event types (screen views, load times)
- Screen names (which feature viewed)
- Duration metrics (milliseconds)
- Device type (mobile, tablet, desktop)

### Data Retention

```
Events collected today
  ↓
Stored in user_events table (90 days)
  ↓
After 90 days: Archived or deleted
```

**Deletion on User Account Removal:**
```sql
DELETE FROM user_events WHERE user_id = ?;
```
Cascade deletion via foreign key: `ON DELETE CASCADE`

### GDPR Compliance

✅ **Lawful Basis:** Legitimate interest (improve service quality)  
✅ **Data Minimization:** Collect only necessary metrics  
✅ **Right to Access:** Users can export their event data  
✅ **Right to Deletion:** DELETE /users/:id removes all events  

**Privacy Policy Statement:**
```
We collect anonymized analytics to understand how you use our service.
We never collect your personal information or identify you individually.
All data is retained for 90 days and automatically deleted.
You can request deletion of your data at any time.
```

## Querying Analytics

### Using SQL Directly

See [ANALYTICS_QUERIES.md](./ANALYTICS_QUERIES.md) for:
- User navigation paths
- Average time on screen
- Slowest screens (P95)
- Performance breakdown (API vs. render)
- Feature usage statistics
- Real-time update latency
- User engagement (sessions, return rates)

### Example: Find Slowest Screens
```sql
SELECT 
  screen,
  COUNT(*) as views,
  ROUND(AVG(duration), 0) as avg_ms,
  ROUND(MAX(duration), 0) as max_ms
FROM user_events
WHERE event_type = 'time_to_data'
  AND screen IS NOT NULL
GROUP BY screen
ORDER BY avg_ms DESC;
```

### Example: User Navigation Path
```sql
SELECT 
  user_id,
  screen,
  duration,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as sequence
FROM user_events
WHERE event_type = 'screen_view'
  AND user_id = ?
ORDER BY created_at;
```

## Monitoring & Alerting

### Key Metrics to Monitor

**Performance (Daily)**
- Average FCP (First Contentful Paint)
- Average TTI (Time to Interactive)
- P95 screen load time
- P95 SSE latency

**Engagement (Weekly)**
- Active users
- Returning user rate
- Feature usage (bracket vs. matches)
- Average session duration

**Errors (Real-time)**
- Failed API requests
- Offline sync failures
- Analytics submission failures

### Alert Thresholds

```
FCP > 2.5s ⚠️ Warning, > 3.5s 🚨 Critical
TTI > 3.5s ⚠️ Warning, > 4.5s 🚨 Critical
SSE latency > 300ms ⚠️ Warning
Offline sync failure rate > 5% 🚨 Critical
```

### Dashboard Setup (Recommended)

Create dashboards in your preferred tool:

**Grafana Query:**
```sql
SELECT 
  DATE(created_at) as date,
  ROUND(AVG(json_extract(data, '$.fcp')), 0) as fcp_ms
FROM user_events
WHERE event_type = 'performance'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
```

## Implementing Analytics in New Features

### 1. Add Screen View
```typescript
// screens are auto-tracked via usePageNavigation
// Just ensure your route is in the routing structure
```

### 2. Add Custom Event
```typescript
import { useAnalytics } from './hooks/useAnalytics'

export const ScoreSubmitForm = () => {
  const { track } = useAnalytics()
  
  const handleSubmit = async (score: string) => {
    const startTime = performance.now()
    
    try {
      await submitScore(score)
      
      const duration = performance.now() - startTime
      track({
        eventType: 'score_submitted',
        data: { success: true, attempts: 1 },
        duration
      })
    } catch (error) {
      track({
        eventType: 'score_submission_failed',
        data: { error: error.message },
        duration: performance.now() - startTime
      })
    }
  }
  
  return (...)
}
```

### 3. Add Performance Metric
```typescript
import { usePageLoad } from './hooks/usePageLoad'

export const TournamentDetail = () => {
  const { track } = useAnalytics()
  
  usePageLoad(({ fcp, tti, lcp }) => {
    track({
      eventType: 'performance',
      data: { fcp, tti, lcp }
    })
  })
  
  return (...)
}
```

## Testing Analytics

### Test Event Collection
```typescript
it('collects screen_view event on navigation', () => {
  const { result } = renderHook(() => useAnalytics())
  
  act(() => {
    result.current.track({
      eventType: 'screen_view',
      screen: 'standings'
    })
  })
  
  expect(result.current.eventBuffer).toHaveLength(1)
})
```

### Test Event Submission
```typescript
it('submits batch when buffer is full', async () => {
  const spy = jest.spyOn(api, 'submitAnalytics')
  const { result } = renderHook(() => useAnalytics({ batchSize: 2 }))
  
  result.current.track(event1)
  result.current.track(event2) // Triggers submission
  
  await waitFor(() => {
    expect(spy).toHaveBeenCalled()
  })
})
```

### Test Offline Handling
```typescript
it('queues events when offline', async () => {
  navigator.onLine = false
  
  const { result } = renderHook(() => useAnalytics())
  result.current.track(event)
  
  // Event should be queued, not submitted
  expect(api.submitAnalytics).not.toHaveBeenCalled()
})
```

## Best Practices

### Do ✅
- Track user actions (page views, clicks, submissions)
- Track performance metrics (load times, render times)
- Use consistent event names (snake_case: score_submitted)
- Test analytics code coverage
- Monitor key metrics regularly

### Don't ❌
- Collect PII (names, emails, IPs)
- Track sensitive data (passwords, payment info)
- Use invasive tracking (pixels, cookies)
- Store unlimited data (set retention policy)
- Ignore privacy regulations (GDPR, CCPA)

## Troubleshooting

### Events Not Appearing in Database
```bash
# 1. Check if Service Worker is intercepting
# 2. Check browser Network tab for POST /api/analytics/events
# 3. Check if user is authenticated (requires bearer token)
# 4. Check logs for submission errors
# 5. Verify offline mode is not active
```

### Analytics Not Loading in Query
```bash
# 1. Check database file exists: ls db/tournament.db
# 2. Check table exists: sqlite3 db/tournament.db ".tables"
# 3. Check data exists: SELECT COUNT(*) FROM user_events
# 4. Check created_at timestamps are recent
```

### High Latency on Specific Screens
```sql
-- Find slowest screens
SELECT screen, ROUND(AVG(duration), 0) as avg_ms
FROM user_events
WHERE event_type = 'time_to_data'
GROUP BY screen
ORDER BY avg_ms DESC
LIMIT 5;

-- Investigate API vs. render breakdown
SELECT 
  screen,
  ROUND(AVG(json_extract(data, '$.apiDuration')), 0) as api_ms,
  ROUND(AVG(json_extract(data, '$.renderDuration')), 0) as render_ms
FROM user_events
WHERE event_type = 'time_to_data'
GROUP BY screen;
```

## Future Enhancements

- [ ] Real-time dashboard (live performance metrics)
- [ ] Anomaly detection (alerts on unusual patterns)
- [ ] User cohort analysis (segment users by behavior)
- [ ] A/B testing framework (experiment tracking)
- [ ] Data export (CSV, JSON for external analysis)
- [ ] Retention curves (user lifecycle analysis)

---

**Status:** ✅ Analytics Ready for Production | **Privacy:** GDPR Compliant | **Last Updated:** May 2026
