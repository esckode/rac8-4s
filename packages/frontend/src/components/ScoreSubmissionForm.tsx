import React, { useState } from 'react'

export interface Match {
  id: string
  matchType: 'singles' | 'doubles'
  tournamentId: string
  groupId: string
  participants: any[]
  score: string | null
  status: string
}

interface ScoreSubmissionFormProps {
  match: Match
  onSubmit: (score: string) => void
  onError: (error: string) => void
}

export function ScoreSubmissionForm({ match, onSubmit, onError }: ScoreSubmissionFormProps) {
  const [sets1, setSets1] = useState('')
  const [sets2, setSets2] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const isSingles = match.matchType === 'singles'
  const isDoubles = match.matchType === 'doubles'

  const team1Name = isSingles
    ? match.participants[0]?.name
    : match.participants[0]?.teamName

  const team2Name = isSingles
    ? match.participants[1]?.name
    : match.participants[1]?.teamName

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    const s1 = parseInt(sets1, 10)
    const s2 = parseInt(sets2, 10)

    if (isNaN(s1) || isNaN(s2)) {
      onError('Please enter valid numbers')
      return
    }

    if (s1 === 0 && s2 === 0) {
      onError('At least one team must win at least one set')
      return
    }

    const score = `${s1}-${s2}`

    setLoading(true)
    try {
      // Submit to API
      const response = await fetch(
        `/api/tournaments/${match.tournamentId}/matches/${match.id}/score`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score })
        }
      )

      if (response.ok) {
        setSubmitted(true)
        onSubmit(score)
        // Clear form after success
        setTimeout(() => {
          setSets1('')
          setSets2('')
          setSubmitted(false)
        }, 2000)
      } else {
        const error = await response.json()
        onError(error.message || 'Failed to submit score')
      }
    } catch (err) {
      onError('Failed to submit score. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="score-submission-success">
        <p>Score submitted successfully!</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="score-submission-form">
      <div className="form-header">
        {isSingles ? (
          <h3>Submit Score</h3>
        ) : (
          <h3>
            <div>Submit Score</div>
            <div className="teams-info">
              {team1Name} vs {team2Name}
            </div>
          </h3>
        )}
      </div>

      <div className="form-body">
        <div className="score-input">
          <label htmlFor="sets1">
            {isSingles ? 'Your Sets' : `${team1Name} Sets`}
          </label>
          <input
            id="sets1"
            type="number"
            min="0"
            max="3"
            value={sets1}
            onChange={(e) => setSets1(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="vs">vs</div>

        <div className="score-input">
          <label htmlFor="sets2">
            {isSingles ? 'Opponent Sets' : `${team2Name} Sets`}
          </label>
          <input
            id="sets2"
            type="number"
            min="0"
            max="3"
            value={sets2}
            onChange={(e) => setSets2(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      <div className="validation">
        <p className="hint">
          Format: X-Y {isSingles
            ? '(you won X sets, opponent won Y)'
            : `(${team1Name} won X sets, ${team2Name} won Y)`
          }
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-submit"
      >
        {loading ? 'Submitting...' : 'Submit Score'}
      </button>
    </form>
  )
}
