/* eslint-disable no-restricted-syntax -- TODO(token-debt): raw color literals, retrofit to tokens in Phase E5 */
import { useState } from 'react'

export interface AgeAttestation {
  /** ISO 8601 date string (YYYY-MM-DD). Transient — not stored beyond this screen. */
  dateOfBirth: string
  policyVersion: string
}

interface DobScreenProps {
  onConfirm: (attestation: AgeAttestation) => void
  onBack: () => void
}

const POLICY_VERSION = 'v1'

/** Returns true if the given YYYY-MM-DD date of birth is at least 18 years ago. */
function isAtLeast18(dateOfBirth: string): boolean {
  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return false
  const today = new Date()
  const eighteenth = new Date(dob)
  eighteenth.setFullYear(eighteenth.getFullYear() + 18)
  return eighteenth <= today
}

/**
 * DobScreen — neutral date-of-birth entry for the 18+ age gate.
 *
 * Design rules:
 *   - Shows a date <input type="date">, NOT an "I am 18" checkbox.
 *   - Under-18 DOB: blocked with a clear error message, onConfirm NOT called.
 *   - 18+ DOB: calls onConfirm({ dateOfBirth, policyVersion }) and clears the field.
 *   - The raw dateOfBirth is passed to the caller for submission to the API; it is
 *     NEVER cached in localStorage or state beyond this form.
 */
export function DobScreen({ onConfirm, onBack }: DobScreenProps) {
  const [dob, setDob] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!dob) {
      setError('Please enter your date of birth')
      return
    }

    if (!isAtLeast18(dob)) {
      setError('You must be 18 or older to use this app')
      return
    }

    setError(null)
    onConfirm({ dateOfBirth: dob, policyVersion: POLICY_VERSION })
  }

  return (
    <div
      style={{
        width: 390,
        minHeight: 400,
        background: 'linear-gradient(180deg, #1F2D4E 0%, #0F1B2E 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 16px',
        margin: '0 auto',
      }}
    >
      {/* Back button */}
      <button
        data-testid="dob-back"
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          marginLeft: '-8px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          color: '#FFFFFF',
        }}
        aria-label="Go back"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Heading */}
      <h1
        data-testid="dob-heading"
        style={{ fontSize: '24px', fontWeight: '700', color: '#FFFFFF', marginBottom: '8px' }}
      >
        Date of birth
      </h1>

      {/* 18+ requirement notice */}
      <p
        data-testid="dob-age-notice"
        style={{ fontSize: '14px', color: '#B0B8C8', marginBottom: '24px' }}
      >
        You must be 18 or older to use this app. By continuing, you confirm you
        meet the age requirement and accept our{' '}
        <span style={{ color: '#6366F1' }}>Terms of Service</span> and{' '}
        <span style={{ color: '#6366F1' }}>Privacy Policy</span>.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '24px' }}>
          <label
            htmlFor="dob"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#B0B8C8',
              marginBottom: '8px',
              textTransform: 'uppercase',
            }}
          >
            Date of birth
          </label>
          <input
            id="dob"
            data-testid="dob-input"
            type="date"
            value={dob}
            onChange={e => {
              setDob(e.target.value)
              setError(null)
            }}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: `1px solid ${error ? '#FF4444' : '#2A3B5D'}`,
              borderRadius: '8px',
              background: '#1A2A42',
              color: '#FFFFFF',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <span
              data-testid="dob-error"
              role="alert"
              style={{ fontSize: '12px', color: '#FF4444', marginTop: '4px', display: 'block' }}
            >
              {error}
            </span>
          )}
        </div>

        <button
          data-testid="dob-submit"
          type="submit"
          style={{
            width: '100%',
            padding: '12px',
            background: '#6366F1',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Continue
        </button>
      </form>
    </div>
  )
}
