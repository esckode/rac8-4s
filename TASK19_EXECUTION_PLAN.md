# Task #19: Execution Plan
## Frontend Components & Mobile Optimizations

**Project:** Doubles Pickleball Cup - Tournament Management System  
**Status:** Ready for Execution  
**Dependencies:** Tasks #1-18 (All COMPLETED)  
**Total Estimated Time:** 18-20 hours  
**React Version:** 19+

---

## Foundation: What Tasks 1-18 Delivered

### Backend Infrastructure (Tasks 1-6)
✅ **Task #1:** Monorepo structure with packages (api, core-logic, frontend, worker), Jest testing, TypeScript configuration  
✅ **Task #2:** Standings calculation algorithm with 100% test coverage (wins, tiebreakers, ranking)  
✅ **Task #3:** Bracket generation algorithm with 100% test coverage (seeding, byes, structure validation)  
✅ **Task #4:** Score parsing and validation with 100% test coverage  
✅ **Task #5:** Tournament state machine with 100% test coverage (phases, transitions, guards)  
✅ **Task #6:** API authentication (organizer email/password, player magic links, JWT tokens, authorization middleware)

### API Endpoints (Tasks 7-12)
✅ **Task #7:** Tournament CRUD endpoints (POST/GET/PATCH/DELETE /tournaments)  
✅ **Task #8:** Player registration and discovery endpoints (registration, partner confirmation, tournament browsing)  
✅ **Task #9:** Group stage management endpoints (group creation, standings retrieval, round-robin match generation)  
✅ **Task #10:** Score submission endpoints (submit, edit, deadline enforcement, organizer override)  
✅ **Task #11:** Bracket generation and management endpoints (generate from standings, publish, seeding override)  
✅ **Task #12:** Match coordination endpoints (list matches, confirm attendance, contact visibility)

### Async Infrastructure & Real-Time (Tasks 13-17)
✅ **Task #13:** InMemoryJobQueue with job consolidation, deduplication, retry logic, dead-letter queue  
✅ **Task #14:** Standings recalculation job (triggered by score submissions, emits SSE standings.updated event)  
✅ **Task #15:** Bracket generation job (triggered on phase advancement, emits SSE bracket.published event)  
✅ **Task #16:** Email notification job (registration confirmations, score reminders, bracket/results notifications)  
✅ **Task #17:** SSE endpoint and BroadcastBus (GET /tournaments/:id/events for real-time updates)

### Frontend State Layer (Task #18)
✅ **Task #18:** Frontend data management stores (tournament, standings, matches, bracket) with EventSource SSE integration, error handling, data consistency verification

### What Task #19 Consumes
- **Stores from Task #18:** `useTournamentStore`, `useStandingsStore`, `useMatchStore`, `useBracketStore`
- **API Endpoints:** GET /tournaments, POST /tournaments/:id/register, GET /tournaments/:id/bundle (new consolidation endpoint), GET /tournaments/:id/events (SSE)
- **Job Infrastructure:** Standings and bracket updates trigger SSE broadcasts automatically
- **Authentication:** Protected routes via JWT tokens, role-based authorization (player vs organizer)

---

## Task Overview

This execution plan breaks down TASK19_FINAL_PLAN.md into actionable, sequenced tasks with clear prerequisites and success criteria. Tasks are ordered to allow parallel work where possible while respecting critical dependencies.

---

## Phase 0: Design Specifications (Critical Path)

### Task 0.1: Create Design Specification Document
**File:** `TASK19_DESIGN_SPEC.md`  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Pastel Flat 2.0 design mockups finalized (TASK19_PASTEL_FLAT2_MOCKUP.html)
- ✅ Design token decisions made (colors, typography, spacing)

#### Implementation Steps
1. Create `TASK19_DESIGN_SPEC.md` with complete design system documentation
2. Document Color Palette section:
   - Primary: #A8D5FF (Soft sky blue)
   - Secondary: #D4A5F7 (Soft lavender)
   - Success: #A8E6C1 (Soft mint green)
   - Warning: #FFD9A8 (Soft peach)
   - Error: #FF9999 (Soft red)
   - Neutral grays: 50-900 scale
   - Map each color to Tailwind classes
3. Document Typography section:
   - Font family: system fonts (-apple-system, BlinkMacSystemFont, Segoe UI, Roboto)
   - Font sizes and weights for headings, body, small text
   - Line heights and letter spacing
   - Mobile scaling rules (e.g., Heading 1: 32px desktop → 24px mobile)
4. Document Spacing System section:
   - Base unit: 4px/8px
   - Spacing scale: xs (4px), sm (8px), md (16px), lg (24px), xl (32px)
5. Document Responsive Breakpoints:
   - Mobile: < 640px
   - Tablet: 640px - 1024px
   - Desktop: > 1024px
   - Mobile-first approach confirmed
6. Document Component Specifications for all 12+ components:
   - Buttons (primary, secondary, outline, disabled, loading)
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
7. For each component specify:
   - Default appearance (colors, spacing, typography)
   - Interactive states (hover, focus, active, disabled, loading)
   - Mobile appearance
   - Accessibility requirements (focus indicators, contrast)
8. Document Layout & Spacing Rules:
   - Page padding: 16px mobile, 24px tablet, 32px desktop
   - Card spacing: 16px gap
   - Section spacing: 24px between major sections
9. Document Accessibility Requirements:
   - Focus indicators visible on all interactive elements
   - WCAG AA minimum color contrast
   - Touch targets: 44px minimum on mobile
   - Keyboard navigation for all interactive elements
   - Screen reader support (semantic HTML, ARIA labels)

#### Success Criteria
- ✅ `TASK19_DESIGN_SPEC.md` exists with all sections documented
- ✅ Color palette fully specified with Tailwind mappings
- ✅ Typography scale documented for all text sizes
- ✅ Spacing system defined with examples
- ✅ All 12+ components specified with appearance + states + mobile + a11y
- ✅ Responsive breakpoints and mobile-first approach clearly documented
- ✅ Accessibility guidelines meet WCAG AA standards
- ✅ Design decisions align with Pastel Flat 2.0 mockup
- ✅ Developers can implement without asking "what color is this?"

---

### Task 0.2: Create Design Tokens File
**File:** `src/design/tokens.ts`  
**Estimated Time:** 1 hour  
**Owner:** TBD

#### Prerequisites
- ✅ Task 0.1 completed (design spec finalized)
- ✅ TypeScript project structure in place

#### Implementation Steps
1. Create `src/design/tokens.ts` file
2. Export `colors` object:
   - Pastel primary: #A8D5FF
   - Pastel secondary: #D4A5F7
   - Success: #A8E6C1
   - Warning: #FFD9A8
   - Error: #FF9999
   - Gray scale (50-900) in increments of 100
3. Export `typography` object:
   - heading1, heading2, body, small
   - Each with fontSize, fontWeight, lineHeight properties
4. Export `spacing` object:
   - xs, sm, md, lg, xl values
5. Export `breakpoints` object:
   - mobile: '640px'
   - tablet: '1024px'
6. Ensure all exports are TypeScript constants with proper types
7. Create simple unit test to verify tokens are properly exported

#### Success Criteria
- ✅ `src/design/tokens.ts` exists and exports all token categories
- ✅ Colors match Pastel Flat 2.0 palette exactly
- ✅ Typography tokens include all required properties
- ✅ Spacing values are consistent with design spec
- ✅ Tokens can be imported in components without errors
- ✅ TypeScript types are correct
- ✅ File is validated with unit test

---

### Task 0.3: Document Component Specifications
**File:** `src/components/COMPONENT_SPECS.md`  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 0.1 completed (design spec available)
- ✅ Task 0.2 completed (tokens defined)

#### Implementation Steps
1. Create `src/components/COMPONENT_SPECS.md`
2. Document each of the following components with sections:
   - **Appearance:** default colors, spacing, typography
   - **Interactive States:** hover, focus, active, disabled, loading
   - **Mobile Layout:** appearance and behavior on < 640px screens
   - **Accessibility:** focus indicators, contrast, keyboard nav, ARIA labels
   - **Example Usage:** code snippet showing typical implementation
3. Components to document (in order):
   - Button (primary, secondary, outline variants)
   - Form inputs (text, email, select, checkbox)
   - TournamentCard
   - MatchCard
   - StandingsTable (with virtualization note)
   - PhaseIndicator badge
   - LoadingSpinner
   - ErrorBanner / SuccessBanner
   - BottomNav (mobile navigation)
   - Breadcrumb navigation
   - Modal/Dialog
   - Skeleton loaders (for loading state)
4. Use Pastel Flat 2.0 colors from design tokens
5. Include examples showing Tailwind class usage

#### Success Criteria
- ✅ `src/components/COMPONENT_SPECS.md` exists with all components documented
- ✅ Each component has appearance, states, mobile, and a11y sections
- ✅ All colors reference design tokens
- ✅ Mobile layouts explicitly documented for < 640px
- ✅ Accessibility requirements specified for each component
- ✅ Example code snippets are accurate and implementable
- ✅ Developers can use this spec to build components to exact spec

---

## Phase 1: Backend API Enhancement

### Task 1.1: Create Consolidation Endpoint
**File:** `packages/api/src/routes/tournaments.ts` (modification)  
**Estimated Time:** 30 minutes  
**Owner:** TBD

#### Prerequisites
- ✅ Task #18 completed (backend functions exist: getTournament, getStandingsByTournament, getMatchesByTournament, getBracketByTournament)
- ✅ API routing structure in place
- ✅ Authorization middleware configured

#### Implementation Steps
1. Add new GET route `/tournaments/:id/bundle` to tournaments router
2. Implement endpoint to:
   - Accept optional `include` query parameter (comma-separated field list)
   - Default to including all fields: tournament, standings, matches, bracket
   - Build queries object based on included fields:
     - If 'tournament' included: call getTournament(tournamentId)
     - If 'standings' included: call getStandingsByTournament(tournamentId)
     - If 'matches' included: call getMatchesByTournament(tournamentId)
     - If 'bracket' included: call getBracketByTournament(tournamentId)
   - Execute all queries in parallel using Promise.all()
   - Combine results into single response object
   - Return consolidated JSON response
3. Ensure authorization checks run on all data (reuse existing permission logic)
4. Add proper error handling:
   - 401 if not authenticated
   - 403 if user lacks permission
   - 404 if tournament not found
5. Add structured logging:
   - Log 'tournament.bundle.fetched' event on success
   - Include tournamentId and userId in log
6. Add request/response type definitions

#### Success Criteria
- ✅ Endpoint exists at GET `/tournaments/:id/bundle`
- ✅ Full bundle returns all 4 fields: tournament, standings, matches, bracket
- ✅ Selective loading works: `?include=standings,matches` returns only those fields
- ✅ Authorization enforced (401 without token, 403 for unauthorized user)
- ✅ 404 returned for invalid tournament ID
- ✅ Players only see their own tournament data
- ✅ All 4 queries execute in parallel (Promise.all)
- ✅ Response is properly typed with TypeScript
- ✅ Logging added for audit trail
- ✅ Endpoint tested with Supertest

---

### Task 1.2: Test Consolidation Endpoint
**File:** `packages/api/src/routes/__tests__/tournaments.bundle.spec.ts` (new file)  
**Estimated Time:** 45 minutes  
**Owner:** TBD

#### Prerequisites
- ✅ Task 1.1 completed (endpoint implemented)
- ✅ Jest and Supertest configured
- ✅ Test database/fixtures set up

#### Implementation Steps
1. Create test file: `packages/api/src/routes/__tests__/tournaments.bundle.spec.ts`
2. Write unit tests (using Supertest) for:
   - **Full bundle:** GET `/tournaments/:id/bundle` returns all 4 fields
   - **Selective loading:** GET `/tournaments/:id/bundle?include=standings,matches` returns only 2 fields
   - **Authorization:** 401 without token
   - **Authorization:** 403 for user not in tournament
   - **Not found:** 404 for invalid tournament ID
   - **Player isolation:** Player only sees own tournament data (403 for tournaments they're not in)
   - **Organizer access:** Organizer can see their tournaments
   - **Data consistency:** Response data structure matches API contract
   - **Performance:** Verify parallel query execution (optional timing check)
3. Use fixtures/mocks for tournament, standings, matches, bracket data
4. Test with both player and organizer tokens
5. Ensure all edge cases covered

#### Success Criteria
- ✅ 8+ test cases covering all scenarios
- ✅ All tests passing (green)
- ✅ Full bundle test passes (all 4 fields returned)
- ✅ Selective loading test passes
- ✅ Authorization tests pass (401, 403)
- ✅ 404 not found test passes
- ✅ Player isolation test passes
- ✅ Data consistency verified
- ✅ Test coverage > 95% for endpoint

---

## Phase 2: Frontend Hooks (Core Logic)

### Task 2.1: Create usePermissions Hook
**File:** `src/hooks/usePermissions.ts`  
**Estimated Time:** 45 minutes  
**Owner:** TBD

#### Prerequisites
- ✅ Task #18 completed (useAuth hook exists)
- ✅ Tournament store structure defined
- ✅ React hooks pattern established

#### Implementation Steps
1. Create `src/hooks/usePermissions.ts`
2. Implement hook to accept `tournamentId` parameter
3. Use useAuth() to get current user
4. Use useTournament() to get tournament data
5. Return permissions object with:
   - `canEditScores`: true only if organizerRole
   - `canPublishBracket`: true only if currentUser.id === tournament.creatorId
   - `canManageGroups`: true only if currentUser.id === tournament.creatorId
   - `canViewAllStandings`: true only if organizerRole
   - `playerRole`: true if user role is 'player'
   - `organizerRole`: true if user role is 'organizer'
6. Ensure permissions update reactively when user or tournament changes
7. Add TypeScript types for permissions object

#### Success Criteria
- ✅ Hook exports usePermissions function
- ✅ Players return correct permissions (playerRole=true, canEditScores=false)
- ✅ Organizers return correct permissions (organizerRole=true, canEditScores=true)
- ✅ Only tournament creator can publish bracket and manage groups
- ✅ Permissions object properly typed with TypeScript
- ✅ Hook works with React Suspense and error boundaries
- ✅ Permissions update when user/tournament changes

---

### Task 2.2: Test usePermissions Hook
**File:** `src/hooks/__tests__/usePermissions.spec.ts`  
**Estimated Time:** 1 hour  
**Owner:** TBD

#### Prerequisites
- ✅ Task 2.1 completed (hook implemented)
- ✅ React Testing Library configured
- ✅ renderHook utility available

#### Implementation Steps
1. Create test file: `src/hooks/__tests__/usePermissions.spec.ts`
2. Write unit tests for:
   - Player role returns correct permissions
   - Organizer role returns correct permissions
   - Non-creator organizer can't manage groups (only creator can)
   - Non-creator organizer can't publish bracket
   - Permissions update when user role changes
   - Permissions update when tournament creatorId changes
   - Edge case: null user
   - Edge case: null tournament
3. Use renderHook with AuthProvider and TournamentProvider wrappers
4. Mock tournament and user data
5. Test with both factory/fixture patterns

#### Success Criteria
- ✅ 8+ test cases covering all permission scenarios
- ✅ All tests passing (green)
- ✅ Player permissions test passes
- ✅ Organizer permissions test passes
- ✅ Creator-only permissions test passes
- ✅ Permissions update reactively on changes
- ✅ Edge cases handled (null user, null tournament)
- ✅ Test coverage > 95%

---

### Task 2.3: Create useTournament Hook
**File:** `src/hooks/useTournament.ts`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task #18 completed (stores: useTournamentStore, useStandingsStore, useMatchStore)
- ✅ Task 1.1 completed (GET /tournaments/:id/bundle endpoint exists)
- ✅ React Query configured in project
- ✅ API client library set up

#### Implementation Steps
1. Create `src/hooks/useTournament.ts`
2. Implement hook to accept `tournamentId` parameter
3. Set up React Query with:
   - queryKey: ['tournament', tournamentId]
   - queryFn: () => api.getTournamentBundle(tournamentId)
   - staleTime: 5 minutes
   - cacheTime: 30 minutes
4. On successful fetch, update stores:
   - tournamentStore.set(data.tournament)
   - standingsStore.update(data.standings)
   - matchStore.setMatches(data.matches)
   - bracketStore.setBracket(data.bracket)
5. Return object with:
   - tournament (from store)
   - standings (from store)
   - matches (from store)
   - bracket (from store)
   - isLoading (from useQuery)
   - error (from useQuery)
   - refetch (from useQuery)
6. Add TypeScript types for hook response

#### Success Criteria
- ✅ Hook exports useTournament function
- ✅ Fetches from GET `/tournaments/:id/bundle` endpoint
- ✅ Deduplicates simultaneous requests (React Query caching)
- ✅ Updates all stores on successful fetch
- ✅ Returns loading and error states
- ✅ Provides refetch capability
- ✅ Response properly typed with TypeScript
- ✅ Works with Suspense boundaries

---

### Task 2.4: Test useTournament Hook
**File:** `src/hooks/__tests__/useTournament.spec.ts`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 2.3 completed (hook implemented)
- ✅ React Testing Library configured
- ✅ React Query test utilities set up

#### Implementation Steps
1. Create test file: `src/hooks/__tests__/useTournament.spec.ts`
2. Write unit tests for:
   - Fetches /tournaments/:id/bundle on mount
   - Request deduplication: two simultaneous calls = one request
   - Updates tournament store on fetch success
   - Updates standings store on fetch success
   - Updates matches store on fetch success
   - Updates bracket store on fetch success
   - Error handling: gracefully handles fetch errors
   - Loading state: isLoading=true while fetching
   - Cache: subsequent call uses cached data (within staleTime)
   - Refetch: manual refetch function works
3. Mock fetch and stores
4. Use renderHook with QueryClientProvider wrapper
5. Test store updates using store observers

#### Success Criteria
- ✅ 10+ test cases covering all scenarios
- ✅ All tests passing (green)
- ✅ Fetch test passes (/bundle endpoint called)
- ✅ Deduplication test passes (single request for parallel calls)
- ✅ Store update tests pass (all 4 stores updated)
- ✅ Error handling test passes
- ✅ Loading state test passes
- ✅ Cache test passes
- ✅ Refetch test passes
- ✅ Test coverage > 95%

---

### Task 2.5: Create useSSE Hook
**File:** `src/hooks/useSSE.ts`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task #18 completed (stores available)
- ✅ reconnecting-eventsource library installed
- ✅ Backend SSE endpoint available: GET /tournaments/:id/events

#### Implementation Steps
1. Create `src/hooks/useSSE.ts`
2. Import reconnecting-eventsource library
3. Implement hook to accept `tournamentId` parameter
4. In useEffect:
   - Create ReconnectingEventSource to `/tournaments/:id/events`
   - Set maxReconnectionDelay: 8000 (8 seconds)
   - Add event listeners for:
     - 'standings.updated': parse data, call standingsStore.update()
     - 'bracket.published': parse data, call matchStore.setMatches()
     - Other relevant tournament events
   - Return cleanup function: eventSource.close()
5. Add error handling:
   - Log connection errors
   - Log parsing errors
   - Don't crash on malformed data
6. Return object with:
   - connected: boolean (connection status)
   - error: error message if connection failed
7. Ensure hook only opens connection when tournamentId is provided

#### Success Criteria
- ✅ Hook exports useSSE function
- ✅ Creates ReconnectingEventSource on mount
- ✅ Closes connection on unmount
- ✅ Listens for standings.updated event
- ✅ Listens for bracket.published event
- ✅ Updates stores with event data
- ✅ Auto-reconnect works with reconnecting-eventsource
- ✅ Error handling prevents crashes
- ✅ Returns connection status
- ✅ No memory leaks on unmount

---

### Task 2.6: Test useSSE Hook
**File:** `src/hooks/__tests__/useSSE.spec.ts`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 2.5 completed (hook implemented)
- ✅ React Testing Library configured
- ✅ Mock EventSource library available

#### Implementation Steps
1. Create test file: `src/hooks/__tests__/useSSE.spec.ts`
2. Write unit tests for:
   - Opens EventSource on mount with correct URL
   - Closes EventSource on unmount
   - Handles standings.updated event and updates store
   - Handles bracket.published event and updates store
   - Auto-reconnect mechanism works (via reconnecting-eventsource)
   - Error event handling (malformed data doesn't crash)
   - Connected status updates correctly
   - No memory leaks: cleanup function runs on unmount
   - Doesn't open connection if tournamentId is undefined
3. Mock ReconnectingEventSource constructor
4. Mock addEventListener and close methods
5. Simulate SSE events using act() and dispatchEvent()
6. Test cleanup with unmount

#### Success Criteria
- ✅ 8+ test cases covering all SSE scenarios
- ✅ All tests passing (green)
- ✅ Connection open test passes
- ✅ Connection close test passes
- ✅ Event listener tests pass (standings, bracket)
- ✅ Auto-reconnect test passes
- ✅ Error handling test passes
- ✅ Memory leak test passes (cleanup runs)
- ✅ Test coverage > 95%

---

### Task 2.7: Create Additional Hooks (useInfiniteScroll, useVirtualScroll, usePrefetch)
**File:** `src/hooks/useInfiniteScroll.ts`, `src/hooks/useVirtualScroll.ts`, `src/hooks/usePrefetch.ts`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ React Query configured
- ✅ react-window library installed
- ✅ API client available

#### Implementation Steps
1. Create `src/hooks/useInfiniteScroll.ts`:
   - Accept fetchFn and initialSize (default 20)
   - Manage items, offset, hasMore state
   - Implement loadMore function that calls fetchFn(offset, initialSize)
   - Return { items, hasMore, loadMore, offset }

2. Create `src/hooks/useVirtualScroll.ts`:
   - Wrapper around react-window VariableSizeList
   - Accept items array and itemSize parameter
   - Return config object for VariableSizeList

3. Create `src/hooks/usePrefetch.ts`:
   - Accept tournamentId parameter
   - Use React Query's queryClient.prefetchQuery
   - Return handleMouseEnter function for prefetching on hover
   - Return handleFocus function for prefetching on focus

#### Success Criteria
- ✅ All three hooks export functions
- ✅ useInfiniteScroll properly manages pagination state
- ✅ useVirtualScroll provides react-window config
- ✅ usePrefetch triggers prefetch on hover/focus
- ✅ Hooks properly typed with TypeScript
- ✅ No console errors or warnings

---

## Phase 3: Frontend Components

### Task 3.1: Create Shared Components (Button, Badge, Spinner, Banner)
**File:** `src/components/shared/` (multiple files)  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 0.2 completed (design tokens available)
- ✅ Tailwind CSS configured
- ✅ TypeScript set up

#### Implementation Steps
1. Create `src/components/shared/Button.tsx`:
   - Accept props: variant ('primary' | 'secondary' | 'outline'), size ('sm' | 'md' | 'lg'), disabled, loading, children
   - Style using design tokens (colors, spacing)
   - Support all interactive states (hover, focus, active, disabled, loading)
   - Mobile: 44px minimum touch target
   - Accessibility: focus ring, proper semantic HTML

2. Create `src/components/shared/Badge.tsx` (for PhaseIndicator):
   - Accept props: variant ('group' | 'knockout' | 'live'), children
   - Use Pastel colors from design tokens
   - Compact styling

3. Create `src/components/shared/LoadingSpinner.tsx`:
   - Show animated spinner
   - Accept size prop
   - Optional label text

4. Create `src/components/shared/ErrorBanner.tsx`:
   - Accept message and onDismiss props
   - Use error color from design tokens
   - Include close button
   - Accessibility: role="alert"

5. Create `src/components/shared/SuccessBanner.tsx`:
   - Accept message and onDismiss props
   - Use success color from design tokens
   - Include close button

6. Create `src/components/shared/SkeletonLoader.tsx`:
   - Shimmer animation
   - Accept height/width props

#### Success Criteria
- ✅ Button component renders with all variants
- ✅ Button supports all interactive states
- ✅ Badge renders with correct colors
- ✅ Spinner animates smoothly
- ✅ Banners show/dismiss correctly
- ✅ All components use design tokens (no hardcoded colors)
- ✅ Mobile touch targets are 44px minimum
- ✅ Accessibility: focus indicators visible, ARIA labels where needed
- ✅ Components styled with Pastel Flat 2.0 palette

---

### Task 3.2: Create StandingsTable Component (Virtualized)
**File:** `src/components/shared/StandingsTable.tsx`  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 0.2 completed (design tokens)
- ✅ Task 0.3 completed (component specs)
- ✅ Task 3.1 completed (shared components)
- ✅ react-window library installed
- ✅ Task #18 stores available

#### Implementation Steps
1. Create `src/components/shared/StandingsTable.tsx`
2. Accept props:
   - standings: array of standing objects
   - isLoading: boolean
   - error: error message
   - userRole: 'player' | 'organizer'
   - onRowClick: optional handler
   - onOverride: optional handler (organizer only)
3. Implement table structure:
   - Header row: Rank, Team, Matches, Wins, Losses, Set Diff, Actions
   - Body rows: one row per team
4. Use react-window FixedSizeList for virtualization:
   - Only render visible rows (~15) + buffer
   - Support smooth scrolling
5. Style using design tokens:
   - Header: gray-100 background
   - Rows: white/gray-50 alternating
   - Text: gray-900 for data, gray-600 for labels
6. Interactive states:
   - Row hover: light blue background
   - Sorting: clickable headers with up/down indicators
7. Role-based rendering:
   - Player: read-only, no edit buttons
   - Organizer: shows "Override" button on hover
8. Handle loading state: show skeleton loaders
9. Handle error state: show error banner with retry
10. Handle empty state: show "No standings available" message
11. Mobile layout (< 640px):
    - Reduce padding
    - Smaller font sizes
    - Essential columns only

#### Success Criteria
- ✅ Component renders standings table with headers
- ✅ Virtualization works: only visible rows in DOM
- ✅ 500-row table renders in < 500ms
- ✅ 500-row table scrolls at 60fps
- ✅ Sorting functionality works
- ✅ Player role: read-only, no override button
- ✅ Organizer role: override button visible
- ✅ Loading state shows skeleton loaders
- ✅ Error state shows error banner
- ✅ Empty state shows proper message
- ✅ Mobile layout responsive and readable
- ✅ Colors match Pastel Flat 2.0 palette

---

### Task 3.3: Create MatchCard Component
**File:** `src/components/shared/MatchCard.tsx`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 0.2 completed (design tokens)
- ✅ Task 0.3 completed (component specs)
- ✅ Task 3.1 completed (shared components)

#### Implementation Steps
1. Create `src/components/shared/MatchCard.tsx`
2. Accept props:
   - match: match object with player1, player2, status, score, etc.
   - userRole: 'player' | 'organizer'
   - onClick: handler for viewing details
   - onSubmitScore: handler (player only)
   - onOverride: handler (organizer only)
3. Render card structure:
   - Container: white background, border, rounded, padding
   - Player 1 name (semibold, large)
   - vs text (small, gray)
   - Player 2 name (semibold, large)
   - Status badge (pending: yellow, completed: green, cancelled: red)
   - Score (if completed): large, bold
   - Actions section (based on role and status)
4. Interactive states:
   - Hover: slightly darker background, shadow
   - Click: navigate to match detail
5. Role-based rendering:
   - Player (pending match): "Submit Score" button
   - Player (completed): read-only, no buttons
   - Organizer: "Override" button always visible
6. Loading state: spinner overlay
7. Mobile layout (< 640px):
   - Full width
   - Player names on same line if possible
   - Large, easily tappable buttons

#### Success Criteria
- ✅ Component renders match info correctly
- ✅ Status badge displays with correct color
- ✅ Score displays when completed
- ✅ Player sees "Submit Score" button (pending only)
- ✅ Organizer sees "Override" button
- ✅ Click handlers work
- ✅ Responsive on mobile
- ✅ Loading state works
- ✅ Colors match Pastel Flat 2.0

---

### Task 3.4: Create TournamentCard Component
**File:** `src/components/shared/TournamentCard.tsx`  
**Estimated Time:** 1 hour  
**Owner:** TBD

#### Prerequisites
- ✅ Task 0.2 completed (design tokens)
- ✅ Task 0.3 completed (component specs)
- ✅ Task 3.1 completed (shared components)

#### Implementation Steps
1. Create `src/components/shared/TournamentCard.tsx`
2. Accept props:
   - tournament: tournament object
   - onClick: handler
   - meta: optional metadata (e.g., "8/16 players", "Group stage active")
3. Render card structure:
   - Title (large, bold)
   - Sport type (small, gray)
   - Player count / bracket progress
   - Phase badge (group/knockout)
   - Date/time
4. Style using design tokens
5. Mobile responsive

#### Success Criteria
- ✅ Component renders tournament info
- ✅ Phase badge displays correctly
- ✅ Click handler works
- ✅ Responsive on mobile
- ✅ Colors use design tokens

---

### Task 3.5: Create PhaseIndicator Component
**File:** `src/components/shared/PhaseIndicator.tsx`  
**Estimated Time:** 30 minutes  
**Owner:** TBD

#### Prerequisites
- ✅ Task 0.2 completed (design tokens)

#### Implementation Steps
1. Create `src/components/shared/PhaseIndicator.tsx`
2. Accept props: phase ('group' | 'knockout'), size ('sm' | 'md')
3. Badge-style indicator
4. Use appropriate color per phase
5. Uppercase text

#### Success Criteria
- ✅ Component renders badge correctly
- ✅ Colors match spec
- ✅ Sizes render correctly

---

### Task 3.6: Create Modal/Dialog Component
**File:** `src/components/shared/Modal.tsx`  
**Estimated Time:** 1 hour  
**Owner:** TBD

#### Prerequisites
- ✅ Task 0.2 completed (design tokens)

#### Implementation Steps
1. Create `src/components/shared/Modal.tsx`
2. Accept props: isOpen, onClose, title, children, actions
3. Render overlay + modal box
4. Support scrolling content
5. Close on escape key
6. Accessibility: focus management, role="dialog"

#### Success Criteria
- ✅ Component renders modal correctly
- ✅ Close button works
- ✅ Escape key closes modal
- ✅ Overlay click closes modal
- ✅ Accessibility proper (focus, role)

---

## Phase 4: Pages and Routing

### Task 4.1: Create Layout Infrastructure
**File:** `src/components/shared/ResponsiveLayout.tsx` and routing setup  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 3.1 completed (shared components)
- ✅ react-router v6 configured

#### Implementation Steps
1. Create `src/components/shared/ResponsiveLayout.tsx`:
   - Layout component with header, main, bottom nav
   - Show/hide bottom nav based on breakpoint
   - Desktop: top navigation
   - Mobile: bottom tab bar
2. Create bottom tab bar component:
   - 4 tabs: Standings, Matches, Bracket, More
   - Icon + label per tab
   - Active indicator
   - Touch-friendly sizing
3. Set up React Router structure:
   - BrowserRouter
   - Routes with nested paths
   - Lazy loading where appropriate
4. Create navigation hooks:
   - useNavigate helper
   - Active tab detection

#### Success Criteria
- ✅ Layout component renders correctly
- ✅ Bottom nav appears on mobile (< 640px)
- ✅ Top nav appears on desktop (>= 640px)
- ✅ Routing structure set up
- ✅ Navigation state managed correctly

---

### Task 4.2: Create Landing Page
**File:** `src/pages/Landing.tsx`  
**Estimated Time:** 1 hour  
**Owner:** TBD

#### Prerequisites
- ✅ Task 4.1 completed (layout infrastructure)
- ✅ Task 3.1 completed (shared components)

#### Implementation Steps
1. Create `src/pages/Landing.tsx`
2. Display:
   - App title
   - Brief description
   - "Browse Tournaments" button
   - "My Tournaments" button (if logged in)
   - Login/logout button (based on auth state)
3. Use Pastel Flat 2.0 design
4. Mobile responsive

#### Success Criteria
- ✅ Page renders
- ✅ Navigation buttons work
- ✅ Auth state reflected
- ✅ Mobile responsive

---

### Task 4.3: Create BrowseTournaments Page
**File:** `src/pages/BrowseTournaments.tsx`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 4.1 completed (layout)
- ✅ Task 3.4 completed (TournamentCard)
- ✅ Task 2.7 completed (useInfiniteScroll hook)

#### Implementation Steps
1. Create `src/pages/BrowseTournaments.tsx`
2. Display:
   - List of all public tournaments
   - TournamentCard for each
   - Infinite scroll: load 20 initially, "Load more" button
3. Use useInfiniteScroll hook:
   - API call to GET /tournaments?offset=X&limit=20
   - Append to list as user scrolls
4. Loading state while fetching
5. Error handling
6. Mobile responsive

#### Success Criteria
- ✅ Page renders tournament list
- ✅ First 20 tournaments load
- ✅ "Load more" button works
- ✅ No duplicate requests on scroll
- ✅ Loading state shown
- ✅ Error handling works
- ✅ Mobile responsive

---

### Task 4.4: Create MyTournaments Page
**File:** `src/pages/MyTournaments.tsx`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 4.1 completed (layout)
- ✅ Task 3.4 completed (TournamentCard)
- ✅ Task 2.1 completed (usePermissions)

#### Implementation Steps
1. Create `src/pages/MyTournaments.tsx`
2. Display:
   - Tournaments user is registered for
   - Organized by: "Active", "Upcoming", "Completed"
   - TournamentCard for each
3. Click tournament → navigate to TournamentDetail
4. Empty state: "No tournaments yet"
5. Mobile responsive

#### Success Criteria
- ✅ Page displays user's tournaments
- ✅ Grouped by status
- ✅ Click navigates to detail
- ✅ Empty state shown
- ✅ Mobile responsive

---

### Task 4.5: Create OrganizerDashboard Page
**File:** `src/pages/OrganizerDashboard.tsx`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 4.1 completed (layout)
- ✅ Task 3.4 completed (TournamentCard)
- ✅ Task 2.1 completed (usePermissions)

#### Implementation Steps
1. Create `src/pages/OrganizerDashboard.tsx`
2. Display:
   - Tournaments organized by current user
   - TournamentCard for each
   - "Create Tournament" button (if organizer)
3. Click tournament → navigate to TournamentDetail (organizer view)
4. Empty state: "No tournaments organized"
5. Mobile responsive

#### Success Criteria
- ✅ Page displays organized tournaments
- ✅ "Create" button visible for organizers
- ✅ Click navigates to detail
- ✅ Empty state shown
- ✅ Mobile responsive

---

### Task 4.6: Create TournamentDetail Page (Shared with Role-Based Rendering)
**File:** `src/pages/TournamentDetail/index.tsx` and sub-pages  
**Estimated Time:** 3 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 4.1 completed (layout)
- ✅ Task 2.1 completed (usePermissions)
- ✅ Task 2.3 completed (useTournament)
- ✅ Task 2.5 completed (useSSE)
- ✅ Task 3.2 completed (StandingsTable)
- ✅ Task 3.3 completed (MatchCard)

#### Implementation Steps
1. Create `src/pages/TournamentDetail/index.tsx`:
   - Extract tournamentId from URL params
   - Call useTournament(tournamentId)
   - Call usePermissions(tournamentId)
   - Call useSSE(tournamentId)
   - Detect role and render appropriate tabs
   - Render sub-page routing

2. Create `src/pages/TournamentDetail/Standings.tsx`:
   - Use useTournament to get standings
   - Render StandingsTable
   - SSE updates trigger re-render
   - Player: read-only
   - Organizer: override button visible

3. Create `src/pages/TournamentDetail/Matches.tsx`:
   - List matches in tournament
   - Render MatchCard for each
   - Filter by status (upcoming, completed)
   - Click → MatchDetails modal

4. Create `src/pages/TournamentDetail/PlayerBracket.tsx`:
   - Current Match: prominent display, score form
   - Next Match (if win): TBD opponent, round indicator
   - Match History: scrollable list
   - No complex SVG, just cards

5. Create `src/pages/TournamentDetail/OrganizerBracket.tsx`:
   - Use @g-loot/react-tournament-brackets
   - Visual tree of bracket
   - Pan/zoom support
   - Edit seeding modal
   - Publish button

6. Create `src/pages/TournamentDetail/GroupsManagement.tsx` (organizer only):
   - List groups
   - Manage group memberships
   - Add/remove players

7. Create `src/pages/TournamentDetail/BracketGeneration.tsx` (organizer only):
   - Form to generate bracket
   - Seeding options
   - Generate button

8. Create `src/pages/TournamentDetail/MatchDetails.tsx` (modal):
   - Match details
   - Score submission form (player) / override form (organizer)

#### Success Criteria
- ✅ TournamentDetail page loads and displays tournament
- ✅ Standings page renders and updates via SSE
- ✅ Matches page lists matches and MatchCards
- ✅ PlayerBracket shows current/next/history
- ✅ OrganizerBracket shows visual bracket
- ✅ GroupsManagement shows groups (organizer only)
- ✅ BracketGeneration shows form (organizer only)
- ✅ MatchDetails modal works
- ✅ Role-based rendering: players see read-only, organizers see edit controls
- ✅ SSE updates reflected in real-time
- ✅ Navigation between sub-pages works
- ✅ Mobile responsive

---

## Phase 5: Mobile Optimizations

### Task 5.1: Create Service Worker
**File:** `src/workers/service-worker.ts` and registration  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 4.6 completed (pages exist)
- ✅ TypeScript configured

#### Implementation Steps
1. Create `src/workers/service-worker.ts`
2. Implement install event:
   - Create CACHE_NAME = 'tournament-v1'
   - Cache offline.html fallback page
3. Implement fetch event:
   - GET requests: cache-first strategy
     - Try cache first, fall back to network
     - Cache response on network success
     - Serve offline.html on network failure and not in cache
   - POST requests: queue if offline
     - Try to fetch normally
     - If offline, queue request with queueForSync()
4. Implement sync event:
   - Listen for 'sync-scores' tag
   - Call syncQueuedRequests() to send queued POSTs
5. Queue management:
   - Store queue in IndexedDB
   - queueForSync(request): add to queue
   - syncQueuedRequests(): send all queued requests
6. Add error handling and logging

#### Success Criteria
- ✅ Service Worker installs without errors
- ✅ GET requests cached and served offline
- ✅ offline.html served on cache miss
- ✅ POST requests queued when offline
- ✅ Queued requests synced when online
- ✅ Queue persists in IndexedDB
- ✅ No console errors

---

### Task 5.2: Register Service Worker
**File:** `src/main.tsx` or `src/index.tsx`  
**Estimated Time:** 30 minutes  
**Owner:** TBD

#### Prerequisites
- ✅ Task 5.1 completed (service worker exists)

#### Implementation Steps
1. In main application entry point:
2. Add registration code:
   ```typescript
   if ('serviceWorker' in navigator) {
     navigator.serviceWorker.register('/service-worker.js').then(...)
   }
   ```
3. Add error handling
4. Log success/failure

#### Success Criteria
- ✅ Service Worker registers on app load
- ✅ No console errors
- ✅ DevTools shows registered worker

---

### Task 5.3: Create Image Optimization Service
**File:** `src/services/image-loader.ts`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Image serving infrastructure set up

#### Implementation Steps
1. Create `src/services/image-loader.ts`
2. Implement getImageUrl function:
   - Input: image src, optional width
   - Output: optimized image URL
   - Convert .jpg/.png to .webp if supported
   - Resize to requested width
   - Example: /images/tournament.jpg → /images/tournament.webp
3. Implement lazy loading via Intersection Observer:
   - Custom hook: useImageLazyLoad
   - Trigger image load only when visible
4. Generate responsive srcset:
   - Multiple sizes (200w, 400w, 800w)
   - Browser picks best size
5. Add fallback for unsupported formats

#### Success Criteria
- ✅ getImageUrl function works
- ✅ WebP conversion works
- ✅ Lazy loading works
- ✅ Responsive srcset generated
- ✅ Fallback for unsupported browsers

---

### Task 5.4: Create Pagination Controls
**File:** `src/components/shared/PaginationControls.tsx`  
**Estimated Time:** 1 hour  
**Owner:** TBD

#### Prerequisites
- ✅ Task 2.7 completed (useInfiniteScroll hook)

#### Implementation Steps
1. Create `src/components/shared/PaginationControls.tsx`
2. Accept props:
   - hasMore: boolean
   - isLoading: boolean
   - onLoadMore: function
3. Render "Load More" button
4. Show loading state while fetching
5. Hide when no more items
6. Mobile responsive

#### Success Criteria
- ✅ Component renders button
- ✅ onLoadMore called when clicked
- ✅ Loading state shown
- ✅ Button hidden when hasMore=false

---

### Task 5.5: Create Prefetch Strategy
**File:** `src/hooks/usePrefetch.ts` (implementation) + `src/components/shared/TournamentCard.tsx` (integration)  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 2.7 completed (usePrefetch hook)
- ✅ Task 3.4 completed (TournamentCard)

#### Implementation Steps
1. Enhance TournamentCard to call usePrefetch:
   - Get handleMouseEnter from usePrefetch(tournamentId)
   - Attach to card onMouseEnter
2. Implement prefetch in hook:
   - Query tournament bundle data on hover
   - Only if user actually navigates, data is cached
3. Add similar prefetch on focus (keyboard navigation)
4. Log prefetch events (debug level)

#### Success Criteria
- ✅ usePrefetch hook called on hover
- ✅ Data prefetched in background
- ✅ No visual delay when navigating
- ✅ Works on mobile (focus, not hover)

---

### Task 5.6: Optimize Request Deduplication
**File:** `src/hooks/useTournament.ts` (already implemented with React Query)  
**Estimated Time:** Included in Task 2.3  
**Owner:** TBD

#### Prerequisites
- ✅ Task 2.3 completed (useTournament with React Query)

#### Implementation Steps
- React Query already deduplicates requests by default
- Verify caching behavior:
  - Two simultaneous calls to useTournament('t123') = one request
  - Within staleTime (5min), cached data returned
- Write integration test to verify

#### Success Criteria
- ✅ Duplicate requests eliminated
- ✅ Cache behavior verified
- ✅ Test passing

---

## Phase 6: Testing (Full TDD)

### Task 6.1: Test StandingsTable Component
**File:** `src/components/shared/__tests__/StandingsTable.spec.tsx`  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 3.2 completed (component implemented)
- ✅ Jest and React Testing Library configured

#### Implementation Steps
1. Create test file: `src/components/shared/__tests__/StandingsTable.spec.tsx`
2. Write test cases (from TASK19_FINAL_PLAN.md):
   - Renders standings table with headers
   - Virtualization: only visible rows in DOM
   - Virtualization: 500-row table renders in < 500ms
   - Virtualization: 500-row table scrolls smoothly
   - Role-based: player sees read-only table
   - Role-based: organizer sees override button
   - SSE: standings.updated event triggers re-render
   - Sorting: clicking header sorts by that column
   - Loading state: shows skeleton loaders
   - Error state: shows error banner
   - Empty state: shows "No standings available"
   - Responsive: mobile layout on small screens
   - Performance: 500 rows < 500ms render time
3. Use React Testing Library best practices
4. Mock data and stores
5. Test keyboard navigation and focus

#### Success Criteria
- ✅ 13+ test cases covering all scenarios
- ✅ All tests passing (green)
- ✅ Virtualization verified
- ✅ SSE updates verified
- ✅ Role-based rendering verified
- ✅ Performance target met (500 rows < 500ms)
- ✅ Test coverage > 95%

---

### Task 6.2: Test MatchCard Component
**File:** `src/components/shared/__tests__/MatchCard.spec.tsx`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 3.3 completed (component implemented)

#### Implementation Steps
1. Create test file: `src/components/shared/__tests__/MatchCard.spec.tsx`
2. Write test cases:
   - Renders match info (player1, player2, status)
   - Renders score when completed
   - Player role: shows "Submit Score" (pending) or read-only (completed)
   - Organizer role: always shows "Override" button
   - Click handlers work (submit, override)
   - Responsive on mobile
   - Loading state works
   - Accessibility: proper semantics, focus indicators
3. Test all status types (pending, completed, cancelled)

#### Success Criteria
- ✅ 8+ test cases
- ✅ All tests passing
- ✅ Role-based rendering verified
- ✅ Click handlers verified
- ✅ Mobile responsive verified
- ✅ Test coverage > 95%

---

### Task 6.3: Test Consolidation Endpoint
**File:** `packages/api/src/routes/__tests__/tournaments.bundle.spec.ts`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 1.1 completed (endpoint implemented)
- ✅ Task 1.2 completed (tests written, but verify all passing)

#### Implementation Steps
- Run existing tests from Task 1.2
- Verify all 8+ tests pass
- Check coverage > 95%

#### Success Criteria
- ✅ All endpoint tests passing
- ✅ Coverage > 95%

---

### Task 6.4: Integration Test: Tournament Detail Flow
**File:** `src/pages/TournamentDetail/__tests__/flow.spec.tsx`  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 4.6 completed (TournamentDetail page)
- ✅ Task 2.3 completed (useTournament hook)
- ✅ Task 2.5 completed (useSSE hook)

#### Implementation Steps
1. Create integration test file
2. Test complete flow:
   - User navigates to tournament detail
   - /bundle endpoint called once (deduplication)
   - All data (tournament, standings, matches, bracket) loaded
   - Stores populated correctly
   - SSE connection established
   - Navigate between Standings/Matches/Bracket (no refetch, cached)
   - SSE event arrives (standings.updated)
   - Standings table re-renders with new data
   - User navigates away
   - SSE connection closes
3. Mock API and SSE
4. Test with both player and organizer roles

#### Success Criteria
- ✅ Complete tournament detail flow tested
- ✅ /bundle endpoint called once
- ✅ Stores populated correctly
- ✅ SSE lifecycle verified (open → updates → close)
- ✅ Navigation caching verified
- ✅ Role-based rendering verified
- ✅ Test passing for both roles

---

### Task 6.5: Integration Test: Offline Flow
**File:** `src/__tests__/offline-flow.spec.tsx`  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 5.1 completed (Service Worker)
- ✅ Jest and DOM testing set up

#### Implementation Steps
1. Create integration test file
2. Test offline scenario:
   - App loads tournament data (cached)
   - Network goes offline (simulate)
   - User submits score
   - Submission queued (not sent)
   - Shows "Syncing..." status
   - Network comes back online
   - Service Worker syncs queue
   - Submission sent
   - Shows "Synced" status
   - App continues working normally
3. Mock navigator.onLine
4. Mock Service Worker
5. Test IndexedDB queue

#### Success Criteria
- ✅ Offline data served from cache
- ✅ Score submission queued
- ✅ Sync status shown
- ✅ Queue synced when online
- ✅ Submission confirmed sent
- ✅ Test passing

---

### Task 6.6: Integration Test: Pagination Flow
**File:** `src/pages/__tests__/BrowseTournaments.pagination.spec.tsx`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 4.3 completed (BrowseTournaments page)
- ✅ Task 2.7 completed (useInfiniteScroll hook)

#### Implementation Steps
1. Create integration test file
2. Test pagination flow:
   - Initial load: 20 tournaments
   - "Load More" button clicked
   - Next 20 tournaments loaded
   - Scroll back up (no redundant request)
   - Scroll down again (no redundant request)
   - End of list reached (no more button)
3. Mock API endpoint with pagination support
4. Verify request deduplication

#### Success Criteria
- ✅ Initial 20 items loaded
- ✅ "Load More" button works
- ✅ Next 20 items appended
- ✅ No redundant requests on scroll
- ✅ End of list handled correctly
- ✅ Test passing

---

### Task 6.7: Integration Test: Virtualization Performance
**File:** `src/components/shared/__tests__/StandingsTable.virtualization.spec.tsx`  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ Task 3.2 completed (StandingsTable with virtualization)

#### Implementation Steps
1. Create performance test file
2. Test virtualization:
   - Render 500-player standings table
   - Measure render time (should be < 500ms)
   - Scroll through entire list
   - Measure FPS (should be 60fps)
   - Verify only ~15 rows in DOM at any time
   - SSE update: update one row, re-render only that row
3. Use performance.now() for timing
4. Use mock data for 500 players

#### Success Criteria
- ✅ 500-row render < 500ms
- ✅ Scroll smooth (60fps)
- ✅ Only visible rows in DOM
- ✅ SSE update efficient (single row)
- ✅ Performance test passing

---

## Phase 7: Polish and Launch

### Task 7.1: Responsive Design & Breakpoints
**File:** Various component files  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ All components created (Phase 3)
- ✅ Responsive breakpoints defined in design tokens

#### Implementation Steps
1. Review all components for responsive behavior
2. Test on actual devices/viewport sizes:
   - Mobile: 375px (iPhone), 414px (iPhone Plus)
   - Tablet: 768px (iPad), 1024px (iPad Pro)
   - Desktop: 1440px, 1920px
3. Adjust padding, font sizes, layout based on breakpoints
4. Verify bottom nav appears on mobile (< 640px)
5. Verify desktop nav on larger screens
6. Test touch targets (44px minimum on mobile)
7. Test keyboard navigation across breakpoints

#### Success Criteria
- ✅ All components responsive
- ✅ Tested on multiple screen sizes
- ✅ Bottom nav/desktop nav switch at 640px
- ✅ Touch targets 44px minimum
- ✅ No horizontal scrolling on mobile
- ✅ Layout reflows appropriately

---

### Task 7.2: Accessibility Audit
**File:** Various component files  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ All components implemented
- ✅ Accessibility tools installed (axe-core, WAVE)

#### Implementation Steps
1. Run axe-core accessibility audit on all pages
2. Check for:
   - Color contrast (WCAG AA minimum)
   - Focus indicators visible on all interactive elements
   - ARIA labels on buttons/links without text
   - Semantic HTML (proper heading hierarchy, button roles)
   - Keyboard navigation (Tab order, Enter/Space to activate)
   - Screen reader support (tested with VoiceOver/NVDA)
   - Form labels associated with inputs
   - Image alt text
   - Skip navigation link
3. Fix all violations found

#### Success Criteria
- ✅ No axe-core violations
- ✅ Color contrast > WCAG AA
- ✅ All interactive elements keyboard accessible
- ✅ Focus indicators visible
- ✅ Tested with screen reader
- ✅ Form labels properly associated
- ✅ Alt text on images

---

### Task 7.3: Error Handling & Edge Cases
**File:** Various component files  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ All components implemented

#### Implementation Steps
1. Test error scenarios:
   - Network error while loading tournament
   - Network error while submitting score
   - Invalid tournament ID
   - User not authorized for tournament
   - SSE connection drops and reconnects
   - Empty lists (no tournaments, no standings)
   - Missing data in API response
2. Ensure error messages are clear and user-friendly
3. Provide retry options where appropriate
4. Log errors for debugging
5. Graceful degradation (partial data still useful)

#### Success Criteria
- ✅ All error scenarios handled
- ✅ Error messages user-friendly
- ✅ Retry options available
- ✅ No unhandled promise rejections
- ✅ Graceful degradation

---

### Task 7.4: Performance Verification
**File:** Measurement and optimization  
**Estimated Time:** 2 hours  
**Owner:** TBD

#### Prerequisites
- ✅ All features implemented

#### Implementation Steps
1. Measure performance metrics:
   - Tournament detail loads in < 1s
   - Standings table (500 rows) renders in < 500ms
   - Navigation between pages instant (< 100ms)
   - SSE updates standings in < 200ms
   - First Contentful Paint (FCP) < 2s
   - Time to Interactive (TTI) < 3s
2. Use Chrome DevTools Lighthouse
3. Identify bottlenecks
4. Optimize where necessary:
   - Code splitting
   - Lazy loading
   - Image optimization (already done)
   - Bundle size analysis
5. Re-measure to verify improvement

#### Success Criteria
- ✅ Tournament detail < 1s load
- ✅ Standings 500 rows < 500ms
- ✅ Navigation instant (cached)
- ✅ SSE updates < 200ms
- ✅ FCP < 2s
- ✅ TTI < 3s
- ✅ Lighthouse score > 90

---

### Task 7.5: Documentation & Handoff
**File:** README, SETUP, etc.  
**Estimated Time:** 1.5 hours  
**Owner:** TBD

#### Prerequisites
- ✅ All features complete

#### Implementation Steps
1. Create or update README.md with:
   - Project overview
   - Tech stack (React 19+, Tailwind, Vite, etc.)
   - Features list
   - Installation instructions
   - Development setup
2. Create SETUP.md with:
   - Environment variables needed
   - Database setup (if any)
   - Running dev server
   - Running tests
3. Create FEATURES.md documenting:
   - All implemented features
   - Known limitations
   - Future enhancements
4. Create ARCHITECTURE.md summarizing:
   - Frontend structure
   - State management (Task #18 stores)
   - API integration (/bundle endpoint)
   - SSE subscription lifecycle
   - Mobile optimizations implemented
5. Create TESTING.md documenting:
   - How to run tests
   - Test coverage
   - Adding new tests
6. Code comments for non-obvious logic

#### Success Criteria
- ✅ README updated with project overview
- ✅ Setup instructions clear and complete
- ✅ Architecture documented
- ✅ Features documented
- ✅ Testing guide documented
- ✅ New developers can get running in < 30min

---

## Implementation Sequence & Dependencies (Optimized for Parallelization)

### Parallelization Strategy

The plan is reorganized into streams that can execute in parallel:
- **Stream A:** Design Specs (Phase 0) — foundational, must complete early
- **Stream B:** Backend API (Phase 1) — independent, can run with Phase 0
- **Stream C:** Independent Frontend Hooks (Phase 2A) — can run parallel with Phase 1
- **Stream D:** Dependent Frontend Hooks (Phase 2B) — must wait for Phase 1
- **Stream E:** Frontend Components (Phase 3) — must wait for Phase 0 & 2A, can start before 2B
- **Merge Point:** Pages (Phase 4) — must wait for Phase 3 & 2B
- **Stream F:** Mobile Optimizations Split (Phase 5A) — can start after Phase 2A
- **Stream G:** Mobile Optimizations (Phase 5B) — must wait for Phase 4
- **Phase 6:** Testing — TDD-first approach, integrated with each phase
- **Phase 7:** Polish & Launch — final verification

### Execution Timeline

```
WEEK 1:
┌─ Phase 0: Design Specs (1-2 hours, START FIRST)
│  ├─ 0.1 Design Spec Document
│  ├─ 0.2 Design Tokens File
│  └─ 0.3 Component Specifications
│
├─ Phase 1: Backend API (1 hour, PARALLEL with Phase 0)
│  ├─ 1.1 Consolidation Endpoint
│  └─ 1.2 Test Endpoint
│
└─ Phase 2A: Independent Hooks (1.5 hours, PARALLEL with Phase 1)
   ├─ 2.1 usePermissions + 2.2 Test (45 min)
   └─ 2.7 Additional Hooks + Tests (useInfiniteScroll, useVirtualScroll, usePrefetch) (45 min)

WEEK 2:
├─ Phase 2B: Dependent Hooks (2 hours, AFTER Phase 1 completes)
│  ├─ 2.3 useTournament + 2.4 Test (1 hour)
│  └─ 2.5 useSSE + 2.6 Test (1 hour)
│
├─ Phase 3: Frontend Components (3 hours, PARALLEL with Phase 2B, AFTER Phase 0)
│  ├─ 3.1 Shared Components (2 hours)
│  ├─ 3.2 StandingsTable (2 hours)
│  ├─ 3.3 MatchCard (1.5 hours)
│  ├─ 3.4 TournamentCard (1 hour)
│  ├─ 3.5 PhaseIndicator (30 min)
│  └─ 3.6 Modal/Dialog (1 hour)
│
└─ Phase 5A: Early Mobile Optimizations (1.5 hours, PARALLEL with Phase 3)
   ├─ 5.3 Image Optimization (1.5 hours)
   ├─ 5.4 Pagination Controls (1 hour)
   └─ 5.5 Prefetch Strategy (1.5 hours)

WEEK 3:
├─ Phase 4: Pages & Routing (4 hours, AFTER Phase 3 & 2B complete)
│  ├─ 4.1 Layout Infrastructure (1.5 hours)
│  ├─ 4.2 Landing Page (1 hour)
│  ├─ 4.3 BrowseTournaments (1.5 hours)
│  ├─ 4.4 MyTournaments (1.5 hours)
│  ├─ 4.5 OrganizerDashboard (1.5 hours)
│  └─ 4.6 TournamentDetail (3 hours)
│
└─ Phase 5B: Service Worker & Integration (2.5 hours, PARALLEL with Phase 4)
   ├─ 5.1 Service Worker (2 hours)
   ├─ 5.2 Register Service Worker (30 min)
   └─ 5.6 Request Deduplication Verification (included in Phase 2B tests)

WEEK 4:
├─ Phase 6: Testing (Throughout - Integrated TDD)
│  ├─ 6.1 Test StandingsTable (2 hours)
│  ├─ 6.2 Test MatchCard (1.5 hours)
│  ├─ 6.3 Test Consolidation Endpoint (1.5 hours)
│  ├─ 6.4 Integration: Tournament Detail Flow (2 hours)
│  ├─ 6.5 Integration: Offline Flow (2 hours)
│  ├─ 6.6 Integration: Pagination Flow (1.5 hours)
│  └─ 6.7 Integration: Virtualization Performance (1.5 hours)
│
└─ Phase 7: Polish & Launch (4 hours)
   ├─ 7.1 Responsive Design (1.5 hours)
   ├─ 7.2 Accessibility Audit (2 hours)
   ├─ 7.3 Error Handling (1.5 hours)
   ├─ 7.4 Performance Verification (2 hours)
   └─ 7.5 Documentation (1.5 hours)
```

### Critical Path (Longest Sequential Chain)

```
Phase 0 → Phase 1 → Phase 2B → Phase 4 → Phase 7
(2h)     (1h)     (2h)        (4h)     (4h)
= 13 hours minimum with full parallelization
vs 18-20 hours sequential
= 25-35% time savings
```

### Parallel Streams (Can run simultaneously)

```
Stream A (Design):        Phase 0 (2h)
Stream B (Backend):       Phase 1 (1h)        + Phase 2A (1.5h)
Stream C (Components):    Phase 3 (3h)        + Phase 5A (1.5h)
Stream D (Pages):         Phase 4 (4h)        + Phase 5B (2.5h)
Stream E (Testing):       Phase 6 (throughout)
Stream F (Polish):        Phase 7 (4h)

Maximum parallel work: 4 streams running simultaneously
Estimated speedup: 25-35% faster than sequential execution
```

### Reorganized Task Listing by Stream

**STREAM A: Design Specifications** (1-2 hours)
- Phase 0.1: Design Specification Document
- Phase 0.2: Design Tokens File
- Phase 0.3: Component Specifications

**STREAM B: Backend API & Early Frontend Hooks** (2.5 hours)
- Phase 1.1: Create Consolidation Endpoint
- Phase 1.2: Test Consolidation Endpoint
- Phase 2.1: Create usePermissions Hook
- Phase 2.2: Test usePermissions Hook
- Phase 2.7: Create Additional Hooks (useInfiniteScroll, useVirtualScroll, usePrefetch)

**STREAM C: Components & Image Optimization** (4.5 hours)
- Phase 3.1: Create Shared Components
- Phase 3.2: Create StandingsTable Component
- Phase 3.3: Create MatchCard Component
- Phase 3.4: Create TournamentCard Component
- Phase 3.5: Create PhaseIndicator Component
- Phase 3.6: Create Modal/Dialog Component
- Phase 5.3: Create Image Optimization Service
- Phase 5.4: Create Pagination Controls
- Phase 5.5: Create Prefetch Strategy

**STREAM D: Dependent Hooks & Pages** (6 hours)
- Phase 2.3: Create useTournament Hook
- Phase 2.4: Test useTournament Hook
- Phase 2.5: Create useSSE Hook
- Phase 2.6: Test useSSE Hook
- Phase 4.1: Create Layout Infrastructure
- Phase 4.2: Create Landing Page
- Phase 4.3: Create BrowseTournaments Page
- Phase 4.4: Create MyTournaments Page
- Phase 4.5: Create OrganizerDashboard Page
- Phase 4.6: Create TournamentDetail Page
- Phase 5.1: Create Service Worker
- Phase 5.2: Register Service Worker

**STREAM E: Testing & Verification** (Throughout all streams)
- Phase 6.1: Test StandingsTable
- Phase 6.2: Test MatchCard
- Phase 6.3: Test Consolidation Endpoint
- Phase 6.4: Integration Test - Tournament Detail Flow
- Phase 6.5: Integration Test - Offline Flow
- Phase 6.6: Integration Test - Pagination Flow
- Phase 6.7: Integration Test - Virtualization Performance

**STREAM F: Polish & Launch** (After all other streams)
- Phase 7.1: Responsive Design & Breakpoints
- Phase 7.2: Accessibility Audit
- Phase 7.3: Error Handling & Edge Cases
- Phase 7.4: Performance Verification
- Phase 7.5: Documentation & Handoff
```

---

## Success Criteria Summary

### By Feature:
- ✅ Design system complete (tokens, specs, components documented)
- ✅ Consolidation endpoint working (GET /tournaments/:id/bundle)
- ✅ Core hooks implemented (permissions, tournament, SSE, pagination, virtualization, prefetch)
- ✅ Shared components complete (button, badge, spinner, banners, table, cards)
- ✅ Pages implemented (landing, browse, my tournaments, organizer dashboard, tournament detail)
- ✅ Role-based rendering working (player vs organizer views)
- ✅ SSE real-time updates working
- ✅ Mobile optimizations complete (service worker, offline sync, pagination, virtualization)
- ✅ Image optimization working (lazy load, WebP, responsive)

### By Quality:
- ✅ All code tested (95%+ coverage)
- ✅ Performance targets met (< 1s load, < 500ms render 500 rows, 60fps scroll)
- ✅ Mobile responsive (works on 375px - 1920px)
- ✅ Accessibility (WCAG AA, keyboard nav, screen reader)
- ✅ Offline functional (cache, sync, queue)
- ✅ Error handling comprehensive
- ✅ Documentation complete

### By Efficiency:
- ✅ /bundle endpoint reduces 3 API calls to 1
- ✅ Store caching prevents redundant fetches
- ✅ Request deduplication eliminates simultaneous duplicate requests
- ✅ Pagination reduces initial data transfer by 80-90%
- ✅ Virtualization renders only visible rows
- ✅ SSE only active when viewing tournament
- ✅ Service Worker enables offline functionality
- ✅ Image optimization saves 70-80% bandwidth
- ✅ Prefetching eliminates perceived latency

---

## Notes

- **React Version:** 19+
- **Framework:** React 19+ with TypeScript
- **Styling:** Tailwind CSS with Pastel Flat 2.0 design tokens
- **Tables:** TanStack Table / react-window for virtualization
- **State:** Task #18 stores (tournament, standings, matches, bracket)
- **Routing:** react-router v6
- **SSE:** reconnecting-eventsource for mobile resilience
- **Testing:** Jest + React Testing Library (Full TDD)
- **Icons:** Lucide React
- **Dev Server:** Vite
- **Total Estimated Time:** 18-20 hours focused development
- **Dependencies:** All open source (MIT licensed)

---

## Task Checklist (Organized by Parallel Streams)

### Stream A: Design Specifications (1-2 hours)
- [ ] 0.1: Design Specification Document created
- [ ] 0.2: Design Tokens file created and exported
- [ ] 0.3: Component Specifications documented

### Stream B: Backend API & Independent Hooks (2.5 hours) — *Parallel with Stream A*
- [ ] 1.1: Consolidation Endpoint (GET /tournaments/:id/bundle) implemented
- [ ] 1.2: Consolidation Endpoint tested (8+ test cases)
- [ ] 2.1: usePermissions hook created
- [ ] 2.2: usePermissions hook tested
- [ ] 2.7: useInfiniteScroll hook created
- [ ] 2.7: useVirtualScroll hook created
- [ ] 2.7: usePrefetch hook created

### Stream C: Components & Early Optimizations (4.5 hours) — *Parallel with Stream B (after A)*
- [ ] 3.1: Shared components created (Button, Badge, Spinner, Banners, Skeleton)
- [ ] 3.2: StandingsTable component created (virtualized, 500+ rows)
- [ ] 3.3: MatchCard component created
- [ ] 3.4: TournamentCard component created
- [ ] 3.5: PhaseIndicator component created
- [ ] 3.6: Modal/Dialog component created
- [ ] 5.3: Image optimization service created (lazy load, WebP, responsive)
- [ ] 5.4: Pagination controls component created
- [ ] 5.5: Prefetch strategy integrated

### Stream D: Dependent Hooks & Pages (6 hours) — *Parallel with Stream C (after B)*
- [ ] 2.3: useTournament hook created
- [ ] 2.4: useTournament hook tested (fetch, dedup, error handling)
- [ ] 2.5: useSSE hook created
- [ ] 2.6: useSSE hook tested (connection, events, reconnect, cleanup)
- [ ] 4.1: Layout infrastructure (ResponsiveLayout, bottom nav, routing)
- [ ] 4.2: Landing page created
- [ ] 4.3: BrowseTournaments page created (infinite scroll)
- [ ] 4.4: MyTournaments page created
- [ ] 4.5: OrganizerDashboard page created
- [ ] 4.6: TournamentDetail page created (shared, role-based rendering)
- [ ] 5.1: Service Worker created (caching, offline sync, queue)
- [ ] 5.2: Service Worker registered and functional

### Stream E: Testing & Verification (Throughout all streams, finalize week 4)
- [ ] 6.1: StandingsTable component tested (13+ test cases, virtualization, SSE)
- [ ] 6.2: MatchCard component tested (8+ test cases, role-based rendering)
- [ ] 6.3: Consolidation endpoint tested (8+ test cases, auth, selective loading)
- [ ] 6.4: Integration test — Tournament detail flow (full flow, /bundle, SSE, navigation)
- [ ] 6.5: Integration test — Offline flow (caching, queueing, sync)
- [ ] 6.6: Integration test — Pagination flow (load more, no redundant requests)
- [ ] 6.7: Integration test — Virtualization performance (500 rows <500ms, 60fps scroll)

### Stream F: Polish & Launch (4 hours) — *After all other streams complete*
- [ ] 7.1: Responsive design verified (375px, 768px, 1440px breakpoints)
- [ ] 7.2: Accessibility audit passed (WCAG AA, focus indicators, keyboard nav)
- [ ] 7.3: Error handling complete (network errors, missing data, edge cases)
- [ ] 7.4: Performance targets verified (< 1s load, < 200ms SSE, 60fps)
- [ ] 7.5: Documentation complete (README, SETUP, ARCHITECTURE, TESTING)

