# Analytics Strategy

## Overview

Analytics for this app should answer four key questions:

1. **Usage:** Who is using the app and how?
2. **Performance:** Is the app fast and reliable?
3. **Business:** Is the product achieving its goals?
4. **Errors:** What's breaking and how often?

This document outlines a pragmatic analytics approach that's useful without being overwhelming.

---

## Analytics Framework

### Four Layers of Analytics

```
┌─────────────────────────────────────────┐
│  Business Metrics (Product Goals)       │  "Are we winning?"
│  • Tournaments created                  │
│  • Players registered                   │
│  • Tournament completion rate           │
├─────────────────────────────────────────┤
│  User Behavior (Feature Usage)          │  "How are users engaging?"
│  • Match confirmations                  │
│  • Score submissions                    │
│  • Phase transitions                    │
├─────────────────────────────────────────┤
│  Performance (Technical Health)         │  "Is it working well?"
│  • Page load time                       │
│  • API latency                          │
│  • Error rate                           │
├─────────────────────────────────────────┤
│  Debugging (What's Broken)              │  "What do I fix?"
│  • Error logs                           │
│  • Stack traces                         │
│  • User session replay                  │
└─────────────────────────────────────────┘
```

---

## Tier 1: Business Metrics (Most Important)

These answer: "Is the product working?"

### Key Metrics Dashboard

| Metric | Calculation | Target | Frequency |
|--------|-----------|--------|-----------|
| **Weekly Active Organizers (WAO)** | Unique organizers who created/updated a tournament | ≥5 (beta) | Daily |
| **Tournaments Created** | New tournaments per week | ≥1 per organizer | Daily |
| **Players Registered** | New player registrations per week | ≥20 per tournament | Daily |
| **Tournament Completion Rate** | % of started tournaments that reach "complete" | ≥80% | Daily |
| **Average Players per Tournament** | Total players / total tournaments | ≥15 | Weekly |
| **Average Match Completion Rate** | % of scheduled matches with reported scores | ≥85% | Daily |
| **Player Satisfaction** | Post-tournament survey (5-star rating) | ≥4.0 stars | After each tournament |
| **Organizer Retention** | % of organizers who run 2+ tournaments | ≥50% | Monthly |

### Business Metrics Implementation

**Where to capture:**

```typescript
// src/analytics/business-events.ts

export async function trackTournamentCreated(tournamentId: string, organizerId: string) {
  await analytics.track('tournament_created', {
    tournamentId,
    organizerId,
    timestamp: new Date(),
    properties: {
      sport: tournament.sport,
      format: tournament.format, // singles or doubles
      maxPlayers: tournament.maxPlayers,
    }
  })
}

export async function trackPlayerRegistered(tournamentId: string, playerId: string) {
  await analytics.track('player_registered', {
    tournamentId,
    playerId,
    timestamp: new Date(),
    properties: {
      tournament: tournamentId,
      registrationCount: await getRegistrationCount(tournamentId),
    }
  })
}

export async function trackTournamentCompleted(tournamentId: string) {
  const tournament = await getTournament(tournamentId)
  const completedMatches = await getCompletedMatches(tournamentId)
  const totalMatches = await getTotalMatches(tournamentId)
  
  await analytics.track('tournament_completed', {
    tournamentId,
    timestamp: new Date(),
    properties: {
      organizerId: tournament.createdBy,
      playerCount: tournament.playerCount,
      durationDays: daysBetween(tournament.createdAt, new Date()),
      matchCompletionRate: completedMatches / totalMatches,
      sport: tournament.sport,
      format: tournament.format,
    }
  })
}

export async function trackMatchCompleted(matchId: string, tournamentId: string) {
  await analytics.track('match_completed', {
    matchId,
    tournamentId,
    timestamp: new Date(),
  })
}
```

**Dashboard Example (Weekly View):**

```
┌─ BUSINESS METRICS (Week of May 1-7, 2026) ──────────────────┐
│                                                              │
│  WAO (Weekly Active Organizers):  12                         │
│  └─ Up 50% from last week (8)                               │
│                                                              │
│  Tournaments Created:  8                                     │
│  └─ Breakdown: 5 singles, 3 doubles                         │
│                                                              │
│  Players Registered:  127                                    │
│  └─ Avg 15.9 players per tournament                         │
│                                                              │
│  Tournaments Completed:  3                                   │
│  └─ Completion rate: 100% (all started tournaments finished) │
│                                                              │
│  Match Completion Rate:  92%                                 │
│  └─ 89/97 matches reported (8 unreported)                   │
│                                                              │
│  Player Satisfaction:  4.2 / 5.0 ⭐                          │
│  └─ 15 surveys completed (45% response rate)                │
│                                                              │
│  Organizer Retention:  67%                                   │
│  └─ 8 of 12 organizers have run 2+ tournaments              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Tier 2: User Behavior Analytics

These answer: "How are users engaging with features?"

### Key User Actions to Track

| Action | Purpose | Implementation |
|--------|---------|----------------|
| **Group Distribution** | Did organizer use auto-distribute or manual? | Track in event |
| **Match Confirmation** | % of matches confirmed before deadline | Count confirmed vs unconfirmed |
| **Score Submission Latency** | How fast after match do players report? | timestamp(match scheduled) vs timestamp(score submitted) |
| **Walkover Claims** | How many matches end in walkover vs reported score? | Track event type |
| **Phase Advances** | Auto (all scores in) vs manual advance? | Track trigger type |
| **Bracket Seeding Adjustments** | Did organizer adjust auto-seeding? | Track adjustments before publish |
| **Co-Organizer Usage** | % of tournaments with co-organizers | Track tournament.coOrganizerCount |
| **Player Withdrawals** | How many players withdraw mid-tournament? | Track at point of withdrawal |
| **Score Disputes** | Did organizer override any scores? | Track score override event |

### User Behavior Implementation

```typescript
// src/analytics/user-behavior.ts

export async function trackGroupDistribution(tournamentId: string, groupCount: number) {
  await analytics.track('groups_created', {
    tournamentId,
    timestamp: new Date(),
    properties: {
      groupCount,
      playerCount: await getPlayerCount(tournamentId),
      avgPlayersPerGroup: (await getPlayerCount(tournamentId)) / groupCount,
    }
  })
}

export async function trackMatchConfirmed(matchId: string, tournamentId: string) {
  const match = await getMatch(matchId)
  const timeToConfirm = new Date().getTime() - match.scheduledAt.getTime()
  
  await analytics.track('match_confirmed', {
    matchId,
    tournamentId,
    timestamp: new Date(),
    properties: {
      timeToConfirmMs: timeToConfirm,
      daysUntilMatch: daysBetween(match.scheduledAt, new Date()),
    }
  })
}

export async function trackScoreSubmitted(matchId: string, tournamentId: string) {
  const match = await getMatch(matchId)
  const timeToSubmit = new Date().getTime() - match.confirmedAt.getTime()
  const daysAfterMatch = daysBetween(match.confirmedAt, new Date())
  
  await analytics.track('score_submitted', {
    matchId,
    tournamentId,
    timestamp: new Date(),
    properties: {
      timeToSubmitMs: timeToSubmit,
      daysAfterMatch,
      submittedBy: match.submittedBy,
    }
  })
}

export async function trackWalkoveClaimed(matchId: string, tournamentId: string) {
  await analytics.track('walkover_claimed', {
    matchId,
    tournamentId,
    timestamp: new Date(),
  })
}

export async function trackPhaseAdvanced(tournamentId: string, fromPhase: string, toPhase: string) {
  const isAutomatic = await checkIfAutomatic(tournamentId) // all scores in?
  
  await analytics.track('phase_advanced', {
    tournamentId,
    timestamp: new Date(),
    properties: {
      from: fromPhase,
      to: toPhase,
      trigger: isAutomatic ? 'automatic' : 'manual',
    }
  })
}

export async function trackPlayerWithdrawal(playerId: string, tournamentId: string, phase: string) {
  await analytics.track('player_withdrawn', {
    playerId,
    tournamentId,
    timestamp: new Date(),
    properties: {
      phase,
      remainingMatches: await getRemainingMatches(playerId, tournamentId),
    }
  })
}

export async function trackScoreOverride(matchId: string, tournamentId: string, reason: string) {
  await analytics.track('score_overridden', {
    matchId,
    tournamentId,
    timestamp: new Date(),
    properties: {
      reason,
      overriddenBy: 'organizer',
    }
  })
}
```

**Segment Analysis Example:**

```
┌─ USER BEHAVIOR INSIGHTS ─────────────────────────────────────┐
│                                                              │
│  Match Confirmation Rate by Phase:                           │
│  ├─ Group Stage:    89% (players eager to schedule)         │
│  ├─ Knockout:       94% (higher stakes)                     │
│  └─ Insight: Early phase matches harder to schedule         │
│                                                              │
│  Score Submission Timing:                                    │
│  ├─ Median:  2 hours after match ends                       │
│  ├─ P95:     24 hours after match ends                      │
│  └─ Insight: Players reliably report within 24h             │
│                                                              │
│  Walkover Rate:                                              │
│  ├─ Overall:  3% of matches                                 │
│  ├─ Group stage:  2%                                        │
│  ├─ Knockout:  5% (no-show more likely under pressure)      │
│  └─ Insight: Late tournament no-shows are real issue        │
│                                                              │
│  Score Override Rate:                                        │
│  ├─ Overall:  1.2% of matches                               │
│  ├─ Top reasons:                                            │
│  │  ├─ Data entry error: 60%                               │
│  │  ├─ Disputed result: 30%                                │
│  │  └─ System error: 10%                                   │
│  └─ Insight: Most overrides are typos, not disputes        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Tier 3: Performance Metrics (Technical Health)

These answer: "Is the app fast and reliable?"

### Key Performance Indicators

| Metric | Target | Tool | Frequency |
|--------|--------|------|-----------|
| **Page Load Time (P95)** | <2 seconds | CloudWatch / Lighthouse | Real-time |
| **API Latency (P95)** | <200ms reads, <500ms writes | CloudWatch Metrics | Real-time |
| **Error Rate** | <0.5% (5xx errors) | CloudWatch Logs | Real-time |
| **Uptime** | ≥99% during tournaments | CloudWatch Alarms | Continuous |
| **WebSocket Latency** | <500ms message delivery | Custom instrumentation | Real-time |
| **Database Query Time (P95)** | <100ms for standings | RDS Performance Insights | Real-time |
| **Email Delivery Rate** | ≥99% of transactional emails | Resend Dashboard | Daily |

### Performance Implementation

```typescript
// src/middleware/performance.ts

export function performanceMiddleware(req: Request, res: Response, next: Function) {
  const startTime = performance.now()
  
  // Capture response time
  res.on('finish', () => {
    const duration = performance.now() - startTime
    
    // Log to CloudWatch
    console.log(JSON.stringify({
      type: 'http_request',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }))
    
    // Track in analytics
    if (duration > 500) {
      analytics.track('slow_request', {
        path: req.path,
        durationMs: duration,
        statusCode: res.statusCode,
      })
    }
  })
  
  next()
}

// src/business/standings.ts (measure calculation time)
export async function calculateStandings(groupId: string): Promise<Standing[]> {
  const startTime = performance.now()
  
  try {
    // ... calculation logic
    const standings = performStandingsCalculation(groupId)
    
    const duration = performance.now() - startTime
    
    // Log if slow
    if (duration > 1000) {
      console.warn(`Slow standings calculation: ${groupId} took ${duration}ms`)
    }
    
    return standings
  } catch (error) {
    console.error(`Standings calculation failed: ${error}`)
    throw error
  }
}

// src/websocket/broadcast.ts (measure message latency)
export async function broadcastStandingsUpdate(tournamentId: string, groupId: string) {
  const startTime = performance.now()
  const broadcastId = generateId()
  
  await ws.broadcast(`tournaments:${tournamentId}:group:${groupId}`, {
    type: 'standings_updated',
    broadcastId,
    timestamp: new Date().toISOString(),
    data: standings,
  })
  
  // Client measures time from broadcast timestamp to when they receive (broadcastId)
  // Report back: client_received_at - timestamp = latency
}
```

### Performance Dashboard

```
┌─ PERFORMANCE METRICS (Real-Time) ────────────────────────────┐
│                                                              │
│  Page Load Time (P95):                     1.8 seconds ✅    │
│  ├─ Home:     1.2s                                          │
│  ├─ Dashboard: 1.8s                                         │
│  └─ Standings: 1.5s                                         │
│                                                              │
│  API Latency (P95):                        180ms reads ✅    │
│  ├─ GET standings:    95ms                                  │
│  ├─ GET tournaments:  140ms                                 │
│  ├─ POST score:       420ms (includes async queue)          │
│  └─ POST bracket:     800ms (async processing)              │
│                                                              │
│  Error Rate:                               0.2% ✅          │
│  ├─ 5xx errors:      3 errors in last hour                  │
│  ├─ 4xx errors:      120 validation errors (normal)         │
│  └─ Top error:       404 - Not found (0.1%)                │
│                                                              │
│  Uptime (Last 30 Days):                    99.95% ✅        │
│  └─ Downtime:        21 minutes (1 incident)               │
│                                                              │
│  WebSocket Latency (P95):                  280ms ✅         │
│  └─ Message roundtrip organizer → player                   │
│                                                              │
│  Database Performance:                                       │
│  ├─ Standings query:  95ms (P95) ✅                         │
│  ├─ Tournament query: 52ms (P95) ✅                         │
│  └─ Bracket query:    180ms (P95) ✅                        │
│                                                              │
│  Email Delivery:                           99.8% ✅         │
│  ├─ Sent:   1,247 emails (last 24h)                        │
│  ├─ Delivered: 1,244 (99.8%)                               │
│  └─ Bounced: 3 (hard bounces)                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Tier 4: Error & Debugging Analytics

These answer: "What's broken and how do I fix it?"

### Error Tracking

```typescript
// src/middleware/error-handler.ts

export function errorHandler(error: Error, req: Request, res: Response, next: Function) {
  const errorId = generateId()
  
  // Log to error tracking service
  errorTracker.captureException(error, {
    id: errorId,
    userId: req.user?.id,
    path: req.path,
    method: req.method,
    query: req.query,
    // Don't log passwords or sensitive data
    body: sanitize(req.body),
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    timestamp: new Date().toISOString(),
  })
  
  // Also log to CloudWatch
  console.error(JSON.stringify({
    type: 'error',
    errorId,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  }))
  
  // Response to client includes error ID for support
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      errorId, // User can report this to support
    }
  })
}

// Usage: User reports "Error ID: err_abc123" → Support looks it up
```

### Session Replay (for support)

```typescript
// src/analytics/session-replay.ts

export function captureSessionEvent(event: UserAction) {
  // Capture keyboard/mouse/scroll events (privacy-aware)
  sessionRecorder.record({
    eventType: event.type, // 'click', 'scroll', 'input'
    timestamp: new Date(),
    selector: event.target, // CSS selector (not sensitive data)
    userId: getCurrentUserId(),
    sessionId: getSessionId(),
  })
}

// Privacy: Don't capture password fields, payment info
// When user reports bug, support can replay their session
```

### Instrumentation Example (Standings Calculation)

```typescript
// src/business/standings.ts

export async function calculateStandings(groupId: string) {
  const trace = createTrace('standings_calculation')
  
  try {
    trace.addSpan('load_matches', async () => {
      const matches = await db.loadMatches(groupId)
      return matches
    })
    
    trace.addSpan('load_players', async () => {
      const players = await db.loadPlayers(groupId)
      return players
    })
    
    trace.addSpan('sort', async () => {
      const standings = sortStandings(matches, players)
      return standings
    })
    
    trace.addSpan('save_cache', async () => {
      await redis.setex(`standings:${groupId}`, 3600, JSON.stringify(standings))
    })
    
    // Trace complete, log metrics
    console.log(JSON.stringify({
      type: 'standings_calculation',
      groupId,
      duration: trace.duration(),
      spans: trace.spans(), // { load_matches: 45ms, load_players: 30ms, sort: 15ms, save_cache: 5ms }
    }))
    
  } catch (error) {
    trace.addError(error)
    throw error
  }
}
```

---

## Recommended Analytics Tools

### Tier 1: Essential (Start Here)

| Tool | Purpose | Cost | Setup |
|------|---------|------|-------|
| **CloudWatch** (AWS) | Logs, metrics, alarms | Included in AWS free tier | Built-in to Lambda |
| **Resend Dashboard** | Email delivery tracking | Included | Built-in to Resend |
| **Sentry** | Error tracking & source maps | Free tier: 5K events/month | 5 min setup |
| **Custom Analytics** | Business metrics (homegrown) | $0 | Simple event logging |

### Tier 2: Nice to Have (Later)

| Tool | Purpose | Cost | Use Case |
|------|---------|------|----------|
| **PostHog** | Product analytics | Open source or $29+/month | User behavior tracking |
| **Datadog** | Comprehensive monitoring | $15+/month | Infrastructure + APM |
| **LogRocket** | Session replay | $99+/month | Debug user issues |
| **Google Analytics 4** | Web analytics | Free | Basic page views, retention |

### Tier 3: Enterprise (v2+)

| Tool | Purpose |
|------|---------|
| **Amplitude** | Advanced cohort analysis |
| **Mixpanel** | Detailed funnel analysis |
| **Tableau** | BI & dashboarding |

---

## Analytics Implementation Roadmap

### v1 Beta (Weeks 1-2)

**Goal:** Track essential metrics to validate product-market fit

```typescript
// Minimum viable analytics for beta

// 1. Business events
trackTournamentCreated(tournamentId, organizerId)
trackPlayerRegistered(tournamentId, playerId)
trackTournamentCompleted(tournamentId)

// 2. Error tracking (Sentry)
Sentry.captureException(error)

// 3. Performance (CloudWatch)
console.log({ type: 'http_request', duration, path })
```

**Capture to:**
- CloudWatch Logs (free, included in Lambda)
- Sentry (free tier, 5K events/month)
- Post-tournament survey (Google Form)

**Dashboard:**
- Weekly WAO (organizers)
- Weekly tournaments created
- Weekly player registrations
- Tournament completion rate (manual check)
- Error rate (Sentry dashboard)

---

### v1 Public Launch (Weeks 3-4)

**Goal:** Comprehensive understanding of product health

```typescript
// Add Tier 2 tracking

// User behavior
trackGroupDistribution(tournamentId, groupCount)
trackMatchConfirmed(matchId, tournamentId)
trackScoreSubmitted(matchId, tournamentId)
trackPhaseAdvanced(tournamentId, from, to)
trackPlayerWithdrawal(playerId, tournamentId)

// Performance
trackSlowRequest(path, duration)
trackDatabaseQueryTime(query, duration)
trackWebSocketLatency(message, latency)

// Email tracking
trackEmailSent(eventType, recipient)
trackEmailDelivered(eventType, recipient)
trackEmailBounced(eventType, recipient)
```

**Additional tools:**
- PostHog (open source) or custom events to S3
- Database for analytics (PostgreSQL can work)

**Dashboard:**
- Real-time business metrics
- Performance dashboard (CloudWatch)
- Weekly user behavior report
- Email delivery dashboard

---

### v2+ (Post-Launch)

**Goal:** Data-driven product decisions

```typescript
// Advanced analytics
- Cohort analysis (compare organizer retention by sport)
- Funnel analysis (registration → group → knockout → completion)
- Segmentation (which organizers/players are most engaged?)
- Attribution (what drives tournament completion?)
```

**Tools:**
- Amplitude or Mixpanel (paid tiers)
- BI tool (Tableau, Superset)

---

## Analytics SQL Examples

### Business Metrics Queries

```sql
-- Weekly Active Organizers (WAO)
SELECT
  DATE_TRUNC('week', created_at) as week,
  COUNT(DISTINCT created_by) as wao
FROM tournaments
WHERE created_at >= NOW() - INTERVAL '8 weeks'
GROUP BY week
ORDER BY week DESC;

-- Tournament Completion Rate (Last 30 Days)
SELECT
  COUNT(CASE WHEN status = 'complete' THEN 1 END)::float /
  COUNT(*) as completion_rate
FROM tournaments
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND status != 'draft';

-- Average Players per Tournament (Last 30 Days)
SELECT
  ROUND(AVG(player_count), 1) as avg_players
FROM tournaments
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND status IN ('complete', 'group_stage_active', 'knockout_active');

-- Match Completion Rate by Tournament
SELECT
  tournament_id,
  COUNT(CASE WHEN status = 'completed' THEN 1 END)::float /
  COUNT(*) as match_completion_rate
FROM matches
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY tournament_id
ORDER BY match_completion_rate DESC;

-- Organizer Retention (Repeat Customers)
SELECT
  COUNT(DISTINCT CASE WHEN tournament_count >= 2 THEN organizer_id END)::float /
  COUNT(DISTINCT organizer_id) as retention_rate
FROM (
  SELECT
    created_by as organizer_id,
    COUNT(*) as tournament_count
  FROM tournaments
  WHERE created_at >= NOW() - INTERVAL '90 days'
  GROUP BY created_by
) stats;

-- Player Satisfaction (From Survey)
SELECT
  ROUND(AVG(rating), 2) as avg_rating,
  COUNT(*) as response_count
FROM tournament_surveys
WHERE created_at >= NOW() - INTERVAL '30 days';
```

---

## Analytics Privacy Considerations

### What TO Track

✅ Event type (score_submitted, match_confirmed)
✅ Timestamps
✅ Tournament/Group IDs
✅ Aggregated counts (number of players)
✅ Durations (time to submit score)
✅ Error types and stack traces

### What NOT to Track

❌ Player names (anonymize as player_id)
❌ Passwords or auth tokens
❌ Email addresses (unless explicitly opted in)
❌ IP addresses (unless debugging specific issues)
❌ Device fingerprints
❌ Cookies (unless for analytics)

### GDPR Compliance

```typescript
// When player requests data deletion
export async function deletePlayerAnalytics(playerId: string) {
  // Remove from analytics database
  await analytics.deletePlayer(playerId)
  
  // Keep aggregated metrics (tournament still happened)
  // But don't associate specific events with deleted player
}
```

---

## Analytics Alerts & Thresholds

### Critical Alerts (Page Organizer Immediately)

```
IF error_rate > 1% THEN page_on_call()
IF uptime < 99% THEN page_on_call()
IF api_latency_p95 > 1000ms THEN page_on_call()
IF tournament_completion_rate_1d < 50% THEN investigate()
```

### Warning Alerts (Email Summary)

```
IF error_rate > 0.5% THEN send_daily_alert()
IF api_latency_p95 > 500ms THEN send_daily_alert()
IF match_completion_rate < 80% THEN investigate()
IF player_satisfaction < 3.5 THEN gather_feedback()
```

### Info Alerts (Weekly Report)

```
Every Monday:
- WAO trend
- New tournaments
- New players
- Tournament completion rate
- Top errors
```

---

## Metrics Definitions (Clear Language)

### Business Metrics

**Tournament Completion Rate**
- Definition: % of tournaments that reach "complete" status / total tournaments with status != "draft"
- Why it matters: Indicates if organizers successfully run full tournaments
- Normal range: 75-90%
- Investigation: <70% suggests friction in tournament flow

**Match Completion Rate**
- Definition: # of matches with status="completed" / total matches
- Why it matters: High completion means organizers/players are engaged
- Normal range: 80-95%
- Investigation: <70% suggests no-shows or system issues

**Organizer Retention**
- Definition: # of organizers with 2+ tournaments / total organizers
- Why it matters: Repeat usage indicates product-market fit
- Normal range: 50-70% (cohort-dependent)
- Investigation: <30% suggests first-time users aren't coming back

### Performance Metrics

**Page Load Time (P95)**
- Definition: 95th percentile of time from navigation start to first contentful paint
- Target: <2 seconds
- How to measure: Lighthouse, Web Vitals API
- Investigation: >3 seconds impacts user experience

**API Latency (P95)**
- Definition: 95th percentile of API request duration (from request arrival to response sent)
- Target: <200ms (reads), <500ms (writes)
- How to measure: CloudWatch, application logs
- Investigation: >1 second indicates database/queue issue

**Error Rate**
- Definition: # of 5xx responses / total requests
- Target: <0.5%
- How to measure: CloudWatch, error tracking
- Investigation: >1% indicates production issue

---

## Sample Analytics Dashboard (Daily View)

```
╔════════════════════════════════════════════════════════════════════╗
║           TOURNAMENT ANALYTICS DASHBOARD - May 8, 2026             ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  BUSINESS METRICS (24h)                   TREND      STATUS        ║
║  ─────────────────────────────────────────────────────────────    ║
║  Active Organizers:              5        ↑ 20%      ✅ On track  ║
║  Tournaments Created:            2        ↔ 0%       ✅ Expected  ║
║  Player Registrations:          18        ↑ 50%      ✅ Growth    ║
║  Tournament Completion Rate:    85%       ↑ 5%       ✅ Good      ║
║  Match Completion Rate:         91%       ↔ 0%       ✅ Good      ║
║  Player Satisfaction:          4.3/5      ↑ 0.1      ✅ Excellent ║
║                                                                    ║
║  PERFORMANCE METRICS (Real-Time)                                  ║
║  ─────────────────────────────────────────────────────────────    ║
║  Page Load (P95):               1.6s      ✅                      ║
║  API Latency (P95):             165ms     ✅                      ║
║  Error Rate:                   0.1%       ✅                      ║
║  Uptime (30d):                99.97%      ✅                      ║
║  Email Delivery:              99.9%       ✅                      ║
║                                                                    ║
║  TOP ISSUES (Last 24h)                                            ║
║  ─────────────────────────────────────────────────────────────    ║
║  1. 404 Not Found (match endpoint)   - 3 occurrences             ║
║  2. Slow standings query (>1s)       - 1 occurrence              ║
║  3. WebSocket disconnect             - 2 occurrences             ║
║                                                                    ║
║  ACTION ITEMS                                                     ║
║  ─────────────────────────────────────────────────────────────    ║
║  □ Investigate 404 errors (possibly deleted tournaments?)        ║
║  □ Check standings query performance                             ║
║  □ Monitor WebSocket stability                                   ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## Implementation Checklist

### Week 1: Essential Analytics

- [ ] Add CloudWatch logging to Lambda functions
- [ ] Set up Sentry error tracking
- [ ] Create basic business event tracking (tournament_created, player_registered)
- [ ] Set up daily error rate dashboard
- [ ] Document analytics privacy policy

### Week 2: Performance Tracking

- [ ] Add API latency logging
- [ ] Set up database query performance monitoring
- [ ] Configure CloudWatch alarms for uptime
- [ ] Add page load time measurement (Lighthouse)
- [ ] Create performance dashboard

### Week 3: User Behavior

- [ ] Add user action tracking (match_confirmed, score_submitted)
- [ ] Set up segment analysis queries
- [ ] Create weekly business metrics report
- [ ] Configure automated alerts

### Week 4: Advanced Analytics

- [ ] Set up PostHog or alternative for product analytics
- [ ] Build funnel analysis (registration → completion)
- [ ] Create cohort analysis (organizer retention)
- [ ] Implement session replay for support

---

## Conclusion

A good analytics strategy for this app:

1. **Starts simple** — CloudWatch + Sentry + custom events
2. **Answers business questions** — Is the product working? Are users happy?
3. **Is privacy-respecting** — No tracking sensitive data
4. **Enables debugging** — When something breaks, find it fast
5. **Grows incrementally** — Add tools as needs evolve

**Start with Tier 1 (business metrics).** Get to know your organizers and players. Once you understand the product, add Tier 2 (behavior) and Tier 3 (performance). Tier 4 (debugging) should always be in place.

**Expected outcome:** By week 4, you'll have clear visibility into tournament health, user engagement, and system performance. You'll know if you're winning.
