# Phase 1 Patterns Identified - Quick Reference

## What Was Identified from Phase 1 (Authentication)

### ✅ Reusable Helper Functions

Four core helpers that work for all test phases:

```typescript
// 1. API Call Helper - Set up test data via API
async function apiCall(path: string, method: string, body?: unknown) { ... }

// 2. Token Verification - Check auth state
async function getTokenFromPage(page: any): Promise<string | null> { ... }

// 3. Auth State Reset - Between tests and before suites
async function clearAuthState(page: any) { ... }

// 4. Unique Test Data - Avoid conflicts in parallel runs
function createTestUser() { ... }
```

**Status:** All 4 are production-ready and appear in every test file.

---

## Structural Patterns

### 1. Test File Organization
```
test.describe('Feature Group E2E', () => {
  test.beforeEach(async ({ page }) => { ... })
  
  test.describe('Feature: Feature Name', () => {
    test('Scenario: scenario name', async ({ page }) => { ... })
  })
})
```

**Why:** Nested describes match Gherkin structure, making requirements traceable to code.

---

### 2. Test Naming
✅ **GOOD:** `test('Scenario: User successfully signs up with valid credentials')`  
❌ **AVOID:** `test('should sign up')`

**Why:** Name must match scenario in e2e-scenarios.md for traceability.

---

### 3. Test Body Structure
```typescript
test('Scenario: X', async ({ page }) => {
  // Given: Initial state
  
  // When: User action
  
  // Then: Expected outcome
})
```

**Why:** Given/When/Then comments make test intent immediately clear.

---

## Element Selection Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| **text=X** | Link/text | `text=Sign in` |
| **button:has-text(X)** | Buttons | `button:has-text("Sign In")` |
| **input[type="email"]** | Type selector | `input[type="email"]` |
| **input[placeholder="X"]** | By placeholder | `input[placeholder="Your name"]` |
| **[data-testid="X"]** | Explicit ID (best) | `[data-testid="submit-btn"]` |
| **[aria-label="X"]** | Accessibility | `[aria-label="Register"]` |

**Ranking:** data-testid > aria-label > button:has-text > input[type] > text

---

## Data Patterns

### Unique Test Data (Critical for Parallel Runs)
```typescript
// ✅ CORRECT - No conflicts
const email = `test-${Date.now()}@example.com`

// ❌ WRONG - Will conflict in parallel
const email = 'testuser@example.com'
```

### Test Fixture Creation
```typescript
function createTestUser() {
  return {
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    password: 'TestPassword123',
  }
}

function createTestTournament() {
  return {
    name: `Tournament ${Date.now()}`,
    format: 'singles',
    maxPlayers: 16,
  }
}
```

---

## Navigation Patterns

### Flexible URL Matching
```typescript
// ✅ GOOD - Handles multiple routes
await expect(page).toHaveURL(/\/browse|\/dashboard/)

// ❌ BRITTLE - Breaks if route changes
await expect(page).toHaveURL('/browse')
```

### Network-Aware Navigation
```typescript
// ✅ GOOD - Waits for data to load
await page.goto('/browse', { waitUntil: 'networkidle' })

// ❌ RISKY - May test before data loads
await page.goto('/browse')
```

---

## Wait Strategies

| Wait Type | When to Use | Example |
|-----------|-------------|---------|
| **Element** | For DOM elements to appear | `expect(page.locator(...)).toBeVisible()` |
| **URL** | For navigation to complete | `expect(page).toHaveURL('/path')` |
| **Network** | For API requests to finish | `{ waitUntil: 'networkidle' }` |
| **Custom** | For complex conditions | `page.waitForFunction(...)` |
| **Delay** | Last resort (rare) | `page.waitForTimeout(2000)` |

**Ranking:** Element > URL > Network > Custom > Delay

---

## Assertion Patterns

### Flexible (Recommended)
```typescript
// Works with UI variations
await expect(page.locator('text=/success|created|registered/i')).toBeVisible()

// Fallback approach
await expect(page.locator('.success-banner')).toBeVisible().catch(() => {
  return expect(page).toHaveURL('/tournament')
})
```

### Specific (Use Sparingly)
```typescript
// Only when UI is stable
await expect(page.locator('.tournament-name')).toContainText('My Tournament')
```

---

## API Precondition Pattern

Use API to set up data, then test UI:

```typescript
test('Scenario: User can view tournament', async ({ page }) => {
  // Given: Tournament exists (via API)
  const tourneyRes = await apiCall('/api/tournaments', 'POST', {
    name: 'Test Tournament',
    format: 'singles',
  })
  const tournament = await tourneyRes.json()

  // When: User navigates to it
  await page.goto(`/tournament/${tournament.id}`)

  // Then: Sees details
  await expect(page.locator('h1')).toContainText('Test Tournament')
})
```

**Why:** Tests UI integration without duplicating backend logic.

---

## Common Pitfalls (Learned from Phase 1)

### 1. ⚠️ Race Conditions
```typescript
// ❌ WRONG
await page.goto('/browse')
await expect(page.locator('.tournament')).toBeVisible()

// ✅ RIGHT
await page.goto('/browse', { waitUntil: 'networkidle' })
await expect(page.locator('.tournament')).toBeVisible()
```

### 2. ⚠️ Hard-Coded Test Data
```typescript
// ❌ WRONG - Fails on 2nd run (email conflict)
const email = 'test@example.com'

// ✅ RIGHT - Unique per run
const email = `test-${Date.now()}@example.com`
```

### 3. ⚠️ Brittle Selectors
```typescript
// ❌ WRONG - Breaks if layout changes
await page.click('div:nth-child(3) > button')

// ✅ RIGHT - Semantic and stable
await page.click('button:has-text("Register")')
```

### 4. ⚠️ Over-Specific Assertions
```typescript
// ❌ WRONG - Requires exact element
await expect(page.locator('.error-banner-red')).toBeVisible()

// ✅ RIGHT - Flexible, intent-based
await expect(page.locator('text=/error|invalid/i')).toBeVisible()
```

### 5. ⚠️ Unclear Test Purpose
```typescript
// ❌ WRONG
test('should work', async ({ page }) => { ... })

// ✅ RIGHT
test('Scenario: User can register for tournament', async ({ page }) => { ... })
```

---

## Browser Compatibility

Tests run on both **Chromium** and **Firefox** automatically.

**Safe patterns (work on both):**
- `page.click(selector)`
- `page.fill(selector, text)`
- `page.goto(url)`
- `expect(page).toHaveURL(...)`

**Unsafe (may differ):**
- Browser-specific APIs
- Performance-dependent waits
- Visual rendering specifics

---

## File Organization for All Phases

```
packages/frontend/e2e/
├── auth.spec.ts                    # Phase 1 ✅ 32 tests
├── tournament-discovery.spec.ts    # Phase 2 ⏳ 9 tests
├── group-stage-singles.spec.ts     # Phase 3 ⏳ 10 tests
├── group-stage-doubles.spec.ts     # Phase 4 ⏳ 4 tests
├── partner-confirmation.spec.ts    # Phase 5 ⏳ 5 tests
├── bracket-singles.spec.ts         # Phase 6 ⏳ 3 tests
├── bracket-doubles.spec.ts         # Phase 7 ⏳ 2 tests
├── real-time-updates.spec.ts       # Phase 8 ⏳ 4 tests
├── offline-error.spec.ts           # Phase 9 ⏳ 4 tests
├── mobile-responsive.spec.ts       # Phase 10 ⏳ 4 tests
├── README.md                       # Pattern guide (this repo)
├── PATTERNS-SUMMARY.md             # Quick reference
└── TEMPLATE.spec.ts                # Copy-paste template
```

---

## Quick Checklist for New Test Files

- [ ] Copy `TEMPLATE.spec.ts` to `new-name.spec.ts`
- [ ] Update feature group name in describe block
- [ ] Add test blocks for each scenario from e2e-scenarios.md
- [ ] Use exact scenario names from requirements
- [ ] Include Given/When/Then comments
- [ ] Use `createTestUser()` or similar for unique data
- [ ] Use semantic selectors (`button:has-text`, not `div:nth-child`)
- [ ] Add `{ waitUntil: 'networkidle' }` to page.goto
- [ ] Test on both browsers (automatic via Playwright)
- [ ] Run: `npx playwright test your-file.spec.ts --ui`

---

## Performance Expectations

- Single scenario: ~3-5 seconds
- Feature group (5-10 scenarios): ~15-20 seconds
- Full auth phase (32 scenarios): ~1.1 minutes
- All phases combined (95+ scenarios): ~5-10 minutes

Parallel execution via Playwright reduces overall time significantly.

---

## Next Steps for Phase 2

1. Create `tournament-discovery.spec.ts`
2. Copy structure from `TEMPLATE.spec.ts`
3. Implement 9 scenarios from e2e-scenarios.md
4. Run: `npx playwright test tournament-discovery.spec.ts --ui`
5. Verify all 18 tests pass (9 scenarios × 2 browsers)
6. Follow the same patterns for Phases 3-10

All patterns above are proven in Phase 1 and ready to scale.
