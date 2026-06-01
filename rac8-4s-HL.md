# RAC8-4S: Doubles Pickleball Cup Tournament Management System
## High-Level Requirements Document

**Document Version:** 1.0  
**Last Updated:** 2026-05-31  
**Project:** Doubles Pickleball Cup  
**Status:** ✅ Production Ready

---

## Executive Summary

RAC8-4S is a modern, mobile-first web application for managing and participating in doubles pickleball tournaments. The system supports tournament creation, player registration, automated group stage management with real-time standings, knockout bracket generation, and secure user authentication. Built with React 19, Express.js, PostgreSQL, and Server-Sent Events (SSE) for real-time updates.

**Key Achievements:**
- ✅ All 30 authentication tasks completed (JWT + opaque tokens)
- ✅ 2,126 tests passing (87.52% statement coverage)
- ✅ All core tournament features implemented and tested
- ✅ Real-time SSE updates for standings and brackets
- ✅ WCAG 2.1 AA accessibility compliance
- ✅ PWA with offline support via Service Workers
- ✅ Mobile-first responsive design

---

## System Architecture

### High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      React 19 Application                        │  │
│  │  ┌─────────────────┐  ┌──────────────┐  ┌───────────────────┐  │  │
│  │  │  Page Components │  │  Hooks       │  │  State Management │  │  │
│  │  │  - Tournament    │  │  - useAuth   │  │  - TanStack Query │  │  │
│  │  │    Detail        │  │  - useTournament  │  - Custom Stores  │  │  │
│  │  │  - Browse        │  │  - useSSE    │  │  - Local Storage  │  │  │
│  │  │  - Auth Pages    │  │              │  │                   │  │  │
│  │  └─────────────────┘  └──────────────┘  └───────────────────┘  │  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐ │  │
│  │  │         Service Worker (Offline Support)                   │ │  │
│  │  │  - Request caching (cache-first strategy)                  │ │  │
│  │  │  - Background sync for failed submissions                  │ │  │
│  │  │  - Exponential backoff retry (1s, 2s, 4s)                  │ │  │
│  │  └────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  │                REST API + SSE                                       │
│  └─────────────────────────────┬─────────────────────────────────────┘
│                                │
├────────────────────────────────┼──────────────────────────────────────┐
│  │                                                                    │
│  ├─ REST API: JSON/HTTPS                                             │
│  ├─ SSE: Server-Sent Events (persistent HTTP connection)              │
│  └─ WebSocket: (future real-time enhancements)                        │
│                │                                                      │
│                ▼                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Backend Layer (Express.js)                 │  │
│  │  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │  API Routes    │  │  Middleware  │  │  Business Logic  │  │  │
│  │  │  - Auth        │  │  - Auth      │  │  - Standings     │  │  │
│  │  │  - Tournament  │  │  - Logging   │  │  - Bracket Gen   │  │  │
│  │  │  - Player      │  │  - Rate Limit│  │  - Score Parse   │  │  │
│  │  │  - Analytics   │  │  - CORS      │  │  - Validation    │  │  │
│  │  └────────────────┘  └──────────────┘  └──────────────────┘  │  │
│  │                           │                                    │  │
│  │  ┌────────────────────────┼────────────────────────────────┐  │  │
│  │  │         In-Memory Services                             │  │  │
│  │  │  - Broadcast Bus (SSE events)                          │  │  │
│  │  │  - Job Queue (standings, bracket, email)               │  │  │
│  │  │  - Token Store (JWT validation)                        │  │  │
│  │  └────────────────────────┬────────────────────────────────┘  │  │
│  │                           │                                    │  │
│  │  ┌───────────────────────────────────────────────────────┐    │  │
│  │  │    PostgreSQL Database (15+)                         │    │  │
│  │  │  ┌───────────────────────────────────────────────┐   │    │  │
│  │  │  │ Schema: public (tournament data)              │   │    │  │
│  │  │  │ - tournaments, players, groups, matches       │   │    │  │
│  │  │  │ - standings, knockout_matches, user_events    │   │    │  │
│  │  │  │ - locations, courts                           │   │    │  │
│  │  │  │                                               │   │    │  │
│  │  │  │ Schema: auth (authentication)                 │   │    │  │
│  │  │  │ - accounts (email, password_hash, role)       │   │    │  │
│  │  │  │ - password_reset_codes (6-digit codes)        │   │    │  │
│  │  │  └───────────────────────────────────────────────┘   │    │  │
│  │  └───────────────────────────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘

Legend:
└─ → Data flow
↕ → Bidirectional communication
```

---

## System Components

### Frontend Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | React 19 | UI component library |
| **Language** | TypeScript 5.3+ | Type-safe development |
| **State Management** | TanStack Query + Custom Stores | Server & client state |
| **Styling** | Tailwind CSS 4.3 | Utility-first styling |
| **HTTP Client** | Fetch API + React Query | API communication |
| **Real-Time** | SSE (Server-Sent Events) | Live updates |
| **Offline** | Service Workers + IndexedDB | Offline-first PWA |
| **Testing** | Playwright + Jest | E2E & unit tests |
| **Build** | Vite | Fast dev server & bundling |

### Backend Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | Express.js 5.2 | HTTP API server |
| **Language** | TypeScript 5.3+ | Type-safe implementation |
| **Database** | PostgreSQL 15+ | Persistent data storage |
| **Authentication** | JWT + Bcryptjs | Secure user auth |
| **Job Queue** | In-Memory (production: BullMQ) | Async task processing |
| **Real-Time** | SSE (Server-Sent Events) | Push-based updates |
| **Email** | Nodemailer (mock/real adapter) | Transactional emails |
| **Testing** | Jest + Supertest | Unit & integration tests |
| **Logging** | Structured (JSON) + Correlation IDs | Observability |

### Data Persistence

| Storage | Technology | Purpose |
|---------|-----------|---------|
| **Primary** | PostgreSQL 15+ | Persistent application data |
| **Session** | JWT Tokens | Stateless authentication |
| **Cache** | React Query (60s TTL) | Client-side data caching |
| **Offline** | Service Worker Cache + IndexedDB | Offline data storage |

---

## UX Design Flows

### User Journey: Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION USER JOURNEY                      │
└─────────────────────────────────────────────────────────────────────┘

ENTRY POINT: Landing Page
  ↓
┌─ [Sign In] → /login
│   ├─ Email input
│   ├─ Password input
│   ├─ [Sign In] button
│   ├─ "Forgot password?" link → /forgot-password
│   └─ "Need an account?" link → /signup
│
├─ HAPPY PATH: Valid credentials
│   ├─ Email found in database ✓
│   ├─ Password hash matches ✓
│   ├─ JWT token issued ✓
│   ├─ Session cookie set (httpOnly) ✓
│   └─ Redirect → /browse (authenticated)
│
├─ ERROR PATHS:
│   ├─ Email not found → 401 "Invalid email or password"
│   ├─ Password incorrect → 401 "Invalid email or password"
│   ├─ Account locked → 429 "Too many attempts (5 remaining)"
│   └─ Rate limit exceeded → 429 "Try again in 15 minutes"
│
└─ OFFLINE: Queue submission, retry on reconnect
   └─ Show "Offline - will retry" banner

┌─ [Sign Up] → /signup
│   ├─ Email input
│   ├─ Name input (min 2 chars)
│   ├─ Password input (min 6 chars)
│   ├─ Confirm password input
│   ├─ Real-time validation on blur
│   └─ [Create Account] button
│
├─ HAPPY PATH:
│   ├─ Email not already registered ✓
│   ├─ Password >= 6 characters ✓
│   ├─ Passwords match ✓
│   ├─ Account created (hashed password) ✓
│   ├─ JWT token issued ✓
│   └─ Redirect → /browse (authenticated, welcome toast)
│
├─ ERROR PATHS:
│   ├─ Email already in use → 409 "Email already in use"
│   ├─ Password too short → 400 "Password must be at least 6 characters"
│   └─ Passwords don't match → Real-time error below field
│
└─ MAGIC LINK SIGNUP (/signup?token=xxx)
   ├─ Email pre-filled from token
   ├─ Name & password fields
   ├─ Token validated server-side
   ├─ Account created + registered for tournament
   └─ Redirect → tournament view

┌─ [Forgot Password] → /forgot-password
│   ├─ Email input
│   └─ [Send Reset Code] button
│
├─ HAPPY PATH:
│   ├─ 6-digit code generated ✓
│   ├─ Code stored (15-min expiration) ✓
│   ├─ Email sent (mocked/real adapter) ✓
│   ├─ Screen shows: "Check your email for reset code"
│   └─ Show [Enter Code] button → /reset-password
│
├─ ERROR PATH (always returns success for security):
│   └─ Email not found → Still shows "Check your email"
│
└─ RESET PASSWORD → /reset-password
   ├─ Email input
   ├─ 6-digit code input (auto-format: "12 34 56")
   ├─ New password input
   ├─ Confirm password input
   └─ [Update Password] button
   │
   ├─ HAPPY PATH:
   │   ├─ Email found ✓
   │   ├─ Code valid + not expired ✓
   │   ├─ Code not already used ✓
   │   ├─ Password >= 6 characters ✓
   │   ├─ Passwords match ✓
   │   ├─ Password hash updated ✓
   │   ├─ Code marked as used ✓
   │   └─ Redirect → /login (show success message)
   │
   └─ ERROR PATHS:
       ├─ Code invalid → 401 "Invalid reset code"
       ├─ Code expired → 401 "Reset code expired"
       ├─ Too many attempts (5) → 429 "Try again later"
       └─ [Request new code] → /forgot-password
```

### User Journey: Tournament Discovery & Registration

```
┌─────────────────────────────────────────────────────────────────────┐
│              TOURNAMENT DISCOVERY & REGISTRATION FLOW                │
└─────────────────────────────────────────────────────────────────────┘

START: /browse (unauthenticated or authenticated)
  ↓
[Tournament List] (paginated, 20 per page)
├─ Tournament card
│   ├─ Tournament name
│   ├─ Sport (pickleball/tennis), format (singles/doubles)
│   ├─ Max players, registered count
│   ├─ Status badge (draft, open, closed, active, complete)
│   ├─ Registration deadline
│   └─ [View Details] → /tournament/:id/browse
│
├─ Prefetch on hover: Load tournament data before click
├─ Pagination: [← Prev] [1] [2] [3] [Next →]
└─ Filter/sort options (sport, deadline, size)

TOURNAMENT DETAILS PAGE: /tournament/:id/browse
┌──────────────────────────────────────────────────┐
│  Tournament Name                            [←Back]│
│  Sport: Pickleball | Format: Doubles              │
│  Status: Registration Open                        │
│  Deadline: June 15, 2026 at 5:00 PM              │
│  Registered: 12/16 players                        │
├──────────────────────────────────────────────────┤
│  REGISTRATION SECTION (for unauthenticated users) │
│                                                   │
│  [Already have an account? Sign In]               │
│                                                   │
│  OR register with email:                          │
│  Email: [___________________]                     │
│  Name:  [___________________]                     │
│  [Register for Tournament]                        │
├──────────────────────────────────────────────────┤
│  Details | Rules | Venue | Contact               │
└──────────────────────────────────────────────────┘

REGISTRATION FLOW:
├─ User enters: email, name
├─ Backend:
│   ├─ Check deadline not passed (409 if passed)
│   ├─ Check email not registered (409 if exists)
│   ├─ Generate magic link token (24-hour TTL)
│   ├─ Send email with link
│   └─ Return token to frontend
│
├─ User receives email
│   └─ Email contains: "Complete your registration: [LINK]"
│       └─ Link: /signup?token=abc123def456
│
└─ User clicks link → /signup
   ├─ Email pre-filled
   ├─ Name, password, confirm password
   ├─ [Create Account & Register]
   └─ Success → Redirect to /tournament/:id/standings
      (logged in, registered for tournament)
```

### User Journey: Tournament Participation

```
┌─────────────────────────────────────────────────────────────────────┐
│           TOURNAMENT PARTICIPATION & SCORE SUBMISSION FLOW           │
└─────────────────────────────────────────────────────────────────────┘

TOURNAMENT DETAIL PAGE (Authenticated Player)
/tournament/:id/standings
┌────────────────────────────────────────────────────────────────────┐
│  Spring Open 2026                                     [⋯] [👤]      │
├────────────────────────────────────────────────────────────────────┤
│  Status: Group Stage Active                                        │
│  Your Group: Group 1 (4 players)                                   │
│  Deadline: June 22, 2026 at 5:00 PM (3 days left)                  │
├────────────────────────────────────────────────────────────────────┤
│  STANDINGS                                                          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Rank | Name          | Wins | Losses | Sets W | Sets L | +/- │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │  1   | Alice Davis   │  2   │  0     │  4    │  1    │ +3  │  │
│  │  2   | Bob Miller    │  1   │  1     │  3    │  2    │ +1  │  │
│  │  3   | Charlie Smith │  1   │  1     │  3    │  3    │  0  │  │
│  │  4   | Diana Brown   │  0   │  2     │  1    │  4    │ -3  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ⬆ Virtual scrolling for 500+ row tables                           │
│  Real-time updates via SSE (scores update automatically)           │
├────────────────────────────────────────────────────────────────────┤
│  BOTTOM NAVIGATION (Mobile)                                        │
│  [🏠 Standings] [⚔️ Matches] [🏆 Bracket] [ℹ️ Details]            │
└────────────────────────────────────────────────────────────────────┘

MATCHES TAB: /tournament/:id/matches
├─ Your Upcoming Matches
│   ├─ Match Card #1
│   │   ├─ vs. Bob Miller
│   │   ├─ Group 1, Round-Robin
│   │   ├─ Status: Pending
│   │   └─ [Submit Score] button
│   │
│   ├─ Match Card #2
│   │   ├─ vs. Charlie Smith
│   │   ├─ Status: Pending
│   │   └─ [Submit Score] button
│   │
│   ├─ Match Card #3 (Completed)
│   │   ├─ vs. Diana Brown
│   │   ├─ Score: You won 2-1
│   │   ├─ Status: Completed
│   │   └─ [Edit Score] button (organizer only)
│   │
│   └─ [View All Matches in Tournament]

SCORE SUBMISSION MODAL
┌─────────────────────────────────────┐
│  Submit Score                   [X] │
├─────────────────────────────────────┤
│                                     │
│  You vs. Bob Miller                 │
│                                     │
│  Score Format: "X-Y"                │
│  Example: "2-1" (you won 2, he 1)   │
│                                     │
│  Your Sets: [2▼]                    │
│  Their Sets: [1▼]                   │
│                                     │
│  [Submit] [Cancel]                  │
│                                     │
│  Validation (real-time):            │
│  ✓ Score entered                    │
│  ✓ Winner determined                │
│  ✓ Deadline not passed              │
└─────────────────────────────────────┘

SUBMISSION FLOW:
├─ HAPPY PATH:
│  ├─ Score validates (format, range, not tied)
│  ├─ POST /tournaments/:id/matches/:matchId/score
│  ├─ Backend: 202 Accepted (async processing)
│  ├─ Frontend: Show "Score submitted" toast
│  ├─ Match status updates to "Completed"
│  ├─ Standings job triggered (async)
│  └─ SSE event received: standings.updated
│      └─ Standings table re-renders (real-time)
│
├─ OFFLINE SCENARIO:
│  ├─ No network connection
│  ├─ Service Worker intercepts request
│  ├─ Request queued in IndexedDB
│  ├─ Show "Offline - will retry" banner
│  └─ Auto-retry when online (with exponential backoff)
│      ├─ Retry #1: 1s delay
│      ├─ Retry #2: 2s delay
│      ├─ Retry #3: 4s delay
│      └─ Show "Score synced" toast on success
│
└─ ERROR SCENARIOS:
   ├─ Score already submitted: 409 "Match already scored"
   ├─ Deadline passed: 409 "Scoring deadline exceeded"
   ├─ Not a participant: 403 "You're not in this match"
   └─ Invalid format: 400 "Invalid score format"

BRACKET TAB: /tournament/:id/bracket (lazy-loaded)
├─ Status: Group Stage Active (bracket not yet generated)
├─ [Bracket will appear when group stage completes]
│
└─ Once published:
   ├─ BRACKET TREE
   │  └─ Semifinals
   │     ├─ (1) Alice vs (4) Diana    [Pending]
   │     └─ (2) Bob vs (3) Charlie    [Pending]
   │
   ├─ Finals
   │  └─ Winner A vs Winner B         [Pending]
   │
   └─ Real-time updates via SSE
      └─ Match scores and bracket structure update live
```

### Mobile Layout Flow

```
┌─────────────────────────────────┐
│       MOBILE LAYOUT             │
│  (320px - 640px width)          │
└─────────────────────────────────┘

Full-Screen Pages (Stack vertically)
═══════════════════════════════════

[Header with title and menu]
┌─────────────────────────────────┐
│ ← Tournament Name         ⋯ 👤   │
└─────────────────────────────────┘

[Main Content Area - Single Column]
┌─────────────────────────────────┐
│                                 │
│  Tournament Details Card        │
│  - Scrollable, full width       │
│  - Padding: 16px left/right     │
│                                 │
│  Standings Table (Virtualized)  │
│  - Horizontal scroll if needed  │
│  - Rank | Name | Wins | Loss    │
│  - Touch-friendly row height    │
│                                 │
│  Score Submission Card          │
│  - Full width                   │
│  - Large tap targets (48px)     │
│                                 │
└─────────────────────────────────┘

[Bottom Tab Navigation - Fixed]
┌─────────────────────────────────┐
│ 🏠      ⚔️      🏆      ℹ️      │
│Standings Matches Bracket Details│
└─────────────────────────────────┘

Tab Interaction:
├─ Active tab: Highlighted, bold
├─ Inactive tabs: Grayed out, tappable
├─ Swiping: Swipe left/right to switch tabs
└─ No scroll on page (tabs are navigation)

Form Layout (Full Width)
═══════════════════════════════════

[Sign Up Page Example]
┌─────────────────────────────────┐
│  Create Account              [X]│
├─────────────────────────────────┤
│                                 │
│  Email                          │
│  [_____________________________] │
│  Invalid email format           │ ← Error (red)
│                                 │
│  Name                           │
│  [_____________________________] │
│  Min 2 characters               │ ← Helper text
│                                 │
│  Password                       │
│  [_____________________________] │
│  [👁] Show password             │
│  Min 6 characters               │
│                                 │
│  Confirm Password               │
│  [_____________________________] │
│  ✓ Passwords match              │ ← Success (green)
│                                 │
│  [Create Account ▶] (full width)│
│  [Cancel]                       │
│                                 │
└─────────────────────────────────┘

Button Sizing:
├─ Min height: 48px (touch target)
├─ Padding: 16px vertical, 32px horizontal
├─ Full width on mobile forms
└─ Stack vertically (not side-by-side)
```

### Real-Time Update Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│               REAL-TIME SSE UPDATE FLOW                              │
└─────────────────────────────────────────────────────────────────────┘

Initialization:
1. User navigates to /tournament/:id/standings
2. useSSE(tournamentId) hook runs
3. Opens EventSource connection: GET /tournaments/:id/events
4. Subscribes to: standings.updated, bracket.published, match.updated

Score Submission Event:
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│ User submits score: "2-1"                                          │
│   ↓                                                                 │
│ POST /tournaments/:id/matches/:matchId/score                       │
│   ↓                                                                 │
│ Backend: 202 Accepted (async job)                                  │
│   ├─ Store score in database                                       │
│   ├─ Enqueue: standings.recalculate (dedup by groupId)            │
│   └─ Return immediately                                            │
│   ↓                                                                 │
│ Job Queue Processing (background):                                 │
│   ├─ Recalculate standings for group                               │
│   ├─ Determine rankings with tiebreakers                           │
│   ├─ Update group_standings table                                  │
│   └─ Emit SSE event: standings.updated                             │
│   ↓                                                                 │
│ BroadcastBus:                                                      │
│   ├─ Find all SSE connections for tournament                       │
│   ├─ Send event to each connection:                                │
│   │  "event: standings.updated\n"                                  │
│   │  "data: { groupId, standings: [...] }\n\n"                    │
│   └─ Multiple subscribers receive simultaneously                   │
│   ↓                                                                 │
│ Frontend SSE Handler:                                              │
│   ├─ EventSource onmessage listener triggered                      │
│   ├─ Parse event: { groupId, standings: [...] }                   │
│   ├─ Dispatch to standingsStore.update(payload)                   │
│   └─ Component re-renders with new standings (auto)               │
│   ↓                                                                 │
│ UI Update:                                                          │
│   ├─ Standings table rows animate (highlight changed rows)        │
│   ├─ Rank positions update                                         │
│   ├─ Set counts and differential recalculated                      │
│   └─ User sees live standings (latency ~100ms)                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

Multi-User Scenario (Real-Time):
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│ Time: 2:00 PM                                                      │
│                                                                    │
│ Alice: Opens tournament standings                                   │
│   └─ SSE connection established                                    │
│                                                                    │
│ Bob: Opens same tournament                                          │
│   └─ SSE connection established                                    │
│                                                                    │
│ Time: 2:05 PM                                                      │
│ Charlie: Submits score "2-0"                                        │
│   └─ Backend triggers standings recalculation                      │
│   └─ Broadcasts standings.updated event                            │
│                                                                    │
│ Result: Both Alice AND Bob receive event immediately               │
│   ├─ Alice's standings table updates (live)                        │
│   ├─ Bob's standings table updates (live)                          │
│   └─ Both see identical standings within 100ms                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Error Handling & Recovery Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│               ERROR HANDLING & RECOVERY FLOW                         │
└─────────────────────────────────────────────────────────────────────┘

Offline Scenario:
┌────────────────────────────────────┐
│  User Submits Score                │
├────────────────────────────────────┤
│ Network is offline                 │
│   ↓                                 │
│ Service Worker intercepts request  │
│   ├─ Queue request in IndexedDB    │
│   └─ Return queued response        │
│   ↓                                 │
│ Frontend shows banner:              │
│ "📱 Offline - will retry"           │
│   ↓                                 │
│ Browser comes online                │
│   ↓                                 │
│ Service Worker detects connection   │
│   ├─ Retry #1: 1s delay             │
│   │  └─ If fails, wait 2s           │
│   │                                 │
│   ├─ Retry #2: 2s delay             │
│   │  └─ If fails, wait 4s           │
│   │                                 │
│   ├─ Retry #3: 4s delay             │
│   │  └─ If fails, show persistent   │
│   │     error with manual retry     │
│   │                                 │
│   └─ On success: Show "✓ Synced"   │
│                                     │
│ All queued requests processed (FIFO)
│   └─ User sees success confirmations
│
└────────────────────────────────────┘

Network Timeout/Error Scenario:
┌────────────────────────────────────┐
│  User Submits Score                │
├────────────────────────────────────┤
│ Network request initiated          │
│   ↓                                 │
│ Request times out (> 30s)           │
│   ↓                                 │
│ Show error banner:                  │
│ "⚠️ Network error - Retrying..."    │
│   ↓                                 │
│ Auto-retry in background:           │
│ ├─ Retry every 10s for 1 minute    │
│ ├─ Show cancel button               │
│ └─ User can close banner            │
│   ↓                                 │
│ On success: "✓ Score submitted"     │
│ On persistent failure:              │
│ "❌ Could not submit score"         │
│ [Retry] [Copy to clipboard]         │
│
└────────────────────────────────────┘

Validation Error Scenario:
┌────────────────────────────────────┐
│  User Submits Score "2-2"           │
├────────────────────────────────────┤
│ Frontend validation runs (before API)
│   ├─ Check format: "X-Y" ✓         │
│   ├─ Check X != Y ✗                │
│   └─ Show inline error:            │
│      "Score cannot be tied"         │
│                                     │
│ User fixes: "2-1"                   │
│   ├─ Error clears immediately      │
│   └─ [Submit] button enabled       │
│   ↓                                 │
│ Submit succeeds                     │
│
└────────────────────────────────────┘

Server Error Scenario (429 Rate Limit):
┌────────────────────────────────────┐
│  User clicks login 6x (failed)      │
├────────────────────────────────────┤
│ Attempts 1-5: Standard error        │
│   ├─ "Invalid email or password"   │
│   └─ Show: "5 attempts remaining"  │
│   ↓                                 │
│ Attempt 6: Rate limit triggered     │
│   ├─ Status: 429 Too Many Requests │
│   ├─ Show banner (red):             │
│   │  "Too many attempts"            │
│   │  "Try again in 15 minutes"      │
│   └─ [Forgot password?] link       │
│   ↓                                 │
│ Email field disabled               │
│ Password field disabled            │
│ Submit button disabled             │
│   ↓                                 │
│ 15 minutes later (or manual reset): │
│ Fields re-enabled                  │
│
└────────────────────────────────────┘
```

---

## Data Model

### Core Tables (public schema)

#### tournaments
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - name (VARCHAR, NOT NULL)
  - sport (ENUM: 'pickleball'|'tennis', NOT NULL)
  - matchFormat (ENUM: 'singles'|'doubles', NOT NULL)
  - maxPlayers (INT, NOT NULL)
  - status (ENUM: 'draft'|'registration_open'|'registration_closed'|
            'group_stage_active'|'group_stage_complete'|'knockout_active'|
            'tournament_complete', DEFAULT: 'draft')
  - registrationDeadline (TIMESTAMP, NOT NULL)
  - groupStageDeadline (TIMESTAMP, NOT NULL)
  - knockoutStageDeadline (TIMESTAMP, NOT NULL)
  - organizerId (UUID, REFERENCES accounts.id)
  - createdAt (TIMESTAMP, DEFAULT: now())
  - updatedAt (TIMESTAMP, DEFAULT: now())

Constraints:
  - registrationDeadline < groupStageDeadline < knockoutStageDeadline
  - maxPlayers >= 4
```

#### players
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - email (VARCHAR UNIQUE, NOT NULL)
  - name (VARCHAR, NOT NULL)
  - accountId (UUID, REFERENCES accounts.id, NULLABLE)
  - status (ENUM: 'active'|'inactive', DEFAULT: 'active')
  - createdAt (TIMESTAMP, DEFAULT: now())

Purpose:
  - Represents tournament participants
  - Links to accounts via accountId (1:1 optional relationship)
```

#### groups
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - tournamentId (UUID, REFERENCES tournaments.id, NOT NULL)
  - groupNumber (INT, NOT NULL)
  - status (ENUM: 'pending'|'active'|'complete', DEFAULT: 'pending')
  - createdAt (TIMESTAMP, DEFAULT: now())

Purpose:
  - Divides tournament into round-robin groups
  - Typical: 4-6 players per group
```

#### group_memberships
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - groupId (UUID, REFERENCES groups.id, NOT NULL)
  - playerId (UUID, REFERENCES players.id, NOT NULL)
  - seed (INT, NULLABLE)

Purpose:
  - Links players to groups
  - seed: used for bracket generation (1 = highest rank)
```

#### group_matches
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - groupId (UUID, REFERENCES groups.id, NOT NULL)
  - player1Id (UUID, REFERENCES players.id, NOT NULL)
  - player2Id (UUID, REFERENCES players.id, NOT NULL)
  - score (VARCHAR, NULLABLE) -- Format: "2-1" or "2-0"
  - winnerId (UUID, REFERENCES players.id, NULLABLE)
  - status (ENUM: 'pending'|'completed', DEFAULT: 'pending')
  - createdAt (TIMESTAMP, DEFAULT: now())
  - submittedAt (TIMESTAMP, NULLABLE)

Purpose:
  - Round-robin matches within group stage
  - Automatically created when group is formed
  - Count = n*(n-1)/2 for n players
```

#### group_standings
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - groupId (UUID, REFERENCES groups.id, NOT NULL)
  - playerId (UUID, REFERENCES players.id, NOT NULL)
  - rank (INT, NOT NULL)
  - wins (INT, DEFAULT: 0)
  - losses (INT, DEFAULT: 0)
  - setsWon (INT, DEFAULT: 0)
  - setsLost (INT, DEFAULT: 0)
  - updatedAt (TIMESTAMP, DEFAULT: now())

Purpose:
  - Denormalized standings for fast retrieval
  - Updated asynchronously via job queue
  - Ranking tiebreakers: wins > sets won > head-to-head > coin flip
```

#### knockout_matches
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - tournamentId (UUID, REFERENCES tournaments.id, NOT NULL)
  - round (ENUM: 'quarterfinal'|'semifinal'|'final', NOT NULL)
  - seed1 (INT, NULLABLE) -- Seeding from group standings
  - seed2 (INT, NULLABLE)
  - player1Id (UUID, REFERENCES players.id, NULLABLE)
  - player2Id (UUID, REFERENCES players.id, NULLABLE)
  - score (VARCHAR, NULLABLE) -- Format: "2-1" or "2-0"
  - winnerId (UUID, REFERENCES players.id, NULLABLE)
  - status (ENUM: 'pending'|'completed', DEFAULT: 'pending')
  - createdAt (TIMESTAMP, DEFAULT: now())

Purpose:
  - Single-elimination bracket matches
  - Seeded by group standings (1 = highest rank)
  - Automatic bye advancement for odd player counts
```

#### user_events
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - playerId (UUID, REFERENCES players.id, NOT NULL)
  - tournamentId (UUID, REFERENCES tournaments.id, NOT NULL)
  - eventType (VARCHAR, NOT NULL) -- e.g. "screen.view", "score.submit"
  - eventData (JSONB, NULLABLE)
  - timestamp (TIMESTAMP, DEFAULT: now())

Purpose:
  - Event tracking for analytics
  - User behavior analysis
  - Performance monitoring
```

#### locations
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - name (VARCHAR, NOT NULL)
  - address (VARCHAR, NOT NULL)
  - city (VARCHAR, NOT NULL)
  - state (VARCHAR, NOT NULL)
  - zipCode (VARCHAR, NOT NULL)

Purpose:
  - Venue information for tournaments
```

#### courts
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - locationId (UUID, REFERENCES locations.id, NOT NULL)
  - name (VARCHAR, NOT NULL) -- e.g. "Court A", "Court 1"
  - surface (VARCHAR, NULLABLE) -- e.g. "hard court", "clay"

Purpose:
  - Individual playing courts within venue
```

### Authentication Tables (auth schema)

#### accounts
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - email (VARCHAR UNIQUE, NOT NULL)
  - passwordHash (VARCHAR, NULLABLE) -- Bcryptjs-hashed, nullable for magic links
  - role (ENUM: 'admin'|'organizer'|'player', NOT NULL)
  - status (ENUM: 'pending'|'active', DEFAULT: 'pending')
  - createdAt (TIMESTAMP, DEFAULT: now())
  - updatedAt (TIMESTAMP, DEFAULT: now())

Purpose:
  - Central user authentication
  - Roles: admin (system), organizer (tournament mgmt), player (participant)
  - passwordHash: NULL until user sets password (magic link flow)
```

#### password_reset_codes
```sql
Columns:
  - id (UUID, PRIMARY KEY)
  - accountId (UUID, REFERENCES accounts.id, NOT NULL)
  - code (VARCHAR, NOT NULL) -- 6-digit code e.g. "123456"
  - attempts (INT, DEFAULT: 0)
  - expiresAt (TIMESTAMP, NOT NULL) -- TTL: 15 minutes
  - usedAt (TIMESTAMP, NULLABLE) -- Single-use token
  - createdAt (TIMESTAMP, DEFAULT: now())

Purpose:
  - Time-limited password reset codes
  - Rate limiting: max 5 attempts, then 429 error
  - Automatically cleaned up after expiration
```

---

## Feature Requirements

### 1. Authentication & Authorization

#### 1.1 User Registration

**Standalone Signup Flow**
- User navigates to `/signup` (public route)
- Enters: email, name, password, confirm password
- Form validation:
  - Email: valid format
  - Name: min 2 characters
  - Password: min 6 characters
  - Confirm password: must match password
- Backend:
  - Check email not already registered (409 if exists)
  - Hash password with Bcryptjs (10 salt rounds)
  - Create account record (accounts table)
  - Issue JWT session token (30-day TTL, httpOnly cookie)
  - Return user info and redirect to `/browse`

**Magic Link Signup Flow** (Tournament Registration)
- Organizer adds player email to tournament
- System generates 24-hour magic link token
- Player receives email with link: `/signup?token=xxx`
- User navigates to link, email pre-filled
- Enters: name, password, confirm password
- Backend:
  - Validate token (check expiration, single-use)
  - Create account with token's email
  - Issue session token
  - Player automatically registered for tournament

#### 1.2 Login

**Player/Organizer Login**
- User navigates to `/login` (public route)
- Enters: email, password
- Form validation:
  - Email: valid format
  - Password: min 1 character (no length requirement)
- Backend:
  - Find account by email
  - If not found: 401 "Invalid email or password"
  - If password hash is NULL: 401 (account never set password)
  - Compare entered password with hash using Bcryptjs
  - If mismatch: 401 "Invalid email or password"
  - If match: Issue JWT session token
  - Set httpOnly cookie with token
  - Return user info

#### 1.3 Session Management

**JWT Session Tokens**
- Format: Opaque JWT tokens (no embedded claims for security)
- TTL: 30 days (rolling window)
- Storage: httpOnly cookie (JavaScript cannot access)
- Scope: Single token for all roles (admin, organizer, player)
- Refresh: Every response re-issues cookie (resets 30-day window)
- Validation:
  - Middleware validates token on every protected request
  - Reads from `req.cookies.session`
  - Validates signature
  - Checks expiration
  - Returns 401 if invalid

**Session Restoration on Page Reload**
- Frontend calls `GET /api/auth/me` on app mount
- Backend validates session cookie
- Returns: `{ id, email, role, name }`
- Frontend stores in `useAuth()` context
- If 401: User redirected to `/login`

#### 1.4 Password Reset

**Forgot Password Flow**
- User navigates to `/forgot-password` (public route)
- Enters: email
- Backend:
  - Generate random 6-digit code
  - Store in password_reset_codes table with 15-min expiration
  - Send email with code (mocked for now, SMS/email adapter ready)
  - Always return 202 "Check your email" (don't reveal if email exists)

**Reset Password Flow**
- User navigates to `/reset-password` (public route)
- Enters: email, 6-digit code, new password, confirm password
- Backend:
  - Find password_reset_code record
  - Validate: code exists, not expired, not already used
  - Track attempts: max 5 attempts, then 429 error
  - If valid: Hash new password, update accounts.passwordHash
  - Mark code as used (can't reuse)
  - Return 200 "Password updated"

#### 1.5 Role-Based Access Control

**Three Roles**
- **Admin**: Can create organizer accounts, view analytics (future)
- **Organizer**: Can create tournaments, manage groups/brackets, confirm registrations
- **Player**: Can register for tournaments, submit scores, view standings

**Authorization**
- Protected routes check `req.account.role`
- Return 403 FORBIDDEN if role insufficient
- Example: `POST /tournaments` requires role='organizer' or 'admin'

**Protected Routes**
- `/api/tournaments` (POST) - organizer+ only
- `/api/tournaments/:id` (PATCH) - organizer+ only
- `/api/tournaments/:id/matches/:matchId/score` (POST) - player in match
- `/api/tournaments/:id/register/confirm` (POST) - organizer+ only
- All read routes: accessible to authenticated users (with optional role filtering)

#### 1.6 Rate Limiting

**Login Attempts**
- Max 5 failed attempts per email per 15 minutes
- Returns 429 "Too many failed login attempts"
- Shows: "5 attempts remaining" after each failure

**Password Reset Attempts**
- Max 5 failed code attempts per account per 15 minutes
- Returns 429 "Too many attempts"
- Code automatically invalidated after 5 failures

**Implementation**
- Tracked in-memory or Redis
- Keyed by email + endpoint
- Resets on successful login or password reset

---

### 2. Tournament Management

#### 2.1 Create Tournament

**Request**
```json
{
  "name": "Spring Open 2026",
  "sport": "pickleball|tennis",
  "matchFormat": "singles|doubles",
  "maxPlayers": 16,
  "registrationDeadline": "2026-06-15T17:00:00Z",
  "groupStageDeadline": "2026-06-22T17:00:00Z",
  "knockoutStageDeadline": "2026-06-29T17:00:00Z",
  "organizerId": "uuid"
}
```

**Validation**
- Name: min 5 characters, max 200
- maxPlayers: 4-200
- All dates: future dates
- Deadline ordering: registration < groupStage < knockout
- Organizer: must exist in accounts table with role='organizer'

**Response (201 Created)**
```json
{
  "id": "tourn_abc123",
  "status": "draft",
  "createdAt": "2026-05-31T..."
}
```

#### 2.2 Update Tournament

**Allowed Before Group Stage**
- name, maxPlayers, deadlines
- Can't modify: sport, matchFormat (affects scoring logic)

**Request**
```json
{
  "name": "Updated Tournament Name",
  "maxPlayers": 24,
  "registrationDeadline": "2026-06-16T17:00:00Z"
}
```

**Validation**
- Same as create (except past dates allowed for "updated" fields)
- Can't update after group stage started (returns 409)

#### 2.3 Tournament State Machine

**Valid State Transitions**
```
draft
  ↓ (open registration)
registration_open
  ↓ (close registration)
registration_closed
  ↓ (generate groups)
group_stage_active
  ↓ (all scores submitted)
group_stage_complete
  ↓ (generate bracket)
knockout_active
  ↓ (all bracket matches completed)
tournament_complete
```

**Invalid Transitions**
- Can't skip states (e.g., draft → knockout_active)
- Can't go backwards (e.g., registration_closed → registration_open)
- Each transition validates prerequisites

#### 2.4 Browse Tournaments

**Endpoint**
```
GET /tournaments?page=1&limit=20&sport=pickleball&sort=createdAt
```

**Response**
```json
{
  "tournaments": [
    {
      "id": "tourn_abc123",
      "name": "Spring Open 2026",
      "sport": "pickleball",
      "matchFormat": "doubles",
      "maxPlayers": 16,
      "registrationCount": 12,
      "status": "registration_open",
      "registrationDeadline": "2026-06-15T17:00:00Z"
    }
  ],
  "total": 147,
  "page": 1,
  "pageSize": 20
}
```

**Features**
- Paginated (default 20 per page, max 100)
- Filterable by: sport, status, date range
- Sortable by: createdAt, registrationDeadline, registrationCount
- Only public tournaments shown (future: private/invite-only)

---

### 3. Player Registration

#### 3.1 Register for Tournament

**Request**
```
POST /tournaments/:tournamentId/register
{
  "email": "player@example.com",
  "name": "Player Name"
}
```

**Validation**
- Registration deadline not passed (409 if passed)
- Email format valid
- Name: min 2 characters
- Not already registered for tournament (409 if exists)

**Response (201 Created)**
```json
{
  "magicLinkToken": "abc123def456...",
  "expiresIn": 86400,
  "email": "player@example.com"
}
```

**Backend**
- Create player record
- Generate magic link token (24-hour TTL)
- Send registration confirmation email (via queue)
- Return token to frontend (no session yet)

#### 3.2 Confirm Registration

**Frontend Flow**
- Player clicks magic link in email
- Redirected to `/signup?token=magicLinkToken`
- Navigates registration UI
- Submits: name, password, confirm password
- Backend validates token and creates account
- Player now logged in

#### 3.3 Registration Confirmation (Organizer)

**Endpoint**
```
POST /tournaments/:tournamentId/register/confirm
{
  "playerId": "player_uuid",
  "approved": true|false,
  "reason": "optional rejection reason"
}
```

**Validation**
- Organizer must own tournament
- Player must be registered for tournament
- Status must be registration_open

**Backend**
- If approved: update player status to 'active'
- If rejected: send rejection email, optionally delete registration
- Broadcast SSE event: registration.confirmed

---

### 4. Group Stage

#### 4.1 Automatic Group Formation

**Trigger**
- Organizer advances tournament to group_stage_active
- Prerequisite: at least 4 registered players

**Algorithm**
- Divide players into groups of 4-6 players
- Current logic: Simple equal distribution
- Future: Balanced seeding (avoid same club/region together)

**Match Generation**
- For each group: create round-robin matches
- Count = n × (n-1) / 2
- Example: 4 players = 6 matches
- All combinations exactly once: (p1,p2), (p1,p3), (p1,p4), (p2,p3), (p2,p4), (p3,p4)

**Database**
- Creates: groups, group_memberships, group_matches
- All matches created with status='pending', score=NULL

#### 4.2 Score Submission

**Request**
```
POST /tournaments/:tournamentId/matches/:matchId/score
{
  "score": "2-1"  // Format: "X-Y" where X,Y ∈ [0,3]
}
```

**Validation**
- Match exists and belongs to group stage (not knockout)
- Player is participant in match (403 if not)
- Score format valid: "X-Y", X and Y are 0-3
- Score winner is valid: X != Y (can't tie)
- Group stage deadline not passed (409 if passed)
- Match not already scored (can resubmit to override)

**Response (202 Accepted)**
```json
{
  "matchId": "match_uuid",
  "jobId": "recalc-standings:tourn:123:grp:5",
  "status": "submitted"
}
```

**Backend Processing**
- Update group_matches.score, group_matches.winnerId
- Enqueue job: standings.recalculate (with dedup by groupId)
- Job calculates new standings and broadcasts SSE event
- Return 202 immediately (async job processing)

**Retry Logic**
- Frontend retries on network failure: 1s, 2s, 4s delays
- Service Worker queues offline submissions
- Background sync retries when online

#### 4.3 Standings Calculation

**Ranking Tiebreakers** (in order)
1. **Wins** (primary): More wins = higher rank
2. **Sets Won** (secondary): Among same wins, more sets = higher rank
3. **Head-to-Head** (tertiary): Among same wins+sets, check direct match result
4. **Coin Flip** (final): If all above tied, random selection

**Example**
```
Wins  Sets Won  Rank
---   --------  ----
2     4         1st    (2 wins)
2     3         2nd    (2 wins, fewer sets)
1     5         3rd    (1 win)
0     2         4th    (0 wins)
```

**Updates**
- Triggered by standings.recalculate job
- Recalculates all standings for group
- Updates group_standings denormalized table
- Broadcasts SSE event: standings.updated
- Cache invalidated (Redis or memory)

#### 4.4 Real-Time Standings

**Endpoint**
```
GET /tournaments/:tournamentId/standings?groupId=group_uuid
```

**Response**
```json
{
  "standings": [
    {
      "rank": 1,
      "playerId": "player_uuid",
      "name": "Player Name",
      "wins": 2,
      "losses": 1,
      "setsWon": 4,
      "setsLost": 3,
      "differential": 1
    }
  ]
}
```

**Caching**
- React Query: 60s TTL with deduplication
- Backend: In-memory cache (invalidated on standings update)
- Frontend: Auto-refetch on window focus if stale

#### 4.5 Complete Group Stage

**Trigger**
```
POST /tournaments/:tournamentId/advance
{ "action": "COMPLETE_GROUP_STAGE" }
```

**Prerequisites**
- Tournament status: group_stage_active
- All matches scored (none pending)
- All standings calculated

**Backend**
- Update tournament.status to group_stage_complete
- Trigger bracket generation (async job)
- Broadcast SSE event: tournament.updated

---

### 5. Knockout Bracket

#### 5.1 Bracket Generation

**Trigger**
- Organizer advances tournament to knockout_active
- Prerequisite: group_stage_complete, all standings calculated

**Seeding Algorithm**
- Top 4 seeds from group standings (highest rank = seed 1)
- Bracket structure: single-elimination
- Seeding ladder: Seed 1 vs 4, Seed 2 vs 3 (if 4 players)
- Bye handling: highest-seeded get byes for odd player counts

**Match Generation**
```
4 players:
  Semifinals:  (1 vs 4), (2 vs 3)
  Finals:      (winner1 vs winner2)

3 players:
  Semifinals:  (2 vs 3), bye for 1
  Finals:      (bye recipient vs semifinal winner)

2 players:
  Finals only: (1 vs 2)
```

**Database**
- Creates: knockout_matches
- Sets: seed1, seed2, player1Id, player2Id (NULL until matches start)
- Status: pending

#### 5.2 Publish Bracket

**Endpoint**
```
POST /tournaments/:tournamentId/bracket/publish
```

**Validation**
- Organizer owns tournament
- Bracket generated (knockout matches exist)
- Tournament status: knockout_active

**Backend**
- Mark bracket as published (metadata flag)
- Broadcast SSE event: bracket.published (with full bracket structure)
- Send bracket email to all participants (async job)

#### 5.3 Knockout Score Submission

**Similar to Group Stage**
- Request: `POST /tournaments/:tournamentId/knockout/:matchId/score`
- Score format: "2-1" (sets won)
- Validation: player in match, deadline not passed
- Response: 202 Accepted
- Backend: Update match, advance winner to next round (if applicable)

#### 5.4 Bracket View

**Endpoint**
```
GET /tournaments/:tournamentId/bracket
```

**Response**
```json
{
  "bracket": [
    {
      "round": "semifinal",
      "seed1": 1,
      "seed2": 4,
      "player1Id": "p1",
      "player2Id": "p2",
      "score": null,
      "winnerId": null,
      "status": "pending"
    }
  ],
  "completed": false
}
```

---

### 6. Real-Time Updates (SSE)

#### 6.1 SSE Connection

**Endpoint**
```
GET /tournaments/:tournamentId/events
Headers: Authorization: Bearer <token>
```

**Server Response**
- Content-Type: text/event-stream
- Transfer-Encoding: chunked
- Connection: keep-alive
- Keep-alive: sent every 30 seconds

**Client**
- Uses EventSource API or reconnecting-eventsource library
- Automatic reconnection on disconnect
- Subscribes to multiple event types

#### 6.2 Event Types

**standings.updated**
```
event: standings.updated
data: {
  "groupId": "group_uuid",
  "standings": [
    { "rank": 1, "playerId": "...", "wins": 2, ... }
  ]
}
```

**bracket.published**
```
event: bracket.published
data: {
  "tournamentId": "tourn_uuid",
  "bracket": [ { "round": "semifinal", ... } ]
}
```

**match.updated**
```
event: match.updated
data: {
  "matchId": "match_uuid",
  "score": "2-1",
  "winnerId": "player_uuid"
}
```

**tournament.updated**
```
event: tournament.updated
data: {
  "tournamentId": "tourn_uuid",
  "status": "group_stage_active",
  "message": "Tournament advanced to group stage"
}
```

#### 6.3 Broadcast Bus

**In-Memory Implementation**
```typescript
class BroadcastBus {
  subscribers: Map<tournamentId, Set<SSEResponse>>
  emit(tournamentId, event, data)
  subscribe(tournamentId, res)
  unsubscribe(tournamentId, res)
}
```

**Future: Redis Pub/Sub**
- For distributed systems
- Multiple backend instances
- Pub: when job completes
- Sub: SSE endpoint listens

---

### 7. Mobile & Responsive Design

#### 7.1 Responsive Layout

**Breakpoints**
- Mobile: 320px - 640px
- Tablet: 641px - 1024px
- Desktop: 1025px+

**Layout Strategies**
- **Mobile**: Single column, stacked cards, bottom tab navigation
- **Tablet**: Two-column when appropriate, responsive grid
- **Desktop**: Multi-column, fixed sidebar navigation

#### 7.2 Mobile-First Features

**Touch Interactions**
- Button minimum size: 48×48px (WCAG touch target)
- Swipe navigation: left/right to switch tabs
- Pull-to-refresh: refresh standings
- Long-press: context menu options

**Bottom Tab Navigation**
```
┌─────────────────────────────────┐
│     Tournament Details          │
│                                 │
│  [Standings] [Matches] [Bracket]│
│     [Details]                   │
├─────────────────────────────────┤
│  🏠 Browse | 🎯 My Tournaments  │
│  ⚙️ Settings | 👤 Profile       │
└─────────────────────────────────┘
```

#### 7.3 PWA Features

**Service Worker**
- Registered on app load
- Cache-first strategy for static assets
- Network-first for API calls
- Offline fallback pages

**Offline Support**
- View cached tournament data
- Queue score submissions for sync
- Show "offline" banner
- Auto-sync when online with exponential backoff

**Install to Home Screen**
- Web App Manifest (manifest.json)
- App icon (192×192, 512×512)
- App name, description, theme colors
- Install prompt on supported browsers

---

### 8. Accessibility

#### 8.1 WCAG 2.1 AA Compliance

**Keyboard Navigation**
- All interactive elements: Tab, Shift+Tab traversable
- Focus visible: 2px outline, high contrast (4.5:1)
- Escape key: close modals, dialogs
- Enter key: submit forms

**Screen Reader Support**
- Semantic HTML: `<button>`, `<form>`, `<table>`, `<nav>`
- ARIA labels: For icon buttons, hidden content
- ARIA live regions: For dynamic updates (standings, scores)
- Alt text: For images (tournament logos, etc.)

**Color & Contrast**
- Text: 4.5:1 contrast ratio (WCAG AA)
- UI components: 3:1 minimum contrast
- Information not conveyed by color alone
- Dark mode support

**Motor & Cognitive**
- No auto-playing content (videos, music)
- Clear error messages
- Sufficient time to complete actions
- Simple language, short sentences

#### 8.2 Testing

**Automated**
- jest-axe: Accessibility audit in unit tests
- Lighthouse: Accessibility score on CI

**Manual**
- Keyboard-only navigation
- Screen reader testing (NVDA, JAWS)
- Color contrast verification

---

### 9. Analytics & Monitoring

#### 9.1 Event Collection

**Events Tracked**
```
screen.view:
  - screenName: "tournament_detail", "standings_tab", "bracket_tab", etc.
  - tournamentId, timestamp

score.submit:
  - tournamentId, groupId, matchId
  - score, winnerId, latency (ms)

standings.update:
  - tournamentId, groupId
  - newStandings (count), latency (ms)

error:
  - errorType, errorCode, errorMessage
  - context: screen, tournament, timestamp
```

**Storage**
- user_events table in PostgreSQL
- Batch collection: send every 30s or 10 events
- Includes: eventType, eventData (JSON), timestamp, playerId

#### 9.2 Performance Metrics

**Frontend**
- Time to Interactive (TTI)
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- API response time
- SSE latency (time from event broadcast to client received)

**Backend**
- API endpoint response time (p50, p95, p99)
- Database query time
- Job queue latency
- SSE connection count and uptime

#### 9.3 Structured Logging

**Format**
```json
{
  "timestamp": "2026-05-31T...",
  "level": "info|warn|error|debug",
  "module": "auth|tournaments|standings",
  "message": "User logged in",
  "requestId": "correlation-id",
  "userId": "uuid",
  "context": { "tournamentId": "...", "action": "login" }
}
```

**Levels**
- **debug**: Routine operations, read-only routes
- **info**: State changes (login, score submit, tournament created)
- **warn**: Expected failures (auth errors, validation errors)
- **error**: Unexpected failures (500 errors, unhandled exceptions)

---

### 10. Performance Optimization

#### 10.1 Frontend Optimization

**Code Splitting**
- Route-based: Lazy load pages (Settings, Profile, etc.)
- Component-based: Lazy load tabs (Matches, Bracket - not default)
- Dynamic imports: `React.lazy(() => import(...))`

**Memoization**
- React.memo: StandingsTable (expensive re-renders)
- useMemo: Computed standings/bracket data
- useCallback: Event handlers passed to memoized components

**Data Fetching**
- React Query caching: 60s TTL with stale-while-revalidate
- Prefetch on hover: Load tournament data before user clicks
- Deduplication: Multiple requests to same endpoint within 60s → single fetch

**Virtual Scrolling**
- react-window: Virtualize tables with 500+ rows
- Render only visible rows (e.g., 20/500 visible)
- Scrollbar size: accurate (uses item count)

**Image Optimization**
- Lazy loading: load-on-visible
- Responsive images: srcset for different screen sizes
- WebP format: with fallback to JPEG
- Compress: ImageMagick or similar

#### 10.2 Backend Optimization

**Database**
- Indexes: tournamentId, playerId, groupId, matchId
- Denormalization: group_standings table (pre-calculated)
- Connection pooling: PG pool size 10
- Query optimization: SELECT only needed columns

**Caching**
- In-memory: Standings (invalidated on update)
- Redis: (future) Session tokens, API response cache
- HTTP caching: 60s Cache-Control header

**Job Queue**
- Consolidation: Only one standings.recalculate per group at a time
- Async processing: Don't block API response
- Retries: Exponential backoff on failure

**Compression**
- gzip: All responses (except already-compressed)
- Brotli: For static assets (future)

---

### 11. Testing

#### 11.1 Test Coverage

**Overall**
- ✅ 2,126 tests passing
- ✅ 87.52% statement coverage
- ✅ 85.27% branch coverage

**Test Types**
- **Unit Tests** (70%): Business logic, utilities, calculations
- **Integration Tests** (20%): API endpoints with real database
- **E2E Tests** (10%): Full workflows with Playwright

#### 11.2 Testing Strategy

**Authentication**
- ✅ Signup, login, logout flows
- ✅ JWT token generation and validation
- ✅ Password hashing and verification
- ✅ Magic link generation and expiration
- ✅ Rate limiting

**Tournament Management**
- ✅ Tournament CRUD operations
- ✅ State machine transitions
- ✅ Deadline validation
- ✅ Group formation and match generation

**Score Submission & Standings**
- ✅ Score validation and parsing
- ✅ Standings calculation (tiebreakers)
- ✅ Bracket generation and seeding
- ✅ Real-time updates via SSE

**Performance**
- ✅ Virtual scrolling with 500+ rows
- ✅ API response time benchmarks
- ✅ Frontend render time validation

**Accessibility**
- ✅ jest-axe accessibility audit
- ✅ Keyboard navigation
- ✅ ARIA labels and semantic HTML

#### 11.3 Test Execution

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# E2E tests
npm run test:e2e

# Specific suite
npm test -- --testPathPattern="auth"
```

---

### 12. Deployment & Infrastructure

#### 12.1 Environment Configuration

**Environment Variables**
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/tournament_app

# Server
PORT=3001
NODE_ENV=production

# Authentication
JWT_SECRET=<random-32-char-secret>
JWT_TTL=30d

# Email
EMAIL_ADAPTER=smtp|sendgrid|mock
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

# Frontend
VITE_API_URL=https://api.example.com
VITE_CORS_ORIGIN=https://app.example.com

# Monitoring
LOG_LEVEL=info
SENTRY_DSN=...
```

#### 12.2 Database Migration

**Migration System**
- Versioned SQL files: `001_create_*.sql`, `002_*.sql`, etc.
- Tracks executed migrations in schema_migrations table
- Runs on server startup (safety: idempotent, read-only check)
- Supports rollback (manual, not automatic)

**Backup & Recovery**
```bash
# Backup
pg_dump tournament_app > backup.sql

# Restore
psql tournament_app < backup.sql

# Point-in-time recovery
pg_basebackup -D /mnt/backup
```

#### 12.3 Deployment Steps

**Production Checklist**
- [ ] Set DATABASE_URL to prod PostgreSQL (15+)
- [ ] Set JWT_SECRET to strong random value (32+ chars)
- [ ] Configure SMTP or email service (production emails)
- [ ] Set NODE_ENV=production
- [ ] Run database migrations: `npm run migrate`
- [ ] Create admin account: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed-admin`
- [ ] Set VITE_API_URL to production API domain
- [ ] Enable HTTPS/TLS on both frontend and API
- [ ] Configure CORS to allow frontend origin only
- [ ] Test: login → token stored in httpOnly cookie → session persists
- [ ] Test: admin login → can access admin endpoints (future)

#### 12.4 Monitoring & Observability

**Logging**
- Structured logging (JSON format)
- Log level: debug (dev), info (prod)
- Correlation IDs: trace requests across services
- Centralized: send to CloudWatch, Datadog, or ELK

**Metrics**
- Prometheus export endpoint (future)
- API response time (p50, p95, p99)
- Error rate by endpoint
- SSE connection count
- Job queue depth

**Alerting**
- Error rate > 1% → alert
- API response time p99 > 1000ms → alert
- Database connection pool exhausted → alert
- Service unavailable > 1min → page on-call

---

## Completed Milestones

### Phase 1: Authentication ✅ COMPLETE
- ✅ All 30 tasks completed
- ✅ JWT + opaque token system
- ✅ Email integration (password reset)
- ✅ Rate limiting (login, password reset)
- ✅ Seed script for admin account creation
- ✅ E2E tests with Playwright (31 test cases)

### Phase 2-4: Tournament Features ✅ COMPLETE
- ✅ Tournament CRUD
- ✅ Player registration (email + magic link)
- ✅ Group stage with automatic grouping
- ✅ Round-robin match generation
- ✅ Standings calculation with tiebreakers
- ✅ Score submission with validation
- ✅ Knockout bracket generation with seeding

### Phase 5: Real-Time & Mobile ✅ COMPLETE
- ✅ SSE for live standings and bracket updates
- ✅ Service Worker caching (offline support)
- ✅ Background sync for failed submissions
- ✅ Mobile-first responsive design
- ✅ Bottom tab navigation
- ✅ Touch-friendly UI

### Phase 6: Quality & Performance ✅ COMPLETE
- ✅ WCAG 2.1 AA accessibility compliance
- ✅ Virtual scrolling for large tables
- ✅ Code splitting and lazy loading
- ✅ React Query caching and deduplication
- ✅ 2,126 tests (87.52% coverage)
- ✅ E2E tests with Playwright

---

## Known Limitations & Future Work

### Current Limitations

1. **Single Tournament Session**
   - Users must switch between tournaments via URL
   - No multi-tournament dashboard (future)

2. **Organizer Features**
   - No bulk player import (future)
   - No email template customization
   - No tournament templates/cloning

3. **Advanced Bracket Formats**
   - Single-elimination only
   - No Swiss format (future)
   - No double-elimination (future)

4. **Communication**
   - No in-app messaging (infrastructure ready)
   - No push notifications (future)
   - No score dispute resolution (future)

5. **Mobile Native**
   - Web app + PWA only
   - No iOS/Android native apps (future)

### Future Enhancements

**Phase 7: Advanced Features**
- Swiss tournament format
- Double-elimination brackets
- In-app messaging
- Push notifications
- Video tutorials

**Phase 8: Scale & Integration**
- Payment processing (tournament fees)
- Social login (Google, Facebook)
- Advanced analytics dashboard
- Bulk player import
- Tournament templates

---

## Success Metrics

### User Engagement
- Tournament completion rate: > 95%
- Score submission rate: > 90% before deadline
- Return user rate (monthly): > 40%

### Performance
- API response time p95: < 200ms
- Page load time (TTI): < 3s
- SSE latency: < 100ms

### Quality
- Test coverage: > 85%
- Error rate: < 0.1%
- Accessibility score: > 95 (Lighthouse)

### Adoption
- Monthly active users: target 1000+
- Tournaments per month: target 50+
- Average tournament size: 20 players

---

## Document References

**Related Documentation**
- [README.md](./README.md) - Project overview and quick start
- [FEATURES.md](./FEATURES.md) - Feature checklist
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architecture
- [Authentication_Planning.md](./Authentication_Planning.md) - Auth design
- [TDD_STRATEGY.md](./TDD_STRATEGY.md) - Testing approach
- [SETUP.md](./SETUP.md) - Development environment setup
- [Postgres_App_Conversion_Plan.md](./Postgres_App_Conversion_Plan.md) - Migration history

**Code References**
- API Routes: `packages/api/src/routes/`
- Database Schema: `db/migrations/`
- Tests: `packages/api/src/__tests__/`
- Frontend: `packages/frontend/src/`

---

**Document Maintained By:** Development Team  
**Last Review:** 2026-05-31  
**Next Review:** After next major feature release
