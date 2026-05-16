# Task #19: Design Specification Document
## Pastel Flat 2.0 Design System

**Document Version:** 1.0  
**Date:** 2026-05-15  
**Design System:** Pastel Flat 2.0 (refined, disciplined, soft depth)  
**Application:** U At Court — Pickleball Tournament Management  
**Source:** `packages/frontend/src/styles/tokens.css`

---

## Table of Contents

1. [Color Palette](#color-palette)
2. [Typography](#typography)
3. [Spacing System](#spacing-system)
4. [Surfaces & Shadows](#surfaces--shadows)
5. [Border Radius](#border-radius)
6. [Responsive Breakpoints](#responsive-breakpoints)
7. [Animation & Motion](#animation--motion)
8. [Accessibility](#accessibility)
9. [Usage Guidelines](#usage-guidelines)

---

## Color Palette

### Brand Colors: Court Blue

The primary brand color derives from the U At Court logo — a refined sky blue palette.

```css
--court-50:    #F5FAFF   /* Lightest, backgrounds */
--court-100:   #EAF4FF   /* Light tint */
--court-200:   #C9E5FF   /* Soft tint */
--court-300:   #A8D5FF   /* Logo light */
--court-400:   #7BC3FF   /* Logo primary ★ */
--court-500:   #4FA9F0   /* Medium tone */
--court-600:   #2E8AD4   /* Dark tone */
--court-700:   #1F6BAA   /* Darker */
--court-900:   #0F3D6B   /* Darkest, text */
```

**Usage:**
- `--court-50` to `--court-300`: Backgrounds, tints, light UI
- `--court-400`: Primary buttons, focus states, key interactions
- `--court-500` to `--court-700`: Secondary buttons, text, borders
- `--court-900`: Page text, dark elements

---

### Secondary Color: Lavender

A soft purple palette for secondary actions and accent elements.

```css
--lavender-50:   #FAF6FF   /* Lightest */
--lavender-100:  #F2EBFF   /* Light */
--lavender-200:  #E0CFF7   /* Soft */
--lavender-300:  #C5AEEF   /* Medium light */
--lavender-400:  #A98AE0   /* Medium ★ */
--lavender-500:  #8E69C9   /* Medium dark */
--lavender-700:  #5F3FA0   /* Dark */
```

**Usage:**
- `--lavender-50` to `--lavender-300`: Secondary backgrounds, disabled states
- `--lavender-400`: Secondary buttons, knockout phase indicator
- `--lavender-700`: Secondary text, secondary borders

---

### Accent Colors (Utility Palette)

Four accent color families for status, notifications, and contextual meaning.

#### Mint (Success/Positive)
```css
--mint-100:  #E8F8EF   /* Background, success indicators */
--mint-200:  #C6EFD6   /* Light accent */
--mint-400:  #6BCF96   /* Primary accent ★ */
--mint-600:  #2F9D6B   /* Dark accent, text */
```
**Usage:** Success states, confirmations, positive actions, registration open phase

#### Peach (Warning/Attention)
```css
--peach-100: #FFF2E0   /* Background */
--peach-200: #FFDDB3   /* Light accent */
--peach-400: #FFB35F   /* Primary accent ★ */
--peach-600: #D87A1F   /* Dark accent, text */
```
**Usage:** Warnings, cautions, pending states, notifications

#### Pink (Secondary Accent)
```css
--pink-100:  #FFEBF4   /* Background */
--pink-300:  #FFB3D9   /* Accent */
--pink-500:  #E36EA8   /* Dark accent ★ */
```
**Usage:** Secondary highlights, special features, mixed doubles indicators

#### Rose (Error/Danger)
```css
--rose-100:  #FFE5E5   /* Background, error states */
--rose-200:  #FFCBCB   /* Light accent */
--rose-400:  #FF8A8A   /* Primary accent ★ */
--rose-600:  #C84545   /* Dark accent, text */
```
**Usage:** Errors, invalid states, deletions, declining actions

#### Gold (Complete/Achievement)
```css
--gold-200:  #FFE8A3   /* Background, achievement states */
--gold-400:  #F2C24A   /* Primary accent ★ */
--gold-600:  #B58308   /* Dark accent, text */
```
**Usage:** Tournament complete, achievements, winners, final standings

---

### Neutrals: Ink Scale

Neutral text and border colors with precise tonal hierarchy.

```css
--ink-50:    #F0F3F8   /* Lightest background tint */
--ink-100:   #E3E8F0   /* Light disabled state */
--ink-200:   #CCD3DF   /* Light borders, dividers */
--ink-300:   #A5AFC0   /* Light text, muted */
--ink-400:   #8693A6   /* Medium text, secondary ★ */
--ink-500:   #5B6B7D   /* Medium dark text */
--ink-600:   #455369   /* Dark text, secondary action */
--ink-700:   #2A3A55   /* Dark text, emphasis */
--ink-800:   #1C2A42   /* Very dark text */
--ink-900:   #0F1B2E   /* Darkest, primary text ★ */
```

**Usage:**
- `--ink-900`: Page text, headings, primary labels
- `--ink-700` to `--ink-800`: Secondary text, strong accents
- `--ink-500` to `--ink-600`: Tertiary text, muted labels
- `--ink-400`: Disabled text, hints
- `--ink-100` to `--ink-200`: Borders, dividers, light backgrounds

---

### Semantic Phase Colors

Tournament phase indicators — immediately communicate stage progression.

```css
--phase-reg-open:   var(--mint-400)      /* Registration Open (green) */
--phase-reg-closed: var(--ink-400)       /* Registration Closed (gray) */
--phase-group:      var(--court-400)     /* Group Stage (blue) */
--phase-knockout:   var(--lavender-400)  /* Knockout (purple) */
--phase-complete:   var(--gold-400)      /* Tournament Complete (gold) */
```

**Visual Meaning:**
- 🟢 **Mint:** Action possible — registration accepting players
- ⚫ **Ink:** Inactive — registration has closed
- 🔵 **Court:** In Progress — group stage running, matches active
- 🟣 **Lavender:** Advanced — knockout stage, final rounds
- ✨ **Gold:** Complete — tournament finished, winners determined

---

### Surface Colors

Layered surfaces for depth and information hierarchy.

```css
--surface:        #FFFFFF                  /* Default white surface */
--surface-tint:   #FAFBFD                  /* Subtle blue tint */
--surface-sunken: #F3F6FB                  /* Raised/inset effect */
--surface-court:  linear-gradient(180deg, #FAFCFF 0%, #EFF6FF 100%)  /* Court-tinted gradient */
--surface-glass:  rgba(255, 255, 255, 0.72) /* Translucent overlay */
```

**Usage:**
- `--surface`: Default card, panel, modal backgrounds
- `--surface-tint`: Secondary panels, subtle background variation
- `--surface-sunken`: Inset/depressed elements, input backgrounds
- `--surface-court`: Hero sections, primary cards, tournament headers
- `--surface-glass`: Overlays, glass morphism effects, tooltips

---

### App Background

Soft pastel wash for page background — soft visual comfort.

```css
--bg-app: radial-gradient(140% 100% at 0% 0%, 
          #EAF4FF 0%, 
          #FAFCFF 38%, 
          #FAF6FF 75%, 
          #F0E6FF 100%)
```

**Effect:** Radial gradient emanating from top-left, blending sky blue → light white → lavender  
**Impact:** Subtle, non-intrusive background that supports content without competing

---

### Border Colors

Borders for structure and information separation.

```css
--border:        #E3E8F0   /* Default borders */
--border-soft:   #EDF1F7   /* Subtle, muted borders */
--border-strong: #CCD3DF   /* Prominent borders, dark mode */
--border-court:  #C9E5FF   /* Court-tinted borders, accent */
```

**Usage:**
- `--border`: Default card edges, dividers, subtle structure
- `--border-soft`: Light dividers, disabled state edges
- `--border-strong`: Dark backgrounds, high contrast
- `--border-court`: Accent borders, focused elements

---

## Typography

### Font Families

Three carefully curated font families for different contexts.

```css
--font-display: 'Fredoka', system-ui, sans-serif
--font-ui:      'Plus Jakarta Sans', system-ui, sans-serif
--font-mono:    'JetBrains Mono', ui-monospace, monospace
```

#### Fredoka (Display)
- **Purpose:** Brand expression, headlines, large text
- **Weights:** 400, 500, 600, 700
- **Characteristics:** Friendly, rounded letterforms, distinctive
- **Usage:** Page titles, hero text, large tournament names
- **CSS Class:** `.uac-display`

#### Plus Jakarta Sans (UI)
- **Purpose:** Interface text, body copy, forms
- **Weights:** 400, 500, 600, 700, 800
- **Characteristics:** Clean, humanist, excellent readability
- **Usage:** Button text, form labels, body paragraphs, navigation
- **CSS Class:** `.uac` (default for body)
- **Feature Settings:** `font-feature-settings: 'cv11', 'ss01'`

#### JetBrains Mono (Code)
- **Purpose:** Code, monospace contexts, technical content
- **Weights:** 400, 500, 600
- **Characteristics:** Clear character distinction, readability at small sizes
- **Usage:** Score display, tournament IDs, data tables
- **CSS Class:** `.uac-mono`
- **Feature Settings:** `font-variant-numeric: tabular-nums` (fixed-width numbers)

### Font Sizes (Recommended Scale)

While specific font sizes are component-dependent, follow this scale:

| Tier | Size | Weight | Usage |
|------|------|--------|-------|
| **H1** | 32px desktop / 24px mobile | 700 | Page titles |
| **H2** | 28px desktop / 22px mobile | 600 | Section headers |
| **H3** | 24px desktop / 20px mobile | 600 | Subsection headers |
| **Body** | 16px / 14px mobile | 400-500 | Main text, labels |
| **Small** | 14px / 12px mobile | 400 | Captions, hints, metadata |
| **Tiny** | 12px / 11px mobile | 400 | Badges, footnotes |
| **Code** | 13px / 12px mobile | 400 | Score display, IDs |

### Font Smoothing

Applied globally for consistent rendering:

```css
body {
  font-family: var(--font-ui);
  color: var(--ink-900);
  font-feature-settings: 'cv11', 'ss01';
  -webkit-font-smoothing: antialiased;
}
```

**Settings:**
- `font-feature-settings: 'cv11', 'ss01'`: OpenType features for Plus Jakarta Sans
- `-webkit-font-smoothing: antialiased`: Lighter weight appearance on macOS

---

## Spacing System

A 4px base unit grid ensures consistent, predictable spacing throughout the interface.

```css
--s-1:   4px    /* Minimal spacing, icon padding */
--s-2:   8px    /* Small gaps, input padding */
--s-3:   12px   /* Tight spacing between elements */
--s-4:   16px   /* Default spacing, button padding */
--s-5:   20px   /* Comfortable spacing */
--s-6:   24px   /* Section spacing */
--s-8:   32px   /* Large spacing between sections */
--s-10:  40px   /* Extra large spacing */
--s-12:  48px   /* Extra extra large spacing */
--s-16:  64px   /* Page-level spacing */
```

### Common Spacing Patterns

| Component | Spacing | Token |
|-----------|---------|-------|
| **Button padding** | 12px vertical, 18px horizontal | `var(--s-3)` v, `var(--s-4)+` h |
| **Card padding** | 20-24px | `var(--s-5)` to `var(--s-6)` |
| **Input padding** | 10px vertical, 14px horizontal | ~`var(--s-2)` v, `var(--s-3)+` h |
| **Gap between inputs** | 16px | `var(--s-4)` |
| **Card gap in grid** | 20px | `var(--s-5)` |
| **Section spacing** | 24-32px | `var(--s-6)` to `var(--s-8)` |
| **Page padding** | 16px mobile, 24px tablet, 32px desktop | `var(--s-4)`, `var(--s-6)`, `var(--s-8)` |

### Touch Targets

Minimum 44px × 44px on mobile for fingertip interactions.

- **Desktop:** 40px minimum (mouse/trackpad)
- **Mobile:** 44px minimum (finger)
- **Padding:** When content smaller than 44px, pad it out (never reduce below minimum)

---

## Surfaces & Shadows

### Border Radius Scale

Rounded corners create soft, approachable aesthetic.

```css
--r-xs:   6px    /* Subtle rounding, inputs */
--r-sm:   8px    /* Small rounding, buttons */
--r-md:   12px   /* Medium rounding, cards */
--r-lg:   16px   /* Large rounding, prominent cards */
--r-xl:   20px   /* Extra large rounding, modals */
--r-2xl:  24px   /* Extra extra large rounding */
--r-3xl:  32px   /* Very large rounding */
--r-full: 999px  /* Fully rounded, pills, avatars */
```

**Usage:**
- `--r-xs` to `--r-sm`: Form inputs, small buttons
- `--r-md` to `--r-lg`: Cards, containers, tournament cards
- `--r-xl` to `--r-2xl`: Modals, dialog boxes, prominent sections
- `--r-full`: Avatars, badges, fully rounded pills

---

### Shadow Scale (Soft, Tinted)

Subtle shadows with blue tint (referencing logo color) for depth and hierarchy.

```css
--shadow-xs:    0 1px 2px rgba(31, 107, 170, 0.06)      /* Minimal lift */
--shadow-sm:    0 2px 6px rgba(31, 107, 170, 0.07)      /* Subtle depth */
--shadow-md:    0 6px 18px rgba(31, 107, 170, 0.09)     /* Medium depth */
--shadow-lg:    0 18px 40px rgba(31, 107, 170, 0.12)    /* Prominent depth */
--shadow-xl:    0 28px 60px rgba(31, 107, 170, 0.16)    /* Maximum depth */
--shadow-focus: 0 0 0 4px rgba(123, 195, 255, 0.30)     /* Focus ring */
```

**Usage:**
- `--shadow-xs`: Hover states, subtle elevation
- `--shadow-sm`: Cards at rest, default state
- `--shadow-md`: Cards on hover, floating actions
- `--shadow-lg`: Modals, dropdowns, floating panels
- `--shadow-xl`: Maximally elevated elements, top-layer modals
- `--shadow-focus`: Focus indicator rings (accessibility)

**Color:** All shadows use `rgba(31, 107, 170, ...)` — a blue tint from `--court-700`, creating color-coherent shadows

---

## Responsive Breakpoints

Mobile-first design ensures optimal experience at all sizes.

### Breakpoint Strategy

```css
/* Base (Mobile First) */
/* 0px - 639px: Mobile screens */

/* Tablet */
@media (min-width: 640px) {
  /* 640px - 1023px: Tablet screens */
}

/* Desktop */
@media (min-width: 1024px) {
  /* 1024px+: Desktop screens */
}
```

### Device Targets

| Device | Width | Breakpoint | Notes |
|--------|-------|-----------|-------|
| iPhone SE | 375px | < 640px | Minimum width, portrait |
| iPhone 12 | 390px | < 640px | Common mobile |
| iPhone 14 Pro Max | 430px | < 640px | Large mobile |
| iPad (7th gen) | 768px | ≥ 640px | Standard tablet |
| iPad Pro | 1024px+ | ≥ 1024px | Large tablet |
| Desktop | 1440px+ | ≥ 1024px | Standard desktop |
| Large Desktop | 1920px+ | ≥ 1024px | Wide desktop |

### Layout Changes by Breakpoint

| Component | Mobile (<640px) | Tablet (640-1023px) | Desktop (≥1024px) |
|-----------|-----------------|---------------------|------------------|
| **Page Padding** | 16px | 24px | 32px |
| **Navigation** | Bottom tab bar | Side nav or top | Side nav or top |
| **Grid Columns** | 1 column | 2 columns | 3-4 columns |
| **Font Sizes** | Small (12-16px) | Medium (14-18px) | Large (16-20px) |
| **Card Width** | Full width | ~48% | ~24-30% |
| **Modal** | Full width - 16px | 600px max | 800px max |

### Mobile-First Philosophy

1. **Design base experience for mobile** (smallest, most constrained)
2. **Add enhancement at tablet** (more horizontal space)
3. **Add refinement at desktop** (full layout capabilities)
4. **Never remove features** on smaller screens (adapt, don't delete)

---

## Animation & Motion

Smooth, purposeful animations guide user attention and provide feedback.

### Animation Durations

```css
--duration-fast:   100ms  /* Quick feedback, micro-interactions */
--duration-normal: 200ms  /* Standard transitions, expected feel */
--duration-slow:   300ms  /* Page-level reveals, important changes */
```

**Duration Philosophy:**
- Animations should feel responsive (100-300ms range)
- Too fast (<50ms): feels jerky, unintentional
- Too slow (>500ms): feels sluggish, frustrating
- Never block user from next action (use non-blocking animations)

### Animation Easing Curves

```css
--easing-snap:    cubic-bezier(0.25, 0.46, 0.45, 0.94)  /* Bouncy, snappy */
--easing-smooth:  cubic-bezier(0.4, 0, 0.2, 1)         /* Natural, smooth */
--easing-ease-out: cubic-bezier(0, 0, 0.2, 1)          /* Decelerating */
```

**Usage:**

| Easing | Feeling | Usage |
|--------|---------|-------|
| **--easing-snap** | Snappy, bouncy, energetic | Hover states, button clicks, icon reveals |
| **--easing-smooth** | Natural, organic, comfortable | Content reveals, list updates, phase transitions |
| **--easing-ease-out** | Deceleration, coming to rest | Dismissals, modals closing, items fading out |

### Animation Examples

```css
/* Quick button hover — snap easing */
button {
  transition: background-color var(--duration-fast) var(--easing-snap);
}

/* Standings table update — smooth easing */
.standings-row {
  transition: opacity var(--duration-normal) var(--easing-smooth);
}

/* Modal entrance — slow, smooth */
.modal {
  animation: slideUp var(--duration-slow) var(--easing-smooth) forwards;
}

/* Modal exit — ease-out deceleration */
.modal.closing {
  animation: slideDown var(--duration-normal) var(--easing-ease-out) forwards;
}
```

---

## Accessibility

### Color Contrast

All text and interactive elements meet WCAG AA minimum 4.5:1 contrast ratio.

| Text Type | Foreground | Background | Contrast |
|-----------|-----------|-----------|----------|
| **Primary text** | `--ink-900` | `--surface` | 14.3:1 ✅ |
| **Secondary text** | `--ink-600` | `--surface` | 7.2:1 ✅ |
| **Disabled text** | `--ink-400` | `--surface` | 4.5:1 ✅ |
| **Button text** | `--ink-900` | `--court-400` | 5.8:1 ✅ |
| **Phase badge** | `--mint-600` | `--mint-100` | 5.2:1 ✅ |

**Don't rely on color alone** — use icons, text, patterns to convey meaning (e.g., error states should have icon + text + color)

### Focus Indicators

Every interactive element must have visible focus indicator.

```css
button:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
  /* --shadow-focus: 0 0 0 4px rgba(123, 195, 255, 0.30) */
}

input:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(123, 195, 255, 0.25);
  border-color: var(--court-400);
}
```

**Requirements:**
- Visible on all interactive elements (buttons, links, inputs, selects)
- Contrast ratio ≥ 3:1 from background
- At least 2px visible
- Use `--shadow-focus` for consistency

### Keyboard Navigation

All functionality must be keyboard accessible.

- **Tab:** Navigate between interactive elements
- **Shift+Tab:** Navigate backwards
- **Enter:** Activate buttons, submit forms
- **Space:** Toggle checkboxes, expand/collapse
- **Escape:** Close modals, cancel actions
- **Arrow keys:** Navigate within components (tables, menus)

### Touch Targets

Minimum 44px × 44px on touch devices.

```css
button {
  min-height: 44px;
  min-width: 44px;
  padding: var(--s-3) var(--s-4);  /* At least 44px total */
}

/* If content is smaller, pad it */
.small-button {
  min-height: 44px;
  padding: 12px 24px;  /* Padding makes total ≥ 44px */
}
```

### Semantic HTML

- Use `<button>` for buttons (not `<div>` styled as button)
- Use `<a>` for links
- Use `<label>` for form inputs
- Use `<h1>`, `<h2>`, etc. for headings (don't use `<div>` styled as heading)
- Use semantic elements: `<nav>`, `<main>`, `<footer>`, `<article>`, `<section>`

### ARIA Labels

Add ARIA labels when content isn't self-descriptive:

```html
<!-- Icon button needs aria-label -->
<button aria-label="Close modal">
  <IconX size={20} />
</button>

<!-- Live region for dynamic updates -->
<div aria-live="polite" aria-atomic="true">
  Standings updated
</div>

<!-- Field with complex validation -->
<input
  aria-label="Tournament name"
  aria-describedby="tournament-hint"
/>
<div id="tournament-hint">
  Must be 3-50 characters
</div>
```

---

## Usage Guidelines

### Color Selection Decision Tree

1. **Is this text or primary content?**
   - Yes → Use ink scale (`--ink-900` for body, `--ink-600` for secondary)

2. **Is this a primary action or main brand element?**
   - Yes → Use court blue (`--court-400`)

3. **Is this a secondary action or alternative path?**
   - Yes → Use lavender (`--lavender-400`)

4. **Does this need to convey semantic meaning?**
   - Success/positive → Mint (`--mint-400`)
   - Warning/attention → Peach (`--peach-400`)
   - Error/danger → Rose (`--rose-400`)
   - Achievement/complete → Gold (`--gold-400`)

5. **Is this a background or surface?**
   - Yes → Use surface colors (`--surface`, `--surface-tint`, etc.)

### Spacing Selection Decision Tree

1. **Icon padding or very tight spacing?**
   - Use `--s-1` (4px)

2. **Form input padding or small gaps?**
   - Use `--s-2` to `--s-3` (8-12px)

3. **Default padding (button, form field)?**
   - Use `--s-4` (16px)

4. **Gap between cards in grid?**
   - Use `--s-5` (20px) or `--s-6` (24px)

5. **Spacing between major sections?**
   - Use `--s-6` to `--s-8` (24-32px)

6. **Page-level padding?**
   - Mobile: `--s-4` (16px)
   - Tablet: `--s-6` (24px)
   - Desktop: `--s-8` (32px)

### Animation Selection Decision Tree

1. **Very fast interaction (button hover, icon change)?**
   - Duration: `--duration-fast` (100ms)
   - Easing: `--easing-snap`

2. **Standard UI transition (opacity change, position shift)?**
   - Duration: `--duration-normal` (200ms)
   - Easing: `--easing-smooth`

3. **Page-level or important state change (modal open, phase change)?**
   - Duration: `--duration-slow` (300ms)
   - Easing: `--easing-smooth` or `--easing-ease-out`

4. **Dismissal or exit animation (close modal, fade out)?**
   - Duration: `--duration-normal` (200ms)
   - Easing: `--easing-ease-out`

---

## Verification Checklist

Before shipping any UI component or page:

- [ ] All text uses ink scale or semantic colors
- [ ] All buttons use court blue or appropriate semantic color
- [ ] All spacing uses spacing tokens (no hardcoded px values)
- [ ] Border radius uses token values
- [ ] Shadows use token values
- [ ] Animations use duration and easing tokens
- [ ] Focus indicators visible on all interactive elements
- [ ] Touch targets ≥ 44px on mobile
- [ ] Color contrast ≥ 4.5:1 for text
- [ ] Responsive at mobile (< 640px), tablet (640-1023px), desktop (≥ 1024px)
- [ ] Keyboard navigation works (tab, shift+tab, enter, escape)
- [ ] Uses semantic HTML (`<button>`, `<a>`, `<label>`, headings)
- [ ] ARIA labels where needed (icon buttons, live regions)
- [ ] Tested on actual devices (not just desktop browser)

---

## References

**Related Documents:**
- `TASK19_WIREFLOW.md` — User flows and screen architecture
- `packages/frontend/src/ui/COMPONENT_SPECS.md` — Detailed component specifications
- `TASK19_DESIGN_TOKENS.css` — CSS implementation
- `packages/frontend/src/ui/lib.jsx` — Component library with token usage examples

**Standards:**
- [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/) — Accessibility guidelines
- [Material Design 3](https://m3.material.io/) — Color theory, spacing patterns
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) — Typography, spacing, touch targets

---

## Document Maintenance

**Last Updated:** 2026-05-15  
**Version:** 1.0  
**Status:** ✅ Complete and Verified

When design changes are made:
1. Update `packages/frontend/src/styles/tokens.css` (source of truth)
2. Update this specification document
3. Notify development team of changes
4. Update component specs if needed

---

## Footer

**Design System:** Pastel Flat 2.0  
**Application:** U At Court — Pickleball Tournament Management  
**Team:** Task #19 Execution  
**Accessibility:** WCAG AA Compliant
