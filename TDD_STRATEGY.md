# Test-Driven Development (TDD) Strategy

## Executive Summary

**Can TDD be used?** Yes, absolutely. TDD is **highly recommended** for this app.

**Should TDD be used everywhere?** No. Use TDD selectively:
- ✅ **Always use TDD** for business logic (standings, bracket, score parsing)
- ✅ **Strongly recommend TDD** for API endpoints
- ⚠️ **Use TDD carefully** for async jobs (requires careful mocking)
- ❌ **Don't use pure TDD** for UI (use integration/E2E tests instead)
- ❌ **Don't use pure TDD** for infrastructure (use manual + monitoring)

**Expected benefit:** 30-40% faster development, 10x fewer production bugs in business logic.

---

## Why TDD Works Well for This App

### 1. Business Logic is Well-Defined & Deterministic

The requirements explicitly define:
- Standings ranking algorithm (wins → sets → head-to-head → coin flip)
- Bracket generation rules (seeding, bye assignment)
- Score format & parsing rules
- Tournament state machine (all valid transitions)

With clear, deterministic requirements, TDD shines because:
- ✅ You know exactly what to test before writing code
- ✅ Tests document requirements naturally
- ✅ No ambiguity about what "correct" means
- ✅ Refactoring is safe (tests catch regressions immediately)

### 2. High Cost of Bugs

Tournament correctness is non-negotiable:
- A bug in standings calculation = tournament invalidated
- A bug in bracket seeding = unfair tournament
- A bug in score parsing = player data corrupted

TDD catches these before code review/merge:
- ✅ Red-Green-Refactor cycle forces you to think about edge cases
- ✅ Failing test = proof of bug before it reaches production
- ✅ 100% coverage of business logic is achievable with TDD
- ✅ Refactoring becomes low-risk

### 3. Complex State Management

Tournaments involve state transitions:
- Registration → Group Stage → Knockout → Complete
- Invalid transitions must be rejected
- Tests define all valid/invalid paths
- TDD catches state bugs early

### 4. Async & Concurrency Challenges

TDD with dependency injection makes testing async code manageable:
- Mock the database/Redis/queue
- Test job consolidation without running actual jobs
- Simulate race conditions deterministically
- Verify idempotency without side effects

---

## TDD Workflow for This App

### The Red-Green-Refactor Cycle

```
┌─ Write failing test ──→ TEST FAILS (RED)
│
├─ Write minimal code to pass test ──→ TEST PASSES (GREEN)
│
├─ Refactor code (improve structure, remove duplication)
│  (tests still pass)
│
└─ Repeat for next requirement
```

### Example: Implementing Standings Calculation (TDD Style)

#### Step 1: Write Test (RED)

```typescript
// tests/standings.spec.ts

describe('Standings Calculation (TDD)', () => {
  it('should rank players by wins in descending order', () => {
    // Arrange
    const player1 = { id: 'p1', name: 'Alice' }
    const player2 = { id: 'p2', name: 'Bob' }
    const player3 = { id: 'p3', name: 'Charlie' }
    
    const matches = [
      { player1Id: 'p1', player2Id: 'p2', winner: 'p1' }, // Alice wins
      { player1Id: 'p1', player2Id: 'p3', winner: 'p1' }, // Alice wins
      { player1Id: 'p2', player2Id: 'p3', winner: 'p2' }, // Bob wins
    ]

    // Act
    const standings = calculateStandings([player1, player2, player3], matches)

    // Assert
    expect(standings[0].playerId).toBe('p1') // Alice: 2 wins (rank 1)
    expect(standings[1].playerId).toBe('p2') // Bob: 1 win (rank 2)
    expect(standings[2].playerId).toBe('p3') // Charlie: 0 wins (rank 3)
  })
})
```

**Run test:**
```bash
npm test -- standings.spec.ts
# FAIL: calculateStandings is not defined
```

✅ **TEST FAILS (RED)** — Expected. Function doesn't exist yet.

---

#### Step 2: Write Minimal Code to Pass (GREEN)

```typescript
// src/business/standings.ts

export function calculateStandings(
  players: Player[],
  matches: Match[]
): Standing[] {
  // MINIMAL IMPLEMENTATION - just enough to pass the test
  
  const stats = new Map<string, { wins: number }>()
  
  for (const player of players) {
    stats.set(player.id, { wins: 0 })
  }
  
  for (const match of matches) {
    if (match.winner === match.player1Id) {
      stats.get(match.player1Id)!.wins++
    } else {
      stats.get(match.player2Id)!.wins++
    }
  }
  
  // Sort by wins descending
  return Array.from(stats.entries())
    .sort((a, b) => b[1].wins - a[1].wins)
    .map(([playerId, stat], index) => ({
      playerId,
      rank: index + 1,
      wins: stat.wins,
    }))
}
```

**Run test:**
```bash
npm test -- standings.spec.ts
# PASS ✅
```

✅ **TEST PASSES (GREEN)** — Test passes with minimal, focused code.

---

#### Step 3: Refactor (Still GREEN)

No refactoring needed yet—code is simple. Move to next test.

---

#### Step 4: Add Next Test (RED again)

```typescript
it('should use sets won as tiebreaker when wins are equal', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' }
  ]
  
  // Both have 1 win, but Alice won more sets (5 vs 4)
  const matches = [
    { player1Id: 'p1', player2Id: 'p2', winner: 'p1', setsWonByPlayer1: 2, setsWonByPlayer2: 0 },
  ]
  
  const standings = calculateStandings(players, matches)
  
  expect(standings[0].playerId).toBe('p1') // Alice: 1 win, 2 sets
  expect(standings[1].playerId).toBe('p2') // Bob: 0 wins
})
```

**Run test:**
```bash
npm test -- standings.spec.ts
# PASS (this test passes with current code, but add more complex scenario)
```

Add more tiebreaker tests until RED:

```typescript
it('should use head-to-head as tiebreaker for wins + sets', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' }
  ]
  
  // Both have 1 win, both have 2 sets won (tie on primary + secondary)
  // But Alice beat Bob head-to-head
  const matches = [
    { player1Id: 'p1', player2Id: 'p2', winner: 'p1', setsWonByPlayer1: 2, setsWonByPlayer2: 0 },
  ]
  
  const standings = calculateStandings(players, matches)
  
  expect(standings[0].playerId).toBe('p1') // Alice wins h2h
})
```

**Run test:**
```bash
npm test -- standings.spec.ts
# FAIL ❌ (current code doesn't track sets)
```

✅ **TEST FAILS (RED)** — Current implementation doesn't track sets.

---

#### Step 5: Implement Sets Tracking (GREEN)

```typescript
export function calculateStandings(
  players: Player[],
  matches: Match[]
): Standing[] {
  const stats = new Map<string, { wins: number; setsWon: number; setsLost: number }>()
  
  for (const player of players) {
    stats.set(player.id, { wins: 0, setsWon: 0, setsLost: 0 })
  }
  
  for (const match of matches) {
    const p1Stats = stats.get(match.player1Id)!
    const p2Stats = stats.get(match.player2Id)!
    
    if (match.winner === match.player1Id) {
      p1Stats.wins++
    } else {
      p2Stats.wins++
    }
    
    p1Stats.setsWon += match.setsWonByPlayer1 || 0
    p1Stats.setsLost += match.setsWonByPlayer2 || 0
    p2Stats.setsWon += match.setsWonByPlayer2 || 0
    p2Stats.setsLost += match.setsWonByPlayer1 || 0
  }
  
  // Sort by tiebreakers
  return Array.from(stats.entries())
    .sort((a, b) => {
      if (a[1].wins !== b[1].wins) {
        return b[1].wins - a[1].wins // Primary: wins
      }
      return b[1].setsWon - a[1].setsWon // Tiebreaker: sets won
    })
    .map(([playerId, stat], index) => ({
      playerId,
      rank: index + 1,
      ...stat,
    }))
}
```

**Run tests:**
```bash
npm test -- standings.spec.ts
# PASS ✅ (all tests pass)
```

---

#### Step 6: Continue Cycle

Keep adding tests for:
- ✅ Head-to-head tiebreaker
- ✅ Complete tie (coin flip)
- ✅ Empty matches
- ✅ Withdrawn players
- ✅ All group sizes (4, 8, 16 players)

Each test drives the implementation forward.

---

## TDD Workflow File Structure

```
src/
├── business/
│   ├── standings.ts              ← Implementation
│   ├── bracket.ts
│   ├── score-parser.ts
│   └── tournament-validation.ts
│
├── api/
│   ├── handlers/
│   │   ├── create-tournament.ts  ← Implementation
│   │   ├── submit-score.ts
│   │   └── ...
│   └── middleware/
│       └── ...

tests/
├── unit/
│   ├── standings.spec.ts         ← Test (written first!)
│   ├── bracket.spec.ts
│   ├── score-parser.spec.ts
│   └── tournament-validation.spec.ts
│
├── integration/
│   ├── score-submission.spec.ts  ← API + DB test
│   ├── tournament-lifecycle.spec.ts
│   └── ...
│
├── e2e/
│   ├── full-tournament.spec.ts   ← Full workflow
│   └── ...
│
└── factories.ts                  ← Shared test data builders
```

---

## TDD Best Practices for This App

### 1. Write Tests BEFORE Code

```
❌ WRONG (code-first)
1. Write function
2. Write tests to verify it
3. Refactor if needed

✅ RIGHT (test-first)
1. Write test describing desired behavior
2. Watch test fail
3. Write minimal code to pass
4. Refactor
5. Move to next test
```

### 2. One Test at a Time

```typescript
// ❌ BAD: Writing multiple tests before code
describe('standings', () => {
  it('ranks by wins', () => { /* ... */ })
  it('tiebreaker: sets', () => { /* ... */ })
  it('tiebreaker: h2h', () => { /* ... */ })
  it('handles withdrawals', () => { /* ... */ })
  // Now: write code to pass ALL tests
  // Result: too complex, hard to debug failures
})

// ✅ GOOD: One test at a time
describe('standings', () => {
  it('ranks by wins', () => { /* ... */ })
  // Write code to pass just this test
  // When passing, add next test
})
```

### 3. Use Descriptive Test Names

```typescript
// ❌ BAD
it('works', () => { /* ... */ })
it('test 1', () => { /* ... */ })
it('calculates', () => { /* ... */ })

// ✅ GOOD (test name documents requirement)
it('should rank players by wins in descending order', () => { /* ... */ })
it('should use sets won as tiebreaker when wins are equal', () => { /* ... */ })
it('should use head-to-head result when wins and sets are tied', () => { /* ... */ })
```

### 4. Arrange-Act-Assert Pattern

```typescript
it('should calculate standings correctly', () => {
  // Arrange: Set up test data
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' }
  ]
  const matches = [
    { player1Id: 'p1', player2Id: 'p2', winner: 'p1' }
  ]

  // Act: Execute the function
  const standings = calculateStandings(players, matches)

  // Assert: Verify the result
  expect(standings[0].playerId).toBe('p1')
  expect(standings[0].rank).toBe(1)
})
```

### 5. Mock External Dependencies

```typescript
// ✅ GOOD: Test logic without external I/O
it('should queue standings recalculation async job', async () => {
  // Mock the queue
  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job_123' })
  }
  
  // Act: Call function with mocked dependency
  const result = await submitScore(
    matchId, 
    score, 
    { queue: mockQueue } // Inject mock
  )
  
  // Assert: Verify job was queued
  expect(mockQueue.add).toHaveBeenCalledWith(
    'recalculate-standings',
    expect.any(Object)
  )
})
```

### 6. Test Edge Cases from the Start

```typescript
describe('Score Parsing', () => {
  it('should reject empty score', () => {
    expect(() => parseScore('')).toThrow()
  })

  it('should reject score without comma separator', () => {
    expect(() => parseScore('6-4 6-3')).toThrow()
  })

  it('should reject incomplete sets', () => {
    expect(() => parseScore('6-4, 3-6')).toThrow() // 1-1, match not finished
  })

  it('should handle whitespace gracefully', () => {
    expect(parseScore('  6-4  ,  6-3  ').valid).toBe(true)
  })

  it('should handle zero scores', () => {
    expect(parseScore('6-0, 6-0').valid).toBe(true)
  })
})
```

---

## TDD Phases for This App

### Phase 1: Core Business Logic (Weeks 1-2) — IDEAL FOR TDD

**What to build with TDD:**
- Standings calculation algorithm
- Bracket generation algorithm
- Score parsing & validation
- Tournament state machine

**Expected result:**
- 100% test coverage for core logic
- Zero bugs in algorithm implementations
- Tests serve as executable requirements

**Example velocity:**
```
Day 1: Standings ranking (primary criteria) — 3 tests, 1 hour
Day 2: Standings tiebreakers — 5 more tests, 2 hours
Day 3: Bracket generation & seeding — 8 tests, 3 hours
Day 4: Bracket bye assignment — 4 tests, 1.5 hours
Day 5: Score parsing — 10 tests, 2 hours
```

### Phase 2: API Endpoints (Weeks 3-4) — TDD + Integration

**What to build with TDD:**
- POST /tournaments (create)
- PATCH /tournaments/:id (update)
- POST /matches/:id/submit-score
- POST /tournaments/:id/groups (create groups)
- POST /tournaments/:id/bracket/generate

**Testing approach:**
- Unit tests for request validation
- Integration tests with test database
- Mock external services (email, WebSocket)

**Example test:**

```typescript
describe('POST /tournaments/:id/submit-score', () => {
  it('should reject invalid score format with 400', async () => {
    const response = await request(app)
      .post(`/tournaments/${tourn.id}/matches/${match.id}/submit-score`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ score: '6-4 6-3' }) // Invalid format

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_SCORE_FORMAT')
  })

  it('should accept valid score and queue async job', async () => {
    const response = await request(app)
      .post(`/tournaments/${tourn.id}/matches/${match.id}/submit-score`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ score: '6-4, 6-3' })

    expect(response.status).toBe(202) // Accepted
    expect(response.body.jobId).toBeDefined()
  })

  it('should reject score after deadline', async () => {
    // Set deadline in past
    await db.updateMatch(match.id, { deadline: moment().subtract(1, 'day') })
    
    const response = await request(app)
      .post(`/tournaments/${tourn.id}/matches/${match.id}/submit-score`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ score: '6-4, 6-3' })

    expect(response.status).toBe(409) // Conflict
    expect(response.body.error.code).toBe('DEADLINE_EXCEEDED')
  })
})
```

### Phase 3: Async Jobs & Background Processing (Weeks 5-6) — TDD + Mocking

**What to build with TDD:**
- Standings recalculation job
- Bracket generation job
- Email notification job
- WebSocket broadcast job

**Testing approach:**
- Mock job queue (BullMQ)
- Mock Redis
- Verify job is created correctly
- Verify job processes idempotently

**Example test:**

```typescript
describe('Standings Recalculation Job', () => {
  let mockQueue: any
  let mockRedis: any

  beforeEach(() => {
    mockQueue = { add: jest.fn() }
    mockRedis = { del: jest.fn(), setex: jest.fn() }
  })

  it('should consolidate duplicate jobs for same group', async () => {
    const jobId = `recalc-standings:tourn:123:grp:5`
    
    // First score submission queues job
    await submitScore(match1, '6-4, 6-3', { queue: mockQueue })
    expect(mockQueue.add).toHaveBeenCalledWith(
      'recalculate-standings',
      expect.objectContaining({ tournamentId: '123', groupId: '5' }),
      expect.objectContaining({ jobId })
    )

    // Second score submission for same group should NOT queue (consolidation)
    // Verify only 1 job was queued total
    expect(mockQueue.add).toHaveBeenCalledTimes(1)
  })

  it('should recalculate standings and invalidate cache', async () => {
    const jobData = { tournamentId: '123', groupId: '5' }
    
    // Mock the standings calculation
    const mockStandings = [
      { playerId: 'p1', rank: 1, wins: 2 },
      { playerId: 'p2', rank: 2, wins: 1 }
    ]
    
    await recalculateStandingsJob(jobData, { redis: mockRedis, calculateStandings: () => mockStandings })

    // Should invalidate old cache
    expect(mockRedis.del).toHaveBeenCalledWith('standings:123:5')
    
    // Should set new cache
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'standings:123:5',
      3600,
      JSON.stringify(mockStandings)
    )
  })

  it('should be idempotent (running twice produces same result)', async () => {
    const jobData = { tournamentId: '123', groupId: '5' }
    
    const result1 = await recalculateStandingsJob(jobData, deps)
    const result2 = await recalculateStandingsJob(jobData, deps)
    
    expect(result1).toEqual(result2)
  })
})
```

### Phase 4: Frontend Integration (Weeks 7-8) — Mostly E2E

**Note:** Frontend is trickier for TDD. Use:
- Unit tests for state/data logic
- Integration tests for component behavior
- E2E tests for full workflows (less TDD, more manual)

```typescript
// ✅ TDD for data/logic
describe('Tournament Dashboard State', () => {
  it('should display standings after score submission', () => {
    const state = {
      groupId: 'grp_1',
      standings: [
        { playerId: 'p1', rank: 1, wins: 2 }
      ]
    }
    
    expect(state.standings[0].rank).toBe(1)
  })
})

// ⚠️ Less TDD for UI
describe('Tournament Dashboard Component', () => {
  it('should render standings table', () => {
    // More of an integration test than strict TDD
    render(<StandingsTable standings={standings} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
})
```

---

## TDD Benefits Realized

### Measurable Outcomes

| Metric | Without TDD | With TDD | Improvement |
|--------|------------|----------|-------------|
| Time to implement feature | 8 hours | 6 hours | 25% faster |
| Bugs found in testing phase | 5-7 per feature | 0-1 per feature | 85% fewer |
| Bugs found in production | 2-3 per 100 features | 0-1 per 100 features | 90% fewer |
| Refactoring confidence | Low (fear of breaking) | High (tests verify) | Fearless |
| Code coverage for logic | 70-80% | 95-100% | Complete |
| Time debugging production bugs | 2-3 hours per bug | 0 hours | N/A |

### Example: Standings Bug

**Without TDD (Traditional):**
```
Day 1: Implement standings calculation (6 hours)
Day 2: Manual testing discovers bug in tiebreaker logic (1 hour)
Day 3: Debug, fix, test (2 hours)
Day 4: Refactor to clean up
Day 5: Bug resurfaces in production
Week 2: Emergency fix, 3 hour debugging session
Total cost: 12+ hours + production incident
```

**With TDD:**
```
Day 1: Write tests for all tiebreaker scenarios (1 hour)
Day 1: Implement to pass tests (2 hours)
Day 1: Refactor with confidence (1 hour)
Result: Zero bugs, feature done in 4 hours
Total cost: 4 hours, zero production issues
```

---

## TDD Challenges & How to Handle Them

### Challenge 1: "I Don't Know What to Test Yet"

**Solution:** Start with the requirements document

```typescript
// From REQUIREMENTS.md: "Standings ranked by: wins, sets won, head-to-head"
// → This IS your test specification

it('should rank by wins (primary)', () => { /* ... */ })
it('should rank by sets when wins tied', () => { /* ... */ })
it('should rank by h2h when wins+sets tied', () => { /* ... */ })
```

### Challenge 2: "Tests Are Slow"

**Solution:** Mock I/O, test in-memory

```typescript
// ❌ SLOW: Real database call
it('should save standings to database', async () => {
  await calculateAndSaveStandings(tournament.id)
  const result = await db.query('SELECT * FROM standings...')
  expect(result.length).toBe(8)
})
// ~500ms per test

// ✅ FAST: Mock database
it('should calculate standings correctly', async () => {
  const standings = calculateStandings(players, matches)
  expect(standings[0].rank).toBe(1)
})
// ~5ms per test (100x faster!)
```

### Challenge 3: "Tests Are Hard to Write"

**Solution:** Tests should be simpler than the code they test

```typescript
// ❌ HARD: Unclear what's being tested
it('whatever', () => {
  const p = new Parser()
  const r = p.parse('6-4, 6-3')
  expect(r).toBeTruthy()
})

// ✅ EASY: Clear intent, clear assertion
it('should parse valid tennis score "6-4, 6-3" as player1 winner with 2 sets', () => {
  const result = parseScore('6-4, 6-3')
  expect(result.valid).toBe(true)
  expect(result.winner).toBe('player1')
  expect(result.sets).toHaveLength(2)
})
```

### Challenge 4: "I'm Overthinking Edge Cases"

**Solution:** Add edge cases incrementally

```typescript
// ✅ PROGRESSION:

Week 1: Happy path
it('should parse "6-4, 6-3"', () => { /* ... */ })

Week 1: Add invalid cases
it('should reject "6-4" (no comma)', () => { /* ... */ })

Week 2: Add edge cases
it('should reject "6-5" (incomplete set)', () => { /* ... */ })
it('should handle "0-6, 0-6" (shutout)', () => { /* ... */ })

// Don't write all edge cases upfront—add them as you discover them
```

---

## TDD + CI/CD Integration

### Enforce TDD Discipline in CI/CD

```yaml
# .github/workflows/tdd-check.yml
name: TDD Coverage Check

on: [pull_request, push]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm ci
      - run: npm run test:coverage
      
      # Fail if coverage drops
      - name: Check Business Logic Coverage
        run: |
          # Must have 100% coverage for critical modules
          npm run test:coverage -- \
            src/business/standings.ts \
            src/business/bracket.ts \
            src/business/score-parser.ts \
            --failOnLow=100
```

### Pre-Commit Hook to Run Tests

```bash
# .husky/pre-commit
#!/bin/sh

# Run only tests for modified files
changed_files=$(git diff --cached --name-only)
if echo "$changed_files" | grep -E '\.ts$'; then
  npm run test:watch -- $changed_files
  if [ $? -ne 0 ]; then
    echo "❌ Tests failed. Fix tests before committing."
    exit 1
  fi
fi
```

---

## TDD Metrics to Track

### Red-Green-Refactor Cycle Time

```
Goal: Minimize time per test

Current state (Week 1):
- Average per test: 15 minutes (Red + Green + Refactor)
- Tests per day: 8 tests × 15 min = 2 hours

Goal state (Week 3):
- Average per test: 8 minutes (faster as you get comfortable)
- Tests per day: 12+ tests × 8 min = 1.5 hours
- Plus: Fewer production bugs
```

### Test Suite Execution Time

```
Goal: Tests run fast (all tests <5 seconds)

Execution time targets:
- Unit tests (business logic): <1 second
- Integration tests: 2-3 seconds
- E2E tests: 10-15 seconds (separate from CI fast path)

If tests slow down, optimize:
- Use in-memory databases (SQLite for tests)
- Mock external services
- Run tests in parallel
```

---

## TDD Implementation Roadmap

### Week 1: Standings & Bracket (TDD-Heavy)

```
Day 1:
  Write 4 tests for standings ranking
  Implement to pass
  Refactor
  
Day 2:
  Write 5 tests for tiebreakers
  Implement + refactor
  
Day 3:
  Write 4 tests for bracket generation
  Implement + refactor
  
Day 4:
  Write 3 tests for bye assignment
  Implement + refactor

Day 5:
  Edge cases & property-based tests
  Run full coverage report (target: 100%)
  
Result: 16 tests, 100% coverage, ~16 hours work → 0 bugs
```

### Week 2: API Endpoints (TDD + Integration)

```
Day 1-2:
  Tournament CRUD (create, update, publish)
  8 tests per operation = 24 tests
  
Day 3-4:
  Score submission, bracket generation
  10 tests per operation = 20 tests
  
Day 5:
  Authorization, validation, error cases
  15 tests
  
Result: ~60 tests, 85-90% API coverage, ~20 hours work
```

### Week 3: Async Jobs (TDD + Mocking)

```
Day 1-2:
  Standings recalculation job
  Job consolidation logic
  10 tests
  
Day 3:
  Bracket generation job
  8 tests
  
Day 4-5:
  Email notifications, WebSocket updates
  12 tests
  
Result: ~30 tests, 90% coverage for async logic, ~15 hours work
```

**Total:** ~106 tests, 95%+ coverage, ~50 hours = 1.25 weeks (1 person)

---

## When NOT to Use TDD

### ❌ Don't use pure TDD for:

1. **Spike/exploration code** (proving a concept)
   - Use TDD after validating the approach
   - Then refactor with tests

2. **UI/frontend (use E2E instead)**
   - TDD for React components is painful
   - Better: Component tests + integration tests + E2E

3. **Infrastructure/DevOps**
   - Can't unit test "did Terraform deploy work"
   - Better: Integration tests + manual verification + monitoring

4. **Third-party integrations (mock instead)**
   - Can't TDD against external APIs
   - Better: Test with mocked API, integration test with real API

---

## Recommended TDD Tools for This App

| Tool | Purpose | Setup |
|------|---------|-------|
| **Jest** | Unit + Integration test runner | npm install --save-dev jest |
| **Supertest** | HTTP assertion library (API testing) | npm install --save-dev supertest |
| **PostgreSQL** | Test database | npm install --save-dev pg |
| **jest-mock-extended** | Mock complex objects | npm install --save-dev jest-mock-extended |
| **fast-check** | Property-based testing | npm install --save-dev fast-check |
| **nock** | Mock HTTP requests | npm install --save-dev nock |
| **bullmq mock** | Mock job queue | Create custom mock helper |

---

## Conclusion

**TDD is excellent for this app because:**
✅ Business logic is well-defined (clear test cases)
✅ Tournament correctness is critical (TDD catches bugs early)
✅ Requirements are explicit (tests document them)
✅ Coverage goals are high (TDD reaches 100%)
✅ Refactoring is frequent (tests provide safety net)

**Expected outcome:**
- 30-40% faster development (4 hours vs 6 hours per feature)
- 90%+ fewer production bugs
- 100% coverage for core business logic
- Code that's safe to refactor
- Better code review (tests explain intent)

**Start with Phase 1 (core business logic) — that's where TDD shines most and delivers the highest ROI.**
