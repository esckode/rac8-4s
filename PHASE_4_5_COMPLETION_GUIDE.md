# Phase 4 & 5: Detailed Completion Steps

## Overview

This guide breaks down the remaining work needed to complete Phase 4 (Real-Time Updates & Bracket Advancement) and Phase 5 (Frontend & Analytics) for the doubles tournament support implementation.

**Current Status:**
- Phase 4: 70% complete (RED-GREEN done, needs completion work)
- Phase 5: 40% complete (RED-GREEN done, needs styling & integration)
- **Estimated Remaining Time:** 14-18 hours (~2 days)

---

## PHASE 4: Real-Time Updates & Bracket Advancement

### Current Status: 70% Complete

**What's Done:**
- ✅ RED Phase: 50 tests written (24 bracket-advancement + 26 bracket-generator)
- ✅ GREEN Phase: Bracket generator utility implemented
- ✅ Score submission endpoint verified
- ✅ SSE real-time broadcast endpoint verified
- ✅ All 50 tests passing

**What's Remaining:** 5 major components

---

### Step 1: Complete Match Result Submission Logic (1-2 hours)

**Goal:** Ensure all match types (singles/doubles) can submit scores

**Tasks:**
1. Verify score format validation handles both formats
   - Singles: "2-0", "2-1", "1-2", "0-2"
   - Doubles: Same formats (team format, not player count)
2. Test authorization for all team members
   - Both team members can submit
   - Non-members blocked with 403
3. Verify logging: `score.submitted` at INFO level
   - Include: playerId, matchId, tournamentId, score, format
   - Never include: sensitive tokens/data
4. Test match winner determination
   - Correct winner set based on score
   - Score saved to database
   - match.status updated to "completed"

**Test Command:**
```bash
npm test -- packages/api/src/__tests__/unit/bracket-advancement.spec.ts
# Expected: 24/24 passing
```

---

### Step 2: Implement Bracket Generation on Group Completion (2-3 hours)

**Goal:** Automatically generate knockout bracket when group stage ends

**Tasks:**
1. Create `advanceTournament()` route handler
   - Endpoint: `POST /:tournamentId/advance`
   - Check if all group matches completed
   - Generate bracket, create knockout matches
   - Return 400 if not ready
2. Implement `generateKnockoutBracket()` function
   - Get top N participants from standings
   - Call bracket-generator utility
   - Insert knockout matches into database
   - Log `bracket.generated` at INFO level
3. Handle edge cases
   - Odd number of participants (add byes)
   - Group with only 1 match (automatic advance)
   - Tournaments with 1 group (all advance)
4. Test with different tournament sizes
   - 4 players (1 group, 2 advance)
   - 8 players (2 groups, 4 advance)
   - 12 players (3 groups, 6 advance)

**Test Command:**
```bash
npm test -- packages/api/src/__tests__/unit/bracket-generator.spec.ts
# Expected: 26/26 passing
```

---

### Step 3: Real-Time Bracket Updates via SSE (2-3 hours)

**Goal:** Broadcast bracket changes to connected clients

**Tasks:**
1. Ensure SSE endpoint ready: `GET /:tournamentId/events`
   - Authenticates player
   - Streams tournament events as JSON
   - Includes requestId for tracing
2. Implement event types
   - `score.submitted` - When score entered
   - `standings.updated` - After standings recalc
   - `bracket.generated` - When knockout bracket created
   - `bracket.advanced` - When player advances
   - `bracket.completed` - When tournament ends
3. Test event broadcasting
   - Submit score → clients receive `score.submitted`
   - Recalc standings → clients receive `standings.updated`
   - Generate bracket → clients receive `bracket.generated`
4. Handle edge cases
   - Multiple concurrent connections
   - Client disconnection
   - Network failures (graceful reconnect)

---

### Step 4: Implement Score Validation Service (1-2 hours)

**Goal:** Centralized validation for score formats

**Tasks:**
1. Create `ScoreValidator` class
   - Validate format: "X-Y" where X,Y ∈ [0-3]
   - Validate no ties: not "0-0", "1-1", "2-2", "3-3"
   - Validate winning margin: winner has 2+ sets
2. Test validation
   - Valid: "2-0", "2-1", "1-2", "0-2"
   - Invalid: "0-0", "1-1", "4-2", "2-4", "abc"
3. Integration with score submission
   - Validate before accepting
   - Return 400 with error message if invalid
   - Log validation failures at WARN level

**Files:**
- Create: `packages/api/src/utils/score-validator.ts`
- Modify: `packages/api/src/routes/tournaments.ts`

---

### Step 5: Bracket Advancement Logic (2-3 hours)

**Goal:** Track which participants advance through bracket rounds

**Tasks:**
1. Determine advancement rules
   - Group stage: Top 2 teams per group advance
   - Knockout: Winner of each match advances
2. Track bracket state
   - Match: player1_id/team1_id (seed 1), player2_id/team2_id (seed 2)
   - Match: winner_id (who advanced)
   - Match: round, position (which bracket slot)
3. Implement bracket tree navigation
   - Find parent match for winner
   - Insert winner into parent match
   - Continue until finals
4. Log advancements
   - `bracket.advanced` at INFO level
   - Include: participant_id, round, next_opponent_id

---

## PHASE 5: Frontend & Analytics

### Current Status: 40% Complete

**What's Done:**
- ✅ RED Phase: 99 tests written (all component and analytics tests)
- ✅ GREEN Phase: Components and utilities created
- ✅ REFACTOR Phase: Code cleanup done

**What's Remaining:** 6 major tasks

---

### Step 1: Complete StandingsTable Component Styling (1-2 hours)

**Goal:** Fully functional, styled standings display

**Tasks:**
1. Add CSS styling
   - Table layout responsive
   - Column alignment (rank, name, wins, etc.)
   - Hover effects on rows
   - Mobile collapsible columns
2. Implement real-time updates
   - Listen to SSE `standings.updated` events
   - Re-fetch standings from API
   - Update table rows with animations
3. Add accessibility features
   - ARIA labels on table headers
   - Sort indicators for rank/wins columns
   - Focus management on updates
4. Test on different screen sizes
   - Desktop: 1440px full table
   - Tablet: 768px compact columns
   - Mobile: 320px stacked layout

**File:** `packages/frontend/src/components/StandingsTable.tsx`

---

### Step 2: Complete PartnerSelection Component (1-2 hours)

**Goal:** Full partner selection UI with form integration

**Tasks:**
1. Implement select flow
   - Fetch available partners (API call)
   - Dropdown shows: "Name (email)"
   - Selection updates form state
2. Implement invite flow
   - Email input with validation
   - Real-time validation feedback
   - Error message if already registered
3. Add styling
   - Radio buttons styled and accessible
   - Dropdown/input responsive
   - Error states clear
4. Form integration
   - Disable submit until partner selected/email valid
   - Show loading state during submission
   - Success/error messages

**Files:**
- `packages/frontend/src/components/PartnerSelection.tsx`
- `packages/frontend/src/components/PartnerDropdown.tsx`
- `packages/frontend/src/components/PartnerInviteInput.tsx`

---

### Step 3: Complete ScoreSubmissionForm Component (2-3 hours)

**Goal:** Full score submission with validation and retry logic

**Tasks:**
1. Implement form fields
   - Score input: "X-Y" format guidance
   - Team names display (Team 1 vs Team 2)
   - Submit and cancel buttons
2. Add validation
   - Real-time format validation
   - Show error if invalid format
   - Disable submit if invalid
3. Implement retry logic
   - 3× exponential backoff on network error
   - 1st retry: wait 1 second
   - 2nd retry: wait 2 seconds
   - 3rd retry: wait 4 seconds
   - After 3 failures: show error message
4. Add feedback
   - Loading spinner during submission
   - Success message with timestamp
   - Error message with retry button

**File:** `packages/frontend/src/components/ScoreSubmissionForm.tsx`

---

### Step 4: Implement Analytics Event Tracking (2-3 hours)

**Goal:** Full analytics pipeline sending events to backend

**Tasks:**
1. Create analytics backend endpoint
   - Endpoint: `POST /api/analytics/events`
   - Accept array of events
   - Log events to database/analytics service
   - Return 202 Accepted
2. Implement client-side event queue
   - Queue events if offline
   - Batch events (up to 10 per request)
   - Send batch every 5 seconds or when full
   - Retry failed batches with backoff
3. Track all required events
   - `page_view`: Dashboard, Groups, Bracket pages
   - `score_submitted`: Score, format, participants
   - `bracket_advanced`: Round, winner, next_opponent
   - `team_created`: Player IDs, registration type
   - `partner_confirmed`: Both players, confirmation status
4. Test tracking
   - Navigate to page → track page_view
   - Submit score → track score_submitted
   - Advance in bracket → track bracket_advanced
   - Create partnership → track team_created

**Files:**
- Create: `packages/api/src/routes/analytics.ts` (endpoint)
- Modify: `packages/frontend/src/utils/analytics.ts` (client batching)

---

### Step 5: Pages Integration (3-4 hours)

**Goal:** Wire components into actual pages

**Tasks:**
1. Create TournamentDashboard page
   - Show tournament info (name, format, stage)
   - Link to group/bracket views
   - Show player's current match (if any)
   - Real-time stage updates
2. Create GroupStage page
   - Show all groups
   - StandingsTable for each group
   - List of matches in group
   - ScoreSubmissionForm for user's matches
3. Create BracketView page
   - Visual bracket display (SVG)
   - Show all rounds and matches
   - Highlight user's matches
   - Show match scores and winners
   - Real-time bracket updates
4. Create registration flow
   - Tournament selection
   - PartnerSelection component for doubles
   - Confirmation and success screen

**Files to Create:**
- `packages/frontend/src/pages/TournamentDashboard.tsx`
- `packages/frontend/src/pages/GroupStage.tsx`
- `packages/frontend/src/pages/BracketView.tsx`

---

### Step 6: End-to-End Testing (2-3 hours)

**Goal:** Test complete doubles tournament workflow

**Tasks:**
1. E2E test: Registration to standings
   - Create tournament (doubles)
   - Register 2 teams (4 players)
   - Advance to group stage
   - View standings with team names
   - Verify real-time updates
2. E2E test: Score submission
   - Submit score from player 1 of team 1
   - Verify standings update
   - Verify SSE broadcasts event
   - Other clients see updated standings
3. E2E test: Bracket generation
   - Complete all group matches
   - Advance to knockout
   - Verify bracket shows correct matchups
   - Submit knockout score
   - Verify winner advances
4. E2E test: Analytics tracking
   - Complete tournament
   - Verify all events tracked
   - Check analytics dashboard

**Test File:** `packages/frontend/src/__tests__/e2e/doubles-tournament-flow.spec.ts`

---

## Implementation Order (Recommended)

### Phase 4: Quick Wins (6-8 hours)
1. Score Validation Service (1-2 hours) - Standalone, no dependencies
2. Match Result Submission Logic (1-2 hours) - Depends on validation
3. Bracket Generation on Completion (2-3 hours) - Depends on submission
4. Real-Time Bracket Updates (2-3 hours) - Depends on generation

### Phase 5: Frontend (8-10 hours)
1. StandingsTable styling (1-2 hours) - Standalone
2. PartnerSelection completion (1-2 hours) - Standalone
3. ScoreSubmissionForm completion (2-3 hours) - Standalone
4. Analytics implementation (2-3 hours) - Depends on API endpoint
5. Pages integration (3-4 hours) - Depends on components
6. E2E testing (2-3 hours) - Final verification

**Total Estimated Time:** 14-18 hours (~2 days of active development)

---

## Testing Strategy

### Unit Tests (Already Written)
- ✅ Bracket advancement: 24 tests
- ✅ Bracket generator: 26 tests
- ✅ Components: 60 tests
- ✅ Analytics: 37 tests
- **Total: 147 new tests**

### Integration Tests (To Write)
- Score submission validation
- Bracket generation workflow
- SSE event broadcasting
- End-to-end tournament flow

### E2E Tests (To Write)
- Complete doubles tournament (registration to finals)
- Score submission and standings updates
- Bracket generation and advancement
- Multi-user concurrent interactions

---

## Deployment Readiness Checklist

Before production deployment:
- [ ] All 270+ tests passing
- [ ] Branch coverage ≥ 85%
- [ ] npm audit --production passes
- [ ] npm run lint passes
- [ ] No hardcoded secrets/credentials
- [ ] Security review completed
- [ ] WCAG 2.1 AA compliance verified
- [ ] Mobile responsiveness tested (320px, 768px, 1024px, 1440px)
- [ ] Load testing (concurrent users)
- [ ] Database backup/rollback tested
- [ ] Documentation complete
- [ ] Release notes prepared

---

## Key Success Factors

1. **Test-Driven Approach:** All 147 new tests written first (RED phase)
2. **Incremental Integration:** Complete Phase 4 backend before Phase 5 frontend
3. **Real-Time Verification:** Use browser dev tools to test SSE event flow
4. **Mobile-First Design:** Test every component at 320px width
5. **Accessibility Compliance:** WCAG 2.1 AA for all new components
6. **Security Review:** Validate all inputs, log appropriately, no sensitive data

---

## Questions & Gotchas

**Q: What if bracket generation fails?**
A: Implement rollback: delete created knockout matches, reset tournament stage to "group_completed", log error at ERROR level

**Q: How to handle network failures in SSE?**
A: Client implements exponential backoff reconnection (1s, 2s, 4s), UI shows "Reconnecting..." state

**Q: What about concurrent score submissions?**
A: Database constraint prevents race conditions (UNIQUE on match + first committer wins, second gets "match already scored" error)

**Q: Mobile testing - any gotchas?**
A: Test input field sizes (≥44×44px), test touch interactions (not just hover), test landscape orientation

**Q: How to measure real-time performance?**
A: Monitor SSE event latency: log timestamp on server, compare with client receive time, target <500ms

---

## Resources

- **TDD Strategy:** `/TDD_STRATEGY.md`
- **Logging Standards:** `/CLAUDE.md` (Logging Standards section)
- **Phase 4 Tests:** `packages/api/src/__tests__/unit/bracket-advancement.spec.ts`
- **Phase 5 Tests:** `packages/frontend/src/__tests__/components/*.spec.tsx`
- **Bracket Generator:** `packages/api/src/utils/bracket-generator.ts`
- **Analytics Utility:** `packages/frontend/src/utils/analytics.ts`

---

**Last Updated:** 2026-06-03
**Status:** Ready for development
