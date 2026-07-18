# PWA Caching — Implementation Plan
## Venue-mode offline caching + scores sync queue + installable shell

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).
> Drives: [PWA_CACHING_DESIGN.md](./PWA_CACHING_DESIGN.md) (**fully grilled 2026-07-18 —
> read §1 (decisions D1–D10), §2 (settled facts), and §6 (shell requirements R1–R7) before
> starting; do not relitigate those decisions**).

**Date:** 2026-07-18
**Status:** 📝 PLANNED — not started.
**Method:** TDD-first per CLAUDE.md §4/§11 — every step is a **[RED]** commit (failing
tests; run them, confirm they fail *for the right reason*) followed by a **[GREEN]** commit
(implementation, tests pass). E2E scenarios land in `e2e-scenarios.md` **and the full
executable Playwright suite is authored, run red, and committed for owner review before
any implementation begins** (S0.2 + S0.5); S6 only turns that suite green. Coverage gate
**≥85% (statements, branches, functions, lines) on all new modules**
(`src/workers/sw-lib/**`, `src/pwa/**`) enforced via per-glob `coverageThreshold` (S0.4);
the global 80% gate stays untouched. One logical change per commit; `Co-Authored-By`
trailer per CLAUDE.md §11. Execution order S0 → S9 (S7 infra and S8 docs/icons are
independent after S4 and may be reordered).

---

## 0. Context pack (read first — everything an implementer needs)

### 0.1 What is being built (one paragraph)

**Venue mode**: a player at a court with bad signal can open the installed app offline,
see their tournament list, matches, standings, and bracket from a **timestamped snapshot**
(≤48h old, network-first when online), and **submit scores into a visible replay queue**
that syncs when connectivity returns. The existing service worker
(`packages/frontend/src/workers/service-worker.ts`) is **dead code today** — nothing
builds it, the registration in `main.tsx` 404s silently — and its logic has 7 catalogued
defects (design doc §3). It gets **rewritten as small testable modules**, wired into the
build via `vite-plugin-pwa` (injectManifest), and surrounded by the client UX the design
requires: pending-score badges, an offline banner with per-view "Updated HH:MM"
timestamps, a sign-out cache wipe, and an update-available toast. The app becomes
installable (manifest + icons + CloudFront no-cache behaviors).

### 0.2 Non-negotiable design decisions (PWA_CACHING_DESIGN.md §1 — do not relitigate)

- **D2 (endpoint mapping amended 2026-07-18) — cached reads are exactly two
  endpoints**: `GET /player/tournaments` and `GET /tournaments/:id/bundle` — the
  consolidation endpoint all four venue views actually consume via `useTournament()`.
  The per-view getters the original D2 named (`fetchMatches`/`fetchStandings`/
  `fetchBracket` in `api/client.ts`) are **dead code with zero production callers**:
  do not cache their paths, do not delete them (CLAUDE.md §3). Nothing else. Ever.
- **D3 — network-first** with a **3.5s timeout**, cache fallback only on failure; every
  network success refreshes the cache entry.
- **D4 — fallback responses are stamped** (`sw-cache: fallback`, `sw-cached-at: <ISO>`);
  UI shows a global offline banner + per-view "Updated HH:MM".
- **D5 — sign-out (and account switch) wipes** the venue data cache + sync queue via a SW
  message. Static/precache stays.
- **D6 — 48h TTL**: fallback ignores entries older than 48h; prune on `activate`.
- **D7 — queue scores only**: `POST/PATCH /tournaments/:id/(matches|knockout)/:mid/score`.
  Every other failed write passes its error through untouched (no queue, no fake 202).
- **D8 — explicit pending state**: SW's synthesized `202 {code:'QUEUED'}` renders as
  "Saved offline", never success. Replay outcomes: 2xx → remove + notify; 401 → keep +
  needs-auth notify; other 4xx → **drop** + rejected notify (never blind-retry a 4xx);
  entry older than 48h → drop + expired notify; network failure → keep, try next trigger.
- **D9 — prompt-to-refresh**: new SW waits; toast "Update available — Refresh" calls
  skipWaiting + reload. **No `skipWaiting()`/`clients.claim()` on install/activate.**
- **D10 — navigation fallback is the precached app shell** (`index.html`); `offline.html`
  only if the shell is missing from cache.
- **D11 (added by amendment 2026-07-18) — offline session survival**: `restoreSession()`
  must distinguish network failure from HTTP 401. Network failure **never deletes the
  token**; identity is restored from a localStorage session snapshot
  (`{ user, validatedAt }`, written on every successful validation/login) trusted for
  48h (⚖, reuses `VENUE_TTL_MS`), marking the session offline-unvalidated; revalidate
  on reconnect (a real 401 then clears token + snapshot + D5 wipe); 5xx counts as
  network failure, not rejection; the sign-out wipe extends to the snapshot. Without
  this, `ProtectedRoute` redirects every offline reload to `/login` and the whole
  feature is unreachable (the current blanket catch even destroys the session
  permanently). Magic-link tokens are opaque — never attempt client-side decoding.
- **§2 settled facts**: `/tournaments/:id/events` (SSE, token in query string) is **never
  intercepted and never cached** — nor is any token-bearing URL. Replay triggers are SW
  startup + app-signaled connectivity regain + app foreground (**iOS Safari has no
  Background Sync** — the `sync` event may stay as a Chromium bonus but nothing depends
  on it). Routing is path-based (same-origin API).

### 0.3 Key files (verified 2026-07-18)

| Concern | File |
|---|---|
| Dead SW to be rewritten (delete after S4) | `packages/frontend/src/workers/service-worker.ts` (+ its old test `src/workers/__tests__/service-worker.spec.ts` — superseded by sw-lib specs) |
| SW registration to replace (S4) | `packages/frontend/src/main.tsx` lines 26–42 (hand-rolled `navigator.serviceWorker.register('/service-worker.js')`) |
| Vite config (plugin + preview proxy go here) | `packages/frontend/vite.config.ts` (dev proxies `/api`, `/tournaments`, `/player` → :3001; mirror them under `preview.proxy` in S6) |
| API fetch wrapper (header sniff in S5b) | `packages/frontend/src/api/client.ts` — `apiFetch()` ~line 21; `submitScore()` ~line 145 (POST group / `PATCH` knockout — **both hit `…/score`**); `fetchPlayerTournaments()` ~line 163 (the one real venue getter). **`fetchMatches`/`fetchStandings`/`fetchBracket` (~lines 116–136) are dead code** — zero production callers; never cached, never deleted (CLAUDE.md §3) |
| Bundle fetch (second header-sniff point in S5b) | `packages/frontend/src/hooks/useTournament.ts` — `fetchTournamentBundle()` ~line 37: raw `fetch` with Bearer token in the **Authorization header** (not the URL — token-URL exclusion not triggered), **bypasses `apiFetch`**, so the S5b fallback sniff must be added here too |
| Score submit hook (gets `queued` status) | `packages/frontend/src/hooks/useScoreSubmit.ts` — has its own 4-attempt retry loop; with the SW active an offline submit resolves instantly as 202, so the loop only ever sees server errors (unchanged behavior). First-visit-no-SW offline submit still walks the retry→failed path — acceptable, documented. |
| Score form UI (pending badge) | `packages/frontend/src/components/ScoreSubmitForm.tsx` |
| Venue views (timestamps in S5c) | `packages/frontend/src/pages/MyTournamentsHub.tsx`, `packages/frontend/src/pages/TournamentDetail/{Matches,Standings,Bracket}.tsx` |
| Module-level notifier precedent to copy | `packages/frontend/src/context/ServiceUnavailableContext.tsx` (`notify503()` — module listener set by provider; `apiFetch` calls it) |
| Sign-out flow (wipe hook point) | `packages/frontend/src/pages/Signout.tsx` (calls `useAuth().logout()`); `logout` in `src/hooks/useAuth.tsx` ~line 212 |
| Session restore (the D11 defect; fixed in S5d) | `src/hooks/useAuth.tsx` — `restoreSession()` lines 79–114: blanket `catch` at line 107 deletes the token on **any** failure incl. network errors; the `/player/session` fallback (line 99) only runs on a real HTTP 401 |
| Route guard (no change needed) | `src/components/ProtectedRoute.tsx` — redirects to `/login` when `isAuthenticated` is false; behaves correctly once S5d restores offline identity |
| Offline page (kept, last-resort) | `packages/frontend/public/offline.html` |
| Non-app HTML to exclude from precache | `packages/frontend/public/design.html`, `public/design-system.html` |
| Broken favicon to replace (S8) | `packages/frontend/index.html` line 5 → `/vite.svg` (does not exist in `public/`) |
| Jest config (mapper + thresholds in S0) | `packages/frontend/jest.config.js` (global 80% threshold — keep; add per-glob 85%) |
| Old unit tests superseded by this work | `src/__tests__/offline-flow.spec.tsx` (hand-rolled IDB/SW mocks of the *old* behavior — rewrite in S5), `src/__tests__/main.spec.tsx` (update for new registration) |
| Playwright config (new `pwa` project in S0.5) | repo-root `playwright.config.ts` — `testDir: './packages/frontend/e2e'`, chromium+firefox projects, `baseURL: http://localhost:5173`, no `webServer` (servers started externally per CLAUDE.md §8 / `scripts/e2e-setup.js`) |
| Existing offline e2e (obsolete; deleted in S0.5) | `packages/frontend/e2e/offline.spec.ts` — tested the "API/SW boundary" with no UI; predates this design |
| E2E fixtures / testid constants / scenario docs | `packages/frontend/e2e/fixtures.ts` (`createSinglesTournamentInGroupStage` line ~317 returns players+tokens+match — the venue-mode workhorse), `e2e/config.ts` (`ROUTES`, add TESTIDS here), repo-root `e2e-scenarios.md` |
| CloudFront module (S7) | `infra/modules/frontend/main.tf` — `caching_disabled` managed policy at line ~53 already used by the `local.api_path_patterns` behavior loop (line ~63/104); copy that pattern but keep the **S3 origin** |
| @coach help corpus (S8, CLAUDE.md §9) | `docs/assistant-help.md` |

### 0.4 New module layout

```
packages/frontend/src/
  workers/
    service-worker.ts        # REWRITTEN: thin event wiring only (S4)
    sw-lib/                  # pure, unit-testable logic — NO service-worker globals
      routing.ts             # classifyRequest(method, url) → RequestClass  (S1)
      venue-cache.ts         # network-first + stamp + TTL + prune + wipe   (S2)
      sync-queue.ts          # IDB queue + replay engine                    (S3)
      messages.ts            # SW↔app message protocol (types + guards)     (S1)
  pwa/
    register.ts              # wraps virtual:pwa-register; exposes update state (S4)
    sw-bridge.ts             # postMessage helpers + SW→app event fan-out   (S5)
    OfflineSnapshotContext.tsx # notifyOfflineSnapshot() + provider (503 pattern) (S5)
    OfflineBanner.tsx        # global banner                                 (S5)
    UpdateToast.tsx          # D9 refresh prompt                             (S5)
```

`sw-lib` modules take `caches`/`indexedDB`/`fetch` behavior through ordinary function
arguments or the global scope available in **both** jsdom and the worker — never
`self.__WB_MANIFEST` or SW event objects — so Jest covers them without a SW harness.
`service-worker.ts` itself stays under ~120 lines of wiring and is exercised by e2e.

### 0.5 Request classification (S1 — the routing contract)

`classifyRequest(method: string, url: URL): RequestClass` where `RequestClass =`

| Class | Rule (path = `url.pathname`) | Handling |
|---|---|---|
| `'sse'` | path matches `^/tournaments/[^/]+/events$` **or** `url.searchParams.has('token')` | **Not intercepted** — return without `respondWith` |
| `'venue-read'` | GET and path matches one of: `^/player/tournaments$` · `^/tournaments/[^/]+/bundle$` | `venue-cache.networkFirst` (D3) |
| `'queueable-score'` | (POST or PATCH) and path matches `^/tournaments/[^/]+/(matches|knockout)/[^/]+/score$` | network; on **fetch rejection only** (never on an HTTP error response) → `sync-queue.enqueue` + synthesized 202 |
| `'navigation'` | `request.mode === 'navigate'` (pass mode as a param) | precached shell, `offline.html` last resort (D10) |
| `'passthrough'` | everything else — incl. all other API paths and methods | **Not intercepted** (Workbox precache routes handle hashed assets separately) |

Evaluation order: `sse` first (wins over everything), then `queueable-score`,
`venue-read`, `navigation`, `passthrough`.

### 0.6 SW↔app message protocol (S1 `messages.ts` — the bridge contract)

App → SW (`postMessage`):
- `{ type: 'WIPE_PLAYER_DATA' }` → delete venue cache + clear queue → reply
  `{ type: 'WIPE_DONE' }` to the source client.
- `{ type: 'REPLAY_QUEUE' }` → run the replay engine now.
- `{ type: 'SKIP_WAITING' }` → handled by vite-plugin-pwa's generated flow (do not
  hand-roll; `register.ts` uses the plugin's `updateServiceWorker()`).

SW → app (`client.postMessage`, fan-out to all window clients):
- `{ type: 'REPLAY_RESULT', outcome: 'success' | 'needs-auth' | 'rejected' | 'expired',
  tournamentId, matchId, detail?: string }` — one per queue entry processed.
- `{ type: 'WIPE_DONE' }`.

Replay triggers (all of): SW script startup (top-level `replayQueue()` guarded to
no-op when queue empty), `REPLAY_QUEUE` message (sent by `sw-bridge` on `window`
`'online'`, on app start once SW is ready, and after a successful login), and the
Chromium-only `sync` event tag `'sync-scores'` (bonus; never register a dependency
on it).

### 0.7 Cache & storage names (constants in `sw-lib`, single source)

- Venue data cache: `venue-data-v1` (Cache Storage). Stamp headers on **stored**
  responses: `sw-cached-at: <ISO>`; the fallback path re-serves with an added
  `sw-cache: fallback` header. `VENUE_TTL_MS = 48 * 60 * 60 * 1000`.
- Queue DB: `pwa-sync` v1, object store `score-queue`, keyPath `id`
  (`crypto.randomUUID()`), entry `{ id, url, method, headers, body, enqueuedAt }`.
  FIFO by `enqueuedAt`. Add devDependency **`fake-indexeddb`** for unit tests (replaces
  the hand-rolled IDB mocks in the old `offline-flow.spec.tsx`).
- Precache: managed by Workbox (`precacheAndRoute(self.__WB_MANIFEST)` +
  `cleanupOutdatedCaches()`); never touched by wipe.
- Session snapshot (D11): localStorage key `auth_session_snapshot` =
  `{ user, validatedAt }`. Written on every successful auth validation/login/signup;
  read **only** when session restore hits a network failure; trusted for `VENUE_TTL_MS`
  (48h); removed on sign-out wipe and on a genuine 401.

### 0.8 Build/tooling facts Sonnet must not rediscover the hard way

- **Dev vs build**: the injected precache manifest (`self.__WB_MANIFEST`) is only real in
  a production build. Set `devOptions: { enabled: true, type: 'module' }` so runtime
  caching + queue are testable against the dev server, **but** shell-offline-boot and
  install assertions require `vite build` + `vite preview` — that's what the `pwa`
  Playwright project is for (created S0.5, green S6). Module SWs don't run on Firefox
  dev — **all PWA e2e specs run on the `pwa` (chromium, preview) project only**; the production SW is built
  classic (`injectManifest` rollup output) and works on Firefox in prod.
- **Jest can't resolve `virtual:pwa-register`**: add `moduleNameMapper`
  `'^virtual:pwa-register$': '<rootDir>/src/__tests__/mocks/pwa-register.ts'` (mock
  exports `registerSW: jest.fn(() => jest.fn())`). Update `src/__tests__/main.spec.tsx`
  accordingly.
- **Types**: add `"vite-plugin-pwa/client"` to the frontend tsconfig `types` (or a
  `src/vite-env.d.ts` reference) or `tsc` fails on the virtual import. The rewritten
  worker keeps `/// <reference lib="webworker" />` and uses
  `declare const self: ServiceWorkerGlobalScope` — **no `as any`**.
- **Dependencies** (frontend `package.json`): `vite-plugin-pwa` (dev),
  `workbox-precaching` + `workbox-routing` (runtime imports inside the SW), and
  `fake-indexeddb` (dev). Nothing else — no `idb` wrapper, no `sharp`.
- **Plugin config sketch** (S4):
  `VitePWA({ strategies: 'injectManifest', srcDir: 'src/workers',
  filename: 'service-worker.ts', registerType: 'prompt', injectRegister: false,
  manifest: { …R2 fields… }, injectManifest: { globIgnores:
  ['**/design.html', '**/design-system.html'] }, devOptions: { enabled: true,
  type: 'module' } })` — output lands at `dist/service-worker.js`, the same path the
  old registration used; `register.ts` uses the virtual module so the path is plugin-managed
  either way.
- **Icons without new deps** (S8): `scripts/generate-icons.mjs` renders
  `packages/frontend/public/icon.svg` with Playwright chromium (already a devDep) and
  screenshots 192/512/maskable-512 (10% safe-zone padding) + 180 apple-touch PNGs into
  `public/`. Committed as assets; script kept for regeneration.

### 0.9 Testing & verification map

- **Unit (Jest, ≥85% on new globs)**: every `sw-lib` and `pwa` module. Live under the
  standard `__tests__` conventions (`src/workers/sw-lib/__tests__/*.spec.ts`,
  `src/pwa/__tests__/*.spec.tsx`).
- **E2E (Playwright, `pwa` project @ preview :4173, chromium)**: scenarios in §S0.2,
  specs authored **red-first in S0.5** and turned green in S6. Offline is simulated with
  `context.setOffline(true)` — SW fetch handlers still run; their `fetch()` rejects,
  which is exactly the path under test. Seed data via
  `createSinglesTournamentInGroupStage()`; **never ambient state**; unique emails
  (CLAUDE.md §8).
- **Build assertions (S4 verify)**: after `npm run build --workspace packages/frontend`
  assert `dist/service-worker.js` exists and contains `precacheAndRoute`-injected
  entries, `dist/manifest.webmanifest` exists, `dist/index.html` links it.
- **Infra (S7 verify)**: `tofu validate` + `tofu plan` show the two new ordered cache
  behaviors.
- **Manual DoD (once, at the end)**: Lighthouse installability on preview; DevTools
  offline hard-reload boots the shell; deploy-twice-to-preview shows the update toast;
  iOS Add-to-Home-Screen name/icon (device or simulator, best-effort).

---

## S0 — Branch, scenario docs, tooling plumbing

- **S0.1** Branch `pwa-caching` off `main` (CLAUDE.md §11 — never commit to main).
- **S0.2 [docs commit]** Add to repo-root `e2e-scenarios.md` a new
  `## Feature: PWA Venue Mode (Offline)` section in the existing Gherkin style, with
  status markers (⏳ planned), covering exactly:
  1. *Venue views readable offline*: player loads matches/standings/bracket online →
     goes offline → reload → data renders from snapshot; offline banner visible;
     "Updated HH:MM" shown.
  2. *Offline score submit shows pending, not success*: offline submit → "Saved
     offline — will send when connected" badge; no success state; entry in queue.
  3. *Reconnect replays the queue*: back online → REPLAY_RESULT success → badge clears,
     match shows submitted score.
  4. *Replay rejection surfaces and drops*: opponent scores the same match while player
     is offline → replay gets a 4xx → "Not applied — already recorded" notice; queue
     entry gone; **no retry**.
  5. *Non-queueable writes fail fast offline*: e.g. partner request while offline →
     normal error path; nothing queued; no fake 202.
  6. *Sign-out wipes offline data*: sign out → go offline → venue routes show "no saved
     data" (no prior player's snapshot); Cache Storage has no `venue-data` entries;
     queue empty.
  7. *No token-bearing URL is ever cached*: after a full session incl. SSE, no Cache
     Storage key contains `/events` or `token=` (asserted via `page.evaluate` over
     `caches.keys()/matchAll()`).
  8. *App shell boots offline* (preview only): visit online → offline → hard reload →
     app boots (no browser error page), banner shown.
  9. *Installable*: `manifest.webmanifest` served with required fields;
     `navigator.serviceWorker.ready` resolves; SW controls the page.
  10. *Offline reload keeps the session* (D11 — scenario 1 silently depends on this):
     authenticated player reloads a venue route offline → **stays signed in**
     (offline-unvalidated, no redirect to `/login`), venue snapshot renders; then back
     online + reload → session revalidates with **no re-login** (token was never
     deleted). Covers both personas: registered-account JWT and magic-link player.
  Also mark the old "Offline / Sync" scenarios tied to `e2e/offline.spec.ts` as
  superseded by this feature block.
- **S0.3 [chore commit]** Frontend deps: `vite-plugin-pwa`, `workbox-precaching`,
  `workbox-routing`, `fake-indexeddb`. Jest: `moduleNameMapper` for
  `virtual:pwa-register` + mock file (0.8). Tsconfig types entry. Run the full unit
  suite — must stay green (nothing wired yet).
- **S0.4 [chore commit]** `jest.config.js`: add per-glob `coverageThreshold` entries —
  `'src/workers/sw-lib/**/*.ts'` and `'src/pwa/**/*.{ts,tsx}'` at 85/85/85/85. (Jest
  treats per-glob thresholds independently of `global` — the global 80% stays.) Verify:
  `npm run test:coverage` passes (globs with no files yet are ignored by Jest —
  thresholds bite from S1 on).
- **S0.5 [RED commit — the e2e suite, for owner review before any implementation]**
  - Plumbing (same commit; enables running the red suite): root `playwright.config.ts`
    gains project `{ name: 'pwa', use: { ...devices['Desktop Chrome'], baseURL:
    'http://localhost:4173' }, testMatch: '**/pwa-*.spec.ts' }` and the chromium/firefox
    projects get `testIgnore` for `pwa-*.spec.ts`. Frontend `package.json` gains
    `"preview:pwa": "vite build && vite preview --port 4173"`, and `vite.config.ts`
    gains `preview: { port: 4173, proxy: <same three paths as the dev proxy> }` (needed
    now so login/fixtures work against preview; independent of the PWA plugin, which
    lands in S4). Document in `e2e/README.md`: the `pwa` project needs API on :3001 +
    `npm run preview:pwa`.
  - Define **all** PWA testids as constants in `e2e/config.ts` now (single source,
    CLAUDE.md §8): `offline-banner`, `snapshot-updated-at`, `score-pending-badge`,
    `update-toast`, plus the S5a notice states (`score-needs-auth`, `score-rejected`,
    `score-expired`). Implementation steps S5a–S5c consume these constants — they do
    not invent ids.
  - Author the full suite, mapping 1:1 to the S0.2 scenarios:
    - `e2e/pwa-offline-venue.spec.ts` — scenarios 1, 8, 10 (seed via
      `createSinglesTournamentInGroupStage`, log in, wait for
      `navigator.serviceWorker.ready` + a controlling SW, warm the venue views, then
      `context.setOffline(true)` + `page.reload()`; scenario 10 additionally asserts
      no `/login` redirect offline, then `setOffline(false)` + reload revalidates
      without re-login — run it for both a magic-link player and a registered account).
    - `e2e/pwa-score-queue.spec.ts` — scenarios 2, 3, 4, 5 (scenario 4: while player A
      is offline, submit player B's score via `apiCall` with B's token, then reconnect A).
    - `e2e/pwa-hygiene.spec.ts` — scenarios 6, 7 (sign-out wipe; Cache Storage key
      audit via `page.evaluate`).
    - `e2e/pwa-install.spec.ts` — scenario 9 (fetch `/manifest.webmanifest`, assert
      required fields; SW registered + controlling).
  - Delete `e2e/offline.spec.ts` (superseded — S0.2 already recorded this in
    `e2e-scenarios.md`).
  - **Confirm red for the right reason**: run the `pwa` project against a started
    preview server (API on :3001). Every spec's *setup* (fixtures, login, navigation)
    must succeed; every *failure* must be missing behavior — before S4 that means
    `navigator.serviceWorker.ready` never resolving or a missing testid, never a broken
    selector, fixture error, or proxy 404. Fix any wrong-reason failure before
    committing. Commit the red suite as its own commit and **pause for owner review of
    the red tests** (per the project's TDD workflow) before starting S1.

## S1 — `sw-lib/routing.ts` + `sw-lib/messages.ts` (pure contracts)

- **S1.1 [RED]** `src/workers/sw-lib/__tests__/routing.spec.ts` — table-driven per §0.5:
  both venue-read patterns match (and near-misses don't: `/tournaments/x/bundle/y`,
  `/tournaments/public`, `/player/tournaments/x`); **the dead per-view paths
  (`/tournaments/:id/matches`, `…/groups/:gid/standings`, `…/bracket`) classify
  `'passthrough'`** — zero production callers, deliberately uncached (D2 amendment);
  SSE path and **any** `?token=` URL classify
  `'sse'` regardless of other rules; score POST **and** PATCH (group + knockout) classify
  `'queueable-score'`; other writes (`/tournaments/:id/advance`,
  `…/partner-requests`, future `/api/billing/*`) classify `'passthrough'`;
  `mode:'navigate'` → `'navigation'`; precedence order tests.
  `messages.spec.ts` — type guards accept valid messages, reject malformed ones.
- **S1.2** Confirm red for the right reason (modules don't exist), commit.
- **S1.3 [GREEN]** Implement `routing.ts` (pure function + exported `RequestClass`,
  regex constants) and `messages.ts` (protocol types + `isAppMessage`/`isSwMessage`
  guards). Commit.

## S2 — `sw-lib/venue-cache.ts` (D3/D4/D5/D6)

- **S2.1 [RED]** `venue-cache.spec.ts` (jsdom + a minimal in-memory `CacheStorage`
  stub, or `fake-indexeddb`-style stub — keep it local to the spec):
  - network success within timeout → response returned, cache entry refreshed and
    stamped `sw-cached-at`;
  - network rejection → cached entry served **with `sw-cache: fallback` added**;
  - network slower than 3.5s (fake timers) → fallback served, late response still
    refreshes cache;
  - cache entry older than `VENUE_TTL_MS` → treated as miss (network error propagates /
    504-style synthesized response `{code:'OFFLINE_NO_SNAPSHOT'}`);
  - `pruneExpired()` removes only expired entries;
  - `wipe()` deletes the venue cache, leaves other caches alone;
  - non-2xx network responses are returned as-is and **not cached**.
- **S2.2** Confirm red, commit. **S2.3 [GREEN]** Implement
  (`networkFirst(request, {timeoutMs})`, `pruneExpired()`, `wipe()`), commit.

## S3 — `sw-lib/sync-queue.ts` (D7/D8) — with `fake-indexeddb`

- **S3.1 [RED]** `sync-queue.spec.ts`:
  - `enqueue()` persists `{id,url,method,headers,body,enqueuedAt}`; FIFO `getAll()`;
  - `buildQueuedResponse()` → 202 with `{code:'QUEUED', id}`;
  - replay engine `replayAll(fetchImpl, notify)`:
    - 2xx → entry removed, `notify({outcome:'success',…})`;
    - 401 → entry **kept**, `notify('needs-auth')`, engine stops touching that entry
      this run (avoids hammering);
    - 409/other 4xx → entry **removed**, `notify('rejected', detail from body)`;
    - network rejection → entry kept, no notify, engine aborts remaining entries
      (still offline);
    - entry older than 48h → removed **without sending**, `notify('expired')`;
    - order preserved; concurrent `replayAll` calls don't double-send (simple in-flight
      flag);
  - `clear()` empties the store (used by wipe).
- **S3.2** Confirm red, commit. **S3.3 [GREEN]** Implement, commit.

## S4 — Assemble the worker + build wiring (R1) — retire the old SW

- **S4.1 [RED]** Minimal assembly spec `service-worker-assembly.spec.ts`: with mocked
  `sw-lib` modules, feeding synthetic fetch-event-like inputs through the exported
  `handleFetch(event)` dispatches per §0.5 (sse → no respondWith; venue-read →
  venue-cache; score → network-then-enqueue-202; navigation → shell handler); message
  events dispatch per §0.6. Keep this spec thin — the logic lives in S1–S3.
  Also **[RED]** update `src/__tests__/main.spec.tsx`: main no longer calls
  `navigator.serviceWorker.register`; it calls `pwa/register.ts`'s `initPwa()` (mock).
- **S4.2** Confirm red, commit.
- **S4.3 [GREEN]** Rewrite `src/workers/service-worker.ts`: Workbox precache
  (`precacheAndRoute(self.__WB_MANIFEST)`, `cleanupOutdatedCaches()`), navigation route
  bound to `index.html` with `offline.html` catch (D10), `install`/`activate` **without**
  skipWaiting/claim (D9) but with `pruneExpired()` on activate (D6), `fetch` →
  `handleFetch`, `message` → §0.6 handlers, top-level replay trigger, `sync` bonus.
  Delete the old `src/workers/__tests__/service-worker.spec.ts` and the old
  `src/__tests__/offline-flow.spec.tsx` (its behavior is superseded; S5 adds the new
  client-flow spec — note the deletion in the commit message).
  Create `src/pwa/register.ts` (`initPwa()` → `registerSW({ immediate: true,
  onNeedRefresh, onRegisteredSW })`, exports a tiny subscribable
  `{ updateAvailable, applyUpdate() }` store). Replace the registration block in
  `main.tsx` with `initPwa()`.
  Vite config per §0.8 (plugin + `preview: { port: 4173, proxy: <same three paths as dev> }`).
- **S4.4 Verify (build assertions, scriptable):**
  `npm run build` in `packages/frontend`; assert `dist/service-worker.js` (contains the
  injected manifest, no `design.html` entries), `dist/manifest.webmanifest`,
  manifest link in `dist/index.html`. `npm test` green. Commit.

## S5 — Client UX: queued scores, replay results, banner, timestamps, toast, wipe

Four RED/GREEN pairs — keep the commits separate. **S5d is the keystone: without it,
every offline view sits unreachable behind `ProtectedRoute` (D11).**

**S5a — queued submit + replay results**
- **S5a.1 [RED]** Specs: `api/client` `submitScore` returns `{queued:boolean}` (202 +
  `code:'QUEUED'` → `queued:true`); `useScoreSubmit` gains status `'queued'` (202 path
  never reaches `'success'`, never triggers its retry loop); `ScoreSubmitForm` renders a
  `data-testid="score-pending-badge"` "Saved offline — will send when connected" state;
  `pwa/sw-bridge` spec: fans SW `REPLAY_RESULT` messages out to subscribers, posts
  `REPLAY_QUEUE` on `'online'`/init/login, `wipePlayerData()` resolves on `WIPE_DONE`
  (1.5s timeout → resolve anyway, never block sign-out).
- **S5a.2** Red, commit. **S5a.3 [GREEN]** Implement; on `REPLAY_RESULT`: success →
  invalidate the match queries + clear badge; `needs-auth` → persistent "Sign in to
  finish submitting your score" notice; `rejected` → "Score not applied — already
  recorded" notice (`detail` if present); `expired` → "Offline score expired — submit
  again". Commit.

**S5b — offline banner + per-view timestamps (D4)**
- **S5b.1 [RED]** Specs: **both fetch paths** call `notifyOfflineSnapshot(path, cachedAt)`
  when `sw-cache: fallback` is present — `apiFetch` (covers `/player/tournaments`) **and**
  `useTournament`'s `fetchTournamentBundle` (covers the bundle; it bypasses `apiFetch`,
  §0.3) — copying the `notify503` module-listener pattern;
  `OfflineSnapshotContext` provider exposes per-path timestamps + an `isOffline` flag
  (`navigator.onLine` + fallback events, cleared on the next non-fallback response);
  `OfflineBanner` renders `data-testid="offline-banner"` when offline; venue views
  render `data-testid="snapshot-updated-at"` ("Updated HH:MM") when their data came
  from fallback — the three `TournamentDetail` tabs share the bundle's single
  cached-at, so the timestamp is identical across them (expected, per the D2
  amendment). Extend the existing page specs for the four venue views rather than
  new files where natural.
- **S5b.2** Red, commit. **S5b.3 [GREEN]** Implement; mount provider + banner in the
  app shell in `App.tsx` (inside the existing provider stack in `main.tsx`/`App.tsx` —
  match whichever level `ServiceUnavailableProvider` sits at). Commit.

**S5c — update toast (D9) + sign-out wipe (D5)**
- **S5c.1 [RED]** Specs: `UpdateToast` renders on `updateAvailable`,
  `data-testid="update-toast"`, button calls `applyUpdate()`; `Signout` calls
  `wipePlayerData()` before `navigate('/')` (mock bridge; assert order); account-switch
  wipe: successful login compares `localStorage['last_player_id']` — different player →
  `wipePlayerData()`, then store new id (spec on the login path in `useAuth`).
- **S5c.2** Red, commit. **S5c.3 [GREEN]** Implement (wipe call sits next to the
  existing `logout()` in `Signout.tsx`'s `finally`, before navigate). Commit.

**S5d — offline session survival (D11)**
- **S5d.1 [RED]** Specs on `useAuth` (extend its existing spec file; mock `fetch`):
  - successful `/api/auth/me` (and successful `/player/session` fallback) writes
    `auth_session_snapshot` with the restored user + `validatedAt`; login/signup do too;
  - **fetch rejection** during restore with a fresh (<48h) snapshot → `user` restored
    from snapshot, `isAuthenticated` true, an `offlineUnvalidated` flag exposed, and
    the token **still in localStorage**;
  - fetch rejection with no snapshot, or snapshot older than 48h → `user` null but
    token **still in localStorage**;
  - unexpected 5xx during restore → same as fetch rejection (token kept) — the current
    `throw` at line 105 must stop funneling into token deletion;
  - real 401 with failed player fallback → token **and** snapshot removed (existing
    sign-out semantics preserved);
  - `'online'` event while offline-unvalidated → revalidation runs; success clears the
    flag; a real 401 clears token + snapshot and triggers the D5 wipe via the bridge;
  - extend the S5c sign-out spec: the wipe also removes `auth_session_snapshot`.
- **S5d.2** Red, commit. **S5d.3 [GREEN]** Implement in `useAuth.tsx` (restore path
  lines 79–114 restructured around rejection-vs-network; snapshot helpers kept inside
  the hook module — no new abstraction layers). `ProtectedRoute` needs no change.
  Commit.
- **S5.4** All rendered testids must come from the `e2e/config.ts` constants defined in
  S0.5 — no new ids invented here; if implementation reveals a missing state, add the
  constant *and* the corresponding red e2e assertion in the same commit. Full unit
  suite + coverage gate green (`npm run test:coverage`): new globs ≥85%.

## S6 — E2E: turn the S0.5 red suite green

The suite, project config, and testids all exist since S0.5 — this step adds **no new
specs and no new features**, only makes the red suite pass against the implemented app.

- **S6.1 [GREEN]** Start API + `npm run preview:pwa`; run the `pwa` project. Fix what
  the specs expose (timing/waits, replay triggering, testid wiring) — if a failure
  reveals a genuine missing *behavior*, stop: that belongs to the S1–S5 step that owns
  it (fix it there with its unit tests, then return here). Spec edits are allowed only
  to correct timing/selector fragility, never to weaken an assertion.
- **S6.2** Regression: the full existing e2e suite (chromium + firefox) still green
  against the dev server. Update the S0.2 scenario statuses in `e2e-scenarios.md` to ✅.
  Commit.

## S7 — Infra: CloudFront no-cache behaviors (R5)

- **S7.1** `infra/modules/frontend/main.tf`: local
  `pwa_no_cache_paths = ["/service-worker.js", "/manifest.webmanifest"]` + a
  `dynamic "ordered_cache_behavior"` block over it — copy the **default S3-origin
  behavior's** origin/viewer/allowed-methods settings but with
  `cache_policy_id = data.aws_cloudfront_cache_policy.caching_disabled.id`. (Do **not**
  copy the API behaviors' origin — these two files come from S3.)
- **S7.2** Update the deploy runbook in `IaC-implementation.md` Step 6: after the normal
  `aws s3 sync`, re-upload the two files with
  `--cache-control "no-cache" --metadata-directive REPLACE`.
- **S7.3 Verify:** `tofu validate` and `tofu plan` (against the uat env per IaC docs)
  show exactly the two new behaviors. Commit (infra commit separate from frontend).

## S8 — Shell polish: icons, meta, help docs (R3/R4/R7)

- **S8.1** `scripts/generate-icons.mjs` (Playwright-render per §0.8) + a simple
  `public/icon.svg` (monogram on the app's theme color — pull the value from
  `src/styles/globals.css` design tokens); generate `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`. Wire into the plugin `manifest.icons`
  (maskable variant with `purpose: 'maskable'`) — the manifest fields themselves were
  set in S4; this fills in the real assets. `index.html`: replace the dead `/vite.svg`
  favicon with a real one (reuse `icon-192.png` or an `.ico` from the script);
  add `<meta name="theme-color">` + `<link rel="apple-touch-icon">`.
- **S8.2** `docs/assistant-help.md`: add an "Installing the app & using it offline"
  section — install steps (Android/desktop prompt, iOS Add-to-Home-Screen), what works
  offline (the four venue views + queued scores), what the banner/timestamps/pending
  badge mean, the 48h window, and that signing out clears offline data. (CLAUDE.md §9 —
  user-visible change, same branch.)
- **S8.3 Verify:** rebuild; manifest references resolve (no 404s in preview); unit+e2e
  still green. Commit.

## S9 — Definition of done (verify everything, then stop)

All must pass before merge is proposed (fast-forward, per CLAUDE.md §11; merge itself
only on request):

1. `npm test` (frontend) green; `npm run test:coverage` green with **≥85% on
   `src/workers/sw-lib/**` and `src/pwa/**`** and global ≥80% intact.
2. Full e2e: existing chromium+firefox suites green (dev server) **and** `pwa` project
   green (preview). `e2e-scenarios.md` statuses updated.
3. Build assertions (S4.4) pass from a clean `npm run clean && npm run build`.
4. `tofu validate`/`plan` clean with the two behaviors.
5. Manual checklist (record results in this doc's status header):
   Lighthouse installability ✅ on preview · DevTools-offline hard reload boots the
   shell with banner · an offline hard reload on a venue route **stays signed in**
   (offline-unvalidated) and renders the snapshot; reconnect revalidates without
   re-login (D11) · rebuild+reload shows the update toast and refreshing applies it ·
   Cache Storage contains no `/events` or `token=` URLs after a full session ·
   sign-out leaves no `venue-data` cache, an empty `score-queue`, and no
   `auth_session_snapshot`.
6. Docs: `assistant-help.md` (S8.2), `IaC-implementation.md` (S7.2), backlog rows for
   the design + implementation docs synced in `BACKLOG.md`.
7. No stray changes: every touched line traces to this plan (CLAUDE.md §3).

**Explicitly out of scope** (design doc §5 — do not build): offline for messaging /
coach / stats / settings / registration reads, per-player cache namespacing, organizer
offline actions, push notifications, Background-Sync-dependent behavior.
