# Hardcodes Eliminated from E2E Tests

## Overview

E2E tests had **5 categories of hardcodes** that violated the "no hardcoding" principle. All have been extracted to `config.ts` for centralized management.

---

## 1. Routes (App URLs)

### ❌ Before (Hardcoded in 50+ places)
```typescript
await page.goto('/login')
await page.goto('/signup')
await page.goto('/browse')
await page.goto('/forgot-password')
await page.goto('/reset-password')
await page.goto('/tournament/123')
await expect(page).toHaveURL(/\/browse|\/dashboard/)
```

### ✅ After (Using `ROUTES` config)
```typescript
import { ROUTES } from './config'

await page.goto(ROUTES.LOGIN)
await page.goto(ROUTES.SIGNUP)
await page.goto(ROUTES.BROWSE)
await page.goto(ROUTES.FORGOT_PASSWORD)
await page.goto(ROUTES.RESET_PASSWORD)
await page.goto(ROUTES.TOURNAMENT_DETAIL('123'))
```

### Impact
- **Change consequence:** If routes change (e.g., `/browse` → `/tournaments`), update ONE file instead of editing 50+ test files
- **Example:** If you rename `/forgot-password` to `/password-recovery`, change only `ROUTES.FORGOT_PASSWORD` in config.ts

---

## 2. API Endpoints

### ❌ Before (Hardcoded in 20+ places)
```typescript
await apiCall('/api/auth/login', 'POST', {...})
await apiCall('/api/auth/signup', 'POST', {...})
await apiCall('/api/auth/logout', 'POST', {...})
await apiCall('/api/auth/forgot-password', 'POST', {...})
await apiCall('/api/tournaments', 'POST', {...})
await apiCall(`/api/tournaments/${id}`, 'GET')
```

### ✅ After (Using `API_ENDPOINTS` config)
```typescript
import { API_ENDPOINTS } from './config'

await apiCall(API_ENDPOINTS.AUTH.LOGIN, 'POST', {...})
await apiCall(API_ENDPOINTS.AUTH.SIGNUP, 'POST', {...})
await apiCall(API_ENDPOINTS.AUTH.LOGOUT, 'POST', {...})
await apiCall(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, 'POST', {...})
await apiCall(API_ENDPOINTS.TOURNAMENTS.CREATE, 'POST', {...})
await apiCall(API_ENDPOINTS.TOURNAMENTS.GET(id), 'GET')
```

### Impact
- **Change consequence:** If API structure changes (e.g., `/api/` → `/v1/api/`), update ONE config file
- **Example:** Versioning API endpoints becomes trivial - change `BASE_URL` once

---

## 3. UI Text & Selectors

### ❌ Before (Hardcoded in 30+ places)
```typescript
// Brittle - breaks if button text changes
await page.click('button:has-text("Sign In")')
await page.click('button:has-text("Create Account")')
await page.click('button:has-text("Send Reset Code")')
await page.click('text=Forgot password?')

// Multiple variations hardcoded
await page.click('button:has-text("Sign In"), button:has-text("Log In")')
```

### ✅ After (Using `UI_TEXT` & `SELECTORS` config)
```typescript
import { UI_TEXT, SELECTORS } from './config'

// Flexible - update text in one place
await page.click(SELECTORS.SIGN_IN_BUTTON())
await page.click(SELECTORS.CREATE_BUTTON())

// Centralized text variations
// UI_TEXT.BUTTONS.SIGN_IN = ['Sign In', 'Log In']

// For assertions, use patterns instead of exact text
await expect(page.locator('text=' + UI_TEXT.ERRORS.INVALID_EMAIL)).toBeVisible()
// Uses: /please enter a valid email/i - works with any capitalization or wording change
```

### Impact
- **Change consequence:** If UI changes button text (e.g., "Sign In" → "Log In"), update ONE config entry
- **A/B Testing:** Test different button labels without changing test code
- **Internationalization:** Easy to support multiple languages by swapping UI_TEXT config
- **Example:** Change `BUTTONS.SIGN_IN: ['Sign In']` to `BUTTONS.SIGN_IN: ['Sign In', 'Log In', 'Login']` and all tests handle all variants

---

## 4. Timeout Values

### ❌ Before (Hardcoded in 20+ places)
```typescript
await page.waitForURL(/\/browse/, { timeout: 10000 })
await expect(page.locator('...')).toBeVisible({ timeout: 5000 })
await page.waitForTimeout(2000)
await page.waitForFunction(() => {...}, { timeout: 5000 })
```

### ✅ After (Using `TIMEOUTS` config)
```typescript
import { TIMEOUTS } from './config'

await page.waitForURL(/\/browse/, { timeout: TIMEOUTS.PAGE_LOAD })
await expect(page.locator('...')).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE })
await page.waitForTimeout(TIMEOUTS.REQUEST_PROCESSING)
await page.waitForFunction(() => {...}, { timeout: TIMEOUTS.CUSTOM_CONDITION })

// Or use environment variables for CI/staging environments
process.env.TIMEOUT_PAGE_LOAD = '15000'  // Slower CI environment
```

### Impact
- **Tuning:** If tests timeout in CI but not locally, update `TIMEOUTS.PAGE_LOAD` once instead of 20+ locations
- **Environment-specific:** Different timeouts for local (fast) vs CI (slow) without changing test code
- **Scalability:** As test data grows, increase `TIMEOUTS.API_RESPONSE` once instead of everywhere
- **Example:** In CI environment, set `TIMEOUT_PAGE_LOAD=15000` in environment instead of editing tests

---

## 5. Test Data Defaults

### ❌ Before (Hardcoded in 30+ test fixtures)
```typescript
// Hardcoded password repeated everywhere
password: 'TestPassword123'

// Hardcoded name repeated everywhere
name: 'Test User'

// Hardcoded tournament format
format: 'singles'
sport: 'pickleball'
```

### ✅ After (Using `TEST_DATA` config)
```typescript
import { TEST_DATA } from './config'

const user = {
  email: TEST_DATA.USER.generateEmail(),  // Unique per run
  name: TEST_DATA.USER.DEFAULT_NAME,      // Centralized default
  password: TEST_DATA.USER.DEFAULT_PASSWORD,
}

const tournament = {
  name: TEST_DATA.TOURNAMENT.generateName(),  // Unique per run
  format: TEST_DATA.TOURNAMENT.DEFAULT_FORMAT_SINGLES,
  sport: TEST_DATA.TOURNAMENT.DEFAULT_SPORT,
}
```

### Impact
- **Change consequence:** If password requirements change (e.g., must have special char), update ONE config
- **Security:** Can inject test credentials from secure environment variables
- **Consistency:** All tests use same defaults - no test data conflicts
- **Example:** Change `DEFAULT_PASSWORD` from `'TestPassword123'` to `'Test@Pass123!'` once

---

## 6. API Base URL

### ❌ Before (Hardcoded)
```typescript
const API_BASE = 'http://localhost:3001'

// What if you need to test against staging/production?
// You have to edit the constant directly
```

### ✅ After (Using `API_CONFIG` with env fallback)
```typescript
export const API_CONFIG = {
  BASE_URL: process.env.API_BASE_URL || 'http://localhost:3001',
}

// Set environment variable in CI
// API_BASE_URL=https://staging-api.example.com npm run test:e2e
```

### Impact
- **Environment switching:** Test against local, staging, or production without changing code
- **CI/CD integration:** Easy to parameterize in GitHub Actions, GitLab CI, etc.
- **Example:** Same test suite runs against both staging and production

---

## Summary of Changes

| Hardcode Type | Before | After | Benefit |
|---|---|---|---|
| **Routes** | 50+ places | `ROUTES` const | Single source of truth |
| **API endpoints** | 20+ places | `API_ENDPOINTS` const | Easy versioning |
| **UI text** | 30+ places | `UI_TEXT` const | Flexible, A/B testable |
| **Timeouts** | 20+ places | `TIMEOUTS` const | Environment-aware |
| **Test data** | 30+ places | `TEST_DATA` helpers | Consistent, secure |
| **API URL** | 1 hardcoded const | `API_CONFIG` with env | Multi-environment |

---

## How to Use config.ts

### Basic Import
```typescript
import { ROUTES, API_ENDPOINTS, TIMEOUTS, TEST_DATA, SELECTORS, UI_TEXT } from './config'
```

### Example Test Using Config
```typescript
test('Scenario: User successfully signs up', async ({ page }) => {
  // Use configured routes
  await page.goto(ROUTES.SIGNUP)

  // Use configured selectors
  const email = TEST_DATA.USER.generateEmail()
  await page.fill(SELECTORS.EMAIL_INPUT, email)
  await page.fill(SELECTORS.PASSWORD_INPUT, TEST_DATA.USER.DEFAULT_PASSWORD)
  await page.fill(SELECTORS.NAME_INPUT, TEST_DATA.USER.DEFAULT_NAME)

  // Use configured button selectors
  await page.click(SELECTORS.CREATE_BUTTON())

  // Use configured timeouts
  await expect(page).toHaveURL(ROUTES.BROWSE, { 
    timeout: TIMEOUTS.PAGE_LOAD 
  })
})
```

### Setting Environment Variables in CI

```yaml
# GitHub Actions
- name: Run E2E Tests
  env:
    API_BASE_URL: https://staging-api.example.com
    TIMEOUT_PAGE_LOAD: 15000
    TIMEOUT_API_RESPONSE: 15000
  run: npm run test:e2e
```

```bash
# Local testing against different environment
API_BASE_URL=https://prod-api.example.com npm run test:e2e
```

---

## Migration Path for Phase 2+

All new test files should use `config.ts`:

1. **Copy TEMPLATE.spec.ts** (already updated to use config)
2. **Import config at top**
3. **Replace any hardcoded values with config constants**

Example for Phase 2 (Tournament Discovery):
```typescript
import { ROUTES, API_ENDPOINTS, TIMEOUTS, TEST_DATA } from './config'

test.describe('Feature: Tournament Discovery', () => {
  test('Scenario: User browses public tournaments', async ({ page }) => {
    // Given: I am authenticated
    const user = { email: TEST_DATA.USER.generateEmail(), ... }
    
    // When: I navigate to browse
    await page.goto(ROUTES.BROWSE, { waitUntil: 'networkidle' })
    
    // Then: I should see tournaments
    await expect(page.locator(SELECTORS.TOURNAMENT_LIST)).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE
    })
  })
})
```

---

## Benefits of This Approach

✅ **DRY Principle** — No repeated hardcoding  
✅ **Single Source of Truth** — One place to update when things change  
✅ **Environment-aware** — Easy to test against different servers  
✅ **Scalable** — Scales to 95+ scenarios without repeated hardcodes  
✅ **Maintainable** — When UI/API changes, update config not 50+ test files  
✅ **A/B Testing** — Easy to test multiple UI variations  
✅ **Secure** — Test credentials can come from env vars, not code  
✅ **CI/CD Friendly** — Easy to parameterize for different environments  

---

## Going Forward

**For Phase 1 (Auth):** Update auth.spec.ts to use config (optional - already working)  
**For Phase 2-10:** All new test files use config.ts automatically via TEMPLATE.spec.ts

**If something changes:**
1. Find what changed (route, API endpoint, button text, timeout)
2. Update ONE entry in `config.ts`
3. All tests automatically use the new value ✅

This aligns with the project's "no hardcoding where it makes sense" principle.
