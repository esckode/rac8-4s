/**
 * usePlayerSettings — Player Personalization P10 (table density)
 *
 * Fetches GET /api/auth/me once on mount for the display prefs a component
 * needs (currently just tableDensity). Defaults to 'comfortable' and never
 * throws — density is cosmetic, never worth an error state.
 *
 * Known scope boundary (BACKLOG.md): /api/auth/me is account-JWT-only (it
 * predates the pending-actions dual-auth fix and returns account-shaped
 * fields a player session doesn't have), so a magic-link player-session
 * visitor sees the default density rather than their saved one. Unlike the
 * pending-actions bug, nothing breaks — it just doesn't personalize yet.
 */
import { useEffect, useState } from 'react'

export interface PlayerDisplaySettings {
  tableDensity: 'comfortable' | 'compact'
}

const DEFAULT_DISPLAY_SETTINGS: PlayerDisplaySettings = { tableDensity: 'comfortable' }

export function usePlayerSettings(): PlayerDisplaySettings {
  const [settings, setSettings] = useState<PlayerDisplaySettings>(DEFAULT_DISPLAY_SETTINGS)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { settings?: { tableDensity?: 'comfortable' | 'compact' } } | null) => {
        if (data?.settings?.tableDensity) {
          setSettings({ tableDensity: data.settings.tableDensity })
        }
      })
      .catch(() => {})
  }, [])

  return settings
}
