# Animation & Transition Specification
## Pastel Flat 2.0 Design System

**Version:** 1.0  
**Last Updated:** 2026-05-15  
**Scope:** CSS-only animations using design tokens; mobile-first; 60fps performance

---

## Core Principles

1. **CSS-Only:** All animations use CSS `transition` and `@keyframes`, not JavaScript animation libraries
2. **Performance:** Only animate `transform` and `opacity` for 60fps on mid-range phones
3. **Mobile-First:** Design for mobile (mid-range devices), enhance on desktop
4. **Token-Based:** All durations and easing from design tokens (`--duration-*`, `--easing-*`)
5. **Accessibility:** Respect `prefers-reduced-motion`; no animations that interfere with screen readers

---

## Design Tokens Reference

### Durations
- `--duration-fast`: 100ms (micro-interactions, feedback)
- `--duration-normal`: 200ms (standard transitions)
- `--duration-slow`: 300ms (prominent animations)

### Easing
- `--easing-snap`: cubic-bezier(0.4, 0.0, 0.2, 1) — snappy, responsive feel
- `--easing-smooth`: cubic-bezier(0.4, 0.0, 0.6, 1) — smooth, deliberate
- `--easing-ease`: ease — natural deceleration

---

## Animation Catalog

### 1. Button Interactions

#### Hover State
- **Properties:** `opacity`, `box-shadow`
- **Duration:** `--duration-fast` (100ms)
- **Easing:** `--easing-snap`
- **Details:**
  - Primary buttons: shadow brightens from `--shadow-md` to `--shadow-lg`
  - Secondary buttons: opacity 0.9 → 1.0
  - Soft buttons: background lightens
- **Use:** All interactive buttons (Button, TournamentCard, MatchCard)

#### Click Feedback
- **Properties:** `transform`
- **Duration:** `--duration-fast` (100ms)
- **Easing:** `--easing-snap`
- **Details:** `scale(1.0)` → `scale(0.98)` on active
- **Use:** Visual pressure feedback during click

#### Disabled State
- **Properties:** `opacity`
- **Value:** `opacity: 0.5`
- **Duration:** none (instantaneous)
- **Use:** Disabled button visual indicator

---

### 2. Modal / Dialog

#### Open Animation
- **Properties:** `transform` (scale, translateY), `opacity`
- **Duration:** `--duration-fast` (100ms)
- **Easing:** `--easing-snap`
- **Details:**
  - Content: `scale(0.95, 0.95)` → `scale(1.0, 1.0)` + fade-in
  - Overlay: `opacity: 0` → `opacity: 1`
- **Use:** Modal, Toast, Dropdown
- **Mobile:** Same animation (centered layout, no position changes)

#### Close Animation
- **Properties:** `transform`, `opacity`
- **Duration:** `--duration-fast` (100ms)
- **Easing:** `--easing-snap`
- **Details:** Reverse of open animation
- **Use:** Dismiss modal, close toast

---

### 3. StandingsTable

#### Row Hover Highlight
- **Properties:** `background-color`
- **Duration:** `--duration-normal` (200ms)
- **Easing:** `--easing-snap`
- **Details:**
  - Background: `bg-white` / `bg-[--ink-50]` → `bg-[--court-50]`
  - Shadow: optional subtle box-shadow
- **Use:** Indicate clickable row

#### Row SSE Update Highlight (Real-time)
- **Properties:** `background-color`
- **Duration:** `--duration-slow` (300ms)
- **Easing:** `ease`
- **Details:**
  - Flash: `bg-white` → `bg-[--gold-200]` (150ms) → `bg-white` (150ms) → hold
  - Total animation: 500ms total (150ms flash + 350ms fade back)
- **Use:** Indicate row data changed from server
- **Performance:** Use `background-color` (layout-safe), or optimize with CSS `::before` pseudo-element

---

### 4. Badge / Status Indicator

#### Pulse Animation (for "live" status)
- **Properties:** `opacity`
- **Duration:** 2s loop
- **Easing:** `ease`
- **Details:**
  - Keyframes: `opacity: 1` → `opacity: 0.6` → `opacity: 1`
  - Use `animation: pulse 2s ease-in-out infinite`
- **Use:** Live status badge in TournamentCard, MatchCard

---

### 5. LoadingSpinner

#### Rotation Animation
- **Properties:** `transform: rotate()`
- **Duration:** 1.2s loop
- **Easing:** `linear`
- **Details:**
  - `rotate(0deg)` → `rotate(360deg)` continuous
  - Use `@keyframes spin` with `animation: spin 1.2s linear infinite`
- **Use:** LoadingSpinner component, embedded in Modal, MatchCard loading state

#### Skeleton Shimmer
- **Properties:** `background-position`
- **Duration:** 1.5s loop
- **Easing:** `ease-in-out`
- **Details:**
  - Gradient overlay: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)`
  - Animation: `background-position: -1000px 0` → `1000px 0` over 1.5s
  - Creates left-to-right "shimmer" effect
- **Use:** SkeletonLoader component

---

### 6. Dropdown / Collapse

#### Open Animation
- **Properties:** `transform: scaleY()`, `opacity`
- **Duration:** `--duration-normal` (200ms)
- **Easing:** `--easing-snap`
- **Details:**
  - Y-origin at top: `scaleY(0.95)` → `scaleY(1.0)`
  - Fade: `opacity: 0` → `opacity: 1`
  - Translate: optional `translateY(-4px)` → `translateY(0)`
- **Use:** Dropdown menus, accordion expand

#### Close Animation
- **Properties:** `transform`, `opacity`
- **Duration:** `--duration-normal` (200ms)
- **Easing:** `--easing-snap`
- **Details:** Reverse of open
- **Use:** Accordion collapse

---

### 7. Focus Ring

#### Focus Indicator
- **Properties:** `box-shadow`, `outline`
- **Duration:** none (immediate, but transition allowed on surrounding element)
- **Easing:** none
- **Details:**
  - Style: `focus-visible:ring-2 focus-visible:ring-[--court-400] focus-visible:ring-offset-2`
  - Color: `--court-400` (bright blue from logo)
  - Offset: 2px (outline-offset)
  - Width: 2px
- **Use:** All interactive elements (Button, inputs, clickable cards)
- **Mobile:** Same styling (no touch events for focus, but keyboard navigation supported)

---

### 8. Page Navigation

#### Route Transition (Fade-In/Fade-Out)
- **Properties:** `opacity`
- **Duration:** `--duration-normal` (200ms)
- **Easing:** `--easing-smooth`
- **Details:**
  - Exit: `opacity: 1` → `opacity: 0`
  - Enter: `opacity: 0` → `opacity: 1`
  - Controlled by page layout, not individual components
- **Use:** Page transitions between Landing, BrowseTournaments, etc.
- **Mobile:** Same fade (not slide) — matches top nav collapse animation

#### Navigation Bar Collapse (Mobile)
- **Properties:** `transform: scaleY()`, height (if necessary)
- **Duration:** `--duration-normal` (200ms)
- **Easing:** `--easing-snap`
- **Details:**
  - Collapse: `scaleY(1.0)` → `scaleY(0.95)` + fade
  - Expand: reverse
- **Use:** Mobile top navigation hide/show when keyboard appears

---

### 9. Toast / Banner

#### Slide-In Animation (Notification)
- **Properties:** `transform: translateX()` or `translateY()`, `opacity`
- **Duration:** `--duration-normal` (200ms)
- **Easing:** `--easing-snap`
- **Details:**
  - Slide-in from top: `translateY(-100px)` → `translateY(0)`
  - Fade-in: `opacity: 0` → `opacity: 1`
  - Mobile: same animation (centered, no horizontal shift)
- **Use:** ErrorBanner, SuccessBanner when displayed

#### Auto-Dismiss Fade-Out
- **Properties:** `opacity`
- **Duration:** `--duration-slow` (300ms)
- **Easing:** `ease`
- **Details:**
  - Show: 3-5 seconds at `opacity: 1`
  - Dismiss: `opacity: 1` → `opacity: 0` (300ms)
  - Remove from DOM after animation completes
- **Use:** Auto-dismissing notifications

#### Icon Animation (Success Checkmark)
- **Properties:** `transform: scale()` + rotate, `stroke-dashoffset`
- **Duration:** `--duration-normal` (200ms)
- **Easing:** `--easing-snap`
- **Details:**
  - Scale: `scale(0.8)` → `scale(1.0)`
  - Rotate: optional `rotate(-90deg)` → `rotate(0deg)`
- **Use:** Success icon in SuccessBanner

---

### 10. Real-Time Update Animations (SSE)

#### Standing Row Flash (Data Update)
- **Properties:** `background-color`
- **Duration:** 500ms total (flash + fade)
- **Easing:** `ease`
- **Details:**
  - 0ms: base color
  - 0-150ms: flash to `--gold-200`
  - 150-500ms: fade back to base color
  - Use `@keyframes` with percentage stops
- **Use:** StandingsTable rows when updated via SSE
- **Performance:** Optimize by applying only to affected row

#### Bracket Match Status Change
- **Properties:** `background-color`, `box-shadow`
- **Duration:** `--duration-slow` (300ms)
- **Easing:** `ease`
- **Details:**
  - Color transition: previous color → new color
  - Optional shadow brightens on change
- **Use:** Bracket visualization when match status changes

#### New Bracket Round Slide-In
- **Properties:** `transform: translateY()`, `opacity`
- **Duration:** `--duration-normal` (200ms)
- **Easing:** `--easing-snap`
- **Details:**
  - Slide from below: `translateY(20px)` → `translateY(0)`
  - Fade-in: `opacity: 0` → `opacity: 1`
- **Use:** New knockout round appears during tournament

---

### 11. Accessibility: prefers-reduced-motion

All animations should respect the user's motion preference:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Application Strategy:**
- **Essential animations** (focus ring, button feedback): disable completely → use instant transitions
- **Decorative animations** (spinners, banners): reduce speed by 50% or disable
- **Transitions** (hover effects, page navigation): reduce to 50ms or disable

**Components affected:**
- LoadingSpinner: disable rotation
- StandingsTable hover: disable or reduce to 50ms
- Modal open: disable or reduce to 50ms
- Page transitions: disable or reduce to 100ms

---

### 12. Component Implementation Guidelines

#### Button.tsx
- Hover: shadow transition + opacity (100ms)
- Click: scale(0.98) feedback (100ms)
- Disabled: opacity 0.5 (instant)

#### Modal.tsx
- Open overlay: opacity fade (100ms)
- Open content: scale + fade (100ms)
- Close: reverse (100ms)
- Escape key: instant close

#### StandingsTable.tsx
- Row hover: background fade (200ms)
- Row SSE update: gold flash → fade (500ms total)
- Virtualization: no animation (handled by react-window)

#### MatchCard.tsx
- Hover: background + shadow (200ms)
- Loading spinner: rotate 360° (1.2s loop)

#### TournamentCard.tsx
- Hover: background + shadow (200ms)
- Badge pulse (if live): continuous pulse (2s loop)

#### Badge.tsx
- Pulse animation (for 'live' variant): opacity pulse (2s loop)

#### LoadingSpinner.tsx
- Rotation: continuous 360° (1.2s loop, linear)

#### SkeletonLoader.tsx
- Shimmer: gradient position animation (1.5s loop)

---

## Performance Checklist

- [ ] All animations use `transform` and `opacity` only
- [ ] No animations on `width`, `height`, `padding`, `margin`
- [ ] Durations use design tokens (`--duration-*`)
- [ ] Easing functions use design tokens (`--easing-*`)
- [ ] Animations respect `prefers-reduced-motion`
- [ ] No JavaScript animation loops (use CSS animations)
- [ ] Component animations are isolated (no inter-component coordination)
- [ ] Mobile devices (60fps on mid-range phones) verified
- [ ] Accessibility: focus indicators always visible
- [ ] Accessibility: animations don't interfere with screen readers

---

## Testing & Verification

### Manual Testing
1. Test all animations on mobile device (mid-range Android) at 60fps
2. Verify `prefers-reduced-motion` respected
3. Test keyboard navigation + focus animations
4. Verify animations don't cause layout shift

### Performance Tools
- Chrome DevTools: Performance tab, check for jank
- Lighthouse: Performance score
- CLS (Cumulative Layout Shift): should be 0 for animations

### Accessibility Testing
- Screen reader: verify animations don't announce false content
- Keyboard nav: verify focus indicators animate smoothly
- High contrast mode: verify animations still visible

---

## References

- Design Tokens: `packages/frontend/src/styles/tokens.css`
- Components: `packages/frontend/src/components/shared/`
- Browser Support: Chrome 90+, Safari 14+, Firefox 88+, Edge 90+
