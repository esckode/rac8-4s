# Authentication E2E Tests

Comprehensive end-to-end tests for the authentication flow using Playwright. These tests verify complete user journeys from signup, login, password reset, protected routes, and session persistence.

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run tests with UI mode (interactive)
```bash
npm run test:e2e:ui
```

### Run tests in debug mode
```bash
npm run test:e2e:debug
```

### Run specific test file
```bash
npx playwright test auth.spec.ts
```

### Run specific test
```bash
npx playwright test -g "should successfully sign up"
```

### Run tests in specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
```

## Prerequisites

1. Both frontend and backend must be running:
   - Frontend: `npm run dev` (runs on http://localhost:5173)
   - Backend: `npm run dev` in `packages/api` (runs on http://localhost:3001)

2. Clean database state before each test run:
   ```bash
   rm -f db/tournament.db
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Test Coverage

### 1. User Signup Flow
- **successful signup with valid credentials**: Creates account, stores token, redirects to /browse
- **existing email error**: Shows error when email already registered
- **validation errors**: Validates email format, password match, required fields
- **required fields**: Ensures all fields required before submission

### 2. User Login Flow
- **successful login**: Logs in with valid credentials, stores token, redirects
- **invalid credentials error**: Shows error for wrong email/password
- **wrong password error**: Shows error when password is incorrect
- **required fields**: Ensures email and password required
- **email validation**: Validates email format before submission

### 3. Forgot Password Flow
- **navigate to forgot password**: Accessible from login page
- **send reset request**: Submits email for password reset
- **non-existent email error**: Handles non-existent email appropriately
- **email validation**: Validates email format

### 4. Reset Password Flow
- **invalid code error**: Shows error for invalid reset code
- **password match validation**: Ensures new passwords match
- **successful reset**: Allows user to reset password with valid code

### 5. Protected Routes
- **redirect to login without token**: Redirects when trying to access protected routes
- **redirect with invalid token**: Clears invalid token and redirects
- **allow access with valid token**: Allows access to protected routes with valid token

### 6. Session Persistence
- **restore session after refresh**: Page refresh maintains logged-in state
- **maintain across navigation**: Session persists when navigating between pages
- **clear after logout**: Logout clears token and redirects to login

### 7. Password Show/Hide
- **toggle on signup**: Show/Hide button works on signup form
- **toggle on login**: Show/Hide button works on login form

### 8. Form Interactions
- **disable during loading**: Submit button disabled while request is pending
- **navigate between forms**: Can navigate from signup to login and vice versa
- **back navigation**: Can go back from signup to landing page

### 9. Token Storage
- **stored with correct key**: Token stored in localStorage as 'auth_token'
- **valid JWT format**: Token is valid JWT (3 parts separated by dots)
- **included in requests**: Token sent in Authorization header for API calls

### 10. Accessibility
- **keyboard navigation**: Can use Tab to navigate forms
- **proper labels**: Form inputs have associated labels
- **button text**: Buttons have proper text content and semantics

## Test Architecture

### Helper Functions
- `apiCall()`: Makes API requests to backend
- `getTokenFromPage()`: Retrieves token from localStorage
- `clearAuthState()`: Clears auth data and reloads page

### Page Navigation
- `/signup` - Account creation
- `/login` - User login
- `/forgot-password` - Password reset request
- `/reset-password` - Password reset completion
- `/browse` - Protected dashboard page

### Selectors
Tests use semantic selectors where possible:
- Form inputs: `input[type="email"]`, `input[type="password"]`
- Buttons: `button:has-text("Create Account")`, `button:has-text("Sign In")`
- Labels: `label:has-text("Email")`

## Key Test Patterns

### Testing Signup
```typescript
await page.goto('/signup')
await page.fill('input[type="email"]', testEmail)
await page.fill('input[placeholder="Your full name"]', testName)
await page.locator('input[type="password"]').first().fill(testPassword)
await page.locator('input[type="password"]').last().fill(testPassword)
await page.click('button:has-text("Create Account")')
await expect(page).toHaveURL(/\/browse|\/dashboard/)
const token = await getTokenFromPage(page)
expect(token).toBeTruthy()
```

### Testing Protected Routes
```typescript
await page.goto('/login')
await clearAuthState(page)
await page.goto('/browse')
await expect(page).toHaveURL('/login')
```

### Testing Session Persistence
```typescript
const tokenBefore = await getTokenFromPage(page)
await page.reload()
const tokenAfter = await getTokenFromPage(page)
expect(tokenAfter).toBe(tokenBefore)
```

## Debugging

### Enable verbose logging
```bash
PWDEBUG=1 npx playwright test
```

### Use debug mode with step-by-step execution
```bash
npx playwright test --debug
```

### View test report
```bash
npx playwright show-report
```

### Record test video
Videos are automatically recorded on test failure (configured in playwright.config.ts)

## Troubleshooting

### Tests timeout
- Ensure backend is running on port 3001
- Ensure frontend is running on port 5173
- Check network connectivity between frontend and backend

### Token not persisting
- Verify localStorage is not being cleared between tests
- Check that `beforeEach` hook is properly clearing auth state
- Ensure API is returning valid JWT tokens

### Navigation issues
- Verify routes are correctly configured in App.tsx
- Check that ProtectedRoute component is properly redirecting
- Ensure page navigation waits for URL changes

### Database state issues
- Clear database before running tests: `rm -f db/tournament.db`
- Check that backend is creating tables properly
- Verify unique constraints on email field

## CI/CD Integration

For GitHub Actions or other CI systems:

```yaml
- name: Install dependencies
  run: npm install

- name: Build frontend
  run: npm run build --workspace=packages/frontend

- name: Start backend
  run: npm run dev --workspace=packages/api &

- name: Wait for services
  run: sleep 5

- name: Run E2E tests
  run: npm run test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Performance Metrics

All tests should complete in < 5 minutes with:
- 2 browser profiles (Chromium, Firefox)
- 40+ individual test cases
- Real API calls to backend
- Full DOM manipulation

Typical runtime: 2-3 minutes total with parallel workers

## Notes

- Tests use dynamic email addresses with timestamps to avoid conflicts
- Each test is independent and can run in isolation
- Tests clean up their auth state before each test
- Real API calls are made to backend (not mocked)
- Screenshots and videos captured on failure for debugging
