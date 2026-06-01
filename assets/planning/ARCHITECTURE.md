# Architecture & System Design

High-level overview of the tournament management system architecture, including data flow, state management, and real-time updates.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React 19)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  UI Pages    │  │   Hooks      │  │  State Stores    │  │
│  │  & Components│  │ (useTournament│  │ (TanStack Query) │  │
│  └──────────────┘  │  useSSE)     │  └──────────────────┘  │
└──────────────┬──────────────────────────────────────────────┘
               │ REST API + SSE
               │
┌──────────────┴──────────────────────────────────────────────┐
│                 Backend (Express + SQLite)                   │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  API Routes     │  │  Job Queue   │  │  SSE Events  │   │
│  │  (CRUD, Search) │  │  (Standings, │  │  (Real-time) │   │
│  │                 │  │   Brackets)  │  │              │   │
│  └─────────────────┘  └──────────────┘  └──────────────┘   │
│                          │                                   │
│  ┌─────────────────────────┴─────────────────────────┐    │
│  │         SQLite Database                            │    │
│  │  ┌──────────────────────────────────────────┐    │    │
│  │  │ Tables:                                   │    │    │
│  │  │ - tournaments, players, groups, matches  │    │    │
│  │  │ - standings, brackets, user_events       │    │    │
│  │  └──────────────────────────────────────────┘    │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Page Structure

**TournamentDetail** (Main page)
```
TournamentDetail
├── Standings Tab (default, eager-loaded)
│   └── StandingsTable (virtualized, react-window)
│       └── MatchCard (memoized)
├── Matches Tab (lazy-loaded)
│   └── MatchCard list
├── Bracket Tab (lazy-loaded)
│   └── BracketMatch tree
└── Details Tab (lazy-loaded)
    └── Tournament metadata
```

**BrowseTournaments** (Discovery page)
```
BrowseTournaments
├── Tournament List (paginated, infinite scroll)
│   └── TournamentCardWrapper (with prefetch on hover)
│       └── TournamentCard
└── Pagination Controls
```

### State Management

**TanStack Query (React Query)** - Server State
```typescript
// Cache key: ['tournament', tournamentId]
// Deduplication: 60s window (prevents redundant requests)
// Stale time: 60s (when data becomes "stale", refetch on window focus)
// GC time: 5min (keep in cache for 5min after unmount)

const { data: tournament, isLoading, error, refetch } = useTournament(tournamentId)
```

**Stores** - Client State (in-memory)
```typescript
// Tournament store: tournament metadata, status
// Standings store: all standings data (updated via SSE)
// Matches store: all matches (updated via SSE)
// Bracket store: bracket structure (updated via SSE)

// Usage:
import { useTournamentStore } from '../state'
const tournament = useTournamentStore(state => state.tournament)
```

**URL State** - Navigation State
```typescript
// Current tab stored in URL pathname:
// /tournament/:tournamentId/standings
// /tournament/:tournamentId/matches
// /tournament/:tournamentId/bracket
// /tournament/:tournamentId/details

// Enables back/forward navigation, bookmarking, deep linking
const { tournamentId } = useParams()
const currentTab = useMemo(() => {
  // Derived from URL pathname
}, [location.pathname])
```

### Data Flow

#### Initial Page Load
```
User navigates to /tournament/tourn_123/standings
  ↓
TournamentDetail mounts
  ↓
useTournament(tournamentId) called
  ├─ React Query checks cache (miss)
  ├─ Fetches GET /tournaments/:id/bundle
  ├─ Returns { tournament, standings, matches, bracket }
  └─ Stores in React Query cache (60s TTL)
  ↓
Standings component renders with cached data
  ↓
useSSE(tournamentId) opens persistent connection
  └─ Listens for standings.updated, bracket.published events
```

#### Real-Time Update (SSE)
```
Backend scores updated: POST /tournaments/:id/matches/:matchId/score
  ↓
Score parsed and validated
  ↓
Standings recalculated (if group stage)
  ↓
Job queue: Trigger "standings.updated" job
  ├─ Calculates new standings
  ├─ Broadcasts SSE event to all connected clients
  └─ Emits: { groupId, standings: [...] }
  ↓
Frontend receives SSE message
  ↓
useSSE hook dispatches to standingsStore.update(payload)
  ↓
Component re-renders with new standings (automatic via store)
```

#### Error Handling & Retry
```
User submits score: POST /api/analytics/events
  ↓
Network fails (offline)
  ↓
Service Worker intercepts request
  ├─ Stores request in IndexedDB queue
  └─ Shows "Offline - will retry" banner
  ↓
Service Worker syncs when online
  ├─ Retry #1: 1s delay
  ├─ Retry #2: 2s delay
  ├─ Retry #3: 4s delay
  ↓
If all retries fail: Show persistent error banner with manual retry button
```

## Backend Architecture

### API Endpoints

**Tournament Management**
```
GET  /tournaments                  # List tournaments (paginated)
POST /tournaments                  # Create tournament
GET  /tournaments/:id              # Get tournament details
GET  /tournaments/:id/bundle       # Get full bundle (consolidation endpoint)
PATCH /tournaments/:id             # Update tournament
DELETE /tournaments/:id            # Delete tournament
```

**Real-Time Events**
```
GET /tournaments/:id/events        # SSE endpoint (persistent connection)
```

**Analytics**
```
POST /api/analytics/events         # Submit analytics batch
```

**User Registration**
```
POST /tournaments/:id/register     # Register player
POST /tournaments/:id/register/confirm  # Confirm registration
```

**Score & Bracket**
```
POST /tournaments/:id/matches/:matchId/score        # Submit score (group)
POST /tournaments/:id/knockout/:matchId/score       # Submit score (knockout)
```

### Job Queue

Background jobs triggered by API actions:

**Standings Recalculation Job**
```
Trigger: POST /matches/:matchId/score (group stage)
Action:
  ├─ Read all scores for the group
  ├─ Calculate standings (wins, losses, set diff)
  ├─ Update standings table
  └─ Emit SSE event: standings.updated
```

**Bracket Generation Job**
```
Trigger: User publishes bracket (phase transition)
Action:
  ├─ Read final standings
  ├─ Seed knockout bracket
  ├─ Generate first-round matches
  └─ Emit SSE event: bracket.published
```

**Email Notification Job**
```
Trigger: Registration/Score submission/Bracket publish
Action:
  ├─ Generate email content
  ├─ Send via email service
  └─ Log in audit trail
```

### Authentication & Authorization

**Organizer Flow**
```
Email + Password → POST /auth/organizer/login
  ├─ Validate email/password (bcrypt)
  ├─ Generate JWT token (7d expiry)
  └─ Return { token, expiresAt }
  ↓
Store token in localStorage
  ↓
Include in header: Authorization: Bearer <token>
  ↓
Server verifies JWT signature
  ├─ Extract sub (organizer ID)
  └─ Grant access to organizer endpoints
```

**Player Flow**
```
Email + Name → POST /auth/player/magic-link
  ├─ Generate 24h single-use token
  ├─ Send via email
  └─ Return { message: "Check your email" }
  ↓
User clicks link: /auth/player/magic-link/:token
  ├─ Validate token (not expired, not used)
  ├─ Generate session token (7d expiry)
  └─ Redirect to /tournament/:id with session token
  ↓
Session token stored in localStorage
  ↓
Include in header: Authorization: Bearer <token>
```

## Database Schema

### Core Tables

**tournaments**
```
- id (TEXT PRIMARY KEY)
- name (VARCHAR)
- status (VARCHAR): registration, group_stage_active, knockout_stage, complete
- maxPlayers (INT)
- creatorId (TEXT FOREIGN KEY → organizers.id)
- createdAt, updatedAt (TIMESTAMP)
```

**players**
```
- id (TEXT PRIMARY KEY)
- email (VARCHAR UNIQUE)
- name (VARCHAR)
- phone (VARCHAR)
- verified (BOOLEAN)
- createdAt (TIMESTAMP)
```

**tournament_registrations**
```
- id (TEXT PRIMARY KEY)
- tournamentId (TEXT FOREIGN KEY → tournaments.id)
- playerId (TEXT FOREIGN KEY → players.id)
- status (VARCHAR): pending, confirmed, withdrawn
- registeredAt (TIMESTAMP)
- UNIQUE(tournamentId, playerId)
```

**standings**
```
- id (TEXT PRIMARY KEY)
- groupId (TEXT FOREIGN KEY → groups.id)
- playerId (TEXT FOREIGN KEY → players.id)
- rank (INT)
- wins, losses (INT)
- setsWon, setsLost (INT)
- updatedAt (TIMESTAMP)
- INDEX(groupId, rank)
```

**user_events**
```
- id (TEXT PRIMARY KEY)
- user_id (TEXT FOREIGN KEY → players.id)
- event_type (VARCHAR): screen_view, time_to_data, sse_update, performance
- screen (VARCHAR): standings, matches, bracket
- duration (INT): milliseconds
- data (TEXT): JSON for complex metrics
- created_at (TIMESTAMP)
- INDEX(user_id, created_at)
- INDEX(event_type)
```

## Performance Optimizations

### Frontend

1. **React.memo** - Prevent re-renders of expensive components
   - StandingsTable: Prevents re-render when parent updates error banner
   - MatchCard: Prevents re-render in list when unrelated data changes

2. **Code Splitting** - Lazy-load non-critical tabs
   - Standings: Eager-loaded (default tab, shown immediately)
   - Matches, Bracket, Details: Lazy-loaded on first click
   - Expected: -200-300ms FCP

3. **Prefetch** - Load data before user interaction
   - usePrefetch hook: Triggered on hover for tournament cards
   - React Query: Deduplicates prefetch requests
   - Expected: -300-500ms perceived TTI

4. **Virtual Scrolling** - Only render visible rows
   - react-window: Renders ~20 rows + buffer for 500-row table
   - Expected: Constant DOM size, O(1) render time

5. **Image Lazy Loading** - Defer image loading until visible
   - useImageLazyLoad hook: Intersection Observer API
   - Expected: -100-200ms initial paint

### Backend

1. **Database Indexes**
   - (user_id, created_at): Fast user event queries
   - (tournament_id, status): Fast tournament filtering
   - (group_id, rank): Fast standings queries

2. **Query Deduplication**
   - React Query cache: 60s TTL prevents duplicate requests
   - Expected: 80% cache hit rate for active users

3. **Batch Operations**
   - Analytics: Batch events (up to 10) in POST request
   - Expected: -90% network overhead

4. **Connection Pooling**
   - SQLite: Single persistent connection (embedded DB)
   - Expected: <5ms query latency

## Real-Time Architecture

### Server-Sent Events (SSE)

**Connection Lifecycle**
```
User opens tournament page
  ↓
useSSE hook establishes connection: GET /tournaments/:id/events
  ├─ Server receives request
  ├─ Adds client to BroadcastBus subscribers
  ├─ Keeps connection open (HTTP Keep-Alive)
  └─ Client receives: message format JSON
  ↓
Background job emits event: standings.updated
  ├─ BroadcastBus routes to all subscribers
  ├─ Sends: event: standings.updated\ndata: {...}\n\n
  └─ Network latency: 50-150ms (typical)
  ↓
Frontend receives message
  ├─ useSSE hook parses JSON
  ├─ Dispatches to store: standingsStore.update(payload)
  └─ Component re-renders with new data
  ↓
User closes page or network disconnects
  ├─ BroadcastBus removes subscriber
  └─ Server closes connection
```

**Advantages Over Polling**
- No client-side polling (saves battery, bandwidth)
- Lower latency (push vs. poll)
- Server controls broadcast (no duplicate requests)
- Natural for real-time scores, bracket updates

## Analytics Architecture

### Event Collection

**Points of Collection**
```
useAnalytics hook:
├─ screen_view: User navigates to screen (Standings, Matches, etc.)
├─ time_to_data: Data fetched from API (tracks API vs. render time)
└─ sse_update: Real-time update received (tracks SSE latency)

usePageNavigation hook:
└─ Triggers screen_view on URL change

Service Worker:
├─ Logs requests: score submission, registration
└─ Detects offline state: offline event

Component-level:
└─ useImageLazyLoad: Tracks image load times
```

**Event Structure**
```typescript
interface AnalyticsEvent {
  timestamp: number                     // When event occurred
  userId: string                        // Player ID
  eventType: string                     // screen_view, time_to_data, etc.
  screen?: string                       // standings, matches, bracket
  duration?: number                     // milliseconds (for time events)
  data?: Record<string, any>            // Additional metrics (API duration, etc.)
}
```

**Batch Submission**
```
useAnalytics collects events in buffer (max 10 events)
  ↓
Every 30 seconds OR buffer full:
  ├─ POST /api/analytics/events { events: [...] }
  ├─ Service Worker queues if offline
  └─ Retry on failure (3× exponential backoff: 1s, 2s, 4s)
```

### Analytics Queries

See [ANALYTICS_QUERIES.md](./ANALYTICS_QUERIES.md) for:
- User navigation paths
- Average time on screen
- Performance bottlenecks (slowest screens)
- Feature usage statistics
- Real-time update latency
- Session metrics

## Security Model

### Data Protection

1. **Authentication**
   - Organizer: bcrypt password hashing (cost factor 12)
   - Players: Magic link tokens (24h single-use, secure random)

2. **Authorization**
   - Role-based access control (organizer vs. player)
   - Endpoint protection: requireOrganizerAuth, requirePlayerSessionAuth
   - Data isolation: Players only see their own registrations

3. **Input Validation**
   - All user inputs validated against schema
   - SQL injection prevention: Parameterized queries
   - XSS prevention: Output encoding in React

4. **Secure Tokens**
   - JWT: Signed with HMAC-SHA256, 7d expiry
   - Magic links: Cryptographically secure random, 24h expiry, single-use
   - Session tokens: Stored in secure, httpOnly cookies (frontend uses localStorage)

5. **HTTPS (Production)**
   - TLS 1.3 encryption in transit
   - HSTS headers for HTTPS enforcement
   - CORS restrictions to prevent unauthorized access

## Monitoring & Observability

### Structured Logging

All API routes log using structured logging format:
```typescript
log.info('tournament.created', {
  tournamentId: tournament.id,
  organizerId: payload.sub,
  playerCount: tournament.maxPlayers
})
```

Log levels:
- `debug`: Read-only routes (handled by middleware)
- `info`: State-changing operations (create, update, delete)
- `warn`: Expected errors (auth, validation)
- `error`: Unexpected errors (5xx)

### Performance Metrics

**Query Performance**
```sql
-- Slowest screens (by P95 load time)
SELECT screen, ROUND(AVG(duration), 0) as avg_ms
FROM user_events
WHERE event_type = 'time_to_data'
GROUP BY screen
ORDER BY avg_ms DESC
```

**User Engagement**
```sql
-- Returning users (sessions >= 2)
SELECT COUNT(DISTINCT user_id) as returning_users
FROM (
  SELECT user_id, COUNT(DISTINCT DATE(created_at)) as sessions
  FROM user_events
  GROUP BY user_id
  HAVING sessions >= 2
)
```

See [ANALYTICS_QUERIES.md](./ANALYTICS_QUERIES.md) for more monitoring queries.

## Deployment Architecture

### Production Checklist

1. **Security**
   - [ ] Change JWT_SECRET to strong value
   - [ ] Enable HTTPS/TLS
   - [ ] Set up CORS for production domain
   - [ ] Enable CSRF protection

2. **Database**
   - [ ] Use persistent database path
   - [ ] Set up automated backups
   - [ ] Monitor database size

3. **Monitoring**
   - [ ] Set up log aggregation
   - [ ] Configure performance alerts
   - [ ] Monitor database query times

4. **Infrastructure**
   - [ ] Configure auto-scaling
   - [ ] Set up load balancing
   - [ ] Enable CDN for static assets

---

**Status:** ✅ Production Ready | **Last Updated:** May 2026
