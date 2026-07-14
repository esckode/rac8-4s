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
  notifyMentions: boolean
  notifyPolls: boolean
  notifyNudges: boolean
  quietHoursStart: number | null
  quietHoursEnd: number | null
}

type NotifyToggleField = 'notifyMentions' | 'notifyPolls' | 'notifyNudges'

type DayPart = 'morning' | 'afternoon' | 'evening'
interface AvailabilitySlot {
  weekday: number
  dayPart: DayPart
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_PARTS: DayPart[] = ['morning', 'afternoon', 'evening']
const RECONFIRM_AFTER_DAYS = 60

function slotKey(weekday: number, dayPart: DayPart): string {
  return `${weekday}-${dayPart}`
}

export const Profile: React.FC = () => {
  const [settings, setSettings] = useState<ProfileSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([])
  const [availabilityUpdatedAt, setAvailabilityUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

    fetch('/api/auth/me', { headers })
      .then(res => res.json())
      .then(data => setSettings(data.settings))
      .finally(() => setLoading(false))

    fetch('/api/auth/me/availability', { headers })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { slots: AvailabilitySlot[]; updatedAt: string | null } | null) => {
        if (!data) return
        setAvailabilitySlots(data.slots)
        setAvailabilityUpdatedAt(data.updatedAt)
      })
      .catch(() => {})
  }, [])

  async function patchSettings(body: Record<string, unknown>) {
    const token = localStorage.getItem('auth_token')
    await fetch('/api/auth/me/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  }

  async function handleDensityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const tableDensity = e.target.value as 'comfortable' | 'compact'
    setSettings(prev => (prev ? { ...prev, tableDensity } : prev))
    await patchSettings({ tableDensity })
  }

  async function handleNotifyToggle(field: NotifyToggleField, checked: boolean) {
    setSettings(prev => (prev ? { ...prev, [field]: checked } : prev))
    await patchSettings({ [field]: checked })
  }

  async function handleQuietHoursChange(field: 'quietHoursStart' | 'quietHoursEnd', raw: string) {
    const value = raw === '' ? null : Number(raw)
    setSettings(prev => (prev ? { ...prev, [field]: value } : prev))
    await patchSettings({ [field]: value })
  }

  async function handleAvailabilityToggle(weekday: number, dayPart: DayPart, checked: boolean) {
    const next = checked
      ? [...availabilitySlots, { weekday, dayPart }]
      : availabilitySlots.filter(s => !(s.weekday === weekday && s.dayPart === dayPart))
    setAvailabilitySlots(next)

    const token = localStorage.getItem('auth_token')
    await fetch('/api/auth/me/availability', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ slots: next }),
    })
    setAvailabilityUpdatedAt(new Date().toISOString())
  }

  const isAvailable = (weekday: number, dayPart: DayPart) =>
    availabilitySlots.some(s => s.weekday === weekday && s.dayPart === dayPart)

  const daysSinceAvailabilityUpdate = availabilityUpdatedAt
    ? (Date.now() - new Date(availabilityUpdatedAt).getTime()) / (24 * 3_600_000)
    : null
  const needsReconfirm = daysSinceAvailabilityUpdate !== null && daysSinceAvailabilityUpdate > RECONFIRM_AFTER_DAYS

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

      <section className="rounded-xl border border-[--border] p-4 bg-[--surface] space-y-3">
        <h2 className="text-base font-semibold text-[--ink-800]">Notifications</h2>

        <label className="flex items-center gap-3 text-sm text-[--ink-700]">
          <input
            type="checkbox"
            data-testid="notify-mentions-toggle"
            checked={settings?.notifyMentions ?? true}
            onChange={e => handleNotifyToggle('notifyMentions', e.target.checked)}
          />
          Notify me when I'm @mentioned
        </label>

        <label className="flex items-center gap-3 text-sm text-[--ink-700]">
          <input
            type="checkbox"
            data-testid="notify-polls-toggle"
            checked={settings?.notifyPolls ?? true}
            onChange={e => handleNotifyToggle('notifyPolls', e.target.checked)}
          />
          Notify me about new polls
        </label>

        <label className="flex items-center gap-3 text-sm text-[--ink-700]">
          <input
            type="checkbox"
            data-testid="notify-nudges-toggle"
            checked={settings?.notifyNudges ?? true}
            onChange={e => handleNotifyToggle('notifyNudges', e.target.checked)}
          />
          Notify me about deadline reminders
        </label>

        <div className="flex items-center gap-3 pt-2">
          <span className="text-sm text-[--ink-700]">Quiet hours</span>
          <label htmlFor="quiet-hours-start" className="sr-only">Quiet hours start</label>
          <input
            id="quiet-hours-start"
            data-testid="quiet-hours-start"
            type="number"
            min={0}
            max={23}
            value={settings?.quietHoursStart ?? ''}
            onChange={e => handleQuietHoursChange('quietHoursStart', e.target.value)}
            className="w-16 text-sm border border-[--border] rounded-lg px-2 py-1 text-[--ink-900] bg-[--surface]"
          />
          <span className="text-sm text-[--ink-500]">to</span>
          <label htmlFor="quiet-hours-end" className="sr-only">Quiet hours end</label>
          <input
            id="quiet-hours-end"
            data-testid="quiet-hours-end"
            type="number"
            min={0}
            max={23}
            value={settings?.quietHoursEnd ?? ''}
            onChange={e => handleQuietHoursChange('quietHoursEnd', e.target.value)}
            className="w-16 text-sm border border-[--border] rounded-lg px-2 py-1 text-[--ink-900] bg-[--surface]"
          />
        </div>
      </section>

      <section className="rounded-xl border border-[--border] p-4 bg-[--surface] space-y-3">
        <h2 className="text-base font-semibold text-[--ink-800]">Availability</h2>
        <p className="text-xs text-[--ink-500]">
          Used only to suggest times where most of a group is free — never shown per-person.
        </p>

        <table className="text-sm w-full">
          <thead>
            <tr>
              <th />
              {WEEKDAYS.map(day => (
                <th key={day} className="text-center font-medium text-[--ink-700] px-1">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_PARTS.map(dayPart => (
              <tr key={dayPart}>
                <td className="text-[--ink-700] capitalize pr-2">{dayPart}</td>
                {WEEKDAYS.map((_, weekday) => (
                  <td key={slotKey(weekday, dayPart)} className="text-center">
                    <input
                      type="checkbox"
                      data-testid={`avail-${weekday}-${dayPart}`}
                      checked={isAvailable(weekday, dayPart)}
                      onChange={e => handleAvailabilityToggle(weekday, dayPart, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {availabilityUpdatedAt && (
          <p data-testid="availability-last-updated" className="text-xs text-[--ink-500]">
            Last updated {new Date(availabilityUpdatedAt).toLocaleDateString()}
          </p>
        )}
        {needsReconfirm && (
          <p data-testid="availability-reconfirm-prompt" className="text-xs text-[--gold-700] font-medium">
            It's been a while — please confirm your availability is still accurate.
          </p>
        )}
      </section>
    </div>
  )
}
