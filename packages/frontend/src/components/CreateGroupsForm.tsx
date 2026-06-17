import React, { useState } from 'react'
import { createGroups } from '../api/client'

/**
 * CreateGroupsForm — organizer divides registered participants into groups
 * (the registration_closed → group_stage_active transition).
 *
 * numGroups + advancingPerGroup; for doubles, a pairUnpaired toggle (default on)
 * controls whether leftover solo registrants are auto-paired or dropped. Calls
 * createGroups with the stored organizer token; backend codes map to messages.
 */

interface CreateGroupsFormProps {
  tournamentId: string
  isDoubles: boolean
  onCreated: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_STATE: 'Groups can only be created once registration is closed.',
  VALIDATION_ERROR:
    'Check the values — need at least 1 group, 1 advancing, and enough registered players.',
}

function messageFor(code?: string): string {
  return (code && ERROR_MESSAGES[code]) || "Couldn't create groups. Please try again."
}

export function CreateGroupsForm({ tournamentId, isDoubles, onCreated }: CreateGroupsFormProps) {
  const [numGroups, setNumGroups] = useState('1')
  const [advancing, setAdvancing] = useState('1')
  const [pairUnpaired, setPairUnpaired] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setError('You need to sign in again.')
      return
    }
    setSubmitting(true)
    try {
      const body = {
        numGroups: parseInt(numGroups, 10),
        advancingPerGroup: parseInt(advancing, 10),
        ...(isDoubles ? { pairUnpaired } : {}),
      }
      await createGroups(tournamentId, body, token)
      onCreated()
    } catch (err) {
      setError(messageFor((err as { code?: string } | null)?.code))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      data-testid="create-groups-form"
      onSubmit={handleSubmit}
      className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-4] space-y-[--s-3]"
    >
      <h3 className="text-lg font-semibold text-[--ink-900]">Create groups</h3>

      <div className="flex gap-[--s-4]">
        <label className="flex-1 space-y-[--s-1]">
          <span className="text-sm font-medium text-[--ink-700]">Number of groups</span>
          <input
            data-testid="num-groups-input"
            type="number"
            min="1"
            value={numGroups}
            onChange={(e) => setNumGroups(e.target.value)}
            disabled={submitting}
            className="w-full border border-[--border] rounded-[--r-md] px-[--s-3] py-[--s-2]"
          />
        </label>
        <label className="flex-1 space-y-[--s-1]">
          <span className="text-sm font-medium text-[--ink-700]">Advancing per group</span>
          <input
            data-testid="advancing-input"
            type="number"
            min="1"
            value={advancing}
            onChange={(e) => setAdvancing(e.target.value)}
            disabled={submitting}
            className="w-full border border-[--border] rounded-[--r-md] px-[--s-3] py-[--s-2]"
          />
        </label>
      </div>

      {isDoubles && (
        <label className="flex items-center gap-[--s-2]">
          <input
            data-testid="pair-unpaired-toggle"
            type="checkbox"
            checked={pairUnpaired}
            onChange={(e) => setPairUnpaired(e.target.checked)}
            disabled={submitting}
          />
          <span className="text-sm text-[--ink-700]">
            Auto-pair leftover solo registrants (uncheck to drop them)
          </span>
        </label>
      )}

      {error && (
        <p data-testid="groups-error" role="alert" className="text-sm text-[--rose-700]">
          {error}
        </p>
      )}

      <button
        type="submit"
        data-testid="create-groups-submit"
        disabled={submitting}
        className="px-[--s-4] py-[--s-2] text-sm font-medium bg-[--court-600] text-white rounded-[--r-md] disabled:opacity-60"
      >
        {submitting ? 'Creating…' : 'Create groups'}
      </button>
    </form>
  )
}
