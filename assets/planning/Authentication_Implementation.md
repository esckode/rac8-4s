# Authentication Implementation Plan

This document breaks down Authentication_Planning.md into 30 actionable tasks organized into 6 phases. Each task includes prerequisites, implementation criteria, and success criteria.

---

## Token Architecture Decision

**Context:** The tournament management app is being split into a mobile-specific app and a backend system (distributed architecture).

**Architecture:** JWT tokens for sessions + Opaque tokens for magic links

### Magic Link Tokens (One-Time, Email-Based)
- **Type:** Opaque tokens stored in Redis
- **Lifecycle:** Sent via email → User clicks → Exchanged for session JWT → Deleted
- **Why opaque:** Single-use is non-negotiable; need server-side tracking of which links have been used
- **TTL:** ~15 minutes

### Session Tokens (After Authentication)
- **Type:** JWT (signed, stateless)
- **Lifecycle:** Issued after magic link consumed → Sent with every request → Expires
- **Payload:** `{ sub, email, tournamentId, type: 'player'|'organizer', iat, exp }`
- **Why JWT:** Stateless validation enables horizontal scaling; each backend server validates independently without needing shared session storage
- **TTL:** 7 days (players), 30 days (organizers)

### Revocation (Optional)
- **Explicit logout:** Add JWT ID (JTI) to Redis blocklist (lightweight, optional)
- **Why optional:** Can rely on short TTL instead; blocklist only needed for immediate revocation after logout

### Redis Requirements
- **Required:** Magic link tokens (one-time)
- **Optional:** JWT blocklist for explicit logout
- **Not needed:** Session storage (handled by JWT)

### Why This Works for Distributed Architecture
| Aspect | Single-Server (Opaque) | Distributed (JWT + Opaque) |
|--------|------------------------|---------------------------|
| Session validation | TokenStore lookup | Crypto signature (stateless) |
| Horizontal scaling | Shared Redis contention | Independent validation |
| Token revocation | Instant (delete) | Hybrid (blocklist + TTL) |
| Magic links | One-time storage | One-time storage |

**Key insight:** Distributed systems strongly prefer stateless validation (JWT) because multiple servers need to validate tokens independently without shared state. Opaque tokens everywhere would require every server to hit shared Redis for every request.

See [Token Architecture memory](/memory/token_architecture.md) for full specification.

---

## Phase 1: Foundation - Database & Auth Infrastructure (6 tasks)

### Task 1.1: Create `accounts` Table Migration ✅ DONE

**Prerequisites:**
- Database migration system is working (confirmed in `packages/api/src/db.ts`)

**Implementation Criteria:**
- Create migration file: `db/migrations/010_create_accounts.sql`
- Define schema per Authentication_Planning.md:
  - `id` (TEXT PRIMARY KEY, UUID)
  - `email` (TEXT UNIQUE NOT NULL)
  - `password_hash` (TEXT, NULL initially)
  - `role` (TEXT NOT NULL, CHECK constraint: 'admin'|'organizer'|'player')
  - `status` (TEXT NOT NULL DEFAULT 'pending', CHECK: 'pending'|'active')
  - `created_at` (TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)
- Create index: `CREATE INDEX idx_accounts_email ON accounts(email)` for email lookups
- Avoid hardcoding; use migration pattern from existing migrations (001-009)
- Add structured logging for migration execution via logger

**Success Criteria:**
- Migration runs without errors
- `accounts` table exists with exact schema specified
- Can insert/query test records without errors
- Email uniqueness constraint is enforced (duplicate email insertion fails)
- Index on email exists and improves query performance
- Code coverage ≥ 80% for migration validation
- No security vulnerabilities detected (SQL injection, constraint bypass)
- Integration test verifies table structure matches schema

---

### Task 1.2: Create `password_reset_codes` Table Migration ✅ DONE

**Prerequisites:**
- Task 1.1 complete (`accounts` table exists)

**Implementation Criteria:**
- Create migration file: `db/migrations/011_create_password_reset_codes.sql`
- Define schema:
  - `id` (TEXT PRIMARY KEY, UUID)
  - `account_id` (TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE)
  - `code` (TEXT NOT NULL, 6-digit code as string)
  - `attempts` (INTEGER NOT NULL DEFAULT 0, tracks failed reset attempts)
  - `expires_at` (TEXT NOT NULL, ISO 8601 timestamp)
  - `used_at` (TEXT, NULL until code is consumed)
  - `created_at` (TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)
- Create indexes:
  - `CREATE INDEX idx_reset_codes_account_id ON password_reset_codes(account_id)`
  - `CREATE INDEX idx_reset_codes_code ON password_reset_codes(code)` for code lookups
- Follow existing migration patterns
- Add logging for migration events

**Success Criteria:**
- Migration runs without errors
- `password_reset_codes` table exists with exact schema
- Foreign key constraint to `accounts` is enforced
- Can insert/query test records without errors
- Indexes exist and improve lookup performance
- Code coverage ≥ 80%
- No security vulnerabilities
- Integration test verifies cascading delete works (delete account → delete codes)

---

### Task 1.3: Create `AccountRepository` Class ✅ DONE

**Prerequisites:**
- Task 1.1 complete (`accounts` table exists)
- Review existing repository pattern in `packages/api/src/db.ts`

**Implementation Criteria:**
- Add `AccountRepository` class to `packages/api/src/db.ts`
- Define `interface AccountRow` with all columns from accounts table
- Implement methods:
  - `findByEmail(email: string): AccountRow | null` — case-insensitive email lookup
  - `findById(id: string): AccountRow | null` — lookup by account ID
  - `create(email: string, role: string, status?: string): AccountRow` — create new account
  - `updatePasswordHash(id: string, hash: string): void` — update password after reset
  - `getAttempts(id: string): number` — future rate limiting support
- Use config from `AppDependencies` for database connection, not hardcoded values
- Add structured logging for all queries: `log.debug('account.query', { method, params })`
- Use TypeScript strictly; no `any` types
- Use prepared statements to prevent SQL injection
- Follow existing repository patterns and naming conventions

**Success Criteria:**
- Code coverage ≥ 85% (all methods tested)
- Create/read operations work correctly
- Email uniqueness is enforced
- Timestamp handling works (created_at, updated_at)
- Type safety: no `any` types, all interfaces properly defined
- No SQL injection vulnerabilities
- Logging includes query type and account ID (not sensitive data)
- Integration test verifies CRUD operations and constraints

---

### Task 1.4: Create `PasswordResetCodeRepository` Class ✅ DONE

**Prerequisites:**
- Task 1.2 complete (`password_reset_codes` table exists)
- Task 1.3 complete (`AccountRepository` pattern established)

**Implementation Criteria:**
- Add `PasswordResetCodeRepository` class to `packages/api/src/db.ts`
- Define `interface PasswordResetCodeRow` with all columns
- Implement methods:
  - `create(accountId: string, code: string, expirationMinutes: number): PasswordResetCodeRow` — create new reset code
  - `findByCode(code: string): PasswordResetCodeRow | null` — lookup by 6-digit code
  - `findByAccountId(accountId: string): PasswordResetCodeRow | null` — lookup latest code for account
  - `incrementAttempts(id: string): number` — increment attempt counter, return new count
  - `markAsUsed(id: string): void` — mark code as consumed (set used_at)
  - `deleteExpired(): number` — cleanup job for expired codes, return count deleted
- Helper methods (as static or class methods):
  - `isExpired(row: PasswordResetCodeRow): boolean` — check if code expiration time passed
  - `isUsed(row: PasswordResetCodeRow): boolean` — check if code has been used
  - `generateCode(): string` — generate random 6-digit code (use crypto.randomInt)
- Use config for database, not hardcoded values
- Add structured logging for operations: `log.info('reset_code.created', { accountId, expiresAt })`
- Use TypeScript strictly; no `any` types
- Use prepared statements to prevent SQL injection

**Success Criteria:**
- Code coverage ≥ 85% (all methods tested)
- Can create codes with correct expiration (15 min from now)
- Can retrieve by code and by account ID
- Expiration check works correctly (expired codes return NULL)
- Attempt counter increments and can be queried
- Code marked as used cannot be reused
- Cleanup of expired codes works (removes old codes, keeps recent ones)
- Type safety: no `any` types, interfaces properly defined
- No SQL injection vulnerabilities
- Logging includes account ID and code metadata (not code value itself for security)
- Integration test verifies all operations and edge cases

---

### Task 1.5: Implement Token Generation (JWT Sessions + Opaque Magic Links) ✅ DONE

**Prerequisites:**
- `packages/api/src/auth/token-store.ts` exists and has `TokenStore` interface
- Review existing `InMemoryTokenStore` implementation
- `jsonwebtoken` library available in dependencies

**Implementation Criteria:**

**Part 1: JWT Session Token Generation**
- Create/enhance `issueSessionToken(payload, config): TokenPair` function that:
  - Accepts payload: `{ sub: string, email: string, tournamentId?: string, type: 'player'|'organizer', role?: string }`
  - Signs with `jwt.sign()` using `config.secret`
  - Sets expiration: 7 days for players, 30 days for organizers (configurable)
  - Includes optional JTI (JWT ID) for revocation tracking
  - Returns `{ accessToken, expiresAt }`
- Create `verifySessionToken(token, config): Payload` that:
  - Validates signature and expiration
  - Throws `TokenExpiredError` if expired
  - Throws `TokenInvalidError` if invalid/tampered

**Part 2: Opaque Magic Link Token Generation**
- Keep existing `generateMagicLinkToken()` function (opaque, one-time)
  - Uses `crypto.randomBytes(32)` for 256-bit random value
  - Stores in TokenStore with short TTL (~15 minutes)
  - Returns hex-encoded token (64 characters)

**Part 3: Token Revocation (Optional)**
- Create `invalidateSessionToken(token, store): Promise<void>` that:
  - Decodes JWT to extract JTI
  - Adds JTI to Redis blocklist with remaining TTL
  - Enables explicit logout without waiting for expiration
- Create `isSessionTokenRevoked(token, store): Promise<boolean>` that:
  - Checks if JTI is in blocklist
  - Returns false if JTI not present or doesn't exist (safe default)

**General Requirements:**
- Use config for TTL values, secret, algorithms — no hardcoded values
- Add logging: `log.debug('token.issued', { type: 'session'|'magic_link', expiresAt, ttl })`
- Use TypeScript strictly; no `any` types
- Ensure all tokens use Node.js crypto (secure randomness)
- Never log full token values (log only first 8 characters)

**Success Criteria:**
- Code coverage ≥ 90% (token generation and validation)
- JWT tokens are correctly signed and verifiable
- Magic link tokens are unique (no collisions in test suite)
- TTL is respected (expired tokens rejected)
- Can delete/blocklist tokens before expiration
- No hardcoded values; all config from `AppDependencies.config`
- Type safety: no `any` types
- No security vulnerabilities (cryptographically secure randomness)
- Integration test verifies JWT token lifecycle (issue → validate → verify expiration)
- Integration test verifies magic link lifecycle (create → use once → delete)

---

### Task 1.6: Implement Auth Middleware (JWT Session Validation + Magic Link Validation) ✅ DONE

**Prerequisites:**
- Task 1.5 complete (token generation and validation)
- Review existing middleware in `packages/api/src/auth/middleware.ts`

**Implementation Criteria:**

**Part 1: JWT Session Validation Middleware**
- Create `requireSessionAuth(authHeader: string, config: JwtConfig, tokenStore?: TokenStore): Promise<SessionPayload>`
- Logic:
  1. Extract token from `Authorization: Bearer <token>` header
  2. If header missing or malformed, throw `MissingTokenError` (401)
  3. Call `verifySessionToken(token, config)` to validate JWT signature + expiration
  4. If `TokenExpiredError`, throw (401)
  5. If `TokenInvalidError`, throw (401)
  6. **Optional:** If revocation enabled, check `isSessionTokenRevoked(token, tokenStore)` and throw if revoked (401)
  7. Return decoded payload: `{ sub, email, tournamentId, type, iat, exp }`
- This is stateless (no database lookup unless revocation is enabled)

**Part 2: Magic Link Validation**
- Enhance existing `requireMagicLinkAuth(token: string, tokenStore: TokenStore): Promise<MagicLinkPayload>`
- Logic:
  1. Call `validateMagicLinkToken(token, tokenStore)` (existing function)
  2. If token not found or expired, throw `TokenInvalidError` (401)
  3. Return payload: `{ playerId, tournamentId, email, createdAt }`
  4. Token is deleted after validation (single-use)

**General Requirements:**
- Use config from `AppDependencies` for JWT validation, not hardcoded
- Add structured logging: `log.debug('auth.middleware', { type: 'jwt'|'magic_link', status: 'valid'|'expired'|'invalid', sub })`
- Use TypeScript strictly; no `any` types
- Follow error handling pattern in `packages/api/src/auth/errors.ts`
- Never log full tokens (log only first 8 characters if needed)

**Success Criteria:**
- Code coverage ≥ 85% (middleware logic)
- Valid JWT tokens pass through middleware (stateless validation)
- Expired JWT tokens are rejected with 401
- Invalid/malformed JWT tokens are rejected with 401
- Valid magic link tokens pass through (one-time validation)
- Expired magic link tokens are rejected with 401
- Already-used magic link tokens are rejected with 401
- Error messages don't leak token information
- Type safety: return types properly defined, no `any`
- Logging follows standards (no full tokens, no secrets)
- No vulnerabilities in token validation
- Integration test verifies JWT scenarios (valid, expired, tampered, revoked if enabled)
- Integration test verifies magic link scenarios (valid, expired, reuse attempts)

---

## Phase 2: Backend API Endpoints via TDD (12 tasks)

### Task 2.1: Write Integration Tests for POST /api/auth/signup ✅ DONE

**Prerequisites:**
- Phase 1 complete (database, repositories, token generation)
- Review existing test patterns in `packages/api/src/__tests__/`

**Implementation Criteria:**
- Create test file: `packages/api/src/__tests__/signup.spec.ts`
- Use existing test framework and patterns from codebase
- Write tests (before implementation) covering:

**Test Cases:**
1. **Valid standalone signup** — email, name, password (all required, valid)
   - Expected: 201 response, account created, password hashed, token issued
2. **Duplicate email** — email already exists
   - Expected: 409 response, "Email already in use"
3. **Invalid email format** — missing @, no domain
   - Expected: 400 response, "Please enter a valid email"
4. **Password too short** — < 6 characters
   - Expected: 400 response, "Password must be at least 6 characters"
5. **Name too short** — < 2 characters
   - Expected: 400 response, "Name must be at least 2 characters"
6. **Missing required fields** — email, name, or password empty
   - Expected: 400 response, field validation error
7. **Magic link signup with valid token** — token provides email
   - Expected: 201 response, account created with token email
8. **Magic link with expired token** — token past expiration
   - Expected: 401 response, "This link has expired or is invalid"
9. **Magic link email override** — user enters different email than token
   - Expected: 201 response, user-entered email used (can override)
10. **Password hashing verified** — account created, password is hashed
    - Expected: password_hash is not plaintext, bcryptjs.compareSync() works

**Implementation Criteria for Tests:**
- Use database fixtures to set up test data
- Tests should be isolated (no test order dependencies)
- Verify response schema matches Authentication_Planning.md spec
- Include setup/teardown (create test account, clean up after)
- Test all error codes: 400, 409, 401
- Verify token is returned on success and can be used for auth

**Success Criteria:**
- All 10 tests written and passing
- Tests verify account is created in database with correct fields
- Tests verify password is hashed (not plaintext)
- Tests verify token is issued and can be decoded
- Code coverage ≥ 90% for signup logic
- Tests use structured logging to verify logs are written
- Type safety in test fixtures and assertions

---

### Task 2.2: Implement POST /api/auth/signup Endpoint ✅ DONE

**Prerequisites:**
- Task 2.1 complete (integration tests written)
- Task 1.3 (AccountRepository)
- Task 1.5 (token generation)
- `bcryptjs` available in dependencies

**Implementation Criteria:**
- Create route: `POST /api/auth/signup` in `packages/api/src/routes/auth.ts`
- Register route in `packages/api/src/app.ts` under `/api/auth` prefix
- Input validation:
  - Email: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - Name: minimum 2 characters, not empty
  - Password: minimum 6 characters, not empty
  - Token (optional): validate format if provided
- Logic (make tests from 2.1 pass):
  1. Validate all inputs (return 400 if invalid)
  2. Check if account with email already exists (return 409 if duplicate)
  3. If token provided, validate magic link token and extract email (can be overridden)
  4. Hash password with `bcryptjs.hash(password, 10)` (10 salt rounds)
  5. Create account via `AccountRepository.create(email, 'player', 'active')`
  6. Generate session token via `generateSessionToken()`
  7. Store token in `tokenStore` with 30-day TTL (use config, not hardcoded)
  8. Log success: `log.info('account.created', { accountId, email, role: 'player' })`
  9. Return 201 with `{ user: { id, email, name, role }, token }`
- Use config from `AppDependencies` for token TTL, not hardcoded values
- Add TypeScript type safety; no `any` types
- Follow error handling pattern in `app.ts` error handler

**Success Criteria:**
- All tests from Task 2.1 pass (100%)
- Code coverage ≥ 90% for endpoint
- No TypeScript errors
- Endpoint returns exact response schema from Authentication_Planning.md
- Password is hashed using bcryptjs (10 rounds), not stored plaintext
- Token is issued and works with auth middleware
- Logging follows project standards (structured, no secrets logged)
- No vulnerabilities (SQL injection, XSS, credential exposure)
- API contract matches spec: status codes, error messages, field names exact

---

### Task 2.3: Write Integration Tests for POST /api/auth/login ✅ DONE

**Prerequisites:**
- Phase 1 complete
- Task 2.2 complete (accounts can be created)

**Implementation Criteria:**
- Create test file: `packages/api/src/__tests__/login.spec.ts`
- Write tests covering:

**Test Cases:**
1. **Valid login** — existing account, correct password
   - Expected: 200 response, user info, token issued
2. **Wrong password** — existing account, incorrect password
   - Expected: 401 response, "Invalid email or password"
3. **Unknown email** — email doesn't exist
   - Expected: 401 response, "Invalid email or password" (same message, don't leak)
4. **Invalid email format** — malformed email
   - Expected: 400 response, "Please enter a valid email"
5. **Missing password** — password field empty or missing
   - Expected: 400 response, "Password is required"
6. **Password verification works** — account has hashed password, verify with plaintext
   - Expected: 200 response (bcryptjs.compareSync works)
7. **Account without password** — account with password_hash = NULL
   - Expected: 401 response (account not set up)

**Implementation Criteria for Tests:**
- Use fixtures to create test account with hashed password
- Verify password verification uses bcryptjs.compareSync
- Verify token is issued on success
- Error messages don't reveal if email exists

**Success Criteria:**
- All 7 tests written and passing
- Tests verify password verification works
- Tests verify token is issued on success
- Code coverage ≥ 90%
- Type safety maintained

---

### Task 2.4: Implement POST /api/auth/login Endpoint ✅ DONE

**Prerequisites:**
- Task 2.3 complete (integration tests written)
- Task 1.3 (AccountRepository)
- Task 1.5 (token generation)
- `bcryptjs` available

**Implementation Criteria:**
- Create route: `POST /api/auth/login` in `packages/api/src/routes/auth.ts`
- Input validation:
  - Email: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - Password: required (non-empty)
- Logic:
  1. Validate email format (return 400 if invalid)
  2. Lookup account by email via `AccountRepository.findByEmail(email)`
  3. If not found, return 401 with "Invalid email or password" (don't leak email existence)
  4. If `password_hash` is NULL, return 401 (account not fully set up)
  5. Verify password with `bcryptjs.compareSync(inputPassword, passwordHash)`
  6. If verification fails, return 401
  7. Generate session token and store with 30-day TTL
  8. Log success: `log.info('login.success', { accountId, email })`
  9. Return 200 with `{ user: { id, email, name, role }, token }`
- Use config for token TTL, not hardcoded
- Type safety: no `any` types
- Follow error handling pattern

**Success Criteria:**
- All tests from Task 2.3 pass (100%)
- Code coverage ≥ 90%
- No TypeScript errors
- Password verification works correctly
- Token is issued and functional
- Logging follows standards
- No vulnerabilities
- API contract matches spec exactly

---

### Task 2.5: Write Integration Tests for POST /api/auth/logout ✅ DONE

**Prerequisites:**
- Phase 1 complete
- Task 2.2 complete (signup works, can get token)

**Implementation Criteria:**
- Create test file: `packages/api/src/__tests__/logout.spec.ts`
- Write tests covering:

**Test Cases:**
1. **Valid logout** — valid token in Authorization header
   - Expected: 204 response, token deleted from store
2. **No token** — Authorization header missing
   - Expected: 401 response
3. **Invalid token** — malformed or expired token
   - Expected: 401 response
4. **Token reuse after logout** — attempt to use token after logout
   - Expected: 401 response (token not found)

**Success Criteria:**
- All 4 tests written and passing
- Token is deleted from TokenStore
- Subsequent requests with deleted token fail
- Code coverage ≥ 90%

---

### Task 2.6: Implement POST /api/auth/logout Endpoint ✅ DONE

**Prerequisites:**
- Task 2.5 complete (tests written)
- Task 1.5 (TokenStore)
- Task 1.6 (auth middleware)

**Implementation Criteria:**
- Create route: `POST /api/auth/logout` in `packages/api/src/routes/auth.ts` (protected)
- Logic:
  1. Require session auth via middleware (extract token, verify valid)
  2. Extract token from `Authorization: Bearer <token>` header
  3. Delete token from `tokenStore.del(token)`
  4. Log: `log.info('logout', { accountId })`
  5. Return 204 (no content)
- Use config, not hardcoded values
- Type safety: no `any` types

**Success Criteria:**
- All tests from Task 2.5 pass (100%)
- Code coverage ≥ 90%
- No TypeScript errors
- Token is deleted and cannot be reused
- Returns 401 if no valid token
- Logging follows standards
- No vulnerabilities

---

### Task 2.7: Write Integration Tests for GET /api/auth/me ✅ DONE

**Prerequisites:**
- Phase 1 complete
- Task 2.2 complete (accounts exist)

**Implementation Criteria:**
- Create test file: `packages/api/src/__tests__/auth-me.spec.ts`
- Write tests covering:

**Test Cases:**
1. **Valid session** — valid token, retrieve user info
   - Expected: 200 response with `{ id, email, name, role }`
2. **Invalid token** — expired or malformed token
   - Expected: 401 response
3. **No token** — Authorization header missing
   - Expected: 401 response

**Success Criteria:**
- All 3 tests written and passing
- User info returned matches account data
- Code coverage ≥ 90%

---

### Task 2.8: Implement GET /api/auth/me Endpoint ✅ DONE

**Prerequisites:**
- Task 2.7 complete (tests written)
- Task 1.3 (AccountRepository)
- Task 1.6 (auth middleware)

**Implementation Criteria:**
- Create route: `GET /api/auth/me` in `packages/api/src/routes/auth.ts` (protected)
- Logic:
  1. Require session auth via middleware
  2. Extract accountId from token payload
  3. Lookup account via `AccountRepository.findById(accountId)`
  4. Log: `log.debug('auth.me', { accountId })`
  5. Return 200 with `{ id, email, name, role }`
- Type safety: no `any` types

**Success Criteria:**
- All tests from Task 2.7 pass (100%)
- Code coverage ≥ 90%
- No TypeScript errors
- Returns correct user info
- Protected by auth middleware
- Logging follows standards

---

### Task 2.9: Write Integration Tests for POST /api/auth/forgot-password ✅ DONE

**Prerequisites:**
- Phase 1 complete
- Task 2.2 complete (accounts exist)
- Task 1.4 (PasswordResetCodeRepository)

**Implementation Criteria:**
- Create test file: `packages/api/src/__tests__/forgot-password.spec.ts`
- Write tests covering:

**Test Cases:**
1. **Valid email (account exists)** — email with existing account
   - Expected: 202 response, reset code created in DB, 15-min expiration
2. **Unknown email (security)** — valid format, no account
   - Expected: 202 response (same as success, don't reveal email existence)
3. **Invalid email format** — malformed email
   - Expected: 400 response, "Please enter a valid email"
4. **Reset code properties** — verify code created with correct values
   - Expected: code is 6 digits, expiration ~15 min, attempts = 0
5. **Email sent** — email adapter called (mock/verify)
   - Expected: email sent to correct recipient with code

**Implementation Criteria for Tests:**
- Verify code is created in `password_reset_codes` table
- Verify code is 6 digits
- Verify expiration is approximately 15 minutes from now
- Mock or verify email sending

**Success Criteria:**
- All 5 tests written and passing
- Tests verify code in database with correct values
- Response is always 202 (security)
- Code coverage ≥ 90%

---

### Task 2.10: Implement POST /api/auth/forgot-password Endpoint ✅ DONE

**Prerequisites:**
- Task 2.9 complete (tests written)
- Task 1.3 (AccountRepository)
- Task 1.4 (PasswordResetCodeRepository)
- Email service available (mocked or real)

**Implementation Criteria:**
- Create route: `POST /api/auth/forgot-password` in `packages/api/src/routes/auth.ts`
- Input validation:
  - Email: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Logic:
  1. Validate email format
  2. Generate 6-digit random code via `PasswordResetCodeRepository.generateCode()`
  3. Lookup account by email (may not exist - that's OK)
  4. If account exists:
     - Create reset code with 15-min expiration via `PasswordResetCodeRepository.create(accountId, code, 15)`
     - Send email with code (via email adapter or mock)
     - Log: `log.info('reset_code.generated', { accountId, expiresAt })`
  5. Always return 202 (don't reveal if email exists)
  6. Log: `log.info('forgot_password.requested', { email })`
- Use config for code expiration, not hardcoded
- Type safety: no `any` types

**Success Criteria:**
- All tests from Task 2.9 pass (100%)
- Code coverage ≥ 90%
- No TypeScript errors
- Always returns 202 (security)
- Code is created in database with 15-min expiration
- Email is sent when account exists
- Logging follows standards
- No vulnerabilities

---

### Task 2.11: Write Integration Tests for POST /api/auth/reset-password ✅ DONE

**Prerequisites:**
- Phase 1 complete
- Task 2.9 complete (forgot-password works, codes are created)
- Task 1.4 (PasswordResetCodeRepository)

**Implementation Criteria:**
- Create test file: `packages/api/src/__tests__/reset-password.spec.ts`
- Write tests covering:

**Test Cases:**
1. **Valid reset (happy path)** — valid email, code, password
   - Expected: 200 response, password updated, code marked used
2. **Invalid email format** — malformed email
   - Expected: 400 response, "Please enter a valid email"
3. **Email doesn't exist** — valid format, no account
   - Expected: 401 response, "Invalid reset code" (don't reveal)
4. **Invalid code format** — not 6 digits
   - Expected: 400 response, "Code must be 6 digits"
5. **Code doesn't match** — valid code format, wrong code for email
   - Expected: 401 response, attempt counter incremented
6. **Code expired** — code past expiration time
   - Expected: 401 response, attempt counter incremented
7. **Code already used** — code marked used_at
   - Expected: 401 response, "Invalid reset code"
8. **Password too short** — < 6 characters
   - Expected: 400 response, "Password must be at least 6 characters"
9. **Too many attempts (rate limiting)** — 5+ failed attempts
   - Expected: 429 response, "Too many attempts. Try again later."
10. **Warning after 2 attempts** — 2 failed attempts, 3rd attempt
    - Expected: 401 response includes "2 attempts remaining"

**Implementation Criteria for Tests:**
- Create test accounts and reset codes
- Verify attempt counter increments
- Verify rate limiting at 5 attempts
- Verify attempt warnings after 2 failed tries
- Verify password is hashed before update

**Success Criteria:**
- All 10 tests written and passing
- Tests verify password is hashed and updated
- Tests verify attempt tracking works
- Tests verify rate limiting at 5 attempts
- Code coverage ≥ 90%

---

### Task 2.12: Implement POST /api/auth/reset-password Endpoint ✅ DONE

**Prerequisites:**
- Task 2.11 complete (tests written)
- Task 1.3 (AccountRepository)
- Task 1.4 (PasswordResetCodeRepository)
- `bcryptjs` available

**Implementation Criteria:**
- Create route: `POST /api/auth/reset-password` in `packages/api/src/routes/auth.ts`
- Input validation:
  - Email: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - Code: exactly 6 digits
  - Password: minimum 6 characters
- Logic (make tests from 2.11 pass):
  1. Validate email format (return 400 if invalid)
  2. Validate code is 6 digits (return 400 if not)
  3. Validate password is 6+ chars (return 400 if not)
  4. Lookup account by email via `AccountRepository.findByEmail(email)`
  5. If not found, return 401 with "Invalid reset code" (don't reveal)
  6. Lookup reset code via `PasswordResetCodeRepository.findByCode(code)`
  7. If not found, increment attempts and check limit:
     - If attempts >= 5, return 429
     - If attempts >= 2, include remaining attempts in error message
     - Return 401
  8. If code expired, increment attempts and check limit (same as above)
  9. If code already used, return 401
  10. Hash password with `bcryptjs.hash(password, 10)`
  11. Update account via `AccountRepository.updatePasswordHash(accountId, hash)`
  12. Mark code used via `PasswordResetCodeRepository.markAsUsed(codeId)`
  13. Log: `log.info('password.reset', { accountId, email })`
  14. Return 200 with `{ message: "Password updated successfully" }`
- Use config for attempt limit (5), not hardcoded
- Type safety: no `any` types
- Follow error handling pattern

**Success Criteria:**
- All tests from Task 2.11 pass (100%)
- Code coverage ≥ 90%
- No TypeScript errors
- Password is hashed and updated
- Code is marked used
- Attempt tracking works
- Rate limiting at 5 attempts
- Logging follows standards
- No vulnerabilities
- API contract matches spec exactly (status codes, error messages)

---

## Phase 3: Frontend Auth Context & Routing (3 tasks)

### Task 3.1: Implement useAuth() Hook (React Context) ✅ DONE

**Prerequisites:**
- Phase 2 complete (all backend endpoints implemented)
- Frontend pages already exist: Login, Signup, ForgotPassword, ResetPassword
- React Context API available

**Implementation Criteria:**
- Create `packages/frontend/src/hooks/useAuth.ts` or `context/AuthContext.tsx`
- Define `AuthContextType` interface:
  - `user: { id, email, name, role } | null`
  - `isAuthenticated: boolean`
  - `loading: boolean`
  - `login(email, password): Promise<void>`
  - `signup(email, name, password, token?): Promise<void>`
  - `forgotPassword(email): Promise<void>`
  - `resetPassword(email, code, password): Promise<void>`
  - `logout(): Promise<void>`
- Implement Context provider:
  - Token persistence in localStorage (key: `auth_token`)
  - Session restoration on page load (call `GET /api/auth/me` on mount)
  - Error handling (401 → clear token and redirect to login)
  - Loading state during API calls
- Use config from environment for API base URL, not hardcoded
- Type safety: TypeScript interfaces, no `any` types
- Follow React best practices (useCallback, useEffect dependencies)
- Add logging: `log.debug('auth.hook', { action: 'login_success'|'logout'|etc })` if applicable

**Success Criteria:**
- Hook provides correct types for all auth operations
- Token is persisted in localStorage
- Session is restored on page load
- 401 responses trigger logout and redirect
- Loading state works
- Code coverage ≥ 90%
- No TypeScript errors
- No hardcoded URLs; uses config
- Integration test verifies token persistence across page reload

---

### Task 3.2: Implement Protected Route Wrappers and Auth Gating ✅ DONE

**Prerequisites:**
- Task 3.1 complete (useAuth hook exists)

**Implementation Criteria:**
- Create `packages/frontend/src/components/ProtectedRoute.tsx`
- Create wrapper component that:
  - Checks `useAuth().isAuthenticated`
  - If not authenticated, redirect to `/login`
  - If authenticated, render children
  - Show loading spinner while auth state is being determined
- Create gating for public routes (auth pages):
  - If user is authenticated, redirect to `/browse`
  - Prevent logged-in users from accessing `/login`, `/signup`, `/forgot-password`, `/reset-password`
- Use TypeScript; no `any` types
- Follow React Router patterns (useNavigate, Navigate component)

**Success Criteria:**
- Protected routes redirect unauthenticated users to `/login`
- Auth pages redirect authenticated users to `/browse`
- Loading state shows while determining auth
- Type safety maintained
- Integration test verifies routing behavior

---

### Task 3.3: Implement Session Restoration on Page Load ✅ DONE

**Prerequisites:**
- Task 3.1 complete (useAuth hook exists)
- Task 2.8 complete (`GET /api/auth/me` endpoint)

**Implementation Criteria:**
- In `useAuth()` hook, on component mount:
  1. If token exists in localStorage, call `GET /api/auth/me`
  2. If successful (200), set user data
  3. If unauthorized (401), clear token and redirect to login
  4. Set loading=true during fetch, false when complete
- Handle network errors gracefully (log, don't crash)
- Only attempt restore once on app startup
- Use `useEffect` with proper dependency array

**Success Criteria:**
- Token in localStorage is validated on page load
- User data is restored and available to components
- Invalid tokens are cleared and user redirected to login
- Loading state is correct
- Network errors don't crash the app
- Integration test verifies session persists across page reload

---

## Phase 4: Security & Admin Setup (3 tasks)

### Task 4.1: Implement Seed Script (scripts/seed-admin.ts) ✅ DONE

**Prerequisites:**
- Phase 1 complete (accounts table exists)
- Task 2.2 complete (password hashing works)
- Task 1.3 (AccountRepository)

**Implementation Criteria:**
- Create script: `packages/api/scripts/seed-admin.ts`
- Script behavior:
  1. Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` from environment variables
  2. Lookup existing admin account by email
  3. If exists, log message and exit (idempotent)
  4. If not exists:
     - Hash password with `bcryptjs.hash(password, 10)`
     - Create account via `AccountRepository.create(email, 'admin', 'active')`
     - Log success: `log.info('admin.seeded', { email, role: 'admin' })`
  5. Return exit code 0
- Usage: `ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=SecurePassword123 ts-node scripts/seed-admin.ts`
- Use config for database connection, not hardcoded values
- Type safety: no `any` types
- Add logging for all operations

**Success Criteria:**
- Script runs without errors
- Creates admin account with hashed password
- Idempotent (running twice doesn't create duplicate)
- Environment variables are required (fails gracefully if missing)
- Code coverage ≥ 85%
- No TypeScript errors
- Integration test verifies admin account is created with correct role and status

---

### Task 4.2: Implement Rate Limiting (login, forgot-password, reset-password) ✅ DONE

**Prerequisites:**
- Phase 2 complete (endpoints exist)
- Authentication_Planning.md spec: 5 attempts max, warn after 2

**Implementation Criteria:**
- Implement rate limiting middleware or in-endpoint logic
- For `POST /api/auth/login`:
  - Track failed attempts by email + IP address
  - After 3 failed attempts, increase delay (exponential backoff)
  - After 5 failed attempts, return 429 for 15 minutes
  - Successful login clears counter
- For `POST /api/auth/forgot-password`:
  - Track attempts by email
  - After 5 requests in 15 minutes, return 429
- For `POST /api/auth/reset-password`:
  - Tracked via `password_reset_codes.attempts` column (per code)
  - Implemented in Task 2.12 (endpoint implementation)
- Use config for rate limits (5 attempts, 15-minute window), not hardcoded
- Add logging: `log.warn('rate_limit.exceeded', { email, attempts })`
- Type safety: no `any` types

**Success Criteria:**
- Rate limiting works for all three endpoints
- 429 responses are returned when limit exceeded
- Counters reset after time window
- Successful login clears counter
- Code coverage ≥ 85%
- No hardcoded values; uses config
- Logging follows standards
- Integration test verifies rate limiting behavior

---

### Task 4.3: Implement Attempt Tracking for Password Reset ✅ DONE

**Prerequisites:**
- Phase 1 complete (password_reset_codes table)
- Task 2.12 complete (reset-password endpoint)

**Implementation Criteria:**
- This is largely implemented in Task 2.12 via `password_reset_codes.attempts` column
- Verify in endpoint:
  1. Each failed reset attempt increments `attempts` counter
  2. Counter shows in error message after 2 attempts: "2 attempts remaining"
  3. Block (429) after 5 attempts
  4. Successful reset clears counter (code marked used)
- Add logging: `log.warn('reset.attempt_failed', { accountId, attemptsRemaining })`
- Type safety verified in Task 2.12

**Success Criteria:**
- Attempt counter increments on failed reset
- Error messages show remaining attempts
- After 5 attempts, 429 response issued
- Counter is cleared when code is used
- Logging follows standards
- Integration test verifies attempt tracking (covered in Task 2.11)

---

## Phase 5: Email Integration (3 tasks)

### Task 5.1: Implement Email Adapter for Password Reset Codes ✅ DONE

**Prerequisites:**
- Phase 4 complete (rate limiting)
- Task 2.10 complete (forgot-password endpoint)
- Email service available (AWS SES, SendGrid, or mock)

**Implementation Criteria:**
- Review/enhance `packages/api/src/email-adapter.ts`
- Create function: `sendPasswordResetEmail(email: string, code: string, expirationMinutes: number): Promise<void>`
- Logic:
  1. Format code as "12 34 56" (groups of 2) for display
  2. Create email body with:
     - Greeting with email
     - Reset code prominently displayed as "12 34 56"
     - Link to `/reset-password` (frontend URL from config)
     - Note: "This code expires in 15 minutes"
     - Security note: "Didn't request this? Ignore this email"
  3. Send via email service (AWS SES, SendGrid, etc.)
  4. Handle failures gracefully:
     - Log error: `log.error('email.send_failed', { recipient: email, error })`
     - Don't throw; return error status or void (check design)
  5. Log success: `log.info('email.sent', { recipient: email, type: 'password_reset' })`
- Use config for:
  - Email service credentials
  - From email address
  - Frontend base URL for reset link
  - Expiration time (15 minutes)
- Type safety: no `any` types
- No hardcoded values

**Success Criteria:**
- Email is sent with correct code formatting
- Email template includes reset link
- Email template doesn't expose sensitive data (token, hash)
- Failures are logged but don't crash endpoint
- Code coverage ≥ 85%
- No hardcoded values; uses config
- Logging doesn't include full email address in sensitive contexts
- Integration test mocks email service and verifies correct parameters

---

### Task 5.2: Create Email Templates for Reset Codes ✅ DONE

**Prerequisites:**
- Task 5.1 complete (email adapter)

**Implementation Criteria:**
- Create email template: `packages/api/src/email/password-reset.html` (or similar)
- Template should include:
  - Company logo/branding (if available)
  - Greeting: "Hi [email],"
  - Message: "We received a request to reset your password. Here's your code:"
  - Code: prominently displayed as "12 34 56" (large font, monospace)
  - Button/link: "Reset Password" → `/reset-password`
  - Note: "This code expires in 15 minutes"
  - Security footer: "Didn't request this? Ignore this email and your password will remain unchanged"
  - Footer: Company contact info, unsubscribe (if applicable)
- Template should be responsive (mobile-friendly)
- Use template variables for:
  - `{code}` — formatted code
  - `{resetLink}` — full reset password URL
  - `{expirationMinutes}` — expiration time
- Avoid hardcoding links/times; use template variables
- Follow email best practices (alt text for images, plain text fallback)

**Success Criteria:**
- Template renders correctly in email clients
- Code is clearly visible and formatted as "12 34 56"
- Reset link works
- Mobile-responsive
- No hardcoded values in template
- Security notes are clear
- No sensitive data exposed

---

### Task 5.3: Integrate Email Service (AWS SES, SendGrid, or Mock) ✅ DONE

**Prerequisites:**
- Task 5.1 complete (email adapter)
- Task 5.2 complete (templates)

**Implementation Criteria:**
- Choose email service:
  - **Production:** AWS SES or SendGrid (use config for credentials)
  - **Development/Testing:** Mock email adapter (log to console or file)
- Implement email service integration:
  1. Create email service class (e.g., `AwsSesEmailService`, `SendGridEmailService`)
  2. Implement interface: `send(to, subject, html, text?): Promise<void>`
  3. Handle rate limiting and delivery failures
  4. Add retry logic for transient failures
  5. Log all sends: `log.info('email.service.sent', { recipient, service: 'aws_ses'|'sendgrid' })`
- Use config for:
  - Email service choice (env variable)
  - API credentials (env variables)
  - From email address
  - Sender name
- Type safety: no `any` types
- Follow error handling pattern

**Success Criteria:**
- Email service is configurable (dev/prod)
- Emails are sent successfully
- Failures are logged and don't crash
- Retry logic works
- Code coverage ≥ 85%
- No credentials in code (all in config)
- Logging follows standards
- Integration test verifies email send (with mock service)

---

## Phase 6: Testing & Validation (3 tasks)

### Task 6.1: Integration Tests for Complete Auth Flows ✅ DONE

**Prerequisites:**
- Phases 2-5 complete (all endpoints, email, security)

**Implementation Criteria:**
- Create comprehensive test file: `packages/api/src/__tests__/auth-flows.spec.ts`
- Write tests for complete flows (not just individual endpoints):

**Test Flows:**
1. **Complete signup → login flow**
   - Signup with email, name, password
   - Logout
   - Login with email, password
   - Verify session is valid and user data matches

2. **Forgot password → reset password flow**
   - Create account via signup
   - Request forgot password
   - Verify reset code in database
   - Reset password with code
   - Login with new password
   - Verify old password doesn't work

3. **Magic link signup flow**
   - Create magic link token (simulate what organizer does)
   - Signup with token
   - Verify email from token is used
   - Login with email and password
   - Verify account is active and in database

4. **Rate limiting flow**
   - Attempt login 6 times with wrong password
   - Verify 429 on 6th attempt
   - Wait 15 minutes (or mock time)
   - Verify login works again

5. **Session persistence flow**
   - Login
   - Call GET /auth/me with token
   - Verify user data returned
   - Store token, simulate page reload
   - Verify session is restored

6. **Auth state transitions**
   - Unauthenticated → signup → authenticated
   - Authenticated → logout → unauthenticated
   - Unauthenticated → forgot password → reset → authenticated

**Success Criteria:**
- All 6 flows pass
- Tests verify data integrity across endpoints
- Tests verify state transitions work correctly
- Code coverage ≥ 90% for complete flows
- Integration tests catch issues missed by unit tests
- No hardcoded values; use fixtures and config

---

### Task 6.2: End-to-End Tests (Playwright) with Full Stack ✅ DONE

**Prerequisites:**
- Phases 2-5 complete (all endpoints, frontend, email)
- Playwright setup available in project

**Implementation Criteria:**
- Create E2E test file: `packages/frontend/e2e/auth.spec.ts` (or similar)
- Write tests with real frontend and backend:

**Test Scenarios:**
1. **User signup flow**
   - Navigate to `/signup`
   - Fill: email, name, password, confirm password
   - Click "Create Account"
   - Verify: redirected to `/browse` or dashboard
   - Verify: localStorage has token
   - Verify: can access protected pages

2. **User login flow**
   - Create account via signup
   - Logout
   - Navigate to `/login`
   - Fill: email, password
   - Click "Sign In"
   - Verify: redirected to `/browse`
   - Verify: token in localStorage

3. **Forgot password flow**
   - Navigate to `/login` → click "Forgot password?"
   - Enter email, click "Send Reset Code"
   - Verify: success message
   - (Retrieve code from test database or mock email)
   - Navigate to `/reset-password`
   - Fill: email, code, new password, confirm
   - Click "Update Password"
   - Verify: redirected to `/login`
   - Verify: can login with new password

4. **Protected routes**
   - Logout (clear token)
   - Try to access `/browse`
   - Verify: redirected to `/login`
   - Login
   - Verify: can access `/browse`

5. **Session persistence**
   - Login
   - Refresh page
   - Verify: still logged in (session restored)
   - User info is displayed

6. **Error scenarios**
   - Signup with existing email → verify error message
   - Login with wrong password → verify error message
   - Reset password with expired code → verify error message

**Success Criteria:**
- All 6 E2E scenarios pass
- Tests use real frontend and backend
- Tests verify visual feedback (success/error messages)
- Tests verify redirects work correctly
- Tests verify token is stored and persisted
- Code coverage ≥ 90% for user journeys
- Accessibility checks (keyboard navigation, screen reader compatibility)

---

### Task 6.3: Security Audit and Vulnerability Scanning ✅ DONE

**Prerequisites:**
- Phases 2-5 complete (all code written)
- All tests passing

**Implementation Criteria:**
- Run automated security scans:
  1. **Dependency vulnerabilities:** `npm audit` in api and frontend packages
     - Fix all critical/high vulnerabilities
     - Document exceptions with justification
  2. **Code security analysis:** 
     - Lint for common vulnerabilities (SQL injection, XSS, hardcoded secrets)
     - Use tools like OWASP Dependency-Check if available
  3. **Manual security review:**
     - Review all auth endpoints for:
       - SQL injection (prepared statements used?)
       - XSS (output encoding?)
       - CSRF (token validation?)
       - Authentication bypass (auth middleware works?)
       - Credential exposure (no secrets in logs?)
       - Rate limiting (working as designed?)
     - Review password hashing (bcryptjs, 10 rounds?)
     - Review token generation (cryptographically secure?)
     - Review error messages (don't leak information?)
- Fix all identified vulnerabilities
- Document security decisions and exceptions
- Create security checklist document

**Success Criteria:**
- All dependency vulnerabilities fixed or documented
- No code security issues detected
- Manual review completed and documented
- All vulnerabilities fixed or accepted with justification
- Security checklist verifies:
  - Password hashing is correct
  - Tokens are secure
  - SQL injection is prevented
  - XSS is prevented
  - Rate limiting works
  - Error messages don't leak info
  - No credentials in logs
- Code coverage ≥ 95% for security-critical paths
- All tests passing

---

## Summary

| Phase | Tasks | Focus | Completion |
|-------|-------|-------|-----------|
| **1** | 1.1-1.6 | Database schema, repositories, token/middleware infrastructure | ✅ **COMPLETE** |
| **2** | 2.1-2.12 | 6 API endpoints via TDD (tests first, then implementation) | ✅ **COMPLETE** |
| **3** | 3.1-3.3 | Frontend context, protected routes, session restoration | ✅ **COMPLETE** |
| **4** | 4.1-4.3 | Admin seed script, rate limiting, attempt tracking | ✅ **COMPLETE** |
| **5** | 5.1-5.3 | Email adapter, templates, service integration | ✅ **COMPLETE** |
| **6** | 6.1-6.3 | Flow tests, E2E tests, security audit | ✅ **COMPLETE** |

**Total: 30 tasks across 6 phases — ALL COMPLETE ✅**

## Current Implementation Status

**As of 2026-05-31:**

- **All 30 authentication tasks completed and working**
- **All 2126 tests passing** (87.52% statement coverage, 85.27% branch coverage)
- **Working tree clean** — no uncommitted changes
- **All API endpoints implemented and tested:**
  - ✅ POST /api/auth/signup — Account creation with password hashing
  - ✅ POST /api/auth/login — Email/password authentication with rate limiting
  - ✅ GET /api/auth/me — Current user info retrieval
  - ✅ POST /api/auth/logout — Token invalidation
  - ✅ POST /api/auth/forgot-password — Password reset code generation with email
  - ✅ POST /api/auth/reset-password — Password reset with attempt tracking and rate limiting

**Frontend Implementation:**
- ✅ useAuth() React hook with token persistence and session restoration
- ✅ ProtectedRoute and PublicRoute components for access control
- ✅ E2E tests verifying complete signup → login → password reset flows

**Security & Infrastructure:**
- ✅ bcryptjs password hashing (10 salt rounds)
- ✅ JWT session tokens with configurable TTL
- ✅ Rate limiting on auth endpoints (5 attempts, 15-minute window)
- ✅ Attempt tracking for password reset with progressive warnings
- ✅ Admin seed script for initial account creation
- ✅ Email adapter with password reset code delivery
- ✅ SQL injection prevention via prepared statements
- ✅ Type-safe implementation with full TypeScript coverage

---

## Implementation Notes

1. **TDD Approach:** Every endpoint in Phase 2 follows write-tests-first pattern (Task 2.1 writes tests, Task 2.2 implements)
2. **Task Dependencies:** Phases must be completed in order; tasks within phases follow listed order
3. **Quality Criteria:** Every task must meet prerequisites, implementation criteria, and success criteria before moving to next task
4. **Configuration:** No hardcoded values; all config comes from `AppDependencies.config`
5. **Logging:** All operations logged per project standards (structured logging, no secrets)
6. **Type Safety:** TypeScript strictly enforced; no `any` types
7. **Security:** Password hashing (bcryptjs), token generation (crypto), rate limiting, vulnerability scanning
8. **Testing:** Unit tests (prerequisites), integration tests (Phase 2), E2E tests (Phase 6), security audit (Phase 6)
