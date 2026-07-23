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
 * PartnerInviteAcceptPage — ISSUE-15 branch C: public landing page for a
 * doubles partner-invite link sent to an email with no existing player row.
 *
 * Route: /tournament/:tournamentId/partner-invite?token=T&email=E
 *
 * Auto-submits POST /tournaments/:tournamentId/partner-invites/accept on
 * mount — mirrors InviteAcceptPage's 5-state machine (group invites):
 *   loading         → spinner while the request is in flight
 *   age_required    → DobScreen for 18+ attestation; re-submits on confirm
 *   underage        → terminal rejection (non-recoverable)
 *   token_invalid   → invalid or expired invite link error
 *   not_found       → tournament not found error
 *   success         → "You're on the team!" + redirect to the tournament
 */
export const PartnerInviteAcceptPage: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''

  const [phase, setPhase] = useState<Phase>('loading')

  const submitAccept = useCallback(
    async (ageAttestation?: AgeAttestation) => {
      setPhase('loading')
      try {
        const body: Record<string, unknown> = { token, email }
        if (ageAttestation) body.dob_attestation = ageAttestation

        const res = await fetch(`/tournaments/${tournamentId}/partner-invites/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        const data = (await res.json()) as {
          ok?: boolean
          token?: string
          tournamentId?: string
          code?: string
        }

        if (res.ok) {
          // Session token is already minted (not a magic link to re-verify),
          // so land on /matches directly — mirrors where TournamentJoin
          // itself ends up once its own token exchange completes.
          if (data.token) localStorage.setItem(TOKEN_KEY, data.token)
          setPhase('success')
          window.location.replace('/matches')
        } else {
          const code = data.code ?? ''
          if (code === 'AGE_ATTESTATION_REQUIRED') setPhase('age_required')
          else if (code === 'UNDER_AGE') setPhase('underage')
          else if (code === 'NOT_FOUND') setPhase('not_found')
          else setPhase('token_invalid')
        }
      } catch {
        setPhase('token_invalid')
      }
    },
    [token, email, tournamentId]
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
      data-testid="partner-invite-accept-page"
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
          <div data-testid="partner-invite-age-gate" aria-label="Age verification required">
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
      aria-label="Joining team…"
      style={{ textAlign: 'center', padding: '24px 0' }}
    >
      <p style={{ fontSize: '16px', color: 'var(--ink-600)' }}>Joining team…</p>
    </div>
  )
}

function SuccessState() {
  return (
    <div
      data-testid="partner-invite-success"
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
        You're on the team!
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
      data-testid="partner-invite-underage"
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
        You must be 18 or older to join this team. This invite cannot be
        accepted.
      </p>
    </div>
  )
}

function TokenInvalidState() {
  return (
    <div
      data-testid="partner-invite-invalid"
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
        This invite link is no longer valid. Ask your partner to send a new
        invite.
      </p>
    </div>
  )
}

function NotFoundState() {
  return (
    <div
      data-testid="partner-invite-not-found"
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
        Tournament not found
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--ink-600)' }}>
        This tournament no longer exists.
      </p>
    </div>
  )
}
