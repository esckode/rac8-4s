# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**Tests come first (TDD).** For features and behavior changes, write/update the tests — unit *and* e2e — and the scenario docs (`e2e-scenarios.md`) before implementing. Confirm they fail for the right reason, then make them pass. Commit the failing tests separately from the implementation (see §11).

## 5. Skill organization

Skills are organized into bucket folders under `skills/`:

- `engineering/` — daily code work
- `productivity/` — daily non-code workflow tools
- `misc/` — kept around but rarely used
- `personal/` — tied to my own setup, not promoted
- `deprecated/` — no longer used

Every skill in `engineering/`, `productivity/`, or `misc/` must have a reference in the top-level `README.md` and an entry in `.claude-plugin/plugin.json`. Skills in `personal/` and `deprecated/` must not appear in either.

Each skill entry in the top-level `README.md` must link the skill name to its `SKILL.md`.

Each bucket folder has a `README.md` that lists every skill in the bucket with a one-line description, with the skill name linked to its `SKILL.md`.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 6. Logging Standards

All API route handlers and services must follow the structured logging pattern established in `packages/api/src/logger.ts`.

**Logger setup** — import and create a module-level logger at the top of each file:
```typescript
import { getLogger } from '../logger'
const log = getLogger('module-name')
```

**Log levels:**
- `debug` — routine operations, read-only routes (already covered by HTTP request/response middleware)
- `info` — state changes: anything that writes to the database or transitions status
- `warn` — expected failures: auth errors, validation errors, client mistakes
- `error` — unexpected failures: unhandled exceptions, 5xx server errors

**What to log at `info` for every state-changing route:**
- Call `log.info('event.name', ctx)` immediately before the success `res.status(...).json(...)` response
- Always include: `tournamentId` (when in scope), actor identity (`organizerId: payload.sub` or `playerId: payload.playerId`)
- Never include: tokens, passwords, full request bodies, or PII beyond IDs

**Event naming convention:** `noun.verb` in past tense — e.g. `tournament.created`, `score.submitted`, `bracket.published`

**Correlation IDs are automatic** — `requestId` is injected into every log entry via `AsyncLocalStorage`. No need to pass it explicitly. All logs from a single request automatically share the same `requestId`, enabling easy trace filtering.

**Read-only routes:** no additional logging needed — HTTP request/response middleware logs them at `debug` level automatically.

**Verification:** `LOG_LEVEL=debug npm start | grep '"requestId":"<id>"'` to trace a single request through all modules.

## 7. Database

This project uses **PostgreSQL 15+** for all persistent data storage. See [README.md](./README.md) for database setup instructions, including Docker configuration and local PostgreSQL installation options.

**Key details:**
- Two schemas: `public` (tournament data) and `auth` (authentication)
- Connection configured via environment variables
- Requires Docker or local PostgreSQL installation before running the application

**Test isolation (integration tests):**
- Integration tests run through the transactional test harness (`getTestPool()` in `packages/api/src/__tests__/helpers/db.ts`), which routes every query through one per-suite connection and rolls it back. **Never autocommit or write directly to the shared DB in tests** — a full run must leave row counts unchanged.
- Repository methods that need a transaction use plain `this.pool.connect()` + `BEGIN/COMMIT/ROLLBACK`. In production `this.pool` is a real Pool; in tests the harness proxy translates these to savepoints (and wraps each bare statement in a savepoint so a single error can't poison the suite). **Do not reintroduce test-only branching (e.g. `isPoolClient`) in `db.ts`.**

## 8. End-to-End Testing

**When the user asks to run e2e tests, run the `/e2e-testing` skill.** This skill guides the complete workflow for running browser-based e2e tests.

The skill workflow:
1. **Validates prerequisites** — checks if backend API and frontend dev servers are accessible
2. **Starts missing servers** — optionally auto-starts API or frontend if not running
3. **Validates frontend** — uses `node scripts/browser.js` to verify the webapp loads with persistent browser state
4. **Runs tests** — provides commands for headless, UI, or debug modes
5. **Reviews results** — guides analysis of test failures and HTML reports
6. **Debugs failures** — documents troubleshooting steps for common issues

**Quick commands (use after `/e2e-testing` workflow):**
- Check prerequisites: `node scripts/e2e-setup.js`
- Auto-start missing servers: `node scripts/e2e-setup.js --auto-start`
- Run tests headless: `npm run test:e2e`
- Run tests with UI: `npm run test:e2e:ui` (recommended for debugging)
- Run tests in debug mode: `npm run test:e2e:debug`

**Test file locations:**
- E2E tests: `packages/frontend/e2e/auth.spec.ts`
- Browser validation script: `scripts/browser.js`
- Setup helper: `scripts/e2e-setup.js`

**Important:** E2E tests require both servers running:
- Backend API on port 3001 (requires PostgreSQL)
- Frontend dev server on port 5173

**E2E conventions** (details in `packages/frontend/e2e/README.md`):
- **Seed your own data** via the fixtures (`createTournamentWithOpenRegistration`, `getOrganizerToken`, …) — never depend on ambient DB state.
- Select with **`data-testid` and the constants in `e2e/config.ts`**, not emoji/`role` guesses.
- Use **unique test data** (e.g. a random email suffix) so parallel browser projects don't collide.
- **Authenticate before visiting protected routes.** `/browse` and `/tournament/:id/browse` are public; `/matches`, `/standings`, and tournament detail require auth.
- `TEMPLATE.spec.ts` is a scaffold, excluded via `testIgnore` — copy it to a real filename to use it.

## 9. Frontend & Routing

**`rac8-4s-HL.md` is the source of truth for product behavior and route access (public vs protected).** Keep frontend routes aligned with it:
- Tournament **discovery is public**: `/browse` and `/tournament/:id/browse` (details + guest registration by email → magic link). `POST /tournaments/:id/register` is public.
- Auth-gated: `/matches`, `/standings`, tournament detail/admin.
- When you change a route's protection, **update the security tests in the same change** (`auth.spec.ts` + `route-protection.spec.tsx`), and use a still-protected route (e.g. `/matches`) as the example in "must redirect to login" tests.
- **New top-level API mounts must be added to the CloudFront behavior list** in `infra/modules/frontend` (see `IaC-implementation.md` Step 6) — otherwise the path silently routes to S3 and returns HTML instead of JSON.

## 10. API Route Ordering

Express matches routes in registration order. **Register literal/static paths before parameterized ones** so a param doesn't shadow them — e.g. `GET /tournaments/:id` must come after `/tournaments/public`, `/tournaments/available`, and `/tournaments/organizer`.

## 11. Git & Commits

- Commit **only when asked**. If on the default branch (`main`), **create a branch first**.
- **One logical change per commit** — don't mix verified fixes with new or intentionally-failing work.
- **TDD history:** commit failing tests as their own commit, then the implementation as the next.
- **Run the relevant test suite before merging**; prefer fast-forward merges.
- End commit messages with the `Co-Authored-By` trailer.

