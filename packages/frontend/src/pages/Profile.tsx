/**
 * Profile — /profile
 *
 * Player Personalization P0: the app's first player-settings surface,
 * opened from the header avatar/gear (not a bottom tab — settings aren't a
 * daily, badged surface). Reads/writes GET|PATCH /api/auth/me(/settings).
 */
import React, { useEffect, useState } from 'react'
import { Modal } from '../components/shared/Modal'

interface ProfileSettings {
  timezone: string | null
  timezoneManual: boolean
  tableDensity: 'comfortable' | 'compact'
  notifyMentions: boolean
  notifyPolls: boolean
  notifyNudges: boolean
  quietHoursEnabled: boolean
  quietHoursStart: number | null
  quietHoursEnd: number | null
  coachMemoryEnabled: boolean
}

interface CoachMemory {
  id: string
  body: string
  source: 'player' | 'coach'
  createdAt: string
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

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am'
  if (hour < 12) return `${hour}am`
  if (hour === 12) return '12pm'
  return `${hour - 12}pm`
}

function generateHourOptions(): { value: number; label: string }[] {
  const options = []
  for (let i = 0; i < 24; i++) {
    options.push({ value: i, label: formatHourLabel(i) })
  }
  return options
}

export const Profile: React.FC = () => {
  const [settings, setSettings] = useState<ProfileSettings | null>(null)
  const [loading, setLoading] = useState(true)
  // ISSUE-64: a magic-link guest session gets 401 from every /api/auth/me*
  // endpoint (they're all account-gated). Profile is account-only — show an
  // honest state instead of fake defaults the guest can't actually save.
  const [unauthorized, setUnauthorized] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // ISSUE-58: Account section — email (read-only), editable display name,
  // change-password (reuses the existing emailed-code flow).
  const [accountEmail, setAccountEmail] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [passwordResetSending, setPasswordResetSending] = useState(false)
  const [passwordResetSent, setPasswordResetSent] = useState(false)
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([])
  const [availabilityUpdatedAt, setAvailabilityUpdatedAt] = useState<string | null>(null)
  const [memories, setMemories] = useState<CoachMemory[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

    // Availability and coach memories are only meaningful for an account
    // holder — wait for /api/auth/me to confirm one before fetching either,
    // so a guest (401) session doesn't fire requests it can't use.
    fetch('/api/auth/me', { headers })
      .then(res => {
        if (res.status === 401) {
          setUnauthorized(true)
          return null
        }
        return res.ok ? res.json() : null
      })
      .then(data => {
        if (!data) return
        setSettings(data.settings)
        setAccountEmail(data.email)
        setNameInput(data.name ?? '')

        fetch('/api/auth/me/availability', { headers })
          .then(res => (res.ok ? res.json() : null))
          .then((avData: { slots: AvailabilitySlot[]; updatedAt: string | null } | null) => {
            if (!avData) return
            setAvailabilitySlots(avData.slots)
            setAvailabilityUpdatedAt(avData.updatedAt)
          })
          .catch(() => {})

        fetch('/player/coach/memories', { headers })
          .then(res => (res.ok ? res.json() : null))
          .then((memData: { memories: CoachMemory[] } | null) => {
            if (memData?.memories) setMemories(memData.memories)
          })
          .catch(() => {})
      })
      .finally(() => setLoading(false))
  }, [])

  async function patchSettings(body: Record<string, unknown>) {
    const token = localStorage.getItem('auth_token')
    const res = await fetch('/api/auth/me/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    setSaveError(res.ok ? null : 'Could not save your changes. Please try again.')
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed || nameSaving) return
    setNameSaving(true)
    setNameError(null)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/player/name', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string }
        setNameError(body.message ?? 'Could not save your name')
        return
      }
      const data = await res.json()
      setNameInput(data.name)
    } finally {
      setNameSaving(false)
    }
  }

  async function handleChangePassword() {
    if (passwordResetSending) return
    setPasswordResetSending(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: accountEmail }),
      })
      setPasswordResetSent(true)
    } finally {
      setPasswordResetSending(false)
    }
  }

  async function handleDensityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const tableDensity = e.target.value as 'comfortable' | 'compact'
    setSettings(prev => (prev ? { ...prev, tableDensity } : prev))
    await patchSettings({ tableDensity })
  }

  async function handleTimezoneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const timezone = e.target.value || null
    setSettings(prev => (prev ? { ...prev, timezone, timezoneManual: !!timezone } : prev))
    await patchSettings({ timezone, timezoneManual: !!timezone })
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

  async function handleQuietHoursToggle(checked: boolean) {
    setSettings(prev => (prev ? { ...prev, quietHoursEnabled: checked } : prev))
    await patchSettings({ quietHoursEnabled: checked })
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

  async function handleCoachMemoryToggle(checked: boolean) {
    setSettings(prev => (prev ? { ...prev, coachMemoryEnabled: checked } : prev))
    await patchSettings({ coachMemoryEnabled: checked })
  }

  async function handleDeleteMemory(id: string) {
    const previous = memories
    setMemories(previous.filter(m => m.id !== id))
    const token = localStorage.getItem('auth_token')
    const res = await fetch(`/player/coach/memories/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) setMemories(previous) // revert on failure
  }

  async function handleClearConversation() {
    if (clearing) return
    setClearing(true)
    try {
      const token = localStorage.getItem('auth_token')
      await fetch('/player/coach/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })
      setShowClearConfirm(false)
    } finally {
      setClearing(false)
    }
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

  if (unauthorized) {
    return (
      <div data-testid="profile-page" className="p-4 space-y-4">
        <h1 className="text-2xl font-bold text-(--ink-900)">Profile</h1>
        <p data-testid="profile-signup-prompt" className="text-sm text-(--ink-700)">
          Sign up for an account to save your preferences.
        </p>
        <a
          href="/signup"
          className="inline-block text-sm font-medium text-(--court-600) hover:text-(--court-800)"
        >
          Sign up
        </a>
      </div>
    )
  }

  return (
    <div data-testid="profile-page" className="p-4 space-y-6">
      <h1 className="text-2xl font-bold text-(--ink-900)">Profile</h1>

      {saveError && (
        <p data-testid="profile-save-error" role="alert" className="text-sm text-(--rose-700)">
          {saveError}
        </p>
      )}

      <section className="rounded-xl border border-(--border) p-4 bg-(--surface) space-y-3">
        <h2 className="text-base font-semibold text-(--ink-800)">Account</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-(--ink-700)">Email</span>
          <span data-testid="account-email" className="text-sm text-(--ink-900)">{accountEmail}</span>
        </div>
        <form onSubmit={handleNameSubmit} className="flex gap-2 items-center">
          <label htmlFor="display-name-input" className="sr-only">Display name</label>
          <input
            id="display-name-input"
            data-testid="display-name-input"
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            className="flex-1 text-sm border border-(--border) rounded-lg px-3 py-2 text-(--ink-900) bg-(--surface) focus:outline-none focus:ring-2 focus:ring-(--court-400)"
          />
          <button
            data-testid="display-name-save"
            type="submit"
            disabled={nameSaving || !nameInput.trim()}
            className="text-sm font-medium text-(--court-600) hover:text-(--court-800) px-3 py-2 rounded-lg hover:bg-(--court-50) transition-colors disabled:opacity-50"
          >
            {nameSaving ? 'Saving…' : 'Save'}
          </button>
        </form>
        {nameError && (
          <p data-testid="display-name-error" role="alert" className="text-xs text-(--rose-700)">
            {nameError}
          </p>
        )}
        <div className="pt-2 border-t border-(--border)">
          <button
            data-testid="change-password-button"
            onClick={handleChangePassword}
            disabled={passwordResetSending}
            className="text-sm font-medium text-(--court-600) hover:text-(--court-800) disabled:opacity-50"
          >
            {passwordResetSending ? 'Sending…' : 'Change password'}
          </button>
          {passwordResetSent && (
            <p data-testid="password-reset-confirmation" className="mt-2 text-xs text-(--ink-500)">
              Check your email for a reset code
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-(--border) p-4 bg-(--surface) space-y-3">
        <h2 className="text-base font-semibold text-(--ink-800)">Display</h2>
        <div className="flex items-center gap-3">
          <label htmlFor="density-select" className="text-sm text-(--ink-700)">
            Table density
          </label>
          <select
            id="density-select"
            data-testid="density-select"
            value={settings?.tableDensity ?? 'comfortable'}
            onChange={handleDensityChange}
            className="text-sm border border-(--border) rounded-lg px-3 py-2 text-(--ink-900) bg-(--surface) focus:outline-none focus:ring-2 focus:ring-(--court-400)"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="timezone-select" className="text-sm text-(--ink-700)">
            Timezone
          </label>
          <select
            id="timezone-select"
            data-testid="timezone-select"
            value={settings?.timezone ?? ''}
            onChange={handleTimezoneChange}
            className="text-sm border border-(--border) rounded-lg px-3 py-2 text-(--ink-900) bg-(--surface) focus:outline-none focus:ring-2 focus:ring-(--court-400)"
          >
            <option value="">Auto-detect</option>
            <option value="America/New_York">Eastern (ET)</option>
            <option value="America/Chicago">Central (CT)</option>
            <option value="America/Denver">Mountain (MT)</option>
            <option value="America/Los_Angeles">Pacific (PT)</option>
            <option value="America/Anchorage">Alaska (AKT)</option>
            <option value="Pacific/Honolulu">Hawaii (HST)</option>
            <option value="Europe/London">London (GMT/BST)</option>
            <option value="Europe/Paris">Central European (CET/CEST)</option>
            <option value="Europe/Moscow">Moscow (MSK)</option>
            <option value="Asia/Dubai">Dubai (GST)</option>
            <option value="Asia/Kolkata">India (IST)</option>
            <option value="Asia/Bangkok">Bangkok (ICT)</option>
            <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
            <option value="Asia/Tokyo">Tokyo (JST)</option>
            <option value="Asia/Seoul">Seoul (KST)</option>
            <option value="Australia/Sydney">Sydney (AEDT/AEST)</option>
            <option value="Pacific/Auckland">Auckland (NZDT/NZST)</option>
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-(--border) p-4 bg-(--surface) space-y-3">
        <h2 className="text-base font-semibold text-(--ink-800)">Notifications</h2>

        <label className="flex items-center gap-3 text-sm text-(--ink-700)">
          <input
            type="checkbox"
            data-testid="notify-mentions-toggle"
            checked={settings?.notifyMentions ?? true}
            onChange={e => handleNotifyToggle('notifyMentions', e.target.checked)}
          />
          Notify me when I'm @mentioned
        </label>

        <label className="flex items-center gap-3 text-sm text-(--ink-700)">
          <input
            type="checkbox"
            data-testid="notify-polls-toggle"
            checked={settings?.notifyPolls ?? true}
            onChange={e => handleNotifyToggle('notifyPolls', e.target.checked)}
          />
          Notify me about new polls
        </label>

        <label className="flex items-center gap-3 text-sm text-(--ink-700)">
          <input
            type="checkbox"
            data-testid="notify-nudges-toggle"
            checked={settings?.notifyNudges ?? true}
            onChange={e => handleNotifyToggle('notifyNudges', e.target.checked)}
          />
          Notify me about deadline reminders
        </label>

        <label className="flex items-center gap-2 text-sm text-(--ink-700) pt-2">
          <input
            type="checkbox"
            data-testid="quiet-hours-enabled"
            checked={settings?.quietHoursEnabled ?? false}
            onChange={e => handleQuietHoursToggle(e.target.checked)}
          />
          Quiet hours
        </label>
        <p className="text-xs text-(--ink-500)">
          Applies to phone notifications once those are available — email updates are unaffected.
        </p>

        <div className="flex items-center gap-3">
          <label htmlFor="quiet-hours-start" className="sr-only">Quiet hours start</label>
          <select
            id="quiet-hours-start"
            data-testid="quiet-hours-start"
            disabled={!settings?.quietHoursEnabled}
            value={settings?.quietHoursStart ?? 8}
            onChange={e => handleQuietHoursChange('quietHoursStart', e.target.value)}
            className="text-sm border border-(--border) rounded-lg px-2 py-1 text-(--ink-900) bg-(--surface) focus:outline-none focus:ring-2 focus:ring-(--court-400)"
          >
            {generateHourOptions().map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-(--ink-500)">to</span>
          <label htmlFor="quiet-hours-end" className="sr-only">Quiet hours end</label>
          <select
            id="quiet-hours-end"
            data-testid="quiet-hours-end"
            disabled={!settings?.quietHoursEnabled}
            value={settings?.quietHoursEnd ?? 17}
            onChange={e => handleQuietHoursChange('quietHoursEnd', e.target.value)}
            className="text-sm border border-(--border) rounded-lg px-2 py-1 text-(--ink-900) bg-(--surface) focus:outline-none focus:ring-2 focus:ring-(--court-400)"
          >
            {generateHourOptions().map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-(--border) p-4 bg-(--surface) space-y-3">
        <h2 className="text-base font-semibold text-(--ink-800)">Availability</h2>
        <p className="text-xs text-(--ink-500)">
          Used only to suggest times where most of a group is free — never shown per-person.
        </p>

        <table className="text-sm w-full">
          <thead>
            <tr>
              <th />
              {WEEKDAYS.map(day => (
                <th key={day} className="text-center font-medium text-(--ink-700) px-1">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_PARTS.map(dayPart => (
              <tr key={dayPart}>
                <td className="text-(--ink-700) capitalize pr-2">{dayPart}</td>
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
          <p data-testid="availability-last-updated" className="text-xs text-(--ink-500)">
            Last updated {new Date(availabilityUpdatedAt).toLocaleDateString()}
          </p>
        )}
        {needsReconfirm && (
          <p data-testid="availability-reconfirm-prompt" className="text-xs text-(--gold-700) font-medium">
            It's been a while — please confirm your availability is still accurate.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-(--border) p-4 bg-(--surface) space-y-3">
        <h2 className="text-base font-semibold text-(--ink-800)">Coach</h2>

        <label className="flex items-center gap-3 text-sm text-(--ink-700)">
          <input
            type="checkbox"
            data-testid="coach-memory-toggle"
            checked={settings?.coachMemoryEnabled ?? true}
            onChange={e => handleCoachMemoryToggle(e.target.checked)}
          />
          Let Coach remember things I tell it
        </label>

        {memories.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-semibold text-(--ink-700) uppercase tracking-wide">What Coach remembers</h3>
            {memories.map(m => (
              <div
                key={m.id}
                data-testid="memory-row"
                className="flex items-center justify-between gap-2 py-1"
              >
                <div>
                  <p className="text-sm text-(--ink-900)">{m.body}</p>
                  <p className="text-xs text-(--ink-500)">{new Date(m.createdAt).toLocaleDateString()}</p>
                </div>
                <button
                  data-testid="memory-delete"
                  onClick={() => handleDeleteMemory(m.id)}
                  aria-label={`Delete memory: ${m.body}`}
                  className="text-xs font-medium text-(--rose-700) hover:text-(--rose-900) px-2 py-1 rounded hover:bg-(--rose-50) transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-(--border)">
          <button
            data-testid="coach-clear"
            onClick={() => setShowClearConfirm(true)}
            className="text-sm font-medium text-(--rose-700) hover:text-(--rose-900)"
          >
            Clear conversation
          </button>
        </div>
      </section>

      <Modal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear conversation?"
        actions={[
          { label: 'Cancel', onClick: () => setShowClearConfirm(false), variant: 'secondary' },
          {
            label: clearing ? 'Clearing…' : 'Clear',
            onClick: handleClearConversation,
            variant: 'primary',
            testId: 'coach-clear-confirm',
          },
        ]}
      >
        <p className="text-sm text-(--ink-700)">
          This deletes your Coach conversation history. What Coach remembers about you is not affected.
        </p>
      </Modal>

      <footer className="text-center pt-2">
        <a href="/privacy" className="text-xs text-(--ink-500) hover:text-(--ink-700) underline">
          Privacy Policy
        </a>
      </footer>
    </div>
  )
}
