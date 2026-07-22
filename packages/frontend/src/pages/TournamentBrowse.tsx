import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAgeGate } from '../hooks/useAgeGate'
import { useAuth } from '../hooks/useAuth'
import { useBack } from '../hooks/useBack'
import { DobScreen, type AgeAttestation } from './DobScreen'
import { Button } from '../components/shared/Button'
import { statusBadge } from '../utils/tournamentStatus'
import { formatLocal } from '../components/shared/formatLocal'

/**
 * Public tournament details + guest registration page (/tournament/:id/browse).
 *
 * Per rac8-4s-HL.md: an unauthenticated visitor can view a tournament's details and
 * register with email + name. The backend issues a magic-link email; on success we tell
 * the visitor to check their email. A signed-in visitor gets a one-click register instead
 * of re-typing their own email/name (ISSUE-12).
 */
interface PublicTournament {
  id: string
  name: string
  sport: string
  matchFormat: string
  maxPlayers: number
  status: string
  registrationDeadline?: string
  description?: string | null
  registeredCount?: number
}

export const TournamentBrowse: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const back = useBack('/browse')
  const { isAuthenticated, user } = useAuth()
  const [tournament, setTournament] = useState<PublicTournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [partnerEmail, setPartnerEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successEmail, setSuccessEmail] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const lastAttempt = useRef<{ email: string; name: string }>({ email: '', name: '' })

  const { ageGatePhase, handleAgeCode, dismissAgeGate } = useAgeGate()

  const canOneClick = isAuthenticated && !!user?.email

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        setLoadError(null)
        const res = await fetch(`/tournaments/${tournamentId}`, {
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) throw new Error(`Failed to load tournament: ${res.status}`)
        const data = await res.json()
        if (active) setTournament(data)
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'Failed to load tournament')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [tournamentId])

  const doRegister = async (registerEmail: string, registerName: string, attestation?: AgeAttestation) => {
    lastAttempt.current = { email: registerEmail, name: registerName }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const body: Record<string, unknown> = { email: registerEmail, name: registerName }
      // Snake_case — matches the backend's req.body.dob_attestation exactly.
      if (attestation) body.dob_attestation = attestation
      if (tournament?.matchFormat === 'doubles' && partnerEmail.trim()) {
        body.partnerSelection = { type: 'invite', value: partnerEmail.trim() }
      }
      const res = await fetch(`/tournaments/${tournamentId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        // A successful retry from DobScreen (ageGatePhase === 'required') must
        // dismiss the gate too — otherwise the component keeps rendering
        // DobScreen forever, since that check runs before the success message
        // ever gets a chance to render (unlike Signup.tsx, which masks this by
        // navigating away on success instead of showing an inline message).
        dismissAgeGate()
        setSuccessEmail(registerEmail)
        return
      }
      let errorBody: { code?: string; message?: string } = {}
      try { errorBody = await res.json() } catch { /* ignore */ }
      const code = errorBody.code ?? ''
      if (code === 'AGE_ATTESTATION_REQUIRED' || code === 'UNDER_AGE') {
        handleAgeCode(code)
        return
      }
      let message = 'Registration failed. Please try again.'
      if (res.status === 409) {
        message = 'This email is already registered for this tournament.'
      } else if (errorBody.message) {
        message = errorBody.message
      }
      setSubmitError(message)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await doRegister(email, name)
  }

  const handleOneClickRegister = async () => {
    if (!user?.email) return
    await doRegister(user.email, user.name || user.email)
  }

  const handleDobConfirm = (attestation: AgeAttestation) => {
    doRegister(lastAttempt.current.email, lastAttempt.current.name, attestation)
  }

  const handleEditEmail = () => {
    setSuccessEmail(null)
    setSubmitError(null)
  }

  if (ageGatePhase === 'required') {
    return <DobScreen onConfirm={handleDobConfirm} onBack={dismissAgeGate} />
  }

  if (ageGatePhase === 'underage') {
    return (
      <div
        data-testid="registration-underage-error"
        role="alert"
        style={{ padding: 32, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}
      >
        <p>You must be 18 or older to register for this tournament.</p>
      </div>
    )
  }

  const isDoubles = tournament?.matchFormat === 'doubles'

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <button
        onClick={back}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: 'var(--ink-500)', fontWeight: 600 }}
      >
        ← Back to browse
      </button>

      {loading && <div style={{ marginTop: 16, color: 'var(--ink-500)' }}>Loading…</div>}
      {loadError && <div role="alert" style={{ marginTop: 16, color: 'var(--danger)' }}>{loadError}</div>}

      {tournament && (
        <>
          <div style={{ marginTop: 16, padding: 20, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)' }}>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--ink-900)' }}>{tournament.name}</h1>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)' }}>
                {statusBadge(tournament.status, tournament.registrationDeadline ?? null)}
              </span>
              <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)', textTransform: 'capitalize' }}>
                🎾 {tournament.sport}
              </span>
              <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)', textTransform: 'capitalize' }}>
                {tournament.matchFormat}
              </span>
              <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)' }}>
                👥 {tournament.registeredCount ?? 0} / {tournament.maxPlayers}
              </span>
            </div>

            {tournament.description && (
              <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-700)' }}>{tournament.description}</p>
            )}

            {tournament.registrationDeadline && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-500)' }}>
                Registration closes {formatLocal(tournament.registrationDeadline).absolute}
              </div>
            )}
          </div>

          <section style={{ marginTop: 16, padding: 16, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)' }}>
            {successEmail ? (
              <div role="status">
                <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' }}>Check your email to confirm.</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                  We've sent a link to <strong>{successEmail}</strong>.
                </p>
                <button
                  onClick={handleEditEmail}
                  style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--court-600)' }}
                >
                  Wrong email? Edit
                </button>
              </div>
            ) : canOneClick ? (
              <>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px', color: 'var(--ink-900)' }}>Register for this tournament</h2>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-500)' }}>
                  You're signed in as <strong>{user!.email}</strong>.
                </p>

                {isDoubles && (
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor="partnerEmail" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>
                      Partner's email (optional — invite them to your team)
                    </label>
                    <input
                      id="partnerEmail"
                      type="email"
                      placeholder="partner@example.com"
                      value={partnerEmail}
                      onChange={(e) => setPartnerEmail(e.target.value)}
                      style={{ width: '100%', padding: 8, marginTop: 4, border: '1px solid var(--border-soft)', borderRadius: 8, boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                {submitError && <div role="alert" style={{ color: 'var(--danger)', marginBottom: 12, fontSize: 13 }}>{submitError}</div>}

                <Button variant="primary" disabled={submitting} onClick={handleOneClickRegister} style={{ width: '100%' }}>
                  {submitting ? 'Registering…' : 'Register for Tournament'}
                </Button>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: 'var(--ink-900)' }}>Register as a guest</h2>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-500)' }}>
                  We'll email you a link to confirm. No account or password needed.
                </p>

                <div style={{ fontSize: 13, marginBottom: 16, padding: '8px 10px', background: 'var(--ink-50)', borderRadius: 8 }}>
                  Already have an account? <a href="/login" style={{ color: 'var(--court-600)', fontWeight: 600 }}>Sign In</a>
                </div>

                <form onSubmit={handleGuestSubmit}>
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor="email" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>Email</label>
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ width: '100%', padding: 8, marginTop: 4, border: '1px solid var(--border-soft)', borderRadius: 8, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor="name" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>Name</label>
                    <input
                      id="name"
                      type="text"
                      required
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{ width: '100%', padding: 8, marginTop: 4, border: '1px solid var(--border-soft)', borderRadius: 8, boxSizing: 'border-box' }}
                    />
                  </div>

                  {isDoubles && (
                    <div style={{ marginBottom: 12 }}>
                      <label htmlFor="partnerEmail" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-700)' }}>
                        Partner's email (optional — invite them to your team)
                      </label>
                      <input
                        id="partnerEmail"
                        type="email"
                        placeholder="partner@example.com"
                        value={partnerEmail}
                        onChange={(e) => setPartnerEmail(e.target.value)}
                        style={{ width: '100%', padding: 8, marginTop: 4, border: '1px solid var(--border-soft)', borderRadius: 8, boxSizing: 'border-box' }}
                      />
                    </div>
                  )}

                  {submitError && <div role="alert" style={{ color: 'var(--danger)', marginBottom: 12, fontSize: 13 }}>{submitError}</div>}

                  <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%' }}>
                    {submitting ? 'Registering…' : 'Register for Tournament'}
                  </Button>
                </form>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
