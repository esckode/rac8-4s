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

**"For the right reason" means reading the actual failure.** In the red phase, keep the assertion message and stack in view — a pass/fail summary is not enough to tell a correct red from a typo, a bad import, or a suite that never ran. The output-filtering rules in §12 are deliberately relaxed for this one step; tighten them again once the test is green.

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
4. **Runs tests** — headless and targeted; see the command table below
5. **Reviews results** — reads the line-reporter output, then failure screenshots/video
6. **Debugs failures** — documents troubleshooting steps for common issues

**Quick commands (use after `/e2e-testing` workflow):**
- Check prerequisites: `node scripts/e2e-setup.js`
- Auto-start missing servers: `node scripts/e2e-setup.js --auto-start`
- **Default run (one spec, one browser):**
  `npx playwright test <spec>.spec.ts --project=chromium --reporter=line --max-failures=1`
- Full sweep, both browsers — **final verification only**: `npm run test:e2e -- --reporter=line`
- Named specs already wired: `test:e2e:auth`, `test:e2e:tournament`, `test:e2e:chromium`

**Always pass `--reporter=line`.** `playwright.config.ts` sets `reporter: 'html'`, which writes a report directory instead of readable stdout and will try to serve it on failure — that blocks a non-interactive run. On failure, `screenshot: 'only-on-failure'` and `video: 'retain-on-failure'` are already captured in `test-results/`; `trace: 'on-first-retry'` means a trace only exists if the run retried.

**`test:e2e:ui` and `test:e2e:debug` are human-only.** `--ui` opens a GUI and `--debug` opens the Inspector paused on the first line; both hang forever when invoked non-interactively. Never run them from an agent session — suggest them to the user instead.

**Test file locations:**
- E2E tests: `packages/frontend/e2e/auth.spec.ts`
- Browser validation script: `scripts/browser.js`
- Setup helper: `scripts/e2e-setup.js`

**Important:** E2E tests require both servers running:
- Backend API on port 3001 (requires PostgreSQL)
- Frontend dev server on port 5173
- **`npm run dev:worker --workspace=packages/api`** — required in addition to the
  above for any assistant/coach/nudge/recap/digest spec (`assistant*.spec.ts`,
  `coach.spec.ts`, `personalization-availability.spec.ts`,
  `personalization-quiet-hours.spec.ts`). This repo's dev/e2e default is
  `JOB_QUEUE=bullmq`, which routes @coach replies and the Phase C sweeps through a
  queue consumer instead of an inline in-process call — without the worker running,
  these specs fail with confusing errors (a reply that never appears, or a
  `/test/*-sweep` trigger 500ing) rather than an obvious "not running". Checked
  automatically by `scripts/e2e-setup.js`.

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
- **User-visible behavior changes must update `docs/assistant-help.md` in the same change** — it is the @coach assistant's help corpus, loaded into the system prompt.

## 10. API Route Ordering

Express matches routes in registration order. **Register literal/static paths before parameterized ones** so a param doesn't shadow them — e.g. `GET /tournaments/:id` must come after `/tournaments/public`, `/tournaments/available`, and `/tournaments/organizer`.

## 11. Git & Commits

- Commit **only when asked**. If on the default branch (`main`), **create a branch first**.
- **One logical change per commit** — don't mix verified fixes with new or intentionally-failing work.
- **TDD history:** commit failing tests as their own commit, then the implementation as the next.
- **Run the relevant test suite before merging** — the specs covering the change, not the whole suite; save the full run for the final pass. Prefer fast-forward merges.
- End commit messages with the `Co-Authored-By` trailer.

## 12. Context & Output Discipline

**The whole conversation is re-sent on every turn.** A 15k-token test dump isn't a one-off cost — it stays in the window for every remaining turn and pulls the session toward compaction. So the goal is not "read output efficiently", it's **keep output out of context in the first place**.

**Redirect, then filter.** Write full output to the scratchpad and query it; the detail stays on disk if it's needed later.
```bash
npx jest path/to/foo.test.ts > "$SCRATCH/run.log" 2>&1; \
  grep -E "Tests:|Suites:|✕" "$SCRATCH/run.log" | head -40
```
**`2>&1` is required** — jest writes to stderr, so a bare `| grep` or `| tail` silently passes everything through unfiltered. Same idiom as the §6 logging verification. (`$SCRATCH` = the session scratchpad directory, or any path outside the repo — don't litter the working tree.)

**Filter by TDD phase (see §4):**
- **Red** — need the reason it failed: `grep -B2 -A15 "●" "$SCRATCH/run.log"`
- **Green / regression** — need only the verdict: `grep -E "Tests:|Suites:"`

**Scope every run to the change.** One spec file per iteration; `--project=chromium` for e2e; full suite once at the end (§11). Prefer `--bail` / `--max-failures=1` — failure #1 is actionable, failures #2–30 are usually the same root cause reprinted.

**Reading files:**
- `Grep` with `-C 3` to find a symbol; `Read` with `offset`/`limit` for a known region. Whole-file reads are a last resort.
- **Never re-read a file to verify an edit** — `Edit` errors if it fails, so the read is pure cost.
- Batch independent tool calls into one block; fewer turns means fewer full-context re-sends.
- Background slow or noisy commands (server starts, e2e sweeps) and inspect only the tail.

**Partition long multi-item work.** For a queue of issues, don't carry all of them in one context — issue 14 pays for issues 1–13. After each item, append a short status block (files touched, tests added, state) to the tracking doc and treat that file as the handoff. A fresh context then costs one `Read` instead of the entire history.

## 13. Coverage Floors

**The numbers in `packages/*/jest.config.js` are measured actuals, not aspirations.** Each `coverageThreshold` records what the suite genuinely covered on the date in the comment above it. They exist to catch regressions, so they are **raise-only**.

**Thresholds are only enforced per-workspace.** `coverageThreshold` is a Jest *global-only* option — it is silently dropped from project configs in a `projects:` setup. A root-level `npx jest --coverage` therefore enforces **nothing**. `npm run test:coverage` delegates to the workspaces for exactly this reason; don't "simplify" it back into a single root run.

**Don't change `coverageProvider`.** The floors are `babel` numbers. v8 reports differently, so switching providers invalidates every floor at once — re-measure the whole repo if you ever do.

**Raising them:**
```bash
node scripts/ratchet-coverage.mjs           # dry run — shows what could be raised
node scripts/ratchet-coverage.mjs --write   # applies it
```
Run it after work that meaningfully improves coverage, and commit the bump with that work. It re-runs each suite with thresholds pinned to 100 and reads Jest's own reported actuals, then floors them and backs off one point.

**Coverage here is not perfectly deterministic.** Repeat runs of an unchanged tree have produced different numbers — `src/workers/sw-lib/sync-queue.ts` has been seen at both 93.75% and 100% branch coverage. That is why the ratchet keeps a margin: without one, a lucky run sets a floor that the next ordinary run fails. **Treat a metric that swings by more than a point as a flaky test to fix, not a threshold to loosen.** If you widen the margin instead, the gate stops meaning anything.

**Lowering a floor is allowed but never silent.** Deleting well-covered code drops the percentage through no fault of the change. When that happens, lower the number and say why in the commit message. A floor that drops without explanation is a regression that someone edited the gate to hide.

