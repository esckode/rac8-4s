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

## 5. Skills organization

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

