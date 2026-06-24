# Frontend Platform Strategy
## PWA-first now; native via Capacitor deferred

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-24
**Status:** ✅ DECISION — **PWA-first**; **Capacitor wrapper deferred** (clear trigger below).

---

## Decision
Keep building the **single React/Vite web app** and deliver it as an **installable PWA**. **Defer**
native apps — and when native is warranted, **wrap the existing React app in Capacitor** rather than
rewrite. **No full native (Swift/Kotlin) rewrite** is planned.

## Why (the framing that matters)
- **The UI rendering is *not* the bottleneck.** React on the web builds excellent chat/poll/live-bracket
  UX (Slack, Discord, WhatsApp Web prove it). "Is HTML enough for the UI?" — yes.
- **The pressure is platform *capabilities*** the new social/availability features need:
  **push notifications, background wake, offline, and home-screen engagement.** That's where web/PWA
  strains — *not* the rendering.
- **iOS push is the crux.** The availability layer ("Who's in tonight?"), group chat, and tournament
  alerts *live on push*. **iOS web push works only for an *installed* PWA (iOS 16.4+), with limits** —
  unreliable for casual Safari users. That single gap is the real driver toward native.

## PWA-first — build now
- **Installable PWA** (manifest, home-screen install prompt).
- **Web push** — good on Android; iOS only when installed (accept the limitation for now).
- **Service worker** — offline caching + background sync (aligns with the existing Phase-8 "Offline
  Support" scenarios; useful at courts with poor signal).
- **Includes the Offline + Mobile/Responsive e2e specs** (`e2e-scenarios.md`):
  `offline-error.spec.ts` + `mobile-responsive.spec.ts` — written TDD-first as part of this work, since
  they *are* the PWA surface. (The 5 **Accessibility** scenarios are **tracked separately** — general
  frontend quality, not PWA-specific.)
- Cost: ~free, on the existing codebase.

## Capacitor — DEFERRED (the native path when triggered)
- **What:** wraps the *same* React app as real iOS/Android apps (WebView + native plugin bridge),
  shippable to the App Store / Play Store. **~95% code reuse, single codebase, no UI rewrite.**
- **Solves:** **native push via APNs (iOS) / FCM (Android)** — the reliable iOS push PWA can't give —
  plus store presence + better background/offline.
- **Cost:** Capacitor framework + official plugins are **free/MIT**. Real spend is platform fees:
  **Apple Developer $99/yr**, **Google Play $25 once**, and a **Mac + Xcode** for iOS builds. (Optional
  paid Ionic add-ons like Appflow are *not* needed.)
- **Production-grade:** mature (since 2019, Capacitor 8 in 2025, ~1.5M+ installs/yr); ships flagship
  consumer apps — **Burger King** (primary consumer app), **H&R Block**, **AAA**, **PwC**, **Southwest**.
  WebView fit is proven for content/chat/CRUD apps like this one.

### Trigger to revisit Capacitor (build it when ANY of these holds)
1. **Reliable push — especially iOS — becomes critical** (the availability-poll / group-chat
   notifications prove out and iOS users are underserved by web push).
2. **App-store presence / discoverability** is needed for growth of the community features.
3. **Engagement** demands a first-class home-screen app + native background behavior.

Until a trigger fires, native is **speculative** — PWA covers the experience at near-zero cost.

## Architecture: single SPA, not micro-frontends
The frontend is **one monolithic React/Vite SPA** (`packages/frontend`, single bundle, client-side
`react-router` routing) — **micro-frontends are deliberately not used.** Micro-frontends are an
*organizational* scaling tool (multiple autonomous teams shipping independent deployables), not a
technical one. This is one team, one codebase, one deployable — and they would actively fight the
**PWA-first** direction (fragmented service-worker / cache scopes) and the deferred **Capacitor** path
(which wraps a single `dist/`). New surfaces (groups, polls, casual brackets) are **new routes/tabs in
the same app**, sharing one auth/token store, SSE connection, and React Query cache. Revisit only if
*separate teams* ever need independent deploy cadences; until then, use feature folders / lazy-loaded
routes for modularity — not a runtime integration layer.

## Rendering requirements (core)
Re-rendering must stay **targeted**, not app-wide: React Query scopes data-driven renders to subscribers,
local UI state stays in leaves, and hot list rows (`MatchCard` / `StandingsTable`) are `React.memo`'d.

- **FE-RENDER-1 — context providers must not fan out re-renders to unrelated consumers.** The known gap is
  the unmemoized `AuthProvider` value in `hooks/useAuth.tsx`. *Task + TDD detail in*
  [`FRONTEND_IMPLEMENTATION.md`](./FRONTEND_IMPLEMENTATION.md).

## Notes
- Aligns with the HL roadmap, which already listed native apps as "future."
- When triggered: `npx cap add ios/android` over the Vite `dist/`, add the Push plugin, wire APNs/FCM,
  ship — no rewrite. Operational item: Google Play's Nov-2025 Capacitor compatibility requirement
  (keep tooling current).
