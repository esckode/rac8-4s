import React, { useState } from 'react'
import { submitScore, editScore } from '../api/client'

/**
 * ScoreSubmitForm — a player submits or edits a single match score.
 *
 * Single text field for the real game-score string ('11-9, 11-7'). Calls the API
 * client directly with the stored session token (no auto-retry): submitScore
 * (POST) for a pending match, editScore (PATCH) for a completed one. Backend
 * error codes map to friendly messages; validation/deadline errors keep the form
 * open, and ALREADY_SCORED offers an edit affordance.
 */

interface ScoreSubmitFormMatch {
  id: string
  status: string
  score?: string | null
  type?: 'group' | 'knockout'
}

interface ScoreSubmitFormProps {
  // tournamentId is passed explicitly: the bundle's match objects do not carry it.
  tournamentId: string
  match: ScoreSubmitFormMatch
  onSuccess: () => void
  onClose: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  DEADLINE_PASSED: 'Scoring deadline exceeded — scores can no longer be submitted.',
  SCORE_INVALID:
    "That score isn't valid. Enter games per set (e.g. 11-9, 11-7); sets can't be tied and the match must be completed.",
  VALIDATION_ERROR: 'Please enter a score, e.g. 11-9, 11-7.',
  ALREADY_SCORED: 'This match was already scored. You can edit the existing score instead.',
  FORBIDDEN: "You're not a participant in this match.",
}

function messageFor(code?: string): string {
  return (code && ERROR_MESSAGES[code]) || "Couldn't submit the score. Please try again."
}

export function ScoreSubmitForm({ tournamentId, match, onSuccess, onClose }: ScoreSubmitFormProps) {
  const [score, setScore] = useState(match.score ?? '')
  const [isEdit, setIsEdit] = useState(match.status === 'completed')
  const [error, setError] = useState<string | null>(null)
  const [offerEdit, setOfferEdit] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const matchType = match.type === 'knockout' ? 'knockout' : 'group'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const token = localStorage.getItem('auth_token')
    if (!token) {
      setError('You need to sign in again to submit a score.')
      return
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await editScore(tournamentId, match.id, score, token, matchType)
      } else {
        await submitScore(tournamentId, match.id, score, token, matchType)
      }
      onSuccess()
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      setError(messageFor(code))
      if (code === 'ALREADY_SCORED') {
        setOfferEdit(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      data-testid="score-submit-form"
      onSubmit={handleSubmit}
      className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-4] space-y-[--s-3]"
    >
      <h3 className="text-lg font-semibold text-[--ink-900]">
        {isEdit ? 'Edit Score' : 'Submit Score'}
      </h3>

      <div className="space-y-[--s-1]">
        <label htmlFor="score-input" className="text-sm font-medium text-[--ink-700]">
          Score
        </label>
        <input
          id="score-input"
          data-testid="score-input"
          type="text"
          value={score}
          placeholder="e.g. 11-9, 11-7"
          onChange={(e) => setScore(e.target.value)}
          disabled={submitting}
          className="w-full border border-[--border] rounded-[--r-md] px-[--s-3] py-[--s-2]"
        />
        <p className="text-xs text-[--ink-500]">Games per set, comma-separated. e.g. 11-9, 11-7</p>
      </div>

      {error && (
        <p data-testid="score-error" role="alert" className="text-sm text-[--rose-700]">
          {error}
        </p>
      )}

      {offerEdit && !isEdit && (
        <button
          type="button"
          data-testid="score-edit-instead"
          onClick={() => {
            setIsEdit(true)
            setError(null)
            setOfferEdit(false)
          }}
          className="text-sm text-[--court-700] underline"
        >
          Edit existing score
        </button>
      )}

      <div className="flex gap-[--s-2] justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="px-[--s-3] py-[--s-2] text-sm text-[--ink-600]"
        >
          Cancel
        </button>
        <button
          type="submit"
          data-testid="score-submit"
          disabled={submitting}
          className="px-[--s-4] py-[--s-2] text-sm font-medium bg-[--court-600] text-white rounded-[--r-md] disabled:opacity-60"
        >
          {submitting ? 'Saving…' : isEdit ? 'Save Score' : 'Submit Score'}
        </button>
      </div>
    </form>
  )
}
