# Task #19: Frontend Components & Mobile Optimizations
## Final Implementation Plan

**Status:** Ready for Implementation  
**Dependencies:** #18 (Frontend state and data logic)  
**Blocks:** #20 (E2E tests)

---

## Overview

Implement and test frontend UI components for tournament dashboards, standings tables, and bracket visualization, **with comprehensive mobile optimizations**. All optimizations are architected from day one, not bolt-on later.

**Key Insight:** This is NOT just "build pretty components." It's a mobile-first, performance-optimized frontend designed for battery life, data efficiency, and fast navigation.

---

## Part 0: Design Specifications (Required Upfront)

Before implementation, design requirements must be documented. This ensures all components follow a consistent visual language and mobile-first approach.

### 0.1 Create Design Specification Document

**File:** `TASK19_DESIGN_SPEC.md`

Document the following:

#### Color Palette
- Primary color (CTA buttons, highlights)
- Secondary color (links, accents)
- Success/warning/error colors
- Neutral grays (backgrounds, borders, text)
- Dark mode variants (if applicable)
- All mapped to Tailwind classes

**Example:**
```
Primary: #3B82F6 (Tailwind blue-500)
Secondary: #8B5CF6 (Tailwind violet-500)
Success: #10B981 (Tailwind emerald-500)
Error: #EF4444 (Tailwind red-500)
```

#### Typography
- Font family (suggested: system fonts or Google Fonts)
- Font sizes (heading, subheading, body, small, xsmall)
- Font weights (bold, semibold, normal, light)
- Line heights
- Letter spacing
- Mobile scaling (smaller on mobile)

**Example:**
```
Heading 1: 32px, 700 weight, 1.2 line-height (mobile: 24px)
Heading 2: 24px, 600 weight, 1.3 line-height (mobile: 20px)
Body: 16px, 400 weight, 1.5 line-height (mobile: 14px)
Small: 12px, 400 weight, 1.4 line-height
```

#### Spacing System
- Base unit (8px or similar)
- Spacing scale (xs, sm, md, lg, xl)
- Padding/margin conventions
- Gap between elements

**Example:**
```
xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px
```

#### Responsive Breakpoints
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px
- Design approach: mobile-first

#### Component Specifications

For each component, document:
- Default appearance (colors, spacing, typography)
- Interactive states (hover, focus, active, disabled, loading)
- Mobile appearance
- Dark mode (if applicable)
- Accessibility (focus indicators, contrast)

**Components to specify:**
- Buttons (primary, secondary, outline)
- Form inputs (text, email, select, checkbox)
- Cards (tournament card, match card)
- Tables (standings with virtualization)
- Modals/Dialogs
- Badges/Pills (phase indicator)
- Spinners/Loading states
- Error/Success banners
- Navigation (bottom tabs, breadcrumbs)
- Tournament list (grid vs list layout)
- Standings table (row hover, sorting)
- Match list (upcoming, completed, grouped)
- Bracket view (player match-focused, organizer full tree)

**Example (Button):**
```markdown
## Button Component

### Primary Button
- Default: bg-blue-600, text-white, rounded-md, px-4 py-2
- Hover: bg-blue-700 (darker)
- Active/Pressed: bg-blue-800, scale 0.98
- Disabled: bg-gray-300, text-gray-500, cursor-not-allowed, opacity-50
- Focus: ring-2 ring-blue-500 ring-offset-2
- Loading: spinner icon, disabled state
- Mobile: full-width on screens < 640px, min-height 44px (tap target)

### Secondary Button
- Default: bg-gray-200, text-gray-900, rounded-md, px-4 py-2
- Hover: bg-gray-300
- ... (similar states)
```

#### Layout & Spacing Rules
- Page padding: 16px mobile, 24px tablet, 32px desktop
- Card spacing: 16px gap between cards
- Section spacing: 24px between major sections
- Mobile-first: components stack vertically on mobile, side-by-side on desktop

#### Dark Mode (if applicable)
- Specify dark mode colors (or note if out of scope)
- Examples: text color, background color, border color for dark mode

#### Accessibility Requirements
- Focus indicators (visible on all interactive elements)
- Color contrast (WCAG AA minimum)
- Touch targets (44px minimum height/width on mobile)
- Keyboard navigation (all interactive elements accessible via Tab)
- Screen reader support (semantic HTML, ARIA labels where needed)

---

### 0.2 Create Design Tokens File

**File:** `src/design/tokens.ts`

Export design tokens as TypeScript constants:

```typescript
export const colors = {
  primary: '#3B82F6',
  secondary: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  
  // Grays for neutral elements
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
}

export const typography = {
  heading1: {
    fontSize: '32px',
    fontWeight: 700,
    lineHeight: '1.2',
  },
  heading2: {
    fontSize: '24px',
    fontWeight: 600,
    lineHeight: '1.3',
  },
  body: {
    fontSize: '16px',
    fontWeight: 400,
    lineHeight: '1.5',
  },
  small: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '1.4',
  },
}

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
}

export const breakpoints = {
  mobile: '640px',
  tablet: '1024px',
}
```

---

### 0.3 Document Component Specifications

**File:** `src/components/COMPONENT_SPECS.md`

Create a spec for each component with:
- Visual appearance
- All interactive states
- Mobile layout
- Example usage
- Accessibility notes

**Example structure:**
```markdown
# Component Specifications

## StandingsTable
### Appearance
- Header: `bg-gray-100`, bold text, `px-4 py-3`
- Rows: `bg-white` / `bg-gray-50` alternating, `px-4 py-3`
- Borders: `border-b border-gray-200`
- Text: `text-gray-900` for data, `text-gray-600` for labels

### Interactive States
- Row hover: `bg-blue-50` (light blue)
- Sorting: up/down arrow in header cell
- Loading: skeleton loaders for each row
- Empty: centered message "No standings available"
- Error: error banner above table with retry button

### Mobile (< 640px)
- Single column: rank, name, wins/losses
- Swipeable to show more columns
- Touch targets: 48px row height (for tap)

### Accessibility
- Header cells: `<th scope="col">`
- Body cells: `<td>`
- Focus indicators: `ring-2 ring-blue-500` on sortable headers
- Screen reader: announce sort direction on click

## MatchCard
### Appearance
- Container: `bg-white`, `border border-gray-200`, `rounded-lg`, `p-4`
- Player names: `font-semibold text-gray-900`
- Status: badge with color (pending: yellow, completed: green, cancelled: red)
- Score: `text-lg font-bold` if completed, empty if pending

### Interactive States
- Hover: `bg-gray-50`, `shadow-md`
- Click: navigates to match detail modal
- Loading (score submit): spinner overlay
- Completed: score displayed, no interaction

### Mobile
- Full width, `mb-3` gap between cards
- Player names on same line if space allows
- Score: large, easy to read

### Accessibility
- Clickable element: `<button>` or `<a>` with proper role
- Status: conveyed by both color and text ("Pending Match")
- Focus: `ring-2 ring-blue-500`

...
```

---

### 0.4 Requirements to Finalize

**Before implementation starts, answer:**

1. ✅ **Color palette**: What are your brand colors? (primary, secondary, success, error, warning)
   - Suggestion: Use modern palette (blues, greens, reds aligned with Tailwind)

2. ✅ **Typography**: Any font preferences?
   - Suggestion: System fonts (Inter, -apple-system) for fast loading on mobile

3. ✅ **Layout style**: Modern, minimal, or sport-themed?
   - Suggestion: Clean, minimal for mobile-first (easier to maintain)

4. ✅ **Dark mode**: Required?
   - Suggestion: Start with light mode, defer dark mode to v2

5. ✅ **Branding**: Logo, images, icons?
   - Suggestion: Lucide React icons (lightweight, tree-shakeable)

6. ✅ **Mobile-first details**:
   - Bottom tab bar appearance (background color, icon style, active indicator)
   - Card shadows/depth
   - Spacing on different breakpoints

---

### 0.5 Success Criteria for Design Specs

✅ **Design document complete:**
- Color palette defined and mapped to Tailwind classes
- Typography scale documented
- Spacing system defined
- All 12+ components specified (appearance + states + mobile + a11y)
- Responsive breakpoints documented
- Accessibility guidelines defined

✅ **Design tokens created:**
- `src/design/tokens.ts` exports all colors, spacing, typography
- Can be imported and used in components

✅ **Component specs clear:**
- Developers understand exactly what each component should look like
- No guessing on spacing, colors, or interactive states
- Mobile layout explicitly documented for each component

✅ **Ready for implementation:**
- Developers can build without asking "what color is this button?"
- Consistent visual language across all components
- Mobile-first approach documented and clear

---



### 1.1 Create Consolidation Endpoint

**File:** `packages/api/src/routes/tournaments.ts`

Add new endpoint (doesn't modify existing endpoints):

```typescript
/**
 * GET /tournaments/:id/bundle
 * Consolidates tournament data into single response
 * Reuses existing database/business logic
 * Supports selective loading via ?include=standings,matches,bracket
 */
router.get('/:id/bundle', async (req, res) => {
  const tournamentId = req.params.id
  const { include } = req.query
  
  const includedFields = (include as string)?.split(',') || 
    ['tournament', 'standings', 'matches', 'bracket']
  
  const queries: Record<string, Promise<any>> = {}
  
  if (includedFields.includes('tournament')) {
    queries.tournament = getTournament(tournamentId)
  }
  if (includedFields.includes('standings')) {
    queries.standings = getStandingsByTournament(tournamentId)
  }
  if (includedFields.includes('matches')) {
    queries.matches = getMatchesByTournament(tournamentId)
  }
  if (includedFields.includes('bracket')) {
    queries.bracket = getBracketByTournament(tournamentId)
  }
  
  const results = await Promise.all(Object.values(queries))
  const data = Object.fromEntries(
    Object.keys(queries).map((key, i) => [key, results[i]])
  )
  
  res.json(data)
})
```

**Tests:**
- ✅ Fetching full bundle returns all 4 fields
- ✅ Selective loading (?include=standings,matches) returns only specified fields
- ✅ Authorization enforced (same as individual endpoints)
- ✅ Performance: parallel queries are faster than sequential

---

## Part 2: Frontend Components & Architecture

### 2.1 Folder Structure

```
src/
├── pages/
│   ├── Landing.tsx                           # Entry point
│   ├── BrowseTournaments.tsx                 # Public tournament list (paginated)
│   ├── MyTournaments.tsx                     # Player's tournaments list
│   ├── OrganizerDashboard.tsx                # Organizer's tournaments list
│   └── TournamentDetail/                     # SHARED tournament detail (role-based)
│       ├── index.tsx                         # Main page, role detection, sub-page routing
│       ├── Standings.tsx                     # Shared standings view
│       ├── Matches.tsx                       # Shared matches list
│       ├── Bracket.tsx                       # Conditional: PlayerBracket or OrganizerBracket
│       ├── PlayerBracket.tsx                 # Match-focused list (current → upcoming → history)
│       ├── OrganizerBracket.tsx              # Full visual tree (@g-loot)
│       ├── GroupsManagement.tsx              # Organizer-only
│       ├── BracketGeneration.tsx             # Organizer-only
│       ├── BracketReview.tsx                 # Organizer-only
│       └── MatchDetails.tsx                  # Shared modal
├── components/
│   ├── shared/
│   │   ├── TournamentCard.tsx                # Reusable tournament card
│   │   ├── MatchCard.tsx                     # Reusable match card
│   │   ├── StandingsTable.tsx                # Virtualized standings table
│   │   ├── PhaseIndicator.tsx                # Tournament phase badge
│   │   ├── LoadingSpinner.tsx
│   │   ├── ErrorBanner.tsx
│   │   ├── ResponsiveLayout.tsx              # Mobile/tablet/desktop layout
│   │   ├── PaginationControls.tsx
│   │   └── SSEConnectionIndicator.tsx
├── hooks/
│   ├── usePermissions.ts                     # Role detection, capability checks
│   ├── useTournament.ts                      # Task #18 store access + bundle fetching
│   ├── useSSE.ts                             # SSE lifecycle management
│   ├── useInfiniteScroll.ts                  # Pagination/lazy loading
│   ├── useVirtualScroll.ts                   # List virtualization
│   └── usePrefetch.ts                        # Prefetch data on hover
├── services/
│   ├── tournament-api.ts                     # API client (uses /bundle endpoint)
│   ├── offline-sync.ts                       # Background sync service
│   └── image-loader.ts                       # Image lazy loading + WebP
├── workers/
│   └── service-worker.ts                     # Offline caching + sync
└── types.ts                                  # (Already exists from Task #18)
```

### 2.2 Core Components

#### StandingsTable.tsx (Virtualized)
- ✅ Uses react-window for virtualization (500+ players = smooth)
- ✅ Sortable columns (rank, wins, losses)
- ✅ Role-based rendering:
  - Player: read-only, shows own group only
  - Organizer: editable, shows all groups + override button
- ✅ SSE-aware: re-renders when `standings.updated` arrives
- ✅ Tests: rendering, virtualization, SSE updates, sorting

#### MatchCard.tsx (Reusable)
- ✅ Displays match info: player1, player2, status, score
- ✅ Conditional: "Submit Score" button (player only) or "Override" (organizer)
- ✅ Responsive: full on desktop, compact on mobile
- ✅ Tests: rendering, button visibility based on role/status

#### PlayerBracket.tsx (Match-Focused)
- ✅ Current Match: prominent display with score form
- ✅ Next Match (if win): TBD opponent, round indicator
- ✅ Match History: scrollable list of previous matches
- ✅ No complex SVG, just HTML/CSS cards
- ✅ Tests: rendering current/next/history, SSE updates

#### OrganizerBracket.tsx (Full Tree)
- ✅ @g-loot/react-tournament-brackets for visualization
- ✅ Pan/zoom for large brackets
- ✅ Edit seeding modal
- ✅ Publish button
- ✅ Tests: rendering, seeding edit, publish action

#### TournamentDetail/index.tsx (Role-Based Router)
```typescript
export default function TournamentDetail() {
  const { tournamentId } = useParams()
  const { currentUser } = useAuth()
  const permissions = usePermissions(tournamentId)
  
  // Render sub-page navigation (conditionally hide organizer-only tabs)
  // Render selected sub-page with role-aware components
}
```

### 2.3 Hooks (Core)

#### usePermissions.ts
```typescript
function usePermissions(tournamentId: string) {
  const { currentUser } = useAuth()
  const tournament = useTournament(tournamentId)
  
  return {
    canEditScores: currentUser.role === 'organizer',
    canPublishBracket: currentUser.id === tournament.creatorId,
    canManageGroups: currentUser.id === tournament.creatorId,
    canViewAllStandings: currentUser.role === 'organizer',
    playerRole: currentUser.role === 'player',
    organizerRole: currentUser.role === 'organizer'
  }
}
```

#### useTournament.ts
```typescript
function useTournament(tournamentId: string) {
  // Uses Task #18 stores as primary cache
  // Fetches /tournaments/:id/bundle on mount
  // Deduplicates requests (React Query)
  // Handles SSE updates
  
  const tournamentStore = useTournamentStore()
  const standingsStore = useStandingsStore()
  const matchStore = useMatchStore()
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => api.getTournamentBundle(tournamentId),
    onSuccess: (data) => {
      tournamentStore.set(data.tournament)
      standingsStore.update({ groupId: data.standings.groupId, standings: data.standings })
      matchStore.setMatches(data.matches)
    }
  })
  
  return { tournament: tournamentStore.tournament, isLoading, error }
}
```

#### useSSE.ts
```typescript
function useSSE(tournamentId: string) {
  // Tournament-scoped SSE subscription
  // Opens on mount, closes on unmount
  // Auto-reconnect with reconnecting-eventsource
  // Updates Task #18 stores
  
  useEffect(() => {
    const eventSource = new ReconnectingEventSource(
      `/tournaments/${tournamentId}/events`,
      { maxReconnectionDelay: 8000 }
    )
    
    eventSource.addEventListener('standings.updated', (e) => {
      const payload = JSON.parse(e.data)
      standingsStore.update(payload)
    })
    
    eventSource.addEventListener('bracket.published', (e) => {
      const payload = JSON.parse(e.data)
      matchStore.setMatches(payload.matches)
    })
    
    return () => eventSource.close()
  }, [tournamentId])
}
```

#### useInfiniteScroll.ts
```typescript
function useInfiniteScroll(fetchFn, initialSize = 20) {
  const [items, setItems] = useState([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  
  const loadMore = async () => {
    const newItems = await fetchFn(offset, initialSize)
    setItems(prev => [...prev, ...newItems])
    setOffset(prev => prev + initialSize)
    setHasMore(newItems.length === initialSize)
  }
  
  return { items, hasMore, loadMore }
}
```

#### useVirtualScroll.ts
```typescript
// Wrapper around react-window
function useVirtualScroll(items: any[], itemSize: number = 50) {
  return {
    items,
    itemSize,
    // ... react-window config
  }
}
```

#### usePrefetch.ts
```typescript
function usePrefetch(tournamentId: string) {
  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: ['tournament', tournamentId],
      queryFn: () => api.getTournamentBundle(tournamentId)
    })
  }
  
  return { handleMouseEnter }
}
```

### 2.4 Service Worker & Offline Support

**File:** `src/workers/service-worker.ts`

```typescript
// Cache strategies:
// - Cache tournament data with 5min TTL
// - Queue score submissions when offline
// - Sync queue when back online

const CACHE_NAME = 'tournament-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME))
})

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET') {
    // Cache-first for tournaments/standings
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
        .catch(() => caches.match(OFFLINE_URL))
    )
  } else if (event.request.method === 'POST') {
    // POST requests (score submissions) - queue if offline
    event.respondWith(
      fetch(event.request)
        .catch(() => queueForSync(event.request))
    )
  }
})

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-scores') {
    event.waitUntil(syncQueuedRequests())
  }
})
```

### 2.5 Image Optimization

**File:** `src/services/image-loader.ts`

```typescript
function getImageUrl(src: string, width?: number) {
  // Lazy load images via Intersection Observer
  // Convert to WebP if supported
  // Return responsive srcset
  // Example: /images/tournament.jpg → /images/tournament.webp (smaller)
}

// Usage in components:
<img 
  src={getImageUrl(tournament.logo, 200)}
  srcSet={`${getImageUrl(tournament.logo, 200)} 200w, ${getImageUrl(tournament.logo, 400)} 400w`}
  alt="Tournament"
/>
```

---

## Part 3: Testing Strategy

### Unit Tests (Jest + React Testing Library)

**StandingsTable.spec.tsx**
- ✅ Renders with virtualization (only visible rows in DOM)
- ✅ SSE update triggers re-render
- ✅ Player sees read-only, organizer sees edit button
- ✅ Sorting works
- ✅ Performance: 500-row table renders in <500ms

**MatchCard.spec.tsx**
- ✅ Renders match info correctly
- ✅ Player sees "Submit Score", organizer sees "Override"
- ✅ Click handlers work
- ✅ Responsive layout on mobile

**usePermissions.spec.ts**
- ✅ Returns correct permissions for player
- ✅ Returns correct permissions for organizer
- ✅ Organizer only sees edit features
- ✅ Player only sees submit score

**useTournament.spec.ts**
- ✅ Fetches /bundle endpoint
- ✅ Deduplicates simultaneous requests
- ✅ Updates Task #18 stores
- ✅ Handles errors gracefully

**useSSE.spec.ts**
- ✅ Opens SSE connection on mount
- ✅ Closes on unmount
- ✅ Handles standings.updated event
- ✅ Handles reconnection
- ✅ No memory leaks

**Service Worker tests**
- ✅ Caches GET requests
- ✅ Queues POST requests when offline
- ✅ Syncs queue when online
- ✅ Returns offline page when no cache

### Integration Tests

**Tournament Detail Flow**
- ✅ User enters tournament detail
- ✅ /bundle endpoint called once (not 3 separate calls)
- ✅ All data populated in stores
- ✅ SSE connects and subscription active
- ✅ Navigate between Standings/Matches/Bracket (no refetch, cached data)
- ✅ SSE event arrives → standings update in real-time
- ✅ User leaves tournament detail → SSE closes

**Offline Flow**
- ✅ App goes offline (network throttled)
- ✅ User submits score → queued (not sent)
- ✅ Shows "Syncing..." status
- ✅ App comes back online
- ✅ Queued submission sent automatically
- ✅ Shows "Synced" status

**Pagination Flow**
- ✅ Tournament list loads first 20 items
- ✅ User scrolls to bottom → loads next 20
- ✅ No redundant requests if scrolling back up

**Virtualization Flow**
- ✅ Standings table with 500 players
- ✅ Only ~15 rows rendered in DOM (not 500)
- ✅ Smooth scrolling without lag
- ✅ SSE update re-renders only affected row

### E2E Tests (Task #20)

- ✅ Full tournament flow: register → view standings → submit score → see live update
- ✅ Mobile-specific: rotate phone (landscape/portrait), network drops, backgrounding

---

## Part 4: Success Criteria

✅ **Performance:**
- Tournament detail loads in <1s (vs 3-5s without bundle)
- Standings table with 500 players scrolls at 60fps
- Navigation between pages is instant (from cache)
- SSE updates standings in <200ms

✅ **Mobile Experience:**
- Works offline (cached data visible, submissions queue)
- Battery-efficient (SSE only when needed, minimal parsing)
- Data-efficient (80% reduction from pagination + minimal responses + caching)
- Responsive layout works on all screen sizes

✅ **Code Quality:**
- All components tested (unit + integration)
- StandingsTable virtualization verified
- SSE lifecycle tested (no memory leaks)
- Service Worker sync verified
- Role-based rendering verified

✅ **Feature Complete:**
- Player can view standings, matches, bracket (match-focused)
- Player can submit scores
- Player can register for tournaments
- Organizer can create groups, generate bracket, publish
- Organizer can override scores
- Both roles see real-time updates via SSE

---

## Implementation Order

1. **API:** Consolidation endpoint (`/bundle`) — 30min
2. **Hooks:** usePermissions, useTournament, useSSE — 2h
3. **Components:** StandingsTable, MatchCard, TournamentDetail — 3h
4. **Pages:** Landing, BrowseTournaments, MyTournaments, OrganizerDashboard — 2h
5. **Mobile optimizations:** Service Worker, pagination, virtualization, prefetch — 4h
6. **Testing:** Unit + integration tests — 4h
7. **Polish:** Responsive design, error handling, accessibility — 2h

**Total estimate:** ~18-20 hours of focused development

---

## Notes

- This plan assumes React 18+, TypeScript, Vite (from TASK19_WIREFLOW.md recommendations)
- All optimizations are designed to work together, not in isolation
- Mobile-first approach: design for 320px screens first, enhance for larger
- Accessibility: all interactive elements keyboard navigable, proper ARIA labels
- Browser support: modern browsers (Chrome 90+, Safari 14+, Firefox 88+)
