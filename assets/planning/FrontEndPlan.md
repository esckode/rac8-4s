# Frontend Plan — Gap Inventory (pre-grilling)
## Consolidated frontend gaps for the community layer + cross-cutting FE concerns

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-26
**Status:** ✅ GRILLED 2026-06-30 (Q1–Q16) → **plan written:**
[`PLAYER_GROUPS_V2_IMPLEMENTATION.md`](./PLAYER_GROUPS_V2_IMPLEMENTATION.md) (3 phases). §A + §B.4 + §B.5 are
resolved there. §B.2 (PWA) and §B.3 (a11y) remain routed to their own tracks; §B.1 already ✅. This document
is retained as the **gap inventory / rationale that fed the grill** — the V2 plan is the source of truth.
**Update (2026-06-30):** the **baseline** Player-Groups FE shipped with
[`PLAYER_GROUPS_IMPLEMENTATION.md`](./PLAYER_GROUPS_IMPLEMENTATION.md) (G0.1 DOB screen, G2.5 My Groups
tab/group page/unread badge, G3.3 poll cards, G4.8 launch + leaderboards — all merged to `main`). The **§A
refinements below remain ungrilled** (member-mgmt actions, per-group notify UI, @mention composer,
invite-accept landing, mixer display, launch sheet, empty/error states) — they go beyond what shipped.
**Why this exists:** there is currently **no consolidated frontend implementation plan**. FE coverage is
scattered across a one-task stub (`FRONTEND_IMPLEMENTATION.md`), a strategy decision
(`FRONTEND_PLATFORM_STRATEGY.md`), an un-grilled design system (`DESIGN_SYSTEM.md`), historical task specs
(`TASK19_*`, `TASK7_1/7_2`), and the **now-built baseline FE tasks** inside
`PLAYER_GROUPS_IMPLEMENTATION.md` (G0.1, G2.5, G3.3, G4.8). This doc collects what's still missing (§A
refinements + §B cross-cutting) so it can be grilled in one pass.

---

## 0. Current state (what exists today)
| Source | What it is | Gap |
|---|---|---|
| `FRONTEND_IMPLEMENTATION.md` | 1 task (FE-RENDER-1: memoize `AuthProvider`) | not a plan |
| `FRONTEND_PLATFORM_STRATEGY.md` | PWA-first **decision** (Capacitor deferred) | no implementation tasks |
| `DESIGN_SYSTEM.md` | "C U At Court" tokens + Tailwind v4 + shared lib (as-built) | **not yet grilled**; no governance/a11y/theming bar |
| `FRONTEND_TECH_STACK.md` | stack reference | n/a |
| `TASK19_*`, `TASK7_1_RESPONSIVE_DESIGN`, `TASK7_2_ACCESSIBILITY_AUDIT` | **historical** per-task design specs/wireflows | not forward-looking for community features |
| `PLAYER_GROUPS_IMPLEMENTATION.md` (G0.1/G2.5/G3.3/G4.8) | baseline FE ✅ **built & merged** (DOB screen, My Groups tab/page, poll cards, leaderboards) | §A refinements still open |
| `ResponsiveLayout.tsx` | the bottom-nav shell (current tabs 🏆/📊/🎾) | adding 👥 = a 4th slot (§B.4) |
| `a11y-audit.spec.tsx` | an existing a11y audit spec | new surfaces not covered (§B.3) |

**Backlog already flags three FE plan docs as *to-be-created*:** `PWA_FRONTEND_IMPLEMENTATION.md`, an
accessibility spec, and a grilled design-system scope. This inventory should inform all of them.

---

## A. Player-Groups-specific FE gaps
*These belong to the community layer; the backend exists or is planned in `PLAYER_GROUPS_IMPLEMENTATION.md`
but the FE is unspecified. Each needs a grilled decision → task.*

### A.1 — Member-management UI (owner controls)
Backend G1.2 builds **multi-owner** promote/demote/kick + last-owner auto-transfer; G2.5 only lists a *read*
Members panel.
- **Open:** Where do promote/demote/remove live (member row actions vs a manage screen)? Confirmation UX for
  destructive actions (kick, demote-last-owner → auto-transfer)? How is "you were removed/demoted" surfaced
  to the affected member? Owner-vs-member view differences?

### A.2 — Per-group notification-preferences UI
Backend G2.4 ships the 3-level `notify_level` (`all | mentions_polls | muted`); nothing renders the control.
- **Open:** Placement (group settings vs a bell toggle on the group header)? Default-state affordance
  (showing it's `mentions_polls`)? Any digest/quiet-hours surface, or strictly the 3 levels?

### A.3 — @mention composer
Backend G2.4 parses mentions; the **composer-side autocomplete/picker** to create one is unspecified.
- **Open:** Trigger UX (`@` autocomplete over group members)? Rendering of a mention in the stream? Mobile
  keyboard ergonomics? Does mentioning a non-member do anything?

### A.4 — Invite-accept landing flow (invitee side)
Backend G1.3 mints an email-bound token; G2.5 covers only the owner's "invite by email" side.
- **Open:** The invitee's click → email-verify → DOB/age-gate (G0.1 fires here) → "you've joined <group>"
  flow. Logged-in vs new-user paths? Expired/used-token error screen? First-run into the group page?

### A.5 — Casual live-scoring + mixer-state UX
G4.8 says "open entry," but court-side phone scoring and the **mixer display** are novel.
- **Open:** How is "who's playing now" shown court-side? **Mixer rotation** view — who partners whom this
  round, who's **sitting out** (§11.11)? Fast score entry on mobile? Who-submitted indicator (open scoring,
  editor logged)? Edit-until-terminal affordance?

### A.6 — Tournament-launch confirmation flow
§11.9 format override at launch, In-voter **seed preview**, auto-launch-on-close toggle — not broken out.
- **Open:** Launch sheet contents (preview the seeded In-voters, flip singles/doubles, set auto-launch)?
  Confirmation + the resulting `system` message link? Who sees the launch affordance (poll creator only)?

### A.7 — Group navigation & IA
G-UI-1…3: 👥 "My Groups" tab, Group page (**Chat · Members · invite**), **badges on nav tabs**, no unified
inbox.
- **Open:** Group-page tab/section layout? Group list empty/È-many states? How unread badges aggregate
  (per-group vs the nav tab)? Deep-link from a `system` launch message into the new tournament?

### A.8 — Empty / loading / error / offline states (community surfaces)
Unlisted across the FE tasks.
- **Open:** Invited-but-in-no-groups; poll with zero votes; leaderboard with no matches; send-failure;
  reconnecting. (Ties to §B.2 offline and §B.5 SSE reconnect.)

### A.9 — Age-gate onboarding screen (G0.1) detail
G0.1 names a "neutral DOB screen" but no FE spec.
- **Open:** Neutral DOB entry (not a yes/no), under-18 rejection copy/flow, where it interrupts each of the
  3 entry paths (registration, signup, invite-accept), backfill prompt for existing players.

---

## B. Cross-cutting FE concerns (owned by other tracks — must be grilled & cross-referenced)
*These aren't Player-Groups-only; they're platform FE decisions the community work depends on.*

### B.1 — Design-system bar & governance (`DESIGN_SYSTEM.md`, not yet grilled)
- **Open:** Must all new surfaces (poll card, leaderboard, chat, member mgmt) use the token/component lib?
  Formality bar (doc-only vs + Storybook/visual-regression)? Component API contracts? Theming/dark-mode
  scope? Token-usage governance? *(Mirrors the backlog "design system §4" open thread.)*
- **Resolved (token-usage governance):** See
  [DESIGN_SYSTEM_ENFORCEMENT.md](./DESIGN_SYSTEM_ENFORCEMENT.md) — token-usage lint gate is implemented and
  enforced in CI.

### B.2 — PWA / mobile / web push (`FRONTEND_PLATFORM_STRATEGY.md`, PWA pending)
- **Open:** §11.7 notifications on mobile **are web push** (PWA capability, still pending). Group chat is
  **durable** — does it read **offline**? Install/manifest/service-worker scope? This crosses the
  to-be-created `PWA_FRONTEND_IMPLEMENTATION.md`. *(Backlog R-B promotes web push "future → in-scope".)*

### B.3 — Accessibility bar (separate tracked item; `a11y-audit.spec.tsx` exists)
- **Open:** A11y acceptance for new surfaces — keyboard nav, input labels, button roles,
  color-independence, error-field association, and **`aria-live` for the live SSE poll tally / new chat
  messages**. Which bar (the 5 tracked a11y scenarios) applies to community surfaces?

### B.4 — Bottom-nav real-estate
Adding 👥 makes a **4th** tab in `ResponsiveLayout.tsx` (current 🏆/📊/🎾).
- **Open:** Do 4 tabs fit, or is an overflow / nav redesign needed? Tablet/desktop layout?

### B.5 — SSE reconnect / message backfill
Messaging V2 prod-readiness flagged **"SSE catch-up on reconnect"** as open; for **durable** group chat,
missed-message backfill on the client matters.
- **Open:** `Last-Event-ID`/backfill on the client for chat + poll-tally streams; reconnection UX.

---

## Cross-references
- Community backend + baseline FE: [`PLAYER_GROUPS_IMPLEMENTATION.md`](./PLAYER_GROUPS_IMPLEMENTATION.md)
  (✅ built & merged, incl. FE tasks G0.1/G2.5/G3.3/G4.8; §A refinements below extend it).
- Decisions feeding the FE: [`PLAYER_GROUPS_DESIGN.md`](./PLAYER_GROUPS_DESIGN.md) §4 (UI), §5 (polls), §6
  (launch), §11 (decisions), §12 (age-gate onboarding).
- Cross-cutting tracks: [`FRONTEND_PLATFORM_STRATEGY.md`](./FRONTEND_PLATFORM_STRATEGY.md) (PWA),
  [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md), and the backlog's pending `PWA_FRONTEND_IMPLEMENTATION.md` +
  accessibility spec.
- Existing FE scaffolding to reuse/extend: `ResponsiveLayout.tsx` (nav), `a11y-audit.spec.tsx`,
  `develop-frontend-page` skill.

## Next step
✅ Done — the `/grill-me` session (2026-06-30, Q1–Q16) resolved §A + §B.4 + §B.5 into
[`PLAYER_GROUPS_V2_IMPLEMENTATION.md`](./PLAYER_GROUPS_V2_IMPLEMENTATION.md) (3 phases, TDD-first). Remaining:
execute that plan; seed `PWA_FRONTEND_IMPLEMENTATION.md` (§B.2) and the accessibility spec (§B.3) from their
own tracks.
