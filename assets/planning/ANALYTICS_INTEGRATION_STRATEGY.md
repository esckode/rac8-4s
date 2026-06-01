# Analytics Integration Strategy
## Integrated vs. Bolt-On: Decision Framework

**Date:** 2026-05-15  
**Context:** Choosing between integrating metrics during UI development (Phase 2-4) vs. after (Phase 7+)

---

## Executive Summary

**Recommendation: Integrate during Phase 2 (Hooks), NOT during Phase 3-4 component/page building**

**Rationale:**
- **Metrics belong in state/hooks layer** (not UI components)
- **Hooks are the right abstraction** (useNavigate, useAnalytics as primitives)
- **Lowest coupling, highest maintainability**
- **Zero impact on component/page development**
- **Can be bolted on exactly like hooks** are designed for

---

## Option 1: Bolt On After (Phase 7+)
### After all UI is built

**Pros:**
- UI development unblocked/undistractED
- Metrics don't influence component design
- Can see full product before adding instrumentation
- If analytics not needed, easy to skip

**Cons:**
- ❌ **Harder to retrofit navigation tracking** — routing already built, hard to insert telemetry
- ❌ **Miss early performance data** — don't know if screens are slow until late
- ❌ **Timestamp skew** — harder to correlate client timestamps with server logs
- ❌ **Requires rework of navigation logic** — have to thread analytics through existing nav code
- ❌ **Lost context** — may forget why certain screens exist or which flows matter
- ❌ **Testing burden increases** — have to retrofit tests AND add metrics tests
- ❌ **Higher risk** — changes routing/hooks when already stable

**Timeline Impact:**
```
Phase 3-4: Build UI (don't know if it's slow)
         → Ship product
Phase 7+: "We need to know why players drop off"
         → Refactor navigation to add tracking
         → Add event API endpoint
         → Retry logic, error handling
         → Test everything again
         → 2-3 weeks of rework
```

**Effort Estimate:** 15-20 hours (large rework)

---

## Option 2: Integrate During Phase 2 (Recommended)
### During hook development, before component/page building

**How it works:**
```
Phase 2: Build hooks layer
  ├─ useStandingsStore (existing)
  ├─ useMatchStore (existing)
  ├─ useAnalytics (NEW) ← Track metrics here
  └─ useNavigation (NEW) ← Use analytics inside
       └─ Logs: screen_view, time_to_data, etc.

Phase 3: Build components
  └─ Just import useStandingsStore, useMatchStore
     (analytics transparent, hooks handle it)

Phase 4: Build pages
  └─ Just compose components
     (routing logic already has metrics)

Phase 7: Testing
  └─ Verify metrics are sent (already instrumented)
```

**Why Phase 2 is the right place:**

1. **Hooks are the natural seam** (single responsibility: state + side effects)
   ```typescript
   // useStandingsStore is ALREADY a hook that:
   // - Fetches data from API
   // - Updates local state
   // - Triggers re-renders
   // 
   // Adding analytics here = just adding another effect
   
   export const useStandingsStore = (tournamentId: string) => {
     const [standings, setStandings] = useState(null)
     const [loading, setLoading] = useState(true)
     
     useEffect(() => {
       const start = performance.now()
       
       fetch(`/api/tournaments/${tournamentId}/standings`)
         .then(res => res.json())
         .then(data => {
           const apiTime = performance.now() - start
           const totalWaitTime = performance.now() - start // in real code, measure from request start
           
           // Metric collection: seamless
           analytics.track('time_to_data', {
             screen: 'standings',
             apiTime,
             totalWaitTime
           })
           
           setStandings(data)
         })
     }, [tournamentId])
     
     return { standings, loading }
   }
   ```

2. **Navigation is also a hook opportunity** (create custom hook)
   ```typescript
   // NEW: usePageNavigation hook
   export const usePageNavigation = () => {
     const [currentPage, setCurrentPage] = useState('landing')
     const previousPageRef = useRef(null)
     const pageEnterTimeRef = useRef(Date.now())
     
     useEffect(() => {
       // Log time on previous page when leaving
       if (previousPageRef.current) {
         const timeOnPage = Date.now() - pageEnterTimeRef.current
         analytics.track('screen_view', {
           screen: previousPageRef.current,
           duration: timeOnPage
         })
       }
       
       previousPageRef.current = currentPage
       pageEnterTimeRef.current = Date.now()
     }, [currentPage])
     
     return { currentPage, navigateTo: setCurrentPage }
   }
   ```

3. **Zero impact on components** (they don't know metrics exist)
   ```typescript
   // Phase 3 component: doesn't change
   export const StandingsTable = ({ tournamentId }) => {
     const { standings, loading } = useStandingsStore(tournamentId)
     // ^ metrics are collected transparently inside the hook
     
     return <div>{/* render */}</div>
   }
   ```

**Pros:**
- ✅ **Hooks are the right abstraction** (they're for side effects + state)
- ✅ **Zero coupling to components** (UI devs don't see metrics code)
- ✅ **Automatic collection** (hooks handle it, just works)
- ✅ **Easy to test** (hook unit tests validate metrics)
- ✅ **Low risk** (hooks are isolated, clear contracts)
- ✅ **Early performance visibility** (know which screens are slow before shipping)
- ✅ **Natural evolution** (Phase 2 is already building hooks)
- ✅ **No rework needed** (Phase 3-4 builds exactly as planned)

**Timeline Impact:**
```
Phase 2: Build hooks layer (includes analytics)
  └─ useAnalytics, usePageNavigation (2 extra hours)
  └─ useStandingsStore tracks time_to_data (no extra time, just add one line)
  └─ useMatchStore tracks time_to_data (no extra time, just add one line)

Phase 3-4: Build UI (metrics already flowing)
         → "Oh, standings take 2.3s on slow networks" (debug early)

Phase 7: Testing
     → Verify metrics (1 hour of tests)
     → Ship with analytics enabled
```

**Effort Estimate:** 6-8 hours (2 extra in Phase 2, 1 in Phase 7)

---

## Option 3: Hybrid (Sensible Middle Ground)
### Stub metrics during Phase 2, implement after Phase 4

If you're uncertain about metrics needs:

**Phase 2:**
```typescript
// useAnalytics.ts — just a stub
export const useAnalytics = () => ({
  track: (event: string, data: any) => {
    // console.log(`[METRICS] ${event}`, data)
    // No-op for now
  }
})

// useStandingsStore adds the hook call
const { track } = useAnalytics()
track('time_to_data', { ... })
// But no backend yet
```

**Phase 7:**
```typescript
// Implement the backend POST when ready
// Existing code already calls track(), just start sending now
```

**Pros:**
- ✅ Infrastructure in place (early)
- ✅ Can skip if not needed (just don't implement backend)
- ✅ Doesn't delay UI work (Phase 2 adds 30 min of no-op hooks)
- ✅ Zero rework later (just flip switch to send events)

**Cons:**
- ⚠️ Slight code overhead (unused function calls)
- ⚠️ Discipline required (devs must remember to call track() in new hooks)

---

## Decision Matrix

| Criteria | Bolt On (Phase 7) | Phase 2 | Hybrid |
|----------|-------------------|---------|--------|
| **Effort** | 15-20h | 6-8h | 6-8h |
| **Risk to UI Dev** | None | None | None |
| **Risk to Phase 2** | N/A | Low | Very Low |
| **Early Performance Data** | ❌ No | ✅ Yes | ✅ Yes |
| **Rework Required** | ✅ Yes | ❌ No | ❌ No |
| **Can Be Optional** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Component Coupling** | Medium | None | None |
| **Timeline Impact** | +3 weeks Phase 7 | +0 weeks | +0 weeks |
| **Code Clarity** | Mixed (threading logic) | High (hooks own it) | High (hooks own it) |

---

## Implementation Pattern for Phase 2 Integration

If you choose Phase 2 integration, here's the exact pattern:

### 1. Create Analytics Hook (30 min)
```typescript
// packages/frontend/src/hooks/useAnalytics.ts
import { useCallback } from 'react'

type AnalyticsEvent = {
  eventType: string
  screen?: string
  [key: string]: any
}

let eventBuffer: AnalyticsEvent[] = []

export const useAnalytics = () => {
  const track = useCallback((event: string, data?: any) => {
    const analyticsEvent: AnalyticsEvent = {
      eventType: event,
      timestamp: Date.now(),
      userId: getCurrentUserId(), // from auth context
      ...data
    }

    eventBuffer.push(analyticsEvent)

    // Flush periodically (10 events) or on page unload
    if (eventBuffer.length >= 10) {
      flushEvents()
    }
  }, [])

  return { track }
}

const flushEvents = async () => {
  if (eventBuffer.length === 0) return

  const events = [...eventBuffer]
  eventBuffer = []

  try {
    await fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events })
    })
  } catch (err) {
    // Silent fail (don't break app for metrics)
    console.debug('Analytics flush failed', err)
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    navigator.sendBeacon(
      '/api/analytics/events',
      JSON.stringify({ events: eventBuffer })
    )
  })
}
```

### 2. Create Navigation Hook (30 min)
```typescript
// packages/frontend/src/hooks/usePageNavigation.ts
import { useState, useEffect, useRef } from 'react'
import { useAnalytics } from './useAnalytics'

export const usePageNavigation = (initialPage: string = 'home') => {
  const [currentPage, setCurrentPage] = useState(initialPage)
  const previousPageRef = useRef<string | null>(null)
  const pageEnterTimeRef = useRef(Date.now())
  const { track } = useAnalytics()

  useEffect(() => {
    // Log time on previous page when page changes
    if (previousPageRef.current && previousPageRef.current !== currentPage) {
      const timeOnPage = Date.now() - pageEnterTimeRef.current
      track('screen_view', {
        screen: previousPageRef.current,
        duration: timeOnPage
      })
    }

    previousPageRef.current = currentPage
    pageEnterTimeRef.current = Date.now()
  }, [currentPage, track])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previousPageRef.current) {
        const timeOnPage = Date.now() - pageEnterTimeRef.current
        track('screen_view', {
          screen: previousPageRef.current,
          duration: timeOnPage
        })
      }
    }
  }, [track])

  return {
    currentPage,
    navigateTo: setCurrentPage
  }
}
```

### 3. Update Existing Hooks (1 line each, 30 min)
```typescript
// packages/frontend/src/hooks/useStandingsStore.ts
export const useStandingsStore = (tournamentId: string) => {
  const [standings, setStandings] = useState<Standing[] | null>(null)
  const [loading, setLoading] = useState(true)
  const { track } = useAnalytics() // ADD THIS

  useEffect(() => {
    const apiStartTime = performance.now()

    fetch(`/api/tournaments/${tournamentId}/standings`)
      .then(res => res.json())
      .then(data => {
        const apiEndTime = performance.now()
        const renderStartTime = performance.now()

        setStandings(data)

        // ADD THIS: Track when data arrives vs. when rendered
        requestAnimationFrame(() => {
          const renderEndTime = performance.now()
          track('time_to_data', {
            screen: 'standings',
            apiDuration: apiEndTime - apiStartTime,
            totalDuration: renderEndTime - apiStartTime,
            recordCount: data.length
          })
        })
      })
  }, [tournamentId, track])

  return { standings, loading }
}
```

### 4. Create Backend Endpoint (45 min)
```typescript
// packages/api/src/routes/analytics.ts
import { Router } from 'koa'
import { auth } from '../middleware/auth'
import { getLogger } from '../logger'

const log = getLogger('analytics')
const router = new Router({ prefix: '/analytics' })

router.post('/events', auth, async (ctx) => {
  const { events } = ctx.request.body as { events: any[] }
  
  if (!Array.isArray(events) || events.length === 0) {
    ctx.status = 400
    return
  }

  try {
    // Store events in database
    // For now, just log them
    log.info('analytics.batch_received', {
      userId: ctx.state.userId,
      eventCount: events.length,
      eventTypes: events.map(e => e.eventType).join(',')
    })

    // TODO: Insert into user_events table
    // await db.query(
    //   'INSERT INTO user_events (userId, eventType, screen, duration, data, createdAt) VALUES ...',
    //   [...]
    // )

    ctx.status = 204 // No Content
  } catch (err) {
    log.error('analytics.batch_failed', { error: err.message })
    ctx.status = 500
  }
})

export default router
```

---

## Recommendation for Task #19

**Implement Phase 2 Integrated approach:**

1. **Phase 2 adds:**
   - `useAnalytics()` hook (reusable, singleton)
   - `usePageNavigation()` hook (tracks screen_view events)
   - One-line additions to `useStandingsStore`, `useMatchStore`, etc. (track time_to_data)
   - Total: ~2 hours

2. **Phase 7 adds:**
   - Backend `POST /analytics/events` endpoint
   - `user_events` database table
   - Tests for analytics collection
   - Total: ~2 hours

3. **Phase 3-4:** Completely unchanged
   - Components don't know metrics exist
   - Routing built normally
   - No coupling

**Why this is superior:**
- ✅ Early visibility into performance (know which screens are slow immediately)
- ✅ Zero rework (no Phase 7 refactoring)
- ✅ Lowest risk (hooks are isolated, clear contracts)
- ✅ Can be toggled off easily (just stub the hook)
- ✅ Most maintainable long-term (metrics live where data flows)

---

## The "Metrics Belong Where Data Flows" Principle

The key insight: **Metrics should be collected at the same place where data flows.** 

In this architecture:
- Data flows through hooks (useStandingsStore, useMatchStore)
- Navigation state flows through hooks (usePageNavigation)
- Therefore, metrics collection belongs in hooks

This is the same principle as CLAUDE.md's logging guideline:
> "Structured logging added — Implements CLAUDE.md Section 6: logger.info() with proper event naming"

Just applied to client-side:
- **Backend:** Log at API routes (where data flows)
- **Frontend:** Collect metrics at hooks (where data flows)

---

## Final Answer

**Choose Phase 2 integration.** It's:
- Easier (less total effort)
- Less risky (no rework)
- Higher quality (metrics at right abstraction level)
- More maintainable (hooks are designed for this)

And it provides immediate value (early performance visibility) without delaying or complicating the UI build.
