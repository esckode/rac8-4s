import React, { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

/**
 * Public guest-landing route (/tournament/:tournamentId/join) — ISSUE-14.
 *
 * The emailed magic link used to force full account creation (/signup?token=).
 * The backend's GET /:tournamentId/auth/verify already validates the token,
 * asserts tournament membership, and mints a guest player session — this page
 * is wiring, not new machinery: exchange the token, persist the session, and
 * land in the tournament with no password prompt. Account creation stays
 * available separately as an optional upgrade (/signup).
 */
export const TournamentJoin: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [error, setError] = useState<string | null>(null)
  // The magic-link token is single-use server-side — verifying it twice
  // always fails the second time. React StrictMode double-invokes effects
  // in dev (mount → cleanup → mount again) *synchronously*, faster than an
  // AbortController's abort reliably beats the request already reaching the
  // server, so cancellation can't be trusted here. A ref survives that
  // synthetic remount (only state and effects are reset, not refs), so
  // gating on "have we already started verifying this exact token" reliably
  // collapses both invocations into a single real request.
  const verifiedTokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!token || !tournamentId) {
      setError('This link is missing information. Please check your email again.')
      return
    }
    if (verifiedTokenRef.current === token) return
    verifiedTokenRef.current = token

    const verify = async () => {
      try {
        const res = await fetch(`/tournaments/${tournamentId}/auth/verify?token=${encodeURIComponent(token)}`)

        // Strip the token from the URL right away, regardless of outcome —
        // it must never be left in browser history or sent as a referrer
        // (matching the PWA rule that an SSE token-in-URL is never cached).
        window.history.replaceState(null, '', `/tournament/${tournamentId}/join`)

        if (!res.ok) {
          setError('This link has expired or is invalid. Please register again to get a new one.')
          return
        }

        const data = await res.json() as { playerToken: string }
        localStorage.setItem('auth_token', data.playerToken)

        // Full navigation (not client-side routing) so AuthProvider's
        // mount-time effect picks up the freshly-stored token and restores
        // the guest session before the protected route renders.
        window.location.href = '/matches'
      } catch {
        setError('Something went wrong. Please try again.')
      }
    }
    verify()
  }, [token, tournamentId])

  if (error) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 32, textAlign: 'center' }}>
        <p role="alert" style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>
        <a href={`/tournament/${tournamentId}/browse`} style={{ color: 'var(--court-600)', fontWeight: 600 }}>
          Register again
        </a>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 32, textAlign: 'center' }}>
      <p style={{ color: 'var(--ink-500)' }}>Signing you in…</p>
    </div>
  )
}
