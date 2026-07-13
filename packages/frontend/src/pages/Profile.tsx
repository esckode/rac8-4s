/**
 * Profile — /profile
 *
 * Player Personalization P0: the app's first player-settings surface,
 * opened from the header avatar/gear (not a bottom tab — settings aren't a
 * daily, badged surface). Reads/writes GET|PATCH /api/auth/me(/settings).
 */
import React, { useEffect, useState } from 'react'

interface ProfileSettings {
  timezone: string | null
  timezoneManual: boolean
  tableDensity: 'comfortable' | 'compact'
}

export const Profile: React.FC = () => {
  const [settings, setSettings] = useState<ProfileSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    fetch('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => res.json())
      .then(data => setSettings(data.settings))
      .finally(() => setLoading(false))
  }, [])

  async function handleDensityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const tableDensity = e.target.value as 'comfortable' | 'compact'
    setSettings(prev => (prev ? { ...prev, tableDensity } : prev))
    const token = localStorage.getItem('auth_token')
    await fetch('/api/auth/me/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ tableDensity }),
    })
  }

  if (loading) {
    return <div data-testid="profile-page" className="p-4">Loading…</div>
  }

  return (
    <div data-testid="profile-page" className="p-4 space-y-6">
      <h1 className="text-2xl font-bold text-[--ink-900]">Profile</h1>

      <section className="rounded-xl border border-[--border] p-4 bg-[--surface] space-y-3">
        <h2 className="text-base font-semibold text-[--ink-800]">Display</h2>
        <div className="flex items-center gap-3">
          <label htmlFor="density-select" className="text-sm text-[--ink-700]">
            Table density
          </label>
          <select
            id="density-select"
            data-testid="density-select"
            value={settings?.tableDensity ?? 'comfortable'}
            onChange={handleDensityChange}
            className="text-sm border border-[--border] rounded-lg px-3 py-2 text-[--ink-900] bg-[--surface] focus:outline-none focus:ring-2 focus:ring-[--court-400]"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
      </section>
    </div>
  )
}
