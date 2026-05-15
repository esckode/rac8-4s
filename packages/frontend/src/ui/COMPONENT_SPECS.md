# Component Library Specifications
## U At Court — Shared Components (Pastel Flat 2.0)

**Source:** `packages/frontend/src/ui/lib.jsx`  
**Design System:** Pastel Flat 2.0  
**Last Updated:** 2026-05-15  
**Status:** 13 production-ready components, fully accessible and responsive

---

## Table of Contents

1. [Logo](#logo) — Branding mark & wordmark
2. [LogoMark](#logomark) — SVG crescents (internal)
3. [Button](#button) — Interactive primary action
4. [Icon](#icon) — 30+ SVG icons, no dependencies
5. [PhaseBadge](#phasebadge) — Tournament phase indicators
6. [Chip](#chip) — Labeled tags with variants
7. [Avatar](#avatar) — User profile pictures
8. [AvatarStack](#avatarstack) — Multiple avatars with overflow
9. [Card](#card) — Container with multiple styles
10. [LiveDot](#livedot) — Real-time status indicator
11. [SectionHeading](#sectionheading) — Page section headers
12. [Shuttle](#shuttle) — Badminton decorative motif
13. [CourtDoodle](#courtdoodle) — Court visualization

---

## 1. Logo

**Purpose:** Full branding mark with optional tagline.  
**Category:** Branding  
**Import:** `import { Logo } from './lib'`

### Appearance

- **Mark:** Two nested crescents (C + U stylization) in SVG
- **Text:** "U At Court" in Fredoka display font (bold)
- **Tagline:** Optional "Make Your Play Count" subtitle
- **Layout:** Horizontal, flexbox with gap proportional to size

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | number | 28 | Font size of text; mark scales to 1.5× |
| `tone` | 'navy' \| 'light' \| 'mono-court' | 'navy' | Color scheme for light/dark backgrounds |
| `tagline` | boolean | false | Show "Make Your Play Count" subtitle |

**Tone variants:**
- `navy`: Dark text (`--ink-900`) on light backgrounds, Court Blue marks
- `light`: White text on dark backgrounds, light Court Blue marks (`#A8D5FF` / `#7BC3FF`)
- `mono-court`: Court Blue only (no accent variation)

### Interactive States

- No interactive states (display-only branding)
- Not keyboard-focusable

### Mobile Layout

- Scales proportionally with `size` prop
- Gap and text sizing scale to `size` multiplier (0.35× gap, 0.42× tagline)
- Responsive on all screen sizes

### Accessibility

- Mark SVG has `aria-hidden="true"` (decorative)
- Text provides full semantics
- Color contrast meets WCAG AA (dark text on light bg)
- No ARIA labels needed

### Example Usage

```jsx
// Header on light background
<Logo size={28} tone="navy" />

// Footer on dark background with tagline
<Logo size={24} tone="light" tagline />

// Mobile-optimized smaller logo
<Logo size={20} tone="navy" />
```

### Token References

- **Colors:** `--court-400`, `--court-500`, `--ink-900`, `--ink-500`
- **Typography:** `--font-display`
- **Spacing:** Calculated as `size × 0.35`

---

## 2. LogoMark

**Purpose:** Logo mark only (crescents, no text).  
**Category:** Branding (internal component)  
**Import:** Used internally by `Logo`; also exported

### Appearance

- Two nested crescents: outer (C shape) + inner (smaller C offset)
- Outer filled with primary color, inner with accent
- Inner accent at 85% opacity for subtle depth

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | number | 56 | Width/height in pixels |
| `color` | CSS color | 'var(--court-400)' | Outer crescent fill |
| `accent` | CSS color | undefined (falls back to `color`) | Inner crescent fill |

### Mobile Layout

- Scales linearly with size prop
- Works at any pixel size (16px to 200px+)

### Accessibility

- SVG has `aria-hidden="true"` (decorative)
- Should be wrapped with `<a>` or `<button>` for keyboard access

### Example Usage

```jsx
// Standard Court Blue mark
<LogoMark size={56} />

// Custom colors
<LogoMark size={64} color="var(--lavender-400)" accent="var(--lavender-500)" />

// In a button context
<button onClick={...}>
  <LogoMark size={28} />
</button>
```

### Token References

- **Colors:** `--court-400`, `--court-500` (defaults); accepts any CSS color

---

## 3. Button

**Purpose:** Primary interactive action trigger.  
**Category:** Interactive control  
**Import:** `import { Button } from './lib'`

### Appearance

- **Base:** Inline-flex, rounded corners, with inset highlight and shadow
- **Height:** 34px (sm), 42px (md), 50px (lg)
- **Radius:** `--r-md` (sm), `--r-lg` (md/lg)
- **Shadow:** Inset white highlight + drop shadow
- **Font:** Bold, letter-spacing `-0.005em`
- **Cursor:** Pointer (enabled), not-allowed (disabled)

### Props & Variants

| Prop | Type | Default | Options |
|------|------|---------|---------|
| `variant` | string | 'primary' | primary, primaryBold, secondary, ghost, soft, dark, danger |
| `size` | string | 'md' | sm, md, lg |
| `icon` | React node | undefined | Icon component before text |
| `iconRight` | React node | undefined | Icon component after text |
| `fullWidth` | boolean | false | Stretch to 100% width |
| `disabled` | boolean | false | Disable interaction, reduce opacity to 0.5 |
| `onClick` | function | undefined | Click handler |
| `style` | object | {} | Override specific styles |
| `children` | React node | undefined | Button label text |

**Variant Details:**

| Variant | Background | Text Color | Border | Use Case |
|---------|------------|-----------|--------|----------|
| `primary` | Court Blue (`--court-400`) | Ink (`--ink-900`) | Court 500 | Main action, default |
| `primaryBold` | Court gradient (400→500) | White | Court 600 | Prominent action, form submit |
| `secondary` | Lavender (`--lavender-300`) | Ink (`--ink-900`) | Lavender 400 | Secondary action |
| `ghost` | Transparent | Ink 700 | Border | Minimal, tertiary action |
| `soft` | Court 100 | Court 700 | Court 200 | Subtle action |
| `dark` | Ink 900 | White | Ink 900 | Dark mode / high contrast |
| `danger` | Rose 400 | White | Rose 600 | Destructive action (delete, remove) |

**Size Details:**

| Size | Padding | Font Size | Height | Gap |
|------|---------|-----------|--------|-----|
| `sm` | 8px 14px | 13px | 34px | 6px |
| `md` | 11px 18px | 14px | 42px | 8px |
| `lg` | 14px 22px | 15px | 50px | 10px |

### Interactive States

- **Default:** As specified above
- **Hover:** Brightens slightly (no explicit CSS, user agents handle `<button>` hover)
- **Active:** Browser native (`:active`)
- **Focus:** Focus outline (depends on browser); `box-shadow` used for visual affordance
- **Disabled:** Opacity 0.5, cursor not-allowed, non-interactive

### Mobile Layout

- Touch target: 42px height (md) meets 44px minimum guideline
- Full width possible with `fullWidth` prop
- Icon + text layout works on small screens
- Responsive padding via CSS (no breakpoints needed)

### Accessibility

- Native `<button>` element (semantic HTML)
- `:disabled` pseudo-class for disabled state
- Focus-visible on keyboard navigation
- Text label always visible (no icon-only buttons without aria-label)
- Supports icon elements (no built-in aria-label; parent must provide)

### Example Usage

```jsx
// Primary action
<Button onClick={handleSubmit}>
  Submit Score
</Button>

// With icon
import { Icon } from './lib'
<Button variant="secondary" icon={<Icon name="plus" />}>
  Add Player
</Button>

// Destructive action
<Button variant="danger">
  Delete Tournament
</Button>

// Small, full-width
<Button size="sm" fullWidth>
  Cancel
</Button>

// Disabled state
<Button disabled>
  Locked
</Button>
```

### Token References

- **Colors:** `--court-*`, `--lavender-*`, `--ink-*`, `--rose-*`
- **Radius:** `--r-md`, `--r-lg`
- **Shadows:** `--shadow-sm`, `--shadow-md`
- **Typography:** `--font-ui`

---

## 4. Icon

**Purpose:** 30+ hand-drawn SVG icons without dependencies.  
**Category:** Visual indicator  
**Import:** `import { Icon } from './lib'`

### Appearance

- **Format:** SVG with stroke-based design (no fills)
- **Viewbox:** 24×24 standard
- **Styling:** Inherits color via stroke, scales with size
- **Style:** Lucide-style, clean, minimal

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | string | required | Icon name (see list below) |
| `size` | number | 18 | Width/height in pixels |
| `color` | CSS color | 'currentColor' | Stroke color (inherits from parent if not set) |
| `strokeWidth` | number | 2 | Stroke thickness |

**Available Icons (30+):**

| Icon Name | Use Case | Icon Name | Use Case |
|-----------|----------|-----------|----------|
| `home` | Home, landing | `user` | Single user profile |
| `calendar` | Dates, events | `users` | Multiple users, teams |
| `trophy` | Rankings, winners | `plus` | Add, create |
| `racket` | Badminton sport | `check` | Confirm, success |
| `shuttle` | Shuttlecock sport | `x` | Close, delete |
| `chevron` | Expand right | `chevronDown` | Expand down |
| `chevronUp` | Expand up | `arrow` | Navigate forward |
| `arrowLeft` | Navigate back | `pin` | Location, pin |
| `clock` | Time, duration | `bell` | Notifications |
| `chat` | Messages, chat | `settings` | Configuration |
| `bolt` | Lightning, speed | `search` | Search, lookup |
| `filter` | Filter, refine | `bracket` | Tournament bracket |
| `podium` | Standings, ranks | `star` | Favorite, rating |
| `heart` | Like, favorite | `share` | Share, export |
| `menu` | Menu, navigation | `grid` | Grid view |
| `live` | Live status | `map` | Map, location |
| `edit` | Edit, modify | `moreH` | More options |
| `play` | Play, start | `info` | Information |

### Interactive States

- Non-interactive by default (display-only)
- Can be wrapped in `<button>` for interactivity
- Inherits `:hover` from parent if wrapped

### Mobile Layout

- Scales with `size` prop
- Recommended sizes: 18px (standard), 20px (touch), 24px (large)
- Works at any size from 12px to 48px+

### Accessibility

- SVG element (inline)
- If icon-only (no label), parent must provide `aria-label`
- Color contrast: use high-contrast colors (not light on light)
- `title` attribute optional for tooltips

### Example Usage

```jsx
// Standard icon
<Icon name="check" size={18} color="var(--mint-600)" />

// In a button context
<Button icon={<Icon name="plus" size={16} />}>
  Add Match
</Button>

// Icon-only button (must have aria-label)
<button aria-label="Close dialog">
  <Icon name="x" size={24} />
</button>

// Color inheritance
<span style={{ color: 'var(--court-400)' }}>
  <Icon name="trophy" />
  Leader
</span>
```

### Token References

- **Colors:** Any CSS color via `color` prop
- **Common:** `--court-400`, `--mint-600`, `--ink-700`, `--rose-600`

---

## 5. PhaseBadge

**Purpose:** Tournament phase status indicator with dot and label.  
**Category:** Status indicator  
**Import:** `import { PhaseBadge } from './lib'`

### Appearance

- **Layout:** Inline-flex with colored dot + label text
- **Shape:** Pill-shaped (`--r-full` radius)
- **Dot:** 6×6px circle with optional pulse glow
- **Text:** Bold, uppercase, 11px (sm) or 12px (md)
- **Letter-spacing:** `0.01em`

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `phase` | string | required | Phase key (see below) |
| `size` | string | 'md' | sm or md |

**Phase Variants:**

| Phase Key | Label | Background | Text Color | Dot Color | Pulse |
|-----------|-------|------------|-----------|-----------|-------|
| `reg-open` | Reg Open | Mint 200 | Mint 600 | Mint 400 | Yes ✓ |
| `reg-closed` | Reg Closed | Ink 50 | Ink 600 | Ink 300 | No |
| `group` | Group Stage | Court 200 | Court 700 | Court 500 | Yes ✓ |
| `knockout` | Knockout | Lavender 200 | Lavender 700 | Lavender 500 | No |
| `complete` | Complete | Gold 200 | Gold 600 | Gold 400 | No |
| `draft` | Draft | Peach 100 | Peach 600 | Peach 400 | No |
| unknown | (phase value) | Ink 50 | Ink 600 | Ink 300 | No |

**Pulse Animation:**
- Applies to `reg-open` and `group` phases
- Scales 0.6→2.2, opacity 0.6→0, duration 1.8s
- Uses keyframe `uacPulse` injected on component first render

### Interactive States

- Display-only (no interaction)
- No keyboard focus

### Mobile Layout

- Shrinks to `sm` size on mobile if space is constrained
- Padding scales: `5px 10px` (md) → `3px 8px` (sm)
- Font: `12px` (md) → `11px` (sm)

### Accessibility

- Uses semantic span with good color contrast
- Dot provides visual distinction (not color-only)
- Pulse animation respects `prefers-reduced-motion` (not explicitly in code, should be tested)

### Example Usage

```jsx
// Tournament is accepting registrations
<PhaseBadge phase="reg-open" />

// Compact version
<PhaseBadge phase="group" size="sm" />

// In a tournament card
<Card>
  <SectionHeading title="Holiday Tournament" />
  <PhaseBadge phase="knockout" />
</Card>
```

### Token References

- **Colors:** Phase-specific (`--mint-*`, `--court-*`, `--lavender-*`, `--gold-*`, `--peach-*`, `--ink-*`)
- **Radius:** `--r-full`
- **Animation:** `uacPulse` (injected CSS)

---

## 6. Chip

**Purpose:** Labeled tag or filter chip.  
**Category:** Input/selection  
**Import:** `import { Chip } from './lib'`

### Appearance

- **Layout:** Inline-flex with optional icon + label
- **Shape:** Pill-shaped (`--r-full`)
- **Padding:** `5px 10px` (md) or `3px 8px` (sm)
- **Font:** Bold, 12px (md) or 11px (sm)
- **Border:** 1px solid (color matches variant)

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | string | 'default' | default, court, lavender, mint, peach, dark |
| `size` | string | 'md' | sm or md |
| `icon` | React node | undefined | Icon before text |
| `children` | React node | required | Chip label |

**Variant Color Schemes:**

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| `default` | Surface | Ink 700 | Border |
| `court` | Court 100 | Court 700 | Court 200 |
| `lavender` | Lavender 100 | Lavender 700 | Lavender 200 |
| `mint` | Mint 100 | Mint 600 | Mint 200 |
| `peach` | Peach 100 | Peach 600 | Peach 200 |
| `dark` | Ink 900 | White | Ink 900 |

### Interactive States

- Display-only in current implementation
- Can be wrapped in `<button>` or clickable container for selection
- No built-in disabled state

### Mobile Layout

- Shrinks gracefully: `sm` size for small screens
- Wraps in flex container
- Font scales down proportionally

### Accessibility

- Semantic span (if display-only)
- If clickable, should be wrapped in `<button>`
- Icon should have `aria-label` if used without label text

### Example Usage

```jsx
// Simple chip
<Chip variant="court">Tournament</Chip>

// With icon
<Chip variant="mint" icon={<Icon name="check" size={14} />}>
  Confirmed
</Chip>

// Filter chips in a row
<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
  <Chip variant="lavender" size="sm">Filter 1</Chip>
  <Chip variant="peach" size="sm">Filter 2</Chip>
</div>

// Dark variant
<Chip variant="dark">Advanced</Chip>
```

### Token References

- **Colors:** Variant-specific (`--court-*`, `--lavender-*`, `--mint-*`, `--peach-*`, `--ink-*`)
- **Radius:** `--r-full`

---

## 7. Avatar

**Purpose:** Single user profile picture with initials fallback.  
**Category:** User indicator  
**Import:** `import { Avatar } from './lib'`

### Appearance

- **Shape:** Perfect circle
- **Initials:** Display initials from user name (first letter of first & last name)
- **Fallback:** If no name provided, show "?"
- **Image:** Can display background image if `src` provided
- **Ring:** Optional colored border/ring effect
- **Text:** Bold, centered, color `--ink-900`, font size scales with avatar size

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | string | undefined | User name (generates initials) |
| `size` | number | 36 | Diameter in pixels |
| `src` | string | undefined | Image URL (displays as background-image) |
| `ring` | CSS color | undefined | Ring color (creates colored border effect) |
| `color` | CSS color | undefined | Background color override (otherwise deterministic pastel) |

**Avatar Coloring:**
- If `name` provided, uses deterministic pastel from palette based on first 2 char codes
- Palette: 8 pastel colors (`#A8D5FF`, `#C5AEEF`, `#FFB3D9`, `#FFDDB3`, `#B8EDD0`, `#FFE8A3`, `#FFB35F`, `#A98AE0`)
- Same name always gets same color
- Override with `color` prop

**Ring Effect:**
- Double-ring: `0 0 0 2px var(--surface), 0 0 0 4px ${ring}`
- Creates outer surface ring + colored ring effect

### Interactive States

- Display-only
- Can be clickable if wrapped in `<button>` or linked container

### Mobile Layout

- Scales with `size` prop
- Initials font scales to `size × 0.36`
- Works on all screen sizes

### Accessibility

- No interactive role by default
- If clickable, wrap in semantic element (`<button>`, `<a>`)
- No aria-label needed (name provides semantic meaning)
- Color contrast: white/light text on pastel background

### Example Usage

```jsx
// Standard avatar with initials
<Avatar name="Jane Smith" size={36} />

// With image
<Avatar name="John Doe" size={48} src="/avatars/john.jpg" />

// With ring (in a button)
<button>
  <Avatar name="Alex Lee" size={40} ring="var(--court-400)" />
  Profile
</button>

// In a list
<div style={{ display: 'flex', gap: '8px' }}>
  <Avatar name="Player 1" />
  <Avatar name="Player 2" />
  <Avatar name="Player 3" />
</div>
```

### Token References

- **Colors:** Pastel palette (embedded), `--surface`, `--ink-900`
- **Spacing:** Ring spacing (2px surface + variable colored ring)

---

## 8. AvatarStack

**Purpose:** Display multiple avatars with overflow indicator.  
**Category:** User group indicator  
**Import:** `import { AvatarStack } from './lib'`

### Appearance

- **Layout:** Horizontal stack with negative margin overlap
- **Overlap:** Each avatar offset by `-size × 0.32` (32% of size, creates 68% overlap)
- **Overflow:** "+ N more" indicator if names exceed `max`
- **Overflow bg:** Ink 100, text Ink 700
- **Spacing:** Consistent with Avatar gaps

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `names` | array of strings | required | Array of user names |
| `size` | number | 28 | Avatar diameter |
| `max` | number | 4 | Max avatars to show before overflow |
| `extra` | number | undefined | Override calculated overflow count |

### Interactive States

- Display-only
- Can wrap each Avatar in a clickable element

### Mobile Layout

- Overflow badge resizes with avatars
- Margin calculation scales: `-size × 0.32`
- Works on all screen widths

### Accessibility

- Each Avatar child inherits accessibility
- Overflow text ("+ N more") is semantic
- Should be wrapped in semantic container if the whole stack is clickable

### Example Usage

```jsx
// Show 4 avatars, hide rest
<AvatarStack names={["Alice", "Bob", "Charlie", "Diana", "Eve"]} />
// Displays: [A] [B] [C] [D] [+1 more]

// Smaller size
<AvatarStack names={["Alice", "Bob"]} size={24} />

// All visible
<AvatarStack names={["Alice", "Bob"]} max={10} />

// Custom overflow count
<AvatarStack names={teamMembers} extra={teamMembers.length - 4} />
```

### Token References

- **Colors:** Per-Avatar tokens
- **Spacing:** Calculated as `size × 0.32`

---

## 9. Card

**Purpose:** Container component with multiple surface styles.  
**Category:** Layout container  
**Import:** `import { Card } from './lib'`

### Appearance

- **Border-radius:** `--r-xl` (20px)
- **Padding:** Customizable (default 20px)
- **Border:** 1px solid (variant-dependent)
- **Shadow:** 0 or variant-dependent (sm, md)
- **Backdrop filter:** Blur (glass variant only)

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | string | 'default' | Card style (see below) |
| `padding` | number | 20 | Interior padding in pixels |
| `style` | object | {} | Additional CSS overrides |
| `children` | React node | required | Card contents |
| `...rest` | object | | HTML attributes (pass through) |

**Variant Details:**

| Variant | Background | Border | Shadow | Use Case |
|---------|-----------|--------|--------|----------|
| `default` | Surface | Soft | Shadow-sm | Standard card |
| `flat` | Surface | Standard | None | Minimal style |
| `sunken` | Sunken | Transparent | None | Inset appearance |
| `raised` | Surface | Transparent | Shadow-md | Elevated appearance |
| `glass` | Glass (72% white) | White rgba | Shadow-sm | Frosted glass effect |
| `court` | Court 100 | Court 200 | None | Brand-colored card |
| `lavender` | Lavender 100 | Lavender 200 | None | Secondary color card |
| `mint` | Mint 100 | Mint 200 | None | Success-colored card |
| `dark` | Ink 900 | Ink 800 | Shadow-md | Dark mode card |

### Interactive States

- Display-only container
- Children can be interactive

### Mobile Layout

- Padding adjustable: standard 20px, can reduce to 16px on mobile
- Width responsive (full-width by default)
- Stacks vertically in flex containers

### Accessibility

- Semantic `<div>` (role determined by children)
- Pass semantic children (headings, paragraphs, etc.)

### Example Usage

```jsx
// Standard card with tournament info
<Card>
  <SectionHeading title="Spring Tournament" />
  <PhaseBadge phase="group" />
</Card>

// Flat card without shadow
<Card variant="flat" padding={16}>
  <p>No shadow variation</p>
</Card>

// Brand-colored card
<Card variant="court" padding={24}>
  <h3>Court-themed Card</h3>
</Card>

// Glass effect
<Card variant="glass">
  <p>Frosted glass style</p>
</Card>

// Custom styling
<Card style={{ maxWidth: '400px' }}>
  Custom width
</Card>
```

### Token References

- **Colors:** Variant-specific (`--surface*`, `--court-*`, `--lavender-*`, `--mint-*`, `--ink-*`)
- **Radius:** `--r-xl`
- **Shadows:** `--shadow-sm`, `--shadow-md`

---

## 10. LiveDot

**Purpose:** Real-time status indicator with pulsing animation.  
**Category:** Status indicator  
**Import:** `import { LiveDot } from './lib'`

### Appearance

- **Layout:** Inline-flex with dot + label
- **Dot:** 8×8px circle with 1.8s pulsing animation
- **Animation:** Scales 0.6→2.2, opacity 0.6→0 (sine wave effect)
- **Label:** Bold, uppercase, 11px, letter-spacing `0.08em`
- **Color:** Mint 600 (default text), customizable dot color

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `color` | CSS color | 'var(--mint-400)' | Dot fill color |
| `label` | string | 'LIVE' | Status label text |

### Interactive States

- Display-only
- Animation runs continuously (no pause on hover)

### Mobile Layout

- Scales naturally with parent font size
- Wraps as needed in flex containers
- Animation unaffected by screen size

### Accessibility

- Animation: may need `prefers-reduced-motion` query (not explicit in code)
- Label provides semantic meaning
- Color + dot provide visual distinction (not color-only)

### Example Usage

```jsx
// Standard live indicator
<LiveDot />

// Custom color
<LiveDot color="var(--rose-400)" label="LIVE" />

// In a tournament status
<div>
  <LiveDot color="var(--court-400)" label="ACTIVE" />
  Group Stage in progress
</div>

// Compact, no label
<LiveDot label="" />
```

### Token References

- **Colors:** `--mint-400` (default), any CSS color
- **Animation:** `uacPulse` (injected CSS)

---

## 11. SectionHeading

**Purpose:** Page section header with eyebrow, title, subtitle.  
**Category:** Typography / layout  
**Import:** `import { SectionHeading } from './lib'`

### Appearance

- **Layout:** Vertical flex stack
- **Eyebrow:** Optional, uppercase, 12px, Court 600, letter-spacing `0.12em`, 8px bottom margin
- **Title:** Fredoka display, 28px, bold, Ink 900, letter-spacing `-0.02em`, no margin
- **Subtitle:** Optional, 14px, Ink 500, 6px top margin
- **Container margin:** 24px bottom

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `eyebrow` | React node | undefined | Small label above title |
| `title` | React node | required | Main heading text |
| `subtitle` | React node | undefined | Optional description below title |

### Interactive States

- Display-only
- Can contain interactive children

### Mobile Layout

- Font sizes scale via media queries (not in component, done at page level)
- Margin (24px) stays consistent
- Stacks naturally on mobile

### Accessibility

- Uses semantic `<h2>` for title (ensures proper heading hierarchy)
- Eyebrow and subtitle are `<div>` and `<p>` respectively
- Good color contrast for all text

### Example Usage

```jsx
// Full section heading
<SectionHeading 
  eyebrow="Tournament Details"
  title="Spring Classic 2026"
  subtitle="Best-of-3 doubles tournament"
/>

// Title only
<SectionHeading title="Standings" />

// With subtitle
<SectionHeading 
  title="Players"
  subtitle="8 teams registered"
/>
```

### Token References

- **Colors:** `--court-600` (eyebrow), `--ink-900` (title), `--ink-500` (subtitle)
- **Typography:** `--font-display` (title)
- **Spacing:** 24px bottom margin, 8px (eyebrow margin), 6px (subtitle margin)

---

## 12. Shuttle

**Purpose:** Badminton shuttlecock decorative motif.  
**Category:** Decoration / illustration  
**Import:** `import { Shuttle } from './lib'`

### Appearance

- **Format:** SVG
- **Parts:** Feathers (upper) + cork base (lower)
- **Feathers:** Filled with main color (0.85 opacity) + white stroke lines
- **Cork:** Ellipse in tip color with white highlight
- **Viewbox:** 48×48

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | number | 32 | Width/height in pixels |
| `color` | CSS color | 'var(--court-400)' | Feather fill color |
| `tip` | CSS color | 'var(--court-600)' | Cork base color |

### Interactive States

- Display-only (decorative)

### Mobile Layout

- Scales linearly with `size`
- Responsive sizing: 24px (mobile), 32px (tablet), 40px+ (desktop)

### Accessibility

- SVG has `aria-hidden="true"` (purely decorative)
- Use in context (e.g., next to text) for semantic meaning

### Example Usage

```jsx
// Standard size
<Shuttle />

// Larger, custom colors
<Shuttle size={48} color="var(--lavender-400)" tip="var(--lavender-600)" />

// In a branded context
<div>
  <Shuttle size={24} /> Badminton Tournament
</div>
```

### Token References

- **Colors:** `--court-400` / `--court-600` (defaults), any CSS colors

---

## 13. CourtDoodle

**Purpose:** Top-down badminton court schematic for visual interest.  
**Category:** Decoration / illustration  
**Import:** `import { CourtDoodle } from './lib'`

### Appearance

- **Format:** SVG schematic
- **Elements:** Court outline + center line + service box + baseline
- **Line style:** Dashed center line, solid others
- **Viewbox:** 220×110

### Props & Variants

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | number | 220 | Width in pixels |
| `height` | number | 110 | Height in pixels |
| `color` | CSS color | 'var(--court-300)' | Line color |
| `bg` | CSS color | 'var(--court-50)' | Background fill |

### Interactive States

- Display-only (decorative)

### Mobile Layout

- Scales proportionally with width/height
- Responsive sizing: 160px wide (mobile), 220px (tablet), 280px+ (desktop)

### Accessibility

- SVG has `aria-hidden="true"` (purely decorative)
- Use for visual breaks between sections

### Example Usage

```jsx
// Standard court doodle
<CourtDoodle />

// Responsive sizing
<CourtDoodle width={160} height={80} />

// Custom colors
<CourtDoodle 
  color="var(--lavender-400)" 
  bg="var(--lavender-50)" 
/>

// Section divider
<div style={{ textAlign: 'center', margin: '40px 0' }}>
  <CourtDoodle />
</div>
```

### Token References

- **Colors:** `--court-300` / `--court-50` (defaults), any CSS colors

---

## Integration with Design Tokens

All components reference CSS custom properties from `tokens.css`:

### Color System
- **Brand:** `--court-*`, `--lavender-*`
- **Accents:** `--mint-*`, `--peach-*`, `--pink-*`, `--rose-*`, `--gold-*`
- **Neutrals:** `--ink-*`
- **Surfaces:** `--surface*`, `--bg-app`

### Styling
- **Radius:** `--r-xs` through `--r-full`
- **Shadows:** `--shadow-xs` through `--shadow-xl`, `--shadow-focus`
- **Spacing:** `--s-1` through `--s-16`

### Typography
- **Fonts:** `--font-display`, `--font-ui`, `--font-mono`

### Animation
- **Durations:** `--duration-fast`, `--duration-normal`, `--duration-slow`
- **Easing:** `--easing-snap`, `--easing-smooth`, `--easing-ease-out`
- **Keyframes:** `uacPulse`, `uacShimmer` (injected by LiveDot)

---

## Components to Build in Phase 3

The following are NOT yet implemented in lib.jsx (will be added in Phase 3):

- **Form Inputs:** Text input, select, checkbox, radio, textarea
- **Table:** TanStack Table wrapper with virtualization
- **Modal / Dialog:** Overlay with backdrop
- **Tabs:** Tab navigation
- **Dropdown:** Menu with portal positioning
- **Tooltip:** Popover tip
- **Pagination:** Page navigation
- **Loading Skeleton:** Placeholder while content loads
- **Toast / Alert:** Notifications
- **Carousel:** Image slider

---

## How to Use Components

### Import

```jsx
import {
  Logo, LogoMark, Button, Icon, PhaseBadge, Chip,
  Avatar, AvatarStack, Card, LiveDot, SectionHeading,
  Shuttle, CourtDoodle
} from './lib'
```

### Global Scope (for prototyping)

All components are exported to `window` object:

```javascript
// In browser console
const btn = <Button>Click me</Button>
```

### Styling

All components style via CSS custom properties from `tokens.css` — no CSS files needed per component. Override globally in `tokens.css` or use inline `style` prop for exceptions.

### Mobile-First Approach

- Components scale with props (size, width, height)
- Use tokens for responsive breakpoints (if needed at page level)
- Touch targets: 44px minimum (`--s-11`)

---

## Accessibility Standards

All components meet **WCAG AA** minimum requirements:

- ✅ **Color contrast:** 4.5:1 for normal text, 3:1 for large text
- ✅ **Focus indicators:** Native `<button>` and semantic elements
- ✅ **Semantic HTML:** Use native elements (`<button>`, `<a>`, `<h2>`, etc.)
- ✅ **Keyboard navigation:** All interactive components keyboard-accessible
- ✅ **Screen reader:** Proper ARIA roles and labels
- ✅ **Motion:** Animations respect `prefers-reduced-motion` (verify per component)

---

## Summary Table

| Component | Type | Props | Use Case |
|-----------|------|-------|----------|
| **Logo** | Branding | size, tone, tagline | Header, footer |
| **LogoMark** | Branding | size, color, accent | Icon, button |
| **Button** | Interactive | variant, size, icon, disabled | Actions, forms |
| **Icon** | Visual | name, size, color, strokeWidth | Graphics, UI |
| **PhaseBadge** | Status | phase, size | Tournament phases |
| **Chip** | Selection | variant, size, icon | Tags, filters |
| **Avatar** | User | name, size, src, ring, color | Profiles, teams |
| **AvatarStack** | User group | names, size, max, extra | Team displays |
| **Card** | Container | variant, padding, style | Sections, cards |
| **LiveDot** | Status | color, label | Real-time status |
| **SectionHeading** | Typography | eyebrow, title, subtitle | Section headers |
| **Shuttle** | Decoration | size, color, tip | Branding, icons |
| **CourtDoodle** | Decoration | width, height, color, bg | Dividers, visual breaks |

---

**Last Updated:** 2026-05-15  
**Design System:** Pastel Flat 2.0  
**Reference:** See TASK19_DESIGN_SPEC.md for complete design system
