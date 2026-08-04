/**
 * RatingSeedPrompt — ISSUE-60
 *
 * PUT /player/ratings/seed exists (P13 Phase 5) but was unreachable from
 * the UI. This reusable prompt checks GET /player/ratings for an existing
 * bucket in the given sport; if none exists, it asks "How would you rate
 * yourself at {sport}?" using that same response's min/max/seedDefault
 * scale, submits the seed on confirm, and is skippable. A 409
 * RATING_ALREADY_SCORED (the player already has a scored match in this
 * sport — a race between the initial check and submit) is suppressed
 * silently, same as skip: it is a normal state, not an error.
 *
 * Never blocks the caller: onDone fires on every terminal path (submit,
 * skip, or silently — no token, fetch failure, or an existing rating) so a
 * caller that defers follow-up work (e.g. navigation after a casual
 * tournament launch) until onDone is safe even when no UI is ever shown.
 */
import React, { useEffect, useState } from 'react'
import { Modal } from './shared/Modal'

interface RatingsResponse {
  ratings: Array<{ sport: string; format: string; rating: number; matchesPlayed: number; provisional: boolean }>
  min: number
  max: number
  seedDefault: number
}

export const RatingSeedPrompt: React.FC<{ sport: string; onDone: () => void }> = ({ sport, onDone }) => {
  const [scale, setScale] = useState<{ min: number; max: number; seedDefault: number } | null>(null)
  const [rating, setRating] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      onDone()
      return
    }
    fetch('/player/ratings', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : null))
      .then((data: RatingsResponse | null) => {
        if (!data) {
          onDone()
          return
        }
        const alreadyRated = data.ratings.some(r => r.sport === sport)
        if (alreadyRated) {
          onDone()
          return
        }
        setScale({ min: data.min, max: data.max, seedDefault: data.seedDefault })
        setRating(data.seedDefault)
      })
      .catch(() => onDone())
  }, [sport])

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const token = localStorage.getItem('auth_token')
      // A 409 here (RATING_ALREADY_SCORED) means the player already has a
      // scored match in this sport — a race with the initial check above.
      // That is a normal state, not an error: suppress it the same as skip.
      await fetch('/player/ratings/seed', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sport, rating }),
      })
    } finally {
      setSubmitting(false)
      setScale(null)
      onDone()
    }
  }

  function handleSkip() {
    setScale(null)
    onDone()
  }

  if (!scale) return null

  return (
    <Modal
      isOpen
      onClose={handleSkip}
      title={`How would you rate yourself at ${sport}?`}
      actions={[
        { label: 'Skip', onClick: handleSkip, variant: 'secondary', testId: 'rating-seed-skip' },
        {
          label: submitting ? 'Saving…' : 'Submit',
          onClick: handleSubmit,
          variant: 'primary',
          testId: 'rating-seed-submit',
        },
      ]}
    >
      <p className="text-sm text-(--ink-700) mb-3">
        This just gives matchmaking a starting point — you can skip it and your rating will
        adjust automatically as you play.
      </p>
      <label htmlFor="rating-seed-input" className="sr-only">Self-rating</label>
      <input
        id="rating-seed-input"
        data-testid="rating-seed-input"
        type="range"
        min={scale.min}
        max={scale.max}
        value={rating}
        onChange={e => setRating(Number(e.target.value))}
        className="w-full"
      />
      <p className="text-center text-sm font-semibold text-(--ink-900)">{rating}</p>
    </Modal>
  )
}
