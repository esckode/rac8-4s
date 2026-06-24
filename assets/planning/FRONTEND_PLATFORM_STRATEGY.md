# Frontend Platform Strategy
## PWA-first now; native via Capacitor deferred

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

## Notes
- Aligns with the HL roadmap, which already listed native apps as "future."
- When triggered: `npx cap add ios/android` over the Vite `dist/`, add the Push plugin, wire APNs/FCM,
  ship — no rewrite. Operational item: Google Play's Nov-2025 Capacitor compatibility requirement
  (keep tooling current).
