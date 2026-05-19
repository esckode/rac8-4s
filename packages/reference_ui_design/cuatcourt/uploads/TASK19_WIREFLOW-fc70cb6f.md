# Task #19: Frontend Wireflow & Navigation

## Recommended Screen Structure

### Authentication & Entry Points

```
┌─────────────────┐
│  Landing Page   │
│  - Login Link   │
│  - Browse       │
│  - Tournaments  │
└────────┬────────┘
         │
         ├──────────────────────────┬──────────────────────┐
         │                          │                      │
    ┌────▼────┐          ┌──────────▼──┐         ┌────────▼──┐
    │ Login    │          │ Browse       │         │ Organizer │
    │ (Player) │          │ Tournaments  │         │ Dashboard │
    └────┬────┘          └──────────┬───┘         └────┬──────┘
         │                          │                   │
         │ magic link              │ public list       │ JWT auth
         │ validation              │                   │
         └────────────┬────────────┘                   │
                      │                                │
              ┌───────▼────────────────────────────────┘
              │
         ┌────▼───────────────┐
         │ Dashboard / Home   │
         │ - My Tournaments   │
         │ - Available Tours  │
         └─────────────────────┘
```

---

## Player User Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     PLAYER JOURNEY                               │
└──────────────────────────────────────────────────────────────────┘

1. DISCOVERY
   ┌──────────────────────────────┐
   │ Tournament List Screen       │
   │ - Browse available tourneys  │
   │ - Filter by sport/status     │
   │ - View tournament card       │
   │   (name, sport, dates,       │
   │    player count, status)     │
   └────────┬─────────────────────┘
            │ (click tournament)
            ▼
   ┌──────────────────────────────┐
   │ Tournament Details / Register│
   │ - Name, sport, dates         │
   │ - Current player count       │
   │ - Registration form:         │
   │   • Singles/Doubles choice   │
   │   • Partner email (if double)│
   │ - [Register] button          │
   └────────┬─────────────────────┘
            │ (submit)
            ▼
   ┌──────────────────────────────┐
   │ Registration Confirmed       │
   │ - "You're registered!"       │
   │ - Waiting for partner        │
   │   confirmation (if doubles)  │
   │ - [View Tournament] button   │
   └────────┬─────────────────────┘
            │
            ▼

2. GROUP STAGE (after organizer creates groups)
   ┌──────────────────────────────┐
   │ Tournament Overview          │
   │ - Current Phase:             │
   │   "Registration Closed"      │
   │   "Group Stage In Progress"  │
   │ - [View Standings]           │
   │ - [View Matches]             │
   │ - [View Groups]              │
   └────────┬─────────────────────┘
            │
      ┌─────┴─────────┬──────────────┐
      │               │              │
      ▼               ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │Standings │  │ Matches  │  │ Groups   │
   │ Table    │  │ List     │  │ Info     │
   │ (live)   │  │ (live)   │  │          │
   └──────────┘  └──────────┘  └──────────┘
      │               │
      │ (SSE:         │ (click match to submit score)
      │ standings     │
      │ updated)      │
      │               ▼
      │        ┌──────────────────┐
      │        │ Match Details    │
      │        │ - Opponent(s)    │
      │        │ - Deadline       │
      │        │ - Submit Score   │
      │        │   Form:          │
      │        │   • Set scores   │
      │        │   • [Submit]     │
      │        └────┬─────────────┘
      │             │ (scores submitted)
      │             │ (job queued, standings recalc)
      │             │
      │             ▼
      │        ┌──────────────────┐
      │        │ Score Submitted  │
      │        │ - Confirmation   │
      │        │ - [Back to Matche│
      │        └──────────────────┘
      │
      └─── SSE event → Re-render standings live
            (no polling needed)

3. KNOCKOUT STAGE (after organizer publishes bracket)
   ┌──────────────────────────────┐
   │ Tournament Overview          │
   │ - Current Phase:             │
   │   "Knockout In Progress"     │
   │ - [View Bracket]             │
   │ - [View Matches]             │
   └────────┬─────────────────────┘
            │
      ┌─────┴────────┐
      │              │
      ▼              ▼
   ┌──────────┐  ┌──────────┐
   │ Bracket  │  │ Matches  │
   │ Visual   │  │ (same as │
   │ (live)   │  │  above)  │
   └──────────┘  └──────────┘
      │ (SSE: bracket.published
      │  or match results)
      │
      └─── Live bracket updates via SSE

4. TOURNAMENT COMPLETE
   ┌──────────────────────────────┐
   │ Tournament Complete          │
   │ - Final Standings            │
   │ - Results Summary            │
   │ - [Back to Home]             │
   └──────────────────────────────┘
```

---

## Organizer User Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                   ORGANIZER JOURNEY                              │
└──────────────────────────────────────────────────────────────────┘

1. DASHBOARD
   ┌──────────────────────────────┐
   │ Organizer Dashboard          │
   │ - My Tournaments (list)       │
   │   • Draft, Registration Open, │
   │     Group Stage, Knockout     │
   │ - [Create Tournament] button  │
   │ - [Edit] / [View] per tourney │
   └────────┬─────────────────────┘
            │
      ┌─────┴─────────────────────┐
      │                           │
      ▼                           ▼
   ┌──────────────────┐   ┌──────────────────┐
   │ Create Tournament│   │ Tournament Detail│
   │ - Name           │   │ - Current status │
   │ - Sport          │   │ - Registered     │
   │ - Format         │   │   players count  │
   │ - Match type     │   │ - [Close Reg]    │
   │ - Dates          │   │ - [Create Groups]│
   │ - [Create]       │   │ - [Generate      │
   │                  │   │   Bracket]       │
   │                  │   │ - [View Detail]  │
   │                  │   │ - [Edit]         │
   └──────────────────┘   └────────┬─────────┘
                                   │
                       ┌───────────┼──────────┐
                       │           │          │
                       ▼           ▼          ▼
                  ┌──────┐  ┌────────┐  ┌──────────┐
                  │Groups│  │Standings│ │ Bracket  │
                  │Mgmt  │  │Monitor  │ │ Preview  │
                  └──────┘  └────────┘  └──────────┘

2. GROUP CREATION
   ┌──────────────────────────────┐
   │ Create Groups                │
   │ - Number of groups:          │
   │   [____] input               │
   │ - Players per group:         │
   │   (auto-calculated)          │
   │ - Distribution method:       │
   │   • Random                   │
   │   • Balanced by ranking      │
   │ - [Create Groups]            │
   └────────┬─────────────────────┘
            │ (job: standings.recalculate)
            ▼
   ┌──────────────────────────────┐
   │ Groups Created Confirmed     │
   │ - Groups ready for scoring   │
   │ - [View Standings] (live)    │
   │ - [Monitor Matches]          │
   └────────┬─────────────────────┘
            │
            ▼

3. GROUP STAGE MONITORING (Live)
   ┌──────────────────────────────┐
   │ Tournament Monitor           │
   │ - Standings (live via SSE)   │
   │ - Matches (live via SSE)     │
   │ - Player scores submitted    │
   │ - [Override Score] links     │
   │   (organizer can edit after  │
   │    player deadline)          │
   │ - [Advance to Knockout]      │
   │   (when ready)               │
   └────────┬─────────────────────┘
            │
            └─── SSE events automatically update:
                 - Standings on score submission
                 - Match status
                 - Group progress

4. BRACKET GENERATION & PUBLISH
   ┌──────────────────────────────┐
   │ Generate Bracket             │
   │ - "Generate from group stage"│
   │ - Seeding preview            │
   │ - Byes preview               │
   │ - [Generate] button          │
   └────────┬─────────────────────┘
            │ (job: bracket.generate)
            ▼
   ┌──────────────────────────────┐
   │ Review Bracket               │
   │ - Bracket visualization      │
   │ - [Edit Seeding] option      │
   │ - [Publish Bracket] button   │
   └────────┬─────────────────────┘
            │ (publishes, emits SSE event)
            ▼
   ┌──────────────────────────────┐
   │ Bracket Published            │
   │ - Players notified (SSE)     │
   │ - Knockout matches visible   │
   │ - [Monitor Knockout]         │
   └────────┬─────────────────────┘
            │
            ▼

5. KNOCKOUT MONITORING (Live)
   ┌──────────────────────────────┐
   │ Knockout Stage Monitor       │
   │ - Bracket visual (live)      │
   │ - Match scores (live)        │
   │ - Round progress             │
   │ - [Override Score]           │
   │ - [Mark Complete]            │
   │   (when all matches done)    │
   └──────────────────────────────┘
            │
            └─── SSE events update:
                 - Bracket state
                 - Match results
```

---

## Shared Components & Interactions

### Real-Time Updates (SSE)
All screens showing live data should update via SSE without user polling:

- **Standings Table:** Subscribe to `standings.updated` event
  - Data source: `StandingsState` from Task #18
  - Trigger: Job completes, `standings-processor` emits to `BroadcastBus`
  - Update: Re-render table with new standing rows

- **Bracket Visualization:** Subscribe to `bracket.published` event
  - Data source: `MatchState` from Task #18
  - Trigger: `bracket-processor` emits to `BroadcastBus`
  - Update: Render bracket from match list

- **Matches List:** Reactive to standings and bracket updates
  - Filters: Upcoming (status: pending), Completed (status: completed), By round
  - Auto-refresh when SSE events arrive

### Common UI Patterns

1. **Loading States**
   - Skeleton loaders while fetching tournament/standings
   - Spinner during score submission
   - "Connecting..." indicator when SSE reconnects

2. **Error States**
   - API errors (404, 401, 500) → error message + retry button
   - Network disconnection → "Reconnecting..." + automatic retry
   - Validation errors → inline form errors

3. **Tournament Phase Badges**
   - Registration Open (green)
   - Registration Closed (gray)
   - Group Stage (blue)
   - Knockout (purple)
   - Complete (gold)

4. **Responsive Layout**
   - **Mobile:** Single column, stacked components
   - **Tablet:** 2-column grid where applicable
   - **Desktop:** Full multi-panel dashboard view

---

## Data Flow (Simplified)

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Screens                         │
│  (Tournament List, Standings, Bracket, Match Details)       │
└──────────────┬──────────────────────────┬──────────────────┘
               │                          │
          uses │                          │ subscribes to
               │                          │
               ▼                          ▼
         ┌──────────────────┐      ┌────────────────────┐
         │ State Stores     │      │ SSE Client         │
         │ (Task #18)       │      │ (Task #18)         │
         │ - Tournament     │      │ connects to        │
         │ - Standings      │      │ /tournaments/:id   │
         │ - Match          │      │ /events            │
         │ - Player         │      │                    │
         │ - TournamentPhase│      │ emits:             │
         └────┬─────────────┘      │ - standings.updated│
              │                    │ - bracket.published│
              │                    └────────┬───────────┘
              │                             │
              │ calls                       │ triggers
              │                             │
              ▼                             ▼
         ┌──────────────────┐      ┌────────────────────┐
         │ API Client       │      │ State Store        │
         │ (Task #18)       │      │ Updates            │
         │ - fetch functions│      │ (re-render via     │
         │ - parseResponses │      │  pub/sub pattern)  │
         └────┬─────────────┘      └────────────────────┘
              │
              │ HTTP calls
              │
              ▼
         ┌──────────────────┐
         │ Backend API      │
         │ (Task #7-12)     │
         └──────────────────┘
```

---

## Component List (MVP)

| Component | Used On | Complexity | SSE Aware? | Notes |
|-----------|---------|-----------|-----------|-------|
| TournamentCard | List screens | Low | No | Static card, no updates |
| TournamentHeader | Detail pages | Low | No | Static header with phase badge |
| StandingsTable | Standings screen | High | **Yes** | Re-renders on `standings.updated` SSE event |
| MatchCard | Matches list | Medium | No | Static match info |
| MatchDetails | Match modal | Medium | **Yes** | Score form, deadline timer |
| BracketVisualization | Bracket screen | **High** | **Yes** | Complex rendering, updates on `bracket.published` |
| LoadingSpinner | Global | Low | No | Show during API calls |
| ErrorBanner | Global | Low | No | Show API/network errors |
| PhaseIndicator | Tournament header | Low | No | Shows current tournament phase |
| ResponseLayout | Global | Medium | No | Responsive grid/flex container |
| RegistrationForm | Registration screen | Low | No | Form for joining tournament |
| GroupStageForm | Groups creation (organizer) | Low | No | Form for creating groups |
| ScoreSubmitForm | Match details | Low | No | Form for score entry |
| BracketEditModal | Bracket review (organizer) | High | No | Edit bracket seeding |

---

## Navigation Summary

```
Landing Page
├─ Player Path
│  ├─ Tournament List (public)
│  ├─ Tournament Details → Register
│  └─ My Tournaments
│     ├─ Tournament Overview
│     ├─ Standings (live SSE)
│     ├─ Matches (live SSE)
│     │  └─ Match Details → Submit Score
│     ├─ Groups
│     └─ Bracket (live SSE)
│
└─ Organizer Path
   ├─ Dashboard
   ├─ Tournament Details
   │  ├─ Create/Edit Tournament
   │  ├─ Manage Groups
   │  ├─ Monitor Standings (live SSE)
   │  ├─ Generate Bracket
   │  ├─ Review & Publish Bracket
   │  └─ Monitor Knockout (live SSE)
   └─ Tournament Analytics (future)
```

---

## Recommended Tech Stack

Based on this wireflow:

| Layer | Recommendation | Why |
|-------|-----------------|-----|
| Framework | **React 18+** | Component reusability, SSE event subscription patterns, testing-library support |
| Styling | **Tailwind CSS** | Responsive design, dark mode support, utility-first workflow |
| State | **Task #18 stores** | Already built, pub/sub for SSE updates |
| Tables | **TanStack Table (React Table)** | Sorting, filtering, pagination for standings |
| Bracket viz | **Custom SVG** or **react-tournament-bracket** | SVG is lightweight; bracket library handles layout |
| Dev Server | **Vite** | Fast HMR, TypeScript support, minimal config |
| Testing | **Jest + React Testing Library** | Standard for React, good SSE/async testing |
| Icons | **Lucide React** | Lightweight, tree-shakeable icons |

---

## Next Steps

1. **Confirm framework choice** (React? Vue? Other?)
2. **Confirm styling approach** (Tailwind? CSS Modules? Other?)
3. **Confirm bracket visualization** (Custom? Library?)
4. **Confirm responsive breakpoints** (Mobile-first? Desktop-first?)
5. **Create detailed component specs** per section (Figma mockups optional)
6. **Start with Task #19 implementation** using this wireflow

---

**This wireflow covers:**
- ✅ All required screens (tournament discovery, standings, bracket, matches)
- ✅ Both player and organizer journeys
- ✅ Real-time updates via SSE
- ✅ Responsive design considerations
- ✅ Error/loading states
- ✅ Navigation paths between screens
- ✅ Integration with Task #18 state management

**Missing from wireflow (out of scope for #19):**
- Admin dashboard for system management
- Detailed analytics/reporting
- Email notification history
- Audit logs
- Advanced bracket editing (manual match pairings)
