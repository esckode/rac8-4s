# Analytics Queries & Documentation

This document provides SQL queries to analyze user behavior and performance metrics collected via the analytics event system.

## Schema Reference

The `user_events` table captures real-time user interactions:

```sql
CREATE TABLE user_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type VARCHAR(50),      -- 'screen_view', 'time_to_data', 'sse_update', 'performance', etc.
  screen VARCHAR(100),          -- 'standings', 'matches', 'bracket', etc.
  duration INTEGER,             -- time in milliseconds
  data TEXT,                    -- JSON for complex metrics
  created_at TIMESTAMP
)
```

**Indexes:** `(user_id, created_at)`, `(event_type)`, `(screen)`

---

## Quick Queries

### 1. User's Navigation Path (Screen Sequence)

**Question:** "Which screens did user X visit, in what order?"

```sql
SELECT 
  user_id,
  screen,
  duration,
  created_at,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as visit_sequence
FROM user_events
WHERE event_type = 'screen_view'
  AND user_id = ?
ORDER BY created_at
LIMIT 20;
```

**Example Output:**
```
user_id         | screen      | duration | created_at           | visit_sequence
user_abc123     | standings   | 2500     | 2026-05-15 14:30:00  | 1
user_abc123     | matches     | 1800     | 2026-05-15 14:32:30  | 2
user_abc123     | bracket     | 3200     | 2026-05-15 14:35:00  | 3
user_abc123     | standings   | 1900     | 2026-05-15 14:38:00  | 4
```

---

### 2. Average Time on Each Screen

**Question:** "How long do users spend on each screen on average?"

```sql
SELECT 
  screen,
  COUNT(*) as view_count,
  ROUND(AVG(duration), 0) as avg_duration_ms,
  ROUND(MIN(duration), 0) as min_duration_ms,
  ROUND(MAX(duration), 0) as max_duration_ms
FROM user_events
WHERE event_type = 'screen_view'
  AND screen IS NOT NULL
GROUP BY screen
ORDER BY avg_duration_ms DESC;
```

**Example Output:**
```
screen      | view_count | avg_duration_ms | min_duration_ms | max_duration_ms
bracket     | 347        | 4200            | 800             | 12500
standings   | 1203       | 2800            | 400             | 10200
matches     | 856        | 2100            | 300             | 8900
```

---

### 3. P95 Wait Time for Data (API Performance)

**Question:** "What's the 95th percentile wait time for API responses on each screen?"

```sql
SELECT 
  screen,
  COUNT(*) as requests,
  ROUND(AVG(CAST(data ->> 'apiDuration' AS INTEGER)), 0) as avg_api_ms,
  ROUND(
    CAST(
      (SELECT value FROM (
        SELECT CAST(data ->> 'apiDuration' AS INTEGER) as value
        FROM user_events
        WHERE event_type = 'time_to_data' AND screen = ? AND data IS NOT NULL
        ORDER BY value DESC
        LIMIT 1 OFFSET CAST(0.05 * COUNT(*) AS INTEGER)
      )) AS FLOAT
    ), 0
  ) as p95_api_ms
FROM user_events
WHERE event_type = 'time_to_data'
  AND screen IS NOT NULL
  AND data IS NOT NULL
GROUP BY screen
ORDER BY p95_api_ms DESC;
```

**Simpler Alternative (SQLite):**

```sql
SELECT 
  screen,
  COUNT(*) as requests,
  ROUND(AVG(
    CAST(json_extract(data, '$.apiDuration') AS INTEGER)
  ), 0) as avg_api_ms
FROM user_events
WHERE event_type = 'time_to_data'
  AND screen IS NOT NULL
  AND data IS NOT NULL
GROUP BY screen
ORDER BY avg_api_ms DESC;
```

**Example Output:**
```
screen      | requests | avg_api_ms
standings   | 1203     | 280
matches     | 856      | 320
bracket     | 347      | 410
```

---

### 4. Slowest Screens (P95 Total Wait)

**Question:** "Which screens have the worst performance for users?"

```sql
SELECT 
  screen,
  COUNT(*) as view_count,
  ROUND(AVG(duration), 0) as avg_total_duration_ms,
  ROUND(
    CAST(
      (SELECT duration FROM user_events ue2
       WHERE event_type = 'screen_view'
         AND ue2.screen = ue1.screen
       ORDER BY duration DESC
       LIMIT 1 OFFSET CAST(0.05 * COUNT(*) AS INTEGER)
      ) AS FLOAT
    ), 0
  ) as p95_duration_ms
FROM user_events ue1
WHERE event_type = 'screen_view'
  AND screen IS NOT NULL
GROUP BY screen
ORDER BY p95_duration_ms DESC;
```

**Simpler Implementation (SQLite-compatible):**

```sql
WITH ranked_events AS (
  SELECT 
    screen,
    duration,
    ROW_NUMBER() OVER (PARTITION BY screen ORDER BY duration DESC) as rank,
    COUNT(*) OVER (PARTITION BY screen) as total_count
  FROM user_events
  WHERE event_type = 'screen_view'
    AND screen IS NOT NULL
)
SELECT 
  screen,
  total_count as view_count,
  ROUND(
    (SELECT AVG(duration) FROM user_events 
     WHERE screen = ranked_events.screen AND event_type = 'screen_view'),
    0
  ) as avg_duration_ms,
  duration as p95_duration_ms
FROM ranked_events
WHERE rank = CAST(total_count * 0.05 AS INTEGER) + 1
ORDER BY p95_duration_ms DESC;
```

**Example Output:**
```
screen      | view_count | avg_duration_ms | p95_duration_ms
bracket     | 347        | 4200            | 10500
standings   | 1203       | 2800            | 8300
matches     | 856        | 2100            | 7100
```

---

### 5. Render Time vs. API Time Breakdown

**Question:** "How much time is users spending waiting for API vs. rendering?"

```sql
SELECT 
  screen,
  COUNT(*) as events,
  ROUND(AVG(
    CAST(json_extract(data, '$.apiDuration') AS INTEGER)
  ), 0) as avg_api_ms,
  ROUND(AVG(
    CAST(json_extract(data, '$.renderDuration') AS INTEGER)
  ), 0) as avg_render_ms,
  ROUND(
    AVG(
      CAST(json_extract(data, '$.apiDuration') AS INTEGER) +
      CAST(json_extract(data, '$.renderDuration') AS INTEGER)
    ), 0
  ) as avg_total_ms
FROM user_events
WHERE event_type = 'time_to_data'
  AND screen IS NOT NULL
  AND data IS NOT NULL
  AND json_extract(data, '$.apiDuration') IS NOT NULL
  AND json_extract(data, '$.renderDuration') IS NOT NULL
GROUP BY screen
ORDER BY avg_total_ms DESC;
```

**Example Output:**
```
screen      | events | avg_api_ms | avg_render_ms | avg_total_ms
bracket     | 280    | 385        | 210           | 595
standings   | 950    | 245        | 180           | 425
matches     | 720    | 290        | 155           | 445
```

---

### 6. Feature Usage: Bracket vs. Matches Coverage

**Question:** "What % of users are viewing brackets vs. other features?"

```sql
WITH user_features AS (
  SELECT 
    user_id,
    MAX(CASE WHEN screen = 'bracket' THEN 1 ELSE 0 END) as viewed_bracket,
    MAX(CASE WHEN screen = 'matches' THEN 1 ELSE 0 END) as viewed_matches,
    MAX(CASE WHEN screen = 'standings' THEN 1 ELSE 0 END) as viewed_standings
  FROM user_events
  WHERE event_type = 'screen_view'
  GROUP BY user_id
)
SELECT 
  COUNT(*) as total_users,
  ROUND(100.0 * SUM(viewed_bracket) / COUNT(*), 1) as pct_bracket,
  ROUND(100.0 * SUM(viewed_matches) / COUNT(*), 1) as pct_matches,
  ROUND(100.0 * SUM(viewed_standings) / COUNT(*), 1) as pct_standings,
  ROUND(
    100.0 * SUM(CASE WHEN viewed_bracket = 1 AND viewed_matches = 1 THEN 1 ELSE 0 END) / COUNT(*),
    1
  ) as pct_bracket_and_matches
FROM user_features;
```

**Example Output:**
```
total_users | pct_bracket | pct_matches | pct_standings | pct_bracket_and_matches
2406        | 78.5        | 92.3        | 87.1          | 71.2
```

---

### 7. SSE Real-Time Update Latency

**Question:** "How fast do server-sent event updates arrive?"

```sql
SELECT 
  COUNT(*) as update_count,
  ROUND(AVG(duration), 0) as avg_latency_ms,
  ROUND(
    CAST(
      (SELECT duration FROM user_events ue2
       WHERE event_type = 'sse_update'
       ORDER BY duration DESC
       LIMIT 1 OFFSET CAST(0.05 * COUNT(*) AS INTEGER))
      AS FLOAT
    ), 0
  ) as p95_latency_ms,
  ROUND(MAX(duration), 0) as max_latency_ms,
  ROUND(MIN(duration), 0) as min_latency_ms
FROM user_events
WHERE event_type = 'sse_update';
```

**Example Output:**
```
update_count | avg_latency_ms | p95_latency_ms | max_latency_ms | min_latency_ms
3842         | 145            | 320            | 1250           | 15
```

---

### 8. Performance Metrics (FCP, TTI, LCP)

**Question:** "What are the core web vitals for page loads?"

```sql
SELECT 
  COUNT(*) as page_loads,
  ROUND(AVG(
    CAST(json_extract(data, '$.fcp') AS INTEGER)
  ), 0) as avg_fcp_ms,
  ROUND(AVG(
    CAST(json_extract(data, '$.tti') AS INTEGER)
  ), 0) as avg_tti_ms,
  ROUND(AVG(
    CAST(json_extract(data, '$.lcp') AS INTEGER)
  ), 0) as avg_lcp_ms
FROM user_events
WHERE event_type = 'performance'
  AND data IS NOT NULL
  AND json_extract(data, '$.fcp') IS NOT NULL;
```

**Example Output:**
```
page_loads | avg_fcp_ms | avg_tti_ms | avg_lcp_ms
1203       | 1240       | 2480       | 1890
```

---

### 9. User Engagement: Sessions & Return Rates

**Question:** "How many sessions did users complete? Do they return?"

```sql
WITH user_sessions AS (
  SELECT 
    user_id,
    DATE(created_at) as session_date,
    COUNT(*) as event_count,
    MIN(created_at) as session_start,
    MAX(created_at) as session_end
  FROM user_events
  GROUP BY user_id, DATE(created_at)
)
SELECT 
  COUNT(DISTINCT user_id) as unique_users,
  ROUND(AVG(sessions_per_user), 1) as avg_sessions_per_user,
  ROUND(AVG(event_count), 0) as avg_events_per_session,
  COUNT(CASE WHEN sessions_per_user >= 2 THEN 1 END) as returning_users,
  ROUND(
    100.0 * COUNT(CASE WHEN sessions_per_user >= 2 THEN 1 END) / COUNT(DISTINCT user_id),
    1
  ) as pct_returning_users
FROM (
  SELECT 
    user_id,
    COUNT(DISTINCT session_date) as sessions_per_user,
    AVG(event_count) as event_count
  FROM user_sessions
  GROUP BY user_id
) subq;
```

**Example Output:**
```
unique_users | avg_sessions_per_user | avg_events_per_session | returning_users | pct_returning_users
2406         | 1.8                   | 24                     | 1685            | 70.0
```

---

### 10. Error Rate & Network Failures (Submitted vs. Queued)

**Question:** "How many score submissions failed and had to be retried?"

```sql
-- Note: This assumes you're logging 'score_submitted' vs 'score_queued' event types
SELECT 
  event_type,
  COUNT(*) as event_count,
  ROUND(
    100.0 * COUNT(*) / 
    (SELECT COUNT(*) FROM user_events WHERE event_type IN ('score_submitted', 'score_queued')),
    1
  ) as percentage
FROM user_events
WHERE event_type IN ('score_submitted', 'score_queued')
GROUP BY event_type;
```

**Expected Output (if implemented):**
```
event_type       | event_count | percentage
score_submitted  | 892         | 94.7
score_queued     | 50          | 5.3
```

---

## Running These Queries

### Option 1: SQLite CLI (Local)

```bash
cd /path/to/project
sqlite3 db/tournament.db ".mode column" ".headers on"

-- Then paste any query above
```

### Option 2: Node.js REPL

```javascript
const Database = require('better-sqlite3')
const db = new Database('db/tournament.db')

// Paste query as string
const result = db.prepare(`
  SELECT screen, COUNT(*) as views 
  FROM user_events 
  GROUP BY screen
`).all()

console.log(result)
```

### Option 3: Application Integration

Create a `/api/analytics/query` admin endpoint (requires organizer role):

```typescript
app.get('/api/analytics/query', requireOrganizerAuth, (req, res) => {
  const { queryName } = req.query
  const db = deps.db
  
  const queries = {
    'avg-screen-time': `SELECT screen, ROUND(AVG(duration), 0) as avg_ms FROM user_events WHERE event_type = 'screen_view' GROUP BY screen`,
    // ... more named queries
  }
  
  const result = db.prepare(queries[queryName]).all()
  res.json(result)
})
```

---

## Performance Notes

All queries leverage the existing indexes on `user_events`:
- `(user_id, created_at)` — fast filtering by user + time
- `(event_type)` — fast filtering by event type
- `(screen)` — fast grouping/filtering by screen

For queries on `duration` columns, add an index if running frequently:
```sql
CREATE INDEX idx_user_events_screen_duration 
ON user_events(screen, duration) 
WHERE event_type = 'screen_view';
```

For JSON data queries, add a functional index (SQLite 3.37+):
```sql
CREATE INDEX idx_user_events_api_duration 
ON user_events(json_extract(data, '$.apiDuration')) 
WHERE event_type = 'time_to_data';
```

---

## Privacy & Data Retention

- **No PII stored:** Only `user_id` (UUID), not email or names
- **Retention:** Keep events for 90 days; archive older data to separate table
- **Deletion:** When user deletes account, cascade delete removes all events via FK: `ON DELETE CASCADE`

Archive query (move old events):
```sql
INSERT INTO user_events_archive 
SELECT * FROM user_events 
WHERE created_at < datetime('now', '-90 days');

DELETE FROM user_events 
WHERE created_at < datetime('now', '-90 days');
```

---

## Troubleshooting

**Q: JSON functions like `json_extract` not working?**
A: Ensure SQLite compiled with JSON1 extension. Check: `SELECT json('{"a":1}')` should return `{"a":1}`.

**Q: Queries return empty results?**
A: Verify events are being recorded. Run: `SELECT COUNT(*) FROM user_events`.

**Q: Want to test locally without real data?**
A: Use the analytics test suite in `packages/api/src/__tests__/analytics.spec.ts` as a reference for sample event shapes.
