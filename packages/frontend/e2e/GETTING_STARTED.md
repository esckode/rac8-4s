# Getting Started with E2E Tests

## Quick Start (5 minutes)

### Step 1: Install Dependencies
If not already installed:
```bash
cd /home/esckode/projects/claude/rac8-4s
npm install
```

### Step 2: Clean Database
Start with a fresh database:
```bash
rm -f db/tournament.db
```

### Step 3: Start Backend
In terminal 1, start the API server:
```bash
cd packages/api
npm run dev
```

Expected output:
```
Server running on http://localhost:3001
```

### Step 4: Start Frontend
In terminal 2, start the frontend dev server:
```bash
cd packages/frontend
npm run dev
```

Expected output:
```
VITE v5.0.10  ready in 123 ms

➜  Local:   http://localhost:5173/
```

### Step 5: Run Tests
In terminal 3, run the E2E tests:
```bash
npm run test:e2e
```

Tests will:
1. Launch browsers (Chromium, Firefox, WebKit)
2. Run 40+ test cases
3. Generate report in playwright-report/
4. Show summary in terminal

Expected output:
```
Running 40 tests using 3 workers
✓ 40 passed (2m 30s)
```

## Detailed Instructions

### Running Tests

#### Run All Tests
```bash
npm run test:e2e
```

#### Run Tests in Interactive UI Mode
Great for development and debugging:
```bash
npm run test:e2e:ui
```

This opens a browser UI where you can:
- See tests execute in real-time
- Click through test steps
- Inspect page state at each step
- View console logs and network requests
- Re-run individual tests

#### Run Tests in Debug Mode
For detailed step-by-step debugging:
```bash
npm run test:e2e:debug
```

This:
- Pauses execution at each step
- Allows inspection of page state
- Shows inspector tools
- Can step forward/backward through tests

#### Run Specific Test
Run only the signup tests:
```bash
npx playwright test -g "signup"
```

Run only one test:
```bash
npx playwright test -g "should successfully sign up"
```

#### Run in Specific Browser
Run tests only in Firefox:
```bash
npx playwright test --project=firefox
```

Available projects:
- `chromium` (Chrome/Edge equivalent)
- `firefox` (Firefox)
- `webkit` (Safari equivalent)

#### Run Tests in Specific Directory
```bash
npx playwright test packages/frontend/e2e/
```

### Viewing Test Results

#### HTML Report
After tests complete, view the detailed report:
```bash
npx playwright show-report
```

This opens a web page with:
- Test results and timing
- Screenshots of failures
- Video recordings
- Full test output
- Trace files

#### Terminal Summary
See quick summary in terminal:
```bash
✓ 40 passed (2m 30s)
```

Green checkmark means all tests passed.
Red X means test failed.

#### Video on Failure
Videos are automatically recorded when tests fail.
Find them in: `test-results/` folder

## Troubleshooting

### Tests Won't Run: Backend Not Found
```
Error: connect ECONNREFUSED 127.0.0.1:3001
```

**Solution:**
- Ensure backend is running: `npm run dev` in `packages/api`
- Verify it's on port 3001
- Check no firewall blocks localhost:3001

### Tests Won't Run: Frontend Not Found
```
Error: Target page, context or browser has been closed
```

**Solution:**
- Ensure frontend is running: `npm run dev` in `packages/frontend`
- Verify it's on port 5173
- Check no other process uses that port

### Tests Timeout
```
Timeout 30000ms exceeded
```

**Solution:**
- Increase timeout: `npx playwright test --timeout=60000`
- Check backend/frontend are responding
- Try running in UI mode to see what's stuck
- Clear database: `rm -f db/tournament.db`

### Email Already Exists Error
```
Error: Email already in use
```

**Solution:**
- Tests use timestamps in emails, so should be unique
- If persistent, clear database: `rm -f db/tournament.db`
- Restart backend with clean DB

### Navigation Issues
```
Timeout waiting for URL /browse
```

**Solution:**
- Check ProtectedRoute component exists
- Verify routes in App.tsx are correct
- Look at browser console in UI mode for errors
- Check network requests in Playwright Inspector

### Random Test Failures
If tests fail intermittently:

1. Run in UI mode to see what's happening:
   ```bash
   npm run test:e2e:ui
   ```

2. Increase timeout in playwright.config.ts:
   ```typescript
   timeout: 30000, // increase to 45000
   ```

3. Check for race conditions:
   - Add explicit waits: `await page.waitForURL(...)`
   - Use `waitForLoadState('networkidle')`

4. Clear database before each run:
   ```bash
   rm -f db/tournament.db
   npm run dev --workspace=packages/api
   ```

## Development Workflow

### When Adding a New Feature

1. Run tests to ensure nothing broke:
   ```bash
   npm run test:e2e
   ```

2. If UI changed, update selectors:
   ```typescript
   // Old selector
   await page.click('button:has-text("Sign In")')
   
   // New selector
   await page.click('button[data-testid="signin-button"]')
   ```

3. Add test for new feature:
   - Create new test in auth.spec.ts
   - Run in UI mode: `npm run test:e2e:ui`
   - Fix any issues
   - Run full suite to ensure nothing broke

### When Tests Fail in CI

1. Download test artifacts (screenshots/videos)
2. Run tests locally in UI mode: `npm run test:e2e:ui`
3. Reproduce the issue
4. Fix the issue
5. Verify locally before pushing

## Advanced Usage

### Record New Tests
Use Playwright Inspector to record new tests:
```bash
npx playwright codegen http://localhost:5173
```

This opens a browser where:
- Your actions are recorded
- Code is generated in sidebar
- Can copy/paste into tests

### Debug Network Requests
In UI mode, click "Network" tab to see:
- All API requests
- Request/response headers
- Request/response body
- Timing information

### Inspect DOM
In UI mode, click "DOM" tab to see:
- Current page HTML
- Search for elements
- See element attributes

### Trace Debugging
Playwright records traces for failed tests.
View with:
```bash
npx playwright show-trace test-results/trace.zip
```

This shows:
- All page interactions
- Network requests
- Console logs
- Screenshots at each step

## Performance Tips

### Run Tests Faster
Use single project (no parallelization):
```bash
npx playwright test --project=chromium
```

### Run Specific Tests
Focus on changed features:
```bash
npx playwright test -g "signup"
```

### Parallel Execution
Tests run in parallel by default in CI.
For local testing, run single worker:
```bash
npx playwright test --workers=1
```

## Integration with CI

### GitHub Actions Example
```yaml
- name: Install dependencies
  run: npm install

- name: Clean database
  run: rm -f db/tournament.db

- name: Start backend
  run: npm run dev --workspace=packages/api &
  
- name: Wait for backend
  run: sleep 3

- name: Run E2E tests
  run: npm run test:e2e

- name: Upload report on failure
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 7
```

## Common Patterns

### Test a Signup Flow
```typescript
test('should signup successfully', async ({ page }) => {
  await page.goto('/signup')
  
  // Fill form
  await page.fill('input[type="email"]', 'user@example.com')
  await page.fill('input[placeholder="Your full name"]', 'John Doe')
  await page.fill('input[type="password"]', 'Password123')
  
  // Submit
  await page.click('button:has-text("Create Account")')
  
  // Verify
  await expect(page).toHaveURL('/browse')
})
```

### Test Protected Route
```typescript
test('should redirect to login', async ({ page }) => {
  // Clear auth
  await page.evaluate(() => localStorage.removeItem('auth_token'))
  
  // Try to access protected page
  await page.goto('/browse')
  
  // Verify redirect
  await expect(page).toHaveURL('/login')
})
```

### Test Error Message
```typescript
test('should show error', async ({ page }) => {
  await page.goto('/login')
  
  // Fill invalid credentials
  await page.fill('input[type="email"]', 'wrong@example.com')
  await page.fill('input[type="password"]', 'WrongPassword')
  
  // Submit
  await page.click('button:has-text("Sign In")')
  
  // Verify error
  await expect(page.locator('text=Invalid email or password')).toBeVisible()
})
```

## Getting Help

If tests fail or don't work:

1. Check that both services are running:
   ```bash
   # Backend should output: Server running on http://localhost:3001
   # Frontend should output: ➜  Local:   http://localhost:5173/
   ```

2. Run in UI mode for visual debugging:
   ```bash
   npm run test:e2e:ui
   ```

3. Check the HTML report:
   ```bash
   npx playwright show-report
   ```

4. Look at console errors:
   - In UI mode, expand test to see error
   - Check Network tab for failed requests

5. Try resetting everything:
   ```bash
   rm -f db/tournament.db
   pkill -f "npm run dev"
   npm run dev --workspace=packages/api &
   npm run dev --workspace=packages/frontend &
   npm run test:e2e
   ```

## Next Steps

1. **Run the tests** to ensure setup works
2. **Review README.md** for detailed test documentation
3. **Check E2E_IMPLEMENTATION.md** for what's tested
4. **Explore UI mode** to see tests in action
5. **Add your own tests** for new features
6. **Integrate with CI** for automated testing

Good luck with E2E testing!
