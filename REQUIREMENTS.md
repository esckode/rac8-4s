# Tournament Webapp Requirements

## Product Overview
A tournament management webapp for racket sports (tennis, pickleball, badminton, table tennis, etc.) that helps tournament organizers run tournaments from registration through bracket management to final results.

## Core Users
- **Primary**: Tournament organizers who need to manage tournaments from start to finish

## Tournament Types & Scale
- **Sports supported**: Multi-sport capable; each tournament is for a single sport (label-based)
- **Player scale**: 100+ players per tournament
- **Match formats**: Singles (1v1) or Doubles (2v2) per tournament (not mixed within one tournament)

## Tournament Structure

### Registration & Teams
- **Singles tournaments**: Players sign up individually
- **Doubles tournaments**: 
  - Players sign up individually with partner's registration email
  - Partner receives consent email and must confirm to form the team
  - Confirmation deadline: Partner must confirm by the tournament's registration deadline
  - If partner doesn't confirm by registration deadline, the team is disqualified
  - Players can withdraw team and request a different partner before registration deadline
  - Only paired teams before deadline qualify for the tournament
- **Player tokens**: Each player gets a new magic link token per tournament registration (not reused across tournaments)
- **Concurrent tournaments**: Players can register for and participate in unlimited tournaments simultaneously

### Group Stage
- Organizer specifies the number of groups (can be 1 for small tournaments)
- System auto-distributes players evenly and randomly across groups
- Organizer specifies how many players advance from each group (e.g., top 1, top 2, top 3, etc.)

### Knockout Stage
- Single-elimination bracket for v1
- All advancing players from group stage enter one knockout bracket
- No secondary/consolation brackets in v1

## Score Tracking

### Match Result Reporting
- One of the players involved in the match self-reports the final score
- Score format: text-based (e.g., "6-4, 6-3")
- Player sees their upcoming matches in a clean list, clicks a match to report

### Score Editing & Overrides
1. **Player submission deadline**: Players can edit scores until a configurable deadline
2. **Organizer override window**: After player deadline but before next bracket is declared, organizer can make corrections
3. **Lock point**: Once the next bracket is declared, scores are locked

### Visibility
- Once a score is submitted, it's reflected to all players involved in that match
- All players involved can edit until the deadline

## Authentication & Access

### Player Registration & Access
- **Registration method**: Magic link (passwordless) — player enters name + email, receives emailed access link with unique token
- **Magic link expiry**: Token expires after a configurable TTL (recommend 24-48 hours)
- **Registration discovery**: Public tournament listing page — players browse available tournaments and self-register
- **Access**: Player needs valid magic link to log in; session stored in Redis with TTL

### Organizer Authentication
- **Login method**: Email + password
- **Account creation**: Organizers sign up with email/password (password hashed with bcrypt, bcrypt recommended)
- **Session storage**: JWT or session token stored in Redis

### Multi-Tournament & Co-Organizers
- **Scope**: One organizer account can create and manage multiple tournaments
- **Access control**: Organizer can access only tournaments they created or were assigned to as co-organizer
- **Co-organizer invitation**: Tournament creator sends email invite to another organizer; invitee must accept and have/create an organizer account

## Tournament Lifecycle & Phases

### Tournament States
1. **Registration Open** — Players can register; organizer can configure but not start groups
2. **Registration Closed** — No more player registrations; organizer prepares groups
3. **Group Stage Active** — Matches scheduled, players submitting scores
4. **Group Stage Complete** — Standings calculated, organizer reviews and advances
5. **Knockout Active** — Bracket declared, players submitting scores per round
6. **Tournament Complete** — All matches finished, results public

### Phase Transitions
- **Hybrid model**: Organizer sets target dates for each phase, but can manually override/advance at any time
- **Example**: Group stage deadline is set to May 15, but organizer can declare group stage complete earlier if all scores submitted

## Group Stage Details

### Group Distribution
- **Algorithm**: For v1, players are randomly distributed evenly across N groups
- **Default group count**: System suggests number of groups based on player count; organizer can adjust
- **Group configuration**: Organizer can specify the number of groups before groups are created
- **Match format**: Round-robin — every player in a group plays every other player in that group once
- **Advancement**: Organizer specifies how many players advance from each group (e.g., top 1, top 2, top 3)
- **Future enhancement**: Seeding-based distribution (by player rankings/skill) planned for v2+

### Group Standings Calculation
- **Primary ranking**: Win/loss record (most wins → highest rank)
- **Tiebreaker 1**: Sets won (total sets won across all group matches)
- **Tiebreaker 2**: Head-to-head result between tied players
- **Tiebreaker 3**: If still tied, coin flip / random determination

### Group Stage Match Visibility
- **Match schedule visibility**: All players in a group can see the full round-robin match schedule
- **Results visibility**: All players in a group can see all match results and standings in real-time

### Group Stage Match Scheduling
- **Organizer-set timeframes**: Organizer defines a date range for each round of group matches (e.g., "May 10-15")
- **Player coordination**: Within the organizer's timeframe, both players in a match must coordinate and confirm a specific match time
- **Confirmation required**: One player confirms the agreed match time in the app; both players see the confirmed time
- **Contact info visibility**: Player contact info (email, phone) is revealed to opponent only when coordinating a match
- **No confirmation by deadline**: If players don't confirm a match time by the organizer's deadline:
  - Neither player wins or loses that match
  - Match is marked as unconfirmed/unplayed
  - Organizer manually handles (reschedule, cancel, or other resolution)
- **No-show handling**: If a match is confirmed but one player doesn't show up:
  - Present player can initiate a "claim walkover" in the app
  - Opponent is awarded a loss; claimant gets a win
  - System records this for organizer review and audit

### Score Deadline — Group Stage
- **Single deadline**: Organizer sets one date/time deadline for all group stage scores
- **Enforcement**: Once deadline passes, players cannot edit/submit new scores
- **Organizer override window**: Organizer can still correct scores after player deadline but before advancing to knockout

## Knockout Stage Details

### Bracket Generation & Seeding
- **Seeding**: Players seeded by their group stage ranking (win/loss + sets won)
- **Bye assignment**: When advancing player count isn't a power of 2, top seeds automatically receive byes in round 1
  - Example: 13 advancing players → 16 bracket slots → top 3 seeds get byes → 10 matches in round 1
- **Single bracket**: All advancing players enter one knockout bracket (no separate consolation brackets in v1)
- **Bracket preview & approval**: After bracket is generated, organizer reviews it before it's revealed to players
  - Organizer can see the full bracket structure but players don't see it yet
  - Organizer can adjust/override seeding or byes if needed before publishing
  - Once organizer approves and publishes, bracket becomes visible to all players and public

### Score Deadline — Knockout Rounds
- **Per-round deadline**: Each knockout round has a configurable submission window for scores (e.g., 2 hours or a set date/time)
- **Lock trigger**: Scores lock when **either** the submission deadline passes **OR** organizer manually advances to the next round (whichever comes first)
- **Organizer control**: Organizer can manually advance before the deadline if all scores are submitted
- **Organizer override window**: Same as group stage — window exists between player deadline and round advance

## Score Tracking — Detailed

### Score Submission
- **Who submits**: One player involved in the match self-reports the final score
- **Format**: Text-based (e.g., "6-4, 6-3" for tennis, "11-9, 11-7" for pickleball)
- **Validation & parsing**: 
  - System validates score format strictly (e.g., "X-Y, X-Y" pattern)
  - Auto-parses score to extract sets won by each player
  - Displays parsed result to player for confirmation before submission (prevents silent parsing errors)
  - Score text and parsed set counts both stored in database

### Score Conflicts
- **Collision handling**: If both players submit different scores for the same match, last submission wins
- **No conflict detection**: System does not flag or block conflicting submissions
- **Organizer override**: Organizer can override any score at any time (even after phase deadline) with a note explaining the reason

### Score Visibility
- Once a score is submitted, it's immediately visible to all players involved in that match
- All players involved can edit/re-submit until the phase deadline

## Mid-Tournament Player Withdrawal

### Withdrawal Handling
- **Group stage withdrawal**: If a player withdraws after registration closes, all their remaining unplayed matches are canceled
  - Opponents' match records are unaffected (no automatic win or loss; the match is simply canceled)
  - Standings are recalculated without the withdrawn player
  - Opponent's opponent count may be fewer than others, but that's reflected in standings calculation
- **Knockout withdrawal**: If a player withdraws before their knockout match, opponent advances (automatic bye)
- **Doubles withdrawal**: If one member of a doubles team withdraws, the entire team is withdrawn

### Unreported Matches
- **Deadline passed, no score submitted**: If neither player submits a score by the deadline:
  - Organizer manually reviews unreported matches
  - Organizer decides per match: cancel (opponent unaffected), grant opponent a bye, or override with a default result
  - No automatic handling; each case handled individually

## Player Contact Preferences

- **Multiple contact methods**: Players can set multiple contact mechanisms (email, phone number)
- **Preferred contact method**: Player designates which contact method is preferred for match coordination
- **Privacy by default**: Contact info is hidden from other players by default
- **Visibility on demand**: Contact info is revealed only when needed (e.g., during match scheduling coordination)
- **Contact during registration**: Players provide contact info when registering for a tournament

## Tournament Visibility & Public Access

### Public Views
- Tournament brackets and results are publicly viewable without login
- Players and spectators can view public bracket links to see live standings and match results
- Public bracket is read-only — no edits allowed from public view

### Player Visibility
- Players can only view their own upcoming matches and tournament dashboard while logged in (via magic link)
- Players can view all group stage and knockout results once those matches are complete

## Notifications

### Player Notifications (Email)
Automated email notifications sent to players at the following events:
1. **Match scheduled** — Players notified when a match is assigned to them (group stage and knockout)
2. **Score submitted** — Opponent(s) notified when a score is reported for their match
3. **Score deadline reminder** — Players reminded when score submission deadline is approaching (e.g., 24 hours before)
4. **Tournament phase change** — All registered players notified when tournament advances (e.g., "Group stage complete, knockout starting")

Additional player notifications:
- Magic link token sent to player for registration/login
- Doubles partner consent email (for doubles tournaments)
- Co-organizer invitation email

### Organizer Notifications
- **Real-time in-app dashboard**: Organizer views all tournament activity (score submissions, withdrawals, match completions) via the live dashboard
- **No email notifications**: Organizer does not receive email notifications for tournament events (to avoid email spam)
- **WebSocket updates**: Dashboard updates in real-time as events occur

## Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + Vite | Static bundle, 100% CDN-cacheable; fast build |
| Frontend Hosting | Cloudflare Pages | Global CDN, free tier, instant deploys |
| Backend | Node.js + Fastify + TypeScript | Stateless API, horizontally scalable; shared types with frontend |
| Backend Hosting | Railway or Fly.io | Easy horizontal scaling, no cold starts |
| Database | PostgreSQL | Relational, strong for complex standings and bracket queries |
| Connection Pooling | PgBouncer | Connection pooling from day one (required at 10K+ concurrent) |
| Cache / Sessions | Redis | Magic link tokens (TTL-based), session storage, hot tournament data |
| ORM | Prisma | TypeScript-native, good migrations, schema management |
| Email Delivery | Resend | Developer-friendly, reliable deliverability |
| Email Queue | BullMQ + Redis | Async email delivery, automatic retry logic, prevents request blocking |
| Monorepo | pnpm workspaces | Shared types package between frontend and backend |

## Security & Compliance

### Data Protection
- **Sensitive data types**: Player emails, organizer passwords, player IP addresses / device info
- **GDPR compliance**: Support right to erasure; players can request deletion anytime
- **CCPA compliance**: Respect California privacy rights; transparent data handling
- **Data deletion process**:
  - Players can request data deletion anytime
  - Active tournament data: Player name/email anonymized as "Deleted Player"; match results preserved
  - Completed/archived tournament data: All player data deleted upon request
- **Encryption in transit**: HTTPS/TLS 1.2+ required for all client-server communication
- **Encryption at rest**: PostgreSQL data encrypted on disk; Redis data encrypted on disk
- **Password security**: Organizer passwords hashed with bcrypt + salt
- **Rate limiting & DDoS**: Rate limit per IP/user (e.g., 100 requests/min); DDoS protection via CDN/WAF

### Authentication & Sessions
- **Organizer 2FA**: Required; email codes sent to organizer's email
  - 2FA setup at account creation
  - Organizer receives code via email; enters to verify login
  - No additional vendor licensing (uses existing Resend email service)
- **Session timeout**: Organizer sessions valid for 30 days before re-authentication required
- **Account recovery**: If organizer loses access to 2FA email, support ticket required for recovery
  - Support team verifies identity and resets 2FA

### Audit Logging
- **Login/logout events**: Track organizer login/logout with timestamp and IP
- **Score overrides**: Log when organizer changes a score (who, what, when, reason note)
- **Tournament lifecycle**: Log tournament creation/deletion events
- **2FA changes**: Log when 2FA settings are modified
- **Sensitive data access**: Log when player emails or other sensitive data is accessed

### Admin & Governance
- **Admin team**: Multiple admins with shared oversight capability
  - Admins can override organizers if disputes arise
  - Admins have access to all tournaments and audit logs

### Monitoring & Alerting
- **Security alerts**: Alert admin team on:
  - Multiple failed 2FA attempts (3+ in short period → possible account compromise)
  - Unusual API usage (rate limit violations, API call spikes, anomalous patterns)
  - Admin/organizer actions (score overrides, tournament deletions, role changes)

### Backup & Disaster Recovery
- **v1 approach**: Basic backups provided by hosting provider (Railway/Fly.io)
- **Future (v2)**: Implement formal backup strategy with daily automated backups and 30-day retention

### Incident Response
- **v1 approach**: Basic incident response process; notify affected users if required by law
- **Future (v2)**: Implement comprehensive incident response plan with 72-hour notification requirement

## Organizer Features & Workflows

### Account Management
- **Signup**: Open signup — anyone can create an organizer account with email + password
- **Password reset**: Email reset link sent to organizer; link has time limit and resets password via one-time link
- **2FA setup**: Required at account creation; organizer receives email codes for login
- **Co-organizer access**: Tournament creator can invite other organizers via email; invitee must accept and have/create an organizer account
- **Co-organizer permissions**: Co-organizers have full access (same as creator) — can override scores, advance phases, manage players

### Tournament Management
- **Draft mode**: Organizer can create tournaments in draft state before publishing
- **Publication**: Once published, tournament appears in public tournament listing and registration opens
- **Tournament sharing**: Organizer gets a unique shareable URL; they manually copy and share it (via email, Slack, website, etc.)
- **Tournament size constraints**: Min 4 players, max 200 players per tournament
- **Group stage scheduling**: Organizer defines date range for each round of group matches (e.g., "May 10-15"); players coordinate specific match times within range
- **Default group count**: System suggests number of groups based on player count; organizer can adjust before groups are created

### Tournament Admin Features
- **Bracket approval**: Organizer reviews generated bracket before revealing to players; can adjust seeding/byes
- **Score override**: Organizer can override any score at any time with a note
- **Match management**: Organizer handles unreported matches (cancel, bye, or override)
- **Real-time dashboard**: Live activity feed showing all scores, withdrawals, and match completions via WebSocket updates
- **Phase control**: Organizer can manually advance phases before scheduled dates if conditions are met

### Dashboard & UI
- **Primary dashboard view**: When organizer logs in, they see active tournament (if one exists) or list of tournaments if multiple are active
- **Active tournament view**: Primary section shows current phase detail (standings, match status, pending actions)
- **Live activity feed**: Real-time dashboard updates with scores, withdrawals, match confirmations via WebSocket

### Player UI
- **Player primary view**: When player logs in, they see tournament standings first
- **Match reporting**: Players see upcoming matches in a list; click to view opponent and propose/confirm match time
- **Score submission**: Players enter score as text (e.g., "6-4, 6-3"); system parses and shows parsed result for confirmation before final submission
- **Who reported visibility**: Both players can see who reported the score and when

### Analytics & Reporting
Organizers can access the following reports:
- **Participation stats**: Number of registered players, registration rate, withdrawals, concurrent tournament participation
- **Match completion rate**: Number of submitted scores vs. pending scores by phase
- **Performance breakdown**: Player rankings, win rates, average set differential
- **Email delivery logs**: Which notifications were sent, delivery failures, bounces

### Features Not in v1
- **Data export** (CSV/Excel/PDF) planned for v2
- **In-app messaging** (match coordination happens outside app) planned for v2

## Real-Time Updates

- **Technology**: WebSocket-based real-time updates
- **Organizer dashboard**: Updates in real-time as tournament events occur (scores submitted, withdrawals, phase changes)
- **Player views**: Group standings and bracket updates visible to players in real-time
- **Why WebSocket**: Enables responsive UX for web and is foundation for future mobile app

## Data Management

### Data Retention
- **Active tournaments**: Kept in the system indefinitely while active
- **Completed tournaments**: Kept live (searchable, publicly viewable) for 6-12 months after completion
- **Archive**: After 6-12 months, tournaments are archived (moved to cold storage or deleted)
- **Player data**: Player registrations associated with archived tournaments are also archived

### Doubles Record Tracking
- **Shared team record**: In doubles tournaments, each team (pair) has a single win/loss and sets won record
- **Both players advance/are eliminated together**: Team seeding and advancement decisions apply to both players equally

## Accessibility

- **WCAG 2.1 AA compliance**: All user-facing pages and components meet WCAG 2.1 Level AA accessibility standards
- **Requirements**: Keyboard navigation, screen reader support, sufficient color contrast, form labels, error messages

## Operations & Support

### Timezone Handling
- **UTC storage + local conversion**: All times stored in UTC; displayed in user's local timezone
- **Organizer timezone**: Can view in organizer's timezone; players view in their own timezone

### Support
- **Email support**: Support email address; team responds within 24 hours
- **Support scope**: Handle account recovery, tournament disputes, technical issues

### SLA & Uptime
- **v1 target**: Best effort; no formal SLA
- **Expected uptime**: Best effort, no guaranteed uptime percentage
- **Performance target**: <2s page load time (no formal SLA)
- **v2 plan**: Implement formal SLA (99.5%+ uptime) and performance targets

## Testing Strategy

- **Unit tests**: Test core logic (bracket generation, standings calculation, score parsing)
- **End-to-end tests**: Full tournament flow from registration through results
- **Beta testing**: Real organizers run test tournaments with actual players before public launch

## Launch & Rollout

- **Beta launch**: Closed beta with 3-5 selected tournament organizers running real tournaments
- **Public launch**: After beta feedback and bug fixes, launch to public
- **Marketing**: Organic discovery via racket sports communities; no major marketing spend for v1

## Pricing & Monetization

- **v1**: Completely free for organizers and players
- **v2+**: Consider monetization options (freemium, commission on entry fees, etc.)
  - If commission model added: Payment processing via Stripe/PayPal with full PCI-DSS compliance

## Scale & Performance Targets

- **Designed for**: 10,000+ concurrent requests
- **Architecture approach**: Stateless API enables horizontal scaling; connection pooling eliminates database bottleneck
- **Caching strategy**: 
  - Content-hashed static assets with long browser cache TTLs
  - Short HTTP cache-control headers (30–60s) on public tournament/bracket endpoints
  - Redis for session tokens (no DB lookup per request)
  - Database connection pooling via PgBouncer

## System Architecture

### High-Level Design

**FaaS-based (Serverless) Architecture:**
- No servers or containers to maintain
- Auto-scaling: services scale from zero to thousands of concurrent instances
- Pay-per-use: only pay for compute time and API calls

```
┌──────────────┐
│   Frontend   │ React + Vite → Cloudflare Pages
│   (Static)   │ (CDN-served, cached)
└──────┬───────┘
       │
       ├─── REST API calls ────→ AWS Lambda (business logic)
       │                         ├─ POST /tournaments
       │                         ├─ POST /scores
       │                         ├─ GET /standings
       │                         └─ etc. (sync validation + async processing)
       │
       └─── WebSocket ─────────→ AWS API Gateway WebSocket
                                ├─ Maintains persistent connections
                                └─ Routes real-time updates (standings, brackets, etc.)

        Database:     AWS RDS PostgreSQL (free tier, no connection pooling for v1)
        Cache:        AWS ElastiCache Redis or Upstash
        Email queue:  BullMQ (runs in Lambda)
        Email API:    Resend
```

### Core Components

| Component | Technology | Purpose | Cost (v1) |
|-----------|-----------|---------|-----------|
| **REST API** | AWS Lambda + Fastify | Handle HTTP requests, business logic | $0 (free tier) |
| **WebSocket** | AWS API Gateway WebSocket | Real-time connection management, message routing | ~$1-5/month |
| **Database** | AWS RDS PostgreSQL | Store all tournament, player, match data | $0 (free tier for 12 months) |
| **Cache/Sessions** | Redis (ElastiCache or Upstash) | Store organizer sessions, player tokens, hot data | $0-5/month |
| **Email Queue** | BullMQ (Redis-backed) | Async email job queueing, retry logic | Included in Redis |
| **Email Delivery** | Resend API | Send all notifications and transactional emails | $0 (included in existing budget) |
| **Frontend Hosting** | Cloudflare Pages | Serve React app globally | $0 |

### Request/Response Pattern

**Pattern: Sync Validation + Async Processing**

All write operations follow this pattern:

```
1. SYNC Validation (in Lambda, <100ms)
   ├─ Validate format (e.g., score "6-4, 6-3")
   ├─ Check resource exists (e.g., match, player)
   ├─ Check permissions/state
   └─ If validation fails → return HTTP 400 immediately

2. If validation succeeds → Queue async processing
   └─ Return HTTP 202 "Accepted" (job ID included)

3. ASYNC Processing (BullMQ background job)
   ├─ Expensive operations (standings calculation, bracket generation)
   ├─ External calls (email, WebSocket broadcast)
   └─ Retry logic built-in (if fails, retry with backoff)
```

**Example: Score Submission**
```
POST /matches/123/submit-score
Body: { score: "6-4, 6-3" }

SYNC (Lambda):
├─ Validate format matches "X-Y, X-Y" regex
├─ Check match exists
├─ Check player is in match
└─ If any fail → HTTP 400 error

✓ If validation passes:
├─ Parse score into sets
├─ Store in database
└─ Return HTTP 202 { jobId: "abc123", status: "processing" }

ASYNC (BullMQ job):
├─ Recalculate group standings
├─ Check if standings changed (WebSocket)
├─ Queue opponent notification email
└─ Broadcast standings update via WebSocket
```

### Operation Categories

**Read Operations (SYNC only)**
- Return immediately with current data
- No queuing, no async processing
- Examples: GET standings, GET brackets, GET match list, GET tournaments

**Write Operations (SYNC validation + ASYNC processing)**
- SYNC: Validate input, check permissions, store minimal state
- Return HTTP 202 "Accepted" immediately
- ASYNC: Heavy processing (calculations, emails, WebSocket broadcasts)
- Examples: POST score, POST confirm-match-time, POST create-tournament

**Async-Only Operations (no SYNC validation)**
- Queue immediately, no validation step
- Examples: Send magic link email, send notification emails

### Error Handling & Resilience

**Validation Failures (SYNC):**
- Caught immediately, return HTTP 400 with error message
- Examples: Invalid score format, match doesn't exist, player not authorized
- User gets instant feedback

**Processing Failures (ASYNC):**
- BullMQ job fails
- Automatic retry with exponential backoff (3-5 retries)
- Failed jobs moved to dead-letter queue after max retries
- Organizer notified of persistent failures via dashboard alert
- No user action required; system self-heals

**External Service Failures:**
- **Database unavailable**: Lambda returns HTTP 503; client sees "Service temporarily unavailable"
- **Email service down**: Job queued in BullMQ; will retry when service recovers
- **WebSocket API down**: Affects real-time updates only; data is still persisted
- **Redis down**: Session/cache lost; users need to re-login (acceptable for v1)

**Graceful Degradation:**
- Organizer dashboard shows even if WebSocket is down (polling fallback)
- Score submission works even if notification email fails (data still stored, retry happens)
- Bracket generation continues even if some notifications fail

### Caching Strategy

**Cache-Aside Pattern with Explicit Invalidation:**

All cached data follows a pattern: explicit invalidation on data change + TTL safety net

```
Data changes:
├─ DELETE cache key (immediate invalidation)
├─ Update database
└─ SET cache with TTL (fresh data with safety net)

Queries:
├─ Try cache first → cache hit (fast)
└─ Cache miss → query DB, populate cache
```

**Cache Timeout Values:**

| Data | TTL | Invalidation Trigger | Reasoning |
|------|-----|----------------------|-----------|
| **Group standings** | 1 hour | Score submitted | Expensive calculation, frequently changes; 1h balances freshness vs recomputation |
| **Knockout bracket** | 24 hours | Phase advanced | Expensive calculation, rarely changes; cached until phase advances |
| **Match schedule** | 24 hours | Timeframe changed | Rarely changes; invalidated when organizer updates timeframe |
| **Tournament config** | 24 hours | Organizer edits | Infrequently changed; reduces DB queries between edits |
| **Organizer session** | 30 days | Manual logout | Sliding window: renewed on each request; inactive timeout after 30 days |
| **Player magic link** | 24-48 hours | One-time use | Consumed on login; single-use security token |
| **Frontend: app bundles** | 1 year | Content hash | Immutable files (content-hashed); safe indefinite cache |
| **Frontend: index.html** | 1 day or no-cache | Never | Entry point; short TTL forces users to check for app updates |

**Cache Invalidation Safety:**

- **Explicit invalidation**: DELETE cache key when data changes (prevents stale data)
- **TTL safety net**: If invalidation fails or is delayed, cache automatically expires
- **Example**: Group standings changes via score submission
  - Async job calculates new standings first (old cache serves queries during this window)
  - Deletes old cache
  - Stores with 1-hour TTL
  - If delete/set fails, old cache serves data until next recalculation
  - If new score arrives within 1 hour, consolidates into one calculation (jobId prevents duplicates)

**What's NOT cached:**

- Tournament config queries (cheap, infrequent enough)
- Player-specific data (per-user, hard to invalidate)
- Real-time data (WebSocket updates provide freshness)
- Auth tokens beyond session storage (validation needed)

### Scaling & Performance

**Auto-Scaling:**
- Lambda: Automatically scales from 0 to 1000s of concurrent instances
- API Gateway WebSocket: Automatically scales to handle connection load
- RDS: Single instance (free tier); scales vertically if needed in v2
- Redis: Single instance; scales to larger tier if needed in v2

**Cold Starts:**
- Lambda functions have ~1-5 second cold start (acceptable for v1)
- Not a major concern for background jobs (BullMQ workers)
- Can optimize in v2 if needed (provisioned concurrency, code optimization)

**Database Performance:**
- RDS free tier: burstable performance, adequate for v1
- No special indexes needed for small data volume
- As data grows, add indexes on frequently queried columns (match_id, player_id, tournament_id)

### Database Connection Pooling Strategy

#### Why Connection Pooling Matters for Lambda

**The Problem Without Pooling:**
- Each Lambda invocation creates a new PostgreSQL connection
- Connection setup overhead: 100-500ms (TCP handshake + authentication + initialization)
- At scale (10K+ concurrent requests), connection overhead becomes the bottleneck, not query performance
- RDS has max connection limits (~100 by default); without pooling, connection exhaustion happens quickly

**Example: Score Submission During Active Tournament**
```
Scenario: 500 players submit scores simultaneously (group stage finale)
└─ 500 Lambda invocations created
   └─ Without pooling: 500 new connections requested
      └─ RDS connection limit exceeded (default ~100)
      └─ Cascading failures, timeouts

With pooling: 500 invocations reuse pool of 20-50 connections
└─ All requests succeed, response time <100ms
```

#### v1 Strategy: No Connection Pooling (Closed Beta)

**Configuration:**
- Direct Lambda → RDS connections (no intermediary)
- Accept connection churn during beta
- RDS max connections: 100-200 (free tier can handle this)

**Rationale:**
- Closed beta: 3-5 organizers, limited concurrent users
- Peak concurrent users: ~50-200 during active tournaments
- Peak concurrent Lambda invocations: ~100-200 (acceptable for RDS)
- Cost savings: No RDS Proxy charges during beta
- Simplicity: One fewer component to configure/monitor
- Risk: Acceptable in closed beta; if connection limits hit, it's a signal to upgrade to v2 strategy

**When v1 Hits Connection Limits:**
- RDS will log "too many connections" errors
- Lambda functions will receive "unable to acquire connection" errors
- Automatic retry logic in BullMQ jobs will kick in, but user experience degrades
- **Action:** This is the signal to add connection pooling (upgrade to v2 strategy)

**v1 Architecture:**
```
Lambda Functions (stateless)
    ├─ Creates new connection per invocation
    └─ Closes connection after completion
            ↓
        RDS PostgreSQL
            └─ Max ~100-200 concurrent connections
            └─ Connection churn during active tournaments (acceptable for beta scale)
```

#### v2 Strategy: Add AWS RDS Proxy (Public Launch)

**When to Implement:** Before scaling beyond closed beta (before public launch)

**Configuration:**
```
AWS RDS Proxy:
├─ Pool mode: transaction (stateless Lambda functions)
├─ max_client_conn: 300-500 (Lambda-side limit)
├─ default_pool_size: 20-50 (RDS-side connection pool)
├─ min_pool_size: 10
├─ reserve_pool_size: 5 (overflow)
└─ connection_borrow_timeout: 120s
```

**v2 Architecture:**
```
Lambda Functions (stateless)
    ├─ Requests connections from RDS Proxy
    └─ Returns connections to pool after completion
            ↓
        AWS RDS Proxy (managed connection pooler)
            └─ Reuses small pool of connections
            └─ Scales from 0 to 10K+ concurrent Lambda invocations
            ↓
        RDS PostgreSQL
            └─ Always has 20-50 active connections (stable)
            └─ Zero connection exhaustion risk
```

**Benefits of RDS Proxy:**
- ✅ AWS-managed (no infrastructure to maintain)
- ✅ Built for Lambda (understands stateless connections)
- ✅ Automatic failover & HA
- ✅ IAM authentication support
- ✅ Minimal code changes (connection string only)
- ✅ Scales 10K+ concurrent users with 20-50 actual database connections

**Implementation: Change Only Connection String**

v1 connection string:
```
postgresql://user:pass@tournament-db.rds.amazonaws.com:5432/tournament
```

v2 connection string (after RDS Proxy deployed):
```
postgresql://user:pass@tournament-proxy.region.rds.amazonaws.com:6432/tournament
```

No application code changes required.

#### Connection Pooling Decision Tree

```
Current state: Closed beta, <200 concurrent users
    └─ Use: v1 strategy (no pooling)
    └─ Cost: $0
    └─ Complexity: Low
    └─ Risk: Low (acceptable for beta)

Current state: Preparing for public launch, >500 concurrent users expected
    └─ Use: v2 strategy (add RDS Proxy)
    └─ Cost: ~$10-20/month (RDS Proxy charges)
    └─ Complexity: Medium (one-time setup, then transparent)
    └─ Risk: Zero (RDS Proxy is production-grade)

Current state: Hit connection limit errors in v1
    └─ Action: Immediately implement v2 strategy (upgrade)
    └─ Time to fix: ~30 minutes (update connection string, redeploy)
    └─ Severity: High (indicates scalability problem)
```

#### Monitoring Connection Health

**v1 Monitoring (Beta):**
- CloudWatch RDS metrics: `DatabaseConnections` (alert if >80)
- Lambda error logs: search for "too many connections" errors
- Manual check: If concurrent user load >300, consider early upgrade to v2

**v2 Monitoring (RDS Proxy):**
- RDS Proxy metrics:
  - `AvailableConnections`: target >10 (alert if <5)
  - `ClientConnections`: scale with traffic
  - `ClientConnectionsClosed`: watch for abnormal disconnections
  - `QueryDuration`: alert if >5s (indicates blocked connections)
- Set up CloudWatch alarms for connection pool exhaustion
- Dashboard: Track pool utilization over time

### Async Job Queue (BullMQ)

**Queue Architecture:**
- **Single unified queue**: "async-jobs"
- **Multiple job types** in one queue (reduces operational overhead)
- **Backed by Redis**: Uses same Redis instance as cache/sessions
- **Job consolidation**: Prevents duplicate jobs for the same resource

**Job Types:**

| Job Type | Triggered By | Purpose | Example jobId |
|----------|--------------|---------|--------------|
| `recalculate-standings` | Score submitted | Recalculate group standings | `recalc-standings:tourn:123:grp:1` |
| `generate-bracket` | Phase advanced | Generate knockout bracket | `generate-bracket:tourn:123` |
| `send-email` | Various events | Send transactional email | `send-email:magic-link:user:456` |
| `delete-player-data` | Deletion requested | Anonymize/delete player data | `delete-player-data:player:789` |

**Job Consolidation Strategy:**

All jobs use a unique jobId that includes the job type and resource identifiers. This allows checking if a job is already queued even in a unified queue with multiple job types.

**Pattern: `{jobType}:{context}:{resourceId}:{additionalId}`**

Before queueing any job, check if a job with that jobId already exists. If it does (and isn't completed), skip queueing:

```javascript
// Example 1: Recalculate group standings
const jobId = `recalc-standings:tourn:${tournamentId}:grp:${groupId}`;
const existingJob = await asyncQueue.getJob(jobId);
if (!existingJob || existingJob.state === 'completed') {
  await asyncQueue.add('recalculate-standings', 
    { tournamentId, groupId }, 
    { jobId }
  );
}

// Example 2: Generate knockout bracket
const jobId = `generate-bracket:tourn:${tournamentId}`;
const existingJob = await asyncQueue.getJob(jobId);
if (!existingJob || existingJob.state === 'completed') {
  await asyncQueue.add('generate-bracket', 
    { tournamentId }, 
    { jobId }
  );
}

// Example 3: Delete player data
const jobId = `delete-player-data:player:${playerId}`;
const existingJob = await asyncQueue.getJob(jobId);
if (!existingJob || existingJob.state === 'completed') {
  await asyncQueue.add('delete-player-data', 
    { playerId }, 
    { jobId }
  );
}

// Example 4: Publish bracket to players
const jobId = `publish-bracket:tourn:${tournamentId}`;
const existingJob = await asyncQueue.getJob(jobId);
if (!existingJob || existingJob.state === 'completed') {
  await asyncQueue.add('publish-bracket', 
    { tournamentId }, 
    { jobId }
  );
}

// Example 5: Send batch phase-change notifications
const jobId = `notify-phase-change:tourn:${tournamentId}:phase:${phaseName}`;
const existingJob = await asyncQueue.getJob(jobId);
if (!existingJob || existingJob.state === 'completed') {
  await asyncQueue.add('send-phase-notification', 
    { tournamentId, phaseName }, 
    { jobId }
  );
}
```

**Job Types & Consolidation Strategy:**

| Job Type | jobId Pattern | Consolidate? | Rationale |
|----------|--------------|--------------|-----------|
| `recalculate-standings` | `recalc-standings:tourn:X:grp:Y` | ✅ Yes | Multiple score submissions → 1 recalc (includes all scores) |
| `generate-bracket` | `generate-bracket:tourn:X` | ✅ Yes | Phase advance might trigger multiple times; consolidate into 1 generation |
| `publish-bracket` | `publish-bracket:tourn:X` | ✅ Yes | After generation, publishing should consolidate if triggered multiple times |
| `delete-player-data` | `delete-player-data:player:X` | ✅ Yes | Deletion is idempotent; consolidate if requested multiple times |
| `notify-phase-change` | `notify-phase-change:tourn:X:phase:Y` | ✅ Yes | Multiple phase triggers → consolidate all notifications into 1 broadcast |
| `send-email` | `send-email:TYPE:recipient:X` | ❌ No | Transactional (magic link, score confirmation); user may request multiple times if not received |
| `update-schedule` | `update-schedule:tourn:X:grp:Y` | ✅ Yes | If organizer changes timeframe multiple times rapidly, consolidate schedule updates |

**Benefits of consolidation:**
- ✅ Prevents duplicate expensive calculations (standings, brackets)
- ✅ Consolidation happens automatically (job includes all accumulated data/state)
- ✅ Single queue reduces operational complexity
- ✅ Fast lookup (O(1)) even with multiple job types
- ✅ Reduces database load and API calls (one operation instead of many)

**Job Retry Logic:**
- Max attempts: 3
- Backoff strategy: Exponential (2s, 4s, 8s)
- Failed jobs after max retries: Moved to dead-letter queue
- Monitoring: CloudWatch alert on dead-letter queue growth

**Cache Invalidation (NOT queued):**

Cache invalidation is done **inline** in Lambda functions and async jobs, not queued.

**Pattern: RECALCULATE → DELETE → SET**

This ordering avoids "cache stampede" (multiple requests all recalculating when cache is empty):

```javascript
// Inline invalidation in async job (recalculation)
async function recalculateStandings(tournamentId, groupId) {
  // 1. RECALCULATE FIRST (expensive operation)
  // Old cache still serves queries during this window (safe)
  const standings = await calculateStandings(tournamentId, groupId);
  
  // 2. DELETE old cache (fast, Redis only)
  await redis.del(`standings:${tournamentId}:${groupId}`);
  
  // 3. SET new cache (fast, Redis only)
  await redis.setex(`standings:${tournamentId}:${groupId}`, 3600, JSON.stringify(standings));
}

// Inline invalidation in sync Lambda (lightweight updates)
async function editTournament(tournamentId, data) {
  // For lightweight operations, DELETE + SET are close enough
  // to be considered atomic from a user perspective
  
  // Delete tournament config cache
  await redis.del(`tournament:${tournamentId}`);
  
  // Update database
  await db.updateTournament(tournamentId, data);
  
  return { status: 'accepted' };
}
```

**Why this pattern:**
- **Avoids cache stampede**: Old cache serves queries while new data is computed (no thundering herd)
- **Minimal cache gap**: DELETE and SET are Redis-only ops (milliseconds), not database queries
- **Safe staleness**: Queries get old data while new is being computed; doesn't cause duplicate work
- **Simple to debug**: Cache operations are inline, not hidden in queues

### Deployment & Operations

**Version Control & CI/CD:**
- Single Lambda function deployed per endpoint (or monolithic handler)
- Infrastructure as Code: AWS SAM or Terraform for Lambda, API Gateway, RDS setup
- Automated deployment on git push (GitHub Actions or similar)

**Monitoring & Logging:**
- CloudWatch Logs: All Lambda errors and debug logs
- CloudWatch Alarms: Alert on Lambda errors, high latency, BullMQ dead-letter queue growth
- BullMQ Monitoring: Track queue depth, job success/failure rates
- No persistent application logs needed (CloudWatch is sufficient for v1)

**Backup & Disaster Recovery:**
- RDS automated backups (included with free tier)
- Redis data: ephemeral (okay for sessions and queue), not critical
- v2: Implement formal backup strategy if needed

### No-Server Maintenance Benefits

✅ **What you don't maintain:**
- Server patches and updates
- Container orchestration
- Database server administration
- Load balancers
- Auto-scaling configuration
- SSL certificates

✅ **What AWS maintains:**
- Lambda runtime and security
- RDS backup and failover
- API Gateway uptime
- WebSocket infrastructure
- All infrastructure scaling

## Database Queries & Indexing Strategy

This section identifies strategic queries that require indexing to meet performance and scalability requirements. Indexes are prioritized by frequency of access, computational cost, and impact on user experience.

### Query Access Patterns & Suggested Indexes

#### P0 — Critical Path (Accessed on every interaction)

**Query 1: Player's Match List**
```sql
SELECT * FROM matches 
WHERE (player1_id = ? OR player2_id = ?) 
  AND tournament_id = ?
  AND status IN ('pending', 'completed')
ORDER BY scheduled_at DESC;
```
| Property | Value |
|----------|-------|
| **Frequency** | Every player login, constant refresh |
| **Justification** | Players frequently check upcoming matches and past results; without indexes requires full table scan or expensive OR condition |
| **Suggested Indexes** | `(player1_id, tournament_id, status)` and `(player2_id, tournament_id, status)` |

---

**Query 2: Group Standings Calculation**
```sql
SELECT p.id, p.name,
  COUNT(CASE WHEN winner_id = p.id THEN 1 END) as wins,
  SUM(sets_won) as total_sets
FROM matches m
JOIN players p ON (m.player1_id = p.id OR m.player2_id = p.id)
WHERE m.group_id = ? 
  AND m.status = 'completed'
GROUP BY p.id
ORDER BY wins DESC, total_sets DESC;
```
| Property | Value |
|----------|-------|
| **Frequency** | After every score submission (BullMQ async job); accessed on every player page refresh |
| **Justification** | Expensive aggregation across potentially 50+ matches; executed frequently (every score triggers recalculation) and accessed constantly by all players in group |
| **Suggested Indexes** | `(group_id, status)` on matches; `(tournament_id, group_id)` on players_in_group |
| **Additional Note** | Candidate for materialized view refresh (see caching strategy section), but Redis caching with TTL is preferred to maintain real-time updates via WebSocket |

---

**Query 3: All Matches in a Group (Group Schedule)**
```sql
SELECT * FROM matches 
WHERE group_id = ? 
  AND round = ?
ORDER BY scheduled_at;
```
| Property | Value |
|----------|-------|
| **Frequency** | All players in group view schedule repeatedly; organizer displays on dashboard |
| **Justification** | Accessed constantly during group stage; without index requires filtering across potentially large matches table |
| **Suggested Indexes** | `(group_id, round, status)` |

---

#### P1 — High Frequency (Accessed regularly, moderate computation)

**Query 4: Organizer's Tournaments**
```sql
SELECT t.* FROM tournaments t
WHERE t.creator_id = ? 
UNION
SELECT t.* FROM tournaments t
JOIN co_organizers co ON t.id = co.tournament_id
WHERE co.organizer_id = ?
ORDER BY t.created_at DESC;
```
| Property | Value |
|----------|-------|
| **Frequency** | Accessed on organizer login; displayed in organizer dashboard |
| **Justification** | Organizer needs to quickly find active tournaments to manage |
| **Suggested Indexes** | `(creator_id, status)` on tournaments; `(organizer_id, tournament_id)` on co_organizers |

---

**Query 5: Players in a Group (for Standings & Scheduling)**
```sql
SELECT p.* FROM players_in_group pig
JOIN players p ON pig.player_id = p.id
WHERE pig.group_id = ?
  AND pig.status = 'confirmed';
```
| Property | Value |
|----------|-------|
| **Frequency** | Used during standings calculation, match scheduling, and group display |
| **Justification** | Needed to filter confirmed players only; executed for every standings recalculation |
| **Suggested Indexes** | `(group_id, status)` on players_in_group; `(tournament_id, group_id)` on players_in_group for bulk group queries |

---

**Query 6: Registered Players for a Tournament (for Group Distribution & Bracket Seeding)**
```sql
SELECT p.* FROM registrations r
JOIN players p ON r.player_id = p.id
WHERE r.tournament_id = ? 
  AND r.status = 'confirmed'
ORDER BY r.created_at;
```
| Property | Value |
|----------|-------|
| **Frequency** | Executed when organizer creates groups or generates knockout bracket |
| **Justification** | Needed to fetch all confirmed players for distribution algorithm and seeding; used once per phase but filters across potentially 100+ registrations |
| **Suggested Indexes** | `(tournament_id, status)` on registrations; compound index to enable index-only scan |

---

#### P2 — Medium Frequency (Accessed regularly, used during specific workflows)

**Query 7: Knockout Bracket by Tournament**
```sql
SELECT * FROM matches 
WHERE tournament_id = ? 
  AND stage = 'knockout'
ORDER BY round, position;
```
| Property | Value |
|----------|-------|
| **Frequency** | All players view bracket repeatedly during knockout stage; organizer updates seeding before publishing |
| **Justification** | High traffic during knockout phase; organizer may iterate on seeding multiple times |
| **Suggested Indexes** | `(tournament_id, stage, round)` |

---

**Query 8: Head-to-Head Match Lookup (for Tiebreaker Calculation)**
```sql
SELECT * FROM matches 
WHERE group_id = ? 
  AND ((player1_id = ? AND player2_id = ?) 
       OR (player1_id = ? AND player2_id = ?))
  AND status = 'completed';
```
| Property | Value |
|----------|-------|
| **Frequency** | Executed during standings calculation when tiebreaker logic is applied |
| **Justification** | Tight filter on multiple columns; executed potentially dozens of times per group standings recalculation (once per tied pair) |
| **Suggested Indexes** | `(group_id, player1_id, player2_id, status)` composite index for tight filtering and index-only scans |

---

**Query 9: Active Tournaments (Public Listing)**
```sql
SELECT * FROM tournaments 
WHERE status IN ('registration_open', 'group_stage_active', 'knockout_active')
ORDER BY created_at DESC;
```
| Property | Value |
|----------|-------|
| **Frequency** | Public landing page; accessed by potential players browsing tournaments |
| **Justification** | High-traffic public page; filters on status and orders by creation date |
| **Suggested Indexes** | `(status, created_at DESC)` |

---

#### P3 — Lower Frequency (Accessed during specific workflows, lower impact on UX)

**Query 10: Unreported/Unconfirmed Matches (Organizer Dashboard)**
```sql
SELECT * FROM matches 
WHERE tournament_id = ? 
  AND status IN ('unconfirmed', 'unreported')
  AND deadline < now();
```
| Property | Value |
|----------|-------|
| **Frequency** | Organizer reviews pending matches; accessed periodically on dashboard |
| **Justification** | Organizer needs to identify matches that require intervention; filters on status and deadline |
| **Suggested Indexes** | `(tournament_id, status, deadline)` |

---

**Query 11: Score History for a Match**
```sql
SELECT * FROM scores 
WHERE match_id = ? 
ORDER BY created_at DESC;
```
| Property | Value |
|----------|-------|
| **Frequency** | Accessed when reviewing score submission history; relatively low frequency |
| **Justification** | Prevents duplicate submissions; players/organizers review who submitted score and when |
| **Suggested Indexes** | Index already exists via foreign key (`match_id`); may benefit from `(match_id, created_at DESC)` for sorting efficiency |

---

**Query 12: Pending Team Confirmations (Doubles Tournaments)**
```sql
SELECT * FROM teams 
WHERE tournament_id = ? 
  AND status = 'pending_confirmation'
  AND confirmation_deadline > now();
```
| Property | Value |
|----------|-------|
| **Frequency** | System check before advancing from registration phase; accessed by organizer |
| **Justification** | Must find all unconfirmed teams before closing registration; deadline-driven logic |
| **Suggested Indexes** | `(tournament_id, status, confirmation_deadline)` |

---

### Index Priority & Implementation Order

| Priority | Index | Table | Reason | Implementation Timing |
|----------|-------|-------|--------|----------------------|
| **P0** | `(player1_id, tournament_id, status)` | matches | Player match list query | v1 launch |
| **P0** | `(player2_id, tournament_id, status)` | matches | Player match list query | v1 launch |
| **P0** | `(group_id, status)` | matches | Standings calculation | v1 launch |
| **P0** | `(tournament_id, group_id)` | players_in_group | Standings calculation | v1 launch |
| **P1** | `(creator_id, status)` | tournaments | Organizer dashboard | v1 launch |
| **P1** | `(organizer_id, tournament_id)` | co_organizers | Co-organizer lookup | v1 launch |
| **P1** | `(group_id, status)` | players_in_group | Group players lookup | v1 launch |
| **P1** | `(group_id, round, status)` | matches | Group schedule display | v1 launch |
| **P2** | `(tournament_id, stage, round)` | matches | Knockout bracket | Before knockout stage |
| **P2** | `(tournament_id, status)` | registrations | Group distribution & bracket seeding | Before group/knockout phases |
| **P2** | `(group_id, player1_id, player2_id, status)` | matches | Head-to-head tiebreaker | v1 launch (or post-launch if storage is concern) |
| **P3** | `(status, created_at DESC)` | tournaments | Public listing | v1 launch or post-launch |
| **P3** | `(tournament_id, status, deadline)` | matches | Unreported matches | Before/during group stage |
| **P3** | `(match_id, created_at DESC)` | scores | Score history sorting | Post-launch optimization |
| **P3** | `(tournament_id, status, confirmation_deadline)` | teams | Pending confirmations | v1 launch for doubles |

### Indexing Best Practices

**Composite Index Strategy:**
- Use composite indexes (multi-column) for common filter+join patterns to enable **index-only scans** where possible
- Example: `(group_id, status)` is better than separate `(group_id)` and `(status)` indexes because it can satisfy filtering on both columns in a single index lookup

**Avoid:**
- Indexes on low-cardinality columns alone (e.g., just `status` without grouping column)
- Redundant indexes (e.g., both `(player_id, tournament_id)` and `(player_id)`)
- Overly wide indexes that consume memory without proportional query benefit

**Maintenance Considerations:**
- Indexes improve read performance but add write overhead (INSERT/UPDATE/DELETE on indexed tables)
- Trade-off is favorable for this application: reads far exceed writes during active tournaments
- Monitor index fragmentation in v2; periodic REINDEX may be needed

### Query Performance Monitoring

**Metrics to track (v2):**
- Query execution time for P0 queries (target: <100ms)
- Index hit ratio (target: >95% for indexed queries)
- Slow query log alerts (queries >500ms)
- Index usage statistics (drop unused indexes)

**Tools:**
- PostgreSQL `EXPLAIN ANALYZE` for query plans
- CloudWatch Performance Insights (if using AWS RDS Enhanced Monitoring)
- Custom application metrics via Lambda logs

## API Design

### API Conventions

**Base URL:**
```
Production: https://api.tournament.app/v1
Beta: https://beta-api.tournament.app/v1
```

**HTTP Methods:**
- `GET` — Retrieve data (idempotent)
- `POST` — Create resource or perform action
- `PATCH` — Update resource (partial)
- `DELETE` — Delete resource

**Response Format:**
All responses are JSON:
```json
{
  "success": true,
  "data": { /* response data */ },
  "error": null
}
```

Error response:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid score format",
    "details": { "field": "score", "reason": "Expected pattern X-Y, X-Y" }
  }
}
```

**Status Codes:**
| Code | Meaning | Use Case |
|------|---------|----------|
| 200 | OK | Successful GET, synchronous responses |
| 201 | Created | Resource created (POST) |
| 202 | Accepted | Async job queued, will process in background |
| 400 | Bad Request | Invalid input, validation failed |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but not authorized (e.g., not tournament creator) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource state conflict (e.g., tournament already started) |
| 422 | Unprocessable | Request understood but contains logic errors (e.g., trying to advance phase with pending matches) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected server error |
| 503 | Service Unavailable | Database/cache down, temporary outage |

**Async Pattern:**
For operations that trigger background jobs (score submissions, standings recalculations), endpoints return 202 Accepted with a job ID:

```json
{
  "success": true,
  "data": {
    "jobId": "recalc-standings:tourn:123:grp:5",
    "status": "processing",
    "message": "Calculating standings, should complete in <5s"
  }
}
```

Client can poll job status via WebSocket or optional polling endpoint.

**Pagination:**
For list endpoints, use offset/limit:
```
GET /tournaments?offset=0&limit=20
```

Response includes pagination metadata:
```json
{
  "success": true,
  "data": [ /* items */ ],
  "pagination": {
    "offset": 0,
    "limit": 20,
    "total": 150,
    "hasMore": true
  }
}
```

---

### Authentication & Authorization

**Organizer Authentication (Email + Password + 2FA)**

1. **Register/Create Account:**
```
POST /auth/register
Content-Type: application/json

{
  "email": "organizer@example.com",
  "password": "SecurePassword123!",
  "name": "John Organizer"
}

Response (201 Created):
{
  "success": true,
  "data": {
    "organizerId": "org_abc123",
    "email": "organizer@example.com",
    "name": "John Organizer",
    "requiresTwoFA": true,
    "message": "2FA setup required. Check your email for setup code."
  }
}
```

2. **Login:**
```
POST /auth/login
Content-Type: application/json

{
  "email": "organizer@example.com",
  "password": "SecurePassword123!"
}

Response (200 OK):
{
  "success": true,
  "data": {
    "organizerId": "org_abc123",
    "email": "organizer@example.com",
    "requiresTwoFAVerification": true,
    "message": "2FA code sent to email"
  }
}
```

3. **Verify 2FA Code:**
```
POST /auth/2fa/verify
Content-Type: application/json

{
  "email": "organizer@example.com",
  "code": "123456"
}

Response (200 OK):
{
  "success": true,
  "data": {
    "sessionToken": "sess_xyz789",
    "expiresIn": 2592000, /* 30 days in seconds */
    "organizerId": "org_abc123"
  }
}
```

**Organizer Session:** 
- Stored in Redis with 30-day TTL
- Header: `Authorization: Bearer sess_xyz789`
- Renewed on each request (sliding window)

**Player Authentication (Magic Link - Passwordless)**

1. **Request Magic Link:**
```
POST /tournaments/:tournamentId/auth/magic-link
Content-Type: application/json

{
  "email": "player@example.com",
  "name": "Jane Player"
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "message": "Magic link sent to player@example.com",
    "expiresIn": 86400 /* 24 hours */
  }
}
```

2. **Verify Magic Link:**
```
GET /tournaments/:tournamentId/auth/verify?token=magic_abc123def456

Response (200 OK):
{
  "success": true,
  "data": {
    "playerToken": "player_xyz789",
    "expiresIn": 86400,
    "playerId": "player_123",
    "tournamentId": "tourn_456"
  }
}
```

**Player Session:**
- Stored in Redis with 24-hour TTL
- Header: `Authorization: Bearer player_xyz789`
- Single-use token per tournament registration
- Not renewable (security boundary)

---

### Organizer Endpoints

#### Tournament Management

**Create Tournament:**
```
POST /tournaments
Authorization: Bearer sess_xyz789
Content-Type: application/json

{
  "name": "Spring Tennis Championship 2026",
  "sport": "tennis",
  "format": "singles", /* or "doubles" */
  "maxPlayers": 64,
  "description": "Open tournament for intermediate players",
  "registrationDeadline": "2026-05-20T23:59:59Z",
  "groupStageDeadline": "2026-06-15T23:59:59Z",
  "knockoutStageDeadline": "2026-06-30T23:59:59Z"
}

Response (201 Created):
{
  "success": true,
  "data": {
    "tournamentId": "tourn_abc123",
    "name": "Spring Tennis Championship 2026",
    "status": "draft",
    "createdBy": "org_abc123",
    "publicUrl": "https://tournament.app/tournaments/tourn_abc123",
    "shareUrl": "https://tournament.app/register/tourn_abc123"
  }
}
```

**Publish Tournament (Open Registration):**
```
POST /tournaments/:tournamentId/publish
Authorization: Bearer sess_xyz789

Response (200 OK):
{
  "success": true,
  "data": {
    "tournamentId": "tourn_abc123",
    "status": "registration_open",
    "message": "Tournament is now live and accepting registrations"
  }
}
```

**Update Tournament:**
```
PATCH /tournaments/:tournamentId
Authorization: Bearer sess_xyz789
Content-Type: application/json

{
  "registrationDeadline": "2026-05-25T23:59:59Z",
  "groupStageDeadline": "2026-06-20T23:59:59Z"
}

Response (200 OK):
{
  "success": true,
  "data": { /* updated tournament */ }
}
```

**Get My Tournaments:**
```
GET /organizer/tournaments?status=active&offset=0&limit=10
Authorization: Bearer sess_xyz789

Response (200 OK):
{
  "success": true,
  "data": [ /* array of tournaments */ ],
  "pagination": { /* pagination metadata */ }
}
```

---

#### Group Management

**Create Groups (Distribute Players):**
```
POST /tournaments/:tournamentId/groups
Authorization: Bearer sess_xyz789
Content-Type: application/json

{
  "numGroups": 4,
  "advancingPerGroup": 2
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "group-distribution:tourn:abc123",
    "status": "processing",
    "message": "Distributing 32 players into 4 groups..."
  }
}
```

**Get Groups for Tournament:**
```
GET /tournaments/:tournamentId/groups
Authorization: Bearer sess_xyz789

Response (200 OK):
{
  "success": true,
  "data": [
    {
      "groupId": "grp_1",
      "name": "Group A",
      "players": [
        { "playerId": "p1", "name": "Alice", "status": "active" },
        { "playerId": "p2", "name": "Bob", "status": "active" }
      ],
      "matchesTotal": 1,
      "matchesCompleted": 0,
      "standings": [ /* standings data */ ]
    }
  ]
}
```

**Get Group Standings:**
```
GET /tournaments/:tournamentId/groups/:groupId/standings
Authorization: Bearer sess_xyz789

Response (200 OK):
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "playerId": "p1",
      "name": "Alice",
      "wins": 3,
      "losses": 0,
      "setWon": 6,
      "setLost": 1
    },
    {
      "rank": 2,
      "playerId": "p2",
      "name": "Bob",
      "wins": 2,
      "losses": 1,
      "setWon": 5,
      "setLost": 2
    }
  ]
}
```

---

#### Match Management

**Get Unreported Matches (Organizer Dashboard):**
```
GET /tournaments/:tournamentId/matches?status=unreported&stage=group
Authorization: Bearer sess_xyz789

Response (200 OK):
{
  "success": true,
  "data": [
    {
      "matchId": "match_123",
      "groupId": "grp_1",
      "player1": { "playerId": "p1", "name": "Alice" },
      "player2": { "playerId": "p2", "name": "Bob" },
      "scheduledAt": "2026-05-15T18:00:00Z",
      "status": "unreported",
      "deadline": "2026-05-16T23:59:59Z",
      "deadlineExceeded": true
    }
  ]
}
```

**Override Score (Organizer):**
```
POST /tournaments/:tournamentId/matches/:matchId/override-score
Authorization: Bearer sess_xyz789
Content-Type: application/json

{
  "score": "6-4, 6-3",
  "reason": "Corrected data entry error; verified with both players"
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "override-score:match:123",
    "status": "processing",
    "message": "Score override queued, standings will update"
  }
}
```

---

#### Knockout Bracket Management

**Generate Knockout Bracket:**
```
POST /tournaments/:tournamentId/bracket/generate
Authorization: Bearer sess_xyz789
Content-Type: application/json

{
  "advancingPlayers": [
    { "playerId": "p1", "rank": 1, "groupId": "grp_1" },
    { "playerId": "p2", "rank": 2, "groupId": "grp_1" },
    /* ... more advancing players ... */
  ]
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "generate-bracket:tourn:abc123",
    "status": "processing"
  }
}
```

**Get Bracket (Organizer - For Review & Seeding):**
```
GET /tournaments/:tournamentId/bracket?view=organizer
Authorization: Bearer sess_xyz789

Response (200 OK):
{
  "success": true,
  "data": {
    "bracketId": "bracket_1",
    "tournamentId": "tourn_abc123",
    "status": "draft", /* draft, published */
    "rounds": [
      {
        "roundNumber": 1,
        "matches": [
          {
            "matchId": "match_1",
            "position": 1,
            "player1": { "playerId": "p1", "name": "Alice", "seeding": 1, "bye": false },
            "player2": { "playerId": "p2", "name": "Bob", "seeding": 4, "bye": false },
            "status": "pending"
          }
        ]
      }
    ]
  }
}
```

**Update Bracket Seeding (Organizer):**
```
PATCH /tournaments/:tournamentId/bracket
Authorization: Bearer sess_xyz789
Content-Type: application/json

{
  "adjustments": [
    {
      "matchId": "match_5",
      "newPlayer1Id": "p10",
      "newPlayer2Id": "p7"
    }
  ]
}

Response (200 OK):
{
  "success": true,
  "data": { /* updated bracket */ }
}
```

**Publish Bracket (Make Visible to Players):**
```
POST /tournaments/:tournamentId/bracket/publish
Authorization: Bearer sess_xyz789

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "publish-bracket:tourn:abc123",
    "status": "processing",
    "message": "Publishing bracket and notifying players..."
  }
}
```

---

#### Tournament Phase Control

**Advance Tournament Phase:**
```
POST /tournaments/:tournamentId/phases/advance
Authorization: Bearer sess_xyz789
Content-Type: application/json

{
  "to": "knockout_active"
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "advance-phase:tourn:abc123",
    "newPhase": "knockout_active",
    "message": "Advancing to knockout stage, notifying players..."
  }
}
```

---

### Player Endpoints

#### Tournament Discovery & Registration

**Get Public Tournaments:**
```
GET /tournaments/public?sport=tennis&offset=0&limit=10

Response (200 OK):
{
  "success": true,
  "data": [
    {
      "tournamentId": "tourn_abc123",
      "name": "Spring Tennis Championship 2026",
      "sport": "tennis",
      "format": "singles",
      "registeredPlayers": 32,
      "maxPlayers": 64,
      "registrationDeadline": "2026-05-20T23:59:59Z",
      "status": "registration_open"
    }
  ],
  "pagination": { /* pagination metadata */ }
}
```

**Register for Tournament:**
```
POST /tournaments/:tournamentId/register
Content-Type: application/json

{
  "email": "player@example.com",
  "name": "Jane Player",
  "phone": "+1-555-0123",
  "preferredContact": "email"
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "message": "Registration email sent to player@example.com",
    "magicLinkExpires": 86400
  }
}
```

---

#### Player Dashboard

**Get My Tournaments (Player):**
```
GET /player/tournaments
Authorization: Bearer player_xyz789

Response (200 OK):
{
  "success": true,
  "data": [
    {
      "tournamentId": "tourn_abc123",
      "name": "Spring Tennis Championship 2026",
      "status": "group_stage_active",
      "myMatches": 5,
      "myMatcesCompleted": 3,
      "groupId": "grp_1",
      "groupRank": 1
    }
  ]
}
```

**Get My Upcoming Matches:**
```
GET /tournaments/:tournamentId/my-matches
Authorization: Bearer player_xyz789

Response (200 OK):
{
  "success": true,
  "data": [
    {
      "matchId": "match_123",
      "opponent": { "playerId": "p2", "name": "Bob" },
      "stage": "group",
      "groupId": "grp_1",
      "status": "pending",
      "scheduledAt": null,
      "deadline": "2026-05-16T23:59:59Z",
      "actions": ["schedule", "report_score"]
    }
  ]
}
```

**Get Tournament Standings (Player):**
```
GET /tournaments/:tournamentId/standings
Authorization: Bearer player_xyz789

Response (200 OK):
{
  "success": true,
  "data": {
    "groupId": "grp_1",
    "standings": [
      {
        "rank": 1,
        "playerId": "p1",
        "name": "Alice",
        "wins": 3,
        "losses": 0,
        "setWon": 6,
        "setLost": 1,
        "isMe": true
      }
    ]
  }
}
```

---

#### Match Coordination & Scoring

**Confirm Match Time:**
```
POST /tournaments/:tournamentId/matches/:matchId/confirm-time
Authorization: Bearer player_xyz789
Content-Type: application/json

{
  "confirmedAt": "2026-05-15T18:00:00Z"
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "matchId": "match_123",
    "status": "confirmed",
    "message": "Match time confirmed. Opponent will be notified."
  }
}
```

**Submit Score:**
```
POST /tournaments/:tournamentId/matches/:matchId/submit-score
Authorization: Bearer player_xyz789
Content-Type: application/json

{
  "score": "6-4, 6-3"
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "submit-score:match:123:player:p1",
    "status": "processing",
    "message": "Score submitted and will be verified",
    "confirmationRequired": true,
    "parsedScore": {
      "player1": { "set1": 6, "set2": 6 },
      "player2": { "set1": 4, "set2": 3 }
    }
  }
}
```

**Confirm Score Submission:**
```
POST /tournaments/:tournamentId/matches/:matchId/confirm-score
Authorization: Bearer player_xyz789
Content-Type: application/json

{
  "submissionId": "score_submit_123"
}

Response (200 OK):
{
  "success": true,
  "data": {
    "matchId": "match_123",
    "score": "6-4, 6-3",
    "submittedBy": "p1",
    "submittedAt": "2026-05-15T20:30:00Z"
  }
}
```

**Claim Walkover (No-Show):**
```
POST /tournaments/:tournamentId/matches/:matchId/claim-walkover
Authorization: Bearer player_xyz789
Content-Type: application/json

{
  "reason": "Opponent did not show up at scheduled time"
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "walkover-claim:match:123",
    "status": "processing",
    "message": "Walkover claim submitted for organizer review"
  }
}
```

**Get Score History:**
```
GET /tournaments/:tournamentId/matches/:matchId/scores
Authorization: Bearer player_xyz789

Response (200 OK):
{
  "success": true,
  "data": [
    {
      "scoreId": "score_1",
      "submittedBy": { "playerId": "p1", "name": "Alice" },
      "score": "6-4, 6-3",
      "submittedAt": "2026-05-15T20:30:00Z",
      "status": "accepted"
    }
  ]
}
```

---

### Public Endpoints

**Get Public Tournament View:**
```
GET /tournaments/:tournamentId/public

Response (200 OK):
{
  "success": true,
  "data": {
    "tournamentId": "tourn_abc123",
    "name": "Spring Tennis Championship 2026",
    "sport": "tennis",
    "format": "singles",
    "status": "group_stage_active",
    "registeredPlayers": 32,
    "results": {
      "groupStage": { /* visible only if completed */ },
      "bracket": { /* visible only if published */ }
    }
  }
}
```

**Get Public Bracket:**
```
GET /tournaments/:tournamentId/bracket/public

Response (200 OK):
{
  "success": true,
  "data": {
    "bracketId": "bracket_1",
    "status": "published",
    "rounds": [
      {
        "roundNumber": 1,
        "matches": [
          {
            "matchId": "match_1",
            "player1": { "name": "Alice" },
            "player2": { "name": "Bob" },
            "score": "6-4, 6-3",
            "winner": "Alice"
          }
        ]
      }
    ]
  }
}
```

---

### WebSocket Real-Time Updates

**Connection:**
```
WS /tournaments/:tournamentId/ws
Authorization: Bearer [organizer_token|player_token]
```

**Messages Sent to Organizer:**
```json
{
  "type": "score_submitted",
  "data": {
    "matchId": "match_123",
    "groupId": "grp_1",
    "player1": { "playerId": "p1", "name": "Alice" },
    "player2": { "playerId": "p2", "name": "Bob" },
    "score": "6-4, 6-3",
    "submittedBy": "p1",
    "submittedAt": "2026-05-15T20:30:00Z"
  }
}
```

```json
{
  "type": "standings_updated",
  "data": {
    "groupId": "grp_1",
    "standings": [ /* updated standings */ ],
    "reason": "score_submitted"
  }
}
```

```json
{
  "type": "player_withdrew",
  "data": {
    "playerId": "p3",
    "name": "Charlie",
    "groupId": "grp_1",
    "timestamp": "2026-05-16T10:00:00Z"
  }
}
```

```json
{
  "type": "phase_advanced",
  "data": {
    "tournamentId": "tourn_abc123",
    "from": "group_stage_active",
    "to": "knockout_active",
    "timestamp": "2026-05-20T00:00:00Z",
    "message": "Group stage complete, knockout bracket now live"
  }
}
```

**Messages Sent to Players:**
```json
{
  "type": "match_scheduled",
  "data": {
    "matchId": "match_123",
    "opponent": { "playerId": "p2", "name": "Bob" },
    "confirmedAt": "2026-05-15T18:00:00Z"
  }
}
```

```json
{
  "type": "score_submitted_to_match",
  "data": {
    "matchId": "match_123",
    "submittedBy": { "playerId": "p2", "name": "Bob" },
    "score": "6-4, 6-3",
    "submittedAt": "2026-05-15T20:30:00Z"
  }
}
```

```json
{
  "type": "standings_updated",
  "data": {
    "standings": [ /* current standings */ ],
    "changedPositions": [1, 2, 3]
  }
}
```

---

### Error Response Examples

**Validation Error:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid score format",
    "details": {
      "field": "score",
      "value": "6-4 6-3",
      "reason": "Expected format: 'X-Y, X-Y' (comma-separated sets)"
    }
  }
}
```

**State Conflict:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "STATE_CONFLICT",
    "message": "Cannot submit score: tournament phase has advanced",
    "details": {
      "tournamentId": "tourn_abc123",
      "currentPhase": "knockout_active",
      "reason": "Group stage is complete, scores are locked"
    }
  }
}
```

**Authorization Error:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not authorized to override this score",
    "details": {
      "tournamentId": "tourn_abc123",
      "requiredRole": "tournament_creator_or_co_organizer"
    }
  }
}
```

---

### Rate Limiting

**Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1715500000
```

**Limits:**
| Endpoint | Limit | Window |
|----------|-------|--------|
| Authentication endpoints | 5 requests | Per IP, per minute |
| Player registration | 10 requests | Per IP, per hour |
| Score submission | 100 requests | Per organizer, per minute |
| General API | 1000 requests | Per user, per minute |
| Public endpoints | 5000 requests | Per IP, per minute |

**When rate limit exceeded:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "retryAfter": 60
  }
}
```

---

### API Summary Table

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auth/register` | POST | None | Organizer signup |
| `/auth/login` | POST | None | Organizer login |
| `/auth/2fa/verify` | POST | None | Verify 2FA code |
| `/tournaments` | POST | Org | Create tournament |
| `/tournaments/:id` | GET | Any | Get tournament details |
| `/tournaments/:id` | PATCH | Org | Update tournament |
| `/tournaments/:id/publish` | POST | Org | Publish tournament |
| `/tournaments/:id/groups` | POST | Org | Create groups |
| `/tournaments/:id/groups/:gid/standings` | GET | Any | Get standings |
| `/tournaments/:id/matches/:mid/submit-score` | POST | Player | Submit score |
| `/tournaments/:id/matches/:mid/override-score` | POST | Org | Override score |
| `/tournaments/:id/bracket/generate` | POST | Org | Generate bracket |
| `/tournaments/:id/bracket/publish` | POST | Org | Publish bracket |
| `/tournaments/:id/phases/advance` | POST | Org | Advance phase |
| `/tournaments/public` | GET | None | List public tournaments |
| `/tournaments/:id/public` | GET | None | Public tournament view |
| `/player/tournaments` | GET | Player | My tournaments |
| `/tournaments/:id/my-matches` | GET | Player | My matches |

## Future Considerations (Not in v1)
- Double-elimination brackets
- Swiss system
- Consolation/secondary brackets
- Detailed sport-specific scoring rules
- Native mobile app (web app already optimized for mobile with responsive design; WebSocket ready for mobile)
- Player ranking/seeding across tournaments (needed for balanced group distribution in v2+)
- Advanced scheduling features (court assignments, time slots for matches)
- Player API/developer access for third-party integrations
- Custom tournament branding per organizer
