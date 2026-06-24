# Frontend Implementation Plan

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-24
**Status:** 📋 Plan — tasks below are TDD-first (CLAUDE.md §4/§11).
**Drives:** the requirements in [`FRONTEND_PLATFORM_STRATEGY.md`](./FRONTEND_PLATFORM_STRATEGY.md)
(general frontend-quality / rendering work). PWA enablement + Offline/Mobile e2e remain a separate
plan (`PWA_FRONTEND_IMPLEMENTATION.md`, see backlog).

Each task: write the unit **and** e2e tests first, confirm they fail for the right reason, commit the
red tests separately, then the implementation (CLAUDE.md §11). A task is done only when the **full
jest run (all projects) + type-check + the named e2e** pass.

---

## FE-RENDER-1 — Memoize the `AuthProvider` context value
**Requirement:** FE-RENDER-1 (FRONTEND_PLATFORM_STRATEGY.md → Rendering requirements).
**Status:** 📋 not started.

### Problem
`hooks/useAuth.tsx` rebuilds its context `value` object on every `AuthProvider` render, with no `useMemo`.
React context has no partial subscription, so any `AuthProvider` re-render makes **every** `useAuth()`
consumer re-render — even when the field it reads is unchanged. Impact is low today (auth state changes
only on login / logout / session restore), so this is **hardening, not a hot-path fix** — but it removes
the one place a single change fans out to all consumers.

### Tests (write first, commit red)
- **Unit — referential stability:** render `AuthProvider`; capture the context `value`; force an
  `AuthProvider` re-render that does **not** change `user` / `loading`; assert the `value` identity is
  **unchanged** and a render-counting `useAuth()` consumer does **not** re-render. *Fails before the fix.*
- **Unit — change propagation:** assert `value` identity **does** change (and consumers **do** re-render)
  when `user` or `loading` changes — guards against over-memoizing / stale context.
- **E2E — behavior parity (regression guard):** existing `auth.spec.ts` flows (login, signup, logout,
  magic-link session restore) still pass unchanged — the optimization must not alter auth behavior.

### Implementation
Wrap `value` in `useMemo(() => ({ ... }), [user, loading, login, signup, forgotPassword, resetPassword,
logout])`. The five handlers (`login` 122, `signup` 146, `forgotPassword` 178, `resetPassword` 197,
`logout` 219) are **already `useCallback`-stable**, so the deps stay referentially stable and `value`
identity changes **only** when `user` / `loading` change.

### Done when
Both unit tests pass, the `auth.spec.ts` parity e2e passes, and the full jest run (all projects) +
type-check are green.
