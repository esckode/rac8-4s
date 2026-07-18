# PWA Service-Worker Caching Design

**Date:** 2026-07-18
**Status:** ✅ GRILLED to resolution (all forks below decided with owner) — NOT yet built.
**Scope:** Caching strategy only — what to precache, per-request policies, staleness UX,
auth hygiene, sync queue, update flow. The PWA *shell* work (manifest, icons,
theme-color, CloudFront headers, build wiring via `vite-plugin-pwa`) is captured as a
requirements checklist in §6 — installability prerequisites with no design forks.

---

## Executive Summary

The repo already contains a service worker (`packages/frontend/src/workers/service-worker.ts`)
with an offline page, cache-first GETs, and an IndexedDB replay queue — **but it is dead
code**: no build step emits it, so the registration in `main.tsx` 404s silently. Before
shipping it, the caching strategy was grilled because the as-written behavior has four
serious defects (§3).

The resolved design: **"venue mode"** — a player at a court with bad signal can view
their tournament (list, matches, standings, bracket) from a timestamped offline snapshot
and submit scores into an explicit, visible replay queue. Everything else is online-only.
The guiding principle: **never misrepresent state** — stale data is always labeled, queued
writes are never shown as submitted, and no write outside score submission ever replays
silently.

---

## 1. Decision table

| # | Fork | Decision | Rationale |
|---|------|----------|-----------|
| D1 | What is offline *for*? | **Venue mode**: read tournament data + queue score submits at a bad-signal court. Not app-shell-only; not a full offline mirror. | Matches the mobile-first, at-the-venue reality and the existing `sync-scores` intent. Full mirror deferred — not warranted before paid launch. |
| D2 | Which API reads are cached? | **Venue reads** (endpoint mapping amended 2026-07-18 — see note below the table): `GET /player/tournaments` (tournament list) + `GET /tournaments/:id/bundle` (the consolidation endpoint all four venue views actually consume). | Exactly the court-side views. Registration-phase reads (partners, requests) are pre-tournament, done with signal, and go stale under you. SSE, messaging, coach, settings, stats, admin: network-only. |
| D3 | Read policy for core four | **Network-first** (~3–4s timeout), cache fallback only on failure; every success refreshes the cache. | Online users always see truth. SW-level SWR/cache-first would duplicate React Query (in-session) and fight SSE (live pushes), and can paint an outdated bracket as current. |
| D4 | Staleness UX | **Banner + timestamp**: global "Offline — showing saved data" banner (visual family of `ReconnectingIndicator`, distinct copy/color) + "Updated HH:MM" per venue view, driven by a cached-at header the SW stamps on fallback responses. | A player must be able to tell a 2-minute snapshot from a 2-hour one ("am I on court 3 next?"). Existing indicator is chat-scoped ("Reconnecting…") — wrong semantics to reuse. |
| D5 | Sign-out hygiene | **Wipe on sign-out**: `/signout` messages the SW to delete the API data cache + IndexedDB queue before clearing the JWT; also wipe when a different account signs in. Static asset cache stays. | Core-four responses are player-scoped; Cache Storage survives logout. Shared/borrowed phones + paid accounts ⇒ privacy requirement. Per-player cache keys deferred until evidence of missed wipes. |
| D6 | Retention | **48h TTL**: fallback path ignores entries older than 48h ("no saved data" instead of a snapshot); prune on SW activate. | Covers a weekend event; prevents month-old brackets resurfacing and unbounded growth. Historical results belong to `/stats`, not the cache. |
| D7 | Queue scope | **Scores only**: `POST/PATCH …/score` (group + knockout variants). All other writes fail fast with a clear offline error. | The current queue-everything code would silently replay organizer `advance`/`bracket/publish` and, post-monetization, **Stripe payment calls** — indefensible. Organizer score-edits stay online (desk has wifi; avoids replay-ordering questions). |
| D8 | Queue UX + failure semantics | **Explicit pending state**: SW's `202 QUEUED` renders as "Saved offline — will send when connected" (never as success). On replay, SW messages the app: success → clear + refresh; 401 → keep queued, prompt "sign in to finish submitting"; other 4xx (e.g. already scored) → drop from queue + "Not applied — already recorded as X". Queue entries share the 48h TTL. | `useScoreSubmit` currently treats any 2xx as success — an offline submit would look submitted forever. Never blind-retry a 4xx; never let a days-old score land silently. |
| D9 | Update flow | **Prompt to refresh**: new SW precaches, then waits; app shows "Update available — Refresh" toast (`vite-plugin-pwa` prompt mode); tap → `skipWaiting` + reload. Periodic update check while open. | Current `skipWaiting`+`clients.claim` seizes live tabs and breaks lazy-loaded hashed chunks mid-session — the one failure a court-side player can't recover from. Next-launch-only is too slow for urgent fixes during a live tournament (installed PWAs stay "open" for days). |
| D10 | Offline navigation | **Precached app shell** is the navigation fallback (network-first → cached `index.html`); the real app boots offline and shows venue views + banner. **`offline.html` kept only as last resort** (Cache Storage eviction edge). | Without shell fallback, cached venue data exists but is unreachable — contradicts D1. offline.html already exists + tested; keeping it as final catch is ~free. |

### Amendment 2026-07-18 — D2 endpoint mapping (implementation recon)

The original D2 named four literal paths (`/tournaments/:id/matches`, `…/standings`,
`…/bracket` alongside `/player/tournaments`), taken from the exported getters in
`api/client.ts`. Implementation recon found that **three of those getters
(`fetchMatches`, `fetchStandings`, `fetchBracket`) are dead code with zero production
callers** — the Matches/Standings/Bracket/Details tabs all consume a single
consolidated `GET /tournaments/:id/bundle` via `useTournament()` (predates this doc).
Caching the literal original paths would have made offline venue mode a silent no-op.

The **decision is unchanged** — the four venue views are cached, nothing else — only
the endpoint mapping is corrected: allowlist = `/player/tournaments` + `/tournaments/:id/bundle`.
Wherever this doc says "core four" it means the four venue *views*, served by these two
endpoints. Implications: (a) the three `TournamentDetail` tabs share the bundle's single
cached-at — one identical "Updated HH:MM" across tabs, which is fine for D4; (b) the
bundle sends its Bearer token in the `Authorization` header, not the URL, so the
token-URL exclusion (§2) is not triggered; (c) `useTournament` performs its own raw
`fetch`, bypassing `apiFetch` — the D4 fallback-header sniff must live in both places;
(d) the dead getters stay in place per CLAUDE.md §3 (mention, don't delete) and their
paths are deliberately **not** cached.

### Amendment 2026-07-18 — D11: offline session survival (implementation recon)

**The gap:** venue mode as designed cannot work for its main persona. On every page
load, `useAuth`'s `restoreSession()` validates the stored token via `GET /api/auth/me`
(falling back to `GET /player/session` for magic-link players — but only on a real HTTP
401). When offline, that first fetch **rejects with a network error**, landing in a
blanket `catch` that **deletes the token from localStorage** and signs the player out.
An offline reload of a venue route therefore shows the login page — the cached snapshot
never renders — and the session is destroyed even for when signal returns. Magic-link
tokens are opaque (not JWTs), so client-side token decoding is not an option; identity
must be persisted at validation time. Neither D1–D10 nor §2 addressed this.

**Decision (D11):**
1. On every **successful** auth validation (account `/api/auth/me` OK, player
   `/player/session` OK) and on login/signup/verify, persist a minimal **session
   snapshot** to localStorage: `{ user, validatedAt }` — identity fields only, no
   token duplication.
2. `restoreSession()` distinguishes **server rejection from network failure**:
   - HTTP 401 (server reached, token rejected): existing fallback chain; if it also
     fails → clear token + snapshot. Unchanged semantics.
   - Fetch rejection (offline/unreachable): **never delete the token.** If a snapshot
     exists with `validatedAt` within the trust window, restore `user` from it and mark
     the session **offline-unvalidated**. No snapshot / too old → signed-out UI state,
     token still kept for later revalidation.
   - Unexpected 5xx: treated as network failure (token kept), not as rejection.
3. **Trust window ⚖ = 48h**, deliberately reused from D6: offline identity never
   outlives the offline data it unlocks. (Owner-tunable lever; changing it decouples
   identity trust from snapshot retention.)
4. **Revalidate on reconnect** (`online` event / app foreground): re-run validation; a
   genuine 401 then clears token + snapshot and triggers the D5 wipe.
5. The D5 sign-out wipe **extends to the snapshot**.

**Security posture:** trusting a stored token + identity snapshot offline is the same
threat model as device possession of a logged-in installed app; the 48h bound means
nothing offline-visible outlives the window of the data it exposes (D6).

## 2. Settled technical facts (not forks)

- **SSE is excluded and must never be cached.** `GET /tournaments/:id/events?token=<JWT>`
  is a live stream **with the auth token in the URL** — the current catch-all GET handler
  would write that URL into Cache Storage. The SW must pass `/tournaments/*/events`
  through untouched (and generally never cache any token-bearing URL).
- **Routing is path-based.** All API traffic is same-origin (`/api`, `/tournaments`,
  `/player`), so asset-vs-data policy is decided by an explicit path allowlist, not origin.
- **Replay triggers are belt-and-braces.** The Background Sync API (`sync` event) does
  not exist on iOS Safari — the primary court-side platform. Replay fires on SW startup,
  on connectivity regain, and on app foreground; the `sync` event remains a Chromium bonus.
- **Static hashed assets**: precached via the injected manifest (Workbox), cache-first,
  old versions auto-cleaned on activate. Not a fork — standard and safe for hashed names.

## 3. Defects in the current (dead) service worker

1. **Never built/shipped** — no Vite entry emits `/service-worker.js`; registration 404s
   into a silent `console.warn`. All offline logic is dead code in production.
2. **Stale-as-fresh** — cache-first on *all* GETs, including `index.html` (users pinned to
   old app versions) and API data (old standings shown as current).
3. **No cache versioning cleanup** — hardcoded `tournament-v1`, `activate` never deletes
   old caches.
4. **Queue-everything** — every failed POST/PUT/PATCH queued for replay, including
   organizer actions and (future) payments (→ D7).
5. **Orphaned sync tag** — SW listens for `sync-scores` but nothing ever registers it;
   queued requests would never replay.
6. **SSE/token hazard** — catch-all GET caching would break the event stream and persist
   token-bearing URLs (§2).
7. **Fake 202 read as success** — client has no `QUEUED` awareness (→ D8).

## 4. Client-side work implied by the decisions

- `useScoreSubmit`: recognize `202 QUEUED`; pending-state rendering on match cards.
- SW→app messaging channel for replay outcomes (success / needs-auth / rejected) and
  for the wipe command from `/signout`.
- Offline banner + per-view "Updated HH:MM" on the four venue views (D4).
- `useAuth`: offline session survival per amendment D11 — network-failure ≠ 401,
  session snapshot, revalidate on reconnect. Without this, every other item on this
  list is unreachable offline behind `ProtectedRoute`.
- Update toast wired to `vite-plugin-pwa` prompt hooks (D9).
- Re-enable/adapt `offline-flow` tests against the real built worker; per TDD, scenario
  docs + failing tests precede the implementation.

## 5. Explicitly out of scope / deferred

- Full offline mirror (messages, groups, stats, settings) — revisit only on demand signal.
- Per-player cache namespacing (D5 fallback) — only if wipe proves unreliable.
- Registration-phase reads offline (D2) — pre-tournament flows assume signal.
- Organizer offline actions of any kind.
- Push notifications — separate design; not part of caching.

## 6. PWA shell requirements (checklist — no design forks)

The installability prerequisites around the caching design. These are checklist items,
not grilled decisions; R-numbers for backlog syncing.

**R1 — Build & registration wiring.**
- Add `vite-plugin-pwa` in **`injectManifest`** mode pointed at the existing worker
  (`srcDir: 'src/workers'`, `filename: 'service-worker.js'` — keeping the path
  `main.tsx` already registers), `registerType: 'prompt'` per D9.
- Replace the manual `navigator.serviceWorker.register(...)` block in `main.tsx` with
  the plugin's `virtual:pwa-register` (`registerSW`) — the two registrations must not
  coexist, and the plugin's `onNeedRefresh` hook is what drives the D9 toast.
- Verify after `npm run build`: `dist/` contains the compiled worker with the injected
  precache manifest.

**R2 — Web app manifest.** `manifest.webmanifest` with `name` ("C.U.At.Court"),
`short_name`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `theme_color`,
`background_color`, and `icons` (R3), linked via `<link rel="manifest">` in
`index.html` (the plugin can generate and inject this).

**R3 — Icons.** 192×192 and 512×512 PNGs plus a `purpose: "maskable"` variant in the
manifest, and a 180×180 `apple-touch-icon` in `index.html` — required separately
because iOS Safari ignores manifest icons. Also fix the favicon: `index.html`
references `/vite.svg`, which doesn't exist in `public/` (404s in prod today).

**R4 — Meta tags.** `<meta name="theme-color">` in `index.html`, matching the manifest
value.

**R5 — CloudFront / deploy.** In `infra/modules/frontend/main.tf`, add ordered cache
behaviors for `/service-worker.js` and `/manifest.webmanifest` using the existing
`caching_disabled` managed policy (same pattern as the `local.api_path_patterns`
loop), and set `Cache-Control: no-cache` metadata on those two objects in the S3
upload step. Without this, a deployed SW update sits behind the edge cache and never
reaches installed clients. HTTPS is already satisfied by CloudFront; `localhost` is
exempt for dev.

**R6 — Installability acceptance criteria.** Done means: the Lighthouse installability
audit passes on the deployed site; Chrome/Android offers the install prompt; iOS
Add-to-Home-Screen shows the correct name and icon; and the installed app launches
standalone (no browser chrome) and boots offline into the D10 shell.

**R7 — Docs & tests in the same change.** Per CLAUDE.md §9, offline behavior and
install instructions are user-visible — update `docs/assistant-help.md` (the @coach
corpus) in the same change. Per TDD (§4), e2e scenario docs and failing tests precede
the implementation.
