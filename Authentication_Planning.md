# Authentication Planning Document

## Overview

This document captures the complete authentication design for the C.U.At.Court webapp, covering player auth implementation with a forward-compatible schema for organizer and admin authentication.

**Development Approach:** UI-first with TDD. This document defines page specifications to drive frontend development, then backend endpoints follow via test-driven implementation.

---

## Auth Pages Specification

### 1. Login Page (`/login`)

**Purpose:** Allow existing users to sign in with email + password

**URL:** `/login`

**Form Fields:**
| Field | Type | Required | Validation | Error Message |
|-------|------|----------|-----------|---------------|
| Email | text | Yes | Valid email format | "Please enter a valid email" |
| Password | password | Yes | Min 1 character | "Password is required" |
| Show/Hide Password | toggle | No | N/A | N/A |

**Buttons:**
- **"Sign In"** (primary, full-width)
  - Disabled while loading
  - Shows spinner on loading state
  - Disabled if form has validation errors

**Navigation Links:**
- **"Need an account?"** → `/signup`
- **"Forgot password?"** → `/forgot-password`

**Form Behavior:**
- Real-time email validation (on blur)
- Submit on Enter key
- Focus first field on page load

**Success State (201):**
- Clear form
- Store token in localStorage
- Redirect to `/browse`

**Error States:**
| Status | Message | Where |
|--------|---------|-------|
| 401 | "Invalid email or password" | Above form |
| 400 | Field-specific | Below field |
| 500 | "Something went wrong. Please try again." | Above form |

**Loading State:**
- Button shows spinner, text becomes "Signing in..."
- Form fields disabled

**Mobile Responsive:**
- Full-width form
- Touch-friendly button (min 48px height)
- Keyboard appears for email field

---

### 2. Signup Page (`/signup`)

**Purpose:** Create a new account (standalone or via magic link)

**URL:** `/signup` or `/signup?token=xxx`

**Form Fields:**
| Field | Type | Required | Validation | Behavior |
|-------|------|----------|-----------|----------|
| Email | text | Yes | Valid email format | Editable even if pre-filled from token |
| Name | text | Yes | Min 2 characters | Always empty on load |
| Password | password | Yes | Min 6 characters | Show/hide toggle |
| Confirm Password | password | Yes | Must match Password | Show/hide toggle, real-time validation |

**Magic Link Mode (`?token=xxx`):**
- Email field pre-filled from token
- Email field editable (user can change it)
- All other fields empty
- Token passed to `/api/auth/signup` on submit

**Standalone Mode (no token):**
- All fields empty
- Email editable
- No token sent to API

**Buttons:**
- **"Create Account"** (primary, full-width)
  - Disabled while loading
  - Disabled if form has validation errors
  - Disabled if passwords don't match

**Navigation Links:**
- **"Already have an account?"** → `/login`

**Form Behavior:**
- Real-time email validation (on blur)
- Real-time password match validation (on blur of confirm password)
- Visual indicator when passwords match (green checkmark or similar)
- Submit on Enter key
- Focus first empty field on page load

**Real-Time Validation:**
| Field | Trigger | Error Message | Show When |
|-------|---------|---------------|-----------|
| Email | On blur | "Please enter a valid email" | Invalid format |
| Name | On blur | "Name must be at least 2 characters" | Less than 2 chars |
| Password | On blur | "Password must be at least 6 characters" | Less than 6 chars |
| Confirm | On blur | "Passwords don't match" | Doesn't match Password |

**Success State (201):**
- Clear form
- Store token in localStorage
- Redirect to `/browse`
- Show welcome toast (optional): "Account created! Welcome to U At Court"

**Error States:**
| Status | Message | Where |
|--------|---------|-------|
| 409 | "Email already in use" | Below email field |
| 400 | "Password must be at least 6 characters" | Below password field |
| 401 | "This link has expired or is invalid" | Above form (if token provided) |
| 500 | "Something went wrong. Please try again." | Above form |

**Loading State:**
- Button shows spinner, text becomes "Creating account..."
- Form fields disabled
- Show progress indicator (optional)

**Mobile Responsive:**
- Full-width form
- Touch-friendly button (min 48px height)
- Keyboard appears for email field
- Show/hide password toggle easily tappable

---

### 3. Forgot Password Page (`/forgot-password`)

**Purpose:** Request a password reset code via email

**URL:** `/forgot-password`

**Form Fields:**
| Field | Type | Required | Validation | Error Message |
|-------|------|----------|-----------|---------------|
| Email | text | Yes | Valid email format | "Please enter a valid email" |

**Buttons:**
- **"Send Reset Code"** (primary, full-width)
  - Disabled while loading
  - Disabled if email field empty or invalid

**Navigation Links:**
- **"Remember your password?"** → `/login`

**Form Behavior:**
- Real-time email validation (on blur)
- Submit on Enter key
- Focus email field on page load

**Success State (202):**
- Clear form
- Show success message: "Check your email for a password reset code"
- Heading changes to show email
- Show secondary action: **"Enter code"** button → `/reset-password`
- Optional: "Didn't receive code? [Resend]" (after 30 seconds)

**Error States:**
| Status | Message | Where |
|--------|---------|-------|
| 400 | "Please enter a valid email" | Below field |
| 500 | "Something went wrong. Please try again." | Above form |

**Security Note:**
- Even if email doesn't exist, show success message (don't reveal if email is registered)
- This is intentional

**Loading State:**
- Button shows spinner, text becomes "Sending code..."
- Email field disabled

**Success Screen Layout:**
```
✓ Reset code sent

We've sent a 6-digit code to:
alice@example.com

[Enter code] ← secondary button
[Change email] ← link back to form
```

**Mobile Responsive:**
- Full-width form
- Large touch-friendly button (min 48px height)
- Success message easily readable

---

### 4. Reset Password Page (`/reset-password`)

**Purpose:** Reset password using code sent via email

**URL:** `/reset-password`

**Form Fields:**
| Field | Type | Required | Validation | Behavior |
|-------|------|----------|-----------|----------|
| Email | text | Yes | Valid email format | Editable, user enters email again |
| Reset Code | text | Yes | Exactly 6 digits | Auto-format: groups of 2 (e.g., "12 34 56") |
| New Password | password | Yes | Min 6 characters | Show/hide toggle |
| Confirm Password | password | Yes | Must match New Password | Show/hide toggle, real-time validation |

**Code Input Behavior:**
- Accept only digits
- Auto-space between groups of 2: `12 34 56`
- Allow paste (auto-format)
- Auto-focus next field after 6 digits entered (optional)

**Buttons:**
- **"Update Password"** (primary, full-width)
  - Disabled while loading
  - Disabled if form has validation errors
  - Disabled if passwords don't match

**Navigation Links:**
- **"Back to login"** → `/login`

**Form Behavior:**
- Real-time email validation (on blur)
- Real-time code validation: must be 6 digits
- Real-time password match validation
- Visual indicator when passwords match
- Submit on Enter key

**Real-Time Validation:**
| Field | Trigger | Error Message | Show When |
|-------|---------|---------------|-----------|
| Email | On blur | "Please enter a valid email" | Invalid format |
| Code | On change | "Code must be 6 digits" | Not 6 digits |
| Password | On blur | "Password must be at least 6 characters" | Less than 6 chars |
| Confirm | On blur | "Passwords don't match" | Doesn't match password |

**Success State (200):**
- Clear form
- Show success message: "Password updated successfully"
- Redirect to `/login` after 2 seconds
- Optional: show button "Sign in now" → `/login`

**Error States:**
| Status | Message | Where | Action |
|--------|---------|-------|--------|
| 400 | "Please enter a valid email" | Below email | Try again |
| 400 | "Code must be 6 digits" | Below code | Try again |
| 401 | "Invalid reset code" | Below code | Request new code → `/forgot-password` |
| 401 | "Reset code expired" | Below code | Request new code → `/forgot-password` |
| 429 | "Too many attempts. Try again later." | Above form | Wait or request new code |
| 500 | "Something went wrong. Please try again." | Above form | Try again |

**Attempt Limiting:**
- Show warning after 2 failed attempts: "2 attempts remaining"
- Block after 5 failed attempts (429 error)
- Encourage requesting new code

**Loading State:**
- Button shows spinner, text becomes "Updating password..."
- Form fields disabled

**Mobile Responsive:**
- Full-width form
- Large touch-friendly button (min 48px height)
- Code input large and tappable
- Show/hide password easily accessible

---

## Page Navigation Flow

```
Landing
  ├─→ [Continue with email] → /login
  │    ├─→ [Need an account?] → /signup
  │    │    ├─→ [Already have an account?] → /login
  │    │    └─→ [Success] → /browse
  │    ├─→ [Forgot password?] → /forgot-password
  │    │    ├─→ [Remember password?] → /login
  │    │    ├─→ [Enter code] → /reset-password
  │    │    │    ├─→ [Back to login] → /login
  │    │    │    ├─→ [Request new code] → /forgot-password
  │    │    │    └─→ [Success] → /login
  │    │    └─→ [Resend] → /forgot-password
  │    └─→ [Success] → /browse
  │
  └─→ [Browse tournaments] → /browse (public, no auth required)
       └─→ [Register] → /login (if not authenticated)
```

**Flow Summary:**
1. **Landing** offers two paths: login or browse
2. **Login** is the gateway - users with accounts log in, or create account from here
3. **Signup** is accessible only from login or magic link
4. **Forgot password** is accessible only from login
5. **Browse** is public but registration requires authentication

---

---

## Authentication Model

### Three-Tier Role System
- **Admin:** Creates organizer accounts, views analytics (future)
- **Organizer:** Creates tournaments, manages brackets and groups
- **Player:** Registers for tournaments, submits scores, views standings

All three roles share a single `accounts` table with a `role` column. No separate tables per role — simplifies auth logic and keeps login flow unified.

### Account Activation Flows

#### 1. Standalone Signup (Self-Service)
1. User navigates to `/signup` (or from Landing)
2. User enters: email, name, password, confirm password
3. System creates account with `status: 'active'`, hashes password
4. Session cookie issued, user is logged in
5. User redirected to `/browse`

#### 2. Magic Link Signup (Tournament Registration)
1. User provides email to tournament registration form
2. System generates 24-hour magic link token
3. User receives email with magic link
4. User clicks link → lands on `/signup?token=xxx`
5. User enters: name, password, confirm password (email pre-filled, editable)
6. System validates token, creates account, issues session cookie
7. User is logged in and registered for tournament

#### 3. Login (Returning Users)
1. User navigates to `/login`
2. User enters email + password
3. System validates against `accounts.password_hash`
4. Session cookie issued, user is logged in
5. User redirected to `/browse`

#### 4. Password Recovery (Time-Limited Code)
1. User clicks "Forgot password" on `/login` → goes to `/forgot-password`
2. User enters email
3. System generates 6-digit reset code (15-minute expiration)
4. User receives email with code (mocked for now)
5. User navigates to `/reset-password`
6. User enters email, code, new password, confirm password
7. System validates code, updates password, invalidates code
8. User redirected to `/login`

---

## Database Schema

### New Table: `accounts`

```sql
CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,              -- UUID
  email         TEXT UNIQUE NOT NULL,          -- enforces unique login
  password_hash TEXT,                          -- NULL until user sets password
  role          TEXT NOT NULL                  -- 'admin' | 'organizer' | 'player'
                CHECK(role IN ('admin','organizer','player')),
  status        TEXT NOT NULL DEFAULT 'pending' -- 'pending' | 'active'
                CHECK(status IN ('pending','active')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Key points:**
- `password_hash` is NULL initially (magic link flow), populated when user sets password
- `status: 'pending'` = account created by invite, not yet setup
- `status: 'active'` = account fully activated
- `role` is fixed at creation time (no role changes via API)

### Linked Table: `players` (existing, modified)

```sql
ALTER TABLE players ADD COLUMN account_id TEXT REFERENCES accounts(id);
CREATE INDEX idx_players_account_id ON players(account_id);
```

**Relationship:**
- Each player has exactly one account (1:1)
- `account_id` is nullable initially (backward compat with existing seed data)
- Player profile data (name, phone, contact preferences) stays in `players` table
- Auth data (email, password) is in `accounts` table

### Token Storage: `auth_tokens`

```sql
CREATE TABLE auth_tokens (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

Used only for **session tokens** (persistent across restarts). Magic link tokens use in-memory store (24h, acceptable loss on restart).

---

## Session Strategy

### Cookie-Based Sessions (httpOnly)

**Why httpOnly?** Frontend cannot read the cookie — JavaScript cannot access it, preventing XSS attacks from stealing tokens. The frontend has no way to accidentally log the token or send it to the wrong place.

**Configuration:**
```typescript
res.cookie('session', tokenValue, {
  httpOnly: true,                      // JS cannot read
  secure: true,                        // HTTPS only (production)
  sameSite: 'strict',                  // No cross-site sends
  maxAge: 30 * 24 * 60 * 60 * 1000,   // 30 days
  domain: process.env.COOKIE_DOMAIN,  // undefined in dev, .example.com in prod
})
```

**Rolling Sessions:**
Every authenticated response re-issues the cookie (resets 30-day window). A user who navigates daily never gets logged out. A user who disappears for 30+ days will need to log back in. No refresh token complexity.

### Magic Link Tokens (In-Memory, Ephemeral)

**For account setup and password reset only.**
- Generated as 32-byte random hex
- Stored in `InMemoryTokenStore` (Map, not persistent)
- TTL: 24 hours
- Single-use: token deleted after validation
- Loss on server restart acceptable (user gets a new link from email)

---

## Frontend Session Restoration

**Goal:** User refreshes the page → session persists without re-entering credentials.

**Flow:**
1. App mounts → `AuthContext` calls `GET /auth/me`
2. Middleware reads `req.cookies.session` and validates against PostgreSQL
3. If valid → returns `{ id, email, role, name }` → context stores it
4. If invalid (401) → context sets `isAuthenticated: false` → redirects to `/login`
5. Every response re-issues the session cookie (rolling window)

**Key insight:** Frontend never reads or stores tokens — it just relies on the cookie being sent with every request (automatic via `credentials: 'include'` in fetch).

---

## Environment Configuration

### Development
```bash
CORS_ORIGIN=http://localhost:5173
COOKIE_DOMAIN=                          # undefined = use current request host
NODE_ENV=development
```

Frontend Vite proxy forwards `/api/*` → `http://localhost:3000`, so browser sees everything as same-origin. No CORS headers needed, cookies work transparently.

### Production
```bash
CORS_ORIGIN=https://app.example.com
COOKIE_DOMAIN=.example.com              # covers both app. and api. subdomains
NODE_ENV=production
```

Separate subdomains (`app.example.com` → frontend, `api.example.com` → API). Cookie domain `.example.com` makes the session available to both.

---

## API Endpoints

### Auth Routes (`/api/auth/`)

| Endpoint | Method | Auth | Input | Output | Success | Error |
|----------|--------|------|-------|--------|---------|-------|
| `/login` | POST | None | `{ email, password }` | 200 `{ user, token }` | User validated | 401 Invalid credentials |
| `/signup` | POST | None | `{ email, name, password, token? }` | 201 `{ user, token }` | Account created | 409 Email exists, 400 Validation |
| `/logout` | POST | Session | None | 204 | Session cleared | 401 Not authenticated |
| `/me` | GET | Session | None | 200 `{ id, email, name, role }` | Session restored | 401 Session invalid |
| `/forgot-password` | POST | None | `{ email }` | 202 `{ message }` | Code generated, email sent | (never fails, security) |
| `/reset-password` | POST | None | `{ email, code, newPassword }` | 200 `{ message }` | Password updated | 401 Invalid code, 409 Expired |

**Note:** All endpoints return `{ user, token }` on auth success. Frontend stores token in localStorage for session persistence.

### Protected Tournament Routes

Existing routes gain session-based auth:
- `POST /tournaments/:id/register` — now calls `inviteUser()` for unknown emails
- `GET /player/tournaments` — returns only player's own tournaments
- `POST /tournaments/:id/matches/:id/score` — requires player in match

All protected routes use `req.account` (attached by session middleware) for authorization.

---

## Magic Link / Invite Flow

### When does a magic link get sent?

1. **Tournament registration with unknown email:**
   - Organizer adds `alice@example.com` to tournament
   - System checks: does `accounts` exist for that email?
   - If no: creates pending account, sends magic link invite email

2. **Returning player password reset:**
   - User clicks "Forgot password"
   - Enters email → `POST /auth/magic-link`
   - System finds account, sends magic link
   - User sets new password via `/setup-account`

3. **Reinvite existing player (future):**
   - If a player's setup expires, organizer can trigger a new invite

### Invite Email Service

Uses existing `packages/api/src/workers/` email infrastructure (Task #16):
- Template: "You've been invited to [Tournament]. Set up your account: [magic link]"
- Link format: `https://app.example.com/setup-account?token=abc123`
- Stored as job in `InMemoryJobQueue` (async, retryable)

---

## Frontend Routes & Pages

### Public Routes (no auth required)
- `/` — Landing page
- `/login` — Email + Password login (returning users)
- `/signup` — Create account (standalone or magic link `/signup?token=xxx`)
- `/forgot-password` — Request password reset code
- `/reset-password` — Reset password with code
- `/browse` — Browse tournaments (public list, registration forms)

### Protected Routes (auth required)
- `/my-tournaments` — Player's registered tournaments
- `/organizer` — Organizer dashboard (organizers only)
- `/tournaments/:id` — Tournament details (role-based rendering)
  - `/standings` — Standings table (role-based filters)
  - `/matches` — Match list + score submission
  - `/bracket` — Player or organizer bracket view
  - `/groups` — Group management (organizer only)
- `/matches` — All matches user is in

**Auth gating:** 
- Routes check `useAuth().isAuthenticated` before rendering
- Unauthenticated users redirected to `/login`
- Unauthorized users (e.g., player accessing organizer routes) shown error
- Logged-in users accessing `/login`, `/signup`, etc. redirected to `/browse`

---

## Implementation Strategy: UI-First with TDD

### Phase 1: Frontend UI (MSW Mocks)

**Goal:** Build and test the complete auth UI flow without backend implementation.

**Deliverables:**
1. **MSW Mock Handlers** (`packages/frontend/src/mocks/handlers.ts`)
   - `POST /api/auth/login` → mock success/error scenarios
   - `POST /api/auth/signup` → mock success/error scenarios
   - `POST /api/auth/forgot-password` → mock code generation
   - `POST /api/auth/reset-password` → mock code validation

2. **Four Auth Pages** with full form validation
   - `/login` — Email + Password, validation, error handling
   - `/signup` — Email + Name + Password + Confirm Password, magic link token support
   - `/forgot-password` — Email form, success confirmation
   - `/reset-password` — Email + Code + Password + Confirm Password

3. **useAuth() Hook** (React Context)
   - `user`, `isAuthenticated`, `loading` state
   - `login()`, `signup()`, `forgotPassword()`, `resetPassword()`, `logout()` methods
   - Token persistence in localStorage
   - Session restoration on page load

4. **Route Protection**
   - Protected routes require auth
   - Redirect unauthenticated users to `/login`
   - Redirect authenticated users away from auth pages

5. **Browser Testing**
   - All form validations work
   - Errors display correctly
   - Navigation flows work
   - Session persists across page reload

### Phase 2: Backend API (TDD)

**Goal:** Implement API endpoints to match frontend expectations. Use TDD: write tests first, then implementation.

**Test-Driven Development Approach:**

For each endpoint:
1. **Write integration tests** that verify the endpoint behavior
   - Success paths (happy path)
   - Error scenarios (invalid input, duplicate email, etc.)
   - State changes (password hashed, token issued, etc.)
2. **Implement endpoint** to make tests pass
3. **Verify frontend still works** against real API

**Endpoints (in order):**

1. **POST /api/auth/login** (Tests first)
   - ✅ Valid email + password → return user + token
   - ✅ Invalid password → 401 error
   - ✅ Unknown email → 401 error
   - ✅ Implementation: authenticate user, hash password check, issue token

2. **POST /api/auth/signup** (Tests first)
   - ✅ Valid email + name + password → create account + return user + token
   - ✅ Duplicate email → 409 error
   - ✅ Invalid password (too short) → 400 error
   - ✅ Magic link token provided → extract email from token, validate token
   - ✅ Implementation: create account row, hash password, issue token

3. **POST /api/auth/forgot-password** (Tests first)
   - ✅ Valid email → generate 6-digit code, store with 15-min expiration
   - ✅ Unknown email → also succeeds (security: don't reveal if email exists)
   - ✅ Implementation: generate code, store in database (temp table or column)

4. **POST /api/auth/reset-password** (Tests first)
   - ✅ Valid email + code + password → update password, invalidate code
   - ✅ Invalid code → 401 error
   - ✅ Expired code → 401 error
   - ✅ Too many attempts → 429 error (rate limiting)
   - ✅ Implementation: validate code, update password_hash, mark code used

5. **POST /api/auth/logout** (Tests first)
   - ✅ Valid session → clear token
   - ✅ Implementation: delete token from store

6. **GET /api/auth/me** (Tests first)
   - ✅ Valid session → return user info
   - ✅ Invalid session → 401 error
   - ✅ Implementation: validate token, return user

### Switching Between Phases

**During Phase 1 (UI-only):**
- MSW intercepts all `/api/auth/*` calls
- No backend needed
- Frontend developer can iterate on UI freely

**Transition to Phase 2:**
- Start backend endpoint implementations
- Write tests first (TDD)
- MSW automatically "bypassed" as real endpoints respond
- Frontend tests continue to pass (assuming contract matches)

**Final Testing:**
- Run frontend tests against real API
- Run backend tests independently
- Run E2E tests (Playwright) with full stack

### Seed Script: `scripts/seed-admin.ts`

```bash
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=SecurePassword123 \
ts-node scripts/seed-admin.ts
```

**What it does:**
1. Reads `ADMIN_EMAIL` + `ADMIN_PASSWORD` from env
2. Hashes password via `bcryptjs`
3. Inserts into `accounts` with `role: 'admin'`, `status: 'active'`
4. Idempotent: if admin already exists, no-op

**Use case:** Fresh deployment or testing. Only way to create the initial admin account (no public signup endpoint for admins).

---

## Organizer Auth (Forward Design, Not Implemented Yet)

The `accounts` schema and session flow support organizers with zero changes:

1. Admin creates organizer account (seed script or future admin panel)
2. Organizer logs in via `/login` with email + password
3. System recognizes `role: 'organizer'` and shows organizer dashboard
4. Organizer can create tournaments, manage brackets, etc.

**Nothing to change in auth code.** Just add the admin UI to create/manage organizer accounts later.

---

## Security Considerations

### Password Hashing
- Algorithm: `bcryptjs` (slow, memory-hard, salted)
- Min salt rounds: 10
- Applied: before storing in `accounts.password_hash`
- Verified: `compareSync(inputPassword, hash)` during login

### Token Generation
- Magic link tokens: 32 bytes (256 bits) of cryptographically secure random hex
- Session tokens: same (opaque, no claims embedded)
- No JWTs used (simple is safer for this scale)

### CORS & Same-Origin
- Magic links use URL parameters (no cookie in cross-site context)
- `SameSite=Strict` prevents accidental cookie leakage
- Account setup happens in same-origin context (redirect from login)

### Rate Limiting (Future)
- Not implemented in this phase
- Protects `/login`, `/magic-link`, `/setup` from brute force
- Use middleware like `express-rate-limit`

---

## Testing Strategy

### Phase 1: Frontend Tests (MSW Mocks)

**Unit Tests (UI Components)**
- Form validation: email format, password length, confirm password match
- Error message display
- Loading states
- Navigation between pages

**Integration Tests (Flows)**
- Signup flow: fill form → submit → redirected to /browse
- Login flow: fill form → submit → redirected to /browse
- Forgot password flow: enter email → success message shown
- Reset password flow: enter code + password → redirected to /login
- Session persistence: reload page → user still logged in
- Protected routes: unauthenticated redirect to /login

**Manual Browser Testing**
- All form validations work (real-time error messages)
- All MSW mock scenarios tested (success, errors, edge cases)
- Mobile responsiveness
- Accessibility

### Phase 2: Backend Tests (TDD)

**Unit Tests**
- Password hashing/verification with bcryptjs
- Token generation (random, unique)
- Code generation (6-digit, random, unique)
- Code expiration logic
- Rate limiting logic

**Integration Tests** (one per endpoint, written before implementation)
1. **POST /api/auth/login**
   - Valid credentials → 200 + user + token
   - Invalid credentials → 401
   - Hash verification works

2. **POST /api/auth/signup**
   - Valid input → 201 + user + token, account created
   - Duplicate email → 409
   - Invalid password → 400
   - Magic link token → extract email from token

3. **POST /api/auth/forgot-password**
   - Any email → 202 + code generated
   - Code stored with expiration
   - Rate limiting applied

4. **POST /api/auth/reset-password**
   - Valid code → 200, password updated, code invalidated
   - Invalid code → 401
   - Expired code → 401
   - Rate limiting applied

5. **GET /api/auth/me**
   - Valid token → 200 + user info
   - Invalid token → 401

### Phase 3: E2E Tests (Full Stack with Playwright)

- User completes standalone signup → can access protected routes
- User receives magic link → completes signup → can access tournament
- User logs in → can access protected routes
- User logs out → redirected to login, can't access protected routes
- User forgets password → completes reset flow → can log in with new password
- Session persists across page reload
- Rate limiting prevents brute force attacks

---

## Known Gaps & Deferred Work

### Phase 1 Only (Frontend + MSW Mocks)
- Email sending (mocked, not real)
- Backend storage (all state in-memory via MSW)
- Rate limiting (mocked to always succeed)
- Session persistence (localStorage only, no server session)

### Phase 2 (Backend Implementation)
1. **Email sending integration** — AWS SES or similar for forgot-password codes
   - Currently mocked in MSW
   - Add email template system
   - Handle delivery failures

2. **Rate limiting** — on `/login`, `/forgot-password`, `/reset-password`
   - Use `express-rate-limit` or similar
   - Prevent brute force attacks
   - Track by IP + email

3. **Token/Code storage** — move from in-memory to persistent
   - `password_reset_codes` table for 6-digit codes
   - Cleanup job for expired codes
   - Attempt counter for rate limiting

4. **Session management** — httpOnly cookies or JWT
   - Decide: cookie-based vs token-based
   - Implement token store (SQLite or Redis)
   - Rolling session refresh

### Phase 3 & Beyond
1. **Tournament registration form** — email-only form that generates magic link
2. **Organizer authentication** — login for organizer role
3. **Admin panel** — for creating/managing organizer accounts
4. **Email verification** — require email verification before account fully active
5. **Two-factor authentication** — TOTP or SMS codes
6. **Social login** — Google, etc.
7. **Session expiration UX** — "Your session expired" toast
8. **Account recovery codes** — backup codes for password reset

---

## Deployment Checklist

- [ ] Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars
- [ ] Run `ts-node scripts/seed-admin.ts` to create admin
- [ ] Set `CORS_ORIGIN` to production frontend URL
- [ ] Set `COOKIE_DOMAIN` to prod domain (e.g., `.example.com`)
- [ ] Ensure `NODE_ENV=production` (enables `secure` cookie flag)
- [ ] Configure HTTPS on both frontend and API
- [ ] Test: admin login → token stored in httpOnly cookie → session persists across refreshes
- [ ] Test: user receives magic link → clicks link → sets password → logged in

---

## Implementation Approach: UI-First + TDD

This authentication system is being implemented in **two phases**:

### Phase 1: Frontend UI-First (Current)
- Build all 4 auth pages with MSW mock handlers
- Complete form validation and UX flows
- No backend required
- Browser-testable end-to-end

**Why:** Clarify UX, design API contract, validate user flows before backend work.

### Phase 2: Backend with TDD
- Write integration tests for each endpoint (tests first)
- Implement endpoints to pass tests
- Switch real API responses in (frontend tests still pass)
- Add persistent storage, email, rate limiting

**Why:** Ensures API matches frontend expectations, prevents surprises late in development.

## Summary

This plan establishes a **modern auth system** for players with deferred organizer/admin support. Key design choices:

- **Standalone + Magic link signup** — self-service or tournament-driven flows
- **Time-limited 6-digit codes for password reset** — more secure than magic links
- **Frontend-first UI development** — validate flows, then implement backend
- **Test-driven backend** — write tests before implementation
- **MSW mocks** — complete UI testing without backend
- **Unified login flow** — same `/login` for all roles

The system is designed for **incremental development**: Phase 1 delivers a working UI with mocks, Phase 2 adds persistence and email, Phase 3 adds tournament registration and organizer support.
