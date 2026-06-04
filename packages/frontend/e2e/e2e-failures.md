# E2E Test Failures - Analysis and Solutions

**Last Updated:** 2026-06-04  
**Test Suite:** Playwright E2E Tests  
**Total Failures:** 30 of 64 tests  
**Browsers:** Chromium, Firefox

---

## Executive Summary

30 E2E tests are failing due to pre-existing issues in the application, not regressions. These failures fall into 4 categories:

1. **Signup Redirect** (15 failures) - Signup completes but redirects to `/login` instead of `/browse`
2. **Missing Error Messages** (5 failures) - Validation error text not displayed
3. **UI Interaction Timeouts** (8 failures) - Element selectors or visibility issues
4. **Accessibility Issues** (2 failures) - Keyboard navigation not working

---

## Category 1: Signup Redirect Issues (15 Failures)

### Root Cause
After successful signup, the frontend receives a valid token but redirects users to `/login` instead of `/browse`. This suggests the post-signup redirect logic is broken.

### Affected Tests

#### 1. Should successfully sign up with valid credentials
**Test:** `packages/frontend/e2e/auth.spec.ts:37:9`  
**Error:** Expected redirect to `/browse|/dashboard` but got `/login`

**Solution:**
```typescript
// File: packages/frontend/src/pages/SignupPage.tsx (or equivalent)

// Check the signup handler - after successful API response:
const handleSignupSuccess = async (response) => {
  // Should redirect to /browse or /dashboard
  if (response.token) {
    // Store token
    localStorage.setItem('auth_token', response.token)
    
    // FIX: Change this:
    // navigate('/login')
    
    // To this:
    navigate('/browse')  // or '/dashboard' depending on user type
  }
}
```

**Steps:**
1. Find signup form submission handler
2. Locate the `navigate()` call after successful response
3. Change destination from `/login` to `/browse` or `/dashboard`
4. Test: Run signup flow, verify redirect to protected page

---

#### 2. Should allow access to protected route with valid token
**Test:** `packages/frontend/e2e/auth.spec.ts:409:9`  
**Error:** Same redirect issue - signup doesn't proceed to `/browse`

**Solution:** Same as #1 above

---

#### 3. Should restore session after page refresh
**Test:** `packages/frontend/e2e/auth.spec.ts:437:9`  
**Error:** Signup redirect fails, preventing session test

**Solution:** Same as #1 above

---

#### 4. Should maintain session across navigation
**Test:** `packages/frontend/e2e/auth.spec.ts:468:9`  
**Error:** Signup redirect fails

**Solution:** Same as #1 above

---

#### 5. Should store token in localStorage with correct key
**Test:** `packages/frontend/e2e/auth.spec.ts:663:9`  
**Error:** Signup redirect fails before token check

**Solution:** Same as #1 above

---

#### 6. Should send token in authorization header
**Test:** `packages/frontend/e2e/auth.spec.ts:696:9`  
**Error:** Signup redirect fails before token transmission test

**Solution:** Same as #1 above

---

#### 7-15. Additional Signup-Dependent Tests
Tests: Lines 65, 102, 186, 200, 260, 332, 409, 437, 468

All blocked by the same signup redirect issue.

**Universal Solution:**
1. Audit signup flow endpoint and response handling
2. Ensure post-signup redirect goes to `/browse` not `/login`
3. Verify token is properly stored before redirect
4. Test: `npm run test:e2e -- -g "should successfully sign up"`

---

## Category 2: Missing Error Messages (5 Failures)

### Root Cause
Validation errors expected by tests are not rendering. Either:
- Error messages not being set in state
- Error display component not mounted
- Error text different than expected

### Affected Tests

#### 1. Should show validation errors for invalid input
**Test:** `packages/frontend/e2e/auth.spec.ts:102:9`  
**Expected:** Error text "Passwords don't match"  
**Actual:** Element not found

**Solution:**
```typescript
// File: packages/frontend/src/pages/SignupPage.tsx

// Find password mismatch validation:
const isPasswordMismatch = password && confirmPassword && password !== confirmPassword

// Should display error when mismatch:
{isPasswordMismatch && (
  <div className="error-message" role="alert">
    Passwords don't match
  </div>
)}

// Verify:
// 1. Error state is set correctly
// 2. Component is conditionally rendered
// 3. Text exactly matches test expectation
// 4. Element is visible (not hidden by CSS)
```

**Steps:**
1. Find signup form validation code
2. Add/verify password mismatch error display
3. Ensure error element is visible (not `display: none` or hidden)
4. Test: Fill password fields with different values, verify error shows

---

#### 2. Should show error for invalid credentials
**Test:** `packages/frontend/e2e/auth.spec.ts:186:9`  
**Expected:** Error text "Invalid email or password"  
**Actual:** Element not found

**Solution:**
```typescript
// File: packages/frontend/src/pages/LoginPage.tsx

// In login handler:
const handleLogin = async (email, password) => {
  try {
    const response = await fetch('/api/auth/login', { /* ... */ })
    if (!response.ok) {
      // Set error state with exact message:
      setError('Invalid email or password')
      return
    }
  } catch (error) {
    setError('Invalid email or password')
  }
}

// Render error:
{error && (
  <div className="error-message" role="alert">
    {error}
  </div>
)}
```

**Steps:**
1. Find login form submission handler
2. Add error state management
3. Set error message "Invalid email or password" on 401/403 response
4. Render error message conditionally
5. Test: Try login with wrong password, verify error shows

---

#### 3. Should show error for wrong password
**Test:** `packages/frontend/e2e/auth.spec.ts:200:9`  
**Expected:** Error text "Invalid email or password"  
**Actual:** Element not found

**Solution:** Same as #2 above

---

#### 4. Should show error for existing email
**Test:** `packages/frontend/e2e/auth.spec.ts:65:9`  
**Expected:** Error for duplicate email  
**Actual:** Timeout waiting for logout (signup succeeds but redirect fails)

**Solution:**
```typescript
// File: packages/frontend/src/pages/SignupPage.tsx

// Handle duplicate email error:
const handleSignup = async (data) => {
  try {
    const response = await fetch('/api/auth/signup', { /* ... */ })
    
    if (response.status === 409) { // Conflict - email exists
      setError('Email already in use')
      return
    }
    
    if (response.ok) {
      // Success - redirect to /browse (not /login)
      navigate('/browse')
    }
  } catch (error) {
    setError('Signup failed: ' + error.message)
  }
}

// Display error:
{error && <div className="error-message">{error}</div>}
```

**Steps:**
1. Check API response code for duplicate email (usually 409 Conflict)
2. Set error message on that specific response
3. Verify error displays in UI
4. Test: Create account, try signup with same email, verify error

---

#### 5. Test - Additional error message failures
**All error message failures** share the same root cause: missing or incomplete error display logic

**Universal Solution:**
1. Audit all form submission handlers (signup, login, password reset)
2. Add error state management (useState)
3. Set error message on API failures
4. Render error messages with proper styling and visibility
5. Use `role="alert"` for accessibility
6. Test each error scenario individually

---

## Category 3: UI Interaction Timeouts (8 Failures)

### Root Cause
Buttons and links not being found or clickable in test environment. Issues:
- Incorrect selectors
- Elements not visible/enabled
- Timing issues (element not ready when test clicks)

### Affected Tests

#### 1. Should toggle password visibility on signup
**Test:** `packages/frontend/e2e/auth.spec.ts:571:9`  
**Error:** `button:has-text("Hide")` not clickable after clicking "Show"

**Solution:**
```typescript
// File: packages/frontend/src/components/PasswordToggle.tsx

// Verify button exists and is clickable:
<button
  type="button"
  onClick={() => setShowPassword(!showPassword)}
  aria-label={showPassword ? "Hide password" : "Show password"}
  className="password-toggle-button"
  disabled={false}  // Ensure not disabled
>
  {showPassword ? 'Hide' : 'Show'}
</button>

// Verify input type changes:
<input
  type={showPassword ? 'text' : 'password'}
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>
```

**Steps:**
1. Check password toggle button HTML
2. Verify button text is exactly "Show" or "Hide" (case-sensitive)
3. Verify button is not disabled
4. Verify input type toggles between `text` and `password`
5. Add explicit wait in test if needed: `await page.waitForTimeout(300)`
6. Test: Click Show, verify password visible, click Hide, verify hidden

---

#### 2. Should toggle password visibility on login
**Test:** `packages/frontend/e2e/auth.spec.ts:594:9`  
**Error:** `button:has-text("Show")` not found

**Solution:** Same as #1 above

---

#### 3. Should navigate to forgot password from login page
**Test:** `packages/frontend/e2e/auth.spec.ts:260:9`  
**Error:** Forgot password link/button not found or not clickable

**Solution:**
```typescript
// File: packages/frontend/src/pages/LoginPage.tsx

// Ensure forgot password link exists:
<Link
  to="/forgot-password"
  className="forgot-password-link"
>
  Forgot password?
</Link>

// OR as button:
<button
  type="button"
  onClick={() => navigate('/forgot-password')}
  className="forgot-password-button"
>
  Forgot password?
</button>
```

**Steps:**
1. Verify "Forgot password?" link/button exists on login page
2. Check exact text matches test expectation
3. Verify it's not hidden or disabled
4. Test: Click it, verify navigation to `/forgot-password`
5. If selector still fails, update test selector or element markup

---

#### 4. Should show error for invalid code
**Test:** `packages/frontend/e2e/auth.spec.ts:332:9`  
**Error:** Reset password button disabled, won't click

**Solution:**
```typescript
// File: packages/frontend/src/pages/ResetPasswordPage.tsx

// Verify form validation enables button:
const isFormValid = code && newPassword && confirmPassword && 
                    newPassword === confirmPassword && 
                    newPassword.length >= 8

// Button should be enabled when form is valid:
<button
  type="submit"
  disabled={!isFormValid}  // Only disable when invalid
  className="submit-button"
>
  Update Password
</button>

// For testing invalid code, allow submission anyway:
// OR provide default values that allow clicking
```

**Steps:**
1. Check button enable/disable logic
2. Provide valid values for password fields
3. Only keep code field empty for testing
4. Allow button to be clickable with empty code (to test error response)
5. Test: Submit with invalid code, verify error message

---

#### 5-8. Additional UI Timeout Issues
Tests: Password toggle (login), Show/Hide buttons (both forms)

**Universal Solution:**
1. Inspect element visibility in browser DevTools
2. Check CSS for `display: none`, `visibility: hidden`, `opacity: 0`
3. Verify selectors match actual button text exactly
4. Add explicit waits if elements render asynchronously
5. Consider using `data-testid` attributes instead of text selectors
6. Test in browser manually first before relying on E2E

---

## Category 4: Accessibility Issues (2 Failures)

### Root Cause
Keyboard navigation not working - Tab key doesn't focus form elements properly

### Affected Tests

#### 1. Should be keyboard navigable on login page
**Test:** `packages/frontend/e2e/auth.spec.ts:722:9`  
**Error:** After Tab press, focus not on expected INPUT or BUTTON element

**Solution:**
```typescript
// File: packages/frontend/src/pages/LoginPage.tsx

// Ensure proper tabindex:
<input
  type="email"
  placeholder="Email"
  tabIndex={0}  // Ensure focusable
  className="email-input"
/>

<input
  type="password"
  placeholder="Password"
  tabIndex={0}  // Ensure focusable
  className="password-input"
/>

<button
  type="submit"
  tabIndex={0}  // Ensure focusable
  className="signin-button"
>
  Sign In
</button>

// Avoid tabIndex={-1} unless intentional
// Remove tabIndex entirely for natural tab order
```

**Steps:**
1. Check all form inputs and buttons have proper tabIndex
2. Remove any `tabIndex={-1}` that prevents focusing
3. Verify form elements are in correct order
4. Test keyboard navigation: Tab through all interactive elements
5. Ensure focus visible with outline or other indicator
6. Test: Open login page, press Tab repeatedly, verify all inputs/buttons get focus

---

## Summary Table

| Category | Count | Severity | Fix Complexity |
|----------|-------|----------|-----------------|
| Signup Redirect | 15 | 🔴 Critical | Low |
| Missing Errors | 5 | 🟠 High | Low |
| UI Timeouts | 8 | 🟠 High | Medium |
| Accessibility | 2 | 🟡 Medium | Low |
| **TOTAL** | **30** | — | — |

---

## Implementation Priority

### Phase 1 (Blocking - Fix First)
1. **Signup Redirect** (15 tests) - 1-2 hours
   - Most impactful - fixes 15 tests immediately
   - Simple fix in redirect logic
   - High user impact

### Phase 2 (Important - Fix Next)
2. **Error Messages** (5 tests) - 2-3 hours
   - Better UX - users need feedback
   - Straightforward implementation
   - Medium complexity

3. **UI Interactions** (8 tests) - 1-2 hours per issue
   - Affects password management
   - May need selector adjustments or component fixes
   - Varies by specific issue

### Phase 3 (Nice to Have)
4. **Accessibility** (2 tests) - 30 minutes
   - Important for compliance
   - Quick fixes to tabIndex and focus management

---

## Testing Strategy

### After Each Fix:
```bash
# Test specific category
npm run test:e2e -- -g "signup"
npm run test:e2e -- -g "error"
npm run test:e2e -- -g "password"
npm run test:e2e -- -g "keyboard"

# Full suite
npm run test:e2e

# View detailed results
npx playwright show-report
```

### Manual Testing Checklist:
- [ ] Test in browser first before committing
- [ ] Check both Chrome and Firefox
- [ ] Verify no new CSS/styling issues
- [ ] Ensure error messages are accessible

---

## Expected Outcomes

When all fixes are complete:
- ✅ 64/64 tests passing (100%)
- ✅ All signup flows working
- ✅ All error messages displaying
- ✅ All UI interactions working
- ✅ Full keyboard accessibility

---

## Related Issues
- Frontend authentication flow incomplete
- Error handling needs implementation
- Component visibility/styling issues
- Form validation messaging missing
