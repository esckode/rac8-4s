---
name: frontend-testing
description: Bring up the rac8-4s webapp (Postgres, API, frontend, worker) and open a headed browser that STAYS OPEN so the user can click through the app alongside you. Use for manual/visual walkthroughs, design review, UAT, reproducing a user-reported UI bug, or "start the app so I can look at it". NOT for running the automated Playwright suite — that is the e2e-testing skill.
---

# Frontend Testing — collaborative manual walkthrough

Stand up the app and hand the user a live browser window. The user drives and looks;
you watch the error log, inspect routes headlessly, and answer questions.

**This skill is for the human-in-the-loop path.** For running the automated Playwright
specs, use the `e2e-testing` skill instead.

All paths below are relative to the repository root — run every command from there.

---

## Vocabulary used below

- **`$SCRATCH`** = your session scratchpad directory (the absolute path in your system
  prompt, e.g. `/tmp/claude-.../scratchpad`).
  **It is NOT an environment variable — the shell will expand it to nothing.** Write the
  full absolute path into every command. Getting this wrong writes to `/` and fails with
  `Permission denied`.
- **background** = the Bash tool's `run_in_background: true`. Not a trailing `&`.

---

## Step 1 — Postgres and Redis

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
```

Expect `tournament_app_postgres` and `tournament_app_redis`, both `(healthy)`.

If either is missing:
```bash
docker compose up -d postgres redis
```

⚠ **Do not trust `scripts/e2e-setup.js`'s PostgreSQL line.** It reports
`❌ PostgreSQL not running` even when the container is up and healthy (it shells out to a
`psql` client that is not installed on the host). `docker ps` is the authority. The
script's API / frontend / worker / rate-limit lines are reliable.

## Step 2 — Start the servers

Check what is already up before starting anything:

```bash
curl -s -o /dev/null -w "api:%{http_code}\n" --max-time 3 http://localhost:3001/health
curl -s -o /dev/null -w "fe:%{http_code}\n"  --max-time 3 http://localhost:5173/
```

`200` means it is already running — **do not start a second one**, the port bind will fail.

Start whichever is missing, each as its own **background** Bash call, redirecting to the
scratchpad (full absolute path — see Vocabulary):

```bash
npm run dev --workspace=packages/api > /ABSOLUTE/PATH/TO/scratchpad/api-dev.log 2>&1
```
```bash
npm run dev --workspace=packages/frontend > /ABSOLUTE/PATH/TO/scratchpad/fe-dev.log 2>&1
```

**The worker is required** for anything touching @ref / Coach / group chat / nudges /
recaps / digests. This repo defaults to `JOB_QUEUE=bullmq`, so without it those replies
never arrive and the failure looks like a hung UI, not a missing process:
```bash
npm run dev:worker --workspace=packages/api > /ABSOLUTE/PATH/TO/scratchpad/worker.log 2>&1
```

Wait for readiness with a poll loop (never a bare foreground `sleep`):

```bash
for i in 1 2 3 4 5 6 7 8; do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3001/health)
  [ "$code" = "200" ] && break
done; echo "api:$code"
curl -s -o /dev/null -w "fe:%{http_code}\n" --max-time 3 http://localhost:5173/
```

If a server fails to start, read the tail of its log in the scratchpad — do not guess.

## Step 3 — Open the browser and leave it open

```bash
ERR_LOG=/ABSOLUTE/PATH/TO/scratchpad/manual-browser-errors.log node scripts/open-app.mjs
```

Run this as a **background** Bash call. `open-app.mjs` never exits by design — it holds the
window open until the user closes it. A foreground call will hang your turn.

Confirm it opened:
```bash
tail -3 /ABSOLUTE/PATH/TO/scratchpad/manual-browser-errors.log
```
Expect `Opening http://localhost:5173/` then `Loaded. Title: C.U.At.Court`.

Optional env: `APP_URL=http://localhost:5173/groups` to land on a specific route.

**Then tell the user the window is open and hand over.** Do not keep clicking.

## Step 4 — While the user drives

You have two jobs: watch for errors, and inspect on request.

**Watch the error log.** `open-app.mjs` records console errors, page errors, failed
requests and any HTTP ≥ 400:
```bash
tail -20 /ABSOLUTE/PATH/TO/scratchpad/manual-browser-errors.log
```

**Inspect a route without touching the user's window** — headless, separate browser:
```bash
node scripts/inspect-route.mjs /play --width=400
node scripts/inspect-route.mjs /login / --width=400          # compare two routes
node scripts/inspect-route.mjs /groups --sel='[data-testid=nav-play]'
node scripts/inspect-route.mjs /browse --shot=/ABSOLUTE/PATH/TO/scratchpad/browse.png
```
It dumps the layout width chain (body → widest child → …), so a route with unexpected
side gutters shows exactly which element introduces them. `--shot` writes a screenshot you
can then `Read`.

⚠ `inspect-route.mjs` uses a **fresh, unauthenticated context**. It cannot see logged-in
pages. For anything behind auth, ask the user what they see, or read the API directly with
`curl` and a token.

## Step 5 — Stopping

Only when the user asks. The browser closes when they close the window. To stop a server,
kill the **`tsx watch` parent**, not the child:
```bash
ss -ltnp 2>/dev/null | grep 3001          # find the pid
ps -p <pid> -o ppid=                       # its parent is the tsx watch process
kill <parent-pid>
```

---

## Test accounts

All password `testpass123`. Seeded by `packages/api/scripts/seed-test-accounts.ts`, and
re-created automatically on every dev API boot when `NODE_ENV=development`.

| Email | Role |
|---|---|
| `organizer@test.com` | organizer |
| `player@test.com` | player |
| `sunil@test.com` `vimal@test.com` `anil@test.com` `raj@test.com` `sudhakar@test.com` `sasi@test.com` | player |

Restore them after a DB reset:
```bash
npm run seed:accounts --workspace=packages/api
```
Expect `seed:accounts ok — 8 accounts present`. Anything else is a real failure; it exits
non-zero and prints which accounts failed.

Check account state directly:
```bash
docker exec tournament_app_postgres psql -U tournament_user -d tournament_app \
  -c "select a.email, p.name, (a.player_id is not null) as linked
      from auth.accounts a left join public.players p on p.id = a.player_id
      where a.email like '%@test.com' order by a.created_at;"
```
`linked = f` means the account has no player and will hit a `TOKEN_INVALID` loop on every
player-scoped page. Do not walk through with such an account.

---

## Gotchas that have actually cost time here

- **The Playwright MCP does not work on this machine.** It is configured for the Google
  Chrome channel, which is not installed, and `npx playwright install chrome` needs sudo.
  Use the `scripts/*.mjs` helpers with snap Chromium (`/snap/bin/chromium`). Do not try to
  fix the MCP.
- **`tsx watch` does not watch `.env`.** After editing `packages/api/.env` the running
  server keeps serving the old values. You must fully restart the API process. It *does*
  watch `.ts` files, including `scripts/seed-test-accounts.ts` — editing one silently
  restarts the API and re-seeds.
- **The bottom nav is `position: fixed`.** `open-app.mjs` launches with `viewport: null`
  and `--window-size=400,760` on purpose. If you force a tall viewport the bottom nav
  clips off-screen — that is a harness artifact, **not an app bug**. Never report it as one.
- **`/browse` renders NotFound by default.** Public discovery is gated behind
  `PUBLIC_DISCOVERY_ENABLED` (UAT ISSUE-29), off in the shipped config. Confirm which
  configuration you are reviewing before reporting anything about Browse:
  ```bash
  curl -s http://localhost:3001/api/config
  ```
  If it returns `true` locally, the nav has a tab the release build does not have.
- **Authenticate before visiting protected routes.** `/matches`, `/standings`, `/play`,
  `/groups`, `/profile`, `/coach` and tournament detail all require auth.

---

## Reporting what you find

- A visible, correctly-labelled control that does nothing is a **defect**, not a nitpick —
  it is indistinguishable from a broken app to a user. It has its own history here
  (UAT ISSUE-44, ISSUE-46, ISSUE-50).
- File real findings in `assets/planning/UAT_ISSUES.md` in that file's format:
  symptom → verified root cause with `file:line` → fix → verify. Read the numbering note at
  the top for the next issue number. Feature ideas go to `BACKLOG.md` instead.
- Reproduce before filing. That file has an explicit reproduce-first bar.

## Do NOT

- **Do not run `npm run test:e2e:ui` or `test:e2e:debug`.** `--ui` opens a GUI and
  `--debug` opens the Inspector paused on line 1; both hang forever in an agent session.
  Suggest them to the user instead.
- **Do not drive the user's browser window** while they are testing it. Use
  `inspect-route.mjs` for your own inspection.
- **Do not run `open-app.mjs` in the foreground.** It never exits.
- **Do not `rm -rf .browser-data/`** unless asked — it holds the user's login session.
- **Do not report layout as broken from a screenshot alone** without checking the width
  chain; see the fixed-nav gotcha above.
