/**
 * NotifyLevelControl — B-NOTIFYLVL (P1.5)
 *
 * Radio group for selecting a member's notification level within a group.
 * Calls PATCH /player/groups/:groupId/members/:playerId/notify-level on change.
 */

import React, { useState } from 'react'

export type NotifyLevel = 'all' | 'mentions_polls' | 'muted'

const OPTIONS: { value: NotifyLevel; label: string; description: string }[] = [
  { value: 'all', label: 'All messages', description: 'Notify me for every message' },
  { value: 'mentions_polls', label: 'Mentions & polls', description: 'Notify me only when mentioned or a poll is posted' },
  { value: 'muted', label: 'Muted', description: 'No notifications' },
]

interface NotifyLevelControlProps {
  groupId: string
  playerId: string
  currentLevel: NotifyLevel
}

export const NotifyLevelControl: React.FC<NotifyLevelControlProps> = ({
  groupId,
  playerId,
  currentLevel,
}) => {
  const [selected, setSelected] = useState<NotifyLevel>(currentLevel)
  const [saving, setSaving] = useState(false)

  async function handleChange(level: NotifyLevel) {
    if (level === selected || saving) return
    setSelected(level)
    setSaving(true)
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/player/groups/${groupId}/members/${playerId}/notify-level`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ notifyLevel: level }),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <fieldset data-testid="notify-level-control" className="mt-3">
      <legend className="text-sm font-medium text-[--ink-700]">Notifications</legend>
      <div className="mt-2 space-y-2">
        {OPTIONS.map(opt => (
          <label
            key={opt.value}
            data-testid={`notify-level-option-${opt.value === 'mentions_polls' ? 'mentions-polls' : opt.value}`}
            className="flex items-start gap-3 cursor-pointer"
          >
            <input
              type="radio"
              name={`notify-level-${groupId}`}
              value={opt.value}
              checked={selected === opt.value}
              onChange={() => handleChange(opt.value)}
              disabled={saving}
              className="mt-0.5 accent-[--court-600]"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-[--ink-800]">{opt.label}</span>
              <span className="text-xs text-[--ink-500]">{opt.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
