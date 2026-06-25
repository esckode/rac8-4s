/**
 * V1.5 — Global 503 / service-unavailable state.
 *
 * When the API returns 503 (Redis outage), `notify503()` is called by the
 * fetch wrapper. The `ServiceUnavailableProvider` listens for that signal and
 * flips the `serviceUnavailable` flag, which `App` reads to swap in the
 * maintenance page instead of normal routes.
 *
 * Design: a module-level callback registry lets `apiFetch` (a plain function,
 * not in React) reach React state without coupling the two layers.
 */

import React, { createContext, useContext, useState, useEffect } from 'react'

// Module-level listener — set by ServiceUnavailableProvider, called by notify503()
let _listener: (() => void) | null = null

/**
 * Call this from the API layer when any request returns HTTP 503.
 * Safe to call before a provider is mounted — the flag is latched.
 */
export function notify503(): void {
  if (_listener) {
    _listener()
  }
}

interface ServiceUnavailableContextValue {
  serviceUnavailable: boolean
}

const ServiceUnavailableContext = createContext<ServiceUnavailableContextValue>({
  serviceUnavailable: false,
})

export function ServiceUnavailableProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [serviceUnavailable, setServiceUnavailable] = useState(false)

  useEffect(() => {
    _listener = () => setServiceUnavailable(true)
    return () => {
      _listener = null
    }
  }, [])

  return (
    <ServiceUnavailableContext.Provider value={{ serviceUnavailable }}>
      {children}
    </ServiceUnavailableContext.Provider>
  )
}

export function useServiceUnavailable(): ServiceUnavailableContextValue {
  return useContext(ServiceUnavailableContext)
}
