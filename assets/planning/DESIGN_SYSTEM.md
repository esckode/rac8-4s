# Design System — "C U At Court"

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-24
**Status:** 📐 DESIGN (as-built documented) — **not yet grilled.** A token-driven system **exists and is
in use**; this captures the current state and the known gaps. **Grill later** to turn the gaps into
concrete requirements (§4).

---

## 1. What it is
A **token-driven design system**, informal but real: tokens are the source of truth, Tailwind v4 is the
delivery mechanism, and a shared component library provides the primitives. Not formally documented,
catalogued, or published — lives in `tokens.css` + folder convention.

## 2. As-built inventory

### 2.1 Design tokens — `packages/frontend/src/styles/tokens.css`
Structured token set on `:root` (branded "C U At Court"):
- **Brand palettes:** Court Blue (`--court-50…900`) + Lavender (`--lavender-*`), numbered scales.
- **Accents:** mint / peach / pink / rose / gold (pastel utility scales).
- **Neutrals:** "ink" scale (`--ink-50…900`); **surfaces** (tint / sunken / glass; gradient app bg).
- **Scales:** radius (`--r-xs…3xl`, `--r-full`), shadow (`--shadow-xs…xl` + `--shadow-focus`),
  spacing (`--s-1…16`).
- **Type:** display / UI / mono font families (Fredoka / Plus Jakarta Sans / JetBrains Mono).
- **Semantic tokens:** `--phase-reg-open`, `--phase-reg-closed`, `--phase-group`, `--phase-knockout`,
  `--phase-complete` — domain meaning mapped onto raw colors (a real system, not just a palette).

### 2.2 Delivery — Tailwind v4
`globals.css` imports `tailwindcss` + `tokens.css` + `responsive.css`. Components consume tokens via
arbitrary-value utilities (`px-[--s-4]`, `text-[--ink-900]`, `rounded-[--r-lg]`, `border-[--border]`).
Tokens are the source of truth; Tailwind applies them. (Tailwind 4.3 is hoisted to the **workspace-root**
`package.json`, not the frontend package.)

### 2.3 Shared component library — `packages/frontend/src/components/shared/` (`index.ts`)
Primitives: `Button`, `Badge`, `Modal`, `ErrorBanner` / `SuccessBanner`, `LoadingSpinner`,
`SkeletonLoader`, `PaginationControls`, `Logo` / `LogoMark`. Domain components: `MatchCard`,
`StandingsTable`, `TournamentCard`, `PhaseIndicator`, `ResponsiveLayout`.

### 2.4 Reference design
`packages/reference_ui_design/cuatcourt` — the visual reference the tokens derive from.

## 3. Known gaps (to confirm/scope when grilled)
- **No design-system documentation** — no doc covering token meanings, scales, component APIs, or usage
  rules. Knowledge is tribal (lives in `tokens.css` + convention).
- **No Storybook / component catalog** — no isolated component dev, no visual inventory, no
  visual-regression coverage.
- **Not a versioned/published package** — in-app folder convention, not a consumable library (fine for
  one app; not portable — relevant only if a second surface ever consumes it).
- **No documented a11y guidance, and unverified** — the 5 Accessibility e2e scenarios are still pending
  (see backlog / [e2e-scenarios.md](../../e2e-scenarios.md)); tokens/components aren't yet checked against
  keyboard / contrast / labeling.
- **No dark mode / theming story** — tokens are a single light theme; no documented theming contract.
- ~~**Token governance** — no stated rule that components must use tokens (no lint guard against raw
  hex / off-scale spacing).~~ **Resolved** — see [§3.1](#31-token-governance-color).

### 3.1 Token governance (color)
All color values in `packages/frontend/src/**/*.{ts,tsx}` must use CSS design tokens (e.g.,
`text-[--ink-900]`, `var(--court-500)`). Raw hex, `rgb()/rgba()`, `hsl()/hsla()` literals are banned by an
ESLint `no-restricted-syntax` rule that CI enforces at `--max-warnings 0`.

**Permanent allowlist** (exempt forever): `Logo.tsx` / `LogoMark.tsx` (brand-mark SVG fills), `tokens.css`
(defines the colors), and `DesignSpec.tsx` (unrouted reference artifact).

**Interim baseline:** 10 legacy files carry `/* eslint-disable no-restricted-syntax -- TODO(token-debt) */`
at the top. These are tracked debt, greppable via `grep -rn 'TODO(token-debt)' packages/frontend/src`. Each
will be retrofitted in Phase E5 and its disable comment removed. Touching a baselined file before E5 is
permitted — remove the disable comment once the file is clean.

Full implementation plan: [DESIGN_SYSTEM_ENFORCEMENT.md](./DESIGN_SYSTEM_ENFORCEMENT.md).

## 4. Open questions for the grilling session
- **How formal does this need to be?** Doc-only, or doc + Storybook + visual regression?
- **Is portability ever needed** (publish as a package), or is single-app convention sufficient?
- **A11y bar** — fold the 5 Accessibility e2e scenarios in here, or keep them separate (per backlog they're
  general frontend quality)?
- **Theming** — is dark mode / multi-theme in scope, or explicitly out?
- ~~**Governance** — enforce token usage via lint, or leave as convention?~~ **Resolved** — lint-enforced,
  see [§3.1](#31-token-governance-color).
- **Component API contracts** — document/standardize props (variants, sizes) across the shared primitives?

## 5. Relationship to other docs
- Frontend platform / rendering work: [FRONTEND_PLATFORM_STRATEGY.md](./FRONTEND_PLATFORM_STRATEGY.md) +
  [FRONTEND_IMPLEMENTATION.md](./FRONTEND_IMPLEMENTATION.md).
- A11y scenarios live in [e2e-scenarios.md](../../e2e-scenarios.md) (backlog: general frontend quality).
- After grilling, gaps that become work would phase into `FRONTEND_IMPLEMENTATION.md` (or a dedicated
  design-system plan).
