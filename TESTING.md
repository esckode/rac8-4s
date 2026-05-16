# Testing Guide

Comprehensive testing strategy, how to run tests, and guidelines for adding new tests.

## Overview

- **1302 tests** across 62 test suites
- **95%+ coverage** on business logic and critical paths
- **True TDD approach** — Tests written before implementation
- **Fast execution** — Complete suite runs in ~30 seconds
- **Zero flakes** — All tests deterministic and isolated

## Running Tests

### Run All Tests
```bash
npm test

# Output:
# Test Suites: 62 passed, 62 total
# Tests:       1302 passed, 1302 total
# Time:        ~30s
```

### Watch Mode (Development)
```bash
npm test -- --watch

# Re-runs affected tests on file change
# Press 'a' to run all tests
# Press 'q' to quit
```

### Coverage Report
```bash
npm test -- --coverage

# Shows statement, branch, function, line coverage
# Coverage files in coverage/
# Open coverage/lcov-report/index.html for visual report
```

### Run Specific Tests
```bash
# By package
npm test -- packages/frontend

# By test file pattern
npm test -- --testPathPattern="StandingsTable"

# By test name
npm test -- --testNamePattern="renders"
```

## Test Structure

### File Organization
```
packages/frontend/src/
├── components/
│   ├── shared/
│   │   ├── StandingsTable.tsx
│   │   ├── StandingsTable.spec.tsx           # Component tests
│   │   └── StandingsTable.virtualization.spec.tsx  # Performance tests
│   └── ...
├── hooks/
│   ├── useTournament.ts
│   └── __tests__/
│       ├── useTournament.spec.ts             # Hook tests
│       └── useTournament.deduplication.spec.ts
└── ...
```

### Test Categories

1. **Unit Tests** — Function behavior
   ```typescript
   it('calculates standings correctly', () => {
     const standings = calculateStandings(matches)
     expect(standings[0].rank).toBe(1)
   })
   ```

2. **Component Tests** — React component rendering
   ```typescript
   it('renders tournament details', () => {
     render(<TournamentDetail />)
     expect(screen.getByText('Tournament Details')).toBeInTheDocument()
   })
   ```

3. **Integration Tests** — Full API flows with database
   ```typescript
   it('creates tournament and returns it', async () => {
     const res = await request(app)
       .post('/tournaments')
       .send(tournamentData)
     
     expect(res.status).toBe(201)
     const created = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(res.body.id)
     expect(created).toBeDefined()
   })
   ```

4. **Performance Tests** — Render time, virtualization
   ```typescript
   it('renders 500 rows in < 100ms', () => {
     const start = performance.now()
     render(<StandingsTable standings={Array(500)} />)
     const duration = performance.now() - start
     expect(duration).toBeLessThan(100)
   })
   ```

5. **Accessibility Tests** — WCAG compliance
   ```typescript
   it('has no accessibility violations', async () => {
     const { container } = render(<TournamentDetail />)
     const results = await axe(container)
     expect(results.violations).toHaveLength(0)
   })
   ```

## Common Testing Patterns

### Testing Hooks
```typescript
import { renderHook, act } from '@testing-library/react'
import { useTournament } from './useTournament'

it('fetches tournament data', async () => {
  const { result } = renderHook(() => useTournament('tourn_123'))
  
  await waitFor(() => {
    expect(result.current.tournament).toBeDefined()
  })
})
```

### Testing Components with Mocks
```typescript
jest.mock('../hooks/useTournament')

const mockUseTournament = useTournament as jest.MockedFunction

it('shows loading state', () => {
  mockUseTournament.mockReturnValue({
    isLoading: true,
    tournament: null,
    // ...
  })
  
  render(<TournamentDetail />)
  expect(screen.getByText('Loading...')).toBeInTheDocument()
})
```

### Testing Async Operations
```typescript
it('handles score submission', async () => {
  const { result } = renderHook(() => useScoreSubmit())
  
  act(() => {
    result.current.submit('2-1')
  })
  
  await waitFor(() => {
    expect(result.current.status).toBe('success')
  })
})
```

### Testing Database Operations
```typescript
it('saves analytics event to database', async () => {
  const res = await request(app)
    .post('/api/analytics/events')
    .set('Authorization', `Bearer ${token}`)
    .send({ events: [{ eventType: 'screen_view', screen: 'standings' }] })
  
  expect(res.status).toBe(204)
  
  const event = db.prepare('SELECT * FROM user_events').get()
  expect(event.event_type).toBe('screen_view')
})
```

## Coverage Requirements

### Business Logic (100% required)
- Standings calculation algorithm
- Bracket generation and seeding
- Score parsing and validation
- Tournament state machine
- Authentication and authorization

### API Routes (90%+ required)
- Happy path (success case)
- Error cases (invalid input, unauthorized)
- Edge cases (empty data, boundary conditions)

### UI Components (80%+ required)
- Rendering with different props
- User interactions (clicks, form submission)
- Error states
- Loading states

### Hooks (90%+ required)
- Initial state
- State changes
- Cleanup (useEffect cleanup)
- Error handling

## Writing Tests

### Test Template
```typescript
describe('Feature', () => {
  beforeEach(() => {
    // Setup (runs before each test)
  })
  
  afterEach(() => {
    // Cleanup (runs after each test)
    jest.clearAllMocks()
  })
  
  describe('Specific behavior', () => {
    it('should do something', () => {
      // Arrange (setup test data)
      const input = { /* ... */ }
      
      // Act (call the function/component)
      const result = functionUnderTest(input)
      
      // Assert (verify the result)
      expect(result).toEqual({ /* ... */ })
    })
  })
})
```

### Best Practices

1. **One assertion per test** (or related assertions)
   ```typescript
   // ✅ Good
   it('returns user with correct email', () => {
     const user = getUserById('user_123')
     expect(user.email).toBe('player@test.com')
   })
   
   // ❌ Avoid
   it('returns correct user', () => {
     const user = getUserById('user_123')
     expect(user.id).toBe('user_123')
     expect(user.email).toBe('player@test.com')
     expect(user.name).toBe('John Doe')
   })
   ```

2. **Test behavior, not implementation**
   ```typescript
   // ✅ Good (tests what it does)
   it('disables submit button when form is invalid', () => {
     render(<RegistrationForm />)
     const submitBtn = screen.getByRole('button', { name: /submit/i })
     expect(submitBtn).toBeDisabled()
   })
   
   // ❌ Avoid (tests how it works)
   it('calls preventDefault on submit', () => {
     const spy = jest.fn()
     render(<RegistrationForm onSubmit={spy} />)
     // ...
   })
   ```

3. **Use descriptive test names**
   ```typescript
   // ✅ Good
   it('should reject password shorter than 8 characters', () => { })
   
   // ❌ Avoid
   it('validates password', () => { })
   ```

4. **Test error cases**
   ```typescript
   it('returns error when network fails', async () => {
     jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))
     
     const result = await fetchTournament()
     
     expect(result).toEqual({ error: 'Network error' })
   })
   ```

5. **Test edge cases**
   ```typescript
   // Empty data
   it('handles empty standings list', () => {
     const standings = calculateStandings([])
     expect(standings).toEqual([])
   })
   
   // Boundary conditions
   it('ranks players with identical scores correctly', () => {
     const standings = calculateStandings([...]) // Tie case
     expect(standings[0].tiebreaker).toBe(...) // Uses tiebreaker
   })
   ```

## Performance Testing

### Render Time Tests
```typescript
it('renders StandingsTable with 500 rows in < 100ms', () => {
  const start = performance.now()
  render(<StandingsTable standings={Array(500).fill(standing)} />)
  const duration = performance.now() - start
  
  expect(duration).toBeLessThan(100)
})
```

### Virtualization Tests
```typescript
it('renders only visible rows (virtualization)', () => {
  const { container } = render(
    <StandingsTable standings={Array(500).fill(standing)} />
  )
  
  const rows = container.querySelectorAll('[role="row"]')
  // Should render ~20 visible rows + buffer, not 500
  expect(rows.length).toBeLessThan(50)
})
```

### Deduplication Tests
```typescript
it('deduplicates identical requests within 60s', async () => {
  const { result: result1 } = renderHook(() => useTournament('tourn_123'))
  const { result: result2 } = renderHook(() => useTournament('tourn_123'))
  
  // Both should use same cache entry
  expect(result1.current).toBe(result2.current)
})
```

## Debugging Tests

### Debug Output
```typescript
it('should render tournament details', () => {
  const { debug } = render(<TournamentDetail />)
  
  // Print rendered HTML to console
  debug()
})
```

### Inspect Element
```typescript
it('should have correct class', () => {
  const { container } = render(<Component />)
  
  // Print HTML of specific element
  console.log(container.querySelector('.tournament-title').outerHTML)
})
```

### Debug React Component State
```typescript
import { renderHook } from '@testing-library/react'

it('tracks state changes', () => {
  const { result, debug } = renderHook(() => useState(0))
  
  // Print state and re-renders
  debug()
})
```

### Run Single Test with Verbose Output
```bash
npm test -- --testNamePattern="specific test" --verbose
```

## Continuous Integration

### Test Requirements
- All tests must pass before merge
- Coverage must be >= 90% on new code
- No performance regressions (tests must complete in < 40s)
- No flaky tests (must pass consistently)

### GitHub Actions Workflow
```yaml
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm install
      - run: npm test
      - run: npm run type-check
      - run: npm run lint
```

## Analytics Testing

### Testing Event Collection
```typescript
it('collects screen_view event on navigation', () => {
  const { result } = renderHook(() => useAnalytics())
  
  act(() => {
    result.current.track({
      eventType: 'screen_view',
      screen: 'standings',
      duration: 2500
    })
  })
  
  // Verify event is buffered
  expect(result.current.eventBuffer).toContainEqual({
    eventType: 'screen_view',
    screen: 'standings',
    duration: 2500
  })
})
```

### Testing Analytics Submission
```typescript
it('submits analytics batch when buffer is full', async () => {
  const spy = jest.spyOn(api, 'submitAnalytics')
  const { result } = renderHook(() => useAnalytics({ batchSize: 2 }))
  
  // Add 2 events to trigger submission
  result.current.track(event1)
  result.current.track(event2)
  
  await waitFor(() => {
    expect(spy).toHaveBeenCalledWith([event1, event2])
  })
})
```

## Accessibility Testing

### jest-axe Audit
```typescript
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

it('has no accessibility violations', async () => {
  const { container } = render(<TournamentDetail />)
  const results = await axe(container)
  expect(results).toHaveNoViolations()
})
```

### Keyboard Navigation
```typescript
it('supports keyboard navigation', () => {
  render(<TournamentCardGrid />)
  
  const firstCard = screen.getByRole('button', { name: /tournament 1/i })
  firstCard.focus()
  
  fireEvent.keyDown(firstCard, { key: 'ArrowRight' })
  
  const nextCard = screen.getByRole('button', { name: /tournament 2/i })
  expect(nextCard).toHaveFocus()
})
```

## Test Maintenance

### Updating Tests
1. Run tests: `npm test -- --watch`
2. Make code change
3. Watch for test failures
4. Update tests if behavior changed
5. Ensure all tests pass before committing

### Cleaning Up
```bash
# Remove skipped/pending tests before commit
# Remove console.logs from tests
# Remove debug() calls

# Check for unused variables
npm run lint -- --fix
```

### Deprecation Handling
- Check test output for deprecation warnings
- Update mock usage if APIs change
- Keep test libraries up-to-date

---

**Status:** ✅ Test Suite Complete | **Coverage:** 95%+ | **Last Updated:** May 2026
