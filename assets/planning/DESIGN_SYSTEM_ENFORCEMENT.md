# Design-System Enforcement — Token-Usage Lint Gate

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-29
**Status:** 📋 Plan — TDD-first (CLAUDE.md §4/§11), not started.
**Drives:** the **governance** gap in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) §3/§4 ("no token-usage
governance — no lint guard against raw hex / off-scale color") and the cross-cutting design-system bar in
[`FrontEndPlan.md`](./FrontEndPlan.md) §B.1.

**Goal:** enforce *"every color traces to a token"* uniformly across the app via a CI-gated lint rule, and
fix the currently-broken lint setup so the gate can exist at all.

---

## Why (grilled 2026-06-29)
Decisions resolved in the grilling session, in dependency order:

1. **Driver:** the gate is justified because **theming/dark-mode is "eventually yes."** The semantic-token
   layer (`--phase-*`) is already built — the expensive half of theming. A theme becomes a one-file swap
   **only if colors go through tokens.** Every raw color is a spot a future theme silently won't reach.
2. **Scope = token usage, _color only_.** Enforce hex **+** `rgb()/rgba()/hsl()` literals. **Not** spacing/
   radius/shadow (only 10 arbitrary-spacing uses exist and they're legitimate layout/touch-target values).
   Component-usage enforcement (ban raw `<button>`) and visual-regression (Storybook/Chromatic) are
   **deferred** — convention + review for now (CLAUDE.md §2).
3. **Mechanism = ESLint `no-restricted-syntax`** (not stylelint, not a standalone script): styling lives in
   JSX `className` strings + inline `style={{}}`, which stylelint can't see; ESLint reuses the existing
   pipeline and gives in-editor feedback.
4. **Rollout = ratchet, not retrofit.** ~272 existing violations (188 hex + 84 rgba across `Logo` + ~10
   legacy auth/landing pages). Rule is `error` for new code immediately; legacy files are baselined as an
   **interim** so the rule can ship before the cleanup finishes. The baseline is **not permanent** — Phase
   **E5 (mandatory)** retrofits every baselined file to tokens and removes the baseline entirely, so the
   gate ends up `error` *everywhere* except the permanent allowlist.
5. **Permanent allowlist:** `Logo.tsx` / `LogoMark.tsx` (brand-mark SVG fills), `tokens.css` (defines the
   colors), and `DesignSpec.tsx` (unrouted static design-mockup / reference artifact — see E5.5) — exempt
   forever, distinct from the interim legacy baseline.

## Precondition (the blocker)
`ci.yml` runs only type-check + coverage — **lint is not in CI.** And `npm run lint` is **red today: 53
errors / 9 warnings across 24 files**, all pre-existing config artifacts (no relation to this work):

| Rule | Count | Nature | Fix |
|---|---|---|---|
| `no-extra-semi` | 36 | style | `--fix` (auto) |
| `no-undef` (`React`/`NodeJS` "not defined") | ~11 | **config gap** — no TS-aware `no-undef`, no React global | config |
| `security/detect-non-literal-regexp` | 7 (warn) | warnings | triage/justify |
| `security/detect-non-literal-fs-filename` | 2 (warn) | warnings | triage/justify |
| `no-useless-catch` | 2 | real | hand-fix |
| `no-empty` | 2 | real | hand-fix |
| `no-useless-escape` | 1 | real | hand-fix |
| `react-hooks/exhaustive-deps` | 1 | real | hand-fix/justify |

So the color rule cannot be gated until the config is repaired and lint is green. The three requested
pieces compose as: **(b) fix config + gate full lint in CI → (a) add the color rule to that unified gate →
(c) add a pre-commit hook on top.** Once (b) lands, the "dedicated/decoupled color check" is unnecessary —
the rule just lives in the now-green CI gate.

Environment: ESLint **8.57.1** (legacy `.eslintrc.json` — **no flat-config migration**, out of scope),
npm workspaces, Node 20.

---

## Phase E0 — Lint-rule test harness (enables TDD for every later phase)

### E0.1 — Programmatic ESLint fixture runner
**Problem:** lint config/rules have no automated test. We need to assert "this fixture errors, this clean
fixture passes" so config changes and the color rule are TDD-able and regression-proof.

**Tests (write first, commit red):**
- A jest test (`packages/frontend/src/__tests__/lint/eslint-config.spec.ts`) that loads the repo ESLint
  config via the `ESLint` Node API and lints two in-memory fixtures: one obviously clean `.tsx`, one with a
  deliberate error. Assert clean → 0 errors, dirty → ≥1 error. *Fails first because the harness/helper
  doesn't exist yet.*

**Implementation:** thin helper `lintText(code, filename)` wrapping `new ESLint({ ... }).lintText`. No
config changes yet.

**Done when:** the harness test passes against the *current* (broken) config using fixtures that don't trip
the 53 known errors. **Commit** (harness only).

---

## Phase E1 — (b) Repair ESLint config + clear the 53, gate full lint in CI

### E1.1 — Fix the config so `no-undef` stops false-positiving
**Problem:** `React`/`NodeJS` flagged as undefined → core `no-undef` running without TS-awareness / JSX
runtime globals.

**Tests (write first, commit red):** extend the E0 harness — fixtures using `React.FC` / JSX and a
`NodeJS.Timeout` type annotation must lint **clean**. *Fails on current config.*

**Implementation:** in `.eslintrc.json` — let TypeScript own undefined-symbol checking (TS already does it):
add `@typescript-eslint/recommended` to `extends` (it disables core `no-undef` for TS) and/or set the React
17+ automatic-JSX-runtime globals. Confirm `@typescript-eslint/eslint-plugin` + `eslint-plugin-react-hooks`
are present in devDeps; add if missing. Keep the existing `security` rules.

**Done when:** the new fixtures lint clean; the `no-undef` count in a full `npm run lint` drops to 0.
**Commit.**

### E1.2 — Clear the remaining real violations
**Problem:** 36 `no-extra-semi` + the handful of real errors (`no-useless-catch` ×2, `no-empty` ×2,
`no-useless-escape` ×1, `react-hooks/exhaustive-deps` ×1) + 9 security warnings.

**Tests (write first, commit red):** a harness assertion (or a CI smoke step) that `npm run lint` exits 0.
*Fails until violations cleared.*

**Implementation:**
- `npm run lint:fix` to auto-resolve the 36 `no-extra-semi`.
- Hand-fix the 6 real errors surgically (remove useless try/catch wrappers, fill/justify empty blocks, drop
  the needless escape, correct or `eslint-disable-next-line` with justification the hook-deps case).
- Triage the 9 `security/*` **warnings**: justify-and-`eslint-disable-next-line` each with a one-line reason,
  or refactor to literal args. They're warnings, but CI will run `--max-warnings 0` (E1.3), so resolve them.
- **Surgical only** (CLAUDE.md §3): touch the flagged lines, not surrounding code.

**Done when:** `npm run lint` exits 0 with `--max-warnings 0`. **Commit.**

### E1.3 — Add lint as a required CI gate
**Problem:** even green, lint isn't enforced.

**Tests (write first, commit red):** N/A unit; verification is the CI step (and the E1.2 exit-0 assertion).

**Implementation:** add a `Lint` step to `.github/workflows/ci.yml` running
`npm run lint -- --max-warnings 0` (a clean repo has zero warnings now; `--max-warnings 0` prevents warning
drift). Place it before/alongside the type-check job.

**Done when:** CI shows a green required `Lint` check on a clean branch and **red** when a deliberate lint
error is pushed (verify on a throwaway commit). **Commit.**

---

## Phase E2 — (a) The color-token rule, on the unified gate

### E2.1 — Author the color-literal `no-restricted-syntax` rule
**Problem:** no rule bans raw color literals.

**Tests (write first, commit red):** harness fixtures —
- **must error:** `className="bg-[#fff]"`, `className="text-[#1a1a1a]"`, `style={{ color: '#FFF' }}`,
  `style={{ background: 'rgba(0,0,0,0.5)' }}`, `'hsl(210 100% 50%)'`.
- **must pass:** `className="text-[--ink-900] bg-[--court-500]"`, `style={{ color: 'var(--ink-900)' }}`,
  non-color arbitrary values `min-h-[44px]`, `max-h-[600px]`.
*Fails first (no rule).*

**Implementation:** add `no-restricted-syntax` selectors to `.eslintrc.json` matching hex (`#RGB`/`#RRGGBB`)
and `rgb(`/`rgba(`/`hsl(`/`hsla(` inside `Literal`, `TemplateElement`, and JSX text — message:
`"Use a color token from tokens.css (e.g. text-[--ink-900]); raw color literals are banned."` Scope to
`packages/frontend/src/**/*.{ts,tsx}`.

**Done when:** every must-error fixture errors, every must-pass fixture passes. **Commit** (rule + tests).

### E2.2 — Ratchet baseline + permanent allowlist
**Problem:** ~272 existing violations would make E2.1 turn CI red instantly.

**Tests (write first, commit red):** harness fixture under a baselined legacy path → color rule reports at
**`warn`** (not error); a fixture under `Logo.tsx`/`tokens.css` paths → **no report at all**; a fixture
under a *new* path → **error**. *Fails until overrides exist.*

**Implementation:** in `.eslintrc.json` `overrides`:
- **Permanent exempt:** `Logo.tsx`, `LogoMark.tsx`, `**/styles/tokens.css` — color rule `off`.
- **Temporary baseline:** the ~10 legacy files (enumerated from the current hex/rgba grep) — color rule
  downgraded to `warn`. This list **is the burn-down tracker.**
- Everywhere else: `error` (inherited).
- CI runs `--max-warnings 0` **except** it must still pass with the baseline — so baseline files use an
  inline-scoped config or a separate non-failing lint pass. **Decision baked in:** keep CI at
  `--max-warnings 0` and convert baseline entries to file-scoped `eslint-disable` with a `TODO(token-debt)`
  tag instead of `warn`, so warnings stay truly zero and each debt site is greppable. *(Either is valid;
  the disable-comment form keeps `--max-warnings 0` honest.)*

**Done when:** full `npm run lint -- --max-warnings 0` is green on the current tree (legacy baselined,
allowlist exempt), and a **new** raw-color literal fails CI. The color rule now rides the E1.3 gate — no
separate check. **Commit.**

### E2.3 — Document the rule + the interim baseline
**Problem:** the rule and the interim baseline need to be discoverable; full cleanup happens in E5.

**Implementation (no new code):** document the rule in `DESIGN_SYSTEM.md` (governance section) — "no raw
color literals; use a token." Note that the baselined files are **tracked debt scheduled for retrofit in
Phase E5**, each tagged `TODO(token-debt)` so they're greppable. (Touching a baselined file before E5 still
*permits* cleaning it early and removing its baseline entry.)

**Done when:** `DESIGN_SYSTEM.md` documents the rule + the interim baseline + the E5 retrofit commitment,
and links here. **Commit** (docs).

---

## Phase E3 — (c) Pre-commit hook

### E3.1 — husky + lint-staged
**Problem:** developers hit lint failures only in CI; faster local feedback wanted.

**Tests (write first, commit red):** N/A unit; verification is hook behavior.

**Implementation:** add `husky` + `lint-staged` (root devDeps); `husky init`; a `pre-commit` hook running
`lint-staged`; config to run `eslint --max-warnings 0 --fix` on staged `*.{ts,tsx}`. Document `--no-verify`
as the explicit escape hatch. **CI (E1.3) remains the authoritative gate** — the hook is convenience, since
the ESLint rule already surfaces in-editor.

**Done when:** committing a file with a raw color literal is blocked locally by the hook; `--no-verify`
bypasses; CI still catches a bypassed violation. **Commit.**

---

## Phase E4 — Final verify coverage + docs *(runs last, after E5.6)*

### E4.1 — Coverage + final wiring
**Done when:**
- The lint harness tests (E0–E2, E5) are part of the jest run and keep the project ≥85% gate green
  (`packages/api/jest.config.js` thresholds; harness lives in frontend project — confirm no regression).
- `DESIGN_SYSTEM.md` §3/§4 updated: governance gap → **resolved**, rule + permanent allowlist documented,
  the interim-baseline note removed (baseline is gone after E5.6); `FrontEndPlan.md` §B.1 cross-links here.
- `grep -rn 'TODO(token-debt)' packages/frontend/src` returns nothing (retrofit complete).
- BACKLOG.md updated (plan → built once merged).
**Commit** (docs).

---

## Phase E5 — **(Mandatory)** Full retrofit of every legacy color literal

**Status:** 📋 required. End-state: the interim baseline is **gone**, the color rule is `error` everywhere
except the permanent allowlist (`Logo`/`LogoMark`/`tokens.css`/`DesignSpec`), and `npm run lint
--max-warnings 0` is green with **zero `TODO(token-debt)` tags remaining**.

**Scope (measured 2026-06-29, ~301 literals across 11 files):**

| File | Literals | Step |
|---|---|---|
| `pages/ResetPassword.tsx` | 89 | E5.1 |
| `pages/ForgotPassword.tsx` | 59 | E5.1 |
| `pages/Login.tsx` | 54 | E5.1 |
| `pages/Signup.tsx` | 42 | E5.1 |
| `pages/DobScreen.tsx` | 15 | E5.2 |
| `pages/BrowseTournaments.tsx` | 11 | E5.3 |
| `pages/TournamentBrowse.tsx` | 3 | E5.3 |
| `pages/Landing.tsx` | 6 | E5.4 |
| `pages/ServiceUnavailable.tsx` | 1 | E5.4 |
| `components/shared/ResponsiveLayout.tsx` | 1 | E5.4 |
| `pages/DesignSpec.tsx` | 20 | E5.5 (allowlist, not retrofit) |

**Retrofit is a refactor, not a behavior change** (CLAUDE.md §4 "ensure tests pass before *and* after").
For each step the verification is two-pronged: (1) existing unit/e2e for that surface pass **unchanged**,
and (2) the file is removed from the baseline and `npm run lint --max-warnings 0` **stays green** — which
mechanically proves the file is now token-clean. Visual parity: auth + browse pages are covered by
`auth.spec.ts` / browse e2e (behavioral guard); for pages without e2e (`Landing`, `ServiceUnavailable`),
capture a before/after screenshot via `node scripts/browser.js` and eyeball parity.

### E5.0 — Token-gap audit + add missing tokens *(prerequisite)*
**Problem:** some legacy colors may have **no** token equivalent (e.g. the `rgba(0,0,0,0.4)` scrim in
`ResponsiveLayout`, auth-page gradients/shadows). You can't retrofit to a token that doesn't exist.

**Tests (write first, commit red):** harness fixture asserting each **newly added** token name resolves
(used in a `var(--x)` fixture that must lint clean *and* a small CSS-var presence test). For the scrim, a
unit test that `ResponsiveLayout`'s overlay uses `var(--scrim)`. *Fails first.*

**Implementation:** enumerate every distinct literal across the 11 files (`grep -oE '#…|rgba?\(…'` →
unique-sort); map each to an existing token; for the unmapped, add semantic/scale tokens to `tokens.css`
(e.g. `--scrim: rgb(0 0 0 / 0.4)`, any missing shadow/gradient stops). **No component edits yet** — only new
tokens + their tests.

**Done when:** the full unique-color set has a token target; new tokens exist with tests. **Commit**
(tokens + tests).

### E5.1 — Retrofit the auth cluster (244 literals, one commit per file)
`ResetPassword.tsx`, `ForgotPassword.tsx`, `Login.tsx`, `Signup.tsx`. For **each** file: replace every
hex/rgba with the mapped token (arbitrary-value utility `…-[--token]` or `var(--token)` in inline style),
remove the file from the baseline + its `TODO(token-debt)`, run `auth.spec.ts` + full lint
`--max-warnings 0`. **One commit per file** (4 commits).
**Done when:** all four files are off the baseline, `auth.spec.ts` green, lint green.

### E5.2 — Retrofit onboarding (`DobScreen.tsx`, 15)
Same procedure; guard with the age-gate e2e (`DobScreen` flow) + lint. **One commit.**

### E5.3 — Retrofit browse cluster (`BrowseTournaments.tsx` 11, `TournamentBrowse.tsx` 3)
Same procedure; guard with the public-browse e2e + lint. **One commit per file** (2 commits).

### E5.4 — Retrofit singletons (`Landing.tsx` 6, `ServiceUnavailable.tsx` 1, `ResponsiveLayout.tsx` 1)
`ResponsiveLayout` scrim → `var(--scrim)` (from E5.0), guarded by any modal/layout test. `Landing` /
`ServiceUnavailable` → screenshot parity. **One commit per file** (3 commits).

### E5.5 — Resolve `DesignSpec.tsx` (20) — allowlist, not retrofit ✅ done
**Problem:** it's **unrouted, unimported dead/reference code** (its own stub components + SVGs).
Tokenizing it is wasted effort; deleting it is an unrequested removal (CLAUDE.md §3).
**Implementation:** add `DesignSpec.tsx` to the **permanent allowlist** (color rule `off`) with a comment
marking it a reference artifact **and a deletion candidate** to raise with the owner.
**Done when:** it's permanently exempt and flagged; **surface the delete-vs-keep question to the user
separately** rather than deciding here. **Commit** (config + note).

**Status:** confirmed in E5.5 — `DesignSpec.tsx` is on the **permanent allowlist** in `.eslintrc.json`
(`no-restricted-syntax: off`, alongside `Logo.tsx`/`LogoMark.tsx`/`tokens.css`), carries no
`TODO(token-debt)` comment (it was never part of the interim baseline) and no `eslint-disable` comment.
It remains a **deletion candidate**: the file is unrouted and unimported dead code. The permanent
allowlist entry stays until the owner decides to delete the file — that delete-vs-keep call is for the
owner, not decided here.

### E5.6 — Tear down the interim baseline (completion)
**Tests (write first, commit red):** harness fixture under a *formerly-baselined* path now reports the color
rule at **`error`**. *Fails while baseline still exists.*
**Implementation:** delete the entire temporary baseline `overrides` block; only the permanent allowlist
remains. Confirm `grep -rn 'TODO(token-debt)' src` returns **nothing**.
**Done when:** baseline removed, no `TODO(token-debt)` left, `npm run lint --max-warnings 0` green, full jest
+ type-check + the touched e2e green. The gate is now total. **Commit.** Update `DESIGN_SYSTEM.md` (E2.3
note) from "interim baseline" → "fully enforced."

---

## Sequencing & dependencies
```
E0 (harness) ─► E1.1 (config) ─► E1.2 (clear 53) ─► E1.3 (CI gate)
                                                        │
                                                        ▼
                                   E2.1 (rule) ─► E2.2 (interim baseline) ─► E2.3 (docs)
                                                        │
                                                        ▼
                          E3.1 (pre-commit) ─► E5.0 (token audit) ─► E5.1 auth ─► E5.2 dob
                                                        │
                                            E5.3 browse ─► E5.4 singletons ─► E5.5 DesignSpec
                                                        │
                                                        ▼
                                            E5.6 (tear down baseline) ─► E4 (final verify)
```
E1 is the hard prerequisite (no gate without green lint). E2 ships the rule on an **interim** baseline. E5
is **mandatory** — it retrofits every legacy file and removes the baseline so the gate becomes total; E4 is
the final coverage/doc verification after the baseline is gone. (E3 pre-commit can land any time after E1.)

## Cross-references
- Design source: [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) §3 (governance gap), §4 (open questions).
- FE gap inventory: [`FrontEndPlan.md`](./FrontEndPlan.md) §B.1 (design-system bar & governance).
- Related debt this plan also clears: the repo's **broken `npm run lint`** (53 errors, not in CI) — fixed in
  E1 as a prerequisite, not a separate item.
