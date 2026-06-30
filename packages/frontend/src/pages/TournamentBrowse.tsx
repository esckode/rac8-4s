import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

/**
 * Public tournament details + guest registration page (/tournament/:id/browse).
 *
 * Per rac8-4s-HL.md: an unauthenticated visitor can view a tournament's details and
 * register with email + name. The backend issues a magic-link email; on success we tell
 * the visitor to check their email.
 */
interface PublicTournament {
  id: string
  name: string
  sport: string
  matchFormat: string
  maxPlayers: number
  status: string
  registrationDeadline?: string
}

export const TournamentBrowse: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const [tournament, setTournament] = useState<PublicTournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    setSuccessMessage(null)
    try {
      const res = await fetch(`/tournaments/${tournamentId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      })
      if (res.ok) {
        setSuccessMessage('Check your email to complete your registration.')
        return
      }
      let message = 'Registration failed. Please try again.'
      try {
        const body = await res.json()
        if (res.status === 409) {
          message = body?.message
            ? `This email is already registered for this tournament.`
            : 'This email is already registered for this tournament.'
        } else if (body?.message) {
          message = body.message
        }
      } catch {
        /* ignore body parse errors */
      }
      setSubmitError(message)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <Link to="/browse" style={{ fontSize: 13, color: 'var(--ink-500)' }}>← Back to browse</Link>

      {loading && <div style={{ marginTop: 16 }}>Loading…</div>}
      {loadError && <div role="alert" style={{ marginTop: 16, color: 'var(--danger)' }}>{loadError}</div>}

      {tournament && (
        <>
          <h1 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 700 }}>{tournament.name}</h1>
          <div style={{ fontSize: 13, color: 'var(--ink-500)', textTransform: 'capitalize' }}>
            {tournament.sport} · {tournament.matchFormat}
          </div>
          <div style={{ fontSize: 13, marginTop: 4, textTransform: 'capitalize' }}>
            Status: {tournament.status.replace(/_/g, ' ')}
          </div>

          <section style={{ marginTop: 24, padding: 16, border: '1px solid var(--border-soft)', borderRadius: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Register for this tournament</h2>

            <div style={{ fontSize: 13, marginBottom: 12 }}>
              Already have an account? <Link to="/login">Sign In</Link>
            </div>

            {successMessage ? (
              <div role="status" style={{ color: 'var(--success)' }}>{successMessage}</div>
            ) : (
              <form onSubmit={handleRegister}>
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="email" style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: '100%', padding: 8, marginTop: 4 }}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="name" style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>Name</label>
                  <input
                    id="name"
                    type="text"
                    required
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ width: '100%', padding: 8, marginTop: 4 }}
                  />
                </div>

                {submitError && <div role="alert" style={{ color: 'var(--danger)', marginBottom: 12 }}>{submitError}</div>}

                <button type="submit" disabled={submitting} style={{ padding: '8px 16px', fontWeight: 600 }}>
                  {submitting ? 'Registering…' : 'Register for Tournament'}
                </button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  )
}
