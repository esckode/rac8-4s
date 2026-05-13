# Task #19: Implementation Guide

## Summary of Architectural Decisions

This document reflects the finalized architecture for Task #19 after grilling on design tradeoffs.

---

## Page Structure (Mobile-First)

### Navigation: Bottom Tab Bar
```
┌─────────────────────────────┐
│     App Content             │
│  (Tournament List, Detail,  │
│   Organizer Dashboard)      │
├─────────────────────────────┤
│ 🏠 | 🔍 | 📋 | ⚙️           │  Bottom Tab Bar
│Landing│Browse│MyTourneys│Org│
└─────────────────────────────┘
```

**4 main tabs:**
1. **Landing** — entry point, quick info
2. **Browse Tournaments** — tournament discovery (public list)
3. **My Tournaments** — player's registered tournaments
4. **Organizer Dashboard** — organizer's tournaments (if role)

---

## Page Routes (Nested)

```
/
├─ /landing
├─ /browse
│  └─ /:id (Tournament Details → Register)
├─ /my-tournaments (Player tournaments list)
├─ /organizer (Organizer dashboard)
├─ /tournaments/:id (Shared Tournament Detail - role-based rendering)
│  ├─ /standings
│  ├─ /matches
│  │  └─ /:matchId (Match Details in modal)
│  ├─ /bracket
│  ├─ /groups (organizer only)
│  ├─ /bracket/generate (organizer only)
│  └─ /bracket/review (organizer only)
└─ /login
```

**Key difference:** Single `/tournaments/:id` page for both players and organizers. Sub-pages are conditionally rendered based on user role.

---

## Key Pages & Components

### Entry Points

#### 1. Browse Tournaments (`/browse`)
- Public tournament list (cards, filterable)
- Click to view tournament details
- Registration form for players

#### 2. My Tournaments (`/my-tournaments`)
- List of player's registered tournaments
- Shows phase status, progress
- Click to enter tournament detail

#### 3. Organizer Dashboard (`/organizer`)
- List of organizer's tournaments
- Create tournament button
- Click to manage tournament

### Shared Tournament Detail Page (`/tournaments/:id`)

**Single page, role-based rendering** — detects user role (player vs organizer) and shows appropriate sub-pages.

#### Sub-pages (Conditional)

**Available to both:**
- **Standings** (`/tournaments/:id/standings`)
  - StandingsTable component (reused)
  - Player: shows own group only
  - Organizer: shows all groups, with override score button
  - Live updates via SSE
  
- **Matches** (`/tournaments/:id/matches`)
  - MatchCard component (reused)
  - Player: shows own matches, submit score button
  - Organizer: shows all matches, override controls
  - Live updates via SSE
  
- **Bracket** (`/tournaments/:id/bracket`)
  - Player: match-focused list (current → upcoming → history)
  - Organizer: full visual tree with @g-loot/react-tournament-brackets

**Organizer-only:**
- **Groups** (`/tournaments/:id/groups`)
  - Create groups form
  - Show group distribution
  - Only renders if user is organizer
  
- **Bracket Generation** (`/tournaments/:id/bracket/generate`)
  - Generate bracket form
  - Only renders if user is organizer
  
- **Bracket Review** (`/tournaments/:id/bracket/review`)
  - Review/edit seeding before publishing
  - Only renders if user is organizer

**Permission-based control flow:**
```tsx
<TournamentDetail tournamentId={id} />
  ├─ Detect user role from auth context
  ├─ Load tournament from Task #18 store
  ├─ Show sub-page navigation (conditionally hide organizer-only tabs)
  └─ Render selected sub-page with role-based capabilities
```

---

## Bracket Visualization

### Player View (Knockout Stage)
**Match-focused list** — NOT a full bracket tree

```
Current Match
[Your opponent (seeded #X)]
[Score submission form]

Next Match (If You Win)
[TBD opponent from other match]
[Round indicator]

Match History
[Round 1: You won vs X]
[Round 2: Pending]
```

**Why:** Mobile-friendly, focused on user's progression, no complex SVG rendering.

### Organizer View (Same Knockout Stage)
**Full visual bracket** — uses `@g-loot/react-tournament-brackets`

```
[Full bracket tree visualization]
[Pan/zoom for large tournaments]
[Edit seeding modal]
```

**Why:** Organizers need overview of all matches, not just their own.

---

## State Management & SSE

### Data Sources
- **Task #18 state stores** — primary cache for tournament, standings, matches, bracket
- **SSE via reconnecting-eventsource** — real-time updates to stores

### SSE Lifecycle
```
User enters /my-tournaments/:id
  └─ TournamentDetail component mounts
     └─ Open SSE subscription to /tournaments/:id/events
        └─ Listen for 'standings.updated', 'bracket.published'
           └─ Update Task #18 stores (no page-level refetch)

User leaves /my-tournaments/:id (back to /my-tournaments)
  └─ TournamentDetail component unmounts
     └─ Close SSE subscription
        └─ Stores remain in memory (cache survives nav)

User re-enters /my-tournaments/:id
  └─ SSE reconnects, renders with cached data
```

### Data Flow
```
SSE Event arrives → BroadcastBus (backend) 
                 ↓
            EventSource client
                 ↓
         Task #18 store update
                 ↓
        React component re-renders
```

**No polling, no page-level refetches.** Just store updates via SSE.

---

## Mobile Resilience

### Network Drops & Backgrounding
Use `reconnecting-eventsource` library:
- Auto-reconnect with exponential backoff (2^n seconds)
- Handles app backgrounding (re-establishes on foreground)
- Refetch tournament data on reconnect to ensure fresh state

### Error Handling
- API errors → error banner with retry button
- SSE disconnect → "Reconnecting..." indicator, auto-retry
- Network offline → graceful degradation (show cached data)

---

## Component Structure

### Shared Components (src/components/shared/)
Reused across both player and organizer views with permission-based rendering:

```
src/components/shared/
├─ TournamentCard.tsx              (Browse, My Tournaments, Organizer lists)
├─ MatchCard.tsx                   (Matches list, used by both roles)
├─ StandingsTable.tsx              (Standings page, used by both roles)
│                                  (role-based: player sees own group,
│                                   organizer sees all groups + controls)
├─ PhaseIndicator.tsx              (tournament status badge)
├─ LoadingSpinner.tsx
├─ ErrorBanner.tsx
├─ ResponsiveLayout.tsx            (grid/flex for mobile)
└─ ...
```

### Page-Specific Components (src/pages/TournamentDetail/)
Role-based sub-pages in shared `/tournaments/:id` route:

```
src/pages/TournamentDetail/
├─ index.tsx                       (main page, detects role, renders sub-pages)
├─ Standings.tsx                   (shared, renders StandingsTable)
├─ Matches.tsx                     (shared, renders MatchCard list)
├─ Bracket.tsx                     (conditional rendering)
│  ├─ PlayerBracket.tsx           (match-focused list)
│  └─ OrganizerBracket.tsx        (full tree with @g-loot)
├─ GroupsManagement.tsx            (organizer-only)
├─ BracketGeneration.tsx           (organizer-only)
└─ MatchDetails.tsx                (modal, shared score form)

src/hooks/
├─ usePermissions.ts               (detect role, permissions)
├─ useTournament.ts                (fetch/cache from Task #18 stores)
└─ useSSE.ts                       (manage SSE subscription lifecycle)
```

**Key insight:** ~20-25 components instead of ~30-40. Permissions are centralized in `usePermissions` hook.

---

## Testing Strategy

### Component Tests (Jest + React Testing Library)
- Render components with mock store data
- Verify SSE event handling (update store → re-render)
- Test error states and loading states

### Integration Tests
- Simulate SSE event: `broadcastBus.emit('standings.updated', {...})`
- Verify store update flows to component
- Test reconnection logic with `reconnecting-eventsource`

### E2E Tests (Task #20)
- Full tournament flow: register → view standings → submit score → see live update
- Verify SSE updates standings table without page reload
- Test mobile-specific: backgrounding, network drop, resume

---

## Tech Stack (Confirmed)

| Category | Choice | Why |
|----------|--------|-----|
| Framework | React 18+ | Component reusability, SSE patterns, testing support |
| Styling | Tailwind CSS | Mobile-first, responsive utilities |
| Routing | react-router v6 | Nested routes, nested params, back-nav |
| State | Task #18 stores | Already built, pub/sub ready |
| Tables | TanStack Table | Sorting, filtering for standings |
| Bracket (Org) | @g-loot/react-tournament-brackets | SVG rendering, mobile pan/zoom |
| Bracket (Player) | Custom list | Match-focused, simple, mobile-friendly |
| SSE | reconnecting-eventsource | Auto-reconnect, mobile-friendly |
| Dev Server | Vite | Fast HMR, TypeScript, minimal config |
| Testing | Jest + RTL | React standard, good async/SSE testing |
| Icons | Lucide React | Lightweight, tree-shakeable |

---

## Next Steps

1. **Create base pages** — Landing, BrowseTournaments, MyTournaments, OrganizerDashboard
2. **Set up routing** — react-router with bottom tab bar navigation
3. **Implement TournamentDetail layout** — with tabs/nav to sub-pages
4. **Build Standings, Matches, Bracket pages** — consume Task #18 stores
5. **Integrate SSE** — reconnecting-eventsource + store updates
6. **Add match-focused bracket view** — player side (current, upcoming, history)
7. **Add organizer bracket visualization** — @g-loot library
8. **Write tests** — component + integration tests for SSE handling
9. **Mobile optimization** — verify responsive design, test on actual devices
10. **Integration with Task #20** — E2E test full tournament flow

---

**This guide reflects all architectural decisions from the grilling session. Ready to implement Task #19.**
