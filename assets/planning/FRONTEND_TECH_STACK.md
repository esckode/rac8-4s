# Frontend Tech Stack Recommendation - Task #19

## Overview

Recommended modern, lightweight, open-source tech stack for implementing Task #19 frontend components (dashboards, standings tables, bracket visualization).

**All tools are MIT/ISC licensed and vendor-neutral** (no vendor lock-in).

---

## Recommended Stack

### 1. **Framework: React 19+**

**Package:** `react@^19.0.0`  
**License:** MIT (open-source, maintained by Meta)  
**Installation:** `npm install react@latest react-dom@latest`

#### Why React 19+
- ✅ Latest stable version with React 19 improvements
- ✅ Excellent component reusability for dashboard, tables, bracket
- ✅ Strong ecosystem: React Testing Library, browser DevTools
- ✅ Ideal for SSE event subscription patterns (via `useEffect` hooks)
- ✅ Large community, abundant tutorials and libraries
- ✅ Native support for async operations (perfect for API calls from Task #18)

#### React 19 Key Features (vs 18)
- **Action functions:** Cleaner form submission handling (async)
- **useActionState hook:** Built-in form state management (reduces boilerplate)
- **useOptimistic hook:** Optimistic UI updates (great for score submissions)
- **Improved Server Components:** Better code splitting (future-proofing)

#### Disadvantages
❌ **Learning curve** — Not as simple as vanilla HTML/JS; requires understanding component lifecycle, hooks, props  
❌ **Bundle size** — React + ReactDOM = ~42 KB gzipped (significant but acceptable)  
❌ **Over-engineering risk** — Easy to add complexity; requires discipline for simplicity  
❌ **Dependencies** — Relies on npm ecosystem; npm ecosystem occasionally breaks  
❌ **Browser compatibility** — Targets modern browsers (ES2020+); IE11 not supported  
❌ **Debugging** — React's virtual DOM can make debugging harder vs vanilla JS  

---

### 2. **Styling: Tailwind CSS 4+**

**Package:** `tailwindcss@^4.0.0`  
**License:** MIT (open-source, maintained by Tailwind Labs)  
**Installation:** `npm install -D tailwindcss@latest postcss autoprefixer`

#### Why Tailwind CSS
- ✅ **Responsive design first** — Mobile/tablet/desktop layouts with `sm:`, `md:`, `lg:` prefixes
- ✅ **Dark mode built-in** — Switch themes with `dark:` prefix (useful for tournaments dashboard)
- ✅ **Zero CSS files** — Classes only; no separate CSS to maintain
- ✅ **Small output** — Tree-shakes unused classes; final CSS often < 15 KB gzipped
- ✅ **Consistency** — Design tokens enforced (spacing, colors, fonts)
- ✅ **Component composition** — Build reusable component classes with `@apply`

#### Tailwind 4 Improvements (vs 3)
- **CSS variables:** Native support for theming (easier dark mode)
- **Smaller output:** Better tree-shaking, reduced CSS size
- **Faster:** Improved JIT compilation speed

#### Example: Responsive Tournament Card

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div className="p-4 border rounded-lg bg-white dark:bg-gray-900 hover:shadow-lg">
    <h3 className="text-lg font-bold">{tournament.name}</h3>
    <p className="text-sm text-gray-600 dark:text-gray-400">{tournament.sport}</p>
    <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
      Register
    </button>
  </div>
</div>
```

#### Disadvantages
❌ **Class-based** — Lots of `className` attributes; some find it verbose  
❌ **No variables initially** — Tailwind 3 lacked CSS variables (fixed in v4)  
❌ **Learning curve** — Need to learn Tailwind class names (2-3 days typical)  
❌ **Utility fatigue** — Very long className strings for complex components (use `@apply` to mitigate)  
❌ **Not traditional CSS** — Different mental model from CSS Modules or styled-components  
❌ **Customization** — Theming requires `tailwind.config.js` setup  

---

### 3. **Bracket Visualization: @xyflow/react (React Flow)** — supersedes @g-loot

> **⚠️ SUPERSEDED (2026-06-18).** The original choice below — `@g-loot/react-tournament-brackets` — was
> abandoned and is incompatible with this project's React 19:
> - Latest published is `1.0.31-rc` (the `^2.0.0` cited below was never published); last release Dec 2023.
> - Peer-deps `react@^18` + `styled-components@^4` + `react-svg-pan-zoom@^3` — all stale; styled-components 4 on React 19 is known-broken.
> - The whole single-elim bracket ecosystem is dead (`react-brackets` React ^17 / 2022, `react-tournament-bracket` 2022).
>
> **Decision:** the organizer bracket tree uses **`@xyflow/react` (React Flow) v12** — actively maintained
> (peer `react>=17`, native React 19), light deps (`zustand`/`classcat`), real SVG connector edges + pan/zoom,
> mobile-friendly. Single-elimination is laid out by a small pure transform (`bracketToFlow`: round → x column,
> position → y, edges feed each match into the next round). Player view stays match-focused (no tree).
> Implementation: `OrganizerBracket.tsx` + `bracketToFlow.ts`. Install: `npm install @xyflow/react`.

---

#### Original (superseded) recommendation

**Package:** `@g-loot/react-tournament-brackets@^2.0.0`  
**License:** MIT (open-source)  
**Installation:** `npm install @g-loot/react-tournament-brackets`

#### Why @g-loot
- ✅ **Single-elimination brackets** — Exactly what tournaments need (Task #3)
- ✅ **Pan/zoom built-in** — SVGViewer handles large brackets on small screens
- ✅ **Responsive mobile-first** — Touch gestures work natively on phones/tablets
- ✅ **Theming support** — Dark/light themes built-in
- ✅ **Custom match components** — Replace default match render with custom React components
- ✅ **Production-tested** — Used in real G Loot tournaments
- ✅ **Zero configuration** — Works out-of-box

#### Implementation Example

```tsx
import { SingleEliminationBracket, Match, SVGViewer } from '@g-loot/react-tournament-brackets'

export function BracketScreen() {
  const matches = useMatchStore() // From Task #18
  
  return (
    <SingleEliminationBracket
      matches={matches}
      matchComponent={match => (
        <div className="p-2 border rounded bg-white hover:bg-blue-50">
          <div className="font-bold text-sm">{match.player1?.name}</div>
          <div className="text-xs text-gray-400">vs</div>
          <div className="font-bold text-sm">{match.player2?.name}</div>
        </div>
      )}
      svgWrapper={({ children, ...props }) => (
        <SVGViewer width={800} height={600} {...props}>
          {children}
        </SVGViewer>
      )}
    />
  )
}
```

#### Disadvantages
❌ **Single elimination only** — No double-elimination support (acceptable for this tournament)  
❌ **Limited customization** — Can't dramatically change layout algorithm  
❌ **Dependency** — Adds another npm package to maintain/update  
❌ **SVG-only** — No canvas/WebGL rendering (SVG is slower for very large brackets)  
❌ **Bundle size** — ~15 KB gzipped (acceptable trade-off for functionality)  

---

### 4. **Data Tables: TanStack Table (React Table) 8+**

**Package:** `@tanstack/react-table@^8.0.0`  
**License:** MIT (open-source, maintained by Tanner Linsley)  
**Installation:** `npm install @tanstack/react-table`

#### Why TanStack Table
- ✅ **Headless UI** — Total control over rendering (no predefined styles)
- ✅ **Sorting/filtering/pagination** — All built-in
- ✅ **Virtual scrolling** — Handles 1000+ rows efficiently
- ✅ **Type-safe** — Full TypeScript support
- ✅ **Zero CSS** — Style however you want (Tailwind, CSS Modules, etc.)
- ✅ **SSE-friendly** — Easy to update table data on real-time events

#### Example: Standings Table with Real-Time Updates

```tsx
import { useReactTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table'

export function StandingsTable() {
  const standings = useStandingsStore() // From Task #18, updates via SSE
  const [sorting, setSorting] = useState([{ id: 'wins', desc: true }])
  
  const table = useReactTable({
    data: standings,
    columns: [
      { accessorKey: 'rank', header: 'Rank' },
      { accessorKey: 'playerName', header: 'Player' },
      { accessorKey: 'wins', header: 'Wins', cell: info => info.getValue<number>() },
      { accessorKey: 'setsWon', header: 'Sets Won' }
    ],
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  })
  
  return (
    <table className="w-full">
      <thead>
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th key={header.id} className="text-left p-2">
                {header.isPlaceholder ? null : (
                  <button
                    onClick={() => header.column.toggleSorting()}
                    className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </button>
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr key={row.id} className="border-t hover:bg-gray-50">
            {row.getVisibleCells().map(cell => (
              <td key={cell.id} className="p-2">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

#### Disadvantages
❌ **Headless** — Must build all UI yourself (no pre-styled table component)  
❌ **Boilerplate** — More code than pre-styled table libraries (e.g., MUI DataGrid)  
❌ **Learning curve** — Hook-based API takes time to understand  
❌ **No accessibility defaults** — Must add aria labels manually  
❌ **Manual pagination UI** — No built-in pagination buttons (you build them)  

---

### 5. **Dev Server: Vite 6+**

**Package:** `vite@^6.0.0`  
**License:** MIT (open-source, maintained by Evan You)  
**Installation:** `npm create vite@latest my-app -- --template react`

#### Why Vite
- ✅ **Lightning-fast HMR** — Code changes reflect in browser instantly (< 100ms)
- ✅ **Fast cold starts** — Dev server starts in ~300ms (vs Webpack's 5-10s)
- ✅ **Native ES modules** — Uses browser ES modules in dev, bundles for prod
- ✅ **Optimized builds** — Excellent code splitting and tree-shaking
- ✅ **TypeScript support** — Works with TS out-of-box
- ✅ **CSS/image handling** — Automatic optimization
- ✅ **Plugin ecosystem** — React, Vue, Svelte plugins available

#### vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000' // Proxy API calls to backend
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
```

#### Disadvantages
❌ **Newer tool** — Less battle-tested than Webpack (though very stable now)  
❌ **Different mental model** — Requires understanding ES modules in dev vs bundling in prod  
❌ **Browser support** — Modern browsers only (ES2020+); IE11 not supported  
❌ **Large SPA overhead** — Vite still sends full app in dev (better with lazy routes)  
❌ **Plugin ecosystem** — Smaller than Webpack (though most common plugins exist)  

---

### 6. **Testing: Jest 29+ with React Testing Library**

**Packages:**
- `jest@^29.0.0`
- `@testing-library/react@^14.0.0`
- `@testing-library/jest-dom@^6.0.0`

**License:** MIT (open-source)  
**Installation:** `npm install -D jest @testing-library/react @testing-library/jest-dom`

#### Why Jest + React Testing Library
- ✅ **User-centric testing** — Test components as users interact with them (not implementation)
- ✅ **Excellent React support** — Designed specifically for React testing
- ✅ **Fast execution** — Jest runs tests in parallel, caches results
- ✅ **Snapshot testing** — Catch UI regressions with snapshots (use sparingly)
- ✅ **Good debugging** — `screen.debug()` shows component HTML
- ✅ **Async handling** — `waitFor()` for SSE updates and API calls
- ✅ **Mock support** — Jest has built-in mocking (jest.fn(), jest.mock())

#### Example: Testing SSE-Updated Standings Table

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { StandingsTable } from './StandingsTable'
import { StandingsStore } from '@frontend/state/standings-state'

describe('StandingsTable', () => {
  it('should re-render when SSE standings.updated event arrives', async () => {
    const mockStore = new StandingsStore()
    
    render(<StandingsTable store={mockStore} />)
    
    // Initial standings show Alice in first place
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Alice').closest('tr')).toHaveTextContent('1st')
    
    // Simulate SSE event: standings updated
    mockStore.update({
      groupId: 'group1',
      standings: [
        { playerId: 'p2', name: 'Bob', wins: 3, rank: 1 },
        { playerId: 'p1', name: 'Alice', wins: 2, rank: 2 }
      ]
    })
    
    // Table re-renders with new standings
    await waitFor(() => {
      expect(screen.getByText('Bob').closest('tr')).toHaveTextContent('1st')
    })
  })
  
  it('should sort by wins when clicking header', async () => {
    const mockStore = new StandingsStore()
    mockStore.setStandings([
      { playerId: 'p1', name: 'Alice', wins: 1 },
      { playerId: 'p2', name: 'Bob', wins: 3 }
    ])
    
    render(<StandingsTable store={mockStore} />)
    
    const winsHeader = screen.getByText('Wins')
    fireEvent.click(winsHeader)
    
    // Verify sorted order
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Bob') // Bob (3 wins) first
    expect(rows[2]).toHaveTextContent('Alice') // Alice (1 win) second
  })
})
```

#### Disadvantages
❌ **Setup complexity** — Requires configuration (jest.config.js, setup files)  
❌ **Snapshot brittleness** — Snapshots break on every UI change (must be reviewed)  
❌ **Mocking challenges** — Mocking EventSource and SSE requires custom mocks  
❌ **Slow for large suites** — 1000+ tests can take > 30s (though still acceptable)  
❌ **Async complexity** — Testing async operations (API calls, SSE) requires careful `waitFor()` usage  

---

### 7. **Icon Library: Lucide React**

**Package:** `lucide-react@^0.400.0`  
**License:** ISC (open-source)  
**Installation:** `npm install lucide-react`

#### Why Lucide React
- ✅ **1000+ icons** — Covers tournament UI needs (play, pause, checkmark, error, etc.)
- ✅ **React components** — Drop-in usage, props for size/color/stroke
- ✅ **Small bundle** — Tree-shaking means unused icons don't get bundled
- ✅ **Consistent design** — All icons follow same style guidelines
- ✅ **Accessibility** — Built-in aria labels and semantic naming
- ✅ **Active development** — New icons added regularly

#### Example: Using Icons in Tournament UI

```tsx
import { Play, CheckCircle, AlertCircle, Trophy } from 'lucide-react'

export function MatchCard({ match }) {
  return (
    <div className="p-4 border rounded">
      {match.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-600" />}
      {match.status === 'pending' && <Play className="w-5 h-5 text-gray-400" />}
      {match.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
      
      <h3 className="font-bold">{match.player1.name} vs {match.player2.name}</h3>
      
      {match.winner === 'player1' && <Trophy className="w-4 h-4" />}
    </div>
  )
}
```

#### Disadvantages
❌ **SVG overhead** — Each icon is an SVG (adds to bundle, though minimal)  
❌ **Limited customization** — Icons have fixed designs; can't heavily modify them  
❌ **No icon fonts** — Doesn't reduce HTTP requests like icon fonts do  

---

## Summary: Stack Decisions

| Category | Choice | Rationale |
|----------|--------|-----------|
| **Framework** | React 19+ | Component reusability, SSE patterns, strong ecosystem |
| **Styling** | Tailwind CSS 4+ | Responsive design, dark mode, small bundle, mobile-first |
| **Bracket Viz** | @g-loot/react-tournament-brackets | Pan/zoom, mobile-optimized, production-tested |
| **Tables** | TanStack Table 8+ | Headless, sortable, filterable, real-time updates friendly |
| **Dev Server** | Vite 6+ | Lightning HMR, fast cold starts, modern build |
| **Testing** | Jest 29+ + React Testing Library | User-centric, excellent async handling, good React support |
| **Icons** | Lucide React | 1000+ icons, tree-shakeable, accessible |

---

## Installation & Setup

### Step 1: Create React App with Vite

```bash
npm create vite@latest packages/frontend -- --template react
cd packages/frontend
npm install
```

### Step 2: Install Additional Dependencies

```bash
npm install @g-loot/react-tournament-brackets @tanstack/react-table lucide-react

npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Step 3: Configure TypeScript (already set up by Vite)

Vite auto-generates `tsconfig.json`. Ensure `@shared/*` alias is configured:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../../shared/src/*"]
    }
  }
}
```

### Step 4: Configure Tailwind

**tailwind.config.js**
```javascript
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tournament: {
          primary: '#2563eb',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444'
        }
      }
    }
  },
  darkMode: 'class',
  plugins: []
}
```

### Step 5: Run Dev Server

```bash
npm run dev  # Starts on http://localhost:5173
```

---

## Performance Targets

| Metric | Target | Typical |
|--------|--------|---------|
| **Bundle size** | < 150 KB gzipped | ~120 KB (React + Tailwind + @g-loot + Table) |
| **Initial load** | < 2s on 4G | ~1.2s (Vite + optimized assets) |
| **HMR (hot reload)** | < 100ms | ~50ms (Vite native) |
| **Time to interactive** | < 3s | ~1.8s |
| **LCP (Largest Contentful Paint)** | < 2.5s | ~2.0s |
| **FID (First Input Delay)** | < 100ms | ~40ms |

---

## Disadvantages Summary

### Most Critical
1. **React learning curve** — Requires understanding hooks, state, props (2-3 week ramp-up for new devs)
2. **Bundle size** — 42 KB React + supporting libraries (not tiny, but acceptable)
3. **SSE mocking** — Testing real-time updates requires custom EventSource mocks
4. **Tailwind verbosity** — Long className strings (mitigate with `@apply`)

### Moderate Concerns
- Vite is newer (though very stable and widely adopted)
- TanStack Table requires building UI from scratch (more code than pre-styled tables)
- Snapshot testing can be brittle (use sparingly)

### Minor Concerns
- No IE11 support (acceptable for 2026 web apps)
- Lucide icons are SVG-based (negligible performance impact)
- TypeScript compilation adds dev time (< 200ms, acceptable)

---

## Alternative Considerations

### If bundle size is critical:
- Replace React with **Preact** (~3 KB, API-compatible with React)
- Use **CSS-in-JS** lite library instead of Tailwind (e.g., `nano-css`)

### If you want pre-styled components:
- **ShadcN** components (Tailwind-based, headless)
- **Headless UI** (from Tailwind Labs, pre-accessible components)
- **Material-UI** (larger, more opinionated)

### If you want different testing approach:
- **Vitest** instead of Jest (faster, Vite-native)
- **Playwright** for E2E testing (Task #20)

---

## Verification Checklist

Before starting Task #19 implementation:

- [ ] React 19+ installed: `npm list react` shows 19.x.x or higher
- [ ] Vite dev server works: `npm run dev` shows no errors
- [ ] Tailwind configured: `npm run build` compiles CSS
- [ ] @g-loot installed: `npm list @g-loot/react-tournament-brackets`
- [ ] TanStack Table installed: `npm list @tanstack/react-table`
- [ ] Jest configured: `npm test` runs without errors
- [ ] Task #18 state stores importable: `import { TournamentStore } from '@frontend/state'`
- [ ] TypeScript types OK: `npm run type-check` (no errors)

---

**All recommendations are finalized. Ready to begin Task #19 implementation.**
