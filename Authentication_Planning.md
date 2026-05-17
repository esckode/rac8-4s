# Authentication Planning Document

## Overview

This document captures the complete authentication design for the C.U.At.Court webapp, covering player auth implementation with a forward-compatible schema for organizer and admin authentication.

---

## Authentication Model

### Three-Tier Role System
- **Admin:** Creates organizer accounts, views analytics (future)
- **Organizer:** Creates tournaments, manages brackets and groups
- **Player:** Registers for tournaments, submits scores, views standings

All three roles share a single `accounts` table with a `role` column. No separate tables per role — simplifies auth logic and keeps login flow unified.

### Account Activation Flow

**For new users (first-time signup via invite):**
1. Organizer or existing player provides new user's email → system sends magic link invite
2. User clicks magic link → lands on `/setup-account?token=xxx`
3. User enters: name (required), email (pre-filled, read-only), password
4. System activates account (`status: 'active'`, hashes password, sets session cookie)
5. User is logged in, account is complete

**For returning users (password-based login):**
1. User navigates to `/login`
2. User enters email + password
3. System validates against `accounts.password_hash`
4. Session cookie issued, user is logged in

**Password recovery:**
1. User clicks "Forgot password" → `/forgot-password`
2. User enters email → system sends magic link
3. Same flow as new user setup (click link, set new password)
4. No separate "reset password" page — reuses the setup flow

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
2. Middleware reads `req.cookies.session` and validates against `SQLiteTokenStore`
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

### Auth Routes (`/auth/`)

| Endpoint | Method | Auth | Input | Output | Notes |
|----------|--------|------|-------|--------|-------|
| `/login` | POST | None | `{ email, password }` | 200 + session cookie | Existing account with password |
| `/logout` | POST | Session | None | 204 | Clears session cookie |
| `/me` | GET | Session | None | 200 `{ id, email, role, name }` | Restores session on page load |
| `/setup` | POST | None | `{ token, name, password }` | 200 + session cookie | Magic link → activate account |
| `/magic-link` | POST | None | `{ email }` | 202 | Sends magic link (forgot password or re-invite) |

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
- `/browse` — Browse tournaments (public list, registration forms)
- `/login` — Email + password login
- `/setup-account?token=xxx` — Account setup after magic link
- `/forgot-password` — Password recovery initiation

### Protected Routes (auth required)
- `/my-tournaments` — Player's registered tournaments
- `/organizer` — Organizer dashboard (organizers only)
- `/tournaments/:id` — Tournament details (role-based rendering)
  - `/standings` — Standings table (role-based filters)
  - `/matches` — Match list + score submission
  - `/bracket` — Player or organizer bracket view
  - `/groups` — Group management (organizer only)

**Auth gating:** Routes check `useAuth().isAuthenticated` and `user.role` before rendering. Unauthenticated users redirected to `/login`. Unauthorized users (e.g., player accessing organizer dashboard) shown error.

---

## Admin Bootstrapping

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

### Unit Tests
- Password hashing/verification
- Token generation/validation
- Magic link token lifecycle (single-use enforcement)

### Integration Tests
- Full auth flow: magic link → setup account → login
- Session persistence and rolling re-issue
- CORS credential handling
- Protected routes reject unauthenticated requests

### E2E Tests
- User clicks email link → lands on setup page → sets password → logged in
- User logs in with email + password → redirected to dashboard
- User logs out → session cleared, redirected to login
- Session survives page refresh
- Session expires after 30 days

---

## Known Gaps & Future Work

1. **Organizer login endpoint** — designed but not implemented. Uses same schema, will be a small addition.
2. **Admin panel** — for creating/managing organizer accounts. Currently only seed script.
3. **Rate limiting** — on `/login`, `/magic-link`, `/setup` to prevent brute force.
4. **Email verification** — could require email verification before account fully active. Optional.
5. **Two-factor authentication** — post-MVP, if needed.
6. **Social login** — (Google, etc.) post-MVP.
7. **Session expiration UX** — "Your session expired" toast before logout. Future improvement.

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

## Summary

This plan establishes a **single-tier auth system** for players with a forward-compatible schema for organizers and admins. Key design choices:

- **Magic links for activation, passwords for login** — low-friction UX for invites, secure for repeat logins
- **httpOnly cookies** — immune to XSS, standard practice
- **Rolling 30-day sessions** — users stay logged in as long as they're active
- **SQLiteTokenStore for sessions, InMemoryTokenStore for magic links** — simple, correct separation of concerns
- **Unified login flow** — same `/login` for all roles

The schema, middleware, and API routes are role-agnostic — adding organizer/admin login is a matter of creating accounts and leveraging the same session/middleware layer. No architectural changes needed.
