# Project Backlog

Index for design → implementation tracking. Use this to see **what's built**, **which designs still
need an implementation plan**, and **which plans are ready to tackle**. Each linked document links back
here.

## Status legend
| | Meaning |
|---|---|
| ✅ **Built** | Implemented & merged to `main` |
| 📋 **Plan ready** | Implementation plan exists, not started — *available to tackle* |
| 📐 **Design** | Design captured; **needs conversion to an implementation plan** |
| 🧭 **Decision** | Strategy/decision recorded (may have build work pending) |
| 🚧 **In progress** | Being implemented |
| ⏸️ **Deferred** | Intentionally not now (has a trigger to revisit) |
| 🔧 **Reconciliation** | Doc/test debt where a new decision overrides older requirements — resolve *within* the triggering feature's implementation |

---

## Design documents
| Document | Covers | Status |
|---|---|---|
| [MESSAGING_DESIGN.md](assets/planning/MESSAGING_DESIGN.md) | §16 as-built messaging (single-instance MVP) + §17 multi-instance forward design (diagram + R-requirements) | §16 ✅ **Built**; §17 📐 **Design** → has a plan (V2 below) |
| [PLAYER_GROUPS_DESIGN.md](assets/planning/PLAYER_GROUPS_DESIGN.md) | Durable groups, group chat, availability polls, casual-mode group-launched tournaments | 📐 **Design** — **needs an implementation plan** |
| [FRONTEND_PLATFORM_STRATEGY.md](assets/planning/FRONTEND_PLATFORM_STRATEGY.md) | PWA-first now; Capacitor (native wrapper) deferred | 🧭 **Decision** — PWA work pending; Capacitor ⏸️ **Deferred** (trigger documented) |
| [MONETIZATION_STRATEGY.md](assets/planning/MONETIZATION_STRATEGY.md) | How the app earns: transaction fee on entry fees (primary) + organizer SaaS (secondary); ads rejected | 📐 **Design (draft)** — **not yet grilled**, needs detail |
| [DESIGN_SYSTEM.md](assets/planning/DESIGN_SYSTEM.md) | "C U At Court" token-driven design system (tokens + Tailwind v4 + shared component lib) — as-built + gaps (no doc/Storybook/a11y/theming/governance) | 📐 **Design (as-built)** — **not yet grilled**, gaps to scope |

## Implementation plans
| Plan | Drives | Status |
|---|---|---|
| [MESSAGING_IMPLEMENTATION.md](assets/planning/MESSAGING_IMPLEMENTATION.md) | Messaging MVP — Phases P–7 (schema, partitioning, repo, routes+SSE, batching, frontend, coverage) | ✅ **Built & merged** |
| [MESSAGING_IMPLEMENTATION_V2.md](assets/planning/MESSAGING_IMPLEMENTATION_V2.md) | `conversations` abstraction (V1.0, Player-Groups prereq) + §17 multi-instance foundation (Redis bus/queue/token store, worker, dev distributed stack; Redis-required failure mode) + product gaps (offline notify, sender names, thread model, read-receipts) | 📋 **Plan ready** — not started |
| [FRONTEND_IMPLEMENTATION.md](assets/planning/FRONTEND_IMPLEMENTATION.md) | Frontend-quality / rendering tasks driving [FRONTEND_PLATFORM_STRATEGY.md](assets/planning/FRONTEND_PLATFORM_STRATEGY.md) — FE-RENDER-1 (memoize `AuthProvider` value) | 📋 **Plan ready** — not started |

## Test scenarios
| Spec doc | Covers | Status |
|---|---|---|
| [e2e-scenarios.md](e2e-scenarios.md) | Browser e2e scenarios (Gherkin → Playwright) | Phases 1–7 + Messaging ✅ **Built** (17 spec files); **Phases 8–10 ⏳ pending: Offline (4) + Mobile (4) → **folded into PWA-first**; Accessibility (5) → **tracked separately** (general frontend quality)** |

---

## Queues

### ✅ Built (requirements delivered)
- Messaging MVP (single-instance, flat group-feed) — §16 of MESSAGING_DESIGN + MESSAGING_IMPLEMENTATION.
- TIMESTAMPTZ normalization (migration 031); messaging schema/partitioning (032/033); ≥85% coverage gate.

### 📐 Design → needs an implementation plan
- **Player Groups** (PLAYER_GROUPS_DESIGN.md) → create `PLAYER_GROUPS_IMPLEMENTATION.md` (depends on the
  V2 `conversations` abstraction).
- **PWA-first frontend** (FRONTEND_PLATFORM_STRATEGY.md) → create `PWA_FRONTEND_IMPLEMENTATION.md` =
  PWA enablement (manifest, web push, service worker) **+ the Offline (`offline-error.spec.ts`) and
  Mobile/Responsive (`mobile-responsive.spec.ts`) e2e specs** ([e2e-scenarios.md](e2e-scenarios.md)) —
  these *are* the PWA surface. TDD-first.
- **Accessibility e2e** ([e2e-scenarios.md](e2e-scenarios.md)) — 5 a11y scenarios (keyboard nav, input
  labels, button roles, color-independence, error-field association). **Separate frontend-quality item,
  NOT PWA-specific** — applies to any web frontend. → its own spec / general frontend hardening.
- **Monetization** (MONETIZATION_STRATEGY.md) → **grill first** to pick the wedge (transaction fee vs.
  organizer SaaS), then create `MONETIZATION_IMPLEMENTATION.md` (payments integration first).

### 📋 Plan ready → available to tackle
- **MESSAGING_IMPLEMENTATION_V2.md** — foundation-first, TDD. (`conversations` abstraction is now **V1.0**,
  the first task — a shared prerequisite for Player Groups.)
- **FRONTEND_IMPLEMENTATION.md** — frontend-quality tasks (TDD). First task: **FE-RENDER-1** memoize the
  `AuthProvider` context value.

### ⏸️ Deferred (with triggers)
- **Capacitor native wrapper** — trigger: reliable iOS push / app-store presence / engagement for the
  social+availability features (see FRONTEND_PLATFORM_STRATEGY.md).

### 🔧 Reconciliation (doc + test debt from recent decisions)
> Resolve each by **updating the source-of-truth docs (`rac8-4s-HL.md` §9, `REQUIREMENTS.md`) + the
> affected tests** — **within the implementation that triggered it**, not as a standalone task. Left
> unreconciled, implementers build to the stale requirement or code contradicts the docs.

- **R-A — Casual-mode tournament reconciliation** *(triggered by Player Groups / G-CASUAL-1; resolve in
  the Player Groups build).* Introduce a **`tournament mode: scheduled | casual`** concept and carve out
  5 conflicting requirements: deadlines `NOT NULL` → **nullable** (HL 705–707); partner-confirm by
  registration deadline → **N/A** (REQUIREMENTS:21); organizer-manual advance → **auto-advance**
  (REQUIREMENTS:84,140); own-match/organizer scoring → **open scoring**; registration-deadline guard →
  **seeded roster** (REQUIREMENTS:1158). Update HL + REQUIREMENTS; add casual-mode tests **alongside** the
  scheduled-mode ones.
  - **Terminology (PLAYER_GROUPS_DESIGN §6.0):** `mode` (engine: `scheduled | casual`) and **`visibility`
    (`public | unlisted`)** are **two orthogonal axes** — not one concept. The group-launch flow sets
    **both** `visibility = unlisted` **and** `mode = casual` (two fields). We use **`unlisted`**, *not*
    "private," to avoid private/casual confusion. There is **no separate "private tournaments" item** —
    it's the `visibility` attribute. (HL:1140 "only public shown" → the `unlisted` browse-filter carve-out.)
- **R-B — PWA reconciliation** *(triggered by PWA-first; resolve in the PWA build).* HL **already**
  mandates PWA + Service Workers + IndexedDB sync queue + "Offline - will retry" banner (HL
  21/112/137/172/589) — the PWA plan **folds these in, doesn't reinvent**. Promote **push notifications
  "future" → in-scope** (web push). Update the HL roadmap status; reference existing offline reqs.

### 🗒️ Open design threads (not yet grilled/decided)
- MESSAGING_DESIGN §17.2 (offline), §17.4 (thread model), §17.5 (sender names), §17.6 (read-receipt
  visibility) — recommendations only, not yet confirmed.
- Player Groups: **group-chat moderation policy** (abuse/reporting/leave), group discovery/privacy,
  custom-option polls, admin role.
- Monetization (MONETIZATION_STRATEGY.md §6): wedge choice (transaction fee vs. organizer SaaS), pricing
  shape, payments integration (Stripe Connect), tax/compliance, free-forever community boundary.
- Design system (DESIGN_SYSTEM.md §4): formality bar (doc-only vs. + Storybook/visual regression),
  portability, a11y bar, theming/dark-mode scope, token-usage governance, component API contracts.

---

*Convention: every design/implementation doc under `assets/planning/` that belongs to this backlog
carries a "🗂️ Tracked in the [project backlog](../../BACKLOG.md)" link near its top.*
