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

---

## Design documents
| Document | Covers | Status |
|---|---|---|
| [MESSAGING_DESIGN.md](assets/planning/MESSAGING_DESIGN.md) | §16 as-built messaging (single-instance MVP) + §17 multi-instance forward design (diagram + R-requirements) | §16 ✅ **Built**; §17 📐 **Design** → has a plan (V2 below) |
| [PLAYER_GROUPS_DESIGN.md](assets/planning/PLAYER_GROUPS_DESIGN.md) | Durable groups, group chat, availability polls, casual-mode group-launched tournaments | 📐 **Design** — **needs an implementation plan** |
| [FRONTEND_PLATFORM_STRATEGY.md](assets/planning/FRONTEND_PLATFORM_STRATEGY.md) | PWA-first now; Capacitor (native wrapper) deferred | 🧭 **Decision** — PWA work pending; Capacitor ⏸️ **Deferred** (trigger documented) |

## Implementation plans
| Plan | Drives | Status |
|---|---|---|
| [MESSAGING_IMPLEMENTATION.md](assets/planning/MESSAGING_IMPLEMENTATION.md) | Messaging MVP — Phases P–7 (schema, partitioning, repo, routes+SSE, batching, frontend, coverage) | ✅ **Built & merged** |
| [MESSAGING_IMPLEMENTATION_V2.md](assets/planning/MESSAGING_IMPLEMENTATION_V2.md) | §17 multi-instance foundation (Redis bus/queue/token store, worker, dev distributed stack) + product gaps (offline notify, sender names, thread model, read-receipts) | 📋 **Plan ready** — not started |

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

### 📋 Plan ready → available to tackle
- **MESSAGING_IMPLEMENTATION_V2.md** — foundation-first, TDD. (Note: the `conversations` abstraction in
  its foundation is a shared prerequisite for Player Groups.)

### ⏸️ Deferred (with triggers)
- **Capacitor native wrapper** — trigger: reliable iOS push / app-store presence / engagement for the
  social+availability features (see FRONTEND_PLATFORM_STRATEGY.md).

### 🗒️ Open design threads (not yet grilled/decided)
- MESSAGING_DESIGN §17.2 (offline), §17.4 (thread model), §17.5 (sender names), §17.6 (read-receipt
  visibility) — recommendations only, not yet confirmed.
- Player Groups: **group-chat moderation policy** (abuse/reporting/leave), group discovery/privacy,
  custom-option polls, admin role.

---

*Convention: every design/implementation doc under `assets/planning/` that belongs to this backlog
carries a "🗂️ Tracked in the [project backlog](../../BACKLOG.md)" link near its top.*
