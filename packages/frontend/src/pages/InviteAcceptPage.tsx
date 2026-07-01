import React, { useEffect, useCallback, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { DobScreen, type AgeAttestation } from './DobScreen'
import '../styles/globals.css'

type Phase =
  | 'loading'
  | 'age_required'
  | 'underage'
  | 'token_invalid'
  | 'not_found'
  | 'success'

const TOKEN_KEY = 'auth_token'

/**
 * InviteAcceptPage — public landing page for group invite links.
 *
 * Route: /groups/:groupId/invite?token=T&email=E
 *
 * Auto-submits POST /player/groups/:groupId/invites/accept on mount and
 * drives a 5-state machine:
 *   loading         → spinner while the request is in flight
 *   age_required    → DobScreen for 18+ attestation; re-submits on confirm
 *   underage        → terminal rejection (non-recoverable)
 *   token_invalid   → invalid or expired invite link error
 *   not_found       → group not found error
 *   success         → "You've joined the group!" + redirect to /groups/:groupId
 */
export const InviteAcceptPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''

  const [phase, setPhase] = useState<Phase>('loading')

  const submitAccept = useCallback(
    async (ageAttestation?: AgeAttestation) => {
      setPhase('loading')
      try {
        const body: Record<string, unknown> = { token, email }
        if (ageAttestation) body.ageAttestation = ageAttestation

        const res = await fetch(`/player/groups/${groupId}/invites/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        const data = (await res.json()) as {
          ok?: boolean
          token?: string
          groupId?: string
          code?: string
        }

        if (res.ok) {
          if (data.token) localStorage.setItem(TOKEN_KEY, data.token)
          setPhase('success')
          window.location.replace(`/groups/${groupId}`)
        } else {
          const code = data.code ?? ''
          if (code === 'AGE_ATTESTATION_REQUIRED') setPhase('age_required')
          else if (code === 'UNDERAGE') setPhase('underage')
          else if (code === 'NOT_FOUND') setPhase('not_found')
          else setPhase('token_invalid')
        }
      } catch {
        setPhase('token_invalid')
      }
    },
    [token, email, groupId]
  )

  useEffect(() => {
    submitAccept()
  }, [submitAccept])

  const handleDobConfirm = (attestation: AgeAttestation) => {
    submitAccept(attestation)
  }

  const handleDobBack = () => {
    setPhase('token_invalid')
  }

  return (
    <div
      data-testid="invite-accept-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--surface-page)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'white',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '32px 24px',
        }}
      >
        {phase === 'loading' && <LoadingState />}

        {phase === 'age_required' && (
          <div data-testid="invite-age-gate" aria-label="Age verification required">
            <DobScreen onConfirm={handleDobConfirm} onBack={handleDobBack} />
          </div>
        )}

        {phase === 'success' && <SuccessState />}
        {phase === 'underage' && <UnderageState />}
        {phase === 'token_invalid' && <TokenInvalidState />}
        {phase === 'not_found' && <NotFoundState />}
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div
      role="status"
      aria-label="Joining group…"
      style={{ textAlign: 'center', padding: '24px 0' }}
    >
      <p style={{ fontSize: '16px', color: 'var(--ink-600)' }}>Joining group…</p>
    </div>
  )
}

function SuccessState() {
  return (
    <div
      data-testid="invite-success"
      role="status"
      aria-live="polite"
      style={{ textAlign: 'center', padding: '24px 0' }}
    >
      <p
        style={{
          fontSize: '20px',
          fontWeight: '700',
          color: 'var(--mint-600)',
          marginBottom: '8px',
        }}
      >
        You've joined the group!
      </p>
      <p style={{ fontSize: '14px', color: 'var(--ink-500)' }}>
        Redirecting you now…
      </p>
    </div>
  )
}

function UnderageState() {
  return (
    <div
      data-testid="invite-underage"
      role="alert"
      aria-live="assertive"
      style={{ textAlign: 'center', padding: '24px 0' }}
    >
      <h1
        style={{
          fontSize: '18px',
          fontWeight: '700',
          color: 'var(--ink-900)',
          marginBottom: '12px',
        }}
      >
        Age requirement not met
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--ink-600)' }}>
        You must be 18 or older to join this group. This invite cannot be
        accepted.
      </p>
    </div>
  )
}

function TokenInvalidState() {
  return (
    <div
      data-testid="invite-invalid"
      role="alert"
      aria-live="assertive"
      style={{ textAlign: 'center', padding: '24px 0' }}
    >
      <h1
        style={{
          fontSize: '18px',
          fontWeight: '700',
          color: 'var(--ink-900)',
          marginBottom: '12px',
        }}
      >
        Invalid or expired invite link
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--ink-600)' }}>
        This invite link is no longer valid. Ask the group owner to send a new
        invite.
      </p>
    </div>
  )
}

function NotFoundState() {
  return (
    <div
      data-testid="invite-not-found"
      role="alert"
      aria-live="assertive"
      style={{ textAlign: 'center', padding: '24px 0' }}
    >
      <h1
        style={{
          fontSize: '18px',
          fontWeight: '700',
          color: 'var(--ink-900)',
          marginBottom: '12px',
        }}
      >
        Group not found
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--ink-600)' }}>
        The group this invite belongs to no longer exists.
      </p>
    </div>
  )
}
