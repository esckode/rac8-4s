---
name: E2E Testing
description: Run the automated Playwright e2e suite for rac8-4s — check prerequisites, start servers, select the right specs, run them with agent-safe flags, and read the results. Use when asked to run e2e tests, verify a change end-to-end, or investigate a failing spec. NOT for a manual click-through of the app — that is the frontend-testing skill.
---

# E2E Testing Workflow

Owns the automated Playwright path: **prerequisites → servers → select specs → run → read
results.** Authority for the rules below is `CLAUDE.md` §8 (e2e), §11 (which specs a change
needs) and §12 (output discipline). Where this file and CLAUDE.md ever disagree, CLAUDE.md
wins — say so and follow it.

For standing the app up and clicking through it with the user, use the `frontend-testing`
skill instead.

All paths below are relative to the repository root — run every command from there. Specs
live in `packages/frontend/e2e/` (45 of them).

---

## The three rules that break a run if you miss them

1. **Always pass `--reporter=line`.** `playwright.config.ts:15` sets `reporter: 'html'`,
   which writes a report directory instead of readable stdout and tries to *serve* it on
   failure — that blocks a non-interactive run forever.
2. **Never run `test:e2e:ui`, `test:e2e:debug`, or any `:ui` / `:debug` variant.** `--ui`
   opens a GUI; `--debug` opens the Inspector paused on line 1. Both hang forever in an
   agent session. They are human-only — suggest them to the user, never run them.
3. **Redirect output to the scratchpad and grep it.** A full run's stdout is thousands of
   lines and stays in context for every remaining turn (§12).

`$SCRATCH` below means your session scratchpad directory — the absolute path from your
system prompt. **It is not an environment variable**; write the full path into every
command or the redirect fails with `Permission denied`.

---

## 1. Prerequisites

```bash
node scripts/e2e-setup.js
```
Add `--auto-start` to start whatever is missing.

It checks: PostgreSQL, API (3001), frontend (5173), **worker**, and the register
rate-limit override.

⚠ **Its PostgreSQL line gives a false `❌`** when the Docker container is up and healthy
(it shells out to a `psql` client not installed on the host). Confirm with:
```bash
docker ps --format '{{.Names}}\t{{.Status}}'
```
Expect `tournament_app_postgres` and `tournament_app_redis`, both `(healthy)`. If missing:
`docker compose up -d postgres redis`.

**The worker is mandatory, not optional.** This repo's dev/e2e default is
`JOB_QUEUE=bullmq`, so @ref replies and the Phase C sweeps go through a queue consumer
instead of an inline call. Without it, `assistant*.spec.ts`, `coach.spec.ts`,
`personalization-availability.spec.ts` and `personalization-quiet-hours.spec.ts` fail with
confusing errors — a reply that never appears, or a `/test/*-sweep` trigger 500ing —
rather than an obvious "not running":
```bash
npm run dev:worker --workspace=packages/api > /ABSOLUTE/PATH/TO/scratchpad/worker.log 2>&1
```

Start servers (each as its own **background** Bash call, full absolute log path):
```bash
npm run dev --workspace=packages/api      > /ABSOLUTE/PATH/TO/scratchpad/api-dev.log 2>&1
npm run dev --workspace=packages/frontend > /ABSOLUTE/PATH/TO/scratchpad/fe-dev.log  2>&1
```

Poll until ready — never a bare foreground `sleep`:
```bash
for i in 1 2 3 4 5 6 7 8; do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3001/health)
  [ "$code" = "200" ] && break
done; echo "api:$code"
```

## 2. Optional — validate the frontend loads

```bash
node scripts/browser.js
```
Launches Chromium with persistent state in `.browser-data/`, loads `localhost:5173`,
reports console/network errors, screenshots to `/tmp/localhost-5173.png`. It **auto-closes**
— that is the difference from `frontend-testing`'s `open-app.mjs`, which stays open.

## 3. Select which specs to run

**Do not recall specs from memory — select them.** §11 owns this.

- **Primary source: the selection map** in `e2e-scenarios.md` § "Test Organization"
  (~line 157). It maps feature → spec, and is maintained precisely so the right spec gets
  picked. Adding a spec means adding its row in the same change.
- **Route protection changed?** Add `auth.spec.ts` (§9).
- **Nothing matches?** Grep for what you touched:
  ```bash
  grep -rl "<route-or-testid>" packages/frontend/e2e/*.spec.ts
  ```
  39 of the specs pull selectors from `e2e/config.ts`, so the string is usually findable.

There is no import graph from the frontend specs to the API, so `--findRelatedTests` does
**not** work here. That is a jest tool — see §11 for the unit/integration side.

## 4. Run

**Default while iterating — one spec, one browser:**
```bash
npx playwright test <name>.spec.ts --project=chromium --reporter=line --max-failures=1 \
  > /ABSOLUTE/PATH/TO/scratchpad/e2e.log 2>&1
grep -E "passed|failed|✘|Error:" /ABSOLUTE/PATH/TO/scratchpad/e2e.log | head -30
```

`--max-failures=1` is deliberate: failure #1 is actionable, failures #2–30 are usually the
same root cause reprinted (§12).

**Full sweep, both browsers — merge gate only, not a per-task step:**
```bash
npm run test:e2e -- --reporter=line > /ABSOLUTE/PATH/TO/scratchpad/e2e-full.log 2>&1
grep -E "passed|failed|flaky|✘" /ABSOLUTE/PATH/TO/scratchpad/e2e-full.log | tail -40
```
Run it **once per branch before merging** (§11), backgrounded — it takes several minutes.

**Projects:** `chromium` and `firefox` both exclude `pwa-*.spec.ts`; a separate `pwa`
project runs those against a preview build on **port 4173**, not 5173. `TEMPLATE.spec.ts`
is scaffold and is ignored.

**Named scripts already wired:** `test:e2e:auth`, `test:e2e:tournament`,
`test:e2e:chromium`, `test:e2e:firefox`. Append `-- --reporter=line` to any of them.

## 5. Read the results

Filter by what you need (§12) — never dump the whole log:

| Situation | Command |
|---|---|
| Verdict only | `grep -E "passed\|failed" $LOG \| tail -5` |
| Which spec failed | `grep -E "✘\|✗" $LOG \| head -20` |
| Why it failed | `grep -B3 -A20 "Error:" $LOG \| head -60` |

On failure, artifacts already exist in `test-results/`:
- **Screenshot** — `screenshot: 'only-on-failure'`
- **Video** — `video: 'retain-on-failure'`
- **Trace** — `trace: 'on-first-retry'`, so a trace exists **only if the run retried**
  (`retries: 2`). Do not go looking for one after a single-attempt failure.

`Read` a screenshot directly; it renders. Do **not** try to `open playwright-report/` —
there is no browser to open it into, and generating it is what `--reporter=line` avoids.

## 6. Common failures

| Symptom | Cause | Fix |
|---|---|---|
| Run hangs, no output | Missing `--reporter=line`; html reporter is serving | Kill it, re-run with the flag |
| Assistant/coach reply never arrives; `/test/*-sweep` 500s | Worker not running | `npm run dev:worker --workspace=packages/api` |
| `RATE_LIMITED` on registration | Register rate-limit override not set | `node scripts/e2e-setup.js` — it reports the override |
| `ERR_CONNECTION_REFUSED :3001` / `:5173` | Server down | Start it; check the scratchpad log |
| `pwa-*.spec.ts` cannot connect | Needs the preview build on **4173**, not the dev server | Run the `pwa` project's own setup |
| Redirected to `/login` unexpectedly | Spec visits a protected route unauthenticated | `/browse` and `/tournament/:id/browse` are public; `/play`, `/matches`, `/standings`, `/groups`, `/profile`, `/coach`, tournament detail are not |
| Passes alone, fails in the full sweep | Known parallel-load flakiness | See `UAT_ISSUES.md` § "Still open" — untriaged, do not assume your change caused it |

## 7. Conventions when writing or fixing a spec

- **Seed your own data** via the fixtures (`createTournamentWithOpenRegistration`,
  `getOrganizerToken`, …). Never depend on ambient DB state.
- **Select with `data-testid` and the constants in `e2e/config.ts`** — not emoji or `role`
  guesses.
- **Use unique test data** (random email suffix) so parallel browser projects don't collide.
- **Authenticate before visiting protected routes.**
- **Adding a spec means adding its row to the selection map** in `e2e-scenarios.md` in the
  same change. That table is worthless once it drifts.
- `TEMPLATE.spec.ts` is a scaffold excluded via `testIgnore` — copy it to a real filename.
- Details: `packages/frontend/e2e/README.md`.

## Do NOT

- **Do not run any `:ui` or `:debug` script.** They hang forever. Suggest them to the user.
- **Do not omit `--reporter=line`.** Ever.
- **Do not pipe a run straight to `grep`/`tail` without `2>&1`** — output goes to stderr and
  a bare pipe passes it through unfiltered.
- **Do not run the full sweep while iterating.** One spec, `--project=chromium`, until green.
- **Do not `rm -rf .browser-data/`** unless asked — it holds a persistent login session.
- **Do not treat a full-sweep-only failure as your regression** without reproducing it in
  isolation first.
