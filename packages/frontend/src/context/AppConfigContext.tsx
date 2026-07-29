/**
 * UAT ISSUE-29 — server-authoritative feature flags via GET /api/config.
 *
 * publicDiscoveryEnabled gates /browse, /tournament/:id/browse and the nav's
 * Browse tab. Fetched once on mount; fails closed (flag stays false) on a
 * network error, matching the "default off" production posture rather than
 * accidentally exposing discovery when the config call itself is broken.
 */

import React, { createContext, useContext, useEffect, useState } from 'react'

interface AppConfigContextValue {
  publicDiscoveryEnabled: boolean
  loading: boolean
}

const AppConfigContext = createContext<AppConfigContextValue>({
  publicDiscoveryEnabled: false,
  loading: true,
})

export function AppConfigProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<AppConfigContextValue>({
    publicDiscoveryEnabled: false,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    fetch('/api/config')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('config fetch failed'))))
      .then((data: { publicDiscoveryEnabled?: boolean }) => {
        if (!cancelled) {
          setState({ publicDiscoveryEnabled: !!data.publicDiscoveryEnabled, loading: false })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ publicDiscoveryEnabled: false, loading: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <AppConfigContext.Provider value={state}>{children}</AppConfigContext.Provider>
}

export function useAppConfig(): AppConfigContextValue {
  return useContext(AppConfigContext)
}
