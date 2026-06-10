# E2E Test Runner - Individual Module & Feature Testing

Run specific e2e tests without running the entire suite. All commands support Chromium and Firefox browsers.

## NPM Scripts (Recommended)

### Run All Auth Tests
```bash
npm run test:e2e:auth          # Run all auth tests (headless)
npm run test:e2e:auth:ui       # Run all auth tests (interactive UI)
npm run test:e2e:auth:debug    # Run all auth tests (debug mode)
```

### Run Single Browser
```bash
npm run test:e2e:chromium      # Run all tests on Chromium only
npm run test:e2e:firefox       # Run all tests on Firefox only
```

## CLI Patterns (npx playwright test)

### Run by File
```bash
# Run specific test file
npx playwright test packages/frontend/e2e/auth.spec.ts

# Run test file in UI mode
npx playwright test packages/frontend/e2e/auth.spec.ts --ui

# Run test file in debug mode
npx playwright test packages/frontend/e2e/auth.spec.ts --debug
```

### Run by Feature Group (using --grep)
```bash
# Run all "User signup flow" tests
npx playwright test --grep "Feature: User signup flow"

# Run specific scenario
npx playwright test --grep "Scenario: User successfully signs up with valid credentials"

# Run all scenarios matching a pattern
npx playwright test --grep "signup|login"

# Run all error path scenarios
npx playwright test --grep "Error path"
```

### Run by Browser
```bash
# Chromium only
npx playwright test --project=chromium

# Firefox only
npx playwright test --project=firefox

# Run file on specific browser
npx playwright test auth.spec.ts --project=chromium
```

### Combine Options
```bash
# Auth tests on Chromium only, UI mode
npx playwright test auth.spec.ts --project=chromium --ui

# Login and password tests in debug mode
npx playwright test --grep "login|password" --debug

# Single scenario with UI
npx playwright test --grep "User can navigate from signup to login" --ui
```

## Test Organization

All auth tests are organized by feature in `packages/frontend/e2e/auth.spec.ts`:

- **Feature: User signup flow** — 5 scenarios
- **Feature: User login flow** — 5 scenarios
- **Feature: Forgot password flow** — 4 scenarios
- **Feature: Reset password flow** — 3 scenarios
- **Feature: Protected routes** — 4 scenarios
- **Feature: Session persistence** — 3 scenarios
- **Feature: Password visibility toggle** — 2 scenarios
- **Feature: Form navigation and interactions** — 2 scenarios
- **Feature: Token storage** — 2 scenarios
- **Feature: Accessibility** — 2 scenarios

Use feature names with `--grep` to run specific groups:
```bash
npx playwright test --grep "Feature: Session persistence"
npx playwright test --grep "Feature: Protected routes" --ui
```

## Common Workflows

### Developing a Single Feature
```bash
# Watch and debug a specific feature (auto-rerun on changes)
npx playwright test --grep "Feature: User signup flow" --ui --watch
```

### Quick Auth Validation
```bash
# Run all auth tests quickly (minimal output)
npm run test:e2e:auth
```

### Test a Specific Scenario
```bash
# Verify one scenario works
npx playwright test --grep "User successfully signs up with valid credentials"
```

### Cross-Browser Testing for Feature
```bash
# Test signup flow on both browsers
npx playwright test --grep "Feature: User signup flow"
```

### Parallel Development
```bash
# Test signup in one terminal
npx playwright test --grep "signup" --ui

# Test login in another terminal
npx playwright test --grep "login" --ui
```

## Tips

1. **Use descriptive grep patterns** — Scenarios are named clearly, so `--grep "signup"` will match all signup-related tests
2. **Watch mode** — Add `--watch` flag to re-run tests when files change
3. **UI mode is best for debugging** — `--ui` shows a browser and test explorer, click tests to re-run
4. **Debug mode for step-through** — `--debug` opens inspector side-by-side with browser
5. **Filter by Scenario name** — Each test has a "Scenario: " prefix, use that in grep

## Performance

- **Single auth test**: ~3-5 seconds
- **All auth tests (32 scenarios × 2 browsers)**: ~1.1 minutes
- **Single feature group**: ~10-15 seconds

Run individual modules during development, full suite in CI/pre-commit.
